import { motion } from 'motion/react';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface ModeToggleProps {
  mode: 'send' | 'receive';
  onChange: (mode: 'send' | 'receive') => void;
  disabled?: boolean;
}

export function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  return (
    <div className="w-full max-w-md mx-auto mb-10">
      <div className="relative p-1.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl grid grid-cols-2 gap-1 select-none">
        {/* Animated Background Pill */}
        <motion.div
          className="absolute inset-y-1.5 rounded-xl bg-white dark:bg-neutral-100 shadow-sm dark:shadow-none"
          initial={false}
          animate={{
            left: mode === 'send' ? '6px' : 'calc(50% + 2px)',
            width: 'calc(50% - 8px)',
          }}
          transition={{ type: 'spring', stiffness: 450, damping: 35 }}
        />

        {/* Send Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('send')}
          className={`relative z-10 flex items-center justify-center gap-2.5 py-4 px-6 rounded-xl font-display font-bold text-base sm:text-lg transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed ${
            mode === 'send'
              ? 'text-neutral-950 dark:text-neutral-950'
              : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
          }`}
        >
          <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
          <span>SEND</span>
        </button>

        {/* Receive Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('receive')}
          className={`relative z-10 flex items-center justify-center gap-2.5 py-4 px-6 rounded-xl font-display font-bold text-base sm:text-lg transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed ${
            mode === 'receive'
              ? 'text-neutral-950 dark:text-neutral-950'
              : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
          }`}
        >
          <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
          <span>RECEIVE</span>
        </button>
      </div>
    </div>
  );
}
