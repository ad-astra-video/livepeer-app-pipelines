# WebRTC app proxy integration with Livepeer BYOC streaming

## Setup
1. Create models folder in `data/models/webrtc-proxy`
2. Copy `.env.worker` to `.env` and update variables to values applicable to the runner
3. Build worker docker image:  `docker build -f Dockerfile.worker -t webtrc-proxy-worker:latest .`

## Launch 
```
#start the runner to communicate with Orchestrator (2 options)
#no runner proxy (runner on same machine as Orchestrator, no https)
docker compose up ai-runner register-worker -d
#with runner proxy (runner connecting over public network to Orchestrator, use https)
docker compose up -d

#now start the webrtc app as specified in sepearate docker compose file.
#  make sure to set networks on webrtc app to:
#    networks:
#      default: byoc-stream
#      external: true

```
