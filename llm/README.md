
# Instructions to run sample app with generic container pipeline
 
This is a sample web application that uses livepeer/ai-runner:llm runner container to provide a LLM chat interface  

### Prerequisites

- docker installed and running

- access to an Nvidia GPU or machine to run livepeer/ai-runner:llm container

### Instructions  

1. Pull docker image of go-livepeer with generic pipeline

     `docker pull adastravideo/go-livepeer:dynamic-capabilities`

2) Build the webapp for static file serving (need to have node/npm installed)
    ```
    cd webapp
    npm install
    npm run build
    cd ..
    ```
3) make folders
    ```
    mkdir -p data/models
    mkdir -p data/orchestrator
    mkdir worker
    ```

4) create docker network
    ```
    docker network create byoc
    ```
5) Update the docker-compose.yml file and Orchestrator config
    - Orchestrator
      - update the `-serviceAddr` in `orchestrator` container section to the ip address and port want to use.
      - Change the -ethOrchAddr to your on chain orchestrator if want to test on chain. If not updated you will pay to send tickets to another ethereum account, don't forget to update this.
    - Worker
      - if want to test off chain, update the `CAPABILITY_PRICE_PER_UNIT` in with `worker` container section to `0` and change `-network` to `offchain` in `orchestrator` container section.
      - update the `CAPABILITY_URL` to be the accessible ip address/port or dns name of the worker that the Orchestrator will forward the work request to.
    
