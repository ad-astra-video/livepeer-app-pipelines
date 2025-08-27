import os
import logging
import sys
import time
import requests
import json

#set where to send registration request
ORCH_URL = os.environ.get("ORCH_URL", "")
ORCH_SECRET = os.environ.get("ORCH_SECRET","")
#create registration request
CAPABILITY_NAME = os.environ.get("CAPABILITY_NAME", "")
CAPABILITY_URL = os.environ.get("CAPABILITY_URL","http://localhost:9876")
CAPABILITY_DESCRIPTION = os.environ.get("CAPABILITY_DESCRIPTION","")
CAPABILITY_CAPACITY = os.environ.get("CAPABILITY_CAPACITY", 1)
CAPABILITY_PRICE_PER_UNIT = os.environ.get("CAPABILITY_PRICE_PER_UNIT", 0)
CAPABILITY_PRICE_SCALING = os.environ.get("CAPABILITY_PRICE_SCALING", 1)

# Get the logger instance
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

def register_to_orchestrator():
    
    register_req = {
        "url": CAPABILITY_URL,
        "name": CAPABILITY_NAME,
        "description": CAPABILITY_DESCRIPTION,
        "capacity": int(CAPABILITY_CAPACITY),
        "price_per_unit": int(CAPABILITY_PRICE_PER_UNIT),
        "price_scaling": int(CAPABILITY_PRICE_SCALING)
    }
    headers = {
        "Authorization": ORCH_SECRET,
        "Content-Type": "application/json",
    }
    #do the registration
    max_retries = 10
    delay = 2  # seconds
    logger.info("registering: "+json.dumps(register_req))
    for attempt in range(1, max_retries + 1):
        try:
            response = requests.post(ORCH_URL+"/capability/register", json=register_req, headers=headers, timeout=5, verify=False)  # You can change to POST or other method
            if response.status_code == 200:
                logger.info("Capability registered")
                return True
            elif response.status_code == 400:
                logger.error("orch secret incorrect")
                return False
            else:
                logger.info(f"Attempt {attempt} failed: {e}")
        except requests.RequestException as e:
            if attempt == max_retries:
                logger.error("All retries failed.")
            else:
                time.sleep(delay)

if __name__ == "__main__":
    registered = register_to_orchestrator()
    if registered:
        #startup server
        print("worker registration completed")
    else:
        print("worker registration failed, worker not starting")
    