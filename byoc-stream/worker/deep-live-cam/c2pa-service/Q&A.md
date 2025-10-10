# Team Q&A: C2PA Video Authentication Service

## **Q: What exactly does this service do?**
**A:** It's a REST API that signs video segments with tamper-proof signatures and detects if videos have been modified or contain deepfakes. Think of it like a digital notary for videos - each piece gets a cryptographic stamp that proves it's authentic.

## **Q: How do I start using it?**
**A:** Just run these commands:
```bash
docker run -d -p 8000:8000 --name c2pa-server c2pa-verification-server
curl http://localhost:8000/health  # Should return {"status": "healthy"}
```

## **Q: What are the main endpoints I need to know?**
**A:** There are 4 key endpoints:

1. **`POST /sign_segments`** - Upload a video, get back signed segments
2. **`POST /verify_segments`** - Check if segments are authentic  
3. **`POST /update_deepfake_scores`** - Add ML model results
4. **`GET /download/{filename}`** - Download signed files

## **Q: How do I sign a video? What do I send?**
**A:** Send a multipart form with your video file and a JSON manifest:
```bash
curl -X POST http://localhost:8000/sign_segments \
  -F "video=@my_video.mp4" \
  -F "manifest=$(cat example_manifest.json)" \
  -F "segment_duration=10"
```

## **Q: What comes back from signing?**
**A:** You get a JSON response like this:
```json
{
  "success": true,
  "message": "Video signed with 6 segments",
  "video_id": "abc123",
  "manifest_path": "/app/outputs/manifest_abc123.json",
  "total_segments": 6,
  "signed_segments": [
    "/app/outputs/signed_segment_0000.mp4",
    "/app/outputs/signed_segment_0001.mp4"
  ]
}
```

## **Q: How do I verify if a video is authentic?**
**A:** Upload the manifest file and all segment files:
```bash
curl -X POST http://localhost:8000/verify_segments \
  -F "manifest_file=@manifest.json" \
  -F "segments=@segment_0000.mp4" \
  -F "segments=@segment_0001.mp4" \
  -F "deepfake_threshold=0.7"
```

## **Q: What does verification return?**
**A:** A detailed report showing what's authentic and what's not:
```json
{
  "video_id": "abc123",
  "overall_authentic": true,
  "chain_valid": true,
  "total_segments": 6,
  "valid_c2pa_signatures": 6,
  "deepfake_flagged_count": 0,
  "segment_results": [
    {
      "segment_id": 0,
      "c2pa_valid": true,
      "hash_valid": true,
      "deepfake_score": 0.05
    }
  ]
}
```

## **Q: How do I integrate our deepfake detection model?**
**A:** Two ways:

**Option 1 - Update scores after signing:**
```bash
curl -X POST http://localhost:8000/update_deepfake_scores \
  -F "manifest_file=@manifest.json" \
  -F "deepfake_scores=[{\"segment_id\":0,\"score\":0.85,\"model\":\"our_model\"}]"
```

**Option 2 - Include scores during signing:**
```bash
curl -X POST http://localhost:8000/sign_segments \
  -F "video=@video.mp4" \
  -F "manifest=$(cat manifest.json)" \
  -F "deepfake_scores=[{\"segment_id\":0,\"score\":0.05}]"
```

## **Q: What format do deepfake scores need to be in?**
**A:** JSON array with this structure:
```json
[
  {
    "segment_id": 0,
    "score": 0.85,        // 0.0-1.0 (higher = more likely deepfake)
    "model": "your_model_name",
    "confidence": 0.92    // How confident the model is
  }
]
```

## **Q: How do I download the signed files?**
**A:** Use the download endpoint with filenames from the signing response:
```bash
curl http://localhost:8000/download/signed_segment_0000.mp4 -o segment_0000.mp4
curl http://localhost:8000/download/manifest_abc123.json -o manifest.json
```

## **Q: What happens if someone tampers with a segment?**
**A:** The verification will catch it:
- `c2pa_valid: false` if the signature is broken
- `hash_valid: false` if the file content changed
- `chain_valid: false` if segments are reordered/missing
- `overall_authentic: false` for the whole video

## **Q: Can I process multiple videos at once?**
**A:** Each video gets processed individually, but you can run multiple requests in parallel. Each gets a unique `video_id` so they don't interfere.

## **Q: What video formats are supported?**
**A:** The service accepts common formats (MP4, MOV, AVI, MKV, WebM) but converts everything to MP4 internally since that's what the C2PA tools support best.

## **Q: How long do the signed files stay available?**
**A:** They're stored in the container's `/app/outputs` directory. In production, you'd want to mount this to persistent storage or copy files out after processing.

## **Q: What if the service goes down?**
**A:** Check the health endpoint first: `curl http://localhost:8000/health`. If it's unhealthy, the required tools (c2patool, certgen) might not be available. Restart the container.

## **Q: How do I know what threshold to use for deepfake detection?**
**A:** Start with `0.7` (70% confidence). Segments with scores above this get flagged. You can adjust based on your model's performance - lower threshold = more sensitive.

## **Q: Can I see what's inside the manifest files?**
**A:** Yes! They're JSON files containing all the metadata:
```bash
curl http://localhost:8000/download/manifest_abc123.json | jq .
```

## **Q: What's this "hash chain" thing?**
**A:** Each segment's hash includes the previous segment's hash, creating a chain. If someone removes, reorders, or replaces segments, the chain breaks and verification fails.

## **Q: How do I integrate this into our existing pipeline?**
**A:** The service is stateless - just HTTP calls. You can:
1. Sign videos as they're uploaded
2. Store the manifest files in your database
3. Verify videos before playback
4. Update deepfake scores as your ML pipeline processes them