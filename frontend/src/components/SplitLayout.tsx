import { KeyboardEvent, PointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from './ui'

const MIN_RATIO = 0.25
const MAX_RATIO = 0.75

const readRatio = (key: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(key))
    return v >= MIN_RATIO && v <= MAX_RATIO ? v : fallback
  } catch {
    return fallback
  }
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/**
 * Editor and output side by side with a draggable (and keyboard-adjustable) divider on wider
 * screens; on phones the two panes become "Code" / "Output" tabs.
 */
export function SplitLayout({
  left, right, storageKey, mobileTab, onMobileTabChange, rightLabel = 'Output', rightBadge,
}: {
  left: ReactNode
  right: ReactNode
  storageKey: string
  mobileTab: 'code' | 'output'
  onMobileTabChange: (tab: 'code' | 'output') => void
  rightLabel?: string
  rightBadge?: ReactNode
}) {
  const isDesktop = useMediaQuery('(min-width: 1280px)')
  const isTablet = useMediaQuery('(min-width: 768px)')
  const [ratio, setRatio] = useState(() => readRatio(storageKey, 0.6))
  const container = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const commit = useCallback((next: number) => {
    const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, next))
    setRatio(clamped)
    try {
      localStorage.setItem(storageKey, String(clamped))
    } catch {
      // not persisted
    }
  }, [storageKey])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !container.current) return
    const rect = container.current.getBoundingClientRect()
    commit((e.clientX - rect.left) / rect.width)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') commit(ratio - 0.05)
    if (e.key === 'ArrowRight') commit(ratio + 0.05)
  }

  if (!isTablet) {
    const tabCls = (active: boolean) => cn('flex-1 py-2 text-[13px] font-medium border-b-2 transition-colors',
      active ? 'border-primary text-fg' : 'border-transparent text-muted')
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div role="tablist" className="flex shrink-0 border-b border-line bg-surface">
          <button role="tab" aria-selected={mobileTab === 'code'} className={tabCls(mobileTab === 'code')} onClick={() => onMobileTabChange('code')}>Code</button>
          <button role="tab" aria-selected={mobileTab === 'output'} className={tabCls(mobileTab === 'output')} onClick={() => onMobileTabChange('output')}>
            <span className="inline-flex items-center gap-1.5">{rightLabel}{rightBadge}</span>
          </button>
        </div>
        <div className="min-h-0 flex-1">{mobileTab === 'code' ? left : right}</div>
      </div>
    )
  }

  const effective = isDesktop ? ratio : 0.5
  return (
    <div ref={container} className="flex min-h-0 flex-1">
      <div className="min-w-0" style={{ flexBasis: `${effective * 100}%` }}>{left}</div>
      <div
        role="separator" aria-orientation="vertical" aria-label="Resize editor and output"
        aria-valuemin={MIN_RATIO * 100} aria-valuemax={MAX_RATIO * 100} aria-valuenow={Math.round(effective * 100)}
        tabIndex={isDesktop ? 0 : -1}
        onPointerDown={isDesktop ? onPointerDown : undefined}
        onPointerMove={onPointerMove}
        onPointerUp={() => (dragging.current = false)}
        onKeyDown={onKeyDown}
        className={cn('group relative w-px shrink-0 bg-line', isDesktop && 'cursor-col-resize')}
      >
        <span className="absolute inset-y-0 -left-1.5 -right-1.5 transition-colors group-hover:bg-primary/20 group-focus-visible:bg-primary/30" />
      </div>
      <div className="min-w-0 flex-1">{right}</div>
    </div>
  )
}
