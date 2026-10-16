import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /**
   * Change this to clear a caught error - pass the current route. A boundary
   * holds its error state until something resets it, so one page that threw
   * went on showing its stack trace over every page the officer opened
   * afterwards, and only a full reload cleared it. The whole app looked
   * broken when a single screen was.
   */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-10 bg-red-50 border border-red-100 rounded-3xl text-red-600 m-4">
          <h2 className="text-2xl font-black uppercase tracking-tighter mb-4">Something went wrong</h2>
          <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm overflow-auto max-h-[400px]">
            <p className="font-mono text-xs whitespace-pre-wrap">{this.state.error?.stack || this.state.error?.message}</p>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-6 px-8 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-red-500/20"
          >
            Reload System
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
