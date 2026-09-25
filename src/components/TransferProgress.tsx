import { useEffect, useRef, useState, useMemo } from 'react';
import { TransferProgress as TransferProgressType, ChannelStat } from '../types/transfer';
import { formatBytes } from '../lib/format';
import { Zap, ShieldCheck, XCircle, Activity, Clock } from 'lucide-react';

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
  // Real-time speed & throughput tracking state
  const [realtimeSpeedMBps, setRealtimeSpeedMBps] = useState<number>(0);
  const [peakSpeedMBps, setPeakSpeedMBps] = useState<number>(0);
  const [smoothedEtaSeconds, setSmoothedEtaSeconds] = useState<number | null>(null);

  // Tracking refs to compute byte throughput delta over time
  const lastSampleRef = useRef<{ bytes: number; timestamp: number } | null>(null);
  const speedHistoryRef = useRef<number[]>([]);

  // Reset or initialize tracking when progress starts or file changes
  useEffect(() => {
    if (!progress) {
      lastSampleRef.current = null;
      speedHistoryRef.current = [];
      setRealtimeSpeedMBps(0);
      setPeakSpeedMBps(0);
      setSmoothedEtaSeconds(null);
      return;
    }

    const now = performance.now();
    const currentBytes = progress.bytesTransferred;

    if (!lastSampleRef.current) {
      lastSampleRef.current = { bytes: currentBytes, timestamp: now };
      if (progress.speedBps && progress.speedBps > 0) {
        const initialMBps = progress.speedBps / (1024 * 1024);
        setRealtimeSpeedMBps(initialMBps);
        setPeakSpeedMBps(initialMBps);
      }
      return;
    }

    const deltaBytes = currentBytes - lastSampleRef.current.bytes;
    const deltaMs = now - lastSampleRef.current.timestamp;

    // Sample speed when at least 150ms has elapsed or significant bytes arrived
    if (deltaMs >= 150 && deltaBytes >= 0) {
      const instantBps = (deltaBytes / (deltaMs / 1000));
      const instantMBps = instantBps / (1024 * 1024);

      // Keep a sliding window of recent speed samples (last 6 samples) for smooth, jitter-free throughput
      const history = speedHistoryRef.current;
      history.push(instantMBps);
      if (history.length > 6) history.shift();

      // Weighted moving average giving higher weight to newest sample
      const weightedSum = history.reduce((acc, val, idx) => acc + val * (idx + 1), 0);
      const weightTotal = (history.length * (history.length + 1)) / 2;
      const smoothedMBps = weightedSum / weightTotal;

      setRealtimeSpeedMBps(smoothedMBps);
      setPeakSpeedMBps((prev) => Math.max(prev, smoothedMBps));

      lastSampleRef.current = { bytes: currentBytes, timestamp: now };
    }
  }, [progress?.bytesTransferred, progress?.speedBps]);

  // Fallback to progress.speedBps if local calculation is 0 but engine reported speed
  const effectiveSpeedMBps = useMemo(() => {
    if (realtimeSpeedMBps > 0) return realtimeSpeedMBps;
    if (progress?.speedBps && progress.speedBps > 0) {
      return progress.speedBps / (1024 * 1024);
    }
    return 0;
  }, [realtimeSpeedMBps, progress?.speedBps]);

  // Remaining bytes to transfer
  const remainingBytes = useMemo(() => {
    if (!progress) return 0;
    return Math.max(0, (progress.totalBytes || 0) - (progress.bytesTransferred || 0));
  }, [progress?.totalBytes, progress?.bytesTransferred]);

  // Calculate real-time estimated time remaining based on active transfer speed and byte throughput
  useEffect(() => {
    if (!progress) {
      setSmoothedEtaSeconds(null);
      return;
    }

    if (progress.status === 'completed' || remainingBytes === 0) {
      setSmoothedEtaSeconds(0);
      return;
    }

    if (progress.status === 'preparing') {
      setSmoothedEtaSeconds(null);
      return;
    }

    // Determine current speed in bytes per second
    const currentSpeedBps = effectiveSpeedMBps > 0
      ? effectiveSpeedMBps * 1024 * 1024
      : (progress.speedBps || 0);

    if (currentSpeedBps > 0 && remainingBytes > 0) {
      const rawEta = remainingBytes / currentSpeedBps;
      const roundedEta = Math.max(0, Math.ceil(rawEta));

      setSmoothedEtaSeconds((prev) => {
        if (prev === null) return roundedEta;
        // Exponential damping to prevent erratic ETA bouncing during network micro-bursts
        // (70% previous + 30% new sample)
        const smoothed = Math.round(prev * 0.7 + roundedEta * 0.3);
        return Math.max(0, smoothed);
      });
    } else if (progress.etaSeconds !== undefined && progress.etaSeconds > 0) {
      setSmoothedEtaSeconds(progress.etaSeconds);
    }
  }, [effectiveSpeedMBps, remainingBytes, progress?.status, progress?.etaSeconds]);

  // Human-readable formatted time remaining string
  const formattedTimeRemaining = useMemo(() => {
    if (!progress) return '—';
    if (progress.status === 'completed') return '0s';
    if (progress.status === 'verifying') return 'Verifying...';
    if (progress.status === 'preparing') return 'Calculating...';

    if (smoothedEtaSeconds === null) {
      return progress.etaSeconds ? `${progress.etaSeconds}s` : 'Calculating...';
    }

    if (smoothedEtaSeconds <= 0) {
      return remainingBytes === 0 ? '0s' : '< 1s';
    }

    if (smoothedEtaSeconds < 60) {
      return `${smoothedEtaSeconds}s`;
    }

    const mins = Math.floor(smoothedEtaSeconds / 60);
    const secs = smoothedEtaSeconds % 60;
    if (mins < 60) {
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }

    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
  }, [progress, smoothedEtaSeconds, remainingBytes]);

  // Estimated completion clock timestamp (e.g., "10:44 AM")
  const estimatedCompletionClock = useMemo(() => {
    if (!progress || progress.status !== 'transferring' || smoothedEtaSeconds === null || smoothedEtaSeconds <= 0) {
      return null;
    }
    const completionDate = new Date(Date.now() + smoothedEtaSeconds * 1000);
    return completionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [progress?.status, smoothedEtaSeconds]);

  // Total buffer accumulation across active WebRTC channels for backpressure detection
  const totalBufferedAmount = useMemo(() => {
    return channelStats.reduce((acc, ch) => acc + (ch.bufferedAmount || 0), 0);
  }, [channelStats]);

  // WebRTC Stream Health Evaluation
  const streamHealth = useMemo(() => {
    if (!progress) return { status: 'idle', label: 'Idle', color: 'neutral', description: 'Waiting for stream' };

    if (progress.status === 'completed') {
      return {
        status: 'completed',
        label: 'Stream Complete',
        sublabel: 'Transferred and verified via CRC32',
        color: 'emerald',
        badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        pulseClass: 'bg-emerald-500',
      };
    }

    if (progress.status === 'verifying') {
      return {
        status: 'verifying',
        label: 'Verifying Integrity',
        sublabel: 'CRC32 checksum validation in progress',
        color: 'blue',
        badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
        pulseClass: 'bg-blue-500 animate-pulse',
      };
    }

    if (progress.status === 'preparing') {
      return {
        status: 'preparing',
        label: 'Negotiating SCTP Channels',
        sublabel: 'Establishing multi-channel data pipes...',
        color: 'neutral',
        badgeBg: 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20',
        pulseClass: 'bg-neutral-400 animate-ping',
      };
    }

    // Health tiers based on byte throughput (MB/s) and buffer backpressure
    if (effectiveSpeedMBps >= 12.0) {
      return {
        status: 'optimal',
        label: 'Optimal Throughput',
        sublabel: 'Direct peer connection running at maximum capacity',
        color: 'emerald',
        badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        pulseClass: 'bg-emerald-500 animate-pulse',
      };
    }

    if (effectiveSpeedMBps >= 3.0) {
      return {
        status: 'healthy',
        label: 'Stream Healthy',
        sublabel: 'Steady SCTP chunk delivery across channels',
        color: 'emerald',
        badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        pulseClass: 'bg-emerald-500 animate-pulse',
      };
    }

    if (effectiveSpeedMBps >= 0.8) {
      return {
        status: 'moderate',
        label: 'Moderate Throughput',
        sublabel: totalBufferedAmount > 256 * 1024 ? 'Flow control pacing packets' : 'Active P2P connection',
        color: 'amber',
        badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        pulseClass: 'bg-amber-500',
      };
    }

    return {
      status: 'congested',
      label: 'Constrained Stream',
      sublabel: totalBufferedAmount > 512 * 1024 ? 'High buffer backpressure / network throttling' : 'Initializing packet flow',
      color: 'amber',
      badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      pulseClass: 'bg-amber-400 animate-ping',
    };
  }, [progress, effectiveSpeedMBps, totalBufferedAmount]);

  if (!progress) return null;

  const percent = progress.percent || 0;

  return (
    <div className="w-full max-w-2xl mx-auto my-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm transition-colors">
      {/* Top Header: Stream Type & Action */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            <Zap className="w-3.5 h-3.5 text-neutral-900 dark:text-neutral-100" />
            <span>{isReceiving ? 'Direct Inbound Stream' : 'Multi-Channel Parallel Outbound'}</span>
          </div>
          <h4 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100 truncate max-w-sm mt-0.5 font-mono">
            {fileName || 'Streaming Data Chunks...'}
          </h4>
        </div>

        {onCancel && progress.status === 'transferring' && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-500/10 cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        )}
      </div>

      {/* WebRTC Stream Health Banner */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${streamHealth.pulseClass}`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${streamHealth.pulseClass}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                {streamHealth.label}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${streamHealth.badgeBg}`}>
                {effectiveSpeedMBps.toFixed(2)} MB/s
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              {streamHealth.sublabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono text-neutral-400 self-end sm:self-center">
          {estimatedCompletionClock && (
            <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              <span>Est: {estimatedCompletionClock}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-neutral-500" />
            <span>Peak: {peakSpeedMBps.toFixed(1)} MB/s</span>
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid: Speed in MB/s, Transferred Bytes, Time Remaining (ETA), Chunks */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-neutral-100 dark:border-neutral-800 text-center font-mono">
        {/* Real-time speed in MB/s */}
        <div className="flex flex-col justify-center">
          <span className="block text-[11px] uppercase tracking-wider text-neutral-400 font-sans font-medium">
            Real-Time Speed
          </span>
          <div className="mt-1 flex items-baseline justify-center gap-1">
            <span className="text-2xl sm:text-3xl font-bold text-neutral-950 dark:text-neutral-50 tabular-nums">
              {effectiveSpeedMBps.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-neutral-400 uppercase">
              MB/s
            </span>
          </div>
        </div>

        {/* Transferred / Total bytes */}
        <div className="flex flex-col justify-center">
          <span className="block text-[11px] uppercase tracking-wider text-neutral-400 font-sans font-medium">
            Transferred
          </span>
          <span className="text-sm sm:text-base font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums mt-1 block">
            {formatBytes(progress.bytesTransferred)}
          </span>
          <span className="text-[11px] text-neutral-400">
            of {formatBytes(progress.totalBytes)}
          </span>
        </div>

        {/* Calculated Time Remaining (ETA) */}
        <div className="flex flex-col justify-center">
          <span className="block text-[11px] uppercase tracking-wider text-neutral-400 font-sans font-medium">
            Time Remaining
          </span>
          <span className="text-xl sm:text-2xl font-bold text-neutral-950 dark:text-neutral-50 tabular-nums mt-1 block">
            {formattedTimeRemaining}
          </span>
          <span className="text-[11px] text-neutral-400">
            {remainingBytes > 0 && progress.status === 'transferring'
              ? `${formatBytes(remainingBytes)} left`
              : progress.status === 'completed'
              ? 'Complete'
              : 'Estimating'}
          </span>
        </div>

        {/* Chunks */}
        <div className="flex flex-col justify-center">
          <span className="block text-[11px] uppercase tracking-wider text-neutral-400 font-sans font-medium">
            Chunks
          </span>
          <span className="text-sm sm:text-base font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums mt-1 block">
            {progress.chunksCompleted} / {progress.totalChunks}
          </span>
          <span className="text-[11px] text-neutral-400">
            {progress.totalChunks > 0 ? `${Math.round((progress.chunksCompleted / progress.totalChunks) * 100)}% dispatched` : '0%'}
          </span>
        </div>
      </div>

      {/* Progress Bar & Status */}
      <div className="mt-5 mb-4">
        <div className="flex justify-between items-center text-xs text-neutral-500 font-mono mb-2">
          <span className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
            <span>{percent}% Completed</span>
            {progress.status === 'transferring' && formattedTimeRemaining !== '—' && (
              <span className="text-neutral-400 font-normal">
                • {formattedTimeRemaining} remaining
              </span>
            )}
          </span>
          <span className="uppercase tracking-wider text-[11px]">
            {progress.status}
          </span>
        </div>
        <div className="w-full h-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-neutral-950 dark:bg-neutral-100 transition-all duration-150 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Parallel Multi-Channel Striping Visualizer & Buffer Health */}
      <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">
            SCTP Channels:
          </span>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3].map((chId) => {
              const stat = channelStats.find((s) => s.id === chId);
              const isWorking = progress.status === 'transferring' && (stat?.bufferedAmount || 0) > 0;
              const isBufferCongested = (stat?.bufferedAmount || 0) > 256 * 1024;
              return (
                <div
                  key={chId}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] border transition-colors ${
                    isBufferCongested
                      ? 'border-amber-500 bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : isWorking
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
