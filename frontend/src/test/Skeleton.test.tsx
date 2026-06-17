import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SkeletonBar, TableSkeleton } from '../components/Skeleton'

describe('SkeletonBar', () => {
  it('renders with default classes', () => {
    const { container } = render(<SkeletonBar />)
    const bar = container.firstChild as HTMLElement
    expect(bar).toHaveClass('animate-pulse', 'bg-slate-200', 'rounded')
  })

  it('applies additional className', () => {
    const { container } = render(<SkeletonBar className="h-4 w-48" />)
    const bar = container.firstChild as HTMLElement
    expect(bar).toHaveClass('animate-pulse', 'bg-slate-200', 'rounded', 'h-4', 'w-48')
  })
})

describe('TableSkeleton', () => {
  it('renders specified number of rows', () => {
    const { container } = render(<TableSkeleton rows={3} cols={4} />)
    const rows = container.querySelectorAll('.divide-y > div')
    expect(rows).toHaveLength(3)
  })

  it('renders 5 rows by default', () => {
    const { container } = render(<TableSkeleton cols={3} />)
    const rows = container.querySelectorAll('.divide-y > div')
    expect(rows).toHaveLength(5)
  })
})
