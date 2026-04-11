import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

// ---- Env (resolved at build time) ---------------------------------------
const SQUARE_APPLICATION_ID = import.meta.env.VITE_SQUARE_APPLICATION_ID as
  | string
  | undefined
const SQUARE_LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID as
  | string
  | undefined
const SQUARE_ENVIRONMENT =
  (import.meta.env.VITE_SQUARE_ENVIRONMENT as string | undefined) || 'sandbox'

const SQUARE_SDK_URL =
  SQUARE_ENVIRONMENT === 'production'
    ? 'https://web.squarecdn.com/v1/square.js'
    : 'https://sandbox.web.squarecdn.com/v1/square.js'

// ---- SDK loader (singleton) ---------------------------------------------
// Module-level cache so React 18 Strict Mode double-mounts + step navigation
// never re-download the script.
let sdkPromise: Promise<void> | null = null

function loadSquareSdk(): Promise<void> {
  if (typeof window !== 'undefined' && (window as unknown as { Square?: unknown }).Square) {
    return Promise.resolve()
  }
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SQUARE_SDK_URL}"]`,
    )
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => {
        sdkPromise = null
        reject(new Error('Failed to load Square SDK'))
      })
      return
    }
    const script = document.createElement('script')
    script.src = SQUARE_SDK_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      sdkPromise = null
      reject(new Error('Failed to load Square SDK'))
    }
    document.head.appendChild(script)
  })

  return sdkPromise
}

// ---- Public types --------------------------------------------------------
export interface SquarePaymentFormHandle {
  /** Tokenize the card; throws with a user-readable message on failure. */
  tokenize: () => Promise<string>
}

interface SquarePaymentFormProps {
  onReady?: () => void
  onError?: (message: string) => void
}

// Minimal structural types for the parts of the Web Payments SDK we touch.
type TokenizeResult = {
  status: 'OK' | string
  token?: string
  errors?: Array<{ message?: string; field?: string; type?: string }>
}
type SquareCard = {
  attach: (selector: HTMLElement | string) => Promise<void>
  tokenize: () => Promise<TokenizeResult>
  destroy: () => Promise<void>
}
type SquarePayments = {
  card: (options?: Record<string, unknown>) => Promise<SquareCard>
}
type SquareGlobal = {
  payments: (applicationId: string, locationId: string) => SquarePayments
}

export const SquarePaymentForm = forwardRef<
  SquarePaymentFormHandle,
  SquarePaymentFormProps
>(function SquarePaymentForm({ onReady, onError }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<SquareCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({
    tokenize: async () => {
      if (!cardRef.current) {
        throw new Error('Payment form is not ready yet')
      }
      const result = await cardRef.current.tokenize()
      if (result.status === 'OK' && result.token) {
        return result.token
      }
      const first = result.errors?.[0]
      throw new Error(first?.message || 'Card tokenization failed')
    },
  }))

  useEffect(() => {
    let cancelled = false
    let localCard: SquareCard | null = null

    void (async () => {
      try {
        if (!SQUARE_APPLICATION_ID || !SQUARE_LOCATION_ID) {
          throw new Error('Square is not configured')
        }

        await loadSquareSdk()
        if (cancelled) return

        const Square = (window as unknown as { Square?: SquareGlobal }).Square
        if (!Square) throw new Error('Square SDK unavailable')

        const payments = Square.payments(SQUARE_APPLICATION_ID, SQUARE_LOCATION_ID)
        // Square's style validator is strict: fontFamily must be a single
        // name (no comma-separated fallback lists) and only a limited set of
        // selectors/props are allowed. Keep this minimal.
        localCard = await payments.card({
          style: {
            input: {
              fontSize: '15px',
              color: '#3a2f28',
            },
            '.input-container': {
              borderRadius: '12px',
              borderColor: '#c9e3ec',
            },
            '.input-container.is-focus': {
              borderColor: '#ff8a7a',
            },
            '.input-container.is-error': {
              borderColor: '#dc2626',
            },
            '.message-text': {
              color: '#6b6058',
            },
            '.message-text.is-error': {
              color: '#dc2626',
            },
          },
        })

        if (cancelled || !containerRef.current) {
          await localCard.destroy().catch(() => {})
          return
        }

        await localCard.attach(containerRef.current)
        if (cancelled) {
          await localCard.destroy().catch(() => {})
          return
        }

        cardRef.current = localCard
        setLoading(false)
        onReady?.()
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Failed to load payment form'
        setErrorMsg(msg)
        setLoading(false)
        onError?.(msg)
      }
    })()

    return () => {
      cancelled = true
      const c = cardRef.current ?? localCard
      cardRef.current = null
      if (c) {
        c.destroy().catch(() => {})
      }
    }
    // We intentionally run this effect exactly once per mount. The callbacks
    // are captured from the initial render — the parent should pass stable
    // handlers (or none) if it cares about re-invocation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div
        ref={containerRef}
        className="min-h-[56px] rounded-xl"
        data-testid="square-card-container"
      />
      {loading && !errorMsg && (
        <p className="mt-2 text-xs text-warm-gray">Loading secure payment form…</p>
      )}
      {errorMsg && (
        <p className="mt-2 text-xs text-red-600">{errorMsg}</p>
      )}
    </div>
  )
})
