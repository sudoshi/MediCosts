import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px', gap: 16, textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.12)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 20,
        }}>!</div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600,
          color: 'var(--text-primary)', letterSpacing: '-0.02em',
        }}>Something went wrong</h2>
        <p style={{
          fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400, lineHeight: 1.5,
        }}>
          {this.state.error?.message || 'An unexpected error occurred while rendering this view.'}
        </p>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            marginTop: 8, padding: '8px 20px', background: 'var(--accent-dim)',
            border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--accent-light)',
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >Try Again</button>
      </div>
    );
  }
}
