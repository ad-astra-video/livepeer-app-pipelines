# This repo is experimental. Expect many changes and things to be added and deleted

### This repo is a holding place to explore example applications using Livepeer's generic container pipeline.  The generic container pipeline is in active developement and not finalized so please expect things to change as development continues

See the readmes in each folder to setup and run the sample applications.

Some things you will need for both:
- Docker image that contains the generic pipeline code: `docker pull adastravideo/go-livepeer:dynamic-capabilities-2`
  - Link to the repo and branch used to build the docker image https://github.com/ad-astra-video/go-livepeer/tree/av-livepeer-external-capabilities
- If want to run with payments need an eth address with a deposit and reserve available to sign messages in browser or run the gateway (see image-gen sample app docker compose).
  - Will add a simple backend api to run the eth signer on a server soon
  - See docs on funding a Gateway ethereum account https://docs.livepeer.org/gateways/guides/fund-gateway

Notes on interacting with Orchestrator
- Payment is based on time used in seconds including upload/download from the worker
- The orchestrator needs to run behind a reverse proxy (like Caddy) to handle the cross-origin security concerns of the browser.
  - Orchestrator runs with self signed certificates. Will need to use reverse proxy to properly use SSL with accepted certificates.
- There are two routes to get work processed in the worker container:
  - `GET https://{orchestrator service addr}/process/token` should be called first to get ticket parameters
    - `balance` field is returned if there is a balance on the Orchestrator for the capability registered (e.g. voice-clone)
    - The request should include headers:
      - `Livepeer-Job-Eth-Address` that is base64 encoded json
        - The json should be:
              ```
              {
                "addr": "lower case eth address",
                "sig": "hash of personal_sign of the lowercase eth address as the message being signed"
              }
              ```
      - `Livepeer-Job-Capability` with value being the capability registered by the worker (e.g. voice-clone)
        - See example llm app for minimal example of registering worker with Orchestrator in a docker container that runs and exits after registration call is complete
      - response is json:
           ```
           {
             "sender_address":  {"addr": "0x...", "sig": "0x..."},             # this is the same info send in the Livepeer-Job-Eth-Address header
             "ticket_params":  {...},                                          # info needed to create the payment ticket in /process/request
             "balance": "#####",                                               # payment balance for the capability
             "price":  {"price_per_unit": "####", "pixels_per_unit": "####"}   # price info to include as expected_price in the payment ticket
           }
           ```
  - `POST https://{orchestrator service addr}/process/request/{resource sub path}` to request the work from the container
    - The `resource sub path` will be passed through to the worker container.
      - For example, if the worker is a open ai compatible server `/process/request/v1/chat/completions` would call `/v1/chat/completions` route on the worker.
    - The request should include everything in the body of the request that is needed.  The Orchestrator passes the entire request body to the worker.
    - `Livepeer-Payment-Balance` is returned as a header in the response to assist with payment balance tracking.  Requesting a new token from `/process/token` can also be used to track payment balance.
    - The request should include headers:
      - `Livepeer-Job` that is base64 encoded json. See the services/api.ts example apps for how to format the request.
        - The json should be ([example](https://github.com/ad-astra-video/livepeer-app-pipelines/blob/2bcd845a17e9a28c700d4b2bb050ad2eb00f89a6/llm/webapp/src/services/api.ts#L248)):
             ```
             {
               "request": "{"run": "process this"}",     # note this can be anything, but is the base of the signed message proving the sender sent the request
               "parameters": "{}",                       # this is not implemented yet but is included in the signed message proving the sender sent the request
               "capability": "capability name",          # capability name the worker container uses to register to the Orchestrator
               "sender": "0x...",                        # base64 encoded hex, see services/api.ts in example apps for how to pass correct value
               "sig": "0x...",                           # the hash of the request and parameters strings
               "timeout_seconds": 300                    # timeout of request required in seconds
             }
             ```
      - `Livepeer-Job-Payment` this is base64 encoded payment ticket.
        - See services/api.ts in example apps for how to format the ticket
        - If no payment is needed only include `sender` and `expected_price`.  [See example here](https://github.com/ad-astra-video/livepeer-app-pipelines/blob/2bcd845a17e9a28c700d4b2bb050ad2eb00f89a6/llm/webapp/src/services/api.ts#L265)
      - Body of the request with everything needed to complete the work requested (can be json or multipart).  The entire body is passed through, headers from the request are not passed through to the worker.
      - The response is directly passed through from the Orchestrator in response
        - response can by synchronous http or Server Sent Events (SSE) streaming
