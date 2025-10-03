"""
VTuber worker that connects to WebRTC signaling server for Pixel Streaming
Uses pixel_streaming.py to connect to WebSocket signaling server
Each game command opens a new async connection to avoid broken pipe errors
"""

import asyncio
import logging
import os
import time
import base64
import av
import numpy as np
import torch
from typing import Union
import aiohttp
from pytrickle.stream_processor import StreamProcessor
from pytrickle.frames import VideoFrame, AudioFrame
from pixel_streaming import PixelStreamingClient

# Change to DEBUG to see frame logs
logging.basicConfig(
    level=logging.INFO, 
    format="%(asctime)s - %(filename)s:%(lineno)d - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger()
logger.setLevel(logging.INFO)

sp: StreamProcessor | None = None
client: PixelStreamingClient | None = None
params = {"commands": {}, "audio": ""}


# ------------------ Frame Processing ------------------ #

async def send_frame(frame: Union[av.VideoFrame, av.AudioFrame]):
    """Send frame to processor if available."""
    global sp
    if not sp:
        return

    try:
        if isinstance(frame, av.VideoFrame):
            frame_np = frame.to_ndarray(format="rgb24").astype(np.float32) / 255.0
            frame_tensor = torch.from_numpy(frame_np)
            await sp.send_input_frame(VideoFrame.from_av_video(frame_tensor, frame.pts, frame.time_base))
        elif isinstance(frame, av.AudioFrame):
            await sp.send_input_frame(AudioFrame.from_av_audio(frame))
    except Exception as e:
        logger.error(f"Error sending frame: {e}")


async def pixel_streaming_frame_callback(frame):
    """Callback to process frames from Pixel Streaming client."""
    await send_frame(frame)


# ------------------ Game Command Handling ------------------ #

async def send_command(command: str):
    """
    Send a command to the game server via HTTP POST.
    """
    async with aiohttp.ClientSession() as session:
        try:
            url = os.environ.get("GAME_UPDATER_URL", "http://vtuber-unreal-game:9877/scripts/execute")
            payload = {"session_id": "test-session", "commands": [{"type": "tcp","value": command, "delay_ms": 0}]}
            async with session.post(url, json=payload) as response:
                if response.status == 200:
                    logger.info(f"Command sent to game: {command}")
                else:
                    text = await response.text()
                    logger.error(f"Failed to send command '{command}': {response.status}, {text}")
        except Exception as e:
            logger.error(f"Error sending command '{command}': {e}")


async def param_updates(data):
    """Handle parameter updates from Pixel Streaming or external sources."""
    if "command" in data:
        params[data["command"]] = time.time()
        await send_command(data["command"])
        logger.info(f"sent command to game: {data["command"]}")

    if "audio" in data and "audio_format" in data:
        params["audio"] = data["audio"]
        audio_bytes = base64.b64decode(data["audio"])
        folder = "/opt/embody/sessions"
        os.makedirs(folder, exist_ok=True)
        filename = f"{folder}/{int(time.time()*1_000_000)}.{data['audio_format']}"
        with open(filename, "wb") as f:
            f.write(audio_bytes)
        await send_command(f"TTS_BYOB_{filename}")
        logger.info(f"sent audio file to game: {filename}")


# ------------------ Pixel Streaming Connection ------------------ #

async def connect_to_pixel_streaming():
    """Connect to the Pixel Streaming signaling server."""
    global client
    signaling_url = os.environ.get("SIGNALING_WEBSERVER_URL", "ws://vtuber-unreal-signaling:8080")
    streamer_id = os.environ.get("STREAMER_ID", "")

    client = PixelStreamingClient(signaling_url, streamer_id, pixel_streaming_frame_callback)
    await client.connect()
    logger.info("Successfully connected to Pixel Streaming server")


# ------------------ Main Worker ------------------ #

async def main():
    global sp
    logger.info("Starting VTuber worker with Pixel Streaming support")

    # Initialize StreamProcessor
    sp = StreamProcessor(
        name="vtuber",
        param_updater=param_updates,
    )

    if os.environ.get("SIGNALING_WEBSERVER_URL"):
        logger.info("SIGNALING_WEBSERVER_URL detected, connecting to Pixel Streaming")
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
        logger.info("Shutting down...")
        if client:
            asyncio.run(client.disconnect())
        pass
