'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw, ArrowLeft, ChevronDown } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface EmailErrorBoundaryProps {
  children: ReactNode;
}

interface EmailErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

/**
 * Catches render-time errors inside the Email AI module so the user never
 * sees a white/blank page. Logs the full error to the console and offers
 * Retry, View Details, and Go Back actions.
 */
export default class EmailErrorBoundary extends Component<
  EmailErrorBoundaryProps,
  EmailErrorBoundaryState
> {
  state: EmailErrorBoundaryState = {
    hasError: false,
    error: null,
    showDetails: false,
  };

  static getDerivedStateFromError(error: Error): Partial<EmailErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[EmailErrorBoundary] Component crashed:', error);
    if (info?.componentStack) {
      console.error('[EmailErrorBoundary] Component stack:', info.componentStack);
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  private handleGoBack = (): void => {
    this.setState({ hasError: false, error: null, showDetails: false });
    window.dispatchEvent(new CustomEvent('change-tab', { detail: 'dashboard' }));
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px] p-8 text-center animate-in fade-in">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-9 h-9 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
        <p className="text-slate-500 max-w-md mb-6">
          An unexpected error occurred while rendering this section. Please try again.
        </p>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/20 transition-all"
          >
            <RotateCcw className="w-4 h-4" /> Retry
          </button>
          <button
            onClick={this.handleGoBack}
            className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Go Back
          </button>
        </div>

        <button
          onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
          className={cn(
            "flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors",
            this.state.showDetails && "text-slate-800"
          )}
        >
          View Details
          <ChevronDown className={cn("w-4 h-4 transition-transform", this.state.showDetails && "rotate-180")} />
        </button>

        {this.state.showDetails && this.state.error && (
          <pre className="mt-4 w-full max-w-2xl text-left text-xs bg-slate-900 text-red-300 p-4 rounded-xl overflow-auto custom-scrollbar">
            {String(this.state.error.stack || this.state.error.message || this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}
