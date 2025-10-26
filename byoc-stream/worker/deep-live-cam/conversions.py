import torch
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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