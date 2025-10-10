"""
Segment-level Video Authentication Processor

This module handles segmentation of videos, C2PA signing of individual segments,
and verification of segment chains with deepfake detection integration.
"""

import asyncio
import hashlib
import json
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import aiofiles
import ffmpeg

from segment_manifest import (
    SegmentChainManifest, 
    SegmentInfo, 
    VerificationReport, 
    SegmentVerificationResult
)

logger = logging.getLogger(__name__)


class DeepfakeIntegrationInterface:
    """
    Interface for integrating external deepfake detection models.
    
    This provides a modular way for your team to plug in their deepfake detection pipeline.
    """
    
    async def analyze_segments(self, segment_paths: List[Path]) -> List[Dict[str, Any]]:
        """
        Analyze video segments for deepfake detection.
        
        Args:
            segment_paths: List of paths to video segment files
            
        Returns:
            List of deepfake analysis results in format:
            [
                {
                    "segment_id": 0,
                    "score": 0.05,
                    "confidence": 0.95,
                    "model": "your_model_name",
                    "metadata": {...}  # Any additional data your model provides
                },
                ...
            ]
        """
        # This is a placeholder - your team will implement the actual detection logic
        logger.info(f"Analyzing {len(segment_paths)} segments for deepfake detection")
        
        # Placeholder implementation - replace with your actual model
        results = []
        for i, segment_path in enumerate(segment_paths):
            # Your deepfake model would process the segment here
            results.append({
                "segment_id": i,
                "score": 0.1,  # Placeholder low score (authentic)
                "confidence": 0.9,
                "model": "placeholder_model",
                "metadata": {
                    "processing_time_ms": 100,
                    "frame_count": 300,
                    "resolution": "1920x1080"
                }
            })
        
        return results
    
    def validate_score_format(self, scores: List[Dict[str, Any]]) -> bool:
        """Validate that deepfake scores are in the expected format"""
        required_fields = ["segment_id", "score"]
        
        for score_entry in scores:
            if not isinstance(score_entry, dict):
                return False
            
            for field in required_fields:
                if field not in score_entry:
                    return False
            
            # Validate score is between 0 and 1
            score = score_entry.get("score")
            if not isinstance(score, (int, float)) or not (0 <= score <= 1):
                return False
        
        return True


class SegmentAuthenticator:
    """
    Main class for handling video segment authentication with C2PA and deepfake detection.
    """
    
    def __init__(self, temp_dir: Path, output_dir: Path, cert_dir: Path):
        self.temp_dir = temp_dir
        self.output_dir = output_dir
        self.cert_dir = cert_dir
        
        # Initialize deepfake integration interface
        self.deepfake_interface = DeepfakeIntegrationInterface()
        
        # Ensure directories exist
        for directory in [self.temp_dir, self.output_dir, self.cert_dir]:
            directory.mkdir(exist_ok=True)
    
    def set_deepfake_interface(self, interface: DeepfakeIntegrationInterface):
        """
        Set a custom deepfake detection interface.
        
        Your team can create a subclass of DeepfakeIntegrationInterface
        and set it here to integrate your deepfake detection model.
        """
        self.deepfake_interface = interface
    
    async def segment_video(self, video_path: Path, segment_duration: int, video_id: str) -> List[Path]:
        """
        Split video into segments using FFmpeg.
        
        Args:
            video_path: Path to input video
            segment_duration: Duration of each segment in seconds
            video_id: Unique identifier for the video
            
        Returns:
            List of paths to created segment files
        """
        logger.info(f"Segmenting video {video_path} into {segment_duration}s segments")
        
        # Create segments directory
        segments_dir = self.temp_dir / f"segments_{video_id}"
        segments_dir.mkdir(exist_ok=True)
        
        # Use FFmpeg to segment the video
        segment_pattern = str(segments_dir / f"segment_%04d.mp4")
        
        try:
            # Run FFmpeg segmentation
            cmd = [
                "ffmpeg",
                "-i", str(video_path),
                "-c", "copy",  # Copy streams without re-encoding for speed
                "-f", "segment",
                "-segment_time", str(segment_duration),
                "-segment_format", "mp4",
                "-reset_timestamps", "1",
                "-y",  # Overwrite existing files
                segment_pattern
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error(f"FFmpeg segmentation failed: {result.stderr}")
                raise Exception(f"Video segmentation failed: {result.stderr}")
            
            # Find all created segment files
            segment_files = sorted(segments_dir.glob("segment_*.mp4"))
            logger.info(f"Created {len(segment_files)} segments")
            
            return segment_files
            
        except Exception as e:
            logger.error(f"Error during video segmentation: {e}")
            raise
    
    def calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of a file"""
        hash_sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    
    async def sign_segment(self, segment_path: Path, manifest_template: Dict[str, Any], 
                          segment_id: int, output_path: Path) -> str:
        """
        Sign a single video segment with C2PA.
        
        Args:
            segment_path: Path to the segment file
            manifest_template: C2PA manifest template
            segment_id: Segment identifier
            output_path: Where to save the signed segment
            
        Returns:
            C2PA signature information
        """
        logger.debug(f"Signing segment {segment_id}: {segment_path}")
        
        # Create segment-specific manifest
        segment_manifest = manifest_template.copy()
        segment_manifest["assertions"] = [
            {
                "label": "c2pa.actions",
                "data": {
                    "actions": [
                        {
                            "action": "c2pa.created",
                            "when": "2024-01-01T00:00:00Z",
                            "softwareAgent": "Video Segment Authenticator v1.0",
                            "parameters": {
                                "segment_id": segment_id,
                                "segment_file": str(segment_path.name)
                            }
                        }
                    ]
                }
            }
        ]
        
        # Save manifest to temporary file
        manifest_path = self.temp_dir / f"manifest_seg_{segment_id}.json"
        async with aiofiles.open(manifest_path, 'w') as f:
            await f.write(json.dumps(segment_manifest, indent=2))
        
        # Sign the segment using c2patool
        cmd = [
            "c2patool",
            str(segment_path),
            "--manifest", str(manifest_path),
            "--output", str(output_path),
            "-f"  # Force overwrite
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"c2patool failed for segment {segment_id}: {result.stderr}")
            raise Exception(f"Segment signing failed: {result.stderr}")
        
        # Clean up manifest file
        manifest_path.unlink(missing_ok=True)
        
        return f"c2pa_signature_segment_{segment_id}"
    
    async def process_and_sign_video(self, video_path: Path, video_id: str, 
                                   segment_duration: int, manifest_template: Dict[str, Any],
                                   deepfake_scores: Optional[List[Dict[str, Any]]] = None) -> Tuple[SegmentChainManifest, List[Path]]:
        """
        Process a video by segmenting it and signing each segment with C2PA.
        
        Args:
            video_path: Path to input video
            video_id: Unique identifier for the video
            segment_duration: Duration of each segment in seconds
            manifest_template: C2PA manifest template
            deepfake_scores: Optional pre-computed deepfake scores
            
        Returns:
            Tuple of (segment manifest, list of signed segment paths)
        """
        logger.info(f"Processing video {video_id} with {segment_duration}s segments")
        
        try:
            # Step 1: Segment the video
            segment_files = await self.segment_video(video_path, segment_duration, video_id)
            
            # Step 2: Get video duration for manifest
            probe = ffmpeg.probe(str(video_path))
            video_duration = float(probe['streams'][0]['duration'])
            
            # Step 3: Run deepfake detection if not provided
            if deepfake_scores is None:
                logger.info("Running deepfake detection on segments")
                deepfake_scores = await self.deepfake_interface.analyze_segments(segment_files)
            else:
                logger.info("Using provided deepfake scores")
                if not self.deepfake_interface.validate_score_format(deepfake_scores):
                    raise ValueError("Invalid deepfake scores format")
            
            # Step 4: Create segment info objects and sign segments
            segments = []
            signed_segment_paths = []
            previous_hash = None
            
            for i, segment_file in enumerate(segment_files):
                # Calculate segment timing
                start_time = i * segment_duration
                end_time = min((i + 1) * segment_duration, video_duration)
                actual_duration = end_time - start_time
                
                # Calculate file hash
                file_hash = self.calculate_file_hash(segment_file)
                
                # Create signed segment path
                signed_segment_path = self.output_dir / f"signed_segment_{i:04d}.mp4"
                
                # Sign the segment
                c2pa_signature = await self.sign_segment(
                    segment_file, manifest_template, i, signed_segment_path
                )
                
                # Find corresponding deepfake score
                deepfake_data = next(
                    (score for score in deepfake_scores if score.get("segment_id") == i),
                    {}
                )
                
                # Create segment info
                segment_info = SegmentInfo(
                    segment_id=i,
                    start_time=start_time,
                    end_time=end_time,
                    duration=actual_duration,
                    file_path=str(signed_segment_path),
                    file_hash=file_hash,
                    c2pa_signature=c2pa_signature,
                    previous_hash=previous_hash,
                    deepfake_score=deepfake_data.get("score"),
                    deepfake_model=deepfake_data.get("model"),
                    deepfake_confidence=deepfake_data.get("confidence"),
                    deepfake_metadata=deepfake_data.get("metadata")
                )
                
                segments.append(segment_info)
                signed_segment_paths.append(signed_segment_path)
                previous_hash = file_hash
            
            # Step 5: Create manifest
            manifest = SegmentChainManifest(
                video_id=video_id,
                original_filename=video_path.name,
                total_segments=len(segments),
                segment_duration=segment_duration,
                total_duration=video_duration,
                master_hash="",  # Will be calculated
                chain_valid=False,  # Will be validated
                segments=segments,
                c2pa_manifest_template=manifest_template
            )
            
            # Step 6: Calculate master hash and validate chain
            manifest.master_hash = manifest.calculate_master_hash()
            manifest.chain_valid = manifest.validate_chain()
            
            # Clean up temporary segment files
            for segment_file in segment_files:
                segment_file.unlink(missing_ok=True)
            
            # Clean up segments directory
            segments_dir = self.temp_dir / f"segments_{video_id}"
            if segments_dir.exists():
                segments_dir.rmdir()
            
            logger.info(f"Successfully processed video with {len(segments)} segments")
            return manifest, signed_segment_paths
            
        except Exception as e:
            logger.error(f"Error processing video: {e}")
            raise
    
    def verify_segment_chain(self, manifest: SegmentChainManifest, 
                           segment_paths: List[Path], 
                           deepfake_threshold: float = 0.5) -> VerificationReport:
        """
        Verify a complete segment chain.
        
        Args:
            manifest: Segment chain manifest
            segment_paths: Paths to segment files to verify
            deepfake_threshold: Threshold for flagging deepfakes
            
        Returns:
            Comprehensive verification report
        """
        logger.info(f"Verifying segment chain for video {manifest.video_id}")
        
        segment_results = []
        valid_c2pa_count = 0
        valid_hash_count = 0
        deepfake_flagged_count = 0
        deepfake_scores = []
        
        # Verify each segment
        for i, (segment_info, segment_path) in enumerate(zip(manifest.segments, segment_paths)):
            try:
                # Verify file hash
                actual_hash = self.calculate_file_hash(segment_path)
                hash_valid = actual_hash == segment_info.file_hash
                if hash_valid:
                    valid_hash_count += 1
                
                # Verify C2PA signature
                c2pa_valid = self._verify_c2pa_signature(segment_path)
                if c2pa_valid:
                    valid_c2pa_count += 1
                
                # Check deepfake score
                deepfake_flagged = False
                if segment_info.deepfake_score is not None:
                    deepfake_scores.append(segment_info.deepfake_score)
                    deepfake_flagged = segment_info.deepfake_score > deepfake_threshold
                    if deepfake_flagged:
                        deepfake_flagged_count += 1
                
                segment_results.append(SegmentVerificationResult(
                    segment_id=i,
                    c2pa_valid=c2pa_valid,
                    hash_valid=hash_valid,
                    deepfake_flagged=deepfake_flagged,
                    deepfake_score=segment_info.deepfake_score,
                    error_message=None
                ))
                
            except Exception as e:
                logger.error(f"Error verifying segment {i}: {e}")
                segment_results.append(SegmentVerificationResult(
                    segment_id=i,
                    c2pa_valid=False,
                    hash_valid=False,
                    deepfake_flagged=False,
                    deepfake_score=segment_info.deepfake_score,
                    error_message=str(e)
                ))
        
        # Calculate overall authenticity
        chain_valid = manifest.validate_chain()
        all_signatures_valid = valid_c2pa_count == len(segment_results)
        all_hashes_valid = valid_hash_count == len(segment_results)
        no_deepfakes_detected = deepfake_flagged_count == 0
        
        overall_authentic = chain_valid and all_signatures_valid and all_hashes_valid and no_deepfakes_detected
        
        # Calculate average deepfake score
        avg_deepfake_score = sum(deepfake_scores) / len(deepfake_scores) if deepfake_scores else None
        
        return VerificationReport(
            video_id=manifest.video_id,
            overall_authentic=overall_authentic,
            chain_valid=chain_valid,
            segment_results=segment_results,
            total_segments=len(segment_results),
            valid_c2pa_signatures=valid_c2pa_count,
            valid_hashes=valid_hash_count,
            deepfake_flagged_count=deepfake_flagged_count,
            deepfake_threshold=deepfake_threshold,
            average_deepfake_score=avg_deepfake_score
        )
    
    def _verify_c2pa_signature(self, segment_path: Path) -> bool:
        """Verify C2PA signature for a single segment"""
        try:
            cmd = ["c2patool", "--certs", str(segment_path)]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return result.returncode == 0
        except Exception as e:
            logger.error(f"Error verifying C2PA signature: {e}")
            return False
    
    async def save_manifest(self, manifest: SegmentChainManifest, output_path: Path):
        """Save segment manifest to file"""
        logger.info(f"Saving manifest to {output_path}")
        
        async with aiofiles.open(output_path, 'w') as f:
            await f.write(manifest.model_dump_json(indent=2))
    
    async def load_manifest(self, manifest_path: Path) -> SegmentChainManifest:
        """Load segment manifest from file"""
        logger.info(f"Loading manifest from {manifest_path}")
        
        async with aiofiles.open(manifest_path, 'r') as f:
            content = await f.read()
            return SegmentChainManifest.model_validate_json(content)
