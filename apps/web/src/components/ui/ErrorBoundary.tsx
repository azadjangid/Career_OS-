import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { reportError } from '@/lib/monitoring';

interface Props { children: ReactNode; /** change this to reset the boundary (e.g. the route path) */ resetKey?: string }
interface State { error: Error | null }

/** Catches render errors in a subtree and offers a retry instead of a blank screen. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info.componentStack);
    reportError(error, { componentStack: info.componentStack });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card max-w-lg mx-auto mt-12 text-center" role="alert">
        <AlertTriangle size={36} className="mx-auto mb-3" style={{ color: 'var(--tone-red)' }} />
        <h2 className="font-display font-semibold text-lg mb-1" style={{ color: 'var(--fg-primary)' }}>This page hit a snag</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--fg-secondary)' }}>
          Nothing was lost. Try again, and if it keeps happening, reload the page.
        </p>
        <div className="flex gap-2 justify-center">
          <button className="btn-primary" onClick={() => this.setState({ error: null })}><RotateCcw size={14} /> Try again</button>
          <button className="btn-secondary" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </div>
    );
  }
}
