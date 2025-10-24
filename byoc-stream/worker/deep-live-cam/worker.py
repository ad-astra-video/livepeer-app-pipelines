#!/usr/bin/env python3
"""
Deep Live Cam Face Swapping Processor using StreamProcessor
"""

import asyncio
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

detect_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "detect")
sys.path.append(detect_path)
from minimal_xception_infer import detect_deepfake_from_frame

# Global state
ready = False
processor = None
background_tasks = []
background_task_started = False
deep_live_cam_node = None
source_image_tensor = None
execution_provider = "CUDAExecutionProvider"
many_faces = False
mouth_mask = False
do_deep_fake = True
detect_lock = asyncio.Lock()
#async def load_model(**kwargs):
"""Initialize processor state - called during model loading phase."""
#global ready, processor, deep_live_cam_node, source_image_tensor, execution_provider, many_faces, mouth_mask

#logger.info(f"load_model called with kwargs: {kwargs}")

# Set processor variables from kwargs or use defaults
#execution_provider = "CPUExecutionProvider" #kwargs.get('execution_provider', 'CPUExecutionProvider')
#many_faces = False #kwargs.get('many_faces', False)
#mouth_mask = False #kwargs.get('mouth_mask', False)
source_image_path = "/app/doug.jpeg" #kwargs.get('source_image_path', "/app/doug.jpeg")

def load_source_image(image_path):
    """Load and convert source image to tensor format expected by DeepLiveCamNode."""
    try:
        # Load image using OpenCV
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not load image from {image_path}")
        
        # Convert BGR to RGB
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Convert to float32 and normalize to [0, 1]
        img_normalized = img_rgb.astype(np.float32) / 255.0
        
        # Convert to torch tensor and add batch dimension (B, H, W, C)
        tensor = torch.from_numpy(img_normalized).unsqueeze(0)  # Add batch dimension
        
        logger.info(f"Source image loaded: {tensor.shape}")
        return tensor
        
    except Exception as e:
        logger.error(f"Failed to load source image from {image_path}: {e}")
        return None

# Initialize DeepLiveCamNode
try:
    deep_live_cam_node = DeepLiveCamNode()
    logger.info("✅ DeepLiveCamNode initialized successfully")
    
    # Load source image if provided
    if source_image_path and os.path.exists(source_image_path):
        source_image_tensor = load_source_image(source_image_path)
        logger.info(f"✅ Source image loaded from: {source_image_path}")
    else:
        logger.warning("No source image path provided or file doesn't exist. Face swapping will be skipped.")
        source_image_tensor = None
    
    ready = True
    logger.info(f"✅ Deep Live Cam processor ready (execution_provider: {execution_provider}, many_faces: {many_faces}, mouth_mask: {mouth_mask})")
    
except Exception as e:
    logger.error(f"❌ Failed to initialize DeepLiveCamNode: {e}")
    ready = False
    raise

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

async def process_deepfake_detection(frame_data):
    global processor, detect_lock
    try:
        # Run the blocking deepfake detection in a separate thread
        async with detect_lock:
            deep_fake_result = await asyncio.to_thread(detect_deepfake_from_frame, frame_data)
        
            if processor:
                await processor.send_data(deep_fake_result)
                logger.debug("Sent deepfake detection result")
            else:
                logger.warning("Processor not available for sending deepfake detection result")
    except Exception as e:
        logger.error(f"Error in deepfake detection task: {e}")

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
        logger.warning("No source image loaded, returning original frame")
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
            asyncio.create_task(process_deepfake_detection(result_tuple[1]))

        return frame.replace_tensor(final_tensor)
        
    except Exception as e:
        logger.error(f"Error during face swapping: {e}")
        return frame

def prepare_frame_tensor(frame_tensor):
    """Convert frame tensor to the format expected by DeepLiveCamNode (B, H, W, C) in RGB."""
    # Handle different input formats and convert to (B, H, W, C) RGB
    
    if len(frame_tensor.shape) == 3:
        # Add batch dimension
        if frame_tensor.shape[0] == 3:  # CHW format (3, H, W)
            # Convert CHW to HWC and add batch dimension
            tensor = frame_tensor.permute(1, 2, 0).unsqueeze(0)  # (3, H, W) -> (H, W, 3) -> (1, H, W, 3)
        else:  # HWC format (H, W, 3)
            # Just add batch dimension
            tensor = frame_tensor.unsqueeze(0)  # (H, W, 3) -> (1, H, W, 3)
    elif len(frame_tensor.shape) == 4:
        # Already has batch dimension
        if frame_tensor.shape[1] == 3:  # BCHW format (B, 3, H, W)
            # Convert BCHW to BHWC
            tensor = frame_tensor.permute(0, 2, 3, 1)  # (B, 3, H, W) -> (B, H, W, 3)
        else:  # BHWC format (B, H, W, 3)
            tensor = frame_tensor
    else:
        logger.error(f"Unexpected tensor shape: {frame_tensor.shape}")
        return frame_tensor
    
    # Ensure tensor is float32 and in range [0, 1]
    if tensor.dtype != torch.float32:
        tensor = tensor.float()
    
    if tensor.max() > 1.0:
        tensor = tensor / 255.0
    
    return tensor

def restore_frame_tensor_format(result_tensor, original_tensor):
    """Convert result tensor back to the original frame tensor format."""
    # result_tensor is in (B, H, W, C) format from DeepLiveCamNode
    
    if len(original_tensor.shape) == 3:
        # Original was 3D, remove batch dimension
        if original_tensor.shape[0] == 3:  # Original was CHW
            # Convert BHWC to CHW
            final_tensor = result_tensor.squeeze(0).permute(2, 0, 1)  # (1, H, W, 3) -> (H, W, 3) -> (3, H, W)
        else:  # Original was HWC
            # Remove batch dimension
            final_tensor = result_tensor.squeeze(0)  # (1, H, W, 3) -> (H, W, 3)
    elif len(original_tensor.shape) == 4:
        # Original was 4D
        if original_tensor.shape[1] == 3:  # Original was BCHW
            # Convert BHWC to BCHW
            final_tensor = result_tensor.permute(0, 3, 1, 2)  # (B, H, W, 3) -> (B, 3, H, W)
        else:  # Original was BHWC
            final_tensor = result_tensor
    else:
        final_tensor = result_tensor
    
    # Ensure same device and dtype as original
    final_tensor = final_tensor.to(original_tensor.device, dtype=original_tensor.dtype)
    
    return final_tensor

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
    
    if "source_image_path" in params:
        source_image_path = params["source_image_path"]
        if source_image_path and os.path.exists(source_image_path):
            source_image_tensor = load_source_image(source_image_path)
            logger.info(f"Source image updated: {source_image_path}")
        else:
            logger.error(f"Invalid source image path: {source_image_path}")

    if "do_deep_fake" in params:
        old = do_deep_fake
        do_deep_fake = bool(params["do_deep_fake"])
        if old != do_deep_fake:
            logger.info(f"do deep fake: {old} → {do_deep_fake}")

# Create and run StreamProcessor
if __name__ == "__main__":
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
