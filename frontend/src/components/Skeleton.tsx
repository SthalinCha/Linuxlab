interface Props {
  className?: string
  width?: string
  height?: string
}

export function SkeletonBar({ className = '', width, height }: Props) {
  const style: React.CSSProperties = {}
  if (width) style.width = width
  if (height) style.height = height
  const hasStyle = width || height
  return (
    <div
      className={`animate-pulse bg-slate-200 rounded ${className}`}
      {...(hasStyle ? { style } : {})}
    />
  )
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <SkeletonBar className="h-4 w-48" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <SkeletonBar className="h-4 w-4 rounded" />
            {Array.from({ length: cols }).map((_, j) => (
              <SkeletonBar key={j} className={`h-4 ${j === 0 ? 'w-32' : j === 1 ? 'w-40' : j === 2 ? 'w-24' : j === 3 ? 'w-20' : j === 4 ? 'w-28' : 'w-16'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-slate-200/60 shadow rounded-xl p-4 lg:p-5">
          <SkeletonBar className="h-3 w-24 mb-3" />
          <SkeletonBar className="h-8 w-16" />
        </div>
      ))}
    </div>
  )
}
