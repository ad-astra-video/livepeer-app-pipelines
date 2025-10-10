import os
import json
import tempfile
import subprocess
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List
import aiofiles
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ValidationError
import ffmpeg

# Import segment-level authentication modules
from segment_processor import SegmentAuthenticator
from segment_manifest import SegmentChainManifest

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="C2PA Video Signing & Verification Service",
    description="REST API for signing and verifying videos using C2PA with secp256k1 certificates",
    version="1.0.0"
)

# Configuration
UPLOAD_DIR = Path("/app/uploads")
OUTPUT_DIR = Path("/app/outputs") 
CERT_DIR = Path("/app/certs")
TEMP_DIR = Path("/app/temp")

# Ensure directories exist
for directory in [UPLOAD_DIR, OUTPUT_DIR, CERT_DIR, TEMP_DIR]:
    directory.mkdir(exist_ok=True)

# Initialize segment authenticator
segment_authenticator = SegmentAuthenticator(TEMP_DIR, OUTPUT_DIR, CERT_DIR)

class ManifestModel(BaseModel):
    alg: str = "es256k"
    private_key: str = "es256k_private.pem"
    sign_cert: str = "es256k_cert.pem"
    ta_url: str = "http://timestamp.digicert.com"
    claim_generator: str = "TestApp"
    assertions: list[Dict[str, Any]]

class SignResponse(BaseModel):
    success: bool
    message: str
    signed_video_path: Optional[str] = None
    manifest_info: Optional[Dict[str, Any]] = None

class VerifyResponse(BaseModel):
    success: bool
    authentic: bool
    message: str
    certificate_info: Optional[Dict[str, Any]] = None
    manifest_data: Optional[Dict[str, Any]] = None

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check if required tools are available
        subprocess.run(["c2patool", "--version"], check=True, capture_output=True)
        subprocess.run(["certgen", "--help"], check=True, capture_output=True)
        return {"status": "healthy", "message": "All tools are available"}
    except subprocess.CalledProcessError as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unhealthy", "message": "Required tools not available"}
        )

@app.post("/sign", response_model=SignResponse)
async def sign_video(
    video: UploadFile = File(..., description="Video file to sign"),
    manifest: str = Form(..., description="JSON manifest for C2PA signing")
):
    """
    Sign a video file with C2PA metadata using the provided manifest
    """
    try:
        # Validate manifest JSON
        try:
            manifest_data = json.loads(manifest)
            manifest_obj = ManifestModel(**manifest_data)
        except (json.JSONDecodeError, ValidationError) as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid manifest format: {str(e)}"
            )

        # Validate video file - be more flexible with content types
        logger.info(f"Received file: {video.filename}, content_type: {video.content_type}")
        
        # Accept common video file extensions even if content_type is not set correctly
        video_extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']
        is_video_extension = any(video.filename.lower().endswith(ext) for ext in video_extensions)
        is_video_content_type = video.content_type and video.content_type.startswith('video/')
        
        if not (is_video_extension or is_video_content_type):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File must be a video. Received: {video.filename} with content_type: {video.content_type}"
            )

        # Generate unique filenames
        video_id = f"{hash(video.filename)}_{hash(manifest)}"
        input_video_path = TEMP_DIR / f"input_{video_id}.mp4"
        manifest_path = TEMP_DIR / f"manifest_{video_id}.json"
        signed_video_path = OUTPUT_DIR / f"signed_{video_id}.mp4"

        # Save uploaded video
        temp_upload_path = TEMP_DIR / f"upload_{video_id}{Path(video.filename).suffix}"
        async with aiofiles.open(temp_upload_path, 'wb') as f:
            content = await video.read()
            await f.write(content)
        
        # Convert to MP4 if needed (c2patool has limited format support)
        supported_formats = ['.mp4', '.mov']
        if not any(video.filename.lower().endswith(fmt) for fmt in supported_formats):
            logger.info(f"Converting {video.filename} to MP4 for c2patool compatibility")
            import subprocess
            convert_cmd = [
                "ffmpeg", "-i", str(temp_upload_path), 
                "-c:v", "libx264", "-c:a", "aac", 
                "-y", str(input_video_path)
            ]
            result = subprocess.run(convert_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"Video conversion failed: {result.stderr}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to convert video format: {result.stderr}"
                )
            # Clean up original upload
            temp_upload_path.unlink(missing_ok=True)
        else:
            # Just rename if already supported format
            temp_upload_path.rename(input_video_path)

        # Generate certificates if they don't exist
        private_key_path = CERT_DIR / manifest_obj.private_key
        cert_path = CERT_DIR / manifest_obj.sign_cert
        
        if not private_key_path.exists() or not cert_path.exists():
            await generate_certificates(private_key_path, cert_path)

        # Update manifest with correct certificate paths
        manifest_data["private_key"] = str(private_key_path)
        manifest_data["sign_cert"] = str(cert_path)

        # Save manifest file
        async with aiofiles.open(manifest_path, 'w') as f:
            await f.write(json.dumps(manifest_data, indent=2))

        # Sign the video using c2patool
        cmd = [
            "c2patool",
            str(input_video_path),
            "--manifest", str(manifest_path),
            "--output", str(signed_video_path),
            "-f"  # Force overwrite if file exists
        ]

        logger.info(f"Signing video with command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"c2patool failed: {result.stderr}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Video signing failed: {result.stderr}"
            )

        # Clean up temporary files
        input_video_path.unlink(missing_ok=True)
        manifest_path.unlink(missing_ok=True)

        return SignResponse(
            success=True,
            message="Video signed successfully",
            signed_video_path=str(signed_video_path),
            manifest_info=manifest_data
        )

    except Exception as e:
        logger.error(f"Error signing video: {str(e)}")
        # Clean up on error - only if variables exist
        if 'input_video_path' in locals():
            input_video_path.unlink(missing_ok=True)
        if 'manifest_path' in locals():
            manifest_path.unlink(missing_ok=True)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@app.post("/verify", response_model=VerifyResponse)
async def verify_video(
    video: UploadFile = File(..., description="Signed video file to verify")
):
    """
    Verify the authenticity of a signed video file
    """
    try:
        # Validate video file - be more flexible with content types
        logger.info(f"Verifying file: {video.filename}, content_type: {video.content_type}")
        
        # Accept common video file extensions even if content_type is not set correctly
        video_extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']
        is_video_extension = any(video.filename.lower().endswith(ext) for ext in video_extensions)
        is_video_content_type = video.content_type and video.content_type.startswith('video/')
        
        if not (is_video_extension or is_video_content_type):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File must be a video. Received: {video.filename} with content_type: {video.content_type}"
            )

        # Generate unique filename
        video_id = f"{hash(video.filename)}"
        input_video_path = TEMP_DIR / f"verify_{video_id}.mp4"

        # Save uploaded video
        temp_upload_path = TEMP_DIR / f"verify_upload_{video_id}{Path(video.filename).suffix}"
        async with aiofiles.open(temp_upload_path, 'wb') as f:
            content = await video.read()
            await f.write(content)
        
        # Convert to MP4 if needed (c2patool has limited format support)
        supported_formats = ['.mp4', '.mov']
        if not any(video.filename.lower().endswith(fmt) for fmt in supported_formats):
            logger.info(f"Converting {video.filename} to MP4 for c2patool compatibility")
            convert_cmd = [
                "ffmpeg", "-i", str(temp_upload_path), 
                "-c:v", "libx264", "-c:a", "aac", 
                "-y", str(input_video_path)
            ]
            result = subprocess.run(convert_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"Video conversion failed: {result.stderr}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to convert video format: {result.stderr}"
                )
            # Clean up original upload
            temp_upload_path.unlink(missing_ok=True)
        else:
            # Just rename if already supported format
            temp_upload_path.rename(input_video_path)

        # Extract certificate information using c2patool
        cert_cmd = ["c2patool", "--certs", str(input_video_path)]
        cert_result = subprocess.run(cert_cmd, capture_output=True, text=True)

        if cert_result.returncode != 0:
            logger.warning(f"Failed to extract certificates: {cert_result.stderr}")
            return VerifyResponse(
                success=True,
                authentic=False,
                message="No C2PA signature found in video",
                certificate_info=None,
                manifest_data=None
            )

        # Validate certificate using certgen
        validate_cmd = ["certgen", "--validate"]
        validate_result = subprocess.run(
            validate_cmd, 
            input=cert_result.stdout, 
            capture_output=True, 
            text=True
        )

        # Extract manifest information
        manifest_cmd = ["c2patool", str(input_video_path)]
        manifest_result = subprocess.run(manifest_cmd, capture_output=True, text=True)

        # Parse results
        certificate_info = {}
        manifest_data = {}
        authentic = False

        if validate_result.returncode == 0:
            # Parse certificate validation output
            for line in validate_result.stdout.split('\n'):
                if 'Public Key:' in line:
                    certificate_info['public_key'] = line.split('Public Key:')[1].strip()
                elif 'Ethereum Address:' in line:
                    certificate_info['ethereum_address'] = line.split('Ethereum Address:')[1].strip()
            authentic = True

        if manifest_result.returncode == 0:
            try:
                # Try to parse manifest JSON output
                manifest_data = json.loads(manifest_result.stdout)
            except json.JSONDecodeError:
                # If not JSON, store as text
                manifest_data = {"raw_output": manifest_result.stdout}

        # Clean up temporary file
        input_video_path.unlink(missing_ok=True)

        return VerifyResponse(
            success=True,
            authentic=authentic,
            message="Video verification completed" if authentic else "Video signature invalid or not found",
            certificate_info=certificate_info if certificate_info else None,
            manifest_data=manifest_data if manifest_data else None
        )

    except Exception as e:
        logger.error(f"Error verifying video: {str(e)}")
        # Clean up on error
        if 'input_video_path' in locals():
            input_video_path.unlink(missing_ok=True)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@app.get("/download/{filename}")
async def download_signed_video(filename: str):
    """
    Download a signed video file
    """
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type='video/mp4'
    )

@app.post("/sign_segments")
async def sign_video_segments(
    video: UploadFile = File(..., description="Video file to sign with segments"),
    manifest: str = Form(..., description="JSON manifest for C2PA signing"),
    segment_duration: int = Form(10, description="Duration of each segment in seconds"),
    deepfake_scores: Optional[str] = Form(None, description="Optional JSON array of deepfake scores per segment")
):
    """
    Sign a video with segment-level authentication and hash chain.
    
    This endpoint:
    1. Splits the video into segments
    2. Signs each segment individually with C2PA
    3. Creates a cryptographic hash chain linking all segments
    4. Optionally integrates deepfake detection scores
    
    Returns the manifest with segment details and paths to signed segments.
    """
    try:
        # Validate manifest JSON
        try:
            manifest_data = json.loads(manifest)
            manifest_obj = ManifestModel(**manifest_data)
        except (json.JSONDecodeError, ValidationError) as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid manifest format: {str(e)}"
            )
        
        # Parse deepfake scores if provided
        deepfake_data = None
        if deepfake_scores:
            try:
                deepfake_data = json.loads(deepfake_scores)
                if not isinstance(deepfake_data, list):
                    raise ValueError("Deepfake scores must be an array")
            except (json.JSONDecodeError, ValueError) as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid deepfake scores format: {str(e)}"
                )
        
        # Validate video file
        logger.info(f"Received file: {video.filename}, content_type: {video.content_type}")
        
        video_extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']
        is_video_extension = any(video.filename.lower().endswith(ext) for ext in video_extensions)
        is_video_content_type = video.content_type and video.content_type.startswith('video/')
        
        if not (is_video_extension or is_video_content_type):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File must be a video. Received: {video.filename}"
            )
        
        # Generate unique video ID
        video_id = f"{hash(video.filename)}_{hash(manifest)}"
        input_video_path = TEMP_DIR / f"input_{video_id}.mp4"
        
        # Save uploaded video
        temp_upload_path = TEMP_DIR / f"upload_{video_id}{Path(video.filename).suffix}"
        async with aiofiles.open(temp_upload_path, 'wb') as f:
            content = await video.read()
            await f.write(content)
        
        # Convert to MP4 if needed
        supported_formats = ['.mp4', '.mov']
        if not any(video.filename.lower().endswith(fmt) for fmt in supported_formats):
            logger.info(f"Converting {video.filename} to MP4 for c2patool compatibility")
            convert_cmd = [
                "ffmpeg", "-i", str(temp_upload_path), 
                "-c:v", "libx264", "-c:a", "aac", 
                "-y", str(input_video_path)
            ]
            result = subprocess.run(convert_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"Video conversion failed: {result.stderr}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to convert video format: {result.stderr}"
                )
            temp_upload_path.unlink(missing_ok=True)
        else:
            temp_upload_path.rename(input_video_path)
        
        # Generate certificates if they don't exist
        private_key_path = CERT_DIR / manifest_obj.private_key
        cert_path = CERT_DIR / manifest_obj.sign_cert
        
        if not private_key_path.exists() or not cert_path.exists():
            await generate_certificates(private_key_path, cert_path)
        
        # Update manifest with correct certificate paths
        manifest_data["private_key"] = str(private_key_path)
        manifest_data["sign_cert"] = str(cert_path)
        
        # Process and sign video segments
        segment_manifest, signed_segments = await segment_authenticator.process_and_sign_video(
            video_path=input_video_path,
            video_id=video_id,
            segment_duration=segment_duration,
            manifest_template=manifest_data,
            deepfake_scores=deepfake_data
        )
        
        # Save manifest to file
        manifest_output_path = OUTPUT_DIR / f"manifest_{video_id}.json"
        await segment_authenticator.save_manifest(segment_manifest, manifest_output_path)
        
        # Clean up input video
        input_video_path.unlink(missing_ok=True)
        
        return {
            "success": True,
            "message": f"Video signed with {segment_manifest.total_segments} segments",
            "video_id": video_id,
            "manifest_path": str(manifest_output_path),
            "total_segments": segment_manifest.total_segments,
            "segment_duration": segment_duration,
            "master_hash": segment_manifest.master_hash,
            "chain_valid": segment_manifest.chain_valid,
            "signed_segments": [str(p) for p in signed_segments],
            "manifest_stats": segment_manifest.get_segment_statistics()
        }
    
    except Exception as e:
        logger.error(f"Error signing video segments: {str(e)}")
        # Clean up on error
        if 'input_video_path' in locals():
            input_video_path.unlink(missing_ok=True)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@app.post("/verify_segments")
async def verify_video_segments(
    manifest_file: UploadFile = File(..., description="Segment chain manifest JSON file"),
    segments: List[UploadFile] = File(..., description="Signed video segment files"),
    deepfake_threshold: float = Form(0.7, description="Deepfake detection threshold (0.0-1.0)")
):
    """
    Verify video segments using the segment chain manifest.
    
    This endpoint:
    1. Validates the cryptographic hash chain
    2. Verifies C2PA signatures for each segment
    3. Checks file hashes against manifest
    4. Analyzes deepfake detection scores
    5. Provides comprehensive authenticity report
    
    Returns detailed verification report with segment-level results.
    """
    try:
        # Load manifest
        manifest_content = await manifest_file.read()
        segment_manifest = SegmentChainManifest.model_validate_json(manifest_content)
        
        logger.info(f"Verifying {len(segments)} segments for video: {segment_manifest.video_id}")
        
        # Validate segment count matches
        if len(segments) != segment_manifest.total_segments:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Segment count mismatch: expected {segment_manifest.total_segments}, got {len(segments)}"
            )
        
        # Save segments temporarily
        segment_paths = []
        for i, segment in enumerate(segments):
            segment_path = TEMP_DIR / f"verify_seg_{segment_manifest.video_id}_{i:04d}.mp4"
            async with aiofiles.open(segment_path, 'wb') as f:
                content = await segment.read()
                await f.write(content)
            segment_paths.append(segment_path)
        
        # Verify segments
        report = segment_authenticator.verify_segment_chain(
            manifest=segment_manifest,
            segment_paths=segment_paths,
            deepfake_threshold=deepfake_threshold
        )
        
        # Clean up temporary files
        for path in segment_paths:
            path.unlink(missing_ok=True)
        
        return report
    
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid manifest format: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error verifying video segments: {str(e)}")
        # Clean up on error
        if 'segment_paths' in locals():
            for path in segment_paths:
                path.unlink(missing_ok=True)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@app.post("/update_deepfake_scores")
async def update_deepfake_scores(
    manifest_file: UploadFile = File(..., description="Segment chain manifest JSON file"),
    deepfake_scores: str = Form(..., description="JSON array of deepfake scores to update")
):
    """
    Update deepfake scores in an existing segment manifest.
    
    This endpoint allows integration with external deepfake detection pipelines.
    Your deepfake detection team can submit scores after processing segments.
    
    Expected format for deepfake_scores:
    [
        {"segment_id": 0, "score": 0.05, "model": "model_name", "confidence": 0.95},
        {"segment_id": 1, "score": 0.82, "model": "model_name", "confidence": 0.90},
        ...
    ]
    """
    try:
        # Parse deepfake scores
        try:
            scores_data = json.loads(deepfake_scores)
            if not isinstance(scores_data, list):
                raise ValueError("Deepfake scores must be an array")
        except (json.JSONDecodeError, ValueError) as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid deepfake scores format: {str(e)}"
            )
        
        # Load manifest
        manifest_content = await manifest_file.read()
        segment_manifest = SegmentChainManifest.model_validate_json(manifest_content)
        
        # Update scores
        updated_count = 0
        for score_entry in scores_data:
            segment_id = score_entry.get('segment_id')
            if segment_id is not None and segment_id < len(segment_manifest.segments):
                segment = segment_manifest.segments[segment_id]
                segment.deepfake_score = score_entry.get('score')
                segment.deepfake_model = score_entry.get('model', 'unknown')
                segment.deepfake_confidence = score_entry.get('confidence')
                updated_count += 1
        
        # Save updated manifest
        manifest_output_path = OUTPUT_DIR / f"manifest_{segment_manifest.video_id}_updated.json"
        await segment_authenticator.save_manifest(segment_manifest, manifest_output_path)
        
        # Get flagged segments
        flagged = segment_manifest.get_deepfake_flagged_segments()
        
        return {
            "success": True,
            "message": f"Updated deepfake scores for {updated_count} segments",
            "video_id": segment_manifest.video_id,
            "updated_manifest_path": str(manifest_output_path),
            "flagged_segments": flagged,
            "flagged_count": len(flagged),
            "statistics": segment_manifest.get_segment_statistics()
        }
    
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid manifest format: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error updating deepfake scores: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

async def generate_certificates(private_key_path: Path, cert_path: Path):
    """
    Generate secp256k1 certificates using certgen tool
    """
    try:
        # Change to cert directory for generation
        original_cwd = os.getcwd()
        os.chdir(CERT_DIR)
        
        # Run certgen to generate certificates
        result = subprocess.run(["certgen"], capture_output=True, text=True, cwd=str(CERT_DIR))
        
        if result.returncode != 0:
            logger.error(f"Certificate generation failed: {result.stderr}")
            raise Exception(f"Failed to generate certificates: {result.stderr}")
        
        # Verify certificates were created
        if not private_key_path.exists() or not cert_path.exists():
            raise Exception("Certificate files were not created")
        
        # Check if files have content
        if private_key_path.stat().st_size == 0 or cert_path.stat().st_size == 0:
            logger.warning("Certificate files are empty, regenerating...")
            # Remove empty files
            private_key_path.unlink(missing_ok=True)
            cert_path.unlink(missing_ok=True)
            
            # Try again
            result = subprocess.run(["certgen"], capture_output=True, text=True, cwd=str(CERT_DIR))
            if result.returncode != 0:
                raise Exception(f"Failed to regenerate certificates: {result.stderr}")
            
            if not private_key_path.exists() or not cert_path.exists():
                raise Exception("Certificate files were not created on retry")
            
        logger.info("Certificates generated successfully")
        
    finally:
        os.chdir(original_cwd)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
