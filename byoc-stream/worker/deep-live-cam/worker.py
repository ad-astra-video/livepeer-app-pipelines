#!/usr/bin/env python3
"""
Deep Live Cam Face Swapping Processor using StreamProcessor
"""

import asyncio
import base64
import logging
import time
import torch
import cv2
import numpy as np
import os
import sys
from pytrickle import StreamProcessor
from pytrickle.frames import VideoFrame
from pytrickle.frame_skipper import FrameSkipConfig
from nodes import DeepLiveCamNode
from conversions import prepare_frame_tensor, restore_frame_tensor_format

# Import detection worker functions
from detection_worker import (
    process_deepfake_detection,
    initialize_detection_executor,
    cleanup_detection_resources,
    get_detection_cpu_core
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global state
ready = False
processor = None
background_tasks = []
background_task_started = False
deep_live_cam_node = None
source_image = None
source_image_tensor = None
execution_provider = "CUDAExecutionProvider"
many_faces = False
mouth_mask = False
do_deep_fake = True

# Detection configuration
detect_lock = asyncio.Lock()

# Initialize DeepLiveCamNode
try:
    deep_live_cam_node = DeepLiveCamNode()
    logger.info("DeepLiveCamNode initialized successfully")
    
    # Initialize detection executor
    initialize_detection_executor()
    
    ready = True
    logger.info(f"Deep Live Cam processor ready (execution_provider: {execution_provider})")
    logger.info(f"Detection inference will run on CPU core: {get_detection_cpu_core()}")
    
except Exception as e:
    logger.error(f"Failed to initialize DeepLiveCamNode: {e}")
    ready = False
    raise

def load_source_image(image):
    """Load and convert source image to tensor format expected by DeepLiveCamNode."""
    if image is None:
        return None

    try:
        # convert base64 image to opencv image
        if image.startswith("data:image"):
            image = image.split(",")[1]
        img_bytes = base64.b64decode(image)
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"Could not load image")
        
        # Convert BGR to RGB
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Convert to float32 and normalize to [0, 1]
        img_normalized = img_rgb.astype(np.float32) / 255.0
        
        # Convert to torch tensor and add batch dimension (B, H, W, C)
        tensor = torch.from_numpy(img_normalized).unsqueeze(0)  # Add batch dimension
        
        logger.info(f"Source image loaded: {tensor.shape}")
        return tensor
        
    except Exception as e:
        logger.error(f"Failed to load source image: {e}")
        return None

def start_background_task():
    """Start the background task if not already started."""
    global background_task_started, background_tasks
    
    if not background_task_started and processor:
        task = asyncio.create_task(send_periodic_status())
        background_tasks.append(task)
        background_task_started = True
        logger.info("Started background status task")

async def send_periodic_status():
    """Background task that sends periodic status updates."""
    global processor, execution_provider, many_faces, mouth_mask, source_image_tensor
    counter = 0
    try:
        while True:
            await asyncio.sleep(5.0)  # Send status every 5 seconds
            counter += 1
            if processor:
                status_data = {
                    "type": "status_update",
                    "counter": counter,
                    "execution_provider": execution_provider,
                    "many_faces": many_faces,
                    "mouth_mask": mouth_mask,
                    "source_image_loaded": source_image_tensor is not None,
                    "ready": ready,
                    "timestamp": time.time()
                }
                success = await processor.send_data(str(status_data))
                if success:
                    logger.info(f"Sent status update #{counter}")
                else:
                    logger.warning(f"Failed to send status update #{counter}, stopping background task")
                    break  # Exit the loop if sending fails
    except asyncio.CancelledError:
        logger.info("Background status task cancelled")
        raise
    except Exception as e:
        logger.error(f"Error in background status task: {e}")

# Detection processing is now handled by detection_worker module

async def on_stream_start():
    """Called when stream starts - initialize resources."""
    global background_task_started
    logger.info("Stream started, initializing resources")
    
    # Reset background task flag for new stream
    background_task_started = False
    logger.info("Stream initialization complete")

async def on_stream_stop():
    """Called when stream stops - cleanup background tasks."""
    global background_tasks, background_task_started
    logger.info("Stream stopped, cleaning up background tasks")
    
    for task in background_tasks:
        if not task.done():
            task.cancel()
            logger.info("Cancelled background task")
    
    background_tasks.clear()
    background_task_started = False  # Reset flag for next stream
    
    # Note: We don't shutdown the detection_executor here as it should persist
    # across stream sessions to avoid process startup overhead
    
    logger.info("All background tasks cleaned up")

async def process_video(frame: VideoFrame) -> VideoFrame:
    """Apply face swapping using DeepLiveCamNode."""
    global ready, deep_live_cam_node, source_image_tensor, execution_provider, many_faces, mouth_mask, do_deep_fake
    
    if not do_deep_fake:
        logger.info("returning original frame, no deep fake")
        return frame

    # Check if we're ready and have required components
    if not ready or deep_live_cam_node is None:
        logger.warning("DeepLiveCamNode not ready, returning original frame")
        return frame
    
    if source_image_tensor is None:
        #logger.warning("No source image loaded, returning original frame")
        return frame

    frame_tensor = frame.tensor
    
    # Ensure frame tensor is in the correct format (B, H, W, C) in RGB
    processed_tensor = prepare_frame_tensor(frame_tensor)
    
    try:
        # Process the frame using DeepLiveCamNode
        result_tuple = deep_live_cam_node.process_image(
            image=processed_tensor,
            source_image=source_image_tensor,
            execution_provider=execution_provider,
            many_faces=many_faces,
            mouth_mask=mouth_mask
        )
        
        # Extract result tensor from tuple
        result_tensor = result_tuple[0]
        
        # Convert back to original frame tensor format
        final_tensor = restore_frame_tensor_format(result_tensor, frame_tensor)
        logger.debug("sending back processed frame shape=" + str(final_tensor.shape))

        # Run deepfake detection in separate thread to avoid blocking
        # Only start detection if no other detection is in progress
        if not detect_lock.locked():
            asyncio.create_task(process_deepfake_detection(result_tuple[1], processor, detect_lock))

        return frame.replace_tensor(final_tensor)
        
    except Exception as e:
        logger.error(f"Error during face swapping: {e}")
        return frame

async def update_params(params: dict):
    """Update face swapping parameters."""
    global execution_provider, many_faces, mouth_mask, source_image_tensor, do_deep_fake
    
    if "execution_provider" in params:
        old = execution_provider
        execution_provider = params["execution_provider"]
        if old != execution_provider:
            logger.info(f"Execution provider: {old} → {execution_provider}")
    
    if "many_faces" in params:
        old = many_faces
        many_faces = bool(params["many_faces"])
        if old != many_faces:
            logger.info(f"Many faces: {old} → {many_faces}")
    
    if "mouth_mask" in params:
        old = mouth_mask
        mouth_mask = bool(params["mouth_mask"])
        if old != mouth_mask:
            logger.info(f"Mouth mask: {old} → {mouth_mask}")
    
    if "source_image" in params:
        source_image = params["source_image"]
        source_image_tensor = load_source_image(source_image)

    if "do_deep_fake" in params:
        old = do_deep_fake
        do_deep_fake = bool(params["do_deep_fake"])
        if old != do_deep_fake:
            logger.info(f"do deep fake: {old} → {do_deep_fake}")

def cleanup_resources():
    """Clean up resources when shutting down."""
    cleanup_detection_resources()

# Create and run StreamProcessor
if __name__ == "__main__":
    try:
        processor = StreamProcessor(
            video_processor=process_video,
            #model_loader=load_model,
            param_updater=update_params,
            on_stream_start=on_stream_start,
            on_stream_stop=on_stream_stop,
            name="deep-live-cam",
            port=8000,
            frame_skip_config=FrameSkipConfig(),  # Optional frame skipping
        )
        #load_model()  # Initial model load
        processor.run()
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        cleanup_resources()
        logger.info("Worker shutdown complete")
