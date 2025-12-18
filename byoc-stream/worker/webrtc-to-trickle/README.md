# VTUBER integration with Livepeer BYOC streaming

## Setup
1. Create models folder in `data/models/vtuber`
2. Copy `.env.worker` to `.env` and update variables to values applicable to the runner
3. Build worker docker image:  `docker build -f Dockerfile.worker -t vtuber-worker:latest .`

## Launch 
```
#start the runner to communicate with Orchestrator (2 options)
#no runner proxy (runner on same machine as Orchestrator, no https)
docker compose up ai-runner register-worker -d
#with runner proxy (runner connecting over public network to Orchestrator, use https)
docker compose up -d

#start vtuber services
docker compose -f docker-compose.unreal.yml up -d
```

To run vtuber add these lines to the `environment` of the ai-runner:
  ```
  - SIGNALING_WEBSERVER_URL=ws://vtuber-unreal-signaling:8080
  - GAME_UPDATER_URL=http://vtuber-unreal-game:9877/scripts/execute
  - VTUBER_SESSION_DIR=./data
  ```