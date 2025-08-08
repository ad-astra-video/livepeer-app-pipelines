# Trickle Stream Example (Upside Down)

This minimal pipeline app demonstrates how to use PyTrickle's `TrickleApp` with a simple UpsideDown video effect.

- Frame processor flips video frames vertically (upside down)
- Audio frames are passed through unchanged
- Exposes the full TrickleApp HTTP API

## Endpoints

- POST `/api/stream/start`
- POST `/api/stream/params`
- GET  `/api/stream/status`
- POST `/api/stream/stop`
- GET  `/health`

## Run

```bash
cd trickle-stream-example
docker compose up --build
```

Then start a source and publish using `http-trickle`:

```bash
# Terminal 1: Start trickle server (if not already running)
cd ~/repos/http-trickle && make trickle-server addr=0.0.0.0:3389

# Terminal 2: Start processing via API
curl -X POST http://localhost:8080/api/stream/start \
  -H "Content-Type: application/json" \
  -d '{
    "subscribe_url": "http://127.0.0.1:3389/sample",
    "publish_url": "http://127.0.0.1:3389/sample-output",
    "gateway_request_id": "test",
    "params": {"width": 704, "height": 384}
  }'

# Terminal 3: Publish a file to the trickle server
cd ~/repos/http-trickle && make publisher-ffmpeg \
  in=bbb_sunflower_1080p_30fps_normal.mp4 stream=sample url=http://127.0.0.1:3389

# Terminal 4: View output
cd ~/repos/http-trickle && \
  go run cmd/read2pipe/*.go --url http://127.0.0.1:3389/ --stream sample-output | ffplay -probesize 64 -
```

## Notes

- This example follows the recommended PyTrickle pattern using `TrickleApp`.
- See `comfystream` for a more advanced integration with async pipelines and caching.


