interface Props {
  serviceName: string
  count: number
  selected?: boolean
  onClick?: () => void
}

const chipColors: Record<string, string> = {
  SSH: 'bg-cyan-100 text-cyan-700 border-cyan-300 hover:bg-cyan-200',
  HTTP: 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200',
  WEB: 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200',
  COCKPIT: 'bg-violet-100 text-violet-700 border-violet-300 hover:bg-violet-200',
  FTP: 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200',
  HTTPS: 'bg-indigo-100 text-indigo-700 border-indigo-300 hover:bg-indigo-200',
  MYSQL: 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200',
  POSTGRES: 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200',
  DNS: 'bg-sky-100 text-sky-700 border-sky-300 hover:bg-sky-200',
  SMTP: 'bg-pink-100 text-pink-700 border-pink-300 hover:bg-pink-200',
}

const fallbackColor = 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'

export default function ServiceChip({ serviceName, count, selected, onClick }: Props) {
  const color = chipColors[serviceName] || fallbackColor

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold
        transition-all duration-150 whitespace-nowrap
        ${color}
        ${selected ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
      `}
    >
      {count > 1 && (
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/60 text-[10px] font-bold">
          {count}
        </span>
      )}
      {serviceName}
    </button>
  )
}
