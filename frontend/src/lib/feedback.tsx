import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CircleCheck, Info, X } from 'lucide-react'
import { Button } from '../components/ui'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

interface FeedbackState {
  toast: (message: string, kind?: ToastKind) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackState | null>(null)

const TOAST_STYLE: Record<ToastKind, { icon: typeof Info; tone: string }> = {
  success: { icon: CircleCheck, tone: 'text-success' },
  error: { icon: AlertTriangle, tone: 'text-danger' },
  info: { icon: Info, tone: 'text-info' },
}

/** Toasts and a promise-based confirm dialog, replacing window.alert/confirm. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const nextId = useRef(1)

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, kind, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })),
    [],
  )

  const close = (ok: boolean) => {
    dialog?.resolve(ok)
    setDialog(null)
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => {
          const { icon: Icon, tone } = TOAST_STYLE[t.kind]
          return (
            <div key={t.id} role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm shadow-lg">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden />
              <span className="flex-1">{t.message}</span>
              <button aria-label="Dismiss" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-muted hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>

      {dialog && <ConfirmDialog {...dialog} onClose={close} />}
    </FeedbackContext.Provider>
  )
}

function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onClose }: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onMouseDown={() => onClose(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
        <p id="confirm-message" className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onClose(false)}>Cancel</Button>
          <Button ref={confirmRef} variant={danger ? 'danger' : 'primary'} onClick={() => onClose(true)}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider')
  return ctx
}
