To run vtuber add these lines to the `environment` of the ai-runner:
  ```
  - SIGNALING_WEBSERVER_URL=ws://vtuber-unreal-signaling:8080
  - GAME_UPDATER_URL=http://vtuber-unreal-game:9877/scripts/execute
  - VTUBER_SESSION_DIR=./data
  ```