import os
import cv2
import numpy as np
import torch
import sys
import logging
from typing import Any
import onnxruntime
#from comfy.utils import ProgressBar

# Add DeepLiveCam to path
dlc_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DeepLiveCam")
sys.path.append(dlc_path)

# Import DeepLiveCam modules
from DeepLiveCam.modules.face_analyser import get_one_face, get_many_faces
from DeepLiveCam.modules.processors.frame.face_swapper import get_face_swapper, swap_face
from DeepLiveCam.modules.utilities import conditional_download
from DeepLiveCam.modules import globals as dlc_globals

# Setup logging with more detail
logger = logging.getLogger('DeepLiveCamNode')

def debug_cuda_environment():
    """Debug CUDA environment and ONNX Runtime setup."""
    logger.info("=== CUDA Environment Debug ===")
    
    # Check CUDA availability in PyTorch
    logger.info(f"PyTorch CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        logger.info(f"PyTorch CUDA device count: {torch.cuda.device_count()}")
        logger.info(f"PyTorch CUDA current device: {torch.cuda.current_device()}")
        logger.info(f"PyTorch CUDA device name: {torch.cuda.get_device_name()}")
        logger.info(f"PyTorch CUDA version: {torch.version.cuda}")
    
    # Check ONNX Runtime providers
    available_providers = onnxruntime.get_available_providers()
    logger.info(f"ONNX Runtime available providers: {available_providers}")
    
    # Check CUDA DLLs and environment
    cuda_path = os.environ.get('CUDA_PATH')
    logger.info(f"CUDA_PATH environment variable: {cuda_path}")
    
    path_env = os.environ.get('PATH', '')
    cuda_paths_in_path = [p for p in path_env.split(os.pathsep) if 'cuda' in p.lower()]
    logger.info(f"CUDA-related paths in PATH: {cuda_paths_in_path}")
    
    # Try to import and test ONNX Runtime CUDA provider directly
    try:
        import onnxruntime as ort
        logger.info(f"ONNX Runtime version: {ort.__version__}")
        logger.info(f"ONNX Runtime location: {os.path.dirname(ort.__file__)}")
        
        # Check if CUDA provider can be created
        if 'CUDAExecutionProvider' in available_providers:
            logger.info("Attempting to create CUDA execution provider...")
            try:
                # Try to get provider options for CUDA
                cuda_provider_options = {
                    'device_id': 0,
                    'arena_extend_strategy': 'kNextPowerOfTwo',
                    'gpu_mem_limit': 2 * 1024 * 1024 * 1024,  # 2GB
                    'cudnn_conv_algo_search': 'EXHAUSTIVE',
                    'do_copy_in_default_stream': True,
                }
                logger.info(f"CUDA provider options: {cuda_provider_options}")
                
                # Check specific CUDA DLL availability
                import ctypes
                
                # Try different CUDA runtime versions
                cuda_dlls_to_try = ['cudart64_110.dll', 'cudart64_11.dll', 'cudart64_118.dll']
                cuda_dll_found = False
                for dll_name in cuda_dlls_to_try:
                    try:
                        cudart = ctypes.CDLL(dll_name)
                        logger.info(f"Successfully loaded {dll_name}")
                        cuda_dll_found = True
                        break
                    except Exception as dll_e:
                        logger.debug(f"Failed to load {dll_name}: {dll_e}")
                
                if not cuda_dll_found:
                    logger.error(f"Failed to load any CUDA runtime DLL from: {cuda_dlls_to_try}")
                
                # Try to load ONNX Runtime CUDA provider DLL
                ort_path = os.path.dirname(ort.__file__)
                possible_cuda_dll_paths = [
                    os.path.join(ort_path, 'capi', 'onnxruntime_providers_cuda.dll'),
                    os.path.join(ort_path, 'onnxruntime_providers_cuda.dll'),
                    'onnxruntime_providers_cuda.dll'  # Try system PATH
                ]
                
                cuda_provider_dll_found = False
                for dll_path in possible_cuda_dll_paths:
                    try:
                        if os.path.isfile(dll_path):
                            logger.info(f"ONNX Runtime CUDA provider DLL found at: {dll_path}")
                            ort_cuda = ctypes.CDLL(dll_path)
                            logger.info(f"Successfully loaded onnxruntime_providers_cuda.dll from {dll_path}")
                            cuda_provider_dll_found = True
                            break
                    except Exception as dll_e:
                        logger.debug(f"Failed to load ONNX Runtime CUDA provider from {dll_path}: {dll_e}")
                
                if not cuda_provider_dll_found:
                    logger.error(f"Failed to load onnxruntime_providers_cuda.dll from any location: {possible_cuda_dll_paths}")
                    # List contents of ONNX Runtime directory for debugging
                    try:
                        ort_files = os.listdir(ort_path)
                        logger.info(f"ONNX Runtime directory contents: {[f for f in ort_files if 'cuda' in f.lower()]}")
                        
                        capi_path = os.path.join(ort_path, 'capi')
                        if os.path.exists(capi_path):
                            capi_files = os.listdir(capi_path)
                            logger.info(f"ONNX Runtime capi directory contents: {[f for f in capi_files if 'cuda' in f.lower()]}")
                    except Exception as e:
                        logger.error(f"Error listing ONNX Runtime directory: {e}")
                    
            except Exception as cuda_e:
                logger.error(f"CUDA provider creation failed: {cuda_e}")
                logger.error(f"CUDA error details:", exc_info=True)
        else:
            logger.warning("CUDAExecutionProvider not in available providers list")
            
    except Exception as ort_e:
        logger.error(f"ONNX Runtime import/check failed: {ort_e}")
        logger.error(f"ONNX Runtime error details:", exc_info=True)
    
    logger.info("=== End CUDA Environment Debug ===")

def get_available_execution_providers():
    """Get the list of available execution providers for ONNX Runtime."""
    # Run debug first
    debug_cuda_environment()
    
    providers = onnxruntime.get_available_providers()
    logger.info(f"Raw available providers from ONNX Runtime: {providers}")
    
    # Convert to more friendly names for UI display
    provider_map = {
        "CPUExecutionProvider": "CPU",
        "CUDAExecutionProvider": "CUDA (NVIDIA GPU)",
        "ROCMExecutionProvider": "ROCm (AMD GPU)",
        "CoreMLExecutionProvider": "CoreML (Apple)",
        "DmlExecutionProvider": "DirectML",
        "OpenVINOExecutionProvider": "OpenVINO",
        "TensorrtExecutionProvider": "TensorRT (NVIDIA)"
    }
    
    available_providers = []
    for provider in providers:
        friendly_name = provider_map.get(provider, provider)
        available_providers.append((provider, friendly_name))
    
    logger.info(f"Available providers for UI: {available_providers}")
    return available_providers

class DeepLiveCamNode:
    """
    A node that applies face swapping using Deep Live Cam to frames in ComfyUI.
    """
    
    def __init__(self):
        self.face_swapper = None
        self.source_face = None
        self.initialized = False
        self.execution_providers = ["CPUExecutionProvider"]
        self.current_provider = None
        self.last_source_image = None
        self.last_source_face = None
        
        # Ensure models directory exists
        self.models_dir = "/app/DeepLiveCam/models"
        os.makedirs(self.models_dir, exist_ok=True)
        
        # Download the required model if not present
        self._download_model()
    
    def _download_model(self):
        """Download the face swapping model if it doesn't exist."""
        model_path = os.path.join("models", "inswapper_128_fp16.onnx")
        if not os.path.exists(model_path):
            logger.info("Downloading face swapper model...")
            conditional_download(
                self.models_dir,
                ["https://huggingface.co/hacksider/deep-live-cam/blob/main/inswapper_128_fp16.onnx"]
            )
            logger.info("Model downloaded successfully")
    
    def _init_face_swapper(self, execution_provider):
        """Initialize the face swapper module."""
        logger.debug(f"=== Face Swapper Initialization Debug ===")
        logger.debug(f"Requested execution provider: {execution_provider}")
        logger.debug(f"Current provider: {self.current_provider}")
        logger.debug(f"Initialized: {self.initialized}")
        
        # Reset initialization if provider changes
        if self.current_provider != execution_provider:
            logger.info("Provider changed, resetting initialization")
            self.initialized = False
            self.current_provider = execution_provider
            
        if not self.initialized:
            try:
                # Get available providers
                available_providers = onnxruntime.get_available_providers()
                logger.info(f"Available ONNX Runtime providers: {available_providers}")
                
                # Check if requested provider is available - NO FALLBACK
                if execution_provider not in available_providers:
                    error_msg = f"Requested provider '{execution_provider}' not available. Available providers: {available_providers}"
                    logger.error(error_msg)
                    raise RuntimeError(error_msg)
                
                logger.info(f"Requested provider '{execution_provider}' is available")
                
                # Set up provider configuration
                if execution_provider == "CUDAExecutionProvider":
                    logger.info("Setting up CUDA provider configuration")
                    dlc_globals.execution_providers = ["CUDAExecutionProvider"]
                    provider_options = {
                        'device_id': 0,
                        'arena_extend_strategy': 'kNextPowerOfTwo',
                        'gpu_mem_limit': 4 * 1024 * 1024 * 1024,  # 4GB limit
                        'cudnn_conv_algo_search': 'EXHAUSTIVE',
                        'do_copy_in_default_stream': True,
                    }
                    logger.info(f"CUDA provider options: {provider_options}")
                else:
                    logger.info(f"Setting up {execution_provider} provider configuration")
                    dlc_globals.execution_providers = [execution_provider]
                
                self.execution_providers = dlc_globals.execution_providers
                logger.info(f"Global execution providers set to: {dlc_globals.execution_providers}")
                
                # Reset and initialize face swapper with new provider
                logger.info("Resetting face swapper module")
                from DeepLiveCam.modules.processors.frame import face_swapper
                face_swapper.FACE_SWAPPER = None
                
                # Explicitly set the model path in the face_swapper module
                face_swapper.models_dir = self.models_dir
                logger.info(f"Face swapper models directory set to: {self.models_dir}")
                
                # Log the provider being applied
                logger.info(f"Applying execution provider: {execution_provider}")
                logger.info(f"Provider configuration: {dlc_globals.execution_providers}")
                
                # Get the face swapper with requested provider - NO FALLBACK
                logger.info("Calling get_face_swapper()...")
                self.face_swapper = get_face_swapper(providers=dlc_globals.execution_providers)
                logger.info("get_face_swapper() completed successfully")
                
                self.initialized = True
                
                # Check the actual session info from ONNX Runtime
                if hasattr(self.face_swapper, 'session') and hasattr(self.face_swapper.session, 'get_providers'):
                    actual_providers = self.face_swapper.session.get_providers()
                    logger.info(f"Face swapper session actual providers: {actual_providers}")
                    
                    # NO FALLBACK - If we requested CUDA and didn't get it, raise an error
                    if execution_provider == "CUDAExecutionProvider" and execution_provider not in actual_providers:
                        error_msg = f"CRITICAL: Requested CUDA provider but got {actual_providers}. CUDA initialization failed!"
                        logger.error(error_msg)
                        raise RuntimeError(error_msg)
                        
                    logger.info(f"SUCCESS: Face swapper initialized with correct providers: {actual_providers}")
                elif hasattr(self.face_swapper, 'providers'):
                    logger.info(f"Face swapper providers attribute: {self.face_swapper.providers}")
                else:
                    logger.warning("Cannot determine actual providers used by face swapper")
                    
                logger.info("=== Face Swapper Initialization Complete ===")
                    
            except Exception as e:
                logger.error(f"=== FACE SWAPPER INITIALIZATION FAILED ===")
                logger.error(f"Error: {str(e)}")
                logger.error(f"Error type: {type(e).__name__}")
                logger.error(f"Full error details:", exc_info=True)
                logger.error(f"=== END ERROR DETAILS ===")
                # Re-raise the original error without any fallback
                raise
    
    def _process_source_image(self, source_tensor):
        """Extract face from the source tensor image."""
        if not self.last_source_image is None and torch.equal(source_tensor, self.last_source_image):
            return self.last_source_face
        else:
            self.last_source_image = None
            self.last_source_face = None

        try:
            # Convert from tensor to numpy array (ComfyUI uses RGB format)
            if len(source_tensor.shape) == 4:
                source_np = source_tensor[0].cpu().numpy()
            else:
                source_np = source_tensor.cpu().numpy()
            
            # Convert from float [0,1] to uint8 [0,255] and RGB to BGR for OpenCV
            source_img = (source_np * 255).astype(np.uint8)
            source_img = cv2.cvtColor(source_img, cv2.COLOR_RGB2BGR)
            
            # Get the source face
            source_face = get_one_face(source_img)
            if source_face is None:
                raise ValueError("No face detected in source image")
            
            self.last_source_image = source_tensor
            self.last_source_face = source_face
            return source_face
        except Exception as e:
            logger.error(f"Error processing source face: {str(e)}")
            raise RuntimeError(f"Error processing source face: {str(e)}")
    
    @classmethod
    def INPUT_TYPES(cls):
        available_providers = get_available_execution_providers()
        provider_names = [p[0] for p in available_providers]
        
        return {
            "required": {
                "image": ("IMAGE",),
                "source_image": ("IMAGE",),
                "execution_provider": (provider_names, {"default": "CPUExecutionProvider"}),
                "many_faces": ("BOOLEAN", {"default": False}),
                "mouth_mask": ("BOOLEAN", {"default": False}),
            }
        }
    
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "process_image"
    CATEGORY = "face_swap"
    
    def process_image(self, image, source_image, execution_provider="CPUExecutionProvider", many_faces=False, mouth_mask=False):
        """
        Process the input image by applying face swapping.
        
        Args:
            image: Input image tensor from ComfyUI (RGB format)
            source_image: Source image tensor containing the face to swap
            execution_provider: ONNX Runtime execution provider
            many_faces: Whether to process all detected faces
            mouth_mask: Whether to apply mouth masking
        
        Returns:
            Processed image tensor
        """
        # Initialize face swapper if needed
        self._init_face_swapper(execution_provider)
        
        # Extract face from source image tensor

        self.source_face = self._process_source_image(source_image)
        
        # Check if source face is loaded
        if self.source_face is None:
            logger.warning("No source face loaded. Please provide a valid source image with a detectable face.")
            return (image,)
        
        # Set global variables for deep live cam
        dlc_globals.many_faces = many_faces
        dlc_globals.mouth_mask = mouth_mask
        
        # Handle batch processing - create output tensor with same batch size
        batch_size = image.shape[0]
        device = image.device
        
        # Initialize progress bar
        #pbar = ProgressBar(batch_size)
        
        # Convert entire batch to numpy at once - more efficient
        frames_np = image.cpu().numpy()
        
        # Convert from float [0,1] to uint8 [0,255] for entire batch at once
        frames_uint8 = (frames_np * 255).astype(np.uint8)
        
        # Process each image in the batch
        result_batch = []
        for i in range(batch_size):
            # Get single image from batch
            frame_uint8 = frames_uint8[i]
            
            # Convert RGB to BGR for OpenCV
            frame = cv2.cvtColor(frame_uint8, cv2.COLOR_RGB2BGR)
            
            # Process the frame
            if many_faces:
                target_faces = get_many_faces(frame)
                if target_faces:
                    for target_face in target_faces:
                        frame = swap_face(self.source_face, target_face, frame)
            else:
                target_face = get_one_face(frame)
                if target_face:
                    frame = swap_face(self.source_face, target_face, frame)
                else:
                    logger.warning(f"No face detected in input frame {i}")
            
            # Convert back to RGB for ComfyUI
            result_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result_batch.append(result_rgb)
            
            # Update progress bar
            #pbar.update(1)
        
        # Stack results and convert back to float32 [0,1] all at once
        result_stacked = np.stack(result_batch).astype(np.float32) / 255.0
        
        # Convert all results to tensor at once
        result_tensor = torch.from_numpy(result_stacked).to(device)
        
        return (result_tensor, frame)

# Node class mappings
NODE_CLASS_MAPPINGS = {
    "DeepLiveCamNode": DeepLiveCamNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DeepLiveCamNode": "Deep Live Cam Face Swap"
}
