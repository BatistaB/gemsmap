import { Component, type ReactNode } from 'react';

/** Keeps a crash in one panel from blanking the whole app, and shows what failed. */
export class ErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[GEMs MAP] ${this.props.name} crashed:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel-error">
        <b>{this.props.name} hit an error</b>
        <div className="mono small">{this.state.error.message}</div>
        <button className="btn small" onClick={() => this.setState({ error: null })}>Try again</button>
        <div className="muted small">Your work is safe (autosaved). Please send this message so it can be fixed.</div>
      </div>
    );
  }
}
