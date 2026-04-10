# Phase 6.5 — Cancel UX Hardening

> **前置于 Phase 7 (Payment)**。必须完成并在 prod 稳定跑过之后才开始定金功能。

## Context

Phase 7 的定金政策是"不退款"，这意味着 cancel 必须是一个**让 Doris 和客户都明确知道发生了什么**的事件。否则会出现这种尴尬：Doris 在 Admin 面板点了 Cancel → 客户什么都不知道 → 第二天客户等着剪狗 → 打电话质问 → Doris 才想起来 → 退款还是不退款？

所以在做定金之前，必须先把 cancel 流程升级成一等公民。

---

## 当前 Cancel 流程的代码审计

### 权限
- **后端** (`backend/src/routes/bookings.ts:186`): 允许 **owner 或 admin** 取消
- **前端** (`MyBookingsPage.tsx:46-58`): 客户 cancel UI 被注释掉了（"we prefer customers not to self-cancel"）
- **矛盾**: 后端 owner 权限实际上是死权限——任何客户用 curl 直接打 endpoint 都能取消自己的 booking。不符合产品意图。

### Calendar 同步
- `bookings.ts:204-206` 调用 `deleteCalendarEvent`，**fire-and-forget**
- `google-calendar.ts:78-90` 的 `deleteCalendarEvent` 函数内部 catch 所有 error 只打日志，永不抛出
- 失败场景下：DB 已经 cancelled，但 Doris 的日历还挂着事件，客户的日历也没更新

### 邮件通知
- **完全没有取消邮件**——grep 整个 `email.ts` 没有任何 cancellation 相关函数
- 客户唯一能知道的方式是主动打开 MyBookingsPage 看状态
- Doris 是点击方所以她知道，但没有存档邮件记录

### Admin UI
- `AdminDashboard.tsx:257-263` 的 Cancel 按钮**点一下就发请求**，没有任何二次确认
- Doris 手滑误点 = 真 cancel，无法回退

---

## 设计决策

### 决策 1: 只有 admin 才能 cancel（锁紧后端权限）
移除 owner 逃逸路径。未来如果要支持客户自助取消，另走独立的 endpoint + 业务规则（比如"48 小时内不可取消"），不要和 admin cancel 混在一起。

### 决策 2: Cancel 后给客户发邮件（含 CANCEL ics 附件）
让客户的日历（Gmail / Apple / Outlook）自动把事件标记为 cancelled，不需要客户手动操作。关键 ics 字段：
- `METHOD:CANCEL`（不是 REQUEST）
- `STATUS:CANCELLED`
- `SEQUENCE:999`（比之前发的 invite 的 sequence 高，强制覆盖）

### 决策 3: Cancel 后给 Doris 发存档邮件
审计记录用。未来客户纠纷时邮箱搜索比数据库查询好用。

### 决策 4: `deleteCalendarEvent` 从 fire-and-forget 改成 await + 失败不回滚
- 调用方 `await` 执行，函数内部失败时抛出让 caller 感知
- 404 (event not found) 视为成功（幂等处理）
- 其他错误打 error 日志，但**不回滚 DB 的 cancelled 状态**——已经 cancel 就是 cancel，日历不一致是次要问题

### 决策 5: AdminDashboard Cancel 按钮加 confirm dialog
Phase 6.5 阶段的文案只有基础提示；Phase 7 完成后会在 dialog 里多加"定金不退款"提醒（代码里预留 defensive check）。

### 决策 6: 清理 `MyBookingsPage` 的注释掉的 cancel 死代码
不留"以后可能会用"的代码。有需要再写新的。

---

## 1. Backend 改动

### 1.1 `backend/src/routes/bookings.ts` — Cancel endpoint 重写

修改 `PATCH /:id/status` 的 cancel 分支：

**权限收紧**（替换第 186-189 行）：
```ts
// 旧
if (parsed.data.status === 'cancelled' && booking.user_id !== req.user!.id && req.user!.role !== 'admin') {
  res.status(403).json({ error: 'Access denied' })
  return
}

// 新
if (parsed.data.status === 'cancelled' && req.user!.role !== 'admin') {
  res.status(403).json({ error: 'Only admin can cancel bookings' })
  return
}
```

**Cancel 后的副作用流程**（替换第 203-211 行的简陋处理）：
```ts
// 1. DB 更新已经在上面完成了（就是现有的 const { data: updated } = ...）

// 只有在 status 从 confirmed → cancelled 时才执行下面的副作用
if (parsed.data.status === 'cancelled') {
  // 2. 获取客户 email（admin 可能 != booking owner）
  let clientEmail = req.user!.email
  if (booking.user_id !== req.user!.id) {
    try {
      const { data: { user: clientUser } } = await supabaseAdmin.auth.admin.getUserById(booking.user_id)
      if (clientUser?.email) clientEmail = clientUser.email
    } catch (err) {
      console.error('[cancel] failed to fetch client email:', err)
    }
  }

  // 3. AWAIT Google Calendar 删除
  if (booking.google_event_id) {
    try {
      await deleteCalendarEvent(booking.google_event_id)
    } catch (err) {
      console.error('[cancel] calendar delete failed', {
        bookingId: booking.id,
        eventId: booking.google_event_id,
        err,
      })
      // 不回滚 DB；日历不一致是次要问题
    }
  }

  // 4. AWAIT 取消 reminders
  try {
    await cancelReminders(booking.id)
  } catch (err) {
    console.error('[cancel] cancel reminders failed', { bookingId: booking.id, err })
  }

  // 5. Fire-and-forget 邮件通知
  sendCancellationNotification(updated, clientEmail)
    .catch(err => console.error('[cancel] customer email failed:', err))
  notifyDorisCancellation(updated, clientEmail)
    .catch(err => console.error('[cancel] Doris email failed:', err))
}

res.json(updated)
```

记得在文件顶部 import 新函数：
```ts
import {
  sendBookingConfirmation,
  notifyDorisNewBooking,
  sendRescheduleNotification,
  notifyDorisReschedule,
  sendCancellationNotification,     // 新
  notifyDorisCancellation,           // 新
} from '../services/email.js'
```

### 1.2 `backend/src/services/email.ts` — 新增两个函数 + `generateIcs` 支持 CANCEL

**改造 `generateIcs`**（当前第 32-65 行）支持 CANCEL method：

```ts
function generateIcs(
  booking: Booking,
  clientEmail: string,
  options: { method?: 'REQUEST' | 'CANCEL'; sequence?: number } = {},
): string {
  const method = options.method ?? 'REQUEST'
  const sequence = options.sequence ?? 0
  const status = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'

  const serviceName = SERVICE_NAMES[booking.service_id] ?? booking.service_id
  const dtStart = `${booking.date.replace(/-/g, '')}T${booking.start_time.replace(/:/g, '')}00`
  const dtEnd = `${booking.date.replace(/-/g, '')}T${booking.end_time.replace(/:/g, '')}00`
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dogs in Fashion//Booking//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `DTSTART;TZID=America/Los_Angeles:${dtStart}`,
    `DTEND;TZID=America/Los_Angeles:${dtEnd}`,
    `DTSTAMP:${now}`,
    `UID:${booking.id}@dogsinfashion.com`,
    `SEQUENCE:${sequence}`,
    `SUMMARY:Dogs in Fashion: ${serviceName} — ${booking.dog_name}`,
    `DESCRIPTION:Service: ${serviceName}\\nDog: ${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}\\nAddress: ${booking.address}`,
    `LOCATION:${booking.address}`,
    `ORGANIZER;CN=Dogs in Fashion:mailto:${config.DORIS_EMAIL}`,
    `ATTENDEE;CN=Client;RSVP=TRUE:mailto:${clientEmail}`,
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
```

同步更新现有三个调用点（`sendBookingConfirmation`、`sendRescheduleNotification`）以使用新签名。原行为不变，只是参数变成 options 对象。

**新增 `sendCancellationNotification`**（放在 `notifyDorisReschedule` 之后）：
```ts
export async function sendCancellationNotification(
  booking: Booking,
  clientEmail: string,
): Promise<void> {
  if (!resend) return

  const serviceName = serviceDisplayName(booking.service_id)

  try {
    // sequence 设为 999 确保覆盖之前发过的任何 invite/update
    const icsContent = generateIcs(booking, clientEmail, { method: 'CANCEL', sequence: 999 })

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: clientEmail,
      replyTo: config.DORIS_EMAIL,
      subject: `Booking Cancelled — ${booking.dog_name} on ${formatBookingDate(booking)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#B84A4A">Your Booking Has Been Cancelled</h2>
          <p>Hi there! Unfortunately, your grooming appointment has been cancelled:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#7A7570">Service</td><td style="padding:8px;font-weight:bold">${serviceName}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Dog</td><td style="padding:8px;font-weight:bold">${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Date</td><td style="padding:8px;font-weight:bold">${formatBookingDate(booking)}</td></tr>
            <tr><td style="padding:8px;color:#7A7570">Time</td><td style="padding:8px;font-weight:bold">${formatTime(booking.start_time)} — ${formatTime(booking.end_time)}</td></tr>
          </table>
          <p>If you'd like to reschedule or have any questions, please contact Doris directly or <a href="https://www.dogsinfashion.com/book">book a new appointment</a>.</p>
          <p style="color:#7A7570;font-size:14px">Doris — (916) 287-1878 — dogsinfashionca@gmail.com</p>
        </div>
      `,
      attachments: [icsAttachment(icsContent)],
    })
    if (error) throw error
  } catch (err) {
    console.error('Failed to send cancellation notification:', err)
  }
}
```

**新增 `notifyDorisCancellation`**：
```ts
export async function notifyDorisCancellation(
  booking: Booking,
  clientEmail: string,
): Promise<void> {
  if (!resend) return

  const serviceName = serviceDisplayName(booking.service_id)

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: config.DORIS_EMAIL,
      replyTo: clientEmail,
      subject: `Booking Cancelled: ${booking.dog_name} — ${formatBookingDate(booking)}`,
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2 style="color:#B84A4A">Booking Cancelled (Archive)</h2>
          <p>This booking has been cancelled:</p>
          <p><strong>Service:</strong> ${serviceName}</p>
          <p><strong>Dog:</strong> ${booking.dog_name}${booking.dog_breed ? ` (${booking.dog_breed})` : ''}</p>
          <p><strong>Date:</strong> ${formatBookingDate(booking)}</p>
          <p><strong>Time:</strong> ${formatTime(booking.start_time)} — ${formatTime(booking.end_time)}</p>
          <p><strong>Address:</strong> ${booking.address}</p>
          <p><strong>Client Email:</strong> ${clientEmail}</p>
          <p style="color:#7A7570;font-size:13px;margin-top:16px">Customer has been notified via email. Google Calendar event has been removed.</p>
        </div>
      `,
    })
    if (error) throw error
  } catch (err) {
    console.error('Failed to notify Doris about cancellation:', err)
  }
}
```

### 1.3 `backend/src/services/google-calendar.ts` — `deleteCalendarEvent` 改成会抛错

当前函数（第 78-90 行）吃掉所有错误。改成：
```ts
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!calendar || !eventId) return

  try {
    await calendar.events.delete({
      calendarId: config.DORIS_CALENDAR_ID,
      eventId,
      sendUpdates: 'all',
    })
  } catch (err: any) {
    // 404 = event already gone, treat as success (idempotent)
    if (err?.code === 404 || err?.response?.status === 404) {
      console.warn('[calendar] event already deleted or not found:', eventId)
      return
    }
    // 其他错误抛出让 caller 处理
    throw err
  }
}
```

**注意**: 这会影响 `bookings.ts` 里 reschedule 流程的 `updateCalendarEvent` fallback 逻辑吗？不会——那边调用的是 `updateCalendarEvent` 不是 `deleteCalendarEvent`，独立函数。

---

## 2. Frontend 改动

### 2.1 `frontend/src/pages/AdminDashboard.tsx` — Cancel 按钮加 confirm dialog

修改第 257-263 行：
```tsx
<button
  onClick={async () => {
    // Phase 7 定金上线后，deposit_status 字段会生效。
    // 当前 Phase 6.5 阶段还没这个字段，defensive check 不会触发。
    const hasDeposit = (b as unknown as { deposit_status?: string }).deposit_status === 'paid'
    const dateStr = new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    })
    const msg = hasDeposit
      ? `Cancel ${b.dog_name}'s booking on ${dateStr}?\n\n⚠️ This booking has a $20 non-refundable deposit. Cancelling will NOT automatically refund. To refund, do it manually in Square dashboard.\n\nThe customer will be notified by email.`
      : `Cancel ${b.dog_name}'s booking on ${dateStr}?\n\nThe customer will be notified by email.`
    if (!confirm(msg)) return
    await updateStatus(b.id, 'cancelled')
  }}
  disabled={updatingIds.has(b.id)}
  className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
>
  Cancel
</button>
```

### 2.2 `frontend/src/pages/MyBookingsPage.tsx` — 删除死代码

删除第 46-58 行的整个注释块（`// Cancel functionality disabled ...` 到 `// }`）。

---

## 3. 文件改动清单

### 修改文件（共 4 个，不新建任何文件）
- `backend/src/routes/bookings.ts` — Cancel 权限收紧 + await 副作用流程
- `backend/src/services/email.ts` — `generateIcs` 支持 CANCEL method + 新增 2 个函数
- `backend/src/services/google-calendar.ts` — `deleteCalendarEvent` 改成会抛错（404 除外）
- `frontend/src/pages/AdminDashboard.tsx` — Cancel 按钮 confirm dialog
- `frontend/src/pages/MyBookingsPage.tsx` — 删除死代码

---

## 4. 测试清单

### 功能测试（dev 环境）
- [ ] **Happy path**: 创建 booking → Admin cancel → 客户收到取消邮件（主题含 "Cancelled"）→ 邮件附件是 CANCEL ics
- [ ] **客户日历同步**: 打开邮件附件后，Gmail / Apple Calendar 里对应事件自动消失或标记为取消
- [ ] **Doris 存档邮件**: 同上操作后，`DORIS_EMAIL` 收到一封存档邮件
- [ ] **Doris 日历同步**: 在 calendar.google.com 手动确认原事件被删除
- [ ] **Reminder 取消**: Admin cancel 一个 24 小时内的 booking，原本会发的 reminder 不再发（可以通过 `reminders` 表或日志确认）
- [ ] **Confirm dialog**: AdminDashboard 点 Cancel → 弹出 dialog → 点"取消" → 无任何副作用 → 再点一次 → 点"确认" → 正常流程
- [ ] **Success toast**: Cancel 成功后 AdminDashboard 显示 "Booking cancelled successfully" toast（现有行为，回归测试）

### 权限测试
- [ ] **Owner 不能 cancel（backend）**: 用客户账号登录，curl 打 `PATCH /api/bookings/:id/status` 传 `{ "status": "cancelled" }` → 返回 **403 "Only admin can cancel bookings"**
- [ ] **Owner 不能 complete**: 同样的 curl 传 `{ "status": "completed" }` → 返回 **403**（现有行为，回归测试）
- [ ] **MyBookings 无 cancel 入口**: 客户登录 MyBookings 页面，界面上**完全看不到**取消按钮

### 边界测试
- [ ] **Calendar event 不存在**: 手动在 Supabase 里把某个 booking 的 `google_event_id` 改成假值 `fake-event-123` → Admin cancel → DB 成功 → 邮件成功 → 日志有 warn 但不 error
- [ ] **Already cancelled 再次 cancel**: 对 `status='cancelled'` 的 booking 再点 Cancel → 幂等处理，不崩、不重复发邮件（后端已经有状态检查，回归）
- [ ] **Calendar API 500**: 临时把 `GOOGLE_SERVICE_ACCOUNT_KEY` 设成无效 JSON → Admin cancel → DB 更新成功，邮件仍然发出，日志 error 但不崩

### 集成测试
- [ ] **Cancel → 时间段释放**: 取消后，同一个时间段可以被另一个 booking 占用
- [ ] **Cancel → MyBookings 显示**: 客户的 MyBookingsPage 上这个 booking 显示 "Cancelled" badge

---

## 5. Rollout（按顺序，每步后停下确认）

1. **Backend 改动**（1.1 + 1.2 + 1.3）→ 本地 `npm run dev`
2. **用 curl 测试 cancel**:
   - 创建一个 booking（用 admin 账号）
   - `curl -X PATCH http://localhost:3001/api/bookings/<id>/status -H "Authorization: Bearer <admin_token>" -H "Content-Type: application/json" -d '{"status":"cancelled"}'`
   - 确认 DB + calendar + 两封邮件
3. **验证 CANCEL ics 能被邮件客户端正确解析**: 用 Gmail web 打开邮件附件，确认 Gmail 提示"This event has been cancelled"
4. **Frontend 改动**（2.1 + 2.2）→ 本地浏览器测试 AdminDashboard confirm dialog
5. **跑完完整测试清单**（§4）
6. **⛔ 停下来让 Larry 人工确认所有测试都过**
7. **部署 prod**: Railway redeploy backend → Vercel redeploy frontend
8. **Prod 冒烟测试**: 用真账号创建测试 booking → admin cancel → 验证邮件到达 + Calendar 同步

---

## 6. 与 Phase 7 的衔接点

Phase 6.5 完成后，Phase 7 会在以下地方扩展：
- `AdminDashboard.tsx` 的 confirm dialog 文案：`hasDeposit` 检查会自动生效（Phase 7 加 `deposit_status` 字段时不需要改这里的代码）
- `sendCancellationNotification` 函数：Phase 7 会在邮件 HTML 里加一段"定金不退款"提醒（当 `booking.deposit_status === 'paid'` 时）
- `bookings.ts` cancel 流程：Phase 7 **不会**自动 refund Square charge，定金流失就是流失，这是设计意图

---

## 7. 不做的事（Out of Scope）

- 客户自助取消 UI
- 取消原因 dropdown（"客户要求" / "天气原因" / "Doris 生病"）
- 自动退款（定金政策就是不退）
- 批量取消
- 取消历史审计表（现在就靠 bookings.updated_at 和邮件）
- 取消后自动提议重新预约
