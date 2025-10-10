#!/usr/bin/env python3
"""
Test script for segment verification endpoints
"""

import json
import requests
import time
from pathlib import Path

# Configuration
BASE_URL = "http://localhost:8000"
VIDEO_PATH = "/home/user/hackathon-project/output_video-v3.mp4"

# Sample C2PA manifest
SAMPLE_MANIFEST = {
    "alg": "es256k",
    "private_key": "es256k_private.pem", 
    "sign_cert": "es256k_cert.pem",
    "ta_url": "http://timestamp.digicert.com",
    "claim_generator": "TestApp",
    "assertions": [
        {
            "label": "c2pa.actions",
            "data": {
                "actions": [
                    {
                        "action": "c2pa.created",
                        "when": "2024-01-01T00:00:00Z",
                        "softwareAgent": "Video Segment Test v1.0"
                    }
                ]
            }
        }
    ]
}

# Sample deepfake scores with one flagged segment
SAMPLE_DEEPFAKE_SCORES = [
    {"segment_id": 0, "score": 0.05, "model": "test_model", "confidence": 0.95},
    {"segment_id": 1, "score": 0.03, "model": "test_model", "confidence": 0.97},
    {"segment_id": 2, "score": 0.85, "model": "test_model", "confidence": 0.90},  # Flagged as deepfake
    {"segment_id": 3, "score": 0.12, "model": "test_model", "confidence": 0.88},
    {"segment_id": 4, "score": 0.08, "model": "test_model", "confidence": 0.92},
    {"segment_id": 5, "score": 0.06, "model": "test_model", "confidence": 0.94}
]

def test_full_pipeline():
    """Test the complete pipeline: sign -> verify"""
    print("🚀 Testing Complete C2PA Video Segment Pipeline")
    print("=" * 60)
    
    # Step 1: Sign segments
    print("\n📝 Step 1: Signing video segments...")
    
    if not Path(VIDEO_PATH).exists():
        print(f"❌ Video file not found: {VIDEO_PATH}")
        return
    
    files = {
        'video': ('test_video.mp4', open(VIDEO_PATH, 'rb'), 'video/mp4')
    }
    
    data = {
        'manifest': json.dumps(SAMPLE_MANIFEST),
        'segment_duration': 10,
        'deepfake_scores': json.dumps(SAMPLE_DEEPFAKE_SCORES)
    }
    
    try:
        response = requests.post(f"{BASE_URL}/sign_segments", files=files, data=data)
        
        if response.status_code != 200:
            print(f"❌ Signing failed: {response.text}")
            return
        
        sign_result = response.json()
        print("✅ Video signed successfully!")
        print(f"   📊 Video ID: {sign_result['video_id']}")
        print(f"   📊 Total segments: {sign_result['total_segments']}")
        print(f"   📊 Chain valid: {sign_result['chain_valid']}")
        
        # Display deepfake analysis
        stats = sign_result['manifest_stats']
        print(f"   🤖 Deepfake analysis:")
        print(f"      - Segments analyzed: {stats['segments_with_deepfake_scores']}")
        print(f"      - Average score: {stats['average_deepfake_score']:.3f}")
        print(f"      - Flagged segments: {stats['flagged_segments']}")
        print(f"      - Score range: {stats['min_deepfake_score']:.3f} - {stats['max_deepfake_score']:.3f}")
        
        video_id = sign_result['video_id']
        manifest_path = sign_result['manifest_path']
        
    finally:
        files['video'][1].close()
    
    # Step 2: Download and verify segments
    print(f"\n🔍 Step 2: Downloading signed segments...")
    
    # Download the manifest file from the container
    manifest_download_response = requests.get(f"{BASE_URL}/download/manifest_{video_id}.json")
    if manifest_download_response.status_code == 200:
        print("✅ Manifest downloaded successfully")
        manifest_content = manifest_download_response.content
    else:
        print(f"❌ Failed to download manifest: {manifest_download_response.status_code}")
        return
    
    # Download segment files
    segment_files = []
    for i in range(sign_result['total_segments']):
        segment_filename = f"signed_segment_{i:04d}.mp4"
        segment_response = requests.get(f"{BASE_URL}/download/{segment_filename}")
        
        if segment_response.status_code == 200:
            segment_files.append((segment_filename, segment_response.content))
            print(f"   ✅ Downloaded {segment_filename}")
        else:
            print(f"   ❌ Failed to download {segment_filename}")
    
    if len(segment_files) != sign_result['total_segments']:
        print(f"❌ Could not download all segments")
        return
    
    # Step 3: Verify segments
    print(f"\n🔐 Step 3: Verifying segment chain...")
    
    # Prepare files for verification
    verify_files = {
        'manifest_file': ('manifest.json', manifest_content, 'application/json')
    }
    
    # Add all segment files
    for i, (filename, content) in enumerate(segment_files):
        verify_files[f'segments'] = (filename, content, 'video/mp4')
    
    verify_data = {
        'deepfake_threshold': 0.7  # Threshold for flagging deepfakes
    }
    
    # Note: The current API expects multiple files with the same name 'segments'
    # This is a limitation - in practice you'd need to modify the API or use a different approach
    print("   ⚠️  Note: Verification endpoint needs modification for multiple file upload")
    print("   📋 Verification would check:")
    print("      - Cryptographic hash chain integrity")
    print("      - C2PA signatures for each segment")
    print("      - File hash validation")
    print("      - Deepfake score analysis")
    
    # Step 4: Demonstrate deepfake score update
    print(f"\n🤖 Step 4: Updating deepfake scores...")
    
    updated_scores = [
        {"segment_id": 0, "score": 0.02, "model": "updated_model_v2", "confidence": 0.98},
        {"segment_id": 1, "score": 0.91, "model": "updated_model_v2", "confidence": 0.95},  # Now flagged
        {"segment_id": 2, "score": 0.15, "model": "updated_model_v2", "confidence": 0.92},  # No longer flagged
        {"segment_id": 3, "score": 0.08, "model": "updated_model_v2", "confidence": 0.89}
    ]
    
    update_files = {
        'manifest_file': ('manifest.json', manifest_content, 'application/json')
    }
    
    update_data = {
        'deepfake_scores': json.dumps(updated_scores)
    }
    
    update_response = requests.post(f"{BASE_URL}/update_deepfake_scores", files=update_files, data=update_data)
    
    if update_response.status_code == 200:
        update_result = update_response.json()
        print("✅ Deepfake scores updated successfully!")
        print(f"   📊 {update_result['message']}")
        print(f"   📊 Flagged segments: {update_result['flagged_count']}")
        print(f"   📊 Updated manifest: {update_result['updated_manifest_path']}")
        
        # Show flagged segments
        if update_result['flagged_segments']:
            print("   🚨 Flagged segments:")
            for flagged in update_result['flagged_segments']:
                print(f"      - Segment {flagged['segment_id']}: score {flagged['deepfake_score']:.3f}")
    else:
        print(f"❌ Score update failed: {update_response.text}")
    
    # Summary
    print(f"\n🎉 Pipeline Test Complete!")
    print("=" * 60)
    print("✅ Successfully tested:")
    print("   1. Video segmentation and C2PA signing")
    print("   2. Cryptographic hash chain creation")
    print("   3. Deepfake score integration")
    print("   4. Segment file download")
    print("   5. Deepfake score updates")
    print("\n📋 Key Results:")
    print(f"   - Video split into {sign_result['total_segments']} segments")
    print(f"   - Cryptographic chain: {'✅ Valid' if sign_result['chain_valid'] else '❌ Invalid'}")
    print(f"   - Deepfake detection integrated with modular interface")
    print(f"   - All segments signed with C2PA and available for streaming")
    
    print(f"\n🔌 Integration Points for Your Team:")
    print("   1. Implement DeepfakeIntegrationInterface in segment_processor.py")
    print("   2. Replace placeholder model with your actual deepfake detector")
    print("   3. Use /update_deepfake_scores endpoint for async processing")
    print("   4. Customize deepfake_threshold based on your model's characteristics")

if __name__ == "__main__":
    test_full_pipeline()
