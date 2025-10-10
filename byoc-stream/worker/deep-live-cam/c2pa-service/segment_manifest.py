"""
Segment Chain Manifest and Verification Report Models

This module defines the data structures for managing video segments with C2PA signatures
and deepfake detection scores in a cryptographic hash chain.
"""

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class SegmentInfo(BaseModel):
    """Information about a single video segment"""
    segment_id: int = Field(description="Sequential segment identifier")
    start_time: float = Field(description="Start time in seconds")
    end_time: float = Field(description="End time in seconds") 
    duration: float = Field(description="Segment duration in seconds")
    file_path: str = Field(description="Path to the segment file")
    file_hash: str = Field(description="SHA256 hash of the segment file")
    c2pa_signature: Optional[str] = Field(None, description="C2PA signature for this segment")
    previous_hash: Optional[str] = Field(None, description="Hash of previous segment for chain validation")
    
    # Deepfake detection fields - modular integration point
    deepfake_score: Optional[float] = Field(None, description="Deepfake probability score (0.0-1.0)")
    deepfake_model: Optional[str] = Field(None, description="Name of deepfake detection model used")
    deepfake_confidence: Optional[float] = Field(None, description="Confidence in deepfake detection")
    deepfake_metadata: Optional[Dict[str, Any]] = Field(None, description="Additional deepfake detection metadata")
    
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when segment was processed")


class SegmentChainManifest(BaseModel):
    """Manifest containing the complete segment chain with cryptographic validation"""
    video_id: str = Field(description="Unique identifier for the video")
    original_filename: str = Field(description="Original video filename")
    total_segments: int = Field(description="Total number of segments")
    segment_duration: float = Field(description="Duration of each segment in seconds")
    total_duration: float = Field(description="Total video duration in seconds")
    
    # Cryptographic chain validation
    master_hash: str = Field(description="Master hash of the entire segment chain")
    chain_valid: bool = Field(description="Whether the cryptographic chain is valid")
    
    # Segments list
    segments: List[SegmentInfo] = Field(description="List of segment information")
    
    # C2PA manifest template used for signing
    c2pa_manifest_template: Dict[str, Any] = Field(description="C2PA manifest template used for signing")
    
    # Processing metadata
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when manifest was created")
    processing_version: str = Field(default="1.0", description="Version of processing pipeline")
    
    def calculate_master_hash(self) -> str:
        """Calculate the master hash of all segments in the chain"""
        hash_input = ""
        for segment in self.segments:
            hash_input += f"{segment.segment_id}:{segment.file_hash}:{segment.previous_hash or ''}"
        
        return hashlib.sha256(hash_input.encode()).hexdigest()
    
    def validate_chain(self) -> bool:
        """Validate the cryptographic hash chain"""
        if not self.segments:
            return False
        
        # Check if master hash matches calculated hash
        calculated_hash = self.calculate_master_hash()
        if calculated_hash != self.master_hash:
            return False
        
        # Validate chain links
        for i, segment in enumerate(self.segments):
            if i == 0:
                # First segment should have no previous hash
                if segment.previous_hash is not None:
                    return False
            else:
                # Subsequent segments should link to previous segment's hash
                expected_previous = self.segments[i-1].file_hash
                if segment.previous_hash != expected_previous:
                    return False
        
        return True
    
    def get_segment_statistics(self) -> Dict[str, Any]:
        """Get statistics about the segments and deepfake scores"""
        stats = {
            "total_segments": self.total_segments,
            "segments_with_deepfake_scores": 0,
            "average_deepfake_score": None,
            "flagged_segments": 0,
            "deepfake_models_used": set()
        }
        
        scores = []
        for segment in self.segments:
            if segment.deepfake_score is not None:
                stats["segments_with_deepfake_scores"] += 1
                scores.append(segment.deepfake_score)
                
                # Count flagged segments (score > 0.5 typically indicates deepfake)
                if segment.deepfake_score > 0.5:
                    stats["flagged_segments"] += 1
                
                if segment.deepfake_model:
                    stats["deepfake_models_used"].add(segment.deepfake_model)
        
        if scores:
            stats["average_deepfake_score"] = sum(scores) / len(scores)
            stats["min_deepfake_score"] = min(scores)
            stats["max_deepfake_score"] = max(scores)
        
        stats["deepfake_models_used"] = list(stats["deepfake_models_used"])
        
        return stats
    
    def get_deepfake_flagged_segments(self, threshold: float = 0.5) -> List[Dict[str, Any]]:
        """Get segments flagged as potential deepfakes above threshold"""
        flagged = []
        
        for segment in self.segments:
            if segment.deepfake_score is not None and segment.deepfake_score > threshold:
                flagged.append({
                    "segment_id": segment.segment_id,
                    "deepfake_score": segment.deepfake_score,
                    "confidence": segment.deepfake_confidence,
                    "model": segment.deepfake_model,
                    "start_time": segment.start_time,
                    "end_time": segment.end_time,
                    "file_path": segment.file_path
                })
        
        return flagged
    
    def update_deepfake_scores(self, scores_data: List[Dict[str, Any]]) -> int:
        """
        Update deepfake scores for segments - modular integration point
        
        Args:
            scores_data: List of score updates in format:
                [{"segment_id": 0, "score": 0.05, "model": "model_name", "confidence": 0.95}, ...]
        
        Returns:
            Number of segments updated
        """
        updated_count = 0
        
        for score_entry in scores_data:
            segment_id = score_entry.get('segment_id')
            if segment_id is not None and segment_id < len(self.segments):
                segment = self.segments[segment_id]
                segment.deepfake_score = score_entry.get('score')
                segment.deepfake_model = score_entry.get('model', 'unknown')
                segment.deepfake_confidence = score_entry.get('confidence')
                segment.deepfake_metadata = score_entry.get('metadata', {})
                updated_count += 1
        
        return updated_count


class SegmentVerificationResult(BaseModel):
    """Result of verifying a single segment"""
    segment_id: int = Field(description="Segment identifier")
    c2pa_valid: bool = Field(description="Whether C2PA signature is valid")
    hash_valid: bool = Field(description="Whether file hash matches manifest")
    deepfake_flagged: bool = Field(description="Whether segment is flagged as deepfake")
    deepfake_score: Optional[float] = Field(None, description="Deepfake probability score")
    error_message: Optional[str] = Field(None, description="Error message if verification failed")


class VerificationReport(BaseModel):
    """Comprehensive verification report for all segments"""
    video_id: str = Field(description="Video identifier")
    overall_authentic: bool = Field(description="Whether the entire video is considered authentic")
    chain_valid: bool = Field(description="Whether the cryptographic chain is valid")
    
    # Segment-level results
    segment_results: List[SegmentVerificationResult] = Field(description="Results for each segment")
    
    # Summary statistics
    total_segments: int = Field(description="Total number of segments verified")
    valid_c2pa_signatures: int = Field(description="Number of segments with valid C2PA signatures")
    valid_hashes: int = Field(description="Number of segments with valid file hashes")
    deepfake_flagged_count: int = Field(description="Number of segments flagged as deepfakes")
    
    # Deepfake analysis
    deepfake_threshold: float = Field(description="Threshold used for deepfake detection")
    average_deepfake_score: Optional[float] = Field(None, description="Average deepfake score across segments")
    
    # Processing metadata
    verified_at: datetime = Field(default_factory=datetime.utcnow, description="Timestamp of verification")
    verification_version: str = Field(default="1.0", description="Version of verification process")
    
    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of the verification results"""
        return {
            "video_id": self.video_id,
            "overall_authentic": self.overall_authentic,
            "chain_valid": self.chain_valid,
            "segments_verified": self.total_segments,
            "c2pa_success_rate": self.valid_c2pa_signatures / self.total_segments if self.total_segments > 0 else 0,
            "hash_success_rate": self.valid_hashes / self.total_segments if self.total_segments > 0 else 0,
            "deepfake_flagged_percentage": (self.deepfake_flagged_count / self.total_segments * 100) if self.total_segments > 0 else 0,
            "average_deepfake_score": self.average_deepfake_score,
            "verified_at": self.verified_at.isoformat()
        }
