#!/usr/bin/env python3
import asyncio
import os
import logging
from typing import Optional

import torch
from pytrickle import TrickleApp, AsyncFrameProcessor
from pytrickle.frames import VideoFrame, AudioFrame
from pytrickle import RegisterCapability
from fractions import Fraction
import av
import numpy as np


class AsyncUpsideDownProcessor(AsyncFrameProcessor):
    """
    Async video processor that flips frames upside down.
    
    This processor demonstrates the new AsyncFrameProcessor pattern by:
    - Inheriting from AsyncFrameProcessor for automatic sync/async bridging
    - Implementing async video processing with vertical flip
    - Passing through audio frames unchanged
    """

    def __init__(self):
        """Initialize the upside down processor."""
        super().__init__(
            queue_maxsize=30,
            error_callback=self._handle_error
        )
        logger = logging.getLogger("AsyncUpsideDownProcessor")
        logger.info("AsyncUpsideDownProcessor initialized")

    def _handle_error(self, error: Exception):
        """Handle processing errors."""
        logger = logging.getLogger("AsyncUpsideDownProcessor")
        logger.error(f"Processing error: {error}")

    async def process_video_async(self, frame: VideoFrame) -> Optional[VideoFrame]:
        """
        Process video frame by flipping it upside down.
        
        Args:
            frame: Input video frame
            
        Returns:
            Vertically flipped video frame
        """
        try:
            # Clone the tensor and flip vertically
            tensor = frame.tensor.clone()
            flipped = tensor.flip(dims=[1])  # Flip along height dimension
            processed_frame = frame.replace_tensor(flipped)
            
            # Store as fallback frame in the base class attribute
            self.last_video_frame = processed_frame
            
            return processed_frame
        except Exception as e:
            logger = logging.getLogger("AsyncUpsideDownProcessor")
            logger.error(f"Error flipping frame: {e}")
            # Return fallback frame if available
            return self.last_video_frame

    async def process_audio_async(self, frame: AudioFrame) -> Optional[list[AudioFrame]]:
        """
        Audio frames are now handled with immediate passthrough in the sync interface.
        This method is kept for compatibility but is no longer used.
        
        Args:
            frame: Input audio frame
            
        Returns:
            List containing the original audio frame
        """
        # Store as fallback frame in the base class attribute
        self.last_audio_frame = frame
        # Pass through audio unchanged
        return [frame]

    async def ensure_ready(self):
        """Ensure the processor is ready to handle frames by processing dummy frames."""
        # Wait a bit for the processor to initialize
        await asyncio.sleep(0.1)
        
        # Create dummy frames to initialize fallback frames
        dummy_video = VideoFrame(
            tensor=torch.zeros(3, 512, 512),
            timestamp=0,
            time_base=Fraction(1, 30)
        )
        
        # Create a proper av.AudioFrame first, then wrap it in AudioFrame
        dummy_av_audio = av.AudioFrame.from_ndarray(
            np.zeros((2, 480), dtype=np.float32),  # (channels, samples) for planar format
            format="fltp", 
            layout="stereo"
        )
        dummy_av_audio.sample_rate = 48000
        dummy_av_audio.pts = 0
        dummy_av_audio.time_base = Fraction(1, 30)
        
        dummy_audio = AudioFrame(dummy_av_audio)
        
        # Process dummy frames to initialize fallbacks
        await self.process_video_async(dummy_video)
        # Audio frames are now handled with immediate passthrough, no need to process dummy audio
        
        logger = logging.getLogger("AsyncUpsideDownProcessor")
        logger.info("Processor ready with fallback frames initialized")


async def main():
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("trickle-stream-example")

    # Create and start async processor
    processor = AsyncUpsideDownProcessor()
    await processor.start()
    
    # Ensure processor is ready with fallback frames
    await processor.ensure_ready()

    # Register as a worker with orchestrator after warmup
    # TODO: register can return a success/failure with capability url/port for reuse
    RegisterCapability.register(logger)

    # Use port from CAPABILITY_URL if set
    port = 8080
    cap_url = os.environ.get("CAPABILITY_URL")
    if cap_url and ":" in cap_url:
        try:
            port = int(cap_url.rsplit(":", 1)[-1])
        except Exception:
            pass
    logger.info(f"Using port {port}")

    # Create TrickleApp with the new clean async processor pattern
    app = TrickleApp(
        frame_processor=processor.create_sync_bridge(),
        port=port,
    )

    await app.run_forever()


if __name__ == "__main__":
    asyncio.run(main())
