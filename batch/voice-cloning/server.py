import os
import logging
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from requests_toolbelt.multipart import decoder
import requests
import json
import io
import shutil
from huggingface_hub import hf_hub_download, snapshot_download

current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)
sys.path.append(os.path.join(current_dir, "indextts"))

#set where to send registration request
ORCH_URL = os.environ.get("ORCH_URL", "")
ORCH_SECRET = os.environ.get("ORCH_SECRET","")
#create registration request
SERVER_PORT = os.environ.get("SERVER_PORT","9876")
CAPABILITY_NAME = os.environ.get("CAPABILITY_NAME", "")
CAPABILITY_URL = os.environ.get("CAPABILITY_URL","http://localhost:9876")
CAPABILITY_DESCRIPTION = os.environ.get("CAPABILITY_DESCRIPTION","")
CAPABILITY_CAPACITY = os.environ.get("CAPABILITY_CAPACITY", 1)
CAPABILITY_PRICE_PER_UNIT = os.environ.get("CAPABILITY_PRICE_PER_UNIT", 0)
CAPABILITY_PRICE_SCALING = os.environ.get("CAPABILITY_PRICE_SCALING", 1)
    
from indextts.infer import IndexTTS
tts = IndexTTS(model_dir="/checkpoints",cfg_path="/checkpoints/config.yaml")

# Get the logger instance
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

def infer(voice, text, output_path=None):
    if not output_path:
        output_path = os.path.join("/outputs", f"spk_{int(time.time())}.wav")
    tts.infer(voice, text, output_path)
    return output_path

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

def check_models_exist():
    #make nested folder to accomodate config.yaml looking for bpe.model in /checkpoints/checkpoints/bpe.model
    folder = "/checkpoints/checkpoints"
    os.makedirs(folder, exist_ok=True)
    #use base folder for downloading models
    folder = "/checkpoints"
    logger.info(f"Using folder: {folder}")

    repo_id = "IndexTeam/Index-TTS"
    try:
        snapshot_download(
            repo_id=repo_id,
            local_dir=folder,
            local_dir_use_symlinks=False  # Ensures actual file copy instead of symlink
        )
        #copy bpe.model to match config.yaml
        shutil.copy("/checkpoints/bpe.model","/checkpoints/checkpoints/bpe.model")
        logger.info(f"Downloaded all model files")
    except Exception as e:
        logger.error(f"Failed to download model files: {e}")

class InferHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        return do_POST(self)
    
    def do_POST(self):
        logger.error(str(self.headers))
        content_type = self.headers.get('content-type')
        content_length = int(self.headers.get('content-length', 0))
        logger.error(content_type)
        logger.error(content_length)
        if content_type and content_type.startswith('multipart/form-data'):
            #get the data
            if self.headers.get("transfer-encoding") == "chunked":
                body_chunks = io.BytesIO()
                while True:
                    chunk = self.rfile.read(4096)
                    
                    if not chunk:
                        break
                    body_chunks.write(chunk)
                body = body_chunks.getvalue()
            elif content_length > 0:
                body = self.rfile.read(content_length)
            
            #parse the multipart data
            multipart_data = decoder.MultipartDecoder(body, content_type)
            
            data = {}
            for part in multipart_data.parts:
                content_disposition = part.headers.get(b'content-disposition').decode('utf-8')
                logger.info(f"parsing part {content_disposition}")
                if 'filename=' in content_disposition:
                    filename = content_disposition.split('filename="')[1].split('"')[0]
                    field_name = content_disposition.split('name="')[1].split('"')[0]
                    data[field_name] = part.content
                    logger.info(f"read {field_name}")
                else:
                    field_name = content_disposition.split('name="')[1].split('"')[0]
                    data[field_name] = part.content.decode('utf-8')
                    logger.info(f"read {field_name}")

            # Process the parsed data
            logger.error(data)
            output_path = infer(data["audio"], data["text"], None)
            
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.end_headers()
            with open(output_path, "rb") as result:
                self.wfile.write(result.read())
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Invalid request')

if __name__ == "__main__":
    check_models_exist()
    registered = register_to_orchestrator()
    if registered:
        #startup server
        port = os.environ.get('SERVER_PORT','9876')
        httpd = HTTPServer(('0.0.0.0', int(port)), InferHandler)
        httpd.serve_forever()
    else:
        print("worker registration failed, worker not starting")
    