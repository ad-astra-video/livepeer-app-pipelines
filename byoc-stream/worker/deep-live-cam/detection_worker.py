#!/usr/bin/env python3
"""
Detection Worker Module
Handles deepfake detection inference on a dedicated CPU core
"""

import os
import sys
import logging
import concurrent.futures
import asyncio

# Setup logging
logger = logging.getLogger(__name__)

# CPU core assignment for detection inference
DETECTION_CPU_CORE = int(os.environ.get('DETECTION_CPU_CORE', '0'))  # Default to CPU core 0

# Add detect path to sys.path
detect_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "detect")
sys.path.append(detect_path)

# Import detection function
from minimal_xception_infer import detect_deepfake_from_frame

# Global detection executor
_detection_executor = None


def set_detection_cpu_affinity():
    """Set CPU affinity for detection process to use a specific core."""
    try:
        # Set CPU affinity to use only the specified core
        os.sched_setaffinity(0, {DETECTION_CPU_CORE})
        logger.info(f"Detection process bound to CPU core {DETECTION_CPU_CORE}")
    except OSError as e:
        logger.warning(f"Failed to set CPU affinity for detection: {e}")


def detect_deepfake_with_affinity(frame_data):
    """Wrapper function that sets CPU affinity before running detection."""
    # Set CPU affinity for this thread to the specified core
    try:
        os.sched_setaffinity(0, {DETECTION_CPU_CORE})
        # Verify the affinity was set correctly
        current_affinity = os.sched_getaffinity(0)
        logger.debug(f"Detection thread CPU affinity set to cores: {current_affinity}")
        if DETECTION_CPU_CORE in current_affinity:
            logger.debug(f"Successfully bound detection thread to CPU core {DETECTION_CPU_CORE}")
        else:
            logger.warning(f"CPU core {DETECTION_CPU_CORE} not in affinity set: {current_affinity}")
    except OSError as e:
        logger.warning(f"Failed to set CPU affinity for detection thread: {e}")
    
    return detect_deepfake_from_frame(frame_data)


def initialize_detection_executor():
    """Initialize the dedicated executor for detection inference."""
    global _detection_executor
    if _detection_executor is None:
        # Create a thread pool with a single worker
        # We'll set CPU affinity in the worker function instead
        _detection_executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=1,
            thread_name_prefix="detection"
        )
        logger.info(f"Detection executor initialized with dedicated thread (target CPU core: {DETECTION_CPU_CORE})")
    return _detection_executor


async def process_deepfake_detection(frame_data, processor, detect_lock):
    """
    Process deepfake detection on dedicated CPU core.
    
    Args:
        frame_data: Frame data to analyze
        processor: Stream processor for sending results
        detect_lock: Async lock to prevent concurrent detection
    """
    global _detection_executor
    try:
        # Run the blocking deepfake detection in the dedicated CPU-bound executor
        async with detect_lock:
            loop = asyncio.get_event_loop()
            logger.debug(f"Starting deepfake detection on dedicated thread (target CPU core: {DETECTION_CPU_CORE})")
            
            # Initialize executor if not already done
            if _detection_executor is None:
                initialize_detection_executor()
            
            deep_fake_result = await loop.run_in_executor(
                _detection_executor, 
                detect_deepfake_with_affinity, 
                frame_data
            )
        
            if processor:
                await processor.send_data(deep_fake_result)
                logger.debug("Sent deepfake detection result")
            else:
                logger.warning("Processor not available for sending deepfake detection result")
    except Exception as e:
        logger.error(f"Error in deepfake detection task: {e}")


def cleanup_detection_resources():
    """Clean up detection resources when shutting down."""
    global _detection_executor
    if _detection_executor:
        logger.info("Shutting down detection executor")
        _detection_executor.shutdown(wait=True)
        _detection_executor = None


def get_detection_cpu_core():
    """Get the configured detection CPU core."""
    return DETECTION_CPU_CORE