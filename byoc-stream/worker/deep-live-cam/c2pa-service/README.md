# C2PA Video Segment Authentication System

A containerized solution for video segment authentication using C2PA signatures with integrated deepfake detection capabilities.

## Quick Start

### 1. Build and Run the Container

```bash
# Build the Docker image
docker build -t c2pa-video-auth .

# Run the container
docker run -d -p 8000:8000 --name c2pa-verification-server c2pa-verification-server
# Check if the service is running
curl http://localhost:8000/health
```

### 2. Test the System

```bash
# Run the basic test
python3 test_segments.py

# Run the comprehensive pipeline test
python3 test_verification.py
```

## API Endpoints

### Health Check
```bash
GET /health
```
Returns service status and tool availability.

### Sign Video Segments
```bash
POST /sign_segments
```
**Parameters:**
- `video`: Video file (multipart/form-data)
- `manifest`: C2PA manifest JSON (form field)
- `segment_duration`: Duration per segment in seconds (default: 10)
- `deepfake_scores`: Optional JSON array of deepfake scores

**Example:**
```bash
curl -X POST http://localhost:8000/sign_segments \
  -F "video=@output_video-v3.mp4" \
  -F "manifest={\"alg\":\"es256k\",\"private_key\":\"es256k_private.pem\",\"sign_cert\":\"es256k_cert.pem\",\"ta_url\":\"http://timestamp.digicert.com\",\"claim_generator\":\"TestApp\",\"assertions\":[]}" \
  -F "segment_duration=2"
```

### Update Deepfake Scores
```bash
POST /update_deepfake_scores
```
**Parameters:**
- `manifest_file`: Segment manifest JSON file
- `deepfake_scores`: JSON array of score updates

**Example:**
```bash
curl -X POST http://localhost:8000/update_deepfake_scores \
  -F "manifest_file=@manifest.json" \
  -F "deepfake_scores=[{\"segment_id\":0,\"score\":0.05,\"model\":\"your_model\",\"confidence\":0.95}]"
```

### Verify Segments
```bash
POST /verify_segments
```
**Parameters:**
- `manifest_file`: Segment manifest JSON file
- `segments`: Multiple segment video files
- `deepfake_threshold`: Threshold for flagging (default: 0.7)

### Download Files
```bash
GET /download/{filename}
```
Download signed segments or manifest files.

**Examples:**
```bash
# Download a signed segment
curl http://localhost:8000/download/signed_segment_0000.mp4 -o segment_0000.mp4

# Download manifest
curl http://localhost:8000/download/manifest_VIDEO_ID.json -o manifest.json
```

## Deepfake Integration

### For Your Team's Model Integration

1. **Implement the Interface:**
```python
from segment_processor import DeepfakeIntegrationInterface

class YourDeepfakeDetector(DeepfakeIntegrationInterface):
    async def analyze_segments(self, segment_paths):
        results = []
        for i, path in enumerate(segment_paths):
            # Your model inference here
            score = your_model.predict(path)
            results.append({
                "segment_id": i,
                "score": score,  # 0.0-1.0 (higher = more likely deepfake)
                "confidence": confidence,
                "model": "your_model_name"
            })
        return results
```

2. **Integrate with the System:**
```python
from segment_processor import SegmentAuthenticator

authenticator = SegmentAuthenticator(temp_dir, output_dir, cert_dir)
authenticator.set_deepfake_interface(YourDeepfakeDetector())
```

### Expected Score Format
```json
[
  {
    "segment_id": 0,
    "score": 0.05,
    "model": "your_model_name",
    "confidence": 0.95,
    "metadata": {...}
  }
]
```

## Architecture

- **Video Segmentation**: FFmpeg splits videos into time-based segments
- **C2PA Signing**: Each segment gets individual C2PA signatures
- **Hash Chain**: Cryptographic chain links all segments for tamper detection
- **Deepfake Detection**: Modular interface for plugging in ML models
- **Verification**: Multi-layered validation (signatures + hashes + deepfake scores)

## Files Structure

```
├── main_legacy.py              # FastAPI server with endpoints
├── segment_processor.py        # Core segment processing logic
├── segment_manifest.py         # Data models for manifests
├── deepfake_integration_example.py  # Example deepfake integration
├── test_segments.py            # Basic endpoint tests
├── test_verification.py        # Comprehensive pipeline test
├── Dockerfile                  # Container build configuration
├── requirements.txt            # Python dependencies
└── example_*.json             # Sample data files
```

## Container Details

The Docker container includes:
- **c2patool**: C2PA signing and verification
- **certgen**: secp256k1 certificate generation  
- **FFmpeg**: Video processing and segmentation
- **FastAPI**: REST API server
- **Python environment**: All required dependencies

## Testing Results

✅ **Successfully Tested:**
- Video segmentation (6 segments from test video)
- C2PA signature generation and verification
- Cryptographic hash chain validation
- Deepfake score integration and updates
- File download endpoints
- Modular deepfake detection interface

🔌 **Ready for Integration:**
- Your team can implement `DeepfakeIntegrationInterface`
- Async processing support for ML models
- Batch processing capabilities
- Custom metadata and confidence scores
