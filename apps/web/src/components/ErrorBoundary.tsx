'use client';

import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message ?? 'Error inesperado';
      const isNetwork = /fetch|network|conexión/i.test(msg);
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-xl font-bold text-red-400">Algo salió mal</h1>
            <p className="text-slate-400 text-sm">
              {msg}
            </p>
            {isNetwork && (
              <p className="text-slate-500 text-xs">
                Verificá que la API esté corriendo (puerto 4002)
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-500"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
