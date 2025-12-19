# Livepeer multipart parser example in Python
# Submits multiple transcode requests (segments 0–10) and writes each rendition to its own file
# Requires: pip install requests requests_toolbelt

import requests
from requests_toolbelt import MultipartDecoder
import json
import os
import base64
import threading
import time

# parses header attributes; there might be a built-in way to do this
def attrs(hdr):
    tbl = {}
    for x in hdr.decode('utf-8').split(';'):
        xs = x.split('=')
        val = '' if len(xs) == 1 else xs[1].strip('"').strip()
        tbl[xs[0].strip()] = val
    return tbl

# static job configuration
ai_job_params = {
    "enable_video_ingress": True,
    "enable_video_egress": False,
    "enable_data_output": True
}
ai_job_params_str = json.dumps(ai_job_params)

transcode_config = {
    "manifestID": "11223344",
    "profiles":   [
        {"name": "240p-test", "width": 320, "height": 240, "bitrate": 1000000, "fps": 30, "fpsDen": 1, "profile": "H264Baseline", "gop": "2.5"}
    ],
    "aiParams": {
        "capability": "video-understanding",
        "parameters": ai_job_params_str,
        "request": "{}",
        "timeout_seconds": 60,
        "stream_id": "11223344",
        "params": json.dumps({"modality": "audio", "correction_enabled": False, "audio_window_s": 2.0})
    }
}
tsc_str = json.dumps(transcode_config)

headers = {
    'Accept': 'multipart/mixed',
    'Content-Duration': '2000',
    'Livepeer-Transcode-Configuration': tsc_str
}

sse_running = False
def listen_sse(url):
    url = url.replace("https://192.168.1.15.sslip.io:8088/gateway", "http://localhost:5937")
    print(f"\n=== Subscribing to SSE: {url} ===")
    try:
        with requests.get(url, stream=True, headers={"Accept": "text/event-stream"}) as r:
            print(r.status_code)
            r.raise_for_status()
            for line in r.iter_lines(decode_unicode=True):
                if not line:
                    continue
                # Standard SSE payload
                if line.startswith("data:"):
                    data = line[len("data:"):].strip()
                    print(f"[SSE] {data}")
    except Exception as e:
        print(f"SSE subscription failed: {e}")

# Loop through 0–10 and process each segment
for i in range(0, 11):
    seg_name = f"source/source_{i:03d}.ts"
    if not os.path.exists(seg_name):
        print(f"Skipping missing segment: {seg_name}")
        continue

    print(f"\n=== Sending segment {seg_name} ===")
    with open(seg_name, "rb") as f:
        payload = f.read()

    try:
        r = requests.post(f"http://localhost:5937/live2/test/{i}.ts", data=payload, headers=headers)
    except Exception as e:
        print(f"Request failed for {seg_name}: {e}")
        continue

    ai_stream_urls = {}
    print("request headers to gateway")
    print(headers)
    
    stream_hdr = r.headers.get("X-AI-Stream-Urls", "")
    if stream_hdr != "":
        decoded = base64.b64decode(stream_hdr).decode("utf-8")
        ai_stream_urls = json.loads(decoded)
        print("AI Stream Urls")
        print(str(ai_stream_urls))
        
    content_type = r.headers.get("Content-Type", "")
    if content_type.startswith("text/plain"):
        #print(r.text)
        continue

    # write raw response (optional)
    with open(f"transcode-result-{i}", "wb") as f:
        f.write(r.content)

    # parse multipart response
    try:
        decoded = MultipartDecoder.from_response(r)
    except Exception as e:
        print(f"Failed to decode multipart for {seg_name}: {e}")
        continue

    for part in decoded.parts:
        disposition = part.headers.get(b'content-disposition', b'')
        filename = attrs(disposition).get('filename', f"segment{i}_unknown.bin")
        output_name = f"{i}_{filename}"

        with open(output_name, 'wb') as f:
            f.write(part.content)
        print(f"Saved rendition: {output_name}")

    if not sse_running:
        if not "data_url" in ai_stream_urls:
            print("no data url to connect to")
            continue
        
        data_url = ai_stream_urls["data_url"]
        t = threading.Thread(
            target=listen_sse,
            args=(data_url,),
            daemon=True,  # dies with main process
        )
        t.start()
        sse_running = True
     
    #sleep a bit to simulate live stream
    time.sleep(1.5)