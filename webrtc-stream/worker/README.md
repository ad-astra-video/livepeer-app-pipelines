# WebRTC Media Processor

A Python-based WebRTC server that processes media streams using WHIP/WHEP protocols. The server receives video and audio streams, applies transformations (color flipping for video, pitch shifting for audio), and sends the processed streams back.

## Features

- **Video Processing**: Flips colors from BGR to RGB
- **Audio Processing**: Shifts pitch up by 2 semitones
- **WHIP/WHEP Support**: Standard WebRTC protocols for ingestion and egress
- **Docker Ready**: Containerized deployment with uvicorn
- **Health Monitoring**: Built-in health check endpoints

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Start the service
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Using Docker

```bash
# Build the image
docker build -t webrtc-processor .

# Run the container
docker run -d -p 8080:8080 --name webrtc-processor webrtc-processor

# Check health
curl http://localhost:8080/health
```

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run with uvicorn
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

## API Endpoints

### POST /start
Initiates the WebRTC processing pipeline.

**Response:**
```json
{
  "status": "started",
  "caller_ip": "192.168.1.100"
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "webrtc-processor"
}
```

### GET /
Service information and available endpoints.

## How It Works

1. **WHEP Connection**: Server connects to caller's `/process/worker/whep` endpoint to receive source media streams
2. **Media Processing**: 
   - Video frames are processed to flip colors (BGR → RGB)
   - Audio frames are pitch-shifted up by 2 semitones
3. **WHIP Connection**: Processed streams are sent to caller's `/process/worker/whip` endpoint

## Configuration

### Environment Variables

- `LOG_LEVEL`: Logging level (default: info)
- `PYTHONUNBUFFERED`: Ensure Python output is not buffered

### Docker Configuration

The container runs as a non-root user for security and includes:
- Health checks every 30 seconds
- Automatic restart unless stopped
- Optimized layer caching for faster builds

## Dependencies

- **FastAPI**: Modern web framework for APIs
- **aiortc**: WebRTC implementation for Python
- **OpenCV**: Computer vision library for video processing
- **librosa**: Audio analysis and processing
- **uvicorn**: ASGI server for production deployment

## Monitoring

### Health Checks
```bash
# Docker health check
docker ps

# Manual health check
curl http://localhost:8080/health
```

### Logs
```bash
# Docker Compose
docker-compose logs -f

# Docker
docker logs -f webrtc-processor
```

## Troubleshooting

### Common Issues

1. **Container fails to start**: Check system dependencies and Docker version
2. **WebRTC connection fails**: Verify caller IP and endpoint availability
3. **Audio processing errors**: Ensure proper audio format and sample rates

### Debug Mode

Run with debug logging:
```bash
docker run -e LOG_LEVEL=debug -p 8080:8080 webrtc-processor
```

## Production Deployment

For production use:

1. Use Docker Compose with proper networking
2. Configure reverse proxy (nginx/traefik) for SSL termination
3. Set up monitoring and alerting
4. Configure resource limits and scaling

## License

MIT License - see LICENSE file for details.
