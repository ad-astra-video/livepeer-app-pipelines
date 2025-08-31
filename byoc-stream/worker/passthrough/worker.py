import asyncio
import logging

from pytrickle import StreamProcessor, VideoFrame, AudioFrame

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()
logging.getLogger("pytrickle").setLevel(logging.INFO)

processor = None
def load_model():
    pass

async def process_video(frame: VideoFrame) -> VideoFrame:
    return frame

async def process_audio(frame: AudioFrame) -> list[AudioFrame]:
    return [frame]

async def main():
    """Start the StreamServer and background tasks on the same asyncio loop."""
    global processor
    processor = StreamProcessor(
        video_processor=process_video,
        audio_processor=process_audio,
        model_loader=load_model,
        name="multimodal-understanding-gemma3n",
    )

    # Start HTTP server (aiohttp) on the current event loop
    await processor.run_forever()

if __name__ == "__main__":
    logger.info("running")
    asyncio.run(main())