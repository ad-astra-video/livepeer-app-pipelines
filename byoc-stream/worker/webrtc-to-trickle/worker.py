"""
VTuber worker that connects to WebRTC signaling server for Pixel Streaming
Uses pixel_streaming.py to connect to WebSocket signaling server
Each game command opens a new async connection to avoid broken pipe errors
"""

import asyncio
import logging
import os
import av
import signal  
import numpy as np
import torch
from typing import Union
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

logger = logging.getLogger()

# Global state
sp: StreamProcessor | None = None
client: PixelStreamingClient | None = None
params = {"commands": {}, "audio": ""}
shutdown_event = asyncio.Event()  # <-- Add shutdown signal
background_tasks = set()  # <-- Track all tasks


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
    if shutdown_event.is_set():  # <-- Don't process frames during shutdown
        return
    await send_frame(frame)


# ------------------ Game Command Handling ------------------ #
async def param_updates(data):
    """Handle parameter updates from Pixel Streaming or external sources."""
    
    """
    data : dict of params to update. This should be updated to support the webrtc app commands
    """
    pass


# ------------------ Pixel Streaming Connection ------------------ #

async def connect_to_pixel_streaming():
    """Connect to the Pixel Streaming signaling server."""
    global client
    signaling_url = os.environ.get("SIGNALING_WEBSERVER_URL", "ws://webrtc-app:8080")
    max_fps = int(os.environ.get("MAX_FPS", "60"))

    client = PixelStreamingClient(
        signaling_url, 
        pixel_streaming_frame_callback, 
        max_fps=max_fps
    )

    # Store the listen task so we can cancel it later
    client._connect_task = asyncio.create_task(client.connect())
    background_tasks.add(client._connect_task)
    client._connect_task.add_done_callback(background_tasks.discard)

    logger.info("Successfully initiated Pixel Streaming connection")


# ------------------ Cleanup ------------------ #

async def cleanup():
    """Clean up all resources on shutdown."""
    global sp, client

    logger.info("Starting cleanup...")
    shutdown_event.set()

    # Cancel all background tasks
    for task in list(background_tasks):
        if not task.done():
            task.cancel()

    if background_tasks:
        await asyncio.gather(*background_tasks, return_exceptions=True)

    # Disconnect client
    if client:
        try:
            await asyncio.wait_for(client.disconnect(), timeout=5.0)
        except asyncio.TimeoutError:
            logger.error("Client disconnect timed out")
        except Exception as e:
            logger.error(f"Error disconnecting client: {e}")
        finally:
            client = None

    # Stop stream processor
    if sp:
        try:
            await sp.stop()  # If it has a stop method
        except Exception as e:
            logger.error(f"Error stopping StreamProcessor: {e}")
        finally:
            sp = None

    # Force garbage collection
    import gc
    gc.collect()
    gc.collect()

    logger.info("Cleanup complete")


# ------------------ Main Worker ------------------ #

async def main():
    global sp
    logger.info("Starting VTuber worker with Pixel Streaming support")

    sp = StreamProcessor(
        name="webrtc-to-trickle",
        port=8000,
        param_updater=param_updates,
    )

    try:
        if os.environ.get("SIGNALING_WEBSERVER_URL"):
            logger.info("SIGNALING_WEBSERVER_URL detected, connecting to Pixel Streaming")

            # Start Pixel Streaming connection (non-blocking)
            await connect_to_pixel_streaming()

            # Wait for either shutdown signal or sp to finish
            sp_task = asyncio.create_task(sp.run_forever())
            background_tasks.add(sp_task)

            await shutdown_event.wait()

        else:
            logger.info("No SIGNALING_WEBSERVER_URL found")
            return

    finally:
        await cleanup()


def signal_handler(signum, frame):
    """Handle shutdown signals."""
    logger.info(f"Received signal {signum}, initiating shutdown...")
    shutdown_event.set()


if __name__ == "__main__":
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        loop = asyncio.get_event_loop()
        asyncio.set_event_loop(loop)

        # Run main
        loop.run_until_complete(main())       
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        shutdown_event.set()
        loop.run_until_complete(cleanup())
    finally:
        # Final cleanup
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()

        loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        loop.close()
        logger.info("Shutdown complete")