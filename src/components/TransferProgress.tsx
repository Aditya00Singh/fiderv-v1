import { TransferProgress as TransferProgressType, ChannelStat } from '../types/transfer';
import { formatBytes, formatSpeed, formatETA } from '../lib/format';
import { Zap, ShieldCheck, XCircle } from 'lucide-react';

interface TransferProgressProps {
  progress: TransferProgressType | null;
  channelStats: ChannelStat[];
  onCancel?: () => void;
  fileName?: string;
  isReceiving?: boolean;
}

export function TransferProgress({
  progress,
  channelStats,
  onCancel,
  fileName,
  isReceiving,
}: TransferProgressProps) {
  if (!progress) return null;

  const speed = progress.speedBps || 0;
  const percent = progress.percent || 0;
  const eta = progress.etaSeconds || 0;

  return (
    <div className="w-full max-w-2xl mx-auto my-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm transition-colors">
      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            <Zap className="w-3.5 h-3.5 text-neutral-900 dark:text-neutral-100" />
            <span>{isReceiving ? 'Direct Inbound Stream' : 'Multi-Channel Parallel Outbound'}</span>
          </div>
          <h4 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100 truncate max-w-sm mt-0.5">
            {fileName || 'Streaming Data Chunks...'}
          </h4>
        </div>

        {onCancel && progress.status === 'transferring' && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-red-500 transition-colors p-1"
          >
            <XCircle className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        )}
      </div>

      {/* Primary Metric Banner: Speed & Progress */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-neutral-100 dark:border-neutral-800 text-center font-mono">
        <div>
          <span className="block text-[11px] uppercase tracking-wider text-neutral-400 font-sans font-medium">
            Throughput
          </span>
          <span className="text-xl sm:text-2xl font-bold text-neutral-950 dark:text-neutral-50 tabular-nums">
            {formatSpeed(speed)}
          </span>
        </div>

        <div>
          <span className="block text-[11px] uppercase tracking-wider text-neutral-400 font-sans font-medium">
            Transferred
          </span>
          <span className="text-sm sm:text-base font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums mt-1 block">
            {formatBytes(progress.bytesTransferred)} / {formatBytes(progress.totalBytes)}
          </span>
        </div>

        <div>
          <span className="block text-[11px] uppercase tracking-wider text-neutral-400 font-sans font-medium">
            ETA
          </span>
          <span className="text-xl sm:text-2xl font-bold text-neutral-950 dark:text-neutral-50 tabular-nums">
            {formatETA(eta)}
          </span>
        </div>

        <div>
          <span className="block text-[11px] uppercase tracking-wider text-neutral-400 font-sans font-medium">
            Chunks
          </span>
          <span className="text-sm sm:text-base font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums mt-1 block">
            {progress.chunksCompleted} / {progress.totalChunks}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-5 mb-4">
        <div className="flex justify-between text-xs text-neutral-500 font-mono mb-2">
          <span>{percent}% Completed</span>
          <span>{progress.status.toUpperCase()}</span>
        </div>
        <div className="w-full h-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-neutral-950 dark:bg-neutral-100 transition-all duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Parallel Multi-Channel Striping Visualizer */}
      <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">
            Channels:
          </span>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3].map((chId) => {
              const stat = channelStats.find((s) => s.id === chId);
              const isWorking = progress.status === 'transferring' && (stat?.bufferedAmount || 0) > 0;
              return (
                <div
                  key={chId}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] border transition-colors ${
                    isWorking
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                      : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-400'
                  }`}
                  title={`DataChannel ${chId} - Buffer: ${formatBytes(stat?.bufferedAmount || 0)}`}
                >
                  CH_{chId}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-neutral-400 text-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>DTLS 1.3 End-to-End P2P Direct</span>
        </div>
      </div>
    </div>
  );
}
