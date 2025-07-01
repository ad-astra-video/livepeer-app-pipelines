#!/bin/bash

# Build and run the Docker container
echo "Building WebRTC Processor Docker image..."
docker build -t webrtc-processor .

echo "Starting WebRTC Processor container..."
docker run -d \
  --name webrtc-processor \
  -p 8080:8080 \
  --restart unless-stopped \
  webrtc-processor

echo "Container started! Check status with: docker ps"
echo "View logs with: docker logs webrtc-processor"
echo "Health check: curl http://localhost:8080/health"
