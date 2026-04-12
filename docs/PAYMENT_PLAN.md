# Phase 7 — Mandatory Deposit (Square Payments)

> **前置依赖**: `CANCEL_PLAN.md` 必须先完成并在 prod 稳定跑过。

## Context

Dogs in Fashion 的预约流程目前完全不收钱。Larry 想把 Square 集成进来，让客户预约时先付 $20 定金锁定时间段，剩余余款剪狗当天现金或 Square 现场刷卡收取。

### 关键业务决策（经过一轮完整的 plan review 后敲定）

1. **定金是强制的，不是可选的**
   旧版 plan 曾经考虑过 "optional deposit + Skip button"，但经过讨论认定：**可选定金 = 打赏**，对 no-show 毫无约束力，也不能过滤无支付能力的假客户。定金的商业价值（commitment device + fraud filter）只有在强制时才成立。所以砍掉 optional 中间态，只保留**两个状态**：
   - `off`（当前 + 推广期）: 完全不收定金，和现在一模一样
   - `required`（两个月后 flip）: 必须付定金才能预约，失败 = booking 不成立

2. **定金政策**: **不退款**。作为明确的取消费。Doris 特殊情况想退就自己在 Square dashboard 手动退。

3. **收款时机**: 预约时付 $20 定金，剩余余款剪狗现场收。

4. **支付流程**: 原子事务 — `POST /api/bookings/with-deposit` **先 charge Square 再 insert booking**，任何一步失败都回滚。

5. **集成方式**: Square Web Payments SDK 嵌入式卡号表单（iframe 字段，PCI SAQ-A 合规）

6. **Feature flag**: 单一布尔 `DEPOSIT_REQUIRED`，两个月后 Doris 准备好了 Larry 改两个环境变量 + 两边 redeploy 即可启用。

---

## 1. Feature Flag 设计

### Backend env（`backend/src/config.ts`）
```ts
// Square Payments (optional + feature-flagged)
// ⚠️ DEPOSIT_REQUIRED 必须用 enum+transform，不能用 z.coerce.boolean()
// 因为 Boolean("false") === true（非空字符串全是 truthy）
DEPOSIT_REQUIRED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
DEPOSIT_AMOUNT_CENTS: z.coerce.number().int().positive().default(2000),
SQUARE_ACCESS_TOKEN: z.string().optional(),
SQUARE_APPLICATION_ID: z.string().optional(),
SQUARE_LOCATION_ID: z.string().optional(),
SQUARE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
LARRY_ALERT_EMAIL: z.string().email().optional(),  // critical error 告警收件人
```

### Frontend env（Vite）
```
VITE_DEPOSIT_REQUIRED=false   # 默认关闭
VITE_DEPOSIT_AMOUNT_CENTS=2000
VITE_SQUARE_APPLICATION_ID=...
VITE_SQUARE_LOCATION_ID=...
VITE_SQUARE_ENVIRONMENT=sandbox
```

**前端判断必须用字符串比较**（Vite 的 `import.meta.env.VITE_*` 全部是字符串）：
```ts
const depositRequired = import.meta.env.VITE_DEPOSIT_REQUIRED === 'true'
```

### 两态行为矩阵

| Flag 状态 | 前端 BookingPage | 后端 `POST /api/bookings` | 后端 `POST /api/bookings/with-deposit` |
|---|---|---|---|
| `DEPOSIT_REQUIRED=false`（默认） | 无定金 UI，Confirm 按钮 = "Confirm Booking" | **启用**，和现在一样 | 返回 503 `Payments not enabled` |
| `DEPOSIT_REQUIRED=true` + Square 配置齐全 | Confirm 步骤嵌入 Square 卡号表单，按钮 = "Pay $20 & Confirm" | **返回 503** `Deposit required, use /with-deposit` | 启用，原子事务处理 |
| `DEPOSIT_REQUIRED=true` 但 Square env 缺失 | 不显示定金 UI（防呆降级） | 同上 | 返回 503 `Payments temporarily unavailable` |

### 开启步骤（两个月后）
1. Doris 告诉 Larry 要上线定金
2. Larry 在 Railway 改 `DEPOSIT_REQUIRED=true`，Vercel 改 `VITE_DEPOSIT_REQUIRED=true`
3. 两边各 redeploy 一次
4. Larry 自己用真卡预约 1 单 $1 测试（临时改 `DEPOSIT_AMOUNT_CENTS=100`）→ 确认 Square 收到 → 从 Square dashboard 退款 → 恢复 `DEPOSIT_AMOUNT_CENTS=2000`
5. 完事

### 回滚步骤（如果出问题）
把两个 flag 改回 `false` + redeploy，**分钟级回滚，无需代码改动**。

---

## 2. Data Model

### 新表 `payments`（审计 + 未来退款引用）
```sql
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  type text not null default 'deposit'
    check (type in ('deposit', 'balance', 'refund')),
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'USD',
  status text not null default 'paid'
    check (status in ('paid', 'refunded')),
  square_payment_id text unique,
  square_receipt_url text,
  paid_at timestamptz not null default now(),
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_payments_booking on payments(booking_id);
```

**关键差异和 v1 plan 对比**:
- ❌ 没有 `'pending'` / `'processing'` / `'failed'` 状态 —— 原子流程下这些状态不会出现在 DB 里（失败 = 根本没 insert）
- ❌ 没有 `failure_reason` 列 —— 同上
- ✅ 多了 `'refund'` type 留给未来
- ✅ 简化为 `paid` / `refunded` 两态

### RLS 策略
```sql
alter table payments enable row level security;

create policy "Users view own payments" on payments for select using (
  exists (select 1 from bookings b
          where b.id = payments.booking_id and b.user_id = auth.uid())
);
```

**注意**: 没有"admin 查看所有"的 policy，因为后端完全用 `supabaseAdmin`（service role key）绕过 RLS。admin 视图直接走 backend API，不走 PostgREST。

### `bookings` 表新增 2 列
```sql
alter table bookings add column deposit_status text not null default 'none'
  check (deposit_status in ('none', 'paid', 'refunded'));
alter table bookings add column deposit_paid_at timestamptz;
```

**状态简化**:
- `'none'`: flag=off 时所有 booking / flag=on 但 Doris 在 Square dashboard 手动处理的特殊 case
- `'paid'`: flag=on 下所有正常 booking 的默认状态
- `'refunded'`: Doris 特殊情况手动退款后，她（或 Larry）在 admin UI 或 SQL 里改这个字段

### Migration 文件
仓库没有 `supabase/migrations/` 目录。参照现有 `mock-data.sql` 模式，新建 `2026-04-XX-payments.sql` 在仓库根目录（XX 替换为实际日期），Larry 通过 Supabase Dashboard → SQL Editor 手动跑（dev 和 prod 各一次）。

---

## 3. Backend 改动

### 3.1 `backend/src/config.ts` — 新增 7 个 env var
见 §1。顺手清理 `.env.example` 里遗留的 Stripe 占位符（`VITE_STRIPE_PUBLISHABLE_KEY`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`），换成 Square 对应的。

### 3.2 新文件 `backend/src/services/square.ts`

**依赖**: `cd backend && npm install square@^44.0.0`
**当前版本**: `44.0.1`（2026-04-10 实施时查到的 latest）。下面的代码对照 `node_modules/square/api/**/*.d.ts` 的 TypeScript 定义校对过，API 形状对齐 v44.x 实际 SDK。

**v44 SDK 的关键事实**（都从 `.d.ts` 源文件确认过）:
- `import { SquareClient, SquareEnvironment, SquareError } from 'square'`
- `SquareEnvironment` 不再是真正的 enum，是一个 const 对象，`.Production` / `.Sandbox` 是 URL 字符串常量（使用上照样写 `SquareEnvironment.Sandbox`）
- `new SquareClient({ token, environment })` 构造器
- `client.payments.create({ sourceId, idempotencyKey, amountMoney: { amount: BigInt, currency }, locationId, autocomplete, referenceId, note })` — 所有字段 camelCase
- `client.refunds.refundPayment({ idempotencyKey, paymentId, amountMoney, reason })`
- 返回类型是 `HttpResponsePromise<T> extends Promise<T>`，所以 `await` 直接拿到 parsed response，不需要 `.withRawResponse()`
- Response shape: `CreatePaymentResponse.payment?: Payment`，`Payment` 上有 `.id` / `.status` / `.receiptUrl` / `.orderId` / `.referenceId` / `.amountMoney`（全 camelCase）
- 错误抛出 `SquareError` 实例，具有 `.errors: BodyError[]`（每个 `BodyError` 有 `.detail` / `.code` / `.category` / `.field`）+ `.message` + `.statusCode` + `.body` + `.rawResponse`

**升级主版本时必做**: 跑 `npm view square version` 看是否到了 v45+。如果是，对照 `node_modules/square/api/resources/payments/client/Client.d.ts` 和 `api/resources/refunds/client/Client.d.ts` 重新校对字段名（主版本之间不保证兼容）。之后跑 `npx tsc --noEmit`。

```ts
import { config } from '../config.js'

// Type-only import: 真正的 SDK 只在第一次调用时动态 import，
// flag=off 部署永远不会加载 square 包。
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
 * v44 throws `SquareError` instances with `.errors[]` of `{ category, code, detail }`.
 * Duck-typed so we don't need a static import of the SquareError class
 * (which would defeat dynamic import on flag=off deploys).
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
  referenceId: string  // 调用方传预生成的 booking id，用作 Square ↔ DB 的 1:1 对账标识
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
```

**实施时的 3 处小改进**（2026-04-10 确认 v44 形状后应用）:
1. `squareClient` 缓存从单例 `any` 变量改成 `Promise<SquareClient>`，避免并发首次调用时重复动态 import
2. 类型从 `any` 改成 `import('square').SquareClient` 的 **type-only import**，保留 flag-off 惰性加载的同时拿回 TS 类型提示
3. 错误处理抽成独立 `extractSquareErrorMessage()` helper，3 级 fallback（`detail` → `code` → `message`）而不是 2 级

### 3.3 `backend/src/routes/bookings.ts` — 新增 atomic endpoint + 旧端点守卫

**a) 现有 `POST /` (即 `POST /api/bookings`) 加一行守卫**（放在 `requireAuth` 之后、Zod 校验之前）:
```ts
bookingsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  // 🛡 Feature flag 守卫
  if (config.DEPOSIT_REQUIRED) {
    res.status(503).json({ error: 'Deposit required. Use /api/bookings/with-deposit' })
    return
  }

  // ... 现有逻辑不变 ...
})
```

**b) 新增 `POST /with-deposit`** 放在 `POST /` 之后：
```ts
import { randomUUID } from 'crypto'
import { createSquarePayment, refundSquarePayment, isSquareConfigured } from '../services/square.js'
import { notifyDorisDepositPaid, notifyLarryCriticalError } from '../services/email.js'

bookingsRouter.post('/with-deposit', requireAuth, async (req: AuthRequest, res) => {
  // 🛡 短路守卫
  if (!config.DEPOSIT_REQUIRED) {
    res.status(503).json({ error: 'Deposits not enabled. Use /api/bookings' })
    return
  }
  if (!isSquareConfigured()) {
    res.status(503).json({ error: 'Payments temporarily unavailable' })
    return
  }

  // Zod 校验
  const schema = z.object({
    service_id: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    dog_name: z.string().min(1),
    dog_breed: z.string().optional(),
    address: z.string().min(1),
    notes: z.string().optional(),
    source_id: z.string().min(1),         // Square Web SDK token
    idempotency_key: z.string().uuid(),   // 客户端生成的 UUID
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const { service_id, date, start_time, dog_name, dog_breed, address, notes, source_id, idempotency_key } = parsed.data

  const duration = SERVICE_DURATIONS[service_id]
  if (!duration) {
    res.status(400).json({ error: 'Invalid service_id' })
    return
  }

  const end_time = addMinutesToTime(start_time, duration * 60)

  // 步骤 1: 检查时间段可用（pre-check，避免给明显不可能的 booking 扣钱）
  const available = await getAvailableSlots(date, service_id)
  if (!available.some(s => s.start === start_time)) {
    res.status(409).json({ error: 'This time slot is no longer available' })
    return
  }

  // 预先生成 booking id，后面把它同时传给 Square 当 reference_id 和 insert 时显式当 id。
  // 这样 Square dashboard ↔ bookings 表是干净的 1:1 对照（Doris 在 Square 后台看到
  // 一笔付款，reference_id 就是完整的 booking id，可以直接反查）。
  const bookingId = randomUUID()

  // 步骤 2: 调 Square charge（这一步之后客户的钱已经扣了）
  // ⚠️ Square API 字段长度限制（实施时踩过的坑，2026-04-10）:
  //   - reference_id: max 40 chars（UUID 是 36 字符，刚好塞得下）
  //   - note:         max 500 chars → 防御 dog_name 超长
  const note = `Deposit for ${dog_name} on ${date} ${start_time}`.slice(0, 500)
  let squareResult
  try {
    squareResult = await createSquarePayment({
      sourceId: source_id,
      amountCents: config.DEPOSIT_AMOUNT_CENTS,
      idempotencyKey: idempotency_key,
      referenceId: bookingId,
      note,
    })
  } catch (err) {
    console.error('[with-deposit] Square charge failed:', err)
    res.status(402).json({
      error: 'Payment failed',
      detail: err instanceof Error ? err.message : String(err),
    })
    return
  }

  // 步骤 3: 插入 bookings 行（显式传 id，和 Square reference_id 对齐）
  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .insert({
      id: bookingId,
      user_id: req.user!.id,
      service_id,
      date,
      start_time,
      end_time,
      dog_name,
      dog_breed: dog_breed ?? null,
      address,
      notes: notes ?? null,
      status: 'confirmed',
      deposit_status: 'paid',
      deposit_paid_at: new Date().toISOString(),
    })
    .select()
    .single()

  // 步骤 3b: 兜底 — charge 成功但 insert 失败 → 退款
  if (bookingErr || !booking) {
    console.error('[with-deposit] CRITICAL: charge succeeded but booking insert failed', {
      squarePaymentId: squareResult.squarePaymentId,
      userId: req.user!.id,
      error: bookingErr,
    })

    try {
      await refundSquarePayment(squareResult.squarePaymentId, randomUUID())
      res.status(409).json({
        error: 'That slot was just taken. Your payment has been refunded.',
      })
    } catch (refundErr) {
      console.error('[with-deposit] DOUBLE CRITICAL: refund also failed', {
        squarePaymentId: squareResult.squarePaymentId,
        refundErr,
      })
      // 异步通知 Larry 人工介入
      notifyLarryCriticalError({
        subject: 'URGENT: Square charge succeeded, booking failed, refund failed',
        details: {
          squarePaymentId: squareResult.squarePaymentId,
          userId: req.user!.id,
          userEmail: req.user!.email,
          bookingError: String(bookingErr),
          refundError: refundErr instanceof Error ? refundErr.message : String(refundErr),
          amountCents: config.DEPOSIT_AMOUNT_CENTS,
        },
      }).catch(e => console.error('Failed to notify Larry:', e))

      res.status(500).json({
        error: 'Payment processed but booking failed. You have been contacted by our team for a manual refund.',
      })
    }
    return
  }

  // 步骤 4: 插入 payments 审计行
  const { error: paymentErr } = await supabaseAdmin.from('payments').insert({
    booking_id: booking.id,
    type: 'deposit',
    amount_cents: config.DEPOSIT_AMOUNT_CENTS,
    currency: 'USD',
    status: 'paid',
    square_payment_id: squareResult.squarePaymentId,
    square_receipt_url: squareResult.receiptUrl,
    paid_at: new Date().toISOString(),
  })
  if (paymentErr) {
    // 非致命：booking 已建，审计行失败只打日志（钱收到了，booking 也建了）
    console.error('[with-deposit] payment audit row insert failed:', paymentErr)
  }

  // 步骤 5: AWAIT Google Calendar 创建（和现有 POST / 的模式一样）
  const clientEmail = req.user!.email
  try {
    const eventId = await createCalendarEvent(booking, clientEmail)
    if (eventId) {
      await supabaseAdmin.from('bookings').update({ google_event_id: eventId }).eq('id', booking.id)
      booking.google_event_id = eventId
    }
  } catch (err) {
    console.error('[with-deposit] Calendar event failed:', err)
  }

  // 步骤 6: Fire-and-forget 通知
  sendBookingConfirmation(booking, clientEmail).catch(err => console.error('Confirmation email failed:', err))
  notifyDorisNewBooking(booking, clientEmail).catch(err => console.error('Doris email failed:', err))
  notifyDorisDepositPaid(booking, config.DEPOSIT_AMOUNT_CENTS, squareResult.receiptUrl)
    .catch(err => console.error('Doris deposit email failed:', err))
  notifyDorisSms(booking).catch(err => console.error('Doris SMS failed:', err))
  scheduleReminders(booking, clientEmail).catch(err => console.error('Schedule reminders failed:', err))

  res.status(201).json({
    ...booking,
    deposit_receipt_url: squareResult.receiptUrl,
  })
})
```

**关键设计要点**:
1. **Pre-check slot (步骤 1)**: SELECT 查询，零写入。避免明显冲突就扣钱。
2. **先 charge 后 insert**: 符合直觉的顺序，没有"先建 pending booking"的状态机复杂度。
3. **Race window 处理**: 步骤 1 和步骤 3 之间有 1-3 秒（Square API 耗时）。这个窗口里别人可能订同一时间段。发生时步骤 3 会失败，进入步骤 3b 退款分支。一年估计 0-2 次。
4. **Payment 审计行失败非致命**: booking 已建，钱已收，审计行只是记录。失败打日志手动补。
5. **没有 retry 逻辑**: 失败就让客户重填卡号重新提交整个流程（新的 idempotency key，新的 source token）。

### 3.4 `backend/src/services/email.ts` — 新增两个函数

**`notifyDorisDepositPaid`**: 发给 Doris 的定金到账通知
```ts
export async function notifyDorisDepositPaid(
  booking: Booking,
  amountCents: number,
  receiptUrl: string | null,
): Promise<void> {
  if (!resend) return

  const serviceName = serviceDisplayName(booking.service_id)
  const amountDollars = (amountCents / 100).toFixed(2)

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: config.DORIS_EMAIL,
      subject: `Deposit Received: $${amountDollars} — ${booking.dog_name}`,
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2 style="color:#5BA4D9">Deposit Received</h2>
          <p>A $${amountDollars} deposit has been paid for this booking:</p>
          <p><strong>Service:</strong> ${serviceName}</p>
          <p><strong>Dog:</strong> ${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}</p>
          <p><strong>Date:</strong> ${formatBookingDate(booking)}</p>
          <p><strong>Time:</strong> ${formatTime(booking.start_time)} — ${formatTime(booking.end_time)}</p>
          ${receiptUrl ? `<p><a href="${receiptUrl}">View Square receipt</a></p>` : ''}
          <p style="color:#7A7570;font-size:13px;margin-top:16px">This deposit is non-refundable per policy. Balance due at grooming.</p>
        </div>
      `,
    })
    if (error) throw error
  } catch (err) {
    console.error('Failed to notify Doris about deposit:', err)
  }
}
```

**`notifyLarryCriticalError`**: 发给 Larry 的系统告警
```ts
export async function notifyLarryCriticalError(params: {
  subject: string
  details: Record<string, unknown>
}): Promise<void> {
  if (!resend) return
  if (!config.LARRY_ALERT_EMAIL) {
    console.error('LARRY_ALERT_EMAIL not configured, skipping critical error notification')
    return
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: config.LARRY_ALERT_EMAIL,
      subject: `[DogsInFashion ALERT] ${params.subject}`,
      html: `
        <div style="font-family:monospace">
          <h2 style="color:#B84A4A">${params.subject}</h2>
          <p>This is an automated critical error notification from the Dogs in Fashion backend.</p>
          <pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto">${JSON.stringify(params.details, null, 2)}</pre>
          <p>Please investigate and take manual action if necessary.</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Failed to send critical error notification:', err)
  }
}
```

**`sendCancellationNotification`**: Phase 6.5 已经建好这个函数。在 Phase 7 里**扩展它**，在邮件 HTML 里加一段定金提醒：
```ts
// 在 sendCancellationNotification 函数里，existing html 之前加
const depositNotice = (booking as any).deposit_status === 'paid' ? `
  <div style="background:#FFF4E5;border-left:4px solid #E8975E;padding:12px 16px;margin:16px 0">
    <strong>About your $20 deposit:</strong> Per our cancellation policy, the deposit is non-refundable.
    If you have questions, please contact Doris directly.
  </div>
` : ''
```
然后把 `${depositNotice}` 插入到邮件 html 的合适位置。

### 3.5 幂等性设计（简化版）

只有两层保护：
1. **客户端生成 `idempotency_key`**（每次 Confirm 按钮点击时 `crypto.randomUUID()`）— 防 React 双击和网络重试
2. **Square 服务端强制** — 24 小时内相同 key 返回原支付结果，不会重复收钱

**没有第三层 DB 守卫**，因为原子流程下不存在"已经 paid 的 booking 被重新 POST 一次"的情况（每次 POST 都创建新 booking）。

### 3.6 为什么没有 webhook
`autocomplete: true` 让 Square Payments API 同步返回 `COMPLETED` 状态，不存在"支付完成之后才知道"的异步状态。Webhook 唯一能多告诉我们的是"Doris 在 Square dashboard 手动退款了"，但本阶段退款流程是纯手工的，所以没收益。未来 v2 如果需要自动追踪退款再加。

---

## 4. Frontend 改动

### 4.1 Square Web SDK 加载方式
Square 不发 npm 包，只通过 CDN 分发：
- Sandbox: `https://sandbox.web.squarecdn.com/v1/square.js`
- Production: `https://web.squarecdn.com/v1/square.js`

**在 `SquarePaymentForm` 组件内部动态加载**，不放 `index.html`。理由：
- 首页、登录页不需要加载 Square，减少无谓带宽
- 运行时根据 `VITE_SQUARE_ENVIRONMENT` 选 sandbox 或 prod
- React 18 Strict Mode 下 `useEffect` 跑两次，加载逻辑必须幂等（先 `if ((window as any).Square) return`）

**不用 `react-square-web-payments-sdk`**：社区 wrapper 维护停滞，自己写 ~80 行 TypeScript 更稳。

### 4.2 新文件 `frontend/src/components/SquarePaymentForm.tsx`

```tsx
import { useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react'

type Props = {
  amountCents: number
}

export type SquarePaymentFormRef = {
  tokenize: () => Promise<string | null>  // 返回 token 或 null (出错时)
}

const SquarePaymentForm = forwardRef<SquarePaymentFormRef, Props>((_props, ref) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<any>(null)

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        // 1. Load Square SDK (once)
        if (!(window as any).Square) {
          const scriptUrl = import.meta.env.VITE_SQUARE_ENVIRONMENT === 'production'
            ? 'https://web.squarecdn.com/v1/square.js'
            : 'https://sandbox.web.squarecdn.com/v1/square.js'

          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = scriptUrl
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('Failed to load Square SDK'))
            document.head.appendChild(script)
          })
        }

        if (!mounted) return

        // 2. Initialize payments
        const Square = (window as any).Square
        const payments = Square.payments(
          import.meta.env.VITE_SQUARE_APPLICATION_ID,
          import.meta.env.VITE_SQUARE_LOCATION_ID,
        )

        // 3. Initialize card (style matches site palette)
        const card = await payments.card({
          style: {
            input: {
              color: '#2A2420',
              fontSize: '16px',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            },
            '.input-container': {
              borderRadius: '12px',
              borderColor: '#BEE3F8',
            },
            '.input-container.is-focus': {
              borderColor: '#5BA4D9',
            },
            '.message-text': {
              color: '#B84A4A',
            },
          },
        })

        if (!mounted) return

        await card.attach('#square-card-container')
        cardRef.current = card
        setLoading(false)
      } catch (err: any) {
        console.error('Square SDK init failed:', err)
        setError(err.message || 'Failed to load payment form')
        setLoading(false)
      }
    }

    init()

    return () => {
      mounted = false
      // Square card cleanup
      if (cardRef.current?.destroy) {
        cardRef.current.destroy().catch(() => {})
      }
    }
  }, [])

  useImperativeHandle(ref, () => ({
    tokenize: async () => {
      if (!cardRef.current) return null
      try {
        const result = await cardRef.current.tokenize()
        if (result.status === 'OK') {
          setError(null)
          return result.token
        } else {
          const errMsg = result.errors?.[0]?.message || 'Card tokenization failed'
          setError(errMsg)
          return null
        }
      } catch (err: any) {
        setError(err.message || 'Tokenization error')
        return null
      }
    },
  }))

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-warm-gray">Loading payment form...</p>}
      <div
        id="square-card-container"
        className="rounded-xl border-2 border-sky bg-cream p-3"
      />
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  )
})

export default SquarePaymentForm
```

**关键注意点**:
- Square 的卡号输入框是 iframe，**不能**用 Tailwind 直接改样式，必须通过 `payments.card({ style })` 传配置
- 父容器的 border / padding 照常 Tailwind 控制
- `forwardRef` + `useImperativeHandle` 让父组件能触发 tokenize
- Strict Mode 双 mount 由 `if (!(window as any).Square)` 防护

### 4.3 `frontend/src/pages/BookingPage.tsx` 改动

**步骤数不变，仍然是 4 步**。定金表单嵌在**现有的 Confirm 步骤**里：

```tsx
import SquarePaymentForm, { SquarePaymentFormRef } from '../components/SquarePaymentForm'

const DEPOSIT_REQUIRED = import.meta.env.VITE_DEPOSIT_REQUIRED === 'true'
const DEPOSIT_CENTS = Number(import.meta.env.VITE_DEPOSIT_AMOUNT_CENTS || 2000)
const DEPOSIT_DOLLARS = (DEPOSIT_CENTS / 100).toFixed(0)

export default function BookingPage() {
  // ... existing state ...
  const squareFormRef = useRef<SquarePaymentFormRef>(null)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      if (DEPOSIT_REQUIRED) {
        // 1. Tokenize card
        const token = await squareFormRef.current?.tokenize()
        if (!token) {
          // Error already shown inside SquarePaymentForm
          setSubmitting(false)
          return
        }

        // 2. Atomic POST
        await apiFetch('/api/bookings/with-deposit', {
          method: 'POST',
          body: JSON.stringify({
            service_id: serviceId,
            date,
            start_time: time,
            dog_name: dogName,
            dog_breed: dogBreed || undefined,
            address,
            notes: notes || undefined,
            source_id: token,
            idempotency_key: crypto.randomUUID(),
          }),
        })
      } else {
        // 旧流程
        await apiFetch('/api/bookings', {
          method: 'POST',
          body: JSON.stringify({
            service_id: serviceId,
            date,
            start_time: time,
            dog_name: dogName,
            dog_breed: dogBreed || undefined,
            address,
            notes: notes || undefined,
          }),
        })
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking')
    }
    setSubmitting(false)
  }

  // ... rest unchanged ...

  // Step 3 (Confirm) 的 UI 更新：
  {step === 3 && selectedService && (
    <div>
      <h2 className="mb-6 font-display text-2xl font-bold text-warm-dark">
        Confirm Your Booking
      </h2>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 订单摘要（保持不变）*/}
      <div className="space-y-3 rounded-2xl bg-sky/20 p-6">
        {/* ... existing rows ... */}
      </div>

      {/* 新增：定金表单 */}
      {DEPOSIT_REQUIRED && (
        <div className="mt-6 rounded-2xl border-2 border-sky bg-white p-6">
          <h3 className="mb-2 font-display text-lg font-bold text-warm-dark">
            Pay ${DEPOSIT_DOLLARS} Deposit
          </h3>
          <p className="mb-3 text-sm text-warm-gray">
            A ${DEPOSIT_DOLLARS} deposit is required to secure your slot.
            Balance (${selectedService.price - Number(DEPOSIT_DOLLARS)}) due on grooming day.
          </p>
          <div className="mb-4 rounded-lg bg-butter/30 p-3 text-xs text-warm-dark">
            <strong>⚠️ Non-refundable:</strong> This deposit acts as our cancellation fee.
          </div>
          <SquarePaymentForm ref={squareFormRef} amountCents={DEPOSIT_CENTS} />
        </div>
      )}
    </div>
  )}

  // Confirm 按钮文案更新：
  <button
    type="button"
    onClick={handleSubmit}
    disabled={submitting}
    className="..."
  >
    <Calendar className="h-4 w-4" />
    {submitting
      ? (DEPOSIT_REQUIRED ? 'Processing payment...' : 'Booking...')
      : (DEPOSIT_REQUIRED ? `Pay $${DEPOSIT_DOLLARS} & Confirm Booking` : 'Confirm Booking')
    }
  </button>
```

**没有 retry 按钮、没有 Skip 按钮、没有第 5 步、没有 `createdBooking` 中间状态。** 每次 Confirm 失败 → 用户重填卡号 → 再点 Confirm → 新的 idempotency key 自动生成。

### 4.4 `MyBookingsPage.tsx` 和 `AdminDashboard.tsx` 更新

扩展前端 `Booking` interface（两个文件各自都有定义）：
```ts
interface Booking {
  // ... existing fields ...
  deposit_status?: 'none' | 'paid' | 'refunded'
  deposit_paid_at?: string | null
}
```

在 `BookingCard` 里加一个徽章（只在 `VITE_DEPOSIT_REQUIRED=true` 时渲染）：
```tsx
const DEPOSIT_REQUIRED = import.meta.env.VITE_DEPOSIT_REQUIRED === 'true'

// 在 badge 区域
{DEPOSIT_REQUIRED && booking.deposit_status === 'paid' && (
  <span className="rounded-full bg-sage-light px-2 py-0.5 text-xs font-semibold text-sage">
    Deposit paid
  </span>
)}
{DEPOSIT_REQUIRED && booking.deposit_status === 'refunded' && (
  <span className="rounded-full bg-warm-gray/20 px-2 py-0.5 text-xs font-semibold text-warm-gray">
    Deposit refunded
  </span>
)}
```

**`none` 状态不渲染任何徽章**——既避免 flag=off 时出现相关文字，也避免 flag=on 时个别异常 booking 显得奇怪。

**AdminDashboard Cancel 按钮**：Phase 6.5 已经加好了 confirm dialog 的 `hasDeposit` 检查逻辑，现在它会自动生效——不需要额外改动 Cancel 按钮代码。

---

## 5. 文件改动清单

### 新建文件
- `/Users/dev/dogsinfashion/2026-04-XX-payments.sql` — DDL（§2，XX 替换为实际实施日期）
- `/Users/dev/dogsinfashion/backend/src/services/square.ts` — Square SDK wrapper
- `/Users/dev/dogsinfashion/frontend/src/components/SquarePaymentForm.tsx` — 嵌入式卡号表单

### 修改文件
- `/Users/dev/dogsinfashion/backend/src/config.ts` — 7 个新 env var
- `/Users/dev/dogsinfashion/backend/src/routes/bookings.ts` — `POST /` 加守卫 + 新 `POST /with-deposit`
- `/Users/dev/dogsinfashion/backend/src/services/email.ts` — 新增 `notifyDorisDepositPaid` + `notifyLarryCriticalError` + `sendCancellationNotification` 里加定金提醒
- `/Users/dev/dogsinfashion/backend/package.json` — 新依赖 `square`
- `/Users/dev/dogsinfashion/frontend/src/pages/BookingPage.tsx` — Confirm 步骤嵌入定金表单 + `handleSubmit` 分支
- `/Users/dev/dogsinfashion/frontend/src/pages/MyBookingsPage.tsx` — `Booking` 接口 + 徽章
- `/Users/dev/dogsinfashion/frontend/src/pages/AdminDashboard.tsx` — `Booking` 接口 + 徽章
- `/Users/dev/dogsinfashion/.env.example` — 清理 Stripe 占位，换成 Square
- `/Users/dev/dogsinfashion/DEPLOYMENT-GUIDE.md` — 加 Square 设置章节

### 不要动的文件
- `backend/src/services/google-calendar.ts`（Phase 6.5 已改）
- `backend/src/jobs/reminder-scheduler.ts`

---

## 6. Out of Scope（明确不做）

- **自动退款**: 定金不退就是政策。Doris 特殊情况想退自己去 Square dashboard 手动退
- **余款在线收取**: 现金或 Doris 手动标记。Admin 面板 v1 不加"标记余款已付"按钮
- **税务计算**: 不用 Square Order API，定金就是一笔 flat fee
- **Apple Pay / Google Pay**: Square SDK 支持但需要域名验证，v1 只做卡
- **保存卡信息**: 每次重新输入，不创建 Customer/Card
- **Webhook**: `autocomplete:true` 同步返回，不需要
- **订阅 / 定期扣款**: 剪毛业务不适用
- **小费**: 不做
- **3DS 强验证**: Square 内置支持，不额外处理
- **多币种**: USD only

---

## 7. Deployment / Rollout Plan

### 7.1 Square Dashboard 设置（Larry 做）
1. 到 squareup.com/developers 创建开发者账号（免费）
2. 创建一个 Application 叫 "Dogs in Fashion"
3. 获取 **Sandbox** 凭证（Application ID、Access Token、Location ID）→ 用于 dev
4. Doris 把 **Production** 凭证发给 Larry（或者 Larry 以 admin 身份帮她拿）
5. **不需要配置 webhook URL**

### 7.2 环境变量矩阵

| 变量 | Dev (本地) | Prod (Railway / Vercel) |
|---|---|---|
| `DEPOSIT_REQUIRED` | `true`（开发测试用） | **`false`**（推广期关闭） |
| `DEPOSIT_AMOUNT_CENTS` | `2000` | `2000` |
| `SQUARE_ACCESS_TOKEN` | Larry sandbox | Doris production |
| `SQUARE_APPLICATION_ID` | Larry sandbox | Doris production |
| `SQUARE_LOCATION_ID` | Larry sandbox | Doris production |
| `SQUARE_ENVIRONMENT` | `sandbox` | `production` |
| `LARRY_ALERT_EMAIL` | Larry 的私人邮箱 | Larry 的私人邮箱 |
| `VITE_DEPOSIT_REQUIRED` | `true` | **`false`** |
| `VITE_DEPOSIT_AMOUNT_CENTS` | `2000` | `2000` |
| `VITE_SQUARE_APPLICATION_ID` | Larry sandbox | Doris production |
| `VITE_SQUARE_LOCATION_ID` | Larry sandbox | Doris production |
| `VITE_SQUARE_ENVIRONMENT` | `sandbox` | `production` |

**⚠️ 环境混用防呆**: Sandbox token + production application ID 会报 "token environment mismatch"。这 12 个变量要作为一个组统一配置，不要拆开。

### 7.3 数据库迁移
1. Supabase **dev** 项目 → SQL Editor → 粘贴 `2026-04-XX-payments.sql` → 运行 → 验证表和列
2. 本地跑完整流程测试
3. 满意后 Supabase **prod** 项目同样跑一次 migration
4. 因为生产 `DEPOSIT_REQUIRED=false`，`payments` 表建了但永远不会写入（直到 flip flag 的那天），风险为零

### 7.4 分阶段 rollout（遵循 feedback workflow 的规则）

严格按这个顺序，每一步完成之后**停下来等 Larry 确认再进下一步**：

1. **DB migration dev** → 验证 `payments` 表 + `bookings.deposit_status` 列都在
2. **Backend 改动**（config + square.ts + bookings.ts 加守卫 + 新 endpoint + email.ts）→ 先不配 Square env vars，启动服务 → `POST /api/bookings/with-deposit` 返回 503
3. **配 dev 的 Square sandbox env vars + `DEPOSIT_REQUIRED=true`** → 用 Postman 用 sandbox 卡测试
4. **Frontend 改动**（SquarePaymentForm + BookingPage + 徽章）→ 开发环境完整走一次：预约 → sandbox 测试卡 → 成功
5. **跑完整测试清单**（§8）
6. **⛔ 停下来让 Larry 确认所有 case 都过**
7. **Prod migration** → Supabase prod 跑 SQL
8. **Prod env vars**: Railway / Vercel 全部配好 Square 凭证，**但 `DEPOSIT_REQUIRED=false`**
9. **部署** backend + frontend
10. **Prod 冒烟测试**: 预约一单 → 确认**没有**出现定金 UI → 走原来的流程 → MyBookings / Admin 没有定金徽章
11. **功能休眠结束**

### 7.5 两个月后开启定金（Operational Runbook）
1. Doris 确认准备好 → 告诉 Larry
2. Larry 在 Railway 改 `DEPOSIT_REQUIRED=true` → redeploy
3. Larry 在 Vercel 改 `VITE_DEPOSIT_REQUIRED=true` → redeploy
4. Larry 自己用真卡预约一单 $1 测试（临时 `DEPOSIT_AMOUNT_CENTS=100`）→ 确认 Square dashboard 收到 → Doris 收到定金到账邮件 → 从 Square dashboard 退款 → 恢复 `DEPOSIT_AMOUNT_CENTS=2000`
5. 完成

**回滚**: 两个 flag 改回 `false` + redeploy。分钟级。

---

## 8. Verification / Test Checklist

以下测试**全部在 dev 环境 `DEPOSIT_REQUIRED=true` + Square sandbox 下执行**：

### Square sandbox 测试卡
- `4111 1111 1111 1111` / CVV `111` / 任意未来日期 / ZIP `94103` → 成功
- `4000 0000 0000 0002` → 卡被拒
- `4000 0000 0000 0127` → CVV 失败
- `4000 0000 0000 0069` → 过期卡

### 功能测试
- [ ] **Happy path**: 预约 → Confirm 步骤看到 Square 卡号表单 → 输入成功卡 → 点 "Pay $20 & Confirm" → 成功页 → `bookings` 表有 `deposit_status='paid'` 和 `deposit_paid_at` → `payments` 表有对应行 → Square sandbox dashboard 看到交易 → Doris 收到定金到账邮件 → Doris 收到新预约邮件 → 客户收到预约确认邮件
- [ ] **Receipt URL**: 成功响应里有 `deposit_receipt_url`，前端可以显示（可选）
- [ ] **Decline path**: 输入 decline 卡 → 前端 SquarePaymentForm 显示错误 → booking **根本没创建** → `bookings` 表无新行 → `payments` 表无新行 → Square dashboard 无交易（或者有 FAILED 状态的尝试）
- [ ] **Retry after decline**: decline 后重填成功卡 → 再点 Confirm → 新 idempotency key → 成功（不会和之前的失败冲突）
- [ ] **CVV failure**: CVV 错误卡 → 前端显示错误 → booking 未创建
- [ ] **双击防抖**: 快速点击 Pay 两次 → Square 只收到 1 笔（同一个 idempotency key 被复用？——实际上这是 tokenize 瞬间双击，两次 tokenize 会生成不同 token，第二次的 Submit 按钮已 disabled）

### 权限 / 守卫测试
- [ ] **`/api/bookings` 被禁用**: `DEPOSIT_REQUIRED=true` 时 curl `POST /api/bookings` 返回 **503**
- [ ] **`/api/bookings/with-deposit` 被禁用**: `DEPOSIT_REQUIRED=false` 时 curl `POST /api/bookings/with-deposit` 返回 **503**
- [ ] **Square 未配置**: `DEPOSIT_REQUIRED=true` 但缺 `SQUARE_ACCESS_TOKEN` → `POST /with-deposit` 返回 **503**
- [ ] **未登录**: 无 Bearer token → 返回 401
- [ ] **无效 source_id**: 乱传一个假 token → 返回 402 `Payment failed`
- [ ] **无效 idempotency_key (非 UUID)**: 返回 400

### 边界测试
- [ ] **Slot 被抢（pre-check 失败）**: 两个 tab 同时选同一时间段，第二个 tab pre-check 就返回 409，**不扣钱**
- [ ] **Slot 被抢（race in window）**: 难以稳定复现，可以手动模拟：在 Square charge 之后、insert 之前人工 INSERT 一个占用该时间段的 booking（sleep 进行时）→ 触发 refund 分支 → 验证 Square dashboard 里这笔 charge 被 refund → 响应是 409 带退款提示
- [ ] **注入 refund 失败**: 临时把 `refundSquarePayment` mock 成 throw → 触发 critical email → Larry 收到告警邮件

### 冒烟测试 (prod 下 `DEPOSIT_REQUIRED=false`)
- [ ] 打开 booking 页面 → 4 步走完 → **没有定金 UI** → Confirm 按钮显示 "Confirm Booking" → 成功页正常
- [ ] MyBookingsPage 里 booking **不显示任何定金相关 UI**
- [ ] AdminDashboard 里 booking 不显示定金相关 UI
- [ ] 直接 curl `POST /api/bookings/with-deposit` → 返回 503
- [ ] 预约流程的 email/SMS/calendar 都和 flag=false 之前一样正常
- [ ] **Cancel 流程**（Phase 6.5 已验证过）仍然正常：admin cancel → 客户收邮件 → calendar 同步删除

### 回归测试
- [ ] **Phase 6.5 的 cancel 流程**在 flag=true 下仍然工作：admin cancel 一个 deposit-paid booking → 客户收到取消邮件（含定金不退款提醒）→ 定金**不自动退款**（Doris 要手动去 Square dashboard 处理）
- [ ] **Reschedule** 仍然正常工作：deposit-paid 的 booking 可以被 reschedule，定金不受影响

---

## 9. 已知风险与陷阱

1. **`z.coerce.boolean()` 陷阱** — `Boolean("false") === true`。必须用 `z.enum(['true','false']).transform(v => v === 'true')`。前端同理，Vite env 永远是字符串，必须 `=== 'true'` 显式比较
2. **BigInt 陷阱** — Square SDK 的 `amountMoney.amount` 必须是 BigInt，传 Number 运行时报错。`square.ts` 里注释清楚
3. **React 18 Strict Mode 双执行** — Web SDK 加载必须先 check `window.Square`，否则报 "already initialized"
4. **环境混用** — sandbox `VITE_*` + production `SQUARE_ACCESS_TOKEN` 会报 "token environment mismatch"。12 个变量作为一个 group 统一配置
5. **Square npm 包版本** — 当前 pin 到 `^44.0.0`（实施时 latest 是 `44.0.1`）。升级到 v45+ 时不保证兼容，必须对照 `.d.ts` 重新校对 API 形状并跑 `npx tsc --noEmit`
6. **Square 字段长度陷阱** — `.d.ts` 里不写字段 max length，但 Square REST API 强制检查: `reference_id` ≤ 40 / `note` ≤ 500 / `statement_description_identifier` ≤ 20 / `idempotency_key` ≤ 45。TypeScript 抓不到，只能靠运行时 400。正解: `reference_id` 直接用 booking id（UUID 36 字符，刚好塞得下，同时建立 Square ↔ DB 的 1:1 对账关系）；凡是用户输入（dog_name 等）拼进 `note` 都要 `.slice(0, 500)`。错误姿势: 用 `${userId}-${Date.now()}` = 50 字符会炸（实施时踩过的坑）
7. **Race window** — 一年估计 0-2 次。refund 兜底处理，极端情况下 refund 也失败 → 告警 Larry 人工处理
8. **`profiles` 表假设（已避免）** — v1 plan 曾有"admin 查看 payments"的 RLS policy 依赖 `profiles` 表。新 plan 避开了这个依赖（admin 视图走后端 API，用 service role key）
9. **定金政策**: 不退款是明确政策。客户必须在支付前就明确看到这个信息，避免纠纷

### PCI 合规
使用 Web Payments SDK 的 iframe 字段 + 只传 token，卡号从不进入我们的服务器或前端 React state，保持最低等级 **SAQ-A 合规**。**绝对不要**把卡号存到 React state 或者手动读取 iframe 内容。

---

## 10. Critical Files（实施时必读）

### 只读参考
- `backend/src/routes/bookings.ts` — 现有 `POST /` 的模式（Zod、supabaseAdmin、fire-and-forget email、错误处理形状）
- `backend/src/config.ts` — 已有 optional + graceful degradation 的 Zod pattern，Square vars 严格照抄
- `backend/src/services/email.ts` — 模块级单例 + null check pattern（`const resend = config.RESEND_API_KEY ? new Resend(...) : null`）
- `frontend/src/lib/api.ts` — 现有 `apiFetch` wrapper，前端新请求直接用它

### 需要修改
见 §5 文件改动清单
