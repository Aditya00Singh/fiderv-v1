import { ThemeToggle } from './ThemeToggle';
import { RotateCcw } from 'lucide-react';

interface HeaderProps {
  onResetSession: () => void;
  isConnected: boolean;
}

export function Header({ onResetSession, isConnected }: HeaderProps) {
  return (
    <header className="w-full border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a
          href="/"
          className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100 font-display transition-colors select-none flex items-center gap-1.5"
        >
          <span>fiederv</span>
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100 inline-block" />
        </a>

        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              type="button"
              onClick={onResetSession}
              className="p-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors cursor-pointer"
              title="Disconnect / Reset Session"
              aria-label="Disconnect session"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
