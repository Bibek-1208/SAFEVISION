import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[SafeVision UI Error Boundary]', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="hud-panel p-6 rounded-lg border border-critical/40 bg-[#1A1112] text-gray-200 flex flex-col items-center justify-center text-center my-4">
          <div className="w-12 h-12 rounded-full bg-critical/20 flex items-center justify-center text-critical mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">
            {this.props.fallbackTitle || 'Component Telemetry Interrupted'}
          </h3>
          <p className="text-xs text-gray-400 max-w-md mb-4 font-mono">
            {this.state.error?.message || 'An unexpected rendering error occurred in this surveillance viewport.'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-critical text-white rounded font-medium text-xs hover:bg-critical-dark transition shadow-glow-critical"
          >
            <RefreshCw className="w-4 h-4" />
            Reconnect Viewport
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
