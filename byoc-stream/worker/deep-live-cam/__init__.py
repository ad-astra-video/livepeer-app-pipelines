"""ComfyUI-DeepLiveCam - Face swapping custom node for ComfyUI"""

import logging

# Configure log level here - change to logging.INFO, logging.WARNING, etc.
DEEPLIVECAM_LOG_LEVEL = logging.WARNING  # Change to logging.DEBUG for detailed logs

# Apply log level to DeepLiveCam loggers
logging.getLogger('DeepLiveCamNode').setLevel(DEEPLIVECAM_LOG_LEVEL)
logging.getLogger('DeepLiveCam.FaceSwapper').setLevel(DEEPLIVECAM_LOG_LEVEL)

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]