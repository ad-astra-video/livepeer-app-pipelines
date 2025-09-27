#!/usr/bin/env python3
"""
Python WebRTC client for Unreal Engine Pixel Streaming
Connects to the SignallingWebServer to receive video/audio stream
"""

import asyncio
from email import message
import json
import logging
import os
import websockets
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    RTCConfiguration,
    RTCIceServer,
)
from aiortc.contrib.media import MediaPlayer, MediaRecorder
from typing import Callable, Optional

logger = logging.getLogger(__name__)

class PixelStreamingClient:
    def __init__(self, signalling_url="ws://localhost:8080", streamer_id="", frame_callback: Optional[Callable] = None):
        self.signalling_url = signalling_url
        self.streamer_id = streamer_id
        self.websocket = None
        # Configure STUN so we generate viable candidates by default; can override via STUN_SERVER env
        stun_url = os.getenv("STUN_SERVER", "stun:stun.l.google.com:19302")
        configuration = RTCConfiguration(iceServers=[RTCIceServer(urls=[stun_url])])
        self.pc = RTCPeerConnection(configuration=configuration)
        self.video_track = None
        self.frame_callback = frame_callback
        self.pending_candidates: list[dict] = []

        # Setup WebRTC event handlers
        self.pc.on("connectionstatechange", self.on_connection_state_change)
        self.pc.on("track", self.on_track_received)
        self.pc.on("icecandidate", self.on_ice_candidate)
        self.pc.on("icegatheringstatechange", self.on_ice_gathering_state_change)
        
    async def connect(self):
        """Connect to the signalling server"""
        try:
            self.websocket = await websockets.connect(self.signalling_url)
            logger.info(f"Connected to signalling server: {self.signalling_url}")
            
            # Send initial identification message
            await self.send_message({
                "type": "identify",
                "peerConnectionOptions": {}
            })
            
            # Listen for messages
            await self.listen_for_messages()
            
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            
    async def send_message(self, message):
        """Send message to signalling server"""
        if self.websocket:
            await self.websocket.send(json.dumps(message))
            logger.debug(f"Sent: {message}")
            
    async def listen_for_messages(self):
        """Listen for messages from signalling server"""
        async for message in self.websocket:
            try:
                data = json.loads(message)
                await self.handle_message(data)
            except json.JSONDecodeError:
                logger.warning(f"Received invalid JSON: {message}")
                
    async def handle_message(self, message):
        """Handle incoming signalling messages"""
        msg_type = message.get("type")
        logger.info(f"Received message type: {msg_type}")
        
        if msg_type == "config":
            # Server configuration - can request stream here
            await self.request_stream()
            
        elif msg_type == "offer":
            # WebRTC offer from streamer
            sdp_formatted = message.get("sdp", "").replace("\\r\\n", "\n")
            logger.info(f"Received WebRTC offer:\nType: {message.get('type')}\nSDP:\n{sdp_formatted}")

            await self.handle_offer(message)
            
        elif msg_type == "iceCandidate":
            # ICE candidate from streamer
            logger.info(f"Received ICE candidate: {message}")
            await self.handle_ice_candidate(message)
            
        elif msg_type == "streamerList":
            # List of available streamers
            streamers = message.get("ids", [])
            logger.info(f"Available streamers: {streamers}")
            
            if streamers:
                if not self.streamer_id:
                    self.streamer_id = streamers[0]
                    logger.info(f"Selected streamer: {self.streamer_id}")
                
                # Subscribe to the selected streamer
                await self.send_message({
                    "type": "subscribe",
                    "streamerId": self.streamer_id
                })
            else:
                logger.warning("No streamers available!")
                
    async def request_stream(self):
        """Request to start streaming"""
        await self.send_message({
            "type": "listStreamers"
        })
        
    async def handle_offer(self, message):
        """Handle WebRTC offer"""
        offer = RTCSessionDescription(
            sdp=message["sdp"],
            type=message["type"]
        )
        
        await self.pc.setRemoteDescription(offer)
        # flush pending candidates
        for cand in self.pending_candidates:
            try:
                await self.pc.addIceCandidate(cand)
            except Exception as e:
                logger.error(f"Error adding ICE candidate: {e}")
        self.pending_candidates.clear()
        # Create answer
        answer = await self.pc.createAnswer()
        await self.pc.setLocalDescription(answer)
        logger.info(f"Created WebRTC answer:\nType: {answer.type}\nSDP:\n{answer.sdp}")
        # Send answer back (flat SDP string to match offer shape)
        await self.send_message({
            "type": "answer",
            "sdp": answer.sdp
        })
    
    async def handle_ice_candidate(self, message):
        candidate_data = message.get("candidate")
        logger.info(f"Handling ICE candidate data: {candidate_data}")
        
        if candidate_data and candidate_data.get("candidate"):
            try:
                # Parse the SDP candidate string manually
                parsed = await self._parse_ice_candidate(candidate_data["candidate"])
                
                # Create RTCIceCandidate with correct parameter order: 
                # (component, foundation, ip, port, priority, protocol, type, ...)
                ice_candidate = RTCIceCandidate(
                    component=parsed['component'],
                    foundation=parsed['foundation'],
                    ip=parsed['ip'],
                    port=parsed['port'],
                    priority=parsed['priority'],
                    protocol=parsed['protocol'],
                    type=parsed['type'],
                    sdpMid=candidate_data["sdpMid"],
                    sdpMLineIndex=candidate_data["sdpMLineIndex"]
                )
                
                if not self.pc.remoteDescription:
                    self.pending_candidates.append(ice_candidate)
                else:
                    await self.pc.addIceCandidate(ice_candidate)
            except Exception as e:
                logger.error(f"Failed to parse ICE candidate: {e}")
                logger.error(f"Candidate string: {candidate_data['candidate']}")

    async def on_ice_candidate(self, candidate):
        logger.info(f"Generated ICE candidate: {candidate}")
        if candidate is not None:
            # Convert RTCIceCandidate object to proper format for WebSocket
            candidate_dict = {
                "candidate": candidate.candidate,
                "sdpMid": candidate.sdpMid,
                "sdpMLineIndex": candidate.sdpMLineIndex
            }
            
            await self.websocket.send_json({
                "type": "iceCandidate",
                "candidate": candidate_dict
            })

    def on_ice_gathering_state_change(self):
        state = getattr(self.pc, "iceGatheringState", None)
        logger.info(f"ICE gathering state: {state}")

    async def _parse_ice_candidate(self, candidate):
        """Parse an ICE candidate string into components"""
        parts = candidate.split()
        if len(parts) < 8:
            raise ValueError("Invalid candidate string")
        
        foundation = parts[0].split(':')[1]  # Remove 'candidate:' prefix
        component = int(parts[1])
        protocol = parts[2]
        priority = int(parts[3])
        ip = parts[4]
        port = int(parts[5])
        typ = parts[7]  # parts[6] is 'typ'
        
        return {
            'foundation': foundation,
            'component': component,
            'protocol': protocol,
            'priority': priority,
            'ip': ip,
            'port': port,
            'type': typ
        }
 
    def on_connection_state_change(self):
        """Handle connection state changes"""
        logger.info(f"Connection state: {self.pc.connectionState}")
        
    def on_track_received(self, track):
        """Handle received media track"""
        logger.info(f"Received track: {track.kind}")
        
        if track.kind == "video":
            self.video_track = track
            # Start processing video frames
            asyncio.create_task(self.process_video_frames())
        elif track.kind == "audio":
            self.audio_track = track
            # Start processing audio frames
            asyncio.create_task(self.process_audio_frames())

    async def process_audio_frames(self):
        """Process incoming audio frames"""
        if not self.audio_track:
            return
            
        try:
            while True:
                frame = await self.audio_track.recv()
                if self.frame_callback:
                    await self.frame_callback(frame)
                    
        except Exception as e:
            logger.error(f"Error processing audio: {e}")

    async def process_video_frames(self):
        """Process incoming video frames"""
        if not self.video_track:
            return
            
        try:
            while True:
                frame = await self.video_track.recv()
                if self.frame_callback:
                    await self.frame_callback(frame)
                    
        except Exception as e:
            logger.error(f"Error processing video: {e}")
            
    async def disconnect(self):
        """Disconnect from server"""
        if self.pc:
            await self.pc.close()
        if self.websocket:
            await self.websocket.close()