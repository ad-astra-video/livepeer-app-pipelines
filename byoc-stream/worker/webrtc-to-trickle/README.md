# webrtc-to-trickle streaming over Livepeer BYOC infrastructure

## Setup
1. Create models folder in `data/models`
2. Copy `.env.template` to `.env` and update variables to values applicable to the runner
3. Build worker docker image:  `docker build -f Dockerfile.worker -t webrtc-trickle-worker:latest .`

## Launch 
```
#start the runner to communicate with Orchestrator (2 options)
#no runner proxy (runner on same machine as Orchestrator, no https)
docker compose up ai-runner register-worker -d
#with runner proxy (runner connecting over public network to Orchestrator, use https)
docker compose up -d

#start the webrtc enabled app 
```

## Configuration

- Note webrtc-to-trickle example supports webrtc app with websocket signalling.  HTTP signalling would require adding route to example.
- Some code modifications may be needed to handle websocket messages supported by the webrtc app.  See pixel_streaming.py for webrtc specific setup.
- the webrtc app should expose an `/update` url that accepts a POST request to update stream settings. Or a data channel could be added to pixel_streaming.py if preferred.

