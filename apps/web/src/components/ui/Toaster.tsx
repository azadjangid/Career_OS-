import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore, type ToastKind } from '@/store/toast.store';

const ICON = { success: CheckCircle2, error: AlertCircle, info: Info } as const;
const COLOR: Record<ToastKind, string> = { success: 'var(--tone-green)', error: 'var(--tone-red)', info: 'var(--tone-blue)' };

export default function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96 pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map(t => {
          const Icon = ICON[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              className="pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg"
              style={{ background: 'var(--bg-card)', border: `1px solid color-mix(in srgb, ${COLOR[t.kind]} 33%, transparent)` }}
              role={t.kind === 'error' ? 'alert' : 'status'}
            >
              <Icon size={18} style={{ color: COLOR[t.kind] }} className="mt-0.5 shrink-0" />
              <p className="flex-1 text-sm" style={{ color: 'var(--fg-primary)' }}>{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="shrink-0" style={{ color: 'var(--fg-muted)' }}>
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
