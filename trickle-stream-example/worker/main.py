#!/usr/bin/env python3
import asyncio
import os
import logging
from typing import Union

import torch
from pytrickle import TrickleApp
from pytrickle.frames import (
    VideoFrame,
    AudioFrame,
    VideoOutput,
    AudioOutput,
)
from register import register_capability_from_env


class AsyncUpsideDownProcessor:
    """Async processing pattern with a sync bridge for TrickleApp.

    - Background task processes frames (vertical flip)
    - Sync method enqueues frames, returns cached processed result when available
    - Audio frames are passed through unchanged
    """

    def __init__(self) -> None:
        self.input_queue: asyncio.Queue[VideoFrame] = asyncio.Queue(maxsize=30)
        self.output_queue: asyncio.Queue[VideoFrame] = asyncio.Queue(maxsize=30)
        self.last_processed: Union[VideoFrame, None] = None
        self.processor_task: asyncio.Task | None = None

    def start(self) -> None:
        if self.processor_task is None or self.processor_task.done():
            self.processor_task = asyncio.create_task(self._background_processor())

    async def _background_processor(self) -> None:
        while True:
            frame = await self.input_queue.get()
            try:
                processed = self._process_video(frame)
                self.last_processed = processed
                try:
                    self.output_queue.put_nowait(processed)
                except asyncio.QueueFull:
                    try:
                        _ = self.output_queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                    try:
                        self.output_queue.put_nowait(processed)
                    except asyncio.QueueFull:
                        pass
            except Exception:
                # On processing errors, keep looping; passthrough will occur in sync method
                continue

    def _process_video(self, frame: VideoFrame) -> VideoFrame:
        tensor = frame.tensor.clone()
        flipped = tensor.flip(dims=[1])
        return frame.replace_tensor(flipped)

    def process_frame_sync(self, frame: Union[VideoFrame, AudioFrame]) -> Union[VideoOutput, AudioOutput]:
        if isinstance(frame, AudioFrame):
            return AudioOutput([frame], "audio_passthrough")

        try:
            self.input_queue.put_nowait(frame)
        except asyncio.QueueFull:
            pass

        try:
            self.last_processed = self.output_queue.get_nowait()
        except asyncio.QueueEmpty:
            pass

        if self.last_processed is not None:
            updated = frame.replace_tensor(self.last_processed.tensor)
            return VideoOutput(updated, "upside_down_async")
        return VideoOutput(frame, "passthrough")


async def main():
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("trickle-stream-example")

    # Optionally register as a worker with orchestrator
    register_capability_from_env(logger)

    processor = AsyncUpsideDownProcessor()
    processor.start()

    # Derive port from CAPABILITY_URL if set
    port = 8080
    cap_url = os.environ.get("CAPABILITY_URL")
    if cap_url and ":" in cap_url:
        try:
            port = int(cap_url.rsplit(":", 1)[-1])
        except Exception:
            port = 8080

    app = TrickleApp(
        frame_processor=processor.process_frame_sync,
        port=port,
    )

    await app.run_forever()


if __name__ == "__main__":
    asyncio.run(main())


