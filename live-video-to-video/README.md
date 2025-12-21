
# Live-Video-to-Video - Livepeer Live Video-to-Video Processing

Live-Video-to-Video is a real-time video processing application that enables live video-to-video transformation using AI models through the Livepeer network. It provides a complete streaming infrastructure solution with a local testing web interface to build and test workflows.

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
   cd live-video-to-video
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
   
   # note if want to test specific Orchestrator, update .env 
   #   to point to on chain orchestrator and do not start Orchestrator here
   # docker compose up webserver webapp mediamtx gateway kafka kafka-init kafaka-sse-api
   ```

6. **Access the Web Interface**:
   - Open your browser and navigate to: `https://localhost:8088`
   - The application will be ready to use immediately

### Services Overview

The Docker Compose setup includes:

- **Web UI** (`localhost:8088`) - Main Application Interface (or port 3001 if running npm dev server)
- **Gateway** (`localhost:5937`) - Livepeer Gateway Node
- **Orchestrator** (`localhost:8890`) - Livepeer Orchestrator Node
- **MediaMTX** (`localhost:8889`) - Media Server for RTMP/WebRTC
- **Kafka** (`localhost:9092`) - Event Streaming Platform
- **Kafka Web UI** (`localhost:8080`) - [Kafbat web ui](https://github.com/kafbat/kafka-ui) for Kafka server
- **Zilla** (`localhost:7114`) - [Zilla](https://github.com/aklivity/zilla) bridge for getting Kafka events over SSE, basic SSE interface at `localhost:7114/index.html`
- **Worker** - AI processing container - setup in `worker/aimodels.json`

__Documentation__
- [Livepeer Gateway](https://docs.livepeer.org/gateways/guides/gateway-overview)
- [Livepeer Orchestrator](https://docs.livepeer.org/orchestrators/guides/get-started)

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

   If have your own domain name, update `webserver/Caddyfile` to replace `tls internal` with `tls [path to cert] [path to key]` or if have access to ports 80/443 you can use [automatic https with Caddy (link to docs)](https://caddyserver.com/docs/automatic-https).
#### **Gateway Configuration**
- Consider using a unique `-ethUrl`.  The default Arbiturm rpc url has limited rate limits and can cause issues at startup sometimes. Some options are infura, alchemy, dprc or if you are an Orchestrator or Delegator you can use https://livepeer.rpcgarage.xyz/
- Update `-ethPassword` to be the password for your Ethereum wallet file
- If want to run with a specific eth address, copy encrypted Ethereum wallet JSON to `data/gateway/keystore` or add a volume in `volumes` for the `keystore` folder like `- ./data/gateway/keystore:/data/keystore` to reuse the first one created

#### **Orchestrator Configuration**
- Consider using a unique `-ethUrl`.  The default Arbiturm rpc url has limited rate limits and can cause issues at startup sometimes. Some options are infura, alchemy, dprc or if you are an Orchestrator or Delegator you can use https://livepeer.rpcgarage.xyz/
- Change `-ethOrchAddr` to your on-chain orchestrator address if testing on-chain (defaults to AI SPE Orchestrator eth address)
- for off-chain testing: set `-network` to `offchain`

#### **Worker Configuration**
- Review `worker/aimodels.json` to adjust settings as needed.

#### **MediaMTX Configuration** ####
- If running MediaMTX on a separate machine add the IP address to `mediamtx.yml`
  - example `webrtcAdditionalHosts: [192.168.1.10]`


### **Default Endpoints**
- **Web UI**: `https://localhost:8088 (or at https://$HOST:8088, HOST set in .env file)`
- **WHIP Server**: `http://localhost:7280`
- **WHEP Server**: `http://localhost:8890`
- **Data Stream**: `http://localhost:5937`
- **Kafka Events**: `http://localhost:7114`
- **MediaMTX**: `http://localhost:8889`

## 📊 Monitoring

### **Event Tracking**
- Kafka-based event streaming
- Real-time log viewing in web interface
- Stream lifecycle monitoring
- Error tracking and debugging

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

