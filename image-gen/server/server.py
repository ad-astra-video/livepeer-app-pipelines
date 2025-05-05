import os, io, sys, time, logging, json, random, base64, importlib, inspect
from contextlib import asynccontextmanager

import requests
import torch
import asyncio

from fastapi import FastAPI, Request, HTTPException, Response

from server.register import *
from server.hardware import HardwareInfo

from diffusers import DiffusionPipeline
from transformers import T5TokenizerFast, T5ForConditionalGeneration
from torchao.quantization import autoquant

# Get the logger instance
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.propagate = False

pipeline_overrides = {}

img_buf = io.BytesIO() 

#pulled from diffusers __call__
sys_instruction =  [
            "Given a user prompt, generate an 'Enhanced prompt' that provides detailed visual descriptions suitable for image generation. Evaluate the level of detail in the user prompt:",
            "- If the prompt is simple, focus on adding specifics about colors, shapes, sizes, textures, and spatial relationships to create vivid and concrete scenes.",
            "- If the prompt is already detailed, refine and enhance the existing details slightly without overcomplicating.",
            "Here are examples of how to transform or refine prompts:",
            "- User Prompt: A cat sleeping -> Enhanced: A small, fluffy white cat curled up in a round shape, sleeping peacefully on a warm sunny windowsill, surrounded by pots of blooming red flowers.",
            "- User Prompt: A busy city street -> Enhanced: A bustling city street scene at dusk, featuring glowing street lamps, a diverse crowd of people in colorful clothing, and a double-decker bus passing by towering glass skyscrapers.",
            "Please generate only the enhanced description for the prompt below and avoid including any additional commentary or evaluations:",
            "User Prompt: ",
        ]

generated_prompt_embeds = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create application wide hardware info service.
    if not register_to_orchestrator():
        logger.error("failed to register to orchestrator, exiting")
    
    try:
        check_models_exist()
    except:
        logger.error("failed to locate MODEL_ID, exiting")
        return
    
    app.hardware_info = HardwareInfo()
    
    try:
        override_file = os.environ.get("PIPELINE_OVERRIDES","")
        if override_file:
            logger.info("loading pipeline overrides from file")
            with open(override_file, 'r') as file:
                pipeline_overrides = json.load(file)
    except FileNotFoundError:
        logger.error("pipeline overrides file does not exist, exiting")
        return
    except json.JSONDecodeError:
        logger.error("pipeline overrides file is not valid json, exiting")
        return
    
    #setup the SANA pipeline
    app.pipeline = load_pipeline()
    app.pipeline.enable_vae_slicing()
    app.pipeline.to("cuda")
    compile_pipeline(app.pipeline)
    
    #setup the prompt enhancement LLM
    app.llm, app.llm_tokenizer = load_llm()
    app.llm.to("cuda")
    
    yield
    
    logger.info("Shutting down")

def load_pipeline():
    torch_dtype = torch.float16
    if os.environ.get("TORCH_DTYPE","") != "":
        if os.environ.get("TORCH_DTYPE","") == "BFLOAT16":
            torch_dtype = torch.bfloat16
        if os.environ.get("TORCH_DTYPE","") == "FP8":
            torch_dtype = torch.float8_e4m3fn
        
    model_id = os.environ.get("MODEL_ID", "")
    if model_id in pipeline_overrides:
        try:
            model_pipeline = importlib.import_module(pipeline_overrides[model_id], "diffusers")
            logger.info(f"pipeline override {pipeline_overrides[model_id]} used for {model_id}")
            
            return model_pipeline.from_pretrained(model_id, use_safetensors=True, torch_dtype=torch_dtype)
        except:
            logger.error(f"pipeline override {pipeline_overrides[model_id]} import failed for {model_id}")
            return None
    else:
        return DiffusionPipeline.from_pretrained(model_id, use_safetensors=True, torch_dtype=torch_dtype)

def compile_pipeline(pipeline):
    compile_text_encoder = os.environ.get("TORCH_COMPILE_TEXT_ENCODER","")
    compile_transformer = os.environ.get("TORCH_COMPILE_TRANSFORMER", "")
    quantize_transformer = os.environ.get("QUANTIZE_MODEL", "")
    
    if compile_text_encoder != "":
        pipeline.text_encoder = torch.compile(pipeline.text_encoder, mode="reduce-overhead")
    
    if quantize_transformer != "":
        from torchao.quantization import quantize_, PerTensor, Float8WeightOnlyConfig
        quantize_(pipeline.transformer, Float8WeightOnlyConfig())
        #pipeline.transformer = autoquant(pipeline.transformer, error_on_unseen=False)
    
    if compile_transformer != "":
        #see compile optimizations here: https://modal.com/docs/examples/flux
        
        torch._inductor.config.disable_progress = False
        torch._inductor.config.conv_1x1_as_mm = True
        torch._inductor.config.coordinate_descent_tuning = True
        torch._inductor.config.coordinate_descent_check_all_directions = True
        torch._inductor.config.epilogue_fusion = False
        
        pipeline.transformer.to(memory_format=torch.channels_last)
        pipeline.transformer = torch.compile(pipeline.transformer, mode="reduce-overhead", fullgraph=True)
        pipeline.vae.to(memory_format=torch.channels_last)
        pipeline.vae.decode = torch.compile(pipeline.vae.decode, mode="reduce-overhead", fullgraph=True)
    
    #run first req to quantize and compile
    pipeline(prompt="a green ball", num_inference_steps=2)
    
def load_llm():
    model_id = os.environ.get("LLM_MODEL_ID", "roborovski/superprompt-v1")
    model = T5ForConditionalGeneration.from_pretrained(model_id)
    tokenizer = T5TokenizerFast.from_pretrained(model_id)
    return (model, tokenizer)

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health(request: Request):
    return {"status":"ok"}
    
@app.get("/hardware/info")
async def hardware_info(request: Request):
    gpu_info = await asyncio.to_thread(request.app.hardware_info.get_gpu_compute_info)
    return gpu_info
    
@app.post("/text-to-image")
async def t2i(request: Request):
    params = await request.json()
    seed = params.pop("seed", 0)
    if int(seed) == 0:
        seed = int(''.join(random.choice('0123456789') for _ in range(10)))
    params["generator"] = torch.Generator("cuda").manual_seed(seed)
    
    try:
        if "prompt" not in params:
            raise Exception("prompt not included")
        
        embeds, attn_mask = await generate_prompt_embeds(request.app.pipeline.encode_prompt, params["prompt"])
        params["prompt"] = None
        params["prompt_embeds"] = embeds
        params["prompt_attention_mask"] = attn_mask
        start_time = time.time()
        output = await generate_image(request.app.pipeline, **params)
        logger.info(f"inference took {time.time() - start_time} seconds")
        img_buf.seek(0)
        img_buf.truncate(0)
        output.images[0].save(img_buf, format="PNG")
        logger.info(f"save to binary took {time.time() - start_time} seconds")
        #output.images[0].save("/models/test.png")
        img_bytes = img_buf.getvalue()
        logger.info(f"bytes read took {time.time() - start_time} seconds")
        return Response(content=img_bytes, media_type="image/png", headers={"X-Metadata": json.dumps({"seed": seed})})
    except Exception as e:
        logger.error(f"error processing request: {e}")
        status_code = 500
        if "request error:" in str(e):
            status_code = 400
        
        raise HTTPException(
            status_code=status_code,
            detail=f'error processing request',
        )

@app.post("/prompt-enhance")
async def prompt_enhance(request: Request):
    params = await request.json()
    if not "prompt" in params:
        raise Exception("request error: prompt not included")
     
    input_text = f"Expand the following prompt to add more detail: {params['prompt']}"
    inputs = request.app.llm_tokenizer(input_text, return_tensors="pt").input_ids.to(app.llm.device)
    output = request.app.llm.generate(inputs, max_new_tokens=77)
    output_txt = request.app.llm_tokenizer.decode(output[0], skip_special_tokens=True)
    return {"prompt": output_txt}
    

async def generate_image(func, **kwargs):
    """
    Call `func` with only those keyword arguments that are valid for it.
    """
    sig = inspect.signature(func)
    valid_keys = set(sig.parameters)
    filtered_kwargs = {k: v for k, v in kwargs.items() if k in valid_keys}
    return func(**filtered_kwargs)

async def generate_prompt_embeds(func, prompt):
    prompt_hash = hash(prompt)
    if prompt_hash in generated_prompt_embeds:
        return generated_prompt_embeds[prompt_hash]
    else:
        torch.cuda.empty_cache()
        embeds, attn_mask = func(
                                prompt,
                                num_images_per_prompt=1,
                                device="cuda",
                                prompt_embeds=None,
                                prompt_attention_mask=None,
                                clean_caption=False,
                                max_sequence_length=300,
                                complex_human_instruction=sys_instruction,
                                lora_scale=None,
                            )
        generated_prompt_embeds[prompt_hash] = (embeds, attn_mask)
        return (embeds, attn_mask)
