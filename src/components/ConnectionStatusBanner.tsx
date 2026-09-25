import { ConnectionState } from '../types/transfer';
import { ShieldCheck, Wifi, Loader2, AlertCircle } from 'lucide-react';

interface ConnectionStatusBannerProps {
  connectionState: ConnectionState;
  roomCode: string;
  peersCount: number;
}

export function ConnectionStatusBanner({
  connectionState,
  roomCode,
  peersCount,
}: ConnectionStatusBannerProps) {
  if (connectionState === 'connected') {
    return (
      <div className="w-full max-w-xl mx-auto mb-6 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100/80 dark:bg-neutral-900/80 flex items-center justify-between text-xs transition-colors">
        <div className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Direct P2P Tunnel Active</span>
          <span className="text-neutral-400">·</span>
          <span className="text-neutral-500 font-mono">Code {roomCode}</span>
        </div>
        <div className="flex items-center gap-1.5 text-neutral-500 text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>DTLS 1.3 End-to-End</span>
        </div>
      </div>
    );
  }

  if (connectionState === 'connecting_peer') {
    return (
      <div className="w-full max-w-xl mx-auto mb-6 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Performing WebRTC DTLS Handshake...</span>
        </div>
        <span className="text-[11px] text-neutral-400">Negotiating multi-channel SCTP</span>
      </div>
    );
  }

  if (connectionState === 'failed') {
    return (
      <div className="w-full max-w-xl mx-auto mb-6 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 flex items-center justify-between text-xs text-red-600 dark:text-red-400">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Peer connection lost or closed</span>
        </div>
        <span className="text-[11px] underline cursor-pointer" onClick={() => window.location.reload()}>
          Reconnect
        </span>
      </div>
    );
  }

  return null;
}
