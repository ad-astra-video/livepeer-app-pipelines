
# Live Video AI Processing using Livepeer

This pipeline is an example of a real-time video processing application that enables live AI processing on the video frames of the stream using BYOC streaming.

## Quick Start

### Prerequisites

- Docker and Nvidia Container Toolkit installed
- Camera and/or microphone (optional, screen sharing supported)
- Access to an Nvidia GPU for AI processing

### Launch the Application

1. **Clone the repository** (if not already done):
   ```bash
   git clone https://github.com/ad-astra-video/livepeer-app-pipelines.git
   cd byoc-stream
   ```

3. **Create required directories**:
   ```bash
   mkdir -p data/models
   mkdir -p data/orchestrator
   mkdir -p data/gateway
   ```

4. **Configure the environment (see instructions below)**

5. **Start all services**:
   ```bash
   docker network create --driver bridge --subnet 172.28.0.0/16 byoc-stream
   docker-compose up -d
   
   #start the worker and register to the Orchestrator
   cd worker/[worker folder want to run] (e.g. cd worker/passthrough)
   docker-compose up ai-runner register-worker -d
   #if want to put SSL in front of runner. This would only be used
   #docker-compose up runner-proxy -d

   ```

6. **Access the Web Interface**:
   - Open your browser and navigate to: `https://localhost:8088`
   - The application will be ready to use immediately

### Services Overview

The Docker Compose setup includes:

- **Web UI** (`localhost:8088`) - Main Application Interface (or port 3001 if running npm dev server)
- **Gateway** (`localhost:5937`) - Livepeer Gateway Node
- **Orchestrator** (`localhost:9995`) - Livepeer Orchestrator Node
- **MediaMTX** (`localhost:8889`) - Media Server for RTMP/WebRTC
- **Kafka** (`localhost:9092`) - Event Streaming Platform
- **Kafka Web UI** (`localhost:8080`) - [Kafbat web ui](https://github.com/kafbat/kafka-ui) for Kafka server
- **Zilla** (`localhost:7114`) - [Zilla](https://github.com/aklivity/zilla) bridge for getting Kafka events over SSE, basic SSE interface at `localhost:7114/index.html`
- **Worker** - AI processing container (pytrickle)

__Documentation__
In progress - examples in this repo provide documentation via code on how to integrate with Livepeer BYOC batch and streaming workloads.

## 🛠️ Configuration

### **Environment Setup**

#### Setup .env file
   Create a copy of the .env.template to use locally
   ```bash
   cp .env.template .env
   ```
   
   - Update `HOST` to match to your local network ip address or the ip address of the remote machine using.  The domain `192.168.50.16.sslip.io` will resolve to `192.168.50.16` which enables the Caddy webserver to do self signed SSL certificates appropriately.
   - Update `HOST_IP` to be accesible IP address.  This is added to the IPs available on the gateway WHIP ingest.
   - Set `ARB_ETH_URL` if have an alternative endpoint available
   - Set `AI_MODELS_DIR` to path this repo is in so it points to `data/models` in this folder.  The path must be the absolute path and cannot be a relative path to the .env file.
   - Set `ORCH_SERVICE_ADDR` if on a separate machine. If running all on same machine do not change.

   If have your own domain name, update `webserver/Caddyfile` to replace `tls internal` with `tls [path to cert] [path to key]` or if have access to ports 80/443 you can use [automatic https with Caddy (link to docs)](https://caddyserver.com/docs/automatic-https).
#### **Gateway Configuration**
- Consider using a unique `-ethUrl`.  The default Arbiturm rpc url has limited rate limits and can cause issues at startup sometimes. Some options are infura, alchemy, and dprc.
- Update `-ethPassword` to be the password for your Ethereum wallet file
- If want to run with a specific eth address, copy encrypted Ethereum wallet JSON to `data/gateway/keystore` or add a volume in `volumes` for the `keystore` folder like `- ./data/gateway/keystore:/data/keystore` to reuse the first one created

#### **Orchestrator Configuration**
- Consider using a unique `-ethUrl`.  The default Arbiturm rpc url has limited rate limits and can cause issues at startup sometimes. Some options are infura, alchemy, and dprc.
- Change `-ethOrchAddr` to your on-chain orchestrator address if testing on-chain (defaults to AI SPE Orchestrator eth address)
- for off-chain testing: set `-network` to `offchain`

#### **Worker Configuration**
- Setup the worker you want to run in the worker folder per the README.md in that folder

#### **MediaMTX Configuration** ####
- If running MediaMTX on a separate machine add the IP address to `mediamtx.yml`
  - example `webrtcAdditionalHosts: [192.168.1.1]`


### **Default Endpoints**
- **Web UI**: `https://localhost:8088 (or at https://$HOST:8088, HOST set in .env file)`
- **WHIP Server**: `http://localhost:7280`
- **WHEP Server**: `http://localhost:8890`
- **Data Stream**: `http://localhost:5937`
- **Kafka Events**: `http://localhost:7114`
- **MediaMTX**: `http://localhost:8889`

## Monitoring

### **Stream Health**
- Real-time connection status monitoring
- Automatic quality issue detection
- Performance metrics tracking
- Recovery mechanism status

### **Event Tracking**
- Kafka-based event streaming
- Real-time log viewing in web interface
- Stream lifecycle monitoring
- Error tracking and debugging

## 🎥 Web UI Features

### Publisher (Stream) Section

#### **Video Preview & Controls**
- **Live Camera Preview**: Real-time preview of your camera feed
- **Screen Sharing**: Capture and stream your desktop
- **Video/Audio Toggle**: Enable/disable video and audio tracks
- **Live Status Indicator**: Shows "LIVE" when streaming is active

#### **Media Source Selection**
- **Camera Selection**: Choose from available cameras
- **Microphone Selection**: Choose from available audio input devices
- **Screen Share Toggle**: Switch between camera and screen capture
- **Device Status**: Visual indicators showing ready/incomplete setup
- **Auto-refresh**: Refresh device list to detect new hardware

#### **Stream Configuration**
- **Stream Start URL**: Configure the streaming server endpoint (default: `http://localhost:5937/process/stream`)
- **Stream Name**: Custom stream identifier
- **Pipeline**: AI processing pipeline selection (default: video-analysis)
- **Resolution Picker**: Choose from 512x512 to 4K (3840x2160)
- **Frame Rate Limit**: Adjustable from 10-60 FPS
- **Real-time Updates**: Modify prompts and resolution while streaming

#### **Custom Parameters**
- Add parameters that will be sent to the stream start endpoint to configure the stream at startup
- If sending updates, stream will update the configurable parameters while stream running. This will vary with each pipeline.  See the `update_params` function in `worker/worker.py` to see what is updateable.  For video-analysis, the chat history length, max new tokens and user prompt are configurable while stream is running.

#### **Advanced Features**
- **Connection Status Indicators**: 
  - 🟢 **Good Connection**: Stream running smoothly (green WiFi icon)
  - 🟡 **Issues Detected**: Quality problems identified (red WiFi with issue count)
  - 🔄 **Recovering**: Automatic recovery in progress (spinning refresh icon)
- **Status Modal**: Click status indicators to view detailed stream information with JSON data
- **Manual Recovery**: Force reconnection if automatic recovery fails
- **SDP Inspection**: View WebRTC offer/answer SDP data for debugging

#### **Real-time Statistics**
- **Publisher Stats Display**:
  - Bitrate (kbps)
  - Frame rate (FPS)
  - Current resolution
  - Stream ID
- **Quality Monitoring**: Automatic detection of connection issues
- **Recovery Attempts**: Track reconnection attempts

### Viewer Section

#### **Stream Playback**
- **WebRTC Viewer**: WebRTC playback of output stream using WHEP (default: `http://localhost:8890`)

### Data Monitoring

#### **Tabbed Data View**
- **Event Logs**: Real-time streaming events from Kafka events via SSE provided by Zilla
- **Data Output**: Data output from stream via SSE

### Settings & Configuration

#### **Settings Modal** (⚙️ icon in header)
- **URL Configuration**: Set default WHIP/WHEP endpoints
- **Persistent Storage**: Settings saved to browser localStorage

## Technical Features

### **Streaming Protocols**
- **WHIP (WebRTC-HTTP Ingestion Protocol)**: For publishing streams
- **WHEP (WebRTC-HTTP Egress Protocol)**: For consuming streams
- **RTMP (Real-Time Messaging Protocol)**: Support RTMP input and RTMP outputs

### **AI Integration**
- **Livepeer AI**: Integration with Livepeer's BYOC streaming processing network
- **Real-time Processing**: Live video transformation using AI models
- **Multiple Pipelines**: Support for different AI processing workflows
- **Prompt Engineering**: Dynamic modification of backend settings during streaming

### **Media Processing**
- **Multi-format Support**: Camera, screen sharing, and microphone input
- **Quality Control**: FPS limiting and resolution selection

### **Monitoring & Debugging**
- **Real-time Stats**: WebRTC statistics collection
- **SDP Debugging**: Full WebRTC session description inspection

## Troubleshooting

### **Common Issues**

1. **Camera/Microphone Access**:
   - Ensure browser permissions are granted
   - Check device availability in system settings
   - Try refreshing the device list using the refresh button

2. **Streaming Connection**:
   - Verify WHIP endpoint URL is correct in settings
   - Check network connectivity
   - Use manual recovery button if automatic fails

3. **No Video Preview**:
   - Check camera permissions in browser
   - Try different camera selections
   - Ensure camera isn't used by another application

4. **Status Modal Shows No Data**:
   - Verify stream is active and connected
   - Check that stream ID is properly set
   - Try refreshing the status using the refresh button in modal

5. **Docker Services Not Starting**:
   - Ensure Docker is running
   - Check port availability (8088, 5937, 8890, etc.)
   - Review docker-compose logs: `docker-compose logs`

### **Debugging Tools**
- Browser Developer Console for WebRTC logs
- SDP inspection modal for connection debugging
- Real-time stats for performance monitoring
- Event logs for system status
- Status modal for stream-specific information

### **Performance Tips**
- Use lower resolutions for better performance on limited hardware
- Reduce frame rate if experiencing quality issues
- Monitor connection status indicators for optimal streaming

## Advanced Configuration

### **Custom AI Models**
- Refer to worker instructions for where to put models in `data/models` folder

### **Network Configuration**
- All endpoints can be customized through the Settings modal
- Changes are automatically saved and applied across the application
- Configure for production deployment with proper DNS and certificates


