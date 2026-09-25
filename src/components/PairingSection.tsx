import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, QrCode as QrIcon, ArrowRight, Link as LinkIcon, RefreshCw, Camera } from 'lucide-react';
import { formatCode } from '../lib/format';
import { QRScannerModal } from './QRScannerModal';

interface PairingSectionProps {
  mode: 'send' | 'receive';
  roomCode: string;
  isGeneratingCode: boolean;
  onRegenerateCode: () => void;
  onJoinCode: (code: string) => void;
  isConnecting: boolean;
}

export function PairingSection({
  mode,
  roomCode,
  isGeneratingCode,
  onRegenerateCode,
  onJoinCode,
  isConnecting,
}: PairingSectionProps) {
  const [manualCode, setManualCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Build direct share URL
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?code=${roomCode}&mode=${mode === 'send' ? 'receive' : 'send'}`
    : '';

  useEffect(() => {
    if (!roomCode || !shareUrl) return;

    QRCode.toDataURL(shareUrl, {
      width: 320,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code:', err));
  }, [roomCode, shareUrl]);

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (e) {
      console.warn('Clipboard write failed', e);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {
      console.warn('Clipboard write failed', e);
    }
  };

  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.replace(/\D/g, '');
    if (clean.length === 6) {
      onJoinCode(clean);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const codeArr = manualCode.padEnd(6, ' ').split('');
    codeArr[index] = digit || ' ';
    const updated = codeArr.join('').trimEnd();
    setManualCode(updated.replace(/\s+/g, ''));

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const clean = updated.replace(/\s+/g, '');
    if (clean.length === 6) {
      onJoinCode(clean);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !manualCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      setManualCode(pasted);
      if (pasted.length === 6) {
        onJoinCode(pasted);
      } else {
        inputRefs.current[Math.min(5, pasted.length)]?.focus();
      }
    }
  };

  const handleQRScanned = (scannedCode: string) => {
    setManualCode(scannedCode);
    onJoinCode(scannedCode);
  };

  // SENDER VIEW: Pure sender pairing code card (no sub-tabs, no extra writeups)
  if (mode === 'send') {
    return (
      <div className="w-full max-w-xl mx-auto mb-8">
        <div className="bg-white dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-8 text-center transition-colors shadow-sm">
          {/* 6-Digit Pair Code Display */}
          <div className="flex items-center justify-center gap-3 my-2">
            <div className="text-4xl sm:text-5xl font-mono font-bold tracking-widest text-neutral-950 dark:text-neutral-50 tabular-nums select-all">
              {isGeneratingCode ? (
                <span className="opacity-40 animate-pulse">••••••</span>
              ) : (
                formatCode(roomCode) || '------'
              )}
            </div>
            <button
              type="button"
              onClick={onRegenerateCode}
              disabled={isGeneratingCode}
              className="p-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors disabled:opacity-40 cursor-pointer"
              title="Generate new 6-digit key"
            >
              <RefreshCw className={`w-4 h-4 ${isGeneratingCode ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Action Row */}
          <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto mt-6">
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/80 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 transition-colors cursor-pointer"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/80 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 transition-colors cursor-pointer"
            >
              <QrIcon className="w-3.5 h-3.5" />
              <span>QR Code</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/80 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 transition-colors cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <LinkIcon className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Link'}</span>
            </button>
          </div>
        </div>

        {/* QR Code Modal */}
        {showQrModal && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={() => setShowQrModal(false)}
          >
            <div
              className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs uppercase tracking-wider font-semibold text-neutral-400">
                  Pairing QR Code
                </span>
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-neutral-100 flex items-center justify-center shadow-inner mb-4">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Pairing QR Code"
                    className="w-56 h-56 object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-neutral-400 text-xs">
                    Generating QR...
                  </div>
                )}
              </div>

              <div className="text-2xl font-mono font-bold tracking-widest text-neutral-900 dark:text-neutral-100 mb-4">
                {formatCode(roomCode)}
              </div>

              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full py-2.5 px-4 text-xs font-semibold rounded-xl bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // RECEIVER VIEW: Enter 6-digit code or Scan QR Code
  return (
    <div className="w-full max-w-xl mx-auto mb-8">
      <div className="bg-white dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-8 text-center transition-colors shadow-sm">
        <form onSubmit={handleManualCodeSubmit}>
          <div className="flex justify-center gap-2 sm:gap-3 mb-6" onPaste={handlePaste}>
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const char = manualCode[index] || '';
              return (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={char}
                  placeholder="•"
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={isConnecting}
                  className="w-11 h-14 sm:w-13 sm:h-16 text-center text-2xl sm:text-3xl font-mono font-bold rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/80 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100 focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100 transition-all tabular-nums"
                />
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="submit"
              disabled={manualCode.replace(/\D/g, '').length !== 6 || isConnecting}
              className="w-full sm:w-auto px-7 py-3 text-xs sm:text-sm font-semibold rounded-xl bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{isConnecting ? 'Connecting...' : 'Connect to Sender'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowScannerModal(true)}
              disabled={isConnecting}
              className="w-full sm:w-auto px-5 py-3 text-xs sm:text-sm font-semibold rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/80 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
            >
              <Camera className="w-4 h-4" />
              <span>Scan QR</span>
            </button>
          </div>
        </form>
      </div>

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onScanSuccess={handleQRScanned}
      />
    </div>
  );
}
