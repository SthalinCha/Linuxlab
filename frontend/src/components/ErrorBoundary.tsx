import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200/60 shadow mx-4 my-8">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <i className="fas fa-exclamation-triangle text-red-500 text-xl"></i>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Algo salió mal</h2>
          <p className="text-sm text-slate-500 mb-4 max-w-md text-center">
            Ocurrió un error inesperado. Intenta recargar la página.
          </p>
          <div className="text-xs text-slate-400 mb-6 max-w-lg text-center font-mono bg-slate-50 rounded-lg p-3">
            {this.state.error?.message || 'Error desconocido'}
          </div>
          <div className="flex gap-3">
            <button onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 transition-all">
              <i className="fas fa-rotate"></i>
              Recargar
            </button>
            <button onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">
              Reintentar
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
