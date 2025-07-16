/**
 * WebRTC Connection Resilience Utilities
 * Provides functionality for making WHIP/WHEP connections more resilient to disconnects and quality loss
 */

import { sendIceRestartRequest } from '../api'

export interface ResilienceConfig {
  maxReconnectAttempts: number
  reconnectBackoffMs: number
  qualityCheckIntervalMs: number
  connectionTimeoutMs: number
  iceRestartThresholdMs: number
  qualityThresholds: {
    minBitrate: number // kbps
    maxLatency: number // ms
    maxPacketLoss: number // percentage (0-100)
  }
  // ICE restart configuration
  iceRestartEndpoint?: string // Base URL for ICE restart
  streamId?: string | null // Current stream ID
  connectionType?: 'whip' | 'whep' // Connection type for determining endpoint
}

export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  maxReconnectAttempts: 5,
  reconnectBackoffMs: 2000,
  qualityCheckIntervalMs: 5000,
  connectionTimeoutMs: 10000,
  iceRestartThresholdMs: 30000,
  qualityThresholds: {
    minBitrate: 100, // 100 kbps minimum
    maxLatency: 500, // 500ms max latency
    maxPacketLoss: 5 // 5% max packet loss
  }
}

export interface ConnectionMetrics {
  bitrate: number
  latency: number
  packetLoss: number
  jitter: number
  lastActivity: number
}

export interface ResilienceState {
  reconnectAttempts: number
  lastReconnectTime: number
  connectionState: RTCPeerConnectionState
  iceConnectionState: RTCIceConnectionState
  isRecovering: boolean
  qualityIssues: string[]
}

export class ConnectionResilient {
  private config: ResilienceConfig
  private state: ResilienceState
  private qualityCheckInterval?: number
  private reconnectTimeout?: number
  private callbacks: {
    onReconnecting?: () => void
    onReconnected?: () => void
    onReconnectFailed?: () => void
    onQualityIssue?: (issue: string) => void
    onQualityRecovered?: () => void
  } = {}

  constructor(config: Partial<ResilienceConfig> = {}) {
    this.config = { ...DEFAULT_RESILIENCE_CONFIG, ...config }
    this.state = {
      reconnectAttempts: 0,
      lastReconnectTime: 0,
      connectionState: 'new',
      iceConnectionState: 'new',
      isRecovering: false,
      qualityIssues: []
    }
  }

  public setCallbacks(callbacks: typeof this.callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  public monitorConnection(pc: RTCPeerConnection) {
    // Monitor connection state changes
    pc.addEventListener('connectionstatechange', () => {
      this.state.connectionState = pc.connectionState
      console.log(`Connection state changed to: ${pc.connectionState}`)
      
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.handleConnectionFailure(pc)
      } else if (pc.connectionState === 'connected') {
        this.handleConnectionRecovered()
      }
    })

    // Monitor ICE connection state changes
    pc.addEventListener('iceconnectionstatechange', () => {
      this.state.iceConnectionState = pc.iceConnectionState
      console.log(`ICE connection state changed to: ${pc.iceConnectionState}`)
      
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        this.handleIceFailure(pc)
      }
    })

    // Start quality monitoring
    this.startQualityMonitoring(pc)
  }

  private startQualityMonitoring(pc: RTCPeerConnection) {
    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval)
    }

    this.qualityCheckInterval = window.setInterval(async () => {
      try {
        const metrics = await this.collectConnectionMetrics(pc)
        this.evaluateQuality(pc, metrics)
      } catch (error) {
        console.error('Error during quality check:', error)
      }
    }, this.config.qualityCheckIntervalMs)
  }

  private async collectConnectionMetrics(pc: RTCPeerConnection): Promise<ConnectionMetrics> {
    const stats = await pc.getStats()
    let bitrate = 0
    let latency = 0
    let packetLoss = 0
    let jitter = 0
    let lastActivity = Date.now()

    stats.forEach((report) => {
      // For outbound streams (publisher)
      if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
        if (report.bytesSent) {
          // Calculate bitrate if we have previous measurements
          const now = Date.now()
          if (this.state.lastReconnectTime) {
            const timeDiff = (now - this.state.lastReconnectTime) / 1000
            bitrate = (report.bytesSent * 8) / timeDiff / 1000 // kbps
          }
        }
        
        if (report.packetsSent && report.packetsLost !== undefined) {
          packetLoss = (report.packetsLost / report.packetsSent) * 100
        }
      }

      // For inbound streams (viewer)
      if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
        if (report.bytesReceived) {
          const now = Date.now()
          if (this.state.lastReconnectTime) {
            const timeDiff = (now - this.state.lastReconnectTime) / 1000
            bitrate = (report.bytesReceived * 8) / timeDiff / 1000 // kbps
          }
        }

        if (report.packetsReceived && report.packetsLost !== undefined) {
          packetLoss = (report.packetsLost / report.packetsReceived) * 100
        }

        if (report.jitter !== undefined) {
          jitter = report.jitter * 1000 // Convert to ms
        }
      }

      // RTT for latency
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        if (report.currentRoundTripTime !== undefined) {
          latency = report.currentRoundTripTime * 1000 // Convert to ms
        }
      }

      // Update last activity timestamp if we're receiving data
      if ((report.type === 'inbound-rtp' || report.type === 'outbound-rtp') && 
          (report.bytesReceived || report.bytesSent)) {
        lastActivity = Date.now()
      }
    })

    return { bitrate, latency, packetLoss, jitter, lastActivity }
  }

  private evaluateQuality(pc: RTCPeerConnection, metrics: ConnectionMetrics) {
    const issues: string[] = []
    
    // Check bitrate
    if (metrics.bitrate > 0 && metrics.bitrate < this.config.qualityThresholds.minBitrate) {
      issues.push(`Low bitrate: ${metrics.bitrate}kbps`)
    }

    // Check latency
    if (metrics.latency > this.config.qualityThresholds.maxLatency) {
      issues.push(`High latency: ${metrics.latency}ms`)
    }

    // Check packet loss
    if (metrics.packetLoss > this.config.qualityThresholds.maxPacketLoss) {
      issues.push(`High packet loss: ${metrics.packetLoss.toFixed(1)}%`)
    }

    // Check for stalled connection (no activity for 10 seconds)
    const timeSinceActivity = Date.now() - metrics.lastActivity
    if (timeSinceActivity > 10000) {
      issues.push(`No activity for ${Math.round(timeSinceActivity / 1000)}s`)
    }

    // Handle quality issues
    if (issues.length > 0) {
      const newIssues = issues.filter(issue => !this.state.qualityIssues.includes(issue))
      newIssues.forEach(issue => {
        console.warn(`Quality issue detected: ${issue}`)
        this.callbacks.onQualityIssue?.(issue)
      })
      
      this.state.qualityIssues = issues

      // Attempt ICE restart for persistent issues
      if (issues.length >= 2 && !this.state.isRecovering) {
        console.log('Multiple quality issues detected, attempting ICE restart')
        this.attemptIceRestart(pc)
      }
    } else if (this.state.qualityIssues.length > 0) {
      // Quality recovered
      console.log('Connection quality recovered')
      this.state.qualityIssues = []
      this.callbacks.onQualityRecovered?.()
    }
  }

  private handleConnectionFailure(pc: RTCPeerConnection) {
    if (this.state.isRecovering) {
      return // Already handling recovery
    }

    console.log('Connection failure detected, attempting recovery')
    this.state.isRecovering = true
    this.callbacks.onReconnecting?.()

    // First try ICE restart
    this.attemptIceRestart(pc)
  }

  private handleIceFailure(pc: RTCPeerConnection) {
    console.log('ICE connection failure detected')
    
    // If we haven't tried ICE restart recently, try it
    const timeSinceLastRestart = Date.now() - this.state.lastReconnectTime
    if (timeSinceLastRestart > this.config.iceRestartThresholdMs) {
      this.attemptIceRestart(pc)
    }
  }

  private async attemptIceRestart(pc: RTCPeerConnection) {
    try {
      console.log('Attempting ICE restart...')
      
      // ICE restart by creating a new offer with iceRestart: true
      if (pc.signalingState === 'stable') {
        const offer = await pc.createOffer({ iceRestart: true })
        await pc.setLocalDescription(offer)
        this.state.lastReconnectTime = Date.now()
        
        // Send ICE restart request to server if endpoint and stream ID are available
        if (this.config.iceRestartEndpoint && this.config.streamId) {
          try {
            await this.sendIceRestartRequest(offer.sdp)
            console.log('ICE restart request sent to server successfully')
          } catch (error) {
            console.error('Failed to send ICE restart request to server:', error)
            // Continue with local ICE restart even if server request fails
          }
        } else {
          console.log('ICE restart offer created - no server endpoint configured')
        }
      }
    } catch (error) {
      console.error('ICE restart failed:', error)
      this.handleRecoveryFailure()
    }
  }

  private async sendIceRestartRequest(offerSdp: string): Promise<void> {
    if (!this.config.iceRestartEndpoint || !this.config.streamId) {
      throw new Error('ICE restart endpoint or stream ID not configured')
    }

    try {
      const answerSdp = await sendIceRestartRequest({
        endpoint: this.config.iceRestartEndpoint,
        streamId: this.config.streamId,
        connectionType: this.config.connectionType,
        offerSdp
      })
      
      // Note: In a complete implementation, you would apply this answer to the peer connection
      // This would require access to the peer connection from the calling context
    } catch (error) {
      throw error
    }
  }

  private handleConnectionRecovered() {
    if (this.state.isRecovering) {
      console.log('Connection recovered successfully')
      this.state.isRecovering = false
      this.state.reconnectAttempts = 0
      this.state.qualityIssues = []
      this.callbacks.onReconnected?.()
    }
  }

  private handleRecoveryFailure() {
    this.state.reconnectAttempts++
    
    if (this.state.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('Maximum reconnection attempts reached, giving up')
      this.state.isRecovering = false
      this.callbacks.onReconnectFailed?.()
      return
    }

    // Schedule next reconnection attempt with exponential backoff
    const backoffTime = this.config.reconnectBackoffMs * Math.pow(2, this.state.reconnectAttempts - 1)
    console.log(`Scheduling reconnection attempt ${this.state.reconnectAttempts} in ${backoffTime}ms`)
    
    this.reconnectTimeout = window.setTimeout(() => {
      // Note: In a real implementation, you would trigger a full reconnection here
      console.log('Time for reconnection attempt - would need to restart connection')
    }, backoffTime)
  }

  public getState(): ResilienceState {
    return { ...this.state }
  }

  public getMetrics(): ConnectionMetrics | null {
    // Return cached metrics if available
    return null // Would implement caching of last collected metrics
  }

  public cleanup() {
    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval)
      this.qualityCheckInterval = undefined
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = undefined
    }
  }

  // Manual recovery triggers
  public forceIceRestart(pc: RTCPeerConnection) {
    this.attemptIceRestart(pc)
  }

  public resetState() {
    this.state = {
      reconnectAttempts: 0,
      lastReconnectTime: 0,
      connectionState: 'new',
      iceConnectionState: 'new',
      isRecovering: false,
      qualityIssues: []
    }
  }

  // Configuration updates
  public updateIceRestartConfig(endpoint: string, streamId: string | null) {
    this.config.iceRestartEndpoint = endpoint
    this.config.streamId = streamId
    console.log(`Updated ICE restart config - endpoint: ${endpoint}, streamId: ${streamId}`)
  }

  public updateStreamId(streamId: string | null) {
    this.config.streamId = streamId
  }
}
