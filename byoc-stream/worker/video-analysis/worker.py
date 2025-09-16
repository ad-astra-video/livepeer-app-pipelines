from pytrickle import StreamProcessor
from pytrickle.frames import VideoFrame
import asyncio
import logging
import time
from torchvision import transforms
from copy import deepcopy
import torch.multiprocessing as mp
from PIL import Image, ImageDraw, ImageFont

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger()

processor = None
to_pil = transforms.ToPILImage()

# --- Queues for inter-process communication ---
frame_queue_length = 2
frame_queue = mp.Queue(maxsize=frame_queue_length)
result_queue = mp.Queue(maxsize=5)
worker_ready_event = mp.Event()
current_timestamp = mp.Value("d", 0.0)
#param updates to worker
user_prompt_queue = mp.Queue(maxsize=1)
history_length_queue = mp.Queue(maxsize=1)
max_new_tokens_queue = mp.Queue(maxsize=1)

def chat_worker(frames_queue_length, frame_q, result_q, user_prompt_q, history_length_q, max_new_tokens_q, ready_event: mp.Event):
    
    import torch
    from transformers import AutoModel, AutoTokenizer, BitsAndBytesConfig
    from copy import deepcopy
    import logging
    from queue import Empty
    #debug logging
    from transformers import logging as hf_logging
    hf_logging.set_verbosity_debug()
    
    logger = logging.getLogger("chat_worker")
    logger.info("Loading model in worker process...")
    
    #setup image transform
    to_pil = transforms.ToPILImage()
    
    #starting params
    history_length = 0
    max_new_tokens = 200
    user_prompt = """
    You are an expert video analysis provider that balances detail and broad understanding of video provided.
    Describe the video frame in context of previous frames.  First sentence should be what changed, next list details of the frame to use for reference in next frame analysis.
    Do not include leading text like 'this image shows', 'this video depicts',
    Example response:
    The individual remains in similar position looking at the camera.  Background is plain, individual is a man, wearing read shirt, glasses, white earbuds in ears.
    A rabbit has entered the scene from the left.  Tall trees, wet ground, fog in the distance.
    """
    
    def check_for_update(queue, current):
        try:
            return queue.get_nowait()
        except Empty:
            return current
    
    model_name_or_path = "openbmb/MiniCPM-V-4_5-int4"
    # Quantization configuration https://github.com/OpenSQZ/MiniCPM-V-CookBook/blob/main/quantization/bnb/minicpm-v4_5_bnb_quantize.md
    #quantization_config = BitsAndBytesConfig(
    #    load_in_4bit=True,
    #    load_in_8bit=False,
    #    bnb_4bit_compute_dtype=torch.float16,
    #    bnb_4bit_quant_storage=torch.uint8,
    #    bnb_4bit_quant_type="nf4",
    #    bnb_4bit_use_double_quant=True,
    #    llm_int8_enable_fp32_cpu_offload=False,
    #    llm_int8_has_fp16_weight=False,
    #    llm_int8_skip_modules=["out_proj", "kv_proj", "lm_head"],
    #    llm_int8_threshold=6.0
    #)
    model = AutoModel.from_pretrained(
        model_name_or_path,
        trust_remote_code=True,
        #quantization_config=quantization_config,
        attn_implementation="sdpa"
    ).eval().cuda()
    tokenizer = AutoTokenizer.from_pretrained(model_name_or_path, trust_remote_code=True, use_fast=True)

    logger.info("Model loaded in worker process, running warmup")
    # ---- Warmup ----
    try:
        green_img = Image.new("RGB", (224, 224), color=(0, 255, 0))  # solid green image
        dummy_msgs = [{"role": "user", "content": [green_img, "Warmup run."]}]
        model.chat(msgs=dummy_msgs, image=green_img, tokenizer=tokenizer, max_new_tokens=max_new_tokens, enable_thinking=False)
        logger.info("Warmup inference complete")
    except Exception as e:
        logger.warning(f"Warmup failed: {e}")
    
    ready_event.set()  # ✅ signal main process that the model is ready
    
    history = []
    while True:
        #set params
        max_new_tokens = check_for_update(max_new_tokens_q, max_new_tokens)
        history_length = check_for_update(history_length_q, history_length)
        user_prompt = check_for_update(user_prompt_q, user_prompt)
        
        frames_prompt = []
        frames_ts = []
        for f in range(frame_queue_length):
            frame = frame_q.get()
            if frame is None:
                break
            frames_ts.append(frame.timestamp)
            img_tensor = frame.tensor.squeeze(0).permute(2, 0, 1)
            img = to_pil(img_tensor)
            
            frames_prompt.append(img)
        msg_template = [{"role": "user", "content": [frames_prompt, user_prompt]}]
        msgs = history + msg_template
        
        try:
            #start = time.time()
            #chat_str = tokenizer.apply_chat_template(msgs,tokenize=False,add_generation_promt=True)
            #tokenized = tokenizer(chat_str, return_tensors="pt")
            #tokenizer_time = time.time() - start
            start = time.time()
            #result = model.generate(**tokenized, max_new_tokens=max_new_tokens, use_cache=True, temporal_ids=[frames_ts])
            result = model.chat(msgs=msgs, image=img, tokenizer=tokenizer, use_cache=True, max_new_tokens=max_new_tokens)
            inference_time = time.time() - start
            
            history.append(deepcopy(msg_template[0]))
            history.append({"role": "assistant", "content": [result]})
            if len(history) > history_length:
                del history[:-history_length]

            delay = -1
            if current_timestamp and frame.timestamp != 0 and frame.timestamp != None:
                logger.info(f"processing frame, current_timestamp: {current_timestamp.value} frame_timestamp: {frame.timestamp} frame_time_base: {str(frame.time_base)}")
                delay = (current_timestamp.value - frame.timestamp) * frame.time_base
            
            result_q.put({'description':result, 'timestamp_seconds': float(frame.timestamp * frame.time_base), 'delay_seconds': delay, 'inference_seconds': inference_time})
        except Exception as e:
            logger.exception("Error in chat_worker")
            result_q.put(f"Error: {e}")

async def forward_results():
    while True:
        # Get results in a thread to avoid blocking the event loop
        result = await asyncio.to_thread(result_queue.get)
        if processor is not None:
            await processor.send_data(result)

async def process_video(frame: VideoFrame) -> VideoFrame:
    current_timestamp.value = frame.timestamp
    try:
        # drain stale frames, no op if worker pulled the frame
        
        if frame_queue.qsize() == frame_queue_length:
            frame_queue.get()
        #put latest frame
        frame_queue.put_nowait(frame)
        
    except mp.queues.Full:
        logger.debug("Worker busy, skipping frame")
    
    img_tensor = frame.tensor.squeeze(0).permute(2, 0, 1)
    img = transforms.ToPILImage()(img_tensor)
    ts_seconds = float(frame.timestamp * frame.time_base)
    draw = ImageDraw.Draw(img)
    text = f"{ts_seconds:.3f}s"

    # Optional: use default PIL font
    font = ImageFont.load_default()

    # Draw black text (with white outline for visibility if desired)
    draw.text((5, 5), text, font=font, fill="black")
    out_tensor = transforms.ToTensor()(img)
    out_tensor = out_tensor.permute(1, 2, 0).unsqueeze(0)
    return frame.replace_tensor(out_tensor)

def update_params(params: dict):
    if "user_prompt" in params:
        user_prompt_queue.put(params["user_prompt"])
    if "history_length" in params:
        history_length_queue.put(params["history_length"])
    if "max_new_tokens" in params:
        max_new_tokens_queue.put(params["max_new_tokens"])
    
def load_model(**kwargs):
    logger.info("Waiting for worker to finish loading model...")
    worker_ready_event.wait()   # ✅ block until worker signals ready
    logger.info("Worker is ready (model loaded)")

async def run_processor():
    #start results forwarding task
    asyncio.create_task(forward_results())
    
    logger.info("Running stream processor")
    await processor.run_forever() 
    
if __name__ == "__main__":
    logger.info("Starting chat worker process")
    worker_process = mp.Process(
        target=chat_worker,
        args=(frame_queue_length, frame_queue, result_queue, user_prompt_queue, history_length_queue, max_new_tokens_queue, worker_ready_event),
        daemon=True,
    )
    worker_process.start()

    processor = StreamProcessor(
        video_processor=process_video,
        model_loader=load_model,   # will block until worker ready
        param_updater=update_params,
        name="video-analysis",
    )

    try:
        #blocks until done
        asyncio.run(run_processor())
    except KeyboardInterrupt:
        pass
    finally:
        frame_queue.put(None)
        worker_process.join(timeout=5)
        if worker_process.is_alive():
            worker_process.terminate()