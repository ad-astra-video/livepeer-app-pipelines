
## Livepeer-App-Pipelines Overview

This repository contains several example applications demonstrating different use cases for Livepeer's container pipeline infrastructure:

### 📁 `batch/` - Batch Processing Examples
Contains two example applications for batch processing workloads using Livepeer's BYOC infrastructure:

- **`batch/create-a-tall-tale/`** - Text generation application showcasing streaming SSE output of batch workloads with Livepeer BYOC integration
- **`batch/image-gen/`** - Fast image generation application demonstrating 100s of millisecond response times using AI models

### 📁 `byoc-stream/` - Real-time Video AI Processing
A comprehensive real-time video processing application that enables live AI processing on video frames using BYOC streaming. Includes:

- **Gateway & Orchestrator** - Livepeer infrastructure components
- **Web Application** - Main interface for stream management
- **Multiple AI Workers examples**:
  - `frame-skipper/` - Frame skipping optimization for streaming
  - `generate-video/` - Video generation from no input
  - `passthrough/` - Basic passthrough processing pipeline
  - `video-analysis/` - Real-time video analysis capabilities
  - `webrtc-to-trickle/` - Bridge local webrtc enabled apps through Livepeer BYOC for scaling

### 📁 `live-video-to-video/` - Live Video-to-Video Processing
A real-time video processing application focused specifically on video-to-video transformation using AI models through the Livepeer network.

- Complete streaming infrastructure with local testing interface

## Setup Requirements

See the individual README files in each folder for specific setup instructions. Common requirements:

- Docker and Nvidia Container Toolkit installed
- Access to Nvidia GPU for AI processing
- (OPTIONAL) Ethereum address with deposit and reserve for payments (https://docs.livepeer.org/gateways/guides/fund-gateway)
  - use price of 0 if working with unfunded Gateway

Payment for compute is based on time the request takes to complete.  For streaming, the payment is based on time the stream is live.