import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ForwardedRef } from 'react'

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  loadingText?: string
  variant?: 'primary' | 'danger' | 'ghost' | 'icon'
  icon?: string
}

const variantStyles = {
  primary: 'bg-slate-800 hover:bg-slate-700 text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  ghost: 'bg-slate-100 hover:bg-slate-200 text-slate-600',
  icon: '',
}

function LoadingButtonInner({
  loading = false,
  loadingText,
  variant = 'primary',
  icon,
  className = '',
  disabled,
  children,
  onClick,
  ...rest
}: LoadingButtonProps, ref: ForwardedRef<HTMLButtonElement>) {
  const isDisabled = disabled || loading

  const baseClass = variant === 'icon'
    ? `px-2 py-1.5 text-xs font-medium rounded-lg ${className}`
    : `px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`

  return (
    <button
      ref={ref}
      className={baseClass}
      disabled={isDisabled}
      onClick={loading ? undefined : onClick}
      {...rest}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <i className="fas fa-spinner fa-spin" />
          {loadingText || children}
        </span>
      ) : (
        <span className="inline-flex items-center gap-2">
          {icon && <i className={`fas ${icon}`} />}
          {children}
        </span>
      )}
    </button>
  )
}

const LoadingButton = forwardRef(LoadingButtonInner)
export default LoadingButton
