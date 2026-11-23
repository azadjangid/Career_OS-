import { Modal } from '@/components/ui/Modal';
import { useUIStore } from '@/store/ui.store';

export const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['Ctrl/⌘', 'K'], label: 'Open command palette' },
  { keys: ['?'], label: 'Show this help' },
  { keys: ['G', 'D'], label: 'Go to Dashboard' },
  { keys: ['G', 'J'], label: 'Go to Jobs' },
  { keys: ['G', 'A'], label: 'Go to Applications' },
  { keys: ['G', 'R'], label: 'Go to Resumes' },
  { keys: ['G', 'I'], label: 'Go to AI Assistant' },
  { keys: ['G', 'N'], label: 'Go to Analytics' },
  { keys: ['G', 'S'], label: 'Go to Settings' },
  { keys: ['N'], label: 'Add a new application' },
  { keys: ['Esc'], label: 'Close dialogs and menus' },
];

export default function ShortcutsModal() {
  const { shortcutsOpen, setShortcutsOpen } = useUIStore();
  return (
    <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts">
      <ul className="space-y-1">
        {SHORTCUTS.map(s => (
          <li key={s.label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-sm" style={{ color: 'var(--fg-secondary)' }}>{s.label}</span>
            <span className="flex items-center gap-1">
              {s.keys.map((k, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>then</span>}
                  <kbd className="kbd">{k}</kbd>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs mt-4" style={{ color: 'var(--fg-muted)' }}>Shortcuts are disabled while you are typing in a field.</p>
    </Modal>
  );
}
