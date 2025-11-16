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
import torch.multiprocessing as mp

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

proc = None

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

async def load_model():
    await asyncio.get_event_loop().run_in_executor(None, _wait_for_model)

async def update_params(params: dict):
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
def start_webserver(frame_queue, result_queue, lock_frame_queue):
    async def video_proc(frame: VideoFrame) -> VideoFrame:
        try:
            img_tensor = frame.tensor.squeeze(0).permute(2, 0, 1)

            if frame.timestamp is not None and frame.time_base is not None:
                timestamp_sec = float(frame.timestamp * frame.time_base)
            else:
                timestamp_sec = None

            # Send buffer + timestamp to inference process
            if not lock_frame_queue.is_set():
                frame_queue.put((img_tensor, timestamp_sec))
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
def start_inference(frame_queue, result_queue, lock_frame_queue):
    # Start the LMDeploy server in this process
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    
    def print_vlm_logs():
        import os
        pid = os.getpid()
        for line in proc.stdout:
            print(f"vlm[{pid}]:", line.strip())
    
    threading.Thread(target=print_vlm_logs, daemon=True).start()
    logger.info("LMDeploy server starting...")
    
    # Wait for server to be ready
    _wait_for_model()
    logger.info("LMDeploy server ready, starting inference loop")

    async def run():
        history = []

        try:
            while True:
                try:
                    # Wait until at least 5 frames are in the queue
                    if frame_queue.qsize() < 5:
                        await asyncio.sleep(0.05)
                        continue

                    # Drain all frames
                    lock_frame_queue.set()
                    frame_contents = []
                    start = time.time()
                    last_timestamp = None
                    while not frame_queue.empty():
                        frame = frame_queue.get()
                        img = to_pil(frame[0])

                        buf = io.BytesIO()
                        img.save(buf, format="JPEG")
                        buf.seek(0)
                        frame_contents.append({
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
                            },
                        })
                        last_timestamp = frame[1]

                    logger.info(f"processed frames for inference: {len(frame_contents)} frames in {time.time() - start:.2f}s")


                    # Build multimodal message: prompt + history + frames
                    content = [{"type": "text", "text": user_prompt}]
                    content.extend(history[-history_length:])
                    content.extend(frame_contents)
                    messages = [{"role": "user", "content": content}]

                    # Call OpenAI-compatible API
                    start = time.time()
                    resp = client.chat.completions.create(
                        model=model_name,
                        messages=messages,
                        max_tokens=max_new_tokens,
                    )
                    logger.info(f"Inference call done in {time.time() - start:.2f}s")
                    result_text = resp.choices[0].message.content

                    # Update history
                    history.append({"type": "text", "text": result_text})

                    # Send result back to webserver
                    result_queue.put({"analysis": result_text, "timestamp": last_timestamp})
                    #open for new frames
                    lock_frame_queue.clear()
                except Exception as e:
                    logger.error(f"Inference failed: {e}")
                    await asyncio.sleep(0.1)  # prevent tight error loop
        finally:
            # Cleanup: terminate the LMDeploy server when inference stops
            logger.info("Shutting down LMDeploy server...")
            proc.terminate()
            try:
                proc.wait(timeout=5)
                logger.info("LMDeploy server terminated cleanly")
            except subprocess.TimeoutExpired:
                logger.warning("LMDeploy server didn't stop, killing it")
                proc.kill()
                proc.wait()

    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        logger.info("Inference process interrupted")
    finally:
        # Ensure cleanup even if asyncio.run fails
        if proc and proc.poll() is None:
            logger.info("Final cleanup: terminating LMDeploy server")
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()

# ------------------------
# Main launcher
# ------------------------
if __name__ == "__main__":
    mp_frame_queue = mp.Queue(maxsize=5)
    mp_result_queue = mp.Queue(maxsize=20)
    lock_frame_queue = mp.Event()

    web_proc = mp.Process(
        target=start_webserver,
        args=(mp_frame_queue, mp_result_queue, lock_frame_queue),
        daemon=True,
    )
    inf_proc = mp.Process(
        target=start_inference,
        args=(mp_frame_queue, mp_result_queue, lock_frame_queue),
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
        if proc:
            proc.terminate()  # kill lmdeploy server
