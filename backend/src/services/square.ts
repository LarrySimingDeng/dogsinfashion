import { config } from '../config.js'

// Square SDK types (imported as types only so the real SDK isn't loaded
// until the first call — flag=off deploys never import `square`).
type SquareClient = import('square').SquareClient

let clientPromise: Promise<SquareClient> | null = null

async function getSquareClient(): Promise<SquareClient | null> {
  if (!isSquareConfigured()) return null
  if (clientPromise) return clientPromise

  clientPromise = (async () => {
    const { SquareClient, SquareEnvironment } = await import('square')
    return new SquareClient({
      token: config.SQUARE_ACCESS_TOKEN!,
      environment:
        config.SQUARE_ENVIRONMENT === 'production'
          ? SquareEnvironment.Production
          : SquareEnvironment.Sandbox,
    })
  })()

  return clientPromise
}

export function isSquareConfigured(): boolean {
  return !!(
    config.DEPOSIT_REQUIRED &&
    config.SQUARE_ACCESS_TOKEN &&
    config.SQUARE_APPLICATION_ID &&
    config.SQUARE_LOCATION_ID
  )
}

/**
 * Extract a human-readable error message from a Square SDK failure.
 * v44 throws `SquareError` instances with an `errors` array of `{ category, code, detail }`.
 */
function extractSquareErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { errors?: Array<{ detail?: string; code?: string }>; message?: string }
    const first = e.errors?.[0]
    if (first?.detail) return first.detail
    if (first?.code) return first.code
    if (e.message) return e.message
  }
  return 'Unknown Square error'
}

export async function createSquarePayment(params: {
  sourceId: string
  amountCents: number
  idempotencyKey: string
  referenceId: string
  note: string
}): Promise<{
  squarePaymentId: string
  receiptUrl: string | null
  orderId: string | null
}> {
  const client = await getSquareClient()
  if (!client) throw new Error('Square not configured')

  try {
    const response = await client.payments.create({
      sourceId: params.sourceId,
      idempotencyKey: params.idempotencyKey,
      amountMoney: {
        // ⚠️ Must be BigInt. Passing a Number throws at runtime.
        amount: BigInt(params.amountCents),
        currency: 'USD',
      },
      locationId: config.SQUARE_LOCATION_ID!,
      // Synchronous capture — no separate CAPTURE step needed.
      autocomplete: true,
      referenceId: params.referenceId,
      note: params.note,
    })

    const payment = response.payment
    if (!payment || payment.status !== 'COMPLETED') {
      throw new Error(`Square payment not completed: ${payment?.status ?? 'unknown'}`)
    }

    return {
      squarePaymentId: payment.id!,
      receiptUrl: payment.receiptUrl ?? null,
      orderId: payment.orderId ?? null,
    }
  } catch (err) {
    throw new Error(extractSquareErrorMessage(err))
  }
}

export async function refundSquarePayment(
  squarePaymentId: string,
  idempotencyKey: string,
): Promise<{ refundId: string }> {
  const client = await getSquareClient()
  if (!client) throw new Error('Square not configured')

  try {
    const response = await client.refunds.refundPayment({
      idempotencyKey,
      paymentId: squarePaymentId,
      amountMoney: {
        amount: BigInt(config.DEPOSIT_AMOUNT_CENTS),
        currency: 'USD',
      },
      reason: 'Booking creation failed after charge',
    })

    const refund = response.refund
    if (!refund?.id) {
      throw new Error('Refund response missing id')
    }
    return { refundId: refund.id }
  } catch (err) {
    throw new Error(extractSquareErrorMessage(err))
  }
}
