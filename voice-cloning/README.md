
# Instructions to run sample app with generic container pipeline

  

This is a sample web application that uses IndexTTS to clone a voice from a sample input and speak the text input.

  

### Prerequisites

- docker installed and running

- access to an Nvidia GPU

### Instructions  

1. Pull docker image of go-livepeer with generic pipeline

     `docker pull adastravideo/go-livepeer:dynamic-capabilities-2`

2) Build the webapp for static file serving (need to have node/npm installed)
    ```
    cd webapp
    npm install
    npm run build
    cd ..
    ```
3) make folders
    ```
    mkdir -p data/checkpoints
    mkdir -p data/orchestrator
    mkdir -p data/outputs
    mkdir worker
    ```

4) clone the IndexTTS repo
     ```
   cd worker
   git clone https://github.com/index-tts/index-tts.git .
   ```
5) create docker network
    ```
    docker network create byoc
    ```
6) Update the docker-compose.yml file and Orchestrator config
    - update the `-serviceAddr` in `orchestrator` container section to the ip address and port want to use.
    - if want to test off chain, update the `CAPABILITY_PRICE_PER_UNIT` in with `worker` container section to `0` and change `-network` to `offchain` in `orchestrator` container section.
    - Change the -ethOrchAddr to your on chain orchestrator if want to test on chain. If not updated you will pay to send tickets to another ethereum account, don't forget to update this.