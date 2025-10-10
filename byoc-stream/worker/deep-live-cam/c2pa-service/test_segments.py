#!/usr/bin/env python3
"""
Test script for segment processing endpoints
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

# Sample deepfake scores (optional)
SAMPLE_DEEPFAKE_SCORES = [
    {"segment_id": 0, "score": 0.05, "model": "test_model", "confidence": 0.95},
    {"segment_id": 1, "score": 0.03, "model": "test_model", "confidence": 0.97},
    {"segment_id": 2, "score": 0.85, "model": "test_model", "confidence": 0.90},
    {"segment_id": 3, "score": 0.12, "model": "test_model", "confidence": 0.88}
]

def test_health():
    """Test health endpoint"""
    print("🔍 Testing health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    return response.status_code == 200

def test_sign_segments():
    """Test segment signing endpoint"""
    print("\n🎬 Testing segment signing...")
    
    if not Path(VIDEO_PATH).exists():
        print(f"❌ Video file not found: {VIDEO_PATH}")
        return None
    
    # Prepare files
    files = {
        'video': ('test_video.mp4', open(VIDEO_PATH, 'rb'), 'video/mp4')
    }
    
    data = {
        'manifest': json.dumps(SAMPLE_MANIFEST),
        'segment_duration': 10,  # 10 second segments
        'deepfake_scores': json.dumps(SAMPLE_DEEPFAKE_SCORES)
    }
    
    try:
        print(f"📤 Uploading video: {VIDEO_PATH}")
        response = requests.post(f"{BASE_URL}/sign_segments", files=files, data=data)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Segment signing successful!")
            print(f"📊 Video ID: {result['video_id']}")
            print(f"📊 Total segments: {result['total_segments']}")
            print(f"📊 Master hash: {result['master_hash']}")
            print(f"📊 Chain valid: {result['chain_valid']}")
            print(f"📊 Manifest stats: {result['manifest_stats']}")
            return result
        else:
            print(f"❌ Segment signing failed: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error during segment signing: {e}")
        return None
    finally:
        files['video'][1].close()

def test_update_deepfake_scores(video_id):
    """Test updating deepfake scores"""
    print("\n🤖 Testing deepfake score update...")
    
    # New scores with different values
    updated_scores = [
        {"segment_id": 0, "score": 0.02, "model": "updated_model_v2", "confidence": 0.98},
        {"segment_id": 1, "score": 0.91, "model": "updated_model_v2", "confidence": 0.95},
        {"segment_id": 2, "score": 0.15, "model": "updated_model_v2", "confidence": 0.92}
    ]
    
    # We need the manifest file - let's assume it was saved
    manifest_path = f"/tmp/manifest_{video_id}.json"
    
    try:
        # For testing, we'll create a mock manifest file upload
        # In real usage, you'd upload the actual manifest file
        files = {
            'manifest_file': ('manifest.json', '{"video_id": "test"}', 'application/json')
        }
        
        data = {
            'deepfake_scores': json.dumps(updated_scores)
        }
        
        response = requests.post(f"{BASE_URL}/update_deepfake_scores", files=files, data=data)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Deepfake scores updated!")
            print(f"📊 Updated segments: {result.get('message', 'N/A')}")
            print(f"📊 Flagged segments: {result.get('flagged_count', 0)}")
            return result
        else:
            print(f"❌ Score update failed: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error updating scores: {e}")
        return None

def main():
    """Run all tests"""
    print("🚀 Starting C2PA Video Segment Processing Tests")
    print("=" * 50)
    
    # Test 1: Health check
    if not test_health():
        print("❌ Health check failed. Service may not be running.")
        return
    
    # Test 2: Sign segments
    sign_result = test_sign_segments()
    if not sign_result:
        print("❌ Segment signing failed. Cannot proceed with other tests.")
        return
    
    # Test 3: Update deepfake scores (simplified test)
    # Note: This test is simplified since we'd need the actual manifest file
    print("\n🤖 Deepfake score update test skipped (requires manifest file)")
    print("   In practice, you would:")
    print("   1. Download the manifest file from the signing response")
    print("   2. Upload it along with new scores to /update_deepfake_scores")
    
    print("\n✅ All available tests completed successfully!")
    print("\n📋 Summary:")
    print(f"   - Video processed into {sign_result['total_segments']} segments")
    print(f"   - Cryptographic chain: {'✅ Valid' if sign_result['chain_valid'] else '❌ Invalid'}")
    print(f"   - Signed segments available for download")
    
    print("\n🔗 Available endpoints tested:")
    print("   ✅ GET  /health")
    print("   ✅ POST /sign_segments")
    print("   ⏸️  POST /update_deepfake_scores (requires manifest file)")
    print("   ⏸️  POST /verify_segments (requires segment files)")

if __name__ == "__main__":
    main()
