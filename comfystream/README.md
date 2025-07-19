
# Instructions to run sample app with generic container pipeline
 
This is a sample web application that uses a custom built container as the worker.  The API is served by a Livepeer Gateway node that handles coordinating with Orchestrator s and managing payments for the compute completed.  

### Prerequisites

- docker installed and running

- access to an Nvidia GPU or machine to run worker.  Note: if want to run on CPU you can change "cuda" in server/server.py to "cpu"

- an Ethereum address wallet json encrypted and copied into data/gateway/keystore

### Environment Configuration

You can configure WHIP and WHEP endpoint URLs using environment variables:

1. Copy the example environment file:
   ```bash
   cd webapp
   cp env.example .env
   ```
2. Edit the `.env` file to set your desired hosts:
   ```
   # WHIP endpoint host (for streaming/publishing) 
   VITE_WHIP_HOST=localhost:5937
   
   # WHEP endpoint host (for viewing/playback)
   VITE_WHEP_HOST=localhost:8890
   ```

   The application will construct the full URLs using these hosts. If neither VITE_WHIP_HOST nor VITE_WHEP_HOST is set, the application will use the current window location.

### Instructions  

1. Pull docker image of go-livepeer with generic pipeline

     `docker pull adastravideo/go-livepeer:dynamic-capabilities-3`

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
    mkdir -p data/gateway
    mkdir worker
    ```

4) create docker network
    ```
    docker network create byoc
    ```
5) Update the docker-compose.yml file and Orchestrator config
    - Gateway
      - update the `-ethPassword` to be the password for the file.
    - Orchestrator
      - update the `-serviceAddr` in `orchestrator` container section to the ip address and port want to use.
      - Change the -ethOrchAddr to your on chain orchestrator if want to test on chain. If not updated you will pay to send tickets to another ethereum account, don't forget to update this.
    - Worker
      - if want to test off chain, update the `CAPABILITY_PRICE_PER_UNIT` in with `worker` container section to `0` and change `-network` to `offchain` in `orchestrator` and `gateway` container section.
      - update the `CAPABILITY_URL` to be the accessible ip address/port or dns name of the worker that the Orchestrator will forward the work request to.
    
