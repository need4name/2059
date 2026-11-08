import { Component, type ReactNode } from 'react';

/** Where the last crash's message is kept (outside the save), so it can be read and fixed. */
export const LAST_ERROR_KEY = '2059-last-error';

/**
 * If a screen throws while drawing, show a way back in instead of a frozen app. The save is
 * untouched (it's written as you play), and the error is kept for whoever fixes it.
 */
export class Crashed extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    try {
      localStorage.setItem(LAST_ERROR_KEY, JSON.stringify({ at: new Date().toISOString(), message: error.message, stack: String(error.stack ?? '').split('\n').slice(0, 6).join('\n'), where: String(info.componentStack ?? '').split('\n').slice(0, 6).join('\n') }));
    } catch { /* storage full or blocked: nothing to keep */ }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full w-full items-center justify-center bg-hud-bg px-4">
        <div className="slab w-full max-w-[var(--col)] space-y-4 rounded-[28px] p-6 text-center">
          <div className="font-display text-2xl font-semibold text-white">Something broke</div>
          <p className="text-sm leading-relaxed text-hud-dim">Your save is safe. Carry on to pick up where you were.</p>
          <p className="break-words rounded-2xl bg-black/30 px-3 py-2 text-left font-mono text-[11px] text-hud-faint">{this.state.error.message}</p>
          <button className="key key-primary w-full rounded-full px-5 py-3 text-[15px] font-semibold text-[#03222b]" onClick={() => window.location.reload()}>Carry on</button>
        </div>
      </div>
    );
  }
}
