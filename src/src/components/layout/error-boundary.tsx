"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-6 max-w-md w-full">
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Something went wrong
            </h2>
            {this.state.error && (
              <p className="mt-2 text-sm text-[var(--muted-foreground)] font-mono break-words">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.reset}
              className="mt-4 rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)] text-[var(--foreground)]"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
