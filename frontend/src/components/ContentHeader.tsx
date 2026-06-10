interface ContentHeaderProps {
  title: string
  icon?: string
  children?: React.ReactNode
}

export default function ContentHeader({ title, icon, children }: ContentHeaderProps) {
  const today = new Date()

  return (
    <header className="flex items-start justify-between gap-4">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
        {icon && <i className={`fas ${icon} text-slate-400 mr-2.5`} />}
        {title}
      </h1>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded-full px-3 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Sistema Activo
        </span>
        <span className="text-xs text-slate-400">
          <i className="fas fa-calendar-alt mr-1" />
          {today.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        {children && (
          <div className="mt-2 space-y-0.5 text-right">
            {children}
          </div>
        )}
      </div>
    </header>
  )
}
