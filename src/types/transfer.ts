export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
  crc32?: string;
  lastModified?: number;
}

export interface TransferProgress {
  fileId: string;
  chunksCompleted: number;
  totalChunks: number;
  bytesTransferred: number;
  totalBytes: number;
  speedBps: number; // Bytes per second
  percent: number;
  etaSeconds: number;
  status: 'idle' | 'preparing' | 'transferring' | 'verifying' | 'completed' | 'error';
  errorMessage?: string;
}

export interface ReceivedFileItem extends FileMetadata {
  blob?: Blob;
  downloadUrl?: string;
  receivedBytes: number;
  chunksReceived: number;
  verified: boolean;
  completedAt?: number;
}

export type ConnectionState = 
  | 'disconnected'
  | 'connecting_signaling'
  | 'waiting_peer'
  | 'connecting_peer'
  | 'connected'
  | 'failed';

export interface ChannelStat {
  id: number;
  bufferedAmount: number;
  bytesSent: number;
  bytesReceived: number;
  active: boolean;
}
