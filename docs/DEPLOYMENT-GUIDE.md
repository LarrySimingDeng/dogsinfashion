# Dogs in Fashion — 生产环境配置指南

> 本文档说明如何将开发环境（Larry 的测试账号）切换为生产环境（Doris 的正式账号）。
> 开发环境使用 `<your-dev-email>`，生产环境使用 `contact@dogsinfashion.com`。

---

## 架构说明：谁管什么

| 角色 | 管理内容 |
|------|----------|
| **Larry（开发者）** | Google Cloud 项目、Service Account、Resend 账号、Twilio 账号、Supabase、代码部署 |
| **Doris（业务方）** | 只需做一件事：共享她的 Google Calendar 给 Service Account |

> Google Cloud Console、Resend、Twilio Console、Supabase 等技术平台全部由 Larry 管理，Doris 不需要接触。
> 邮件发送通过 Resend 走自有域名 `dogsinfashion.com`，不再依赖 Doris 的 Gmail 账号。

---

## 当前环境对照

| 配置项 | 开发环境（Larry） | 生产环境（Doris） |
|--------|-------------------|-------------------|
| DORIS_EMAIL（接收通知） | <your-dev-email> | contact@dogsinfashion.com |
| RESEND_API_KEY | 同一个 Resend 账号的 key | 同一个（不需要改） |
| DORIS_CALENDAR_ID | <your-dev-email> | contact@dogsinfashion.com |
| GOOGLE_SERVICE_ACCOUNT_KEY | Larry 的 GCP 项目，同一个 Service Account | 同一个（不需要改） |
| DORIS_PHONE | <your-dev-phone> (Larry) | +19162871878 (Doris) |
| TWILIO_* | 暂未配置 | 需要完成 10DLC 注册 |

---

## 一、Email 配置（Resend）

### 架构概览

所有邮件都通过 **Resend** 发出，统一 From 地址 `Dogs in Fashion <noreply@dogsinfashion.com>`。两条独立的路径：

| 路径 | 谁发的 | 发送方式 | From 地址 | 管理位置 |
|------|--------|----------|-----------|----------|
| **后端交易邮件**（booking 确认/改期/提醒、Doris 通知） | 后端代码 `backend/src/services/email.ts` | Resend HTTP API | `noreply@dogsinfashion.com` | `backend/.env` 的 `RESEND_API_KEY` |
| **Supabase Auth 邮件**（注册确认 / Magic Link / 密码重置） | Supabase Auth 服务 | Resend SMTP | `noreply@dogsinfashion.com` | Supabase Dashboard → Authentication → Emails → SMTP Settings |

两条路径共享同一个 Resend 账号、同一个已验证的域名、同一套 DNS 记录。**Doris 完全不需要生成 Gmail App Password，也不用管任何邮件配置**。

### Resend 账号信息

- **账号持有人**：Larry
- **已验证的域名**：`dogsinfashion.com`（Region: us-east-1）
- **DNS 记录位置**：Squarespace DNS（`dogsinfashion.com` 的域名注册商）
- **一共 3 条 DNS 记录**：
  - DKIM TXT：`resend._domainkey` → `p=MIGfMA0G...`
  - SPF MX：`send` → `feedback-smtp.us-east-1.amazonses.com`（Priority 10）
  - SPF TXT：`send` → `v=spf1 include:amazonses.com ~all`
- **免费额度**：100 封/天，3000 封/月（对 Doris 业务量绰绰有余）

### 后端 `.env` 配置（booking 邮件）

```env
# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxx   # 从 Resend Dashboard → API Keys 生成
DORIS_EMAIL=contact@dogsinfashion.com  # 接收通知邮件的地址（开发环境填 Larry 的）
```

**From 地址是写死在代码里的**（`backend/src/services/email.ts` 顶部的 `FROM_ADDRESS` 常量），不需要在 .env 里配。

### Supabase Custom SMTP 配置（auth 邮件）

Supabase Dashboard → **Authentication** → **Emails** → **SMTP Settings**，勾选 **Enable Custom SMTP**，填：

| 字段 | 值 |
|------|-----|
| **Sender email** | `noreply@dogsinfashion.com` |
| **Sender name** | `Dogs in Fashion` |
| **Host** | `smtp.resend.com` |
| **Port** | `465` |
| **Username** | `resend` （字面量这 6 个字母，**不是邮箱**） |
| **Password** | 和后端 `RESEND_API_KEY` 同一个 key |

> ⚠️ 坑点：Username 就是 `resend` 这 6 个字母。很多人第一反应会填邮箱，那样会 535 认证失败。

### Supabase 邮件模板

Supabase Dashboard → **Authentication** → **Email Templates**，有 3 个模板要改（另外 2 个 Invite User / Change Email 默认不用动）：

| Supabase 模板 | 源文件 | 建议 Subject |
|--------------|--------|--------------|
| **Confirm signup** | `email-templates/confirm-signup.html` | `Confirm your email — Dogs in Fashion 🐾` |
| **Magic Link** | `email-templates/magic-link.html` | `Sign in to Dogs in Fashion 🐾` |
| **Reset Password** | `email-templates/reset-password.html` | `Reset your password — Dogs in Fashion 🐾` |

HTML 里的 `{{ .ConfirmationURL }}` 是 Supabase 的占位符，发邮件时会自动替换成真实链接，**不要改它**。

### 从零搭建 Resend（灾难恢复 / 账号迁移参考）

如果有一天要把 Resend 从 Larry 账号迁到 Doris 账号，或者推倒重来：

1. 在 https://resend.com 注册新账号
2. **Domains** → Add Domain `dogsinfashion.com`，Region 选 **us-east-1**
3. Resend 显示 3 条 DNS 记录，去 Squarespace DNS 后台（`account.squarespace.com` → Domains → DNS Settings → Custom Records）一条条加：
   - Host 字段填 Resend 的 Name（去掉 `.dogsinfashion.com` 后缀）
   - Data 字段粘贴完整值，不加引号
4. 等 5–30 分钟，Resend 那边所有记录变绿 ✅
5. **API Keys** → Create API Key：
   - Name: `dogsinfashion-backend-prod`
   - Permission: **Sending access**（不要 Full access）
   - Domain: 限定 `dogsinfashion.com`
6. 复制 key（**只显示一次**）→ 立刻贴到 `backend/.env` 和 Railway 环境变量的 `RESEND_API_KEY`
7. Supabase Dashboard 更新 SMTP Password 为新 key
8. 测试一次 booking 预约 + 一次 "忘记密码"，都能收到即成功

### 本地开发特殊注意事项

`backend/.npmrc` 显式指定了公共 npm 源：

```
registry=https://registry.npmjs.org/
```

**原因**：Larry 本机 `~/.npmrc` 配置了 Apple 内部 Artifactory（`https://npm.apple.com`），如果没有这个项目级 `.npmrc`，`npm install` 会把某些包（比如 `svix`，Resend 的依赖）从 Apple 内网拉取，导致 `package-lock.json` 被污染，Railway 部署时 `ENOTFOUND artifacts.apple.com` 失败。

**接手这个项目的人如果不是 Apple 员工**：`.npmrc` 这个文件可以不用管，它对公共源用户也是无害的。

### 验证方式

**后端 booking 邮件**：
1. 网站创建测试预约，填自己邮箱
2. 客户邮箱收到 `Booking Confirmed — ...`，From 是 `Dogs in Fashion <noreply@dogsinfashion.com>`，带 .ics 附件
3. `DORIS_EMAIL` 配置的邮箱收到 `New Booking: ...`
4. Resend Dashboard → **Logs** 能看到 Delivered 记录

**Supabase auth 邮件**：
1. 登录页点 "Forgot password" → 输入邮箱 → 提交
2. 收到 `Reset your password — Dogs in Fashion 🐾`，样式是蓝黄渐变 + 🐾 的自定义模板
3. 点按钮能跳转到网站开始重置

### 常见故障排查

| 症状 | 可能原因 | 怎么修 |
|------|----------|-------|
| 邮件进垃圾箱 | SPF/DKIM 没 verify，或 DNS 传播中 | 去 Resend Dashboard 确认 3 条记录都是绿色 |
| Supabase 报 `535 Authentication credentials invalid` | SMTP Username 填错了，应该是 `resend` 不是邮箱 | 改回 `resend` |
| 后端日志 `Failed to send confirmation email: ...` | `RESEND_API_KEY` 没配 或 被轮换作废 | 检查 Railway 环境变量 / Resend Dashboard |
| Railway 部署 `ENOTFOUND artifacts.apple.com` | 本地生成 lockfile 时被 Apple 内部源污染 | 确认 `backend/.npmrc` 存在，删 lockfile 重新 `npm install` |

---

## 二、Google Calendar 配置（预约同步到 Doris 的日历）

### 需要做的事

让系统能在 Doris 的 Google Calendar 上自动创建/删除/查询预约事件。

### 需要 Doris 操作（可以视频通话手把手教她）

1. 用 `contact@dogsinfashion.com` 登录 Google
2. 打开 https://calendar.google.com
3. 左侧 **Settings for my calendars** → 点自己的日历名字
4. 滚到 **Share with specific people or groups**
5. 点 **+ Add people and groups**
6. 输入以下邮箱（可以提前发给 Doris 让她复制粘贴）：
   ```
   dogsinfashion-calendar@dogsinfashion.iam.gserviceaccount.com
   ```
7. 权限选 **Make changes to events**（不是 See all event details！）
8. 点 **Send**

> 这一步只需要做一次。之后系统就能永久在 Doris 日历上创建/删除预约事件。

### 修改 backend/.env

```env
# 改成 Doris 的日历 ID（就是她的 Gmail 地址）
DORIS_CALENDAR_ID=contact@dogsinfashion.com
```

> 注意：`GOOGLE_SERVICE_ACCOUNT_KEY` 不需要改，开发和生产用同一个 Service Account。

### 验证方式

创建一个测试预约后，Doris 的 Google Calendar 应该出现对应的事件，包含：
- 正确的日期时间
- 客户信息和地址在事件描述中

> 注意：由于 Service Account 的限制，日历事件不会自动把客户添加为参会者（attendee）。
> 客户会通过确认邮件里附带的 .ics 日历文件来添加到自己的日历。
>
> 可靠性保障：系统每 5 分钟自动扫描数据库，如果有预约未成功同步到日历，会自动补创建。

---

## 三、SMS 短信通知配置（发短信给 Doris）

### 当前状态

SMS 功能暂未启用。Twilio 要求美国本地号码完成 **A2P 10DLC 注册**后才能发短信。

### Twilio 账号信息（已创建）

- Account SID: （见 backend/.env）
- Auth Token: （见 backend/.env）
- 已购号码: （见 backend/.env）

### 启用 SMS 的步骤

1. **登录 Twilio Console** https://console.twilio.com
2. 完成 **A2P 10DLC 注册**：
   - 左侧菜单 → **Messaging** → **Compliance** → **A2P Brand Registration**
   - 填写公司信息：
     - Company Name: Dogs in Fashion
     - Company Type: Sole Proprietor（个体）
     - Industry: Pet Services
   - 提交后等待审批（通常 1-5 个工作日）
3. 注册通过后，创建 **Campaign**：
   - Use Case: Appointment Reminders
   - 关联已购号码 `+16066590806`
4. Campaign 审批通过后即可发短信

### 修改 backend/.env

```env
# 取消注释并修改手机号为 Doris 的
TWILIO_ACCOUNT_SID=<见 backend/.env>
TWILIO_AUTH_TOKEN=<见 backend/.env>
TWILIO_PHONE_NUMBER=<见 backend/.env>
DORIS_PHONE=+19162871878
```

### 验证方式

创建一个测试预约后，Doris 手机应该收到一条短信通知。

---

## 四、Square 押金支付配置

### 设计概览

- **强制押金**：开启后，所有新预约都必须先付 `$20` 不退款押金才能下单。走的是 Square Web Payments SDK（卡号输入托管在 Square iframe 里，我们的服务器拿到的只是一次性 `source_id`，从不接触卡号，合规上属于 PCI SAQ-A）
- **Feature flag**：后端 `DEPOSIT_REQUIRED` + 前端 `VITE_DEPOSIT_REQUIRED` 必须**同时翻转**
  - `false / false` → 老逻辑：无需付款，直接下单
  - `true / true` → 新逻辑：先 tokenize → charge → insert booking
  - `true / false`（前端没改） → 前端走老接口，后端 503 守卫 "Deposit required. Use /api/bookings/with-deposit" 硬挡
  - `false / true`（后端没改） → 前端让用户输卡号付款，后端 404 "Square not configured or feature disabled"
  - 这种"双锁"是故意的：任何一边配置漂移都会立刻暴露，不会出现 Doris 以为收到了押金但实际没收到的情况
- **原子付款流**：pre-check slot → Square charge → insert booking（行 id 用预生成 UUID 作为 Square `reference_id`）→ 如 insert 失败则 refund → 如 refund 也失败发 `LARRY_ALERT_EMAIL` 警报
- **押金状态持久化**：`bookings.deposit_status ∈ {'none','paid','refunded'}` + `bookings.deposit_paid_at` + 独立的 `payments` 表做对账

### 架构说明：谁管 Square

| 角色 | 管理内容 |
|------|---------|
| **Larry（开发期）** | 用自己的 Square sandbox 账号开发、联调 |
| **Doris（生产期）** | 唯一需要做的：把她 Square 账号里的 **Location ID**、**Application ID**（Production）、**Access Token**（Production）发给 Larry |

> 上线前 Doris 已经有 Square 账号（她本来就用 Square 收现场刷卡付款），Larry 需要从她的 Square Developer Dashboard 里取 3 个凭证。

### 让 Doris 创建 Square Application（Production 凭证）

Square 账号里原生的"收现场付款"不产生 API 凭证——我们需要在 Developer Dashboard 新建一个 Application：

1. Doris 用她的 Square 账号（同一个 Seller Account）登录 https://developer.squareup.com/apps
2. 点 **+ Create your first application**（或右上角 **+**）
3. Application name 填 `Dogs in Fashion Website`，选 **I'm building for myself**，提交
4. 进 App 页面，右上角环境切到 **Production**（默认打开是 Sandbox，容易踩坑）
5. **Credentials** 标签：
   - 记录 **Production Application ID**（`sq0idp-` 开头）
   - 记录 **Production Access Token**（`EAAA` 开头，这是生产 token，**严禁进 git、严禁发群、只进 Railway 环境变量**）
6. **Locations** 标签：
   - 找到 Doris 已有的那个生产 location（通常就是她店面地址），记录 **Production Location ID**（`L` 开头的 26 位字符）

> ⚠️ 坑点：Application ID 和 Access Token 分 Sandbox / Production 两套，**Location ID 也分两套**。切 tab 的时候务必确认右上角环境是 Production。

### 后端 env（Railway 生产环境变量）

```env
# Square 强制押金（先以 false 部署上线，再翻 true）
DEPOSIT_REQUIRED=false
DEPOSIT_AMOUNT_CENTS=2000
SQUARE_ACCESS_TOKEN=EAAA...              # Doris 账号 Production Access Token
SQUARE_APPLICATION_ID=sq0idp-...         # Doris 账号 Production Application ID
SQUARE_LOCATION_ID=L...                  # Doris 账号 Production Location ID
SQUARE_ENVIRONMENT=production            # 关键：sandbox / production 二选一
LARRY_ALERT_EMAIL=<your-dev-email>   # 付款成功但 booking 写入失败 + refund 也失败时的紧急告警
```

### 前端 env（Vercel/Railway 前端环境变量）

```env
VITE_DEPOSIT_REQUIRED=false
VITE_DEPOSIT_AMOUNT_CENTS=2000
VITE_SQUARE_APPLICATION_ID=sq0idp-...    # 和后端同一个（Production Application ID）
VITE_SQUARE_LOCATION_ID=L...             # 和后端同一个（Production Location ID）
VITE_SQUARE_ENVIRONMENT=production       # 决定加载 web.squarecdn.com 还是 sandbox.web.squarecdn.com
```

> 前端只放 Application ID + Location ID，**绝不要放 Access Token**。Access Token 只属于后端，泄漏等于别人能代表 Doris 收款。

### 数据库迁移

首次上线前，在 **Supabase 生产项目**的 SQL Editor 跑一次：

```
/Users/dev/dogsinfashion/2026-04-10-payments.sql
```

这个 SQL 脚本是幂等的（`if not exists` + `do $ ... $`），重复执行不会报错。它会：
- 在 `bookings` 表加 `deposit_status` 和 `deposit_paid_at` 两列
- 新建 `payments` 表 + RLS 策略（用户只能看自己的付款记录，admin 通过 service role 绕 RLS）

### 上线流程（先影子部署，再翻 flag）

1. **代码上线但 flag 关闭**：把两边 `DEPOSIT_REQUIRED` / `VITE_DEPOSIT_REQUIRED` 都设成 `false`，部署一次，确认老的下单流程完全没变化（回归测试）
2. **在 Supabase 生产库跑迁移 SQL**
3. **小范围验证**：把 Doris 的手机设成只有她能看见网站的方式（比如临时改成 `VITE_DEPOSIT_REQUIRED=true` 但不通知客户），自己下一单真实付款 + 真实退款，确认 Square Dashboard 能看到 $20 charge，`bookings.deposit_status='paid'`，邮件全部到位
4. **正式翻 flag**：前后端同时改成 `true`，重新部署，通知 Doris 新规则已生效

### 紧急回滚

发现问题后立即：
1. 前后端环境变量同时改回 `DEPOSIT_REQUIRED=false` / `VITE_DEPOSIT_REQUIRED=false`
2. 触发一次 Railway/Vercel 重部署
3. 已经收到的押金在 Square Dashboard 里可以手动逐笔退款

**注意**：已经 `deposit_status='paid'` 的 bookings 不会自动改回 `'none'`——如果要完整回滚这些记录，需要在 Square Dashboard 退款后，再手动 update 数据库行（或直接取消对应 booking，走正常的 cancel 流程，押金会自动退——见下方）

### 取消预约时的押金处理

**当前策略：不退款**。客户或 Doris 取消 booking 时，`deposit_status='paid'` 保持不变，只把 `bookings.status` 改成 `'cancelled'`。取消邮件里会带一段说明告诉客户押金不退。

> 未来如果要区分"24 小时前取消免押金 / 之后不退"之类的策略，是改 `PATCH /api/bookings/:id/status` 路由里的业务逻辑，不是改 Square 配置。

### 紧急告警邮件 `LARRY_ALERT_EMAIL`

只有一种场景会触发：**Square 已成功扣款 → 插 bookings 行失败 → refund 调用也失败**。这意味着客户被扣了钱但系统没记录也退不回去，必须人工介入。Larry 收到邮件后应立刻：
1. 去 Square Dashboard 手动退款
2. 查 Railway 日志定位 insert 失败原因

正常情况下这封邮件一辈子都不应该收到。如果收到就说明有严重 bug 或 Supabase 挂了。

### 验证方式

**Sandbox 测试卡**（只在 `SQUARE_ENVIRONMENT=sandbox` 时有效）：
- 成功：`4111 1111 1111 1111`
- Declined：`4000 0000 0000 0002`
- CVV 错误：`4000 0000 0000 0010`
- 过期日期任意未来值（`12/26` 之类），CVV 任意 3 位，ZIP 任意 5 位

**生产验证**：用自己的真实卡下一单 $20，确认 Square Dashboard `Transactions` 里看到 `$20.00 CAPTURED`，`Reference ID` 就是 `bookings.id`（一个 UUID）。验证完立刻去 Dashboard 退款，避免真花这 $20。

---

## 五、代码中的硬编码（需要改代码的地方）

以下文件中 Doris 的联系方式是**硬编码**的，切换到生产环境时需要确认是否正确（目前都是 Doris 的真实信息，所以生产环境其实不用改）：

### 后端

| 文件 | 位置 | 内容 |
|------|------|------|
| `backend/src/services/email.ts` | 邮件模板页脚 | `Doris — (916) 287-1878 — contact@dogsinfashion.com` |

### 前端

| 文件 | 内容 |
|------|------|
| `frontend/src/components/Footer.tsx` | `mailto:contact@dogsinfashion.com` |
| `frontend/src/components/About.tsx` | `contact@dogsinfashion.com` |
| `frontend/src/components/BookingForm.tsx` | `mailto:contact@dogsinfashion.com` |
| `frontend/src/components/BookingCTA.tsx` | `mailto:contact@dogsinfashion.com` |
| `frontend/src/utils/calendar.ts` | `Doris — (916) 287-1878` + `contact@dogsinfashion.com` |
| `frontend/src/utils/messaging.ts` | `+19162871878` + `contact@dogsinfashion.com` |

> 这些硬编码的都是 Doris 的真实联系方式，上线时不需要修改。
> 开发测试时也不影响，因为它们只是展示用的联系信息，不参与实际的邮件/短信发送逻辑。

---

## 六、完整的生产环境 backend/.env 模板

```env
PORT=3001
NODE_ENV=production

# Supabase
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<保持不变>

# CORS — 改成生产域名
FRONTEND_URL=https://www.dogsinfashion.com

# Google Calendar
GOOGLE_SERVICE_ACCOUNT_KEY=<保持不变，和开发环境一样>
DORIS_CALENDAR_ID=contact@dogsinfashion.com

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxx     # 从 Resend Dashboard 生成
DORIS_EMAIL=contact@dogsinfashion.com    # 接收 New Booking 通知的地址

# SMS (Twilio) — 完成 10DLC 注册后启用
TWILIO_ACCOUNT_SID=<见 Twilio Console>
TWILIO_AUTH_TOKEN=<见 Twilio Console>
TWILIO_PHONE_NUMBER=<见 Twilio Console>
DORIS_PHONE=+19162871878

# Square 押金（先以 false 上线，再翻 true，翻 flag 时前端也要同步改）
DEPOSIT_REQUIRED=false
DEPOSIT_AMOUNT_CENTS=2000
SQUARE_ACCESS_TOKEN=EAAA...              # Doris 账号 Production Access Token（严禁泄漏）
SQUARE_APPLICATION_ID=sq0idp-...
SQUARE_LOCATION_ID=L...
SQUARE_ENVIRONMENT=production
LARRY_ALERT_EMAIL=<your-dev-email>
```

> Supabase Custom SMTP 的配置**不在 .env 里**，它存在 Supabase Dashboard → Auth → SMTP Settings 里。如果需要改（比如轮换 Resend API Key），要同时改这两个地方。

---

## 七、切换清单（Checklist）

从开发切到生产时，按顺序做：

### 一次性设置（现在已全部完成，保留作参考）
- [x] Resend 账号注册 + `dogsinfashion.com` 域名 DNS 验证（3 条记录）
- [x] Resend API Key 创建 → 填入 `backend/.env` 的 `RESEND_API_KEY` + Railway 环境变量
- [x] Supabase Dashboard 配 Custom SMTP（Host: `smtp.resend.com`, Port: 465, Username: `resend`, Password: API Key）
- [x] Supabase Dashboard 贴 3 个邮件模板（Confirm signup / Magic Link / Reset Password）
- [x] Doris 的 Google Calendar 共享给 Service Account（Make changes to events 权限）

### 每次上线前需要确认
- [ ] `backend/.env` 的 `DORIS_EMAIL` 改成 `contact@dogsinfashion.com`（开发时是 Larry 邮箱）
- [ ] `backend/.env` 的 `DORIS_CALENDAR_ID` 改成 `contact@dogsinfashion.com`
- [ ] `backend/.env` 的 `FRONTEND_URL` 改成 `https://www.dogsinfashion.com`
- [ ] `backend/.env` 的 `NODE_ENV=production`
- [ ] Railway 环境变量同步上述改动
- [ ] 创建真实预约验证：booking 确认邮件 ✓ / Doris 通知邮件 ✓ / 日历事件 ✓
- [ ] 在登录页点 "Forgot password" 验证 auth 邮件：样式是 Dogs in Fashion 自定义模板 ✓

### Square 押金上线（独立于主应用上线，可以后续启用）
- [ ] Doris 在 https://developer.squareup.com/apps 创建 `Dogs in Fashion Website` App
- [ ] 把环境切到 **Production**，记下 Application ID / Access Token / Location ID
- [ ] Larry 在 Railway 填入 7 个后端 Square 环境变量（`DEPOSIT_REQUIRED=false` 先保持关闭）
- [ ] Larry 在前端托管平台填入 5 个 `VITE_SQUARE_*` 前端环境变量（`VITE_DEPOSIT_REQUIRED=false` 先保持关闭）
- [ ] 在 Supabase 生产项目跑 `2026-04-10-payments.sql` 迁移
- [ ] 先以 flag=off 部署一次，回归测试老的下单流程完全没变化
- [ ] 用自己真实卡做一次 $20 生产试单，确认 Square Dashboard + `bookings` + `payments` 三端一致 → 立刻退款
- [ ] 正式翻 flag：前后端同时改 `DEPOSIT_REQUIRED / VITE_DEPOSIT_REQUIRED` 为 `true` → 重新部署 → 通知 Doris

### 待办（不阻塞上线）
- [ ] 完成 Twilio A2P 10DLC 注册 → 取消注释 `TWILIO_*` 环境变量 → 填入 `DORIS_PHONE`
