"""
VTuber worker that connects to WebRTC signaling server for Pixel Streaming
Uses pixel_streaming.py to connect to WebSocket signaling server
"""

import asyncio
import logging
import os
import uuid
import av
import numpy as np
import torch
from aiohttp import web

from pytrickle.stream_processor import StreamProcessor
from pytrickle.frames import VideoFrame, AudioFrame
from typing import Union

from aiortc import RTCPeerConnection, RTCConfiguration, RTCIceServer, RTCSessionDescription
import re

# Import the PixelStreamingClient from pixel_streaming module
from pixel_streaming import PixelStreamingClient

# Change to DEBUG to see frame logs
logging.basicConfig(
    level=logging.INFO, 
    format="%(asctime)s - %(filename)s:%(lineno)d - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logging.getLogger("aiortc").setLevel(logging.ERROR)
logger = logging.getLogger()

sp: StreamProcessor | None = None
pcs = {}

async def send_frame(frame: Union[av.VideoFrame, av.AudioFrame]):
    """Send frame to processor if available."""
    global sp
    logger.debug(f"Received frame to send: {type(frame)}")
    
    if isinstance(frame, av.VideoFrame):
        frame_np = frame.to_ndarray(format="rgb24").astype(np.float32) / 255.0
        frame_tensor = torch.from_numpy(frame_np)
        if sp:
            logger.debug(f"Processing video frame: {frame_tensor.shape}")
            await sp.send_input_frame(VideoFrame.from_av_video(frame_tensor, frame.pts, frame.time_base))
    elif isinstance(frame, av.AudioFrame):
        # Add audio processing if needed
        if sp:
            logger.debug(f"Received audio frame: {frame.pts}")
            await sp.send_input_frame(AudioFrame.from_av_audio(frame))

async def pixel_streaming_frame_callback(frame):
    """Callback to process frames from Pixel Streaming client"""
    try:
       # Send the frame for processing
       await send_frame(frame)

    except Exception as e:
        logger.error(f"Error processing pixel streaming frame: {e}")

async def connect_to_pixel_streaming():
    """Connect to Pixel Streaming signaling server and start receiving frames"""
    # Get signaling URL from environment variable or use default
    signaling_url = os.environ.get("SIGNALING_WEBSERVER_URL", "ws://localhost:8080")
    streamer_id = os.environ.get("STREAMER_ID", "")
    
    logger.info(f"Connecting to Pixel Streaming signaling server: {signaling_url}")
    
    # Create client with frame callback
    client = PixelStreamingClient(signaling_url, streamer_id, pixel_streaming_frame_callback)
    connected = False
    try:
        await client.connect()
        connected = True
        logger.info("Successfully connected to Pixel Streaming server")
        
        # Keep the connection alive
        while True:
            await asyncio.sleep(1)
                
    except Exception as e:
        if not connected:
            logger.error(f"Failed to connect to Pixel Streaming server: {e}")
        else:
            logger.error(f"Error during Pixel Streaming operation: {e}")
    finally:
        await client.disconnect()

async def main():
    logger.info("Starting VTuber worker with Pixel Streaming support")
    global sp
    sp = StreamProcessor(
        name="vtuber",
    )
    
    # Check if we should connect to Pixel Streaming signaling server
    if os.environ.get("SIGNALING_WEBSERVER_URL"):
        logger.info("SIGNALING_WEBSERVER_URL detected, connecting to Pixel Streaming")
        # Run both coroutines concurrently in the same event loop
        await asyncio.gather(
            connect_to_pixel_streaming(),
            sp.run_forever()
        )
    else:
        logger.info("No SIGNALING_WEBSERVER_URL found, running in WHIP mode")
        await sp.run_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass