#!/usr/bin/env python3
import asyncio
import json
import logging
import cv2
import numpy as np
import librosa
from fastapi import FastAPI, Request, HTTPException, Body
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.media import MediaPlayer
import av
import os


ORCH_URL = os.getenv("ORCHESTRATOR_URL", "orchestrator:9995")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

class ColorFlippedVideoTrack(MediaStreamTrack):
    """Video track that flips colors (BGR to RGB)"""
    
    def __init__(self, source_track):
        super().__init__()
        self.source_track = source_track
        self.kind = "video"
        self._started = False
        
    async def recv(self):
        if not self._started:
            self._started = True
            logger.info("ColorFlippedVideoTrack started receiving frames")
            
        try:
            frame = await self.source_track.recv()
            
            # Convert frame to numpy array
            img = frame.to_ndarray(format="bgr24")
            
            # Flip colors (BGR to RGB)
            img_flipped = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            
            # Convert back to VideoFrame
            new_frame = av.VideoFrame.from_ndarray(img_flipped, format="rgb24")
            new_frame.pts = frame.pts
            new_frame.time_base = frame.time_base
            
            return new_frame
            
        except Exception as e:
            logger.error(f"Error processing video frame: {e}")
            raise

class PitchShiftedAudioTrack(MediaStreamTrack):
    """Audio track that shifts pitch higher"""
    
    def __init__(self, source_track):
        super().__init__()
        self.source_track = source_track
        self.kind = "audio"
        self.pitch_shift = 2.0  # Shift pitch up by 2 semitones
        self._started = False
    
    async def recv(self):
        if not self._started:
            self._started = True
            logger.info("PitchShiftedAudioTrack started receiving frames")
            
        try:
            frame = await self.source_track.recv()
            
            # Convert frame to numpy array
            audio_data = frame.to_ndarray()
            
            # Apply pitch shifting using librosa
            if audio_data.size > 0:
                # Ensure we have the right shape for librosa
                original_shape = audio_data.shape
                if len(audio_data.shape) > 1:
                    audio_data = audio_data.flatten()
                
                # Apply pitch shift
                shifted_audio = librosa.effects.pitch_shift(
                    audio_data.astype(np.float32), 
                    sr=frame.sample_rate, 
                    n_steps=self.pitch_shift
                )
                
                # Convert back to the original format and shape
                shifted_audio = shifted_audio.astype(frame.to_ndarray().dtype)
                shifted_audio = shifted_audio.reshape(original_shape)
                
                # Create new audio frame
                new_frame = av.AudioFrame.from_ndarray(
                    shifted_audio,
                    format=frame.format.name,
                    layout=frame.layout.name
                )
                new_frame.pts = frame.pts
                new_frame.time_base = frame.time_base
                new_frame.sample_rate = frame.sample_rate
                
                return new_frame
            
            return frame
            
        except Exception as e:
            logger.error(f"Error processing audio frame: {e}")
            # Return original frame on error
            return await self.source_track.recv()

class WebRTCServer:
    def __init__(self):
        self.whep_pc = None  # Peer connection for receiving (WHEP)
        self.whip_pc = None  # Peer connection for sending (WHIP)
        self.caller_ip = None
        self.stream_id = ""
        self.video_track = None
        self.audio_track = None
        self.transformed_video_track = None
        self.transformed_audio_track = None
        self.processing_active = False
    
    async def start_processing(self, caller_ip: str, stream_id: str):
        """Start the WebRTC processing pipeline"""
        try:
            self.caller_ip = caller_ip
            self.stream_id = stream_id
            logger.info(f"Start processing for {self.caller_ip} stream {self.stream_id}")
            
            # Initialize WHEP connection to get source frames
            await self.init_whep_connection(stream_id)
            
            # Wait for tracks to be received
            await self.wait_for_tracks()
            
            # Create transformed tracks
            self.create_transformed_tracks()
            
            # Initialize WHIP connection to send transformed frames
            await self.init_whip_connection(stream_id)
            
            self.processing_active = True
            logger.info("WebRTC processing pipeline established successfully")
            
            return {"status": "started", "caller_ip": self.caller_ip}
        
        except Exception as e:
            logger.error(f"Error in start processing: {e}")
            await self.cleanup()
            raise HTTPException(status_code=500, detail=str(e))
    
    async def init_whep_connection(self, stream_id: str):
        """Initialize WHEP connection to receive source frames"""
        logger.info("Initializing WHEP connection...")
        self.whep_pc = RTCPeerConnection()
        
        # Add receive-only transceivers for audio and video
        audio_transceiver = self.whep_pc.addTransceiver(
            "audio", 
            direction="recvonly"
        )
        logger.info(f"Added audio transceiver: {audio_transceiver.mid}, direction: {audio_transceiver.direction}")
        
        video_transceiver = self.whep_pc.addTransceiver(
            "video", 
            direction="recvonly"
        )
        logger.info(f"Added video transceiver: {video_transceiver.mid}, direction: {video_transceiver.direction}")
        
        # Track handler for incoming media
        @self.whep_pc.on("track")
        def on_track(track):
            logger.info(f"Received track: {track.kind} - ID: {track.id}")
            if track.kind == "video":
                self.video_track = track
                logger.info("Video track received and stored")
            elif track.kind == "audio":
                self.audio_track = track
                logger.info("Audio track received and stored")
        
        # Connection state handlers
        @self.whep_pc.on("connectionstatechange")
        def on_whep_connectionstatechange():
            logger.info(f"WHEP connection state: {self.whep_pc.connectionState}")
            
        @self.whep_pc.on("iceconnectionstatechange")
        def on_whep_iceconnectionstatechange():
            logger.info(f"WHEP ICE connection state: {self.whep_pc.iceConnectionState}")
        
        # Create offer for WHEP
        offer = await self.whep_pc.createOffer()
        await self.whep_pc.setLocalDescription(offer)
        logger.info("WHEP offer created and set as local description")
        
        # Send offer to WHEP endpoint
        whep_url = f"https://{ORCH_URL}/process/worker/whep"
        logger.info(f"Sending WHEP request to: {whep_url}")
        
        try:
            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                response = await client.post(
                    whep_url,
                    content=self.whep_pc.localDescription.sdp,
                    headers={"Content-Type": "application/sdp", "Accept": "application/sdp", "X-Stream-Id": stream_id}
                )
                
                if response.status_code == 201:
                    answer_sdp = response.text
                    await self.whep_pc.setRemoteDescription(
                        RTCSessionDescription(sdp=answer_sdp, type="answer")
                    )
                    logger.info("WHEP connection established successfully")
                else:
                    logger.error(f"WHEP request failed: {response.status_code} - {response.text}")
                    raise Exception(f"WHEP connection failed with status {response.status_code}")
                    
        except httpx.RequestError as e:
            logger.error(f"WHEP request error: {e}")
            raise Exception(f"WHEP connection failed: {e}")
    
    async def wait_for_tracks(self):
        """Wait for both audio and video tracks to be received"""
        logger.info("Waiting for media tracks...")
        max_wait = 30  # 30 seconds timeout
        wait_count = 0
        
        while (not self.video_track or not self.audio_track) and wait_count < max_wait * 10:
            await asyncio.sleep(0.1)
            wait_count += 1
            
            if wait_count % 50 == 0:  # Log every 5 seconds
                logger.info(f"Still waiting for tracks... Video: {self.video_track is not None}, Audio: {self.audio_track is not None}")
        
        if not self.video_track or not self.audio_track:
            raise Exception(f"Timeout waiting for media tracks. Video: {self.video_track is not None}, Audio: {self.audio_track is not None}")
        
        logger.info("All media tracks received successfully")
    
    def create_transformed_tracks(self):
        """Create transformed versions of the received tracks"""
        logger.info("Creating transformed tracks...")
        
        if self.video_track:
            self.transformed_video_track = ColorFlippedVideoTrack(self.video_track)
            logger.info("Color-flipped video track created")
        
        if self.audio_track:
            self.transformed_audio_track = PitchShiftedAudioTrack(self.audio_track)
            logger.info("Pitch-shifted audio track created")
    
    async def init_whip_connection(self, stream_id: str):
        """Initialize WHIP connection to send transformed frames"""
        logger.info("Initializing WHIP connection...")
        self.whip_pc = RTCPeerConnection()
        
        # Connection state handlers
        @self.whip_pc.on("connectionstatechange")
        def on_whip_connectionstatechange():
            logger.info(f"WHIP connection state: {self.whip_pc.connectionState}")
            
        @self.whip_pc.on("iceconnectionstatechange")
        def on_whip_iceconnectionstatechange():
            logger.info(f"WHIP ICE connection state: {self.whip_pc.iceConnectionState}")
        
        # Add transformed tracks
        if self.transformed_video_track:
            self.whip_pc.addTrack(self.transformed_video_track)
            logger.info("Transformed video track added to WHIP connection")
            
        if self.transformed_audio_track:
            self.whip_pc.addTrack(self.transformed_audio_track)
            logger.info("Transformed audio track added to WHIP connection")
        
        # Create offer for WHIP
        offer = await self.whip_pc.createOffer()
        await self.whip_pc.setLocalDescription(offer)
        logger.info("WHIP offer created and set as local description")
        
        # Send offer to WHIP endpoint
        whip_url = f"https://{ORCH_URL}/process/worker/whip"
        logger.info(f"Sending WHIP request to: {whip_url}")
        
        try:
            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                response = await client.post(
                    whip_url,
                    content=self.whip_pc.localDescription.sdp,
                    headers={"Content-Type": "application/sdp", "Accept": "application/sdp", "X-Stream-Id": stream_id}
                )
                
                if response.status_code in [200, 201]:
                    answer_sdp = response.text
                    await self.whip_pc.setRemoteDescription(
                        RTCSessionDescription(sdp=answer_sdp, type="answer")
                    )
                    logger.info("WHIP connection established successfully")
                else:
                    logger.error(f"WHIP request failed: {response.status_code} - {response.text}")
                    raise Exception(f"WHIP connection failed with status {response.status_code}")
                    
        except httpx.RequestError as e:
            logger.error(f"WHIP request error: {e}")
            raise Exception(f"WHIP connection failed: {e}")
    
    async def cleanup(self):
        """Clean up all connections and resources"""
        logger.info("Cleaning up WebRTC connections...")
        self.processing_active = False
        
        try:
            if self.whep_pc:
                await self.whep_pc.close()
                logger.info("WHEP connection closed")
        except Exception as e:
            logger.error(f"Error closing WHEP connection: {e}")
        
        try:
            if self.whip_pc:
                await self.whip_pc.close()
                logger.info("WHIP connection closed")
        except Exception as e:
            logger.error(f"Error closing WHIP connection: {e}")
        
        # Reset state
        self.whep_pc = None
        self.whip_pc = None
        self.video_track = None
        self.audio_track = None
        self.transformed_video_track = None
        self.transformed_audio_track = None
        self.caller_ip = None
    
    def get_status(self):
        """Get current processing status"""
        return {
            "processing_active": self.processing_active,
            "caller_ip": self.caller_ip,
            "whep_connected": self.whep_pc is not None and self.whep_pc.connectionState == "connected",
            "whip_connected": self.whip_pc is not None and self.whip_pc.connectionState == "connected",
            "video_track_available": self.video_track is not None,
            "audio_track_available": self.audio_track is not None,
            "transformed_tracks_created": self.transformed_video_track is not None and self.transformed_audio_track is not None
        }

# Initialize FastAPI app
app = FastAPI(title="WebRTC Media Processor", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global server instance
webrtc_server = WebRTCServer()

@app.post("/stream/start")
async def start_endpoint(request: Request, payload: str = Body(...)):
    """Handle /start endpoint to initiate WebRTC processing"""
    try:
        # Get caller IP from request
        caller_ip = request.client.host
        if request.headers.get("x-forwarded-for"):
            caller_ip = request.headers.get("x-forwarded-for").split(",")[0].strip()
        
        logger.info(f"Start request from {caller_ip}")
        
        stream_id = payload
        # Start processing
        result = await webrtc_server.start_processing(caller_ip, stream_id)
        
        return result
    
    except Exception as e:
        logger.error(f"Error in start endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/stream/stop")
async def stop_endpoint():
    """Handle /stop endpoint to stop WebRTC processing"""
    try:
        await webrtc_server.cleanup()
        return {"status": "stopped"}
    
    except Exception as e:
        logger.error(f"Error in stop endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stream/status")
async def status_endpoint():
    """Get current processing status"""
    return webrtc_server.get_status()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "webrtc-processor"}

@app.get("/")
async def root():
    """Root endpoint with service info"""
    return {
        "service": "WebRTC Media Processor",
        "version": "1.0.0",
        "endpoints": {
            "start": "POST /stream/start - Start media processing",
            "stop": "POST /stream/stop - Stop media processing", 
            "status": "GET /stream/status - Get processing status",
            "health": "GET /health - Health check"
        }
    }

# Cleanup on shutdown
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown"""
    await webrtc_server.cleanup()
    logger.info("Application shutdown complete")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)