# Deep Live Cam and Deep Fake Detection

This node integrates the face-swapping capabilities from Deep Live Cam, allowing you to perform real-time face swapping on images and video streams.

## Features

- Real-time face swapping on images or video streams
- Option to process multiple faces in the same frame
- Mouth masking to preserve mouth movements from the original image/video
- Support for GPU acceleration through various ONNX Runtime execution providers

- Detect deep fake when active (in development)
- C2PA signing service when a segment does not have a deep fake (in development)

## Setup

1. Pull in submodules `git submodule update --init`
2. Create models folder in `data/models/deep-live-cam`
3. Download detect models from `https://huggingface.co/ad-astra-video/deep-live-cam` and put in `data/models/deep-live-cam` folder.  Models needed for DeepLiveCam will download automatically.
4. Copy `.env.worker` to `.env` and update variables to values applicable to the runner
5. Build worker docker image:  `docker build -f Dockerfile.worker -t deep-live-cam-worker:latest .`

## Launch

```
#no runner proxy
docker compose up ai-runner register-worker -d

#with runner proxy
docker compose up -d
```

Note: the startup takes a little while to load the models. Different execution providers may have different devices. If all models load successfully will see log lines as follows:

```
MTCNN initialized on device: cuda
Effort model initialized on device: cuda
Load HRNet-W48
FaceXray model initialized on device: cuda
```
## Usage

Supported fields are below and can be sent from UI or as POST request to `/ai/stream/{stream id}/update`.  The update url is returned from the `/ai/stream/start` POST request.

1. Select execution provider, defaults to CUDAExecutionProvider
   - must be set in start request if not using default.
   - Send `execution_provider` with value set to options listed below.
1. Add source image to fake
   - send base64 encoded `source_image` with value being the base64 encoded string
2. Turn off deep fake alternations
   - send `do_deep_fake` as `false`
3. Process multiple faces
   - send `many_faces` as `true`
4. Mask the mouth separately to enhance the result
   - send `mouth_mask` as `true`

## Tested Versions

Tested with the following versions:
- PyTorch 2.5.1+cu118 (NVIDIA GPU)
- PyTorch 2.5 (CPU/Mac)

## Execution Providers and Performance Tips

- For best performance, select the appropriate execution provider:
  - **CUDAExecutionProvider**: For NVIDIA GPUs
  - **TensorrtExecutionProvider**: For NVIDIA GPUs
  - **ROCMExecutionProvider**: For AMD GPUs
  - **DmlExecutionProvider**: For Windows DirectX-compatible GPUs
  - **CPUExecutionProvider**: For systems without GPU acceleration
  - **OpenVINOExecutionProvider**: For Intel GPUs
- Processing multiple faces will be more demanding on resources
- Consider using a lower resolution for smoother performance
- Adjust the input FPS down until playback is smooth (suggest start at 30fps and move down 5fps each iteration until smooth)

## Troubleshooting

- If no face is detected, the original frame will be returned unchanged
- If you encounter issues with a particular execution provider, try falling back to CPU
- Check the logs for detailed error information if you encounter issues 

## Credits

- [ComfyUI Node for Deep Live Cam](https://github.com/ryanontheinside/ComfyUI-DeepLiveCam)
- [Deep Live Cam](https://github.com/hacksider/Deep-Live-Cam)