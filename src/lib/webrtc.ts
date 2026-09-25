import { FileMetadata, TransferProgress, ReceivedFileItem, ConnectionState, ChannelStat } from '../types/transfer';
import { calculateCRC32, finalizeCRC32 } from './crc32';

// 64 KB chunk size for optimal WebRTC MTU
export const CHUNK_SIZE = 64 * 1024;
// Buffer threshold per channel: 256 KB before applying backpressure
export const BUFFER_THRESHOLD = 256 * 1024;
export const BUFFER_LOW_THRESHOLD = 64 * 1024;
export const NUM_DATA_CHANNELS = 4; // 4 parallel high-speed data channels

// Binary Frame Header Size: 16 bytes
// [0..3] Uint32: File Sequence Index
// [4..7] Uint32: Chunk Index
// [8..11] Uint32: Total Chunks
// [12..15] Uint32: Payload Length
const HEADER_SIZE = 16;

export interface WebRTCCallbacks {
  onConnectionStateChange: (state: ConnectionState) => void;
  onSignal: (signal: any) => void;
  onFileManifestReceived: (files: FileMetadata[]) => void;
  onTransferProgress: (progress: TransferProgress) => void;
  onFileCompleted: (file: ReceivedFileItem) => void;
  onAllCompleted: () => void;
  onChannelStats: (stats: ChannelStat[]) => void;
}

export class P2PTransferEngine {
  private pc: RTCPeerConnection | null = null;
  private dataChannels: RTCDataChannel[] = [];
  private controlChannel: RTCDataChannel | null = null;
  private isInitiator = false;
  private callbacks: WebRTCCallbacks;

  // File sending state
  private isSending = false;
  private cancelRequested = false;

  // File receiving state
  private incomingFiles: Map<number, {
    metadata: FileMetadata;
    chunks: ArrayBuffer[];
    receivedChunksCount: number;
    receivedBytes: number;
    crcValue: number;
  }> = new Map();

  // Speed calculation state
  private speedTimer: any = null;
  private lastBytesTransferred = 0;
  private currentSpeedBps = 0;
  private totalBytesToTransfer = 0;
  private totalBytesTransferred = 0;

  constructor(callbacks: WebRTCCallbacks) {
    this.callbacks = callbacks;
  }

  public async initializeConnection(isInitiator: boolean, iceServers?: RTCIceServer[]) {
    this.cleanup();
    this.isInitiator = isInitiator;
    this.callbacks.onConnectionStateChange('connecting_peer');

    const config: RTCConfiguration = {
      iceServers: iceServers && iceServers.length > 0 ? iceServers : [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    };

    this.pc = new RTCPeerConnection(config);

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onSignal({ type: 'candidate', candidate: event.candidate });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      const state = this.pc.connectionState;
      if (state === 'connected') {
        this.callbacks.onConnectionStateChange('connected');
        this.startSpeedMonitor();
      } else if (state === 'disconnected' || state === 'failed') {
        this.callbacks.onConnectionStateChange('failed');
        this.stopSpeedMonitor();
      } else if (state === 'closed') {
        this.callbacks.onConnectionStateChange('disconnected');
        this.stopSpeedMonitor();
      }
    };

    if (this.isInitiator) {
      // Create dedicated control channel for metadata and handshakes
      this.controlChannel = this.pc.createDataChannel('aero_control', {
        ordered: true
      });
      this.setupControlChannel(this.controlChannel);

      // Create multiple parallel high-speed data channels
      for (let i = 0; i < NUM_DATA_CHANNELS; i++) {
        const dc = this.pc.createDataChannel(`aero_stream_${i}`, {
          ordered: true
        });
        dc.binaryType = 'arraybuffer';
        this.setupDataChannel(dc, i);
        this.dataChannels.push(dc);
      }

      // Generate SDP offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.callbacks.onSignal({ type: 'offer', sdp: offer.sdp });
    } else {
      // Receiver: listen for incoming data channels
      this.pc.ondatachannel = (event) => {
        const dc = event.channel;
        if (dc.label === 'aero_control') {
          this.controlChannel = dc;
          this.setupControlChannel(dc);
        } else if (dc.label.startsWith('aero_stream_')) {
          const channelIndex = parseInt(dc.label.replace('aero_stream_', ''), 10) || 0;
          dc.binaryType = 'arraybuffer';
          this.setupDataChannel(dc, channelIndex);
          this.dataChannels.push(dc);
        }
      };
    }
  }

  public async handleSignal(signal: any) {
    if (!this.pc) return;

    try {
      if (signal.type === 'offer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.callbacks.onSignal({ type: 'answer', sdp: answer.sdp });
      } else if (signal.type === 'answer') {
        if (this.pc.signalingState !== 'stable') {
          await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (e) {
      console.error('Failed to handle WebRTC signal:', e);
    }
  }

  private setupControlChannel(dc: RTCDataChannel) {
    dc.onopen = () => {
      // Check if all channels are open
      this.checkAllChannelsReady();
    };

    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'manifest') {
          const files: FileMetadata[] = msg.files;
          this.totalBytesToTransfer = files.reduce((acc, f) => acc + f.size, 0);
          this.totalBytesTransferred = 0;
          this.incomingFiles.clear();

          files.forEach((file, idx) => {
            this.incomingFiles.set(idx, {
              metadata: file,
              chunks: new Array(file.totalChunks),
              receivedChunksCount: 0,
              receivedBytes: 0,
              crcValue: 0 ^ (-1)
            });
          });

          this.callbacks.onFileManifestReceived(files);
        } else if (msg.type === 'cancel') {
          this.isSending = false;
        }
      } catch (e) {
        console.error('Control message error:', e);
      }
    };
  }

  private setupDataChannel(dc: RTCDataChannel, _index: number) {
    dc.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;

    dc.onopen = () => {
      this.checkAllChannelsReady();
    };

    dc.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        this.handleIncomingChunk(event.data as ArrayBuffer);
      }
    };
  }

  private checkAllChannelsReady() {
    const isControlOpen = this.controlChannel?.readyState === 'open';
    const areChannelsOpen = this.dataChannels.length > 0 && this.dataChannels.every(ch => ch.readyState === 'open');

    if (isControlOpen && (this.dataChannels.length === 0 || areChannelsOpen)) {
      this.callbacks.onConnectionStateChange('connected');
    }
  }

  private handleIncomingChunk(buffer: ArrayBuffer) {
    if (buffer.byteLength < HEADER_SIZE) return;

    const headerView = new DataView(buffer, 0, HEADER_SIZE);
    const fileIndex = headerView.getUint32(0, false);
    const chunkIndex = headerView.getUint32(4, false);
    const totalChunks = headerView.getUint32(8, false);
    const payloadLength = headerView.getUint32(12, false);

    const fileRecord = this.incomingFiles.get(fileIndex);
    if (!fileRecord) return;

    // Extract raw payload (slice off 16-byte header)
    const payload = buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLength);
    fileRecord.chunks[chunkIndex] = payload;
    fileRecord.receivedChunksCount++;
    fileRecord.receivedBytes += payloadLength;
    this.totalBytesTransferred += payloadLength;

    // Stream CRC32 update
    fileRecord.crcValue = calculateCRC32(new Uint8Array(payload), fileRecord.crcValue);

    // Update progress
    const fileBytes = fileRecord.receivedBytes;
    const fileTotalBytes = fileRecord.metadata.size;
    const percent = fileTotalBytes > 0 ? Math.min(100, Math.round((fileBytes / fileTotalBytes) * 100)) : 100;
    const remainingBytes = fileTotalBytes - fileBytes;
    const eta = this.currentSpeedBps > 0 ? Math.ceil(remainingBytes / this.currentSpeedBps) : 0;

    this.callbacks.onTransferProgress({
      fileId: fileRecord.metadata.id,
      chunksCompleted: fileRecord.receivedChunksCount,
      totalChunks,
      bytesTransferred: fileBytes,
      totalBytes: fileTotalBytes,
      speedBps: this.currentSpeedBps,
      percent,
      etaSeconds: eta,
      status: 'transferring'
    });

    // Check if this file is complete
    if (fileRecord.receivedChunksCount === totalChunks) {
      const computedCRC = finalizeCRC32(fileRecord.crcValue);
      const isVerified = !fileRecord.metadata.crc32 || fileRecord.metadata.crc32 === computedCRC;

      const blob = new Blob(fileRecord.chunks, { type: fileRecord.metadata.type || 'application/octet-stream' });
      const downloadUrl = URL.createObjectURL(blob);

      const completedItem: ReceivedFileItem = {
        ...fileRecord.metadata,
        blob,
        downloadUrl,
        receivedBytes: fileRecord.receivedBytes,
        chunksReceived: fileRecord.receivedChunksCount,
        verified: isVerified,
        completedAt: Date.now()
      };

      this.callbacks.onFileCompleted(completedItem);

      // Check if all files in transfer are done
      let allDone = true;
      for (const rec of this.incomingFiles.values()) {
        if (rec.receivedChunksCount < rec.metadata.totalChunks) {
          allDone = false;
          break;
        }
      }
      if (allDone) {
        this.callbacks.onAllCompleted();
      }
    }
  }

  public async sendFiles(files: File[]): Promise<void> {
    if (!this.controlChannel || this.controlChannel.readyState !== 'open') {
      throw new Error('Connection is not ready for file transfer');
    }
    if (this.dataChannels.length === 0) {
      throw new Error('No data channels available');
    }

    this.isSending = true;
    this.cancelRequested = false;

    // 1. Prepare manifest
    const manifest: FileMetadata[] = files.map((file, idx) => ({
      id: `${idx}_${file.name}_${file.size}`,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      totalChunks: Math.ceil(file.size / CHUNK_SIZE) || 1,
      lastModified: file.lastModified
    }));

    this.totalBytesToTransfer = files.reduce((acc, f) => acc + f.size, 0);
    this.totalBytesTransferred = 0;

    // Send manifest over control channel
    this.controlChannel.send(JSON.stringify({
      type: 'manifest',
      files: manifest
    }));

    // Wait a brief tick for receiver to prepare memory slots
    await new Promise((r) => setTimeout(r, 100));

    // 2. Stream files chunk by chunk across parallel data channels
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      if (this.cancelRequested) break;

      const file = files[fileIndex];
      const meta = manifest[fileIndex];
      const totalChunks = meta.totalChunks;
      let chunksCompleted = 0;
      let bytesSentForFile = 0;

      // Round-robin channel selector
      let channelIndex = 0;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (this.cancelRequested) break;

        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const slice = file.slice(start, end);
        const chunkArrayBuffer = await slice.arrayBuffer();
        const payloadLength = chunkArrayBuffer.byteLength;

        // Construct 16-byte binary header
        const packet = new ArrayBuffer(HEADER_SIZE + payloadLength);
        const headerView = new DataView(packet, 0, HEADER_SIZE);
        headerView.setUint32(0, fileIndex, false);
        headerView.setUint32(4, chunkIndex, false);
        headerView.setUint32(8, totalChunks, false);
        headerView.setUint32(12, payloadLength, false);

        // Copy chunk payload into packet
        new Uint8Array(packet, HEADER_SIZE).set(new Uint8Array(chunkArrayBuffer));

        // Select next active channel
        const channel = this.dataChannels[channelIndex % this.dataChannels.length];
        channelIndex++;

        // High-speed backpressure flow control:
        // If channel buffer is saturated, wait for bufferedamountlow event
        if (channel.bufferedAmount > BUFFER_THRESHOLD) {
          await new Promise<void>((resolve) => {
            const onLow = () => {
              channel.removeEventListener('bufferedamountlow', onLow);
              resolve();
            };
            channel.addEventListener('bufferedamountlow', onLow);
          });
        }

        channel.send(packet);

        chunksCompleted++;
        bytesSentForFile += payloadLength;
        this.totalBytesTransferred += payloadLength;

        // Progress notification
        const percent = file.size > 0 ? Math.min(100, Math.round((bytesSentForFile / file.size) * 100)) : 100;
        const remainingBytes = file.size - bytesSentForFile;
        const eta = this.currentSpeedBps > 0 ? Math.ceil(remainingBytes / this.currentSpeedBps) : 0;

        this.callbacks.onTransferProgress({
          fileId: meta.id,
          chunksCompleted,
          totalChunks,
          bytesTransferred: bytesSentForFile,
          totalBytes: file.size,
          speedBps: this.currentSpeedBps,
          percent,
          etaSeconds: eta,
          status: 'transferring'
        });
      }

      this.callbacks.onTransferProgress({
        fileId: meta.id,
        chunksCompleted: totalChunks,
        totalChunks,
        bytesTransferred: file.size,
        totalBytes: file.size,
        speedBps: this.currentSpeedBps,
        percent: 100,
        etaSeconds: 0,
        status: 'completed'
      });
    }

    this.isSending = false;
    this.callbacks.onAllCompleted();
  }

  public cancelTransfer() {
    this.cancelRequested = true;
    this.isSending = false;
    if (this.controlChannel && this.controlChannel.readyState === 'open') {
      try {
        this.controlChannel.send(JSON.stringify({ type: 'cancel' }));
      } catch (e) {
        // ignore
      }
    }
  }

  private startSpeedMonitor() {
    this.stopSpeedMonitor();
    this.lastBytesTransferred = this.totalBytesTransferred;

    this.speedTimer = setInterval(() => {
      const deltaBytes = this.totalBytesTransferred - this.lastBytesTransferred;
      this.lastBytesTransferred = this.totalBytesTransferred;
      // Sampling every 500ms -> multiply by 2 for Bps
      this.currentSpeedBps = Math.max(0, deltaBytes * 2);

      // Report channel stats
      const stats: ChannelStat[] = this.dataChannels.map((ch, idx) => ({
        id: idx,
        bufferedAmount: ch.bufferedAmount,
        bytesSent: 0,
        bytesReceived: 0,
        active: ch.readyState === 'open'
      }));
      this.callbacks.onChannelStats(stats);
    }, 500);
  }

  private stopSpeedMonitor() {
    if (this.speedTimer) {
      clearInterval(this.speedTimer);
      this.speedTimer = null;
    }
    this.currentSpeedBps = 0;
  }

  public cleanup() {
    this.stopSpeedMonitor();
    this.isSending = false;
    this.cancelRequested = false;

    if (this.controlChannel) {
      try { this.controlChannel.close(); } catch (e) {}
      this.controlChannel = null;
    }

    this.dataChannels.forEach((dc) => {
      try { dc.close(); } catch (e) {}
    });
    this.dataChannels = [];

    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }

    this.incomingFiles.clear();
  }
}
