import asyncio
import logging
import json
import base64
import io
import uuid

import av
import numpy as np
import torch
from aiohttp import web
from PIL import Image

from pytrickle.stream_processor import StreamProcessor
from pytrickle.frames import VideoFrame, AudioFrame
from typing import Union, Dict, List

from aiortc import RTCPeerConnection, RTCConfiguration, RTCIceCandidate, RTCIceServer, RTCSessionDescription, MediaStreamTrack
from aiortc.sdp import candidate_from_sdp, candidate_to_sdp
import re

# Change to DEBUG to see frame logs
logging.basicConfig(level=logging.INFO, format="%(asctime)s;%(levelname)s;%(message)s")
logging.getLogger("aiortc").setLevel(logging.ERROR)
logger = logging.getLogger()

sp: StreamProcessor | None = None
pcs = {}

async def send_frame(frame: Union[av.VideoFrame, av.AudioFrame]):
    """Send frame to processor if available."""
    global sp
    logger.debug(f"Received frame to send: {type(frame)}")
    
    if isinstance(frame, av.VideoFrame):
        frame_np = frame.to_ndarray(format="rgb24").astype(np.float32) / 255.0
        frame_tensor = torch.from_numpy(frame_np)
        logger.debug(f"Processing video frame: {frame_tensor.shape}")
        if sp:
            await sp.send_input_frame(VideoFrame.from_av_video(frame_tensor, frame.pts, frame.time_base))
    elif isinstance(frame, av.AudioFrame):
        # Add audio processing if needed
        logger.debug(f"Received audio frame: {frame.pts}")
        if sp:
            await sp.send_input_frame(AudioFrame.from_av_audio(frame))

async def receive_video_frames(track):
    """Continuously receive video frames from a track."""
    try:
        while True:
            frame = await track.recv()
            #logger.info(f"Received video frame: pts={frame.pts}, time_base={frame.time_base}, format={frame.format}")
            await send_frame(frame)
    except Exception as e:
        logger.info(f"Video track ended: {e}")

async def receive_audio_frames(track):
    """Continuously receive audio frames from a track."""
    try:
        while True:
            frame = await track.recv()
            #logger.info(f"Received audio frame: pts={frame.pts}, time_base={frame.time_base}, format={frame.format}")
            await send_frame(frame)
    except Exception as e:
        logger.info(f"Audio track ended: {e}")

async def wait_for_ice_gathering(pc: RTCPeerConnection):
    if pc.iceGatheringState == "complete":
        return
    fut = asyncio.get_event_loop().create_future()

    @pc.on("icegatheringstatechange")
    def on_ice_state_change():
        if pc.iceGatheringState == "complete" and not fut.done():
            fut.set_result(True)

    await fut

async def replace_host_ip(sdp_text: str, new_ip: str) -> str:
    """Replace the IP address in SDP candidate lines before 'typ host'."""
    lines = sdp_text.splitlines()
    updated_lines = []

    for line in lines:
        if "a=candidate:" in line and "typ host" in line:
            logger.debug("Replacing host IP in SDP")
            line = re.sub(
                r"\b(?:\d{1,3}\.){3}\d{1,3}\b(?=\s+\d+\s+typ host$)",
                new_ip,
                line
            )
        updated_lines.append(line)
    
    return "\r\n".join(updated_lines) + "\r\n"

async def whip(request):
    sdp = await request.text()
    logger.info("Received SDP offer:\n%s", sdp)
    
    pc = RTCPeerConnection(
        configuration=RTCConfiguration(
            iceServers=[RTCIceServer("stun:stun.l.google.com:19302")]
        ),
    )

    # Add connection state monitoring
    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        logger.info(f"Connection state is {pc.connectionState}")

    @pc.on("iceconnectionstatechange") 
    async def on_iceconnectionstatechange():
        logger.info(f"ICE connection state is {pc.iceConnectionState}")

    @pc.on("track")
    def on_track(track):
        logger.info(f"Incoming track: {track.kind} - ID: {track.id}")
        
        @track.on("ended")
        def on_ended():
            logger.info(f"Track {track.kind} ended")
        
        # Start receiving frames from the track
        if track.kind == "video":
            asyncio.create_task(receive_video_frames(track))
        elif track.kind == "audio":
            asyncio.create_task(receive_audio_frames(track))

    # Set remote description (the offer from client)
    remote_offer = RTCSessionDescription(sdp=sdp, type="offer")
    await pc.setRemoteDescription(remote_offer)

    # Create and set local answer
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    
    # Wait until ICE candidates are gathered
    await wait_for_ice_gathering(pc)
    modified_sdp = await replace_host_ip(pc.localDescription.sdp, "127.0.0.1")
    
    logger.info("Sending SDP answer:\n%s", modified_sdp)
    
    session_id = str(uuid.uuid4())
    pcs[session_id] = pc
    
    base_url = str(request.url)
    location = f"{base_url}/{session_id}"
    
    return web.json_response(
        text=modified_sdp,
        content_type="application/sdp",
        status=201,
        headers={
            "Location": location,
            "Access-Control-Expose-Headers": "*",
            "Access-Control-Allow-Origin": "*",
        }
    )

async def whip_options(request):
    return web.Response(
        status=204,  # No content
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "3600",
        }
    )

async def whip_delete(request):
    session_id = request.match_info["session_id"]
    pc = pcs.pop(session_id, None)

    if pc:
        logger.info(f"Closing WHIP session {session_id}")
        await pc.close()
        return web.Response(status=200, text="Session terminated")
    else:
        return web.Response(status=404, text="Session not found")

if __name__ == "__main__":
    logger.info("Starting video generator worker")

	#if want to load things or run a call on stop use:
    #  model_loader=load_model,
    #  on_stream_stop=on_stream_stop,
    sp = StreamProcessor(
        name="game-gen",
    )

    # Register your WebRTC offer endpoint directly on processor
    sp.server.add_route("POST", "/whip", whip)
    sp.server.add_route("DELETE", "/whip/{session_id}", whip_delete)
    sp.server.add_route("OPTIONS", "/whip", whip_options)
    sp.server.add_route("OPTIONS", "/whip/{session_id}", whip_options)

    try:
        asyncio.run(sp.run_forever())
    except KeyboardInterrupt:
        pass