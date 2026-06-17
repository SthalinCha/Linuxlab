interface IconButtonProps {
  icon: string
  tooltip: string
  className?: string
  disabled?: boolean
  onClick: () => void
}

export default function IconButton({ icon, tooltip, className = '', disabled = false, onClick }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      disabled={disabled}
      className={`px-2 py-1.5 text-xs font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      <i className={`fas ${icon}`}></i>
    </button>
  )
}
