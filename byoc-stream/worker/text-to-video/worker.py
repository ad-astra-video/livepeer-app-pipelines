from pytrickle import StreamProcessor
from pytrickle.frames import VideoFrame
import os
import asyncio
import logging
import time
import random
from torchvision import transforms
from copy import deepcopy
import multiprocessing as mp
from PIL import Image, ImageDraw, ImageFont
from fractions import Fraction

from fastvideo import VideoGenerator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger()

processor = None
background_tasks = []
background_task_started = False

to_pil = transforms.ToPILImage()
to_tensor = transforms.ToTensor()

os.environ["FASTVIDEO_ATTENTION_BACKEND"] = "VIDEO_SPARSE_ATTN"
generator = None
pts = 0
pts_inc = 90_000 // 24 #24fps time between frames + 1
time_base = Fraction(1,90_000) #mpegts time_base

# Define a prompt for your video
prompt = "A curious raccoon peers through a vibrant field of yellow sunflowers, its eyes wide with interest."

width, height = 512, 512
img = Image.new('RGB', (width, height))
pixels = img.load()
for x in range(width):
    for y in range(height):
        r = random.randint(0, 255)
        g = random.randint(0, 255)
        b = random.randint(0, 255)
        pixels[x, y] = (r, g, b)
img_tensor = to_tensor(img)
img_tensor = img_tensor.permute(1,2,0).unsqueeze(0)

def update_params(params: dict):
    pass
    
def load_model(**kwargs):
    logger.info("Loading video generator")
    # Create a video generator with a pre-trained model
    #generator = VideoGenerator.from_pretrained(
    #    "FastVideo/FastWan2.1-T2V-1.3B-Diffusers",
    #    num_gpus=1,  # Adjust based on your hardware
    #)
    logger.info("Worker is ready (model loaded)")

def generate_video():
    global prompt, generator, processor
    # Generate the video
    video = generator.generate_video(
        prompt,
        return_frames=True,  # Also return frames from this call (defaults to False)
        output_path="/videos/",  # Controls where videos are saved
        save_video=True
    )

async def send_frame():
    #create an image that is random colors
    global pts, pts_inc, time_base, img_tensor
     #shape is [C,H,W]
    
    #create the frame
    frame = VideoFrame.from_av_video(img_tensor, pts, time_base)
    pts += pts_inc
    await processor.send_frame(frame)
    
async def send_video():
    while True:
        await send_frame()
        await asyncio.sleep(0.031) #sleep a bit then generate frame

async def start_video_gen():
    global background_task_started, background_tasks
    if not background_task_started and processor:
        task = asyncio.create_task(send_video())
        background_tasks.append(task)
        background_task_started = True
        logger.info("Started background video gen task")
    
async def on_stream_stop():
    """Called when stream stops - cleanup background tasks."""
    global background_tasks, background_task_started
    logger.info("Stream stopped, cleaning up background tasks")

    for task in background_tasks:
        if not task.done():
            task.cancel()
            logger.info("Cancelled background task")

    background_tasks.clear()
    background_task_started = False  # Reset flag for next stream
    logger.info("All background tasks cleaned up")
    
async def run_processor():
    #start video gen
    await start_video_gen()
    
    logger.info("Running stream processor")
    await processor.run_forever()
    
if __name__ == "__main__":
    logger.info("Starting video generator worker")

    processor = StreamProcessor(
        model_loader=load_model,   # will block until worker ready
        param_updater=update_params,
        on_stream_stop=on_stream_stop,
        name="video-gen",
    )

    try:
        #blocks until done
        asyncio.run(run_processor())
    except KeyboardInterrupt:
        pass
