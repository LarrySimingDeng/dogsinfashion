# Dogs in Fashion — 生产环境配置指南

> 本文档说明如何将开发环境（Larry 的测试账号）切换为生产环境（Doris 的正式账号）。
> 开发环境使用 `<your-dev-email>`，生产环境使用 `dogsinfashionca@gmail.com`。

---

## 架构说明：谁管什么

| 角色 | 管理内容 |
|------|----------|
| **Larry（开发者）** | Google Cloud 项目、Service Account、Twilio 账号、Supabase、代码部署 |
| **Doris（业务方）** | 只需做两件事：生成 Gmail App Password + 共享她的 Google Calendar |

> Google Cloud Console、Twilio Console 等技术平台全部由 Larry 管理，Doris 不需要接触。

---

## 当前环境对照

| 配置项 | 开发环境（Larry） | 生产环境（Doris） |
|--------|-------------------|-------------------|
| DORIS_EMAIL | <your-dev-email> | dogsinfashionca@gmail.com |
| SMTP_USER | <your-dev-email> | dogsinfashionca@gmail.com |
| SMTP_PASS | Larry 的 Gmail App Password | Doris 的 Gmail App Password |
| DORIS_CALENDAR_ID | <your-dev-email> | dogsinfashionca@gmail.com |
| GOOGLE_SERVICE_ACCOUNT_KEY | Larry 的 GCP 项目，同一个 Service Account | 同一个（不需要改） |
| DORIS_PHONE | <your-dev-phone> (Larry) | +19162871878 (Doris) |
| TWILIO_* | 暂未配置 | 需要完成 10DLC 注册 |

---

## 一、Email 通知配置（给 Doris 发邮件）

### 需要做的事

Doris 需要为自己的 Gmail 生成一个 App Password，系统用它来发送预约确认邮件和通知邮件。

### 需要 Doris 操作（可以视频通话手把手教她）

1. 用 `dogsinfashionca@gmail.com` 登录 Google
2. 打开 https://myaccount.google.com/security
3. 确认 **2-Step Verification（两步验证）** 已开启
   - 如果没开 → 点击 2-Step Verification → 按提示绑定手机号
4. 打开 https://myaccount.google.com/apppasswords
5. App name 填 `DogsInFashion` → 点 **Create**
6. 会生成一个 **16 位密码**（类似 `abcd efgh ijkl mnop`）→ **让 Doris 把这个密码发给你**

### 修改 backend/.env

```env
# 把这三行改成 Doris 的
SMTP_USER=dogsinfashionca@gmail.com
SMTP_PASS=<Doris 生成的 16 位 App Password，去掉空格>
DORIS_EMAIL=dogsinfashionca@gmail.com
```

### 验证方式

在网站上创建一个测试预约，Doris 的邮箱应该收到：
- 一封「New Booking Notification」通知邮件

客户邮箱应该收到：
- 一封「Booking Confirmed」确认邮件，附带 .ics 日历文件（客户可一键添加到自己的日历）

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

# Email (Gmail SMTP)
SMTP_USER=dogsinfashionca@gmail.com
SMTP_PASS=<Doris 的 Gmail App Password>
DORIS_EMAIL=dogsinfashionca@gmail.com

# SMS (Twilio) — 完成 10DLC 注册后启用
TWILIO_ACCOUNT_SID=<见 Twilio Console>
TWILIO_AUTH_TOKEN=<见 Twilio Console>
TWILIO_PHONE_NUMBER=<见 Twilio Console>
DORIS_PHONE=+19162871878
```

---

## 七、切换清单（Checklist）

从开发切到生产时，按顺序做：

- [ ] Doris 生成 Gmail App Password → 填入 `SMTP_USER` / `SMTP_PASS` / `DORIS_EMAIL`
- [ ] Doris 的 Google Calendar 共享给 Service Account（Make changes to events 权限）→ 填入 `DORIS_CALENDAR_ID`
- [ ] 完成 Twilio A2P 10DLC 注册 → 取消注释 `TWILIO_*` 环境变量 → 填入 `DORIS_PHONE`
- [ ] `FRONTEND_URL` 改为生产域名
- [ ] `NODE_ENV` 改为 `production`
- [ ] 创建测试预约验证：邮件通知 ✓ / 日历事件 ✓ / 短信通知 ✓
- [ ] （可选）配置 Stripe 支付
