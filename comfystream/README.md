
# Comfystream - Livepeer Live Video-to-Video Processing

Comfystream is a real-time video processing application that enables live video-to-video transformation using AI models through the Livepeer network. It provides a complete streaming infrastructure solution with a modern local testing web interface to build and test workflows locally.

## 🚀 Quick Start

### Prerequisites

- Docker and Nvidia Container Toolkit installed
- Modern web browser with WebRTC support
- Camera and/or microphone (optional, screen sharing supported)
- Access to an Nvidia GPU for AI processing

### Launch the Application

1. **Clone the repository** (if not already done):
   ```bash
   git clone https://github.com/ad-astra-video/livepeer-app-pipelines.git
   cd comfystream
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
   docker-compose up -d
   ```

6. **Access the Web Interface**:
   - Open your browser and navigate to: `https://localhost:3001`
   - The application will be ready to use immediately

### Services Overview

The Docker Compose setup includes:

- **Web UI** (`localhost:3001`) - Main Application Interface
- **Gateway** (`localhost:5937`) - Livepeer Gateway Node
- **Orchestrator** (`localhost:8890`) - Livepeer Orchestrator Node
- **MediaMTX** (`localhost:8889`) - Media Server for RTMP/WebRTC
- **Kafka** (`localhost:9092`) - Event Streaming Platform
- **Kafka Web UI** (`localhost:8080`) - [Kafbat web ui](https://github.com/kafbat/kafka-ui) for Kafka server
- **Zilla** (`localhost:7114`) - [Zilla](https://github.com/aklivity/zilla) bridge for getting Kafka events over SSE, basic SSE interface at `localhost:7114/index.html`
- **Worker** - AI processing container (comfystream) - setup in `worker/aimodels.json`

__Documentation__
- [Livepeer Gateway](https://docs.livepeer.org/gateways/guides/gateway-overview)
- [Livepeer Orchestrator](https://docs.livepeer.org/orchestrators/guides/get-started)
- [Comfystream](https://comfystream.mintlify.app)

## 🛠️ Configuration

### **Environment Setup**

#### **Gateway Configuration**
- Consider using a unique `-ethUrl`.  The default Arbiturm rpc url has limited rate limits and can cause issues at startup sometimes. Some options are infura, alchemy, dprc or if you are an Orchestrator or Delegator you can use https://livepeer.rpcgarage.xyz/
- Update `-ethPassword` to be the password for your Ethereum wallet file
- If want to run with a specific eth address, copy encrypted Ethereum wallet JSON to `data/gateway/keystore` or add a volume in `volumes` for the `keystore` folder like `- ./data/gateway/keystore:/data/keystore` to reuse the first one created

#### **Orchestrator Configuration**
- Consider using a unique `-ethUrl`.  The default Arbiturm rpc url has limited rate limits and can cause issues at startup sometimes. Some options are infura, alchemy, dprc or if you are an Orchestrator or Delegator you can use https://livepeer.rpcgarage.xyz/
- Change `-ethOrchAddr` to your on-chain orchestrator address if testing on-chain (defaults to AI SPE Orchestrator eth address)
- For off-chain testing: set `-network` to `offchain`

#### **Worker Configuration**
- Review `worker/aimodels.json` to adjust settings as needed.

#### **MediaMTX Configuration** ####
- If running MediaMTX on a separate machine add the IP address to `mediamtx.yml`
  - example `webrtcAdditionalHosts: [192.168.1.10]`


### **Default Endpoints**
- **Web UI**: `https://localhost:3001`
- **WHIP Server**: `http://localhost:7280`
- **WHEP Server**: `http://localhost:8890`
- **Data Stream**: `http://localhost:5937`
- **Kafka Events**: `http://localhost:7114`
- **MediaMTX**: `http://localhost:8889`

## 📊 Monitoring

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
- **WHIP Endpoint URL**: Configure the streaming server endpoint (default: `http://localhost:5937/live/video-to-video`)
- **Stream Name**: Custom stream identifier
- **Pipeline**: AI processing pipeline selection (default: comfystream)
- **Resolution Picker**: Choose from 512x512 to 4K (3840x2160)
- **Frame Rate Limit**: Adjustable from 10-60 FPS
- **Real-time Updates**: Modify prompts and resolution while streaming

#### **AI Prompts**
- **Three Prompt Inputs**: Primary, secondary, and tertiary prompts for AI processing
  - One prompt at a time is well supported. More than one is not well supported and may just not work (will remove this note when support is improved)
- **Live Updates**: Change prompts during active streaming
- **Flexible Input**: Single prompt or multiple prompts supported
- **Update Button**: Apply changes to the live stream

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
- **WebRTC Viewer**: Low-latency stream viewing
- **WHEP Protocol**: Industry-standard viewer protocol (default: `http://localhost:8890`)
- **Auto-connection**: Seamless connection to available streams
- **Playback Controls**: Start/stop viewing with connection status

### Data Monitoring

#### **Tabbed Data View**
- **Event Logs**: Real-time streaming events and status updates
- **Stream Analytics**: Detailed streaming metrics and performance data
- **Kafka Integration**: Live event streaming from the processing pipeline

### Settings & Configuration

#### **Settings Modal** (⚙️ icon in header)
- **URL Configuration**: Set default WHIP/WHEP endpoints
- **Persistent Storage**: Settings saved to browser localStorage
- **Real-time Updates**: Changes applied immediately across components

## 🔧 Technical Features

### **Streaming Protocols**
- **WHIP (WebRTC-HTTP Ingestion Protocol)**: For publishing streams
- **WHEP (WebRTC-HTTP Egress Protocol)**: For consuming streams
- **ICE/STUN Support**: NAT traversal for reliable connections
- **Adaptive Quality**: Automatic issue detection and recovery

### **AI Integration**
- **Livepeer AI**: Integration with Livepeer's AI processing network
- **Real-time Processing**: Live video transformation using AI models
- **Multiple Pipelines**: Support for different AI processing workflows
- **Prompt Engineering**: Dynamic prompt modification during streaming

### **Media Processing**
- **WebRTC**: Modern web-based real-time communication
- **Multi-format Support**: Camera, screen sharing, and microphone input
- **Quality Control**: FPS limiting and resolution selection
- **Cross-browser Compatibility**: Works in Chrome, Firefox, Safari, Edge

### **Monitoring & Debugging**
- **Real-time Stats**: WebRTC statistics collection
- **Connection Monitoring**: Automatic issue detection and recovery
- **SDP Debugging**: Full WebRTC session description inspection
- **Event Logging**: Comprehensive event tracking through Kafka

## 📱 Usage Scenarios

### **Content Creation**
- Stream live video content with AI-enhanced processing
- Apply real-time visual effects and transformations
- Create interactive live streams with dynamic prompts

### **Video Conferencing**
- Enhanced video calls with AI-powered background effects
- Real-time video processing for professional presentations
- Screen sharing with AI enhancements

### **Development & Testing**
- Test WebRTC streaming implementations
- Debug video processing pipelines
- Monitor streaming performance and quality


## 🆘 Troubleshooting

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
   - Check port availability (3000, 5937, 8890, etc.)
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

## 📝 Advanced Configuration

### **Custom AI Models**
- Models can be placed in the `data/models` directory
- Configure pipeline parameters through the web interface
- Modify worker configuration for custom processing

### **Network Configuration**
- All endpoints can be customized through the Settings modal
- Changes are automatically saved and applied across the application
- Configure for production deployment with proper DNS and certificates


    
