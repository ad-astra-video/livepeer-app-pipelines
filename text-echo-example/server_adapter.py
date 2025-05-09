import os
import logging
import time
import json
from typing import Any, Dict

import requests
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from jsonschema import validate, ValidationError

# -----------------------------------------------------------------------------
# Logging Setup – structured JSON for easy ingestion by Grafana/Loki/DataDog…
# -----------------------------------------------------------------------------

_LOGGER_NAME = "neurosync.worker"
logger = logging.getLogger(_LOGGER_NAME)
logger.setLevel(logging.DEBUG)

# Ensure we only add a handler once when the module is re-imported (pytest etc.)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

# -----------------------------------------------------------------------------
# Environment Configuration
# -----------------------------------------------------------------------------

ORCH_URL = os.getenv("ORCH_URL", "")
ORCH_SECRET = os.getenv("ORCH_SECRET", "")
SERVER_PORT = int(os.getenv("SERVER_PORT", "9876"))

CAPABILITY_NAME = os.getenv("CAPABILITY_NAME", "text-echo")
CAPABILITY_URL = os.getenv("CAPABILITY_URL", f"http://localhost:{SERVER_PORT}")
CAPABILITY_DESCRIPTION = os.getenv("CAPABILITY_DESCRIPTION", "simple text echo capability")
CAPABILITY_CAPACITY = int(os.getenv("CAPABILITY_CAPACITY", 1))
CAPABILITY_PRICE_PER_UNIT = int(os.getenv("CAPABILITY_PRICE_PER_UNIT", 1))
CAPABILITY_PRICE_SCALING = int(os.getenv("CAPABILITY_PRICE_SCALING", 1))

# -----------------------------------------------------------------------------
# JSON Schemas – will evolve with real contract.  Kept here for re-use in tests.
# -----------------------------------------------------------------------------

NEUROSYNC_VTUBER_REQUEST_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "job_id": {"type": "string"},
        "character": {"type": "string"},
        "knowledge_source_url": {"type": "string", "format": "uri"},
        "model_time_seconds": {"type": "number", "minimum": 1},
        "prompt": {"type": "string"},
    },
    "required": ["job_id", "character", "prompt"],
    "additionalProperties": False,
}

# The realtime frame format – loosely defined for now.
NEUROSYNC_REALTIME_FRAME_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "sequence_number": {"type": "integer"},
        "timestamp_ms": {"type": "integer"},
        "audio_base64": {"type": "string"},
        "blendshapes": {"type": "array"},
    },
    "required": ["sequence_number", "timestamp_ms"],
    "additionalProperties": True,
}

# -----------------------------------------------------------------------------
# Orchestrator Registration
# -----------------------------------------------------------------------------

def register_to_orchestrator(max_retries: int = 10, delay: int = 2) -> bool:
    """Register this worker capability with the orchestrator.

    Retries a few times because orchestrator might still be starting up.
    Returns True on success, False otherwise.
    """
    if not ORCH_URL:
        logger.error("ORCH_URL environment variable not set – skipping registration")
        return False

    register_req: Dict[str, Any] = {
        "url": CAPABILITY_URL,
        "name": CAPABILITY_NAME,
        "description": CAPABILITY_DESCRIPTION,
        "capacity": CAPABILITY_CAPACITY,
        "price_per_unit": CAPABILITY_PRICE_PER_UNIT,
        "price_scaling": CAPABILITY_PRICE_SCALING,
    }
    headers = {
        "Authorization": ORCH_SECRET,
        "Content-Type": "application/json",
    }

    logger.info("Attempting capability registration with orchestrator", extra={"payload": register_req})

    for attempt in range(1, max_retries + 1):
        try:
            response = requests.post(
                f"{ORCH_URL}/capability/register",
                json=register_req,
                headers=headers,
                timeout=5,
                verify=False,  # self-signed TLS in dev
            )
            if response.status_code == 200:
                logger.info("Capability successfully registered with orchestrator")
                return True
            elif response.status_code == 400:
                logger.error("Orchestrator rejected registration – check ORCH_SECRET token", extra={"status": 400})
                return False
            else:
                logger.warning("Registration attempt %s returned status %s", attempt, response.status_code)
        except requests.RequestException as exc:
            logger.warning("Registration attempt %s failed: %s", attempt, exc)

        time.sleep(delay)

    logger.error("All registration retries exhausted – giving up")
    return False

# -----------------------------------------------------------------------------
# FastAPI Application
# -----------------------------------------------------------------------------

app = FastAPI(title="NeuroSync BYOC Worker")

# Allow CORS for webapp hitting this worker directly during local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup_event():
    """Register with orchestrator on container start."""
    success = register_to_orchestrator()
    if not success:
        logger.error("Registration failed – continuing to run but orchestrator will not dispatch work")


@app.get("/healthz", status_code=status.HTTP_200_OK)
async def healthz():
    """Simple health probe for orchestrator readiness checks."""
    return {"status": "ok"}


@app.post("/text-echo")
async def text_echo_handler(request: Request):
    """Handles requests for the text-echo capability."""
    logger.info("Received request for /text-echo capability")
    try:
        body = await request.json()
    except json.JSONDecodeError as e:
        logger.warning(f"Invalid JSON payload received at /text-echo: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {e}")

    text_input = body.get("text") # Expect "text" key
    if text_input is None:
        logger.warning("Missing 'text' field in JSON payload at /text-echo")
        raise HTTPException(status_code=400, detail="Missing 'text' field in JSON payload")
    
    if not isinstance(text_input, str):
        logger.warning(f"'text' field is not a string: {type(text_input)}")
        raise HTTPException(status_code=400, detail="'text' field must be a string")

    response_payload = {"echo": f"{text_input}a", "received_at": time.time()}
    logger.info(f"Responding from /text-echo: {response_payload}")
    return JSONResponse(content=response_payload)


@app.post("/v1/vtuber/start")
async def vtuber_start(request: Request):
    """Start a NeuroSync VTuber job – placeholder implementation.

    In production this should call into NeuroSync internal pipeline and stream
    Server-Sent Events or chunked JSON frames.  For now, we validate the request
    and return a dummy streaming sequence to exercise the Livepeer pipeline.
    """
    try:
        body = await request.json()
    except json.JSONDecodeError:
        logger.warning("Invalid JSON payload received at /v1/vtuber/start")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Schema validation
    try:
        validate(instance=body, schema=NEUROSYNC_VTUBER_REQUEST_SCHEMA)
    except ValidationError as ve:
        logger.warning("Validation error: %s", ve)
        raise HTTPException(status_code=400, detail=f"Schema validation error: {ve.message}")

    job_id = body["job_id"]
    character = body["character"]
    logger.info("VTuber job accepted", extra={"job_id": job_id, "character": character})

    async def _stream():  # type: ignore
        import asyncio
        start_time = time.time()
        sequence = 0
        while sequence < 5:  # Dummy 5 frames then stop
            frame = {
                "sequence_number": sequence,
                "timestamp_ms": int((time.time() - start_time) * 1000),
                "job_id": job_id,
                "character": character,
                "debug": "placeholder frame – integrate real blendshapes soon"
            }
            yield (json.dumps(frame) + "\n").encode()
            sequence += 1
            await asyncio.sleep(0.5)
        logger.info("VTuber job finished", extra={"job_id": job_id, "frames": sequence})

    # text/event-stream could be used; orchestrator/gateway supports chunked JSON
    headers = {
        "X-Accel-Buffering": "no",  # disable Nginx buffering when behind proxy
    }
    return StreamingResponse(_stream(), media_type="application/json", headers=headers)


# -----------------------------------------------------------------------------
# Simpler ping/test endpoint for early integration testing
# -----------------------------------------------------------------------------

@app.get("/v1/byoc-test", response_model=dict)
async def byoc_test():
    """Very simple health endpoint to make sure BYOC adapter responds."""
    logger.debug("/v1/byoc-test called")
    return {"message": "BYOC worker is alive!"}


@app.post("/")
async def echo_root(req: Request):
    """
    Livepeer orchestrator will forward exactly the payload the client sent to
    /process/request/<capability_name_if_base_url_registered>.
    This root handler is now distinct from the /text-echo specific handler.
    """
    logger.info("Request to root path / received")
    try:
        body = await req.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    text = body.get("text", "")
    # Differentiate response to avoid confusion if this is hit unexpectedly
    return {"echo_from_root": text, "received_at": time.time(), "message": "This is the root handler, not /text-echo"}


# -----------------------------------------------------------------------------
# CLI entrypoint when executed via `

if __name__ == "__main__":
    import uvicorn

    # Default host/port fallbacks
    host = os.getenv("SERVER_HOST", "0.0.0.0")
    port = SERVER_PORT  # already int via env cast at top

    logger.info(
        "Starting BYOC adapter via uvicorn", extra={"host": host, "port": port}
    )

    # The `factory` style string import ensures reloads work the same whether this file
    # is executed as a script or as a module.  It also avoids potential path issues if
    # the CWD is not /app.
    uvicorn.run("server_adapter:app", host=host, port=port, log_level="info")