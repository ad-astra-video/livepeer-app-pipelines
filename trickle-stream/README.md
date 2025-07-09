# Trickle Stream

This is a standalone stream pipeline for trickle communication streaming, based on the comfystream architecture. It provides specialized functionality for handling trickle streams with WebRTC and HTTP streaming capabilities as part of the Livepeer app pipelines ecosystem.

## Overview

This stream pipeline integrates the comfystream `app.py` directly to leverage its built-in trickle functionality:

- **Trickle API Routes**: Provides trickle-specific API endpoints for stream management
- **WebRTC Support**: Full WebRTC signaling and media processing capabilities
- **HTTP Streaming**: HTTP-based streaming routes for broader compatibility
- **Pipeline Processing**: ComfyUI-based processing pipeline for video/audio transformation
- **Metrics and Monitoring**: Built-in metrics collection and health monitoring

## Key Features

### Trickle Integration
- Automatic setup of trickle routes via `setup_trickle_routes()`
- Proper cleanup of trickle streams on shutdown
- Integration with existing WebRTC infrastructure

### WebRTC Capabilities
- Full WebRTC signaling support (`/offer` endpoint)
- Dynamic prompt updates via control channel
- Resolution adjustment support
- Audio and video track processing

### HTTP Streaming
- HTTP-based streaming routes for clients that don't support WebRTC
- Frame buffer integration for efficient frame delivery
- CORS support for cross-origin requests

## Architecture

This stream pipeline uses the comfystream `app.py` as its main application, which provides:

1. **Pipeline Processing**: ComfyUI-based processing pipeline
2. **Media Streaming**: Both WebRTC and HTTP streaming support
3. **Trickle Communication**: Built-in trickle API functionality
4. **Metrics**: Prometheus metrics for monitoring

## Configuration

### Environment Variables
- `TWILIO_ACCOUNT_SID`: Twilio account SID for TURN servers
- `TWILIO_AUTH_TOKEN`: Twilio auth token for TURN servers

### Command Line Arguments
The worker supports various command line arguments:
- `--port`: Signaling port (default: 8889)
- `--host`: Host address (default: 0.0.0.0)
- `--workspace`: ComfyUI workspace path
- `--warm-pipeline`: Enable pipeline warming on startup
- `--log-level`: Logging level (INFO, DEBUG, etc.)
- `--monitor`: Enable Prometheus metrics endpoint

## Building and Running

### Docker Build
```bash
docker build -f Dockerfile.worker -t trickle-stream .
```

### Docker Run
```bash
docker run -p 8889:8889 \
  -v /path/to/workspace:/workspace/comfystream \
  -e TWILIO_ACCOUNT_SID=your_sid \
  -e TWILIO_AUTH_TOKEN=your_token \
  trickle-stream
```

## API Endpoints

### WebRTC Signaling
- `POST /offer`: WebRTC offer/answer exchange
- `POST /prompt`: Update processing prompts

### Trickle API
- Trickle-specific endpoints (provided by trickle-api module)

### HTTP Streaming
- HTTP streaming routes (provided by http_streaming module)

### Health and Monitoring
- `GET /health`: Health check endpoint
- `GET /metrics`: Prometheus metrics (if monitoring enabled)
- `GET /streams/stats`: Stream statistics

## Differences from WebRTC Stream

This trickle stream differs from the standard webrtc-stream in several ways:

1. **Direct App.py Usage**: Uses comfystream's `app.py` directly instead of a custom FastAPI application
2. **Trickle Integration**: Built-in trickle communication support
3. **Pipeline Processing**: Leverages ComfyUI for advanced video/audio processing
4. **Broader Protocol Support**: Supports both WebRTC and HTTP streaming
5. **Advanced Features**: Includes features like dynamic resolution adjustment and prompt updates

## Use Cases

- **Trickle Streaming**: Applications requiring trickle-based streaming protocols
- **Advanced Processing**: Scenarios needing ComfyUI-based processing pipelines
- **Hybrid Streaming**: Applications that need both WebRTC and HTTP streaming support
- **Real-time AI**: Real-time AI processing with dynamic parameter adjustment

## Monitoring

This stream pipeline includes comprehensive monitoring capabilities:
- Prometheus metrics for stream statistics
- Health check endpoints
- FPS monitoring per stream
- Connection state tracking

## Troubleshooting

### Common Issues
1. **Pipeline Warming**: Use `--warm-pipeline` flag for faster startup
2. **TURN Servers**: Configure Twilio credentials for better connectivity
3. **Workspace Path**: Ensure the workspace path is correctly mounted
4. **Port Conflicts**: Check that port 8889 is available

### Logs
This stream pipeline provides detailed logging at various levels:
- INFO: General operational information
- DEBUG: Detailed debugging information
- ERROR: Error conditions and exceptions

## Integration

This stream pipeline is designed to integrate with:
- Livepeer's orchestration system
- ComfyUI workflows
- Trickle streaming infrastructure
- Prometheus monitoring systems 