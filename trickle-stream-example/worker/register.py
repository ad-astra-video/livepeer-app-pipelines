import os
import time
import logging

import requests


def register_capability_from_env(logger: logging.Logger) -> None:
    """Register this worker capability with the orchestrator if env vars are set."""
    orch_url = os.environ.get("ORCH_URL", "")
    orch_secret = os.environ.get("ORCH_SECRET", "")
    capability_name = os.environ.get("CAPABILITY_NAME", "trickle-stream-example")
    capability_desc = os.environ.get("CAPABILITY_DESCRIPTION", "Upside down trickle processor")
    capability_url = os.environ.get("CAPABILITY_URL", "http://localhost:8080")
    capability_capacity = int(os.environ.get("CAPABILITY_CAPACITY", 1))
    capability_price_per_unit = int(os.environ.get("CAPABILITY_PRICE_PER_UNIT", 0))
    capability_price_scaling = int(os.environ.get("CAPABILITY_PRICE_SCALING", 1))

    if not (orch_url and orch_secret):
        return

    register_req = {
        "url": capability_url,
        "name": capability_name,
        "description": capability_desc,
        "capacity": capability_capacity,
        "price_per_unit": capability_price_per_unit,
        "price_scaling": capability_price_scaling,
    }
    headers = {"Authorization": orch_secret, "Content-Type": "application/json"}
    max_retries = 10
    delay = 2
    logger.info(f"Registering capability: {register_req}")
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.post(
                f"{orch_url}/capability/register",
                json=register_req,
                headers=headers,
                timeout=5,
                verify=False,
            )
            if resp.status_code == 200:
                logger.info("Capability registered")
                break
            elif resp.status_code == 400:
                logger.error("Orchestrator secret incorrect")
                break
            else:
                logger.warning(f"Register attempt {attempt} failed: {resp.status_code} {resp.text}")
        except requests.RequestException:
            if attempt == max_retries:
                logger.error("All registration retries failed.")
            else:
                time.sleep(delay)


