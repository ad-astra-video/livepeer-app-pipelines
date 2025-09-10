import os, io, sys, time, logging, json, random, base64, importlib, inspect
from contextlib import asynccontextmanager

import requests
import asyncio
import httpx

from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import StreamingResponse

from server.register import *
from server.hardware import HardwareInfo

create_story_instruction = """
You are a master storyteller AI. Your task is to write engaging, imaginative, and emotionally resonant stories based on user prompts. Each story should demonstrate strong narrative structure, vivid descriptions, and meaningful character development.
When writing a story:
Begin with a hook that draws the reader in immediately.
Establish the setting and main characters early, with clear motivations and emotions.
Introduce conflict or tension to drive the plot forward.
Include sensory details, dialogue, and inner thoughts to create immersion.
Build toward a satisfying climax and resolution, with emotional or thematic payoff.
Match the tone, style, and genre implied by the prompt.
Keep the pacing appropriate for the length. Prioritize quality over verbosity. Always aim to surprise, move, or inspire the reader.
Do not inlude any other response other than the title of the story and the story.
Story should be created with this guidance: 
"""

# Get the logger instance
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.propagate = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create application wide hardware info service.
    if not register_to_orchestrator():
        logger.error("failed to register to orchestrator, exiting")
    
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
    
    yield
    
    logger.info("Shutting down")

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health(request: Request):
    return {"status":"ok"}
    
@app.get("/hardware/info")
async def hardware_info(request: Request):
    gpu_info = await asyncio.to_thread(request.app.hardware_info.get_gpu_compute_info)
    return gpu_info

@app.post("/story/create")
async def create_story(request: Request):
    params = await request.json()
    if not "prompt" in params:
        raise Exception("request error: prompt not included")

    
    messages = [
                   {
                       "role": "user",
                       "content": [
                           {"type": "text", "text": create_story_instruction+"\n"+params["prompt"]},
                       ]
                   }
               ]
    
    req = {
            "messages": messages,
            "stream": True,
            "model": "google/gemma-3-4b-it",
            "max_tokens": 8192
          }
    
    async def event_generator(client):
        async with client.stream("POST", "http://worker-vllm:8000/v1/chat/completions", json=req) as response:
            async for line in response.aiter_lines():
                if line.strip():  # Only forward non-empty lines
                    yield f"{line}\n"
                    await asyncio.sleep(0)  # Yield control to event loop
                        
    client = httpx.AsyncClient(timeout=None)
    
    return StreamingResponse(event_generator(client), media_type="text/event-stream")

