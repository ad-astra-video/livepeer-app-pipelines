#!/usr/bin/env python3
import asyncio
import json
import logging
import cv2
import numpy as np
import librosa
from aiohttp import web, ClientSession
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.media import MediaPlayer
import av

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ColorFlippedVideoTrack(MediaStreamTrack):
    """Video track that flips colors (BGR to RGB)"""
    
    def __init__(self, track):
        super().__init__()
        self.track = track
    
    async def recv(self):
        frame = await self.track.recv()
        
        # Convert frame to numpy array
        img = frame.to_ndarray(format="bgr24")
        
        # Flip colors (BGR to RGB)
        img_flipped = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Convert back to VideoFrame
        new_frame = av.VideoFrame.from_ndarray(img_flipped, format="rgb24")
        new_frame.pts = frame.pts
        new_frame.time_base = frame.time_base
        
        return new_frame

class PitchShiftedAudioTrack(MediaStreamTrack):
    """Audio track that shifts pitch higher"""
    
    def __init__(self, track):
        super().__init__()
        self.track = track
        self.pitch_shift = 2.0  # Shift pitch up by 2 semitones
    
    async def recv(self):
        frame = await self.track.recv()
        
        # Convert frame to numpy array
        audio_data = frame.to_ndarray()
        
        # Apply pitch shifting using librosa
        if audio_data.size > 0:
            # Ensure we have the right shape for librosa
            if len(audio_data.shape) > 1:
                audio_data = audio_data.flatten()
            
            # Apply pitch shift
            shifted_audio = librosa.effects.pitch_shift(
                audio_data.astype(np.float32), 
                sr=frame.sample_rate, 
                n_steps=self.pitch_shift
            )
            
            # Convert back to the original format
            shifted_audio = shifted_audio.astype(audio_data.dtype)
            
            # Create new audio frame
            new_frame = av.AudioFrame.from_ndarray(
                shifted_audio.reshape(frame.to_ndarray().shape),
                format=frame.format.name,
                layout=frame.layout.name
            )
            new_frame.pts = frame.pts
            new_frame.time_base = frame.time_base
            new_frame.sample_rate = frame.sample_rate
            
            return new_frame
        
        return frame

class WebRTCServer:
    def __init__(self):
        self.whep_pc = None  # Peer connection for receiving (WHEP)
        self.whip_pc = None  # Peer connection for sending (WHIP)
        self.caller_ip = None
        self.video_track = None
        self.audio_track = None
    
    async def start_endpoint(self, request):
        """Handle /start endpoint"""
        try:
            # Get caller IP
            self.caller_ip = request.remote
            logger.info(f"Start request from {self.caller_ip}")
            
            # Initialize WHEP connection to get source frames
            await self.init_whep_connection()
            
            # Initialize WHIP connection to send transformed frames
            await self.init_whip_connection()
            
            return web.json_response({"status": "started", "caller_ip": self.caller_ip})
        
        except Exception as e:
            logger.error(f"Error in start endpoint: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def init_whep_connection(self):
        """Initialize WHEP connection to receive source frames"""
        self.whep_pc = RTCPeerConnection()
        
        @self.whep_pc.on("track")
        def on_track(track):
            logger.info(f"Received track: {track.kind}")
            if track.kind == "video":
                self.video_track = ColorFlippedVideoTrack(track)
            elif track.kind == "audio":
                self.audio_track = PitchShiftedAudioTrack(track)
        
        # Create offer for WHEP
        await self.whep_pc.setLocalDescription(await self.whep_pc.createOffer())
        
        # Send offer to WHEP endpoint
        whep_url = f"http://{self.caller_ip}/process/worker/whep"
        
        async with ClientSession() as session:
            async with session.post(
                whep_url,
                data=self.whep_pc.localDescription.sdp,
                headers={"Content-Type": "application/sdp"}
            ) as response:
                if response.status == 200:
                    answer_sdp = await response.text()
                    await self.whep_pc.setRemoteDescription(
                        RTCSessionDescription(sdp=answer_sdp, type="answer")
                    )
                    logger.info("WHEP connection established")
                else:
                    logger.error(f"WHEP request failed: {response.status}")
    
    async def init_whip_connection(self):
        """Initialize WHIP connection to send transformed frames"""
        self.whip_pc = RTCPeerConnection()
        
        # Wait for tracks to be available
        while not self.video_track or not self.audio_track:
            await asyncio.sleep(0.1)
        
        # Add transformed tracks
        self.whip_pc.addTrack(self.video_track)
        self.whip_pc.addTrack(self.audio_track)
        
        # Create offer for WHIP
        await self.whip_pc.setLocalDescription(await self.whip_pc.createOffer())
        
        # Send offer to WHIP endpoint
        whip_url = f"http://{self.caller_ip}/process/worker/whip"
        
        async with ClientSession() as session:
            async with session.post(
                whip_url,
                data=self.whip_pc.localDescription.sdp,
                headers={"Content-Type": "application/sdp"}
            ) as response:
                if response.status == 200:
                    answer_sdp = await response.text()
                    await self.whip_pc.setRemoteDescription(
                        RTCSessionDescription(sdp=answer_sdp, type="answer")
                    )
                    logger.info("WHIP connection established")
                else:
                    logger.error(f"WHIP request failed: {response.status}")

async def create_app():
    """Create and configure the web application"""
    server = WebRTCServer()
    app = web.Application()
    
    # Add routes
    app.router.add_post('/start', server.start_endpoint)
    
    # Add CORS headers
    async def add_cors_headers(request, handler):
        response = await handler(request)
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    app.middlewares.append(add_cors_headers)
    
    return app

if __name__ == '__main__':
    app = create_app()
    web.run_app(app, host='0.0.0.0', port=8080)
