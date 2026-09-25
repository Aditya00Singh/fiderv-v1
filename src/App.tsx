import { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { ModeToggle } from './components/ModeToggle';
import { PairingSection } from './components/PairingSection';
import { FileDropzone } from './components/FileDropzone';
import { TransferProgress } from './components/TransferProgress';
import { ReceivedFilesList } from './components/ReceivedFilesList';
import { ConnectionStatusBanner } from './components/ConnectionStatusBanner';
import { SignalingClient, SignalingMessage } from './lib/signaling';
import { P2PTransferEngine } from './lib/webrtc';
import { ConnectionState, FileMetadata, TransferProgress as TransferProgressType, ReceivedFileItem, ChannelStat } from './types/transfer';
import { sound } from './lib/sound';
import { Inbox, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [mode, setMode] = useState<'send' | 'receive'>('send');
  const [roomCode, setRoomCode] = useState<string>('');
  const [isGeneratingCode, setIsGeneratingCode] = useState<boolean>(true);
  const [peersCount, setPeersCount] = useState<number>(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [channelStats, setChannelStats] = useState<ChannelStat[]>([]);

  // Files to send
  const [filesToSend, setFilesToSend] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Transfer and receiving state
  const [transferProgress, setTransferProgress] = useState<TransferProgressType | null>(null);
  const [incomingManifest, setIncomingManifest] = useState<FileMetadata[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFileItem[]>([]);
  const [isTransferComplete, setIsTransferComplete] = useState(false);

  // References to engine and signaling instances
  const signalingRef = useRef<SignalingClient | null>(null);
  const engineRef = useRef<P2PTransferEngine | null>(null);

  // Helper to fetch ICE servers
  const fetchIceServers = async (): Promise<RTCIceServer[]> => {
    try {
      const res = await fetch('/api/ice-servers');
      if (res.ok) {
        const data = await res.json();
        return data.iceServers;
      }
    } catch (e) {
      console.warn('Using fallback public STUN servers');
    }
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];
  };

  // Initialize P2P Engine with callbacks
  const getOrCreateEngine = useCallback(() => {
    if (engineRef.current) return engineRef.current;

    const engine = new P2PTransferEngine({
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        if (state === 'failed') {
          sound.playError();
        }
      },
      onSignal: (signal) => {
        signalingRef.current?.sendSignal(signal);
      },
      onFileManifestReceived: (manifest) => {
        setIncomingManifest(manifest);
        setIsTransferComplete(false);
      },
      onTransferProgress: (progress) => {
        setTransferProgress(progress);
      },
      onFileCompleted: (file) => {
        setReceivedFiles((prev) => {
          const exists = prev.some((f) => f.id === file.id);
          if (exists) return prev;
          return [...prev, file];
        });
      },
      onAllCompleted: () => {
        setIsSending(false);
        setIsTransferComplete(true);
      },
      onChannelStats: (stats) => {
        setChannelStats(stats);
      },
    });

    engineRef.current = engine;
    return engine;
  }, []);

  // Initialize signaling and room setup
  useEffect(() => {
    const signaling = new SignalingClient();
    signalingRef.current = signaling;

    // Check URL parameters on mount
    const searchParams = new URLSearchParams(window.location.search);
    const urlCode = searchParams.get('code');
    const urlMode = searchParams.get('mode');

    if (urlMode === 'send' || urlMode === 'receive') {
      setMode(urlMode);
    }

    const unsubscribe = signaling.subscribe(async (msg: SignalingMessage) => {
      switch (msg.type) {
        case 'room_created': {
          setRoomCode(msg.roomId || '');
          setPeersCount(msg.payload?.peersCount || 1);
          setIsGeneratingCode(false);
          break;
        }

        case 'room_joined': {
          setRoomCode(msg.roomId || '');
          setPeersCount(msg.payload?.peersCount || 1);
          setIsGeneratingCode(false);
          break;
        }

        case 'peer_joined': {
          setPeersCount((prev) => prev + 1);
          // A peer joined: negotiate WebRTC
          const engine = getOrCreateEngine();
          const iceServers = await fetchIceServers();
          // The peer who receives initiator=true initiates the WebRTC offer
          const isInitiator = msg.initiator !== undefined 
            ? Boolean(msg.initiator) 
            : Boolean(msg.payload?.initiator);
          engine.initializeConnection(isInitiator, iceServers);
          break;
        }

        case 'peer_left': {
          setPeersCount((prev) => Math.max(0, prev - 1));
          setConnectionState('disconnected');
          break;
        }

        case 'signal': {
          const engine = getOrCreateEngine();
          engine.handleSignal(msg.payload);
          break;
        }

        default:
          break;
      }
    });

    signaling
      .connect()
      .then(() => {
        if (urlCode && /^\d{6}$/.test(urlCode)) {
          signaling.joinRoom(urlCode);
          setRoomCode(urlCode);
        } else {
          signaling.createRoom();
        }
      })
      .catch((e) => {
        console.error('Signaling connection error:', e);
        setIsGeneratingCode(false);
      });

    return () => {
      unsubscribe();
      signaling.disconnect();
      engineRef.current?.cleanup();
    };
  }, [getOrCreateEngine]);

  const handleRegenerateCode = () => {
    setIsGeneratingCode(true);
    setConnectionState('disconnected');
    engineRef.current?.cleanup();
    signalingRef.current?.createRoom();
  };

  const handleJoinManualCode = (code: string) => {
    setConnectionState('connecting_peer');
    engineRef.current?.cleanup();
    signalingRef.current?.joinRoom(code);
    setRoomCode(code);
  };

  const handleResetSession = () => {
    setFilesToSend([]);
    setTransferProgress(null);
    setIncomingManifest([]);
    setReceivedFiles([]);
    setIsTransferComplete(false);
    setIsSending(false);
    engineRef.current?.cleanup();
    handleRegenerateCode();
  };

  // Add files to queue
  const handleAddFiles = (newFiles: File[]) => {
    setFilesToSend((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setFilesToSend((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearFiles = () => {
    setFilesToSend([]);
  };

  // Initiate high-speed direct P2P stream
  const handleStartSending = async () => {
    if (!engineRef.current || filesToSend.length === 0) return;
    try {
      setIsSending(true);
      setIsTransferComplete(false);
      await engineRef.current.sendFiles(filesToSend);
    } catch (err: any) {
      console.error('File transfer error:', err);
      setIsSending(false);
    }
  };

  const handleCancelTransfer = () => {
    engineRef.current?.cancelTransfer();
    setIsSending(false);
    setTransferProgress(null);
  };

  const handleDownloadAllReceived = () => {
    receivedFiles.forEach((file) => {
      if (!file.downloadUrl) return;
      const a = document.createElement('a');
      a.href = file.downloadUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  const currentSendingFileName = filesToSend.length > 0 ? filesToSend[0].name : '';
  const currentReceivingFileName = incomingManifest.length > 0 ? incomingManifest[0].name : '';

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
      <Header
        onResetSession={handleResetSession}
        isConnected={connectionState === 'connected'}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Editorial Title Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold tracking-tight text-neutral-950 dark:text-neutral-50 uppercase max-w-2xl mx-auto">
            Direct High-Speed P2P Stream
          </h1>
        </div>

        {/* Big Monochromatic Send / Receive Toggle */}
        <ModeToggle
          mode={mode}
          onChange={(newMode) => setMode(newMode)}
          disabled={isSending}
        />

        {/* Connection & Tunnel Status Banner */}
        <ConnectionStatusBanner
          connectionState={connectionState}
          roomCode={roomCode}
          peersCount={peersCount}
        />

        {/* Client Pairing Section (6-digit, QR code, Direct link) */}
        {connectionState !== 'connected' && (
          <PairingSection
            mode={mode}
            roomCode={roomCode}
            isGeneratingCode={isGeneratingCode}
            onRegenerateCode={handleRegenerateCode}
            onJoinCode={handleJoinManualCode}
            isConnecting={connectionState === 'connecting_peer'}
          />
        )}

        {/* Transfer Progress and Metrics */}
        {(transferProgress || isSending || incomingManifest.length > 0) && (
          <TransferProgress
            progress={transferProgress}
            channelStats={channelStats}
            onCancel={handleCancelTransfer}
            fileName={mode === 'send' ? currentSendingFileName : currentReceivingFileName}
            isReceiving={mode === 'receive'}
          />
        )}

        {/* Send Mode View: Dropzone & File Queue */}
        {mode === 'send' && (
          <FileDropzone
            files={filesToSend}
            onAddFiles={handleAddFiles}
            onRemoveFile={handleRemoveFile}
            onClearFiles={handleClearFiles}
            onSend={handleStartSending}
            isConnected={connectionState === 'connected'}
            isSending={isSending}
          />
        )}

        {/* Receive Mode View */}
        {mode === 'receive' && (
          <div className="w-full max-w-2xl mx-auto">
            {receivedFiles.length === 0 && !transferProgress && (
              <div className="bg-white/60 dark:bg-neutral-900/40 border border-dashed border-neutral-300 dark:border-neutral-800 rounded-3xl p-10 sm:p-14 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 dark:text-neutral-400">
                  <Inbox className="w-7 h-7 stroke-[1.75]" />
                </div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mb-1">
                  Ready to Receive
                </h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  {connectionState === 'connected'
                    ? 'Connected. Waiting for files...'
                    : 'Enter 6-digit sender code above to pair.'}
                </p>
              </div>
            )}

            {/* List of completed & verified files */}
            <ReceivedFilesList
              files={receivedFiles}
              onDownloadAll={handleDownloadAllReceived}
            />
          </div>
        )}

        {/* Completion Success Notification */}
        {isTransferComplete && (
          <div className="w-full max-w-2xl mx-auto my-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold">
                Transfer complete! Bitstream verified with 100% data integrity.
              </span>
            </div>
            <button
              type="button"
              onClick={handleResetSession}
              className="underline hover:text-emerald-950 dark:hover:text-emerald-100 cursor-pointer"
            >
              Start New Transfer
            </button>
          </div>
        )}
      </main>

      {/* Quiet Minimalist Footer */}
      <footer className="w-full border-t border-neutral-200 dark:border-neutral-800 py-6 text-center text-xs text-neutral-400 dark:text-neutral-500 transition-colors">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-wider uppercase">AERO P2P · Zero-Server Stream</span>
          <span className="font-mono text-[11px] text-neutral-400">Direct Browser SCTP</span>
        </div>
      </footer>
    </div>
  );
}
