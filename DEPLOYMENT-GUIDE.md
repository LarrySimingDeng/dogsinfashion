# Dogs in Fashion — 生产环境配置指南

> 本文档说明如何将开发环境（Larry 的测试账号）切换为生产环境（Doris 的正式账号）。
> 开发环境使用 `<your-dev-email>`，生产环境使用 `dogsinfashionca@gmail.com`。

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
| DORIS_EMAIL（接收通知） | <your-dev-email> | dogsinfashionca@gmail.com |
| RESEND_API_KEY | 同一个 Resend 账号的 key | 同一个（不需要改） |
| DORIS_CALENDAR_ID | <your-dev-email> | dogsinfashionca@gmail.com |
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
DORIS_EMAIL=dogsinfashionca@gmail.com  # 接收通知邮件的地址（开发环境填 Larry 的）
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

1. 用 `dogsinfashionca@gmail.com` 登录 Google
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
DORIS_CALENDAR_ID=dogsinfashionca@gmail.com
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

## 四、Stripe 支付配置（暂跳过）

Stripe 支付功能暂未实现。上线时需要：

1. 注册 Stripe 账号 https://dashboard.stripe.com/register
2. 获取 API keys（先用 Test Mode）
3. 在 backend/.env 添加：
   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. 在 frontend/.env.local 添加：
   ```env
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

---

## 五、代码中的硬编码（需要改代码的地方）

以下文件中 Doris 的联系方式是**硬编码**的，切换到生产环境时需要确认是否正确（目前都是 Doris 的真实信息，所以生产环境其实不用改）：

### 后端

| 文件 | 位置 | 内容 |
|------|------|------|
| `backend/src/services/email.ts` | 邮件模板页脚 | `Doris — (916) 287-1878 — dogsinfashionca@gmail.com` |

### 前端

| 文件 | 内容 |
|------|------|
| `frontend/src/components/Footer.tsx` | `mailto:dogsinfashionca@gmail.com` |
| `frontend/src/components/About.tsx` | `dogsinfashionca@gmail.com` |
| `frontend/src/components/BookingForm.tsx` | `mailto:dogsinfashionca@gmail.com` |
| `frontend/src/components/BookingCTA.tsx` | `mailto:dogsinfashionca@gmail.com` |
| `frontend/src/utils/calendar.ts` | `Doris — (916) 287-1878` + `dogsinfashionca@gmail.com` |
| `frontend/src/utils/messaging.ts` | `+19162871878` + `dogsinfashionca@gmail.com` |

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
DORIS_CALENDAR_ID=dogsinfashionca@gmail.com

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxx     # 从 Resend Dashboard 生成
DORIS_EMAIL=dogsinfashionca@gmail.com    # 接收 New Booking 通知的地址

# SMS (Twilio) — 完成 10DLC 注册后启用
TWILIO_ACCOUNT_SID=<见 Twilio Console>
TWILIO_AUTH_TOKEN=<见 Twilio Console>
TWILIO_PHONE_NUMBER=<见 Twilio Console>
DORIS_PHONE=+19162871878
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
- [ ] `backend/.env` 的 `DORIS_EMAIL` 改成 `dogsinfashionca@gmail.com`（开发时是 Larry 邮箱）
- [ ] `backend/.env` 的 `DORIS_CALENDAR_ID` 改成 `dogsinfashionca@gmail.com`
- [ ] `backend/.env` 的 `FRONTEND_URL` 改成 `https://www.dogsinfashion.com`
- [ ] `backend/.env` 的 `NODE_ENV=production`
- [ ] Railway 环境变量同步上述改动
- [ ] 创建真实预约验证：booking 确认邮件 ✓ / Doris 通知邮件 ✓ / 日历事件 ✓
- [ ] 在登录页点 "Forgot password" 验证 auth 邮件：样式是 Dogs in Fashion 自定义模板 ✓

### 待办（不阻塞上线）
- [ ] 完成 Twilio A2P 10DLC 注册 → 取消注释 `TWILIO_*` 环境变量 → 填入 `DORIS_PHONE`
- [ ] （可选）配置 Stripe 支付
