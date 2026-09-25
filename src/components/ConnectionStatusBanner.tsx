import { useEffect, useState } from 'react';
import { ConnectionState } from '../types/transfer';
import { ShieldCheck, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface ConnectionStatusBannerProps {
  connectionState: ConnectionState;
  roomCode: string;
  peersCount: number;
}

export function ConnectionStatusBanner({
  connectionState,
  roomCode,
}: ConnectionStatusBannerProps) {
  const [handshakeSeconds, setHandshakeSeconds] = useState(0);

  useEffect(() => {
    let interval: any = null;
    if (connectionState === 'connecting_peer') {
      setHandshakeSeconds(0);
      interval = setInterval(() => {
        setHandshakeSeconds((s) => s + 1);
      }, 1000);
    } else {
      setHandshakeSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connectionState]);

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
      <div className="w-full max-w-xl mx-auto mb-6 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Performing WebRTC DTLS Handshake...</span>
          {handshakeSeconds > 3 && (
            <span className="text-[11px] font-mono text-neutral-400">({handshakeSeconds}s)</span>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <span className="text-[11px] text-neutral-400">Negotiating multi-channel SCTP</span>
          {handshakeSeconds >= 6 && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-[11px] text-neutral-900 dark:text-neutral-100 font-medium underline inline-flex items-center gap-1 hover:opacity-80 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}
        </div>
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
        <button
          type="button"
          className="text-[11px] underline cursor-pointer"
          onClick={() => window.location.reload()}
        >
          Reconnect
        </button>
      </div>
    );
  }

  return null;
}
