import asyncio
import subprocess
import threading
from collections import deque
from openai import OpenAI
from pytrickle import StreamProcessor
from pytrickle.frames import VideoFrame
from PIL import Image, ImageDraw, ImageFont
from torchvision import transforms
import sys
import time
import logging
import requests
import torch
import io
import base64
import multiprocessing

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger()
logging.getLogger("openai").setLevel(logging.INFO)

# --- Global config/state ---
history_length = 2
max_new_tokens = 200
user_prompt = """
You are an expert video analysis provider that balances detail and broad understanding of video provided.
Describe the video frame in context of previous frames. First sentence should be what changed, next list details
of the frame to use for reference in next frame analysis.
Do not include leading text like 'this image shows', 'this video depicts'.
"""

# Image transforms
to_tensor = transforms.ToTensor()
to_pil = transforms.ToPILImage()

# LMDeploy model
model_name = "OpenGVLab/InternVL3_5-1B"
client = OpenAI(api_key="none", base_url="http://localhost:23333/v1")

# Launch LMDeploy server
cmd = [
    sys.executable, "-m", "lmdeploy", "serve", "api_server", model_name,
    "--server-port", "23333", "--tp", "1", "--backend", "pytorch"
]
proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

def print_vlm_logs():
    for line in proc.stdout:
        print("vlm:", line.strip())

threading.Thread(target=print_vlm_logs, daemon=True).start()

# Wait until server is ready
def _wait_for_model():
    url = "http://localhost:23333/v1/models"
    while True:
        try:
            resp = requests.get(url, timeout=2)
            resp.raise_for_status()
            data = resp.json()
            if "data" in data and len(data["data"]) > 0:
                logger.info("VLM server ready: %s", data["data"])
                break
        except requests.RequestException:
            logger.info("VLM not ready yet, retrying...")
        time.sleep(2)

def load_model():
    _wait_for_model()

def update_params(params: dict):
    global user_prompt, history_length, max_new_tokens
    if "user_prompt" in params:
        user_prompt = params["user_prompt"]
    if "history_length" in params:
        history_length = params["history_length"]
    if "max_new_tokens" in params:
        max_new_tokens = params["max_new_tokens"]

# ------------------------
# Webserver process
# ------------------------
def start_webserver(frame_queue, result_queue):
    async def video_proc(frame: VideoFrame) -> VideoFrame:
        try:
            img_tensor = frame.tensor.squeeze(0).permute(2, 0, 1)
            img = to_pil(img_tensor)

            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            buf.seek(0)

            if frame.timestamp is not None and frame.time_base is not None:
                timestamp_sec = float(frame.timestamp * frame.time_base)
            else:
                timestamp_sec = None

            # Send buffer + timestamp to inference process
            frame_queue.put((buf, timestamp_sec))
            return frame
        except Exception as e:
            logger.error(f"Video processing failed: {e}")
            return frame

    async def forward_results(processor: StreamProcessor):
        loop = asyncio.get_event_loop()
        while True:
            try:
                # Blocking get in executor to avoid stalling loop
                result = await loop.run_in_executor(None, result_queue.get)
                if processor:
                    await processor.send_data(result)
            except Exception as e:
                logger.error(f"Forwarding failed: {e}")
                break

    async def run():
        processor = StreamProcessor(
            video_processor=video_proc,
            model_loader=load_model,
            param_updater=update_params,
            name="video-analysis",
        )
        await asyncio.gather(
            processor.run_forever(),   # webserver
            forward_results(processor)  # forward analysis results
        )

    asyncio.run(run())

# ------------------------
# Inference process
# ------------------------
def start_inference(frame_queue, result_queue):
    async def run():
        history = []

        while True:
            try:
                # Wait until at least 5 frames are in the queue
                if frame_queue.qsize() < 5:
                    await asyncio.sleep(0.05)
                    continue

                # Drain all frames
                frames_to_process = []
                while not frame_queue.empty():
                    frames_to_process.append(frame_queue.get())

                if not frames_to_process:
                    continue

                # Use the latest timestamp
                max_timestamp = max(frames_to_process, key=lambda x: x[1])[1]

                # Convert frames to base64
                frame_contents = [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
                        },
                    }
                    for buf, _ in frames_to_process
                ]

                # Build multimodal message: prompt + history + frames
                content = [{"type": "text", "text": user_prompt}]
                content.extend(history[-history_length:])
                content.extend(frame_contents)
                messages = [{"role": "user", "content": content}]

                # Call OpenAI-compatible API
                resp = client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    max_tokens=max_new_tokens,
                )
                result_text = resp.choices[0].message.content

                # Update history
                history.append({"type": "text", "text": result_text})

                # Send result back to webserver
                result_queue.put({"analysis": result_text, "timestamp": max_timestamp})

            except Exception as e:
                logger.error(f"Inference failed: {e}")
                await asyncio.sleep(0.1)  # prevent tight error loop

    asyncio.run(run())

# ------------------------
# Main launcher
# ------------------------
if __name__ == "__main__":
    mp_frame_queue = multiprocessing.Queue(maxsize=20)
    mp_result_queue = multiprocessing.Queue(maxsize=20)

    web_proc = multiprocessing.Process(
        target=start_webserver,
        args=(mp_frame_queue, mp_result_queue),
        daemon=True,
    )
    inf_proc = multiprocessing.Process(
        target=start_inference,
        args=(mp_frame_queue, mp_result_queue),
        daemon=True,
    )

    web_proc.start()
    inf_proc.start()

    try:
        web_proc.join()
        inf_proc.join()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        web_proc.terminate()
        inf_proc.terminate()
        proc.terminate()  # kill lmdeploy server
