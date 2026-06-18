import React from 'react'

type ErrorBoundaryState = {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }
  stackRef = React.createRef<HTMLPreElement>()

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App crashed:', error, info)
    fetch('/api/debug/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: error.message, stack: error.stack, componentStack: info.componentStack })
    }).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ maxWidth: '720px', width: '100%', background: 'rgba(0,0,0,0.45)', color: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Frontend crash</h1>
            <p style={{ fontSize: '13px', opacity: 0.85, marginBottom: '12px' }}>There was a runtime error while rendering the app.</p>
            {this.state.error?.message && (
              <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.35)', padding: '12px', borderRadius: '8px', fontSize: '12px', lineHeight: 1.4 }}>
                {this.state.error.message}
              </pre>
            )}
            {this.state.error?.stack && (
              <pre ref={this.stackRef} style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.35)', padding: '12px', borderRadius: '8px', fontSize: '11px', lineHeight: 1.3, marginTop: '8px', maxHeight: '400px', overflow: 'auto' }}>
                {this.state.error.stack}
              </pre>
            )}
            <p style={{ fontSize: '12px', opacity: 0.8, marginTop: '12px' }}>Open DevTools console for the stack trace.</p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
