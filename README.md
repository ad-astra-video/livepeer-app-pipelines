# This repo is experimental. Expect many changes and things to be added and deleted

### This repo is a holding place to explore example applications using Livepeer's generic container pipeline.  The generic container pipeline is in active developement and not finalized so please expect things to change as development continues

See the readmes in each folder to setup and run the sample applications.

Some things you will need for both:
- docker image that contains the generic pipeline code: `docker pull adastravideo/go-livepeer:dynamic-capabilities`
  - link to the repo and branch used to build the docker image https://github.com/ad-astra-video/go-livepeer/tree/av-livepeer-external-capabilities
- if want to run on chain an eth address with a deposit and reserve available to sign messages in browser (this may change to a backend api to process the signatures)
  - see docs on funding a Gateway ethereum account https://docs.livepeer.org/gateways/guides/fund-gateway
