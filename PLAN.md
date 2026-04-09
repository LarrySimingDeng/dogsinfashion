# Dogs in Fashion — 全栈预约平台实施计划

> 每一步（Step）都必须测试通过才能进入下一步。
> 标记说明：⬜ 未开始 | 🔄 进行中 | ✅ 完成

---

## 进度总结（更新于 2026-04-09）

| Phase | 描述 | 状态 | 备注 |
|-------|------|------|------|
| Phase 1 | 项目重构 + 认证 | ✅ 完成 | 8/8 步全部完成 |
| Phase 2 | 核心预约流程 | ✅ 完成 | 5/5 步全部完成 |
| Phase 3 | Google Calendar 集成 | ✅ 完成 | Service Account 已配置，日历同步 + 自动补创建已实现 |
| Phase 4 | 管理后台 | ✅ 完成 | 2/2 步全部完成 |
| Phase 5 | Email & SMS 提醒 | ✅ 完成 | Email 已测试通过（含 .ics 附件），SMS 暂跳过（需 10DLC 注册） |
| Phase 6 | Stripe 支付 | ⏸️ 暂跳过 | 后续需要时再实现 |
| Phase 7 | 日历双向同步 Webhook | ⬜ 未开始 | 需要部署到公网后才能配置 |
| Phase 8 | 重复预约 | ⬜ 未开始 | |
| Phase 9 | 部署上线 | ⬜ 未开始 | Dockerfile 和 vercel.json 已存在 |

**总体进度：~65%**（Phase 1-5 完成并测试通过，Phase 6 暂跳过，Phase 7-9 未开始）

**环境配置状态：**
- Email (Gmail SMTP): ✅ 测试通过
- Google Calendar: ✅ 测试通过（含自动补同步机制）
- SMS (Twilio): ⏸️ 暂跳过（需 A2P 10DLC 注册）
- 生产环境切换指南: ✅ 见 DEPLOYMENT-GUIDE.md

**下一步：Phase 7 — 日历双向同步 或 Phase 9 — 部署上线**

---

## 总览

将当前纯前端 React 落地页改造为全功能预约管理平台，参照 Full Slate 模式。

### 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Tailwind + react-router-dom |
| 后端 | Express + TypeScript |
| 数据库 | Supabase PostgreSQL |
| 认证 | Supabase Auth（Google OAuth + Email OTP） |
| 日历 | Google Calendar API（Service Account） |
| 通知 | Nodemailer（邮件）+ Twilio（短信） |
| 支付 | Stripe |
| 部署 | Vercel（前端）+ Railway（后端）+ Supabase（DB） |

### 项目结构

```
dogsinfashion/
├── package.json              # npm workspaces root
├── PLAN.md                   # 本文件
├── .env.example
├── frontend/                 # React + Vite
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── vercel.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── lib/              # supabase.ts, api.ts
│       ├── context/          # AuthContext.tsx
│       ├── pages/            # HomePage, LoginPage, BookingPage, etc.
│       ├── components/       # 现有 + 新增
│       ├── data/             # services.ts
│       └── utils/            # calendar.ts, messaging.ts
└── backend/                  # Express API
    ├── package.json
    ├── tsconfig.json
    ├── Dockerfile
    └── src/
        ├── index.ts
        ├── app.ts
        ├── config.ts
        ├── middleware/       # auth.ts, admin.ts
        ├── routes/           # bookings.ts, availability.ts, reminders.ts, payments.ts
        ├── services/         # supabase.ts, google-calendar.ts, email.ts, sms.ts, stripe.ts, slots.ts
        ├── jobs/             # reminder-scheduler.ts
        └── types.ts
```

---

## 数据库 Schema

> 在 Supabase SQL Editor 中执行。随着 Phase 推进逐步建表。

### Phase 1 建表

```sql
-- profiles（扩展 Supabase Auth）
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  avatar_url text,
  role text not null default 'client' check (role in ('client', 'admin')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "Users view own profile" on profiles for select using (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);
create policy "Admin view all profiles" on profiles for select using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- 自动创建 profile trigger
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    case when new.email in ('dogsinfashionca@gmail.com', '<your-dev-email>', '<admin-email>') then 'admin' else 'client' end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

### Phase 2 建表

```sql
-- availability（Doris 的工作时间）
create table availability (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true
);

insert into availability (day_of_week, start_time, end_time) values
  (1, '09:00', '17:00'), (2, '09:00', '17:00'), (3, '09:00', '17:00'),
  (4, '09:00', '17:00'), (5, '09:00', '17:00'), (6, '09:00', '17:00');

-- blocked_dates（休息日）
create table blocked_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  reason text
);

-- bookings
create table bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  service_id text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  dog_name text not null,
  dog_breed text,
  address text not null,
  notes text,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'completed', 'cancelled')),
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bookings_user on bookings(user_id);
create index idx_bookings_date on bookings(date);

alter table bookings enable row level security;
create policy "Users view own bookings" on bookings for select using (auth.uid() = user_id);
create policy "Users create bookings" on bookings for insert with check (auth.uid() = user_id);
create policy "Admin view all" on bookings for select using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "Admin update all" on bookings for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
```

### Phase 5 建表

```sql
-- reminders（提醒记录）
create table reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  type text not null check (type in ('email', 'sms')),
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  metadata text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create index idx_reminders_scheduled on reminders(scheduled_at) where status = 'pending';
```

### Phase 6 建表

```sql
-- payments（支付记录）
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  stripe_payment_intent_id text not null unique,
  amount_cents int not null,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

-- bookings 加支付字段
alter table bookings add column payment_required boolean not null default false;
alter table bookings add column payment_status text default 'none'
  check (payment_status in ('none', 'pending', 'paid', 'refunded'));
```

### Phase 8 建表

```sql
-- recurring_rules（重复预约规则）
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  service_id text not null,
  dog_name text not null,
  dog_breed text,
  address text not null,
  notes text,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- bookings 加关联
alter table bookings add column recurring_rule_id uuid references recurring_rules(id);
```

---

## Phase 1: 项目重构 + 认证（Google + 邮箱注册）

### Step 1.1 ✅ 重构项目结构

**操作：**
1. 创建 `frontend/` 目录
2. 移动现有文件到 `frontend/`：`src/`, `public/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `vite-env.d.ts`
3. 移动现有 `package.json` 到 `frontend/package.json`
4. 创建根 `package.json`（npm workspaces）
5. 创建 `backend/` 目录结构
6. 更新 `.gitignore`

**测试：**
- [ ] `cd frontend && npm install && npm run dev` → 网站正常显示，功能不变
- [ ] 所有现有页面组件渲染正常（Navbar, Hero, About, Services, Areas, HowItWorks, BookingForm, Footer）

---

### Step 1.2 ✅ 搭建 Backend Express 项目

**操作：**
1. `backend/package.json` + 依赖安装
2. `backend/tsconfig.json`
3. `backend/src/index.ts` — Express 启动
4. `backend/src/app.ts` — cors, helmet, json, 路由注册
5. `backend/src/config.ts` — 环境变量读取 + 验证
6. 创建 `GET /api/health` 健康检查路由

**依赖：**
```
express @supabase/supabase-js cors helmet zod dotenv
typescript tsx @types/express @types/cors (dev)
```

**测试：**
- [ ] `cd backend && npm run dev` → 服务启动在 3001 端口
- [ ] `curl http://localhost:3001/api/health` → 返回 `{ "status": "ok" }`

---

### Step 1.3 ✅ npm workspaces + 联合启动

**操作：**
1. 根 `package.json` 配置 workspaces: ["frontend", "backend"]
2. 安装 `concurrently`
3. 配置 `npm run dev` 同时启动前后端
4. `frontend/vite.config.ts` 添加代理 `/api` → `http://localhost:3001`

**测试：**
- [ ] 项目根目录 `npm run dev` → 前端 5173 + 后端 3001 同时启动
- [ ] 浏览器访问 `http://localhost:5173/api/health` → 代理到后端，返回 ok

---

### Step 1.4 ✅ Supabase 项目配置

> 此步骤需要手动在 Supabase Dashboard 操作

**操作：**
1. 创建 Supabase 项目
2. 在 SQL Editor 执行 Phase 1 建表 SQL（profiles + trigger）
3. Authentication → Providers → 开启 Email（默认 OTP / Magic Link）
4. Authentication → Providers → 开启 Google，填入 Client ID + Secret
5. Google Cloud Console 添加 Supabase 回调 URL
6. 记录 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
7. 创建 `frontend/.env.local` 和 `backend/.env`

**测试：**
- [ ] Supabase Dashboard → Table Editor → `profiles` 表存在
- [ ] Authentication → Providers → Email 和 Google 都显示 Enabled

---

### Step 1.5 ✅ 前端认证 — Supabase Client + AuthContext

**操作：**
1. `frontend/` 安装 `@supabase/supabase-js`, `react-router-dom`
2. 创建 `frontend/src/lib/supabase.ts`
3. 创建 `frontend/src/context/AuthContext.tsx`
   - 监听 `onAuthStateChange`
   - 提供 `user`, `session`, `profile`, `isLoading`, `signOut`
   - 登录后从 `profiles` 表获取 role
4. 创建 `frontend/src/components/ProtectedRoute.tsx`

**测试：**
- [ ] AuthContext 在 App 中正常初始化，不报错
- [ ] 未登录时 `user` 为 null

---

### Step 1.6 ✅ 前端认证 — LoginPage（Google + 邮箱注册）

**操作：**
1. 创建 `frontend/src/pages/LoginPage.tsx`
   - **Google 登录按钮**：调用 `supabase.auth.signInWithOAuth({ provider: 'google' })`
   - **邮箱注册/登录表单**：
     - 输入邮箱 → 调用 `supabase.auth.signInWithOtp({ email })` → Supabase 发验证码到邮箱
     - 输入验证码 → 调用 `supabase.auth.verifyOtp({ email, token, type: 'email' })`
     - 两步 UI：先输入邮箱 → 显示验证码输入框
   - 登录成功后跳转到 `/book`（或来源页）
2. 品牌设计匹配现有 Tailwind 风格

**Supabase Email OTP 说明：**
- Supabase Auth 内置支持 email OTP，不需要自己发邮件
- `signInWithOtp` 会发一封含 6 位验证码的邮件给用户
- 新用户自动注册，老用户直接登录
- 可在 Supabase Dashboard → Authentication → Email Templates 自定义邮件模板

**测试：**
- [ ] 访问 `/login` → 页面正常渲染，有 Google 登录按钮和邮箱输入框
- [ ] 点 Google 登录 → 跳转 Google OAuth → 回来后登录成功
- [ ] 输入邮箱 → 收到验证码邮件 → 输入验证码 → 登录成功
- [ ] 登录后 Supabase `auth.users` 和 `profiles` 表中有对应记录
- [ ] 新用户 `profiles.role` 默认为 `client`，Doris 邮箱为 `admin`

---

### Step 1.7 ✅ 前端路由改造

**操作：**
1. 改造 `frontend/src/App.tsx`：BrowserRouter + Routes + AuthProvider
2. 创建 `frontend/src/pages/HomePage.tsx`：组装现有组件
3. 路由：
   - `/` → HomePage
   - `/login` → LoginPage
   - `/book` → ProtectedRoute → BookingPage（暂时空壳）
   - `/my-bookings` → ProtectedRoute → MyBookingsPage（暂时空壳）
   - `/admin` → ProtectedRoute(requireAdmin) → AdminDashboard（暂时空壳）
4. 修改 `Navbar.tsx`：
   - 未登录：显示 "Sign In" 按钮 → 跳转 /login
   - 已登录：显示用户头像 / 名字 + 下拉菜单（My Bookings, Sign Out）
   - Admin：额外显示 "Admin" 链接
   - "Book Now" 按钮：已登录 → /book，未登录 → /login
5. 修改 `BookingForm.tsx`：首页版本简化，显示 "Sign in to Book" CTA

**测试：**
- [ ] `/` → 首页正常显示所有组件
- [ ] 未登录访问 `/book` → 自动跳转 `/login`
- [ ] 登录后 Navbar 显示用户名和头像
- [ ] Admin 用户能看到 Admin 链接
- [ ] 所有导航链接正常工作

---

### Step 1.8 ✅ 后端认证中间件

**操作：**
1. `backend/src/services/supabase.ts` — Supabase admin client（使用 service_role_key）
2. `backend/src/middleware/auth.ts`：
   - 从 `Authorization: Bearer <token>` 提取 token
   - `supabase.auth.getUser(token)` 验证
   - 查 `profiles` 表获取 role
   - 附加 `req.user = { id, email, role }`
3. `backend/src/middleware/admin.ts`：检查 `req.user.role === 'admin'`
4. 创建 `GET /api/auth/me` 路由：返回当前用户信息

**测试：**
- [ ] 无 token 访问 `/api/auth/me` → 401
- [ ] 无效 token → 401
- [ ] 前端登录后，用 session token 访问 `/api/auth/me` → 返回用户信息 + role
- [ ] `frontend/src/lib/api.ts` fetch wrapper 自动附带 Authorization header

---

## Phase 2: 核心预约流程

### Step 2.1 ✅ 建预约相关表

**操作：**
1. 在 Supabase SQL Editor 执行 Phase 2 建表 SQL
2. Seed 默认排班数据

**测试：**
- [ ] `availability`, `blocked_dates`, `bookings` 表存在
- [ ] `availability` 有 6 行默认排班（周一至周六）

---

### Step 2.2 ✅ 后端 — 时段计算 + 可用时段 API

**操作：**
1. `backend/src/services/slots.ts`：
   - 输入：date, serviceId
   - 查 availability 表获取该天工作时间
   - 查 blocked_dates 检查是否休息日
   - 查 bookings 获取已有预约
   - 按 30 分钟间隔生成可用起始时间
   - 排除冲突时段
   - 返回可用 slots 列表
2. `backend/src/routes/availability.ts`：
   - `GET /api/availability/slots?date=2026-04-15&serviceId=groom-small` → 返回 slots

**测试：**
- [ ] 空日程：返回完整时段列表
- [ ] 休息日：返回空列表
- [ ] 已有预约冲突：冲突时段不出现
- [ ] 服务时长正确影响可选时段（2.5h vs 3.5h）
- [ ] 非工作日（周日）：返回空

---

### Step 2.3 ✅ 后端 — 创建预约 API

**操作：**
1. `backend/src/routes/bookings.ts`：
   - `POST /api/bookings`：
     - 验证请求体（zod）
     - 计算 end_time（start_time + service duration）
     - 再次验证时段可用（防并发冲突）
     - 插入 bookings 表（status: 'confirmed'）
     - 返回 booking
   - `GET /api/bookings`：
     - 普通用户：返回自己的预约
     - Admin：返回所有预约（支持 ?status=&from=&to= 筛选）
   - `PATCH /api/bookings/:id/status`：
     - Admin only
     - 更新 status（completed / cancelled）

**测试：**
- [ ] POST 创建预约 → 数据库有记录，返回完整 booking 对象
- [ ] 重复时段 POST → 400 "时段不可用"
- [ ] GET 普通用户 → 只看到自己的
- [ ] GET Admin → 看到所有
- [ ] PATCH 非 admin → 403
- [ ] PATCH admin → 状态更新成功

---

### Step 2.4 ✅ 前端 — 预约向导 BookingPage

**操作：**
1. `frontend/src/pages/BookingPage.tsx`（4 步向导）：
   - **Step 1: 选服务** — 复用现有 ServiceCard 风格
   - **Step 2: 选日期时间** — 用 SlotPicker 组件
   - **Step 3: 填写信息** — 狗名、品种、地址、备注
   - **Step 4: 确认提交** — 汇总 → POST /api/bookings
   - 成功页：显示预约详情 + "View My Bookings" 按钮
2. `frontend/src/components/SlotPicker.tsx`：
   - 日历视图（接下来 30 天）
   - 选择日期后调 `GET /api/availability/slots` 获取可用时段
   - 可用时段显示为按钮，不可用的 greyed out

**测试：**
- [ ] 完整走通 4 步向导 → 预约成功
- [ ] SlotPicker 正确显示可用/不可用时段
- [ ] 提交后数据库有记录
- [ ] 必填字段为空时有表单验证

---

### Step 2.5 ✅ 前端 — MyBookingsPage

**操作：**
1. `frontend/src/pages/MyBookingsPage.tsx`：
   - 调 `GET /api/bookings` 获取自己的预约
   - 用 BookingCard 组件展示每个预约
   - 支持取消（confirmed 状态的预约）
   - 按日期排序，区分"即将到来"和"历史"
2. `frontend/src/components/BookingCard.tsx`

**测试：**
- [ ] 新建预约后在 MyBookingsPage 中可见
- [ ] 取消预约 → 状态变为 cancelled
- [ ] 历史预约显示在"Past"分区

---

## Phase 3: 日历集成（Google Calendar Sync）

### Step 3.1 ⬜ Google Calendar API 配置

> 手动操作

**操作：**
1. Google Cloud Console → 启用 Google Calendar API
2. 创建 Service Account → 下载 JSON 密钥
3. Doris 在 Google Calendar → Settings → 共享 → 添加 Service Account 邮箱 → 权限"Make changes to events"
4. 将 JSON 密钥内容存入 `backend/.env` 的 `GOOGLE_SERVICE_ACCOUNT_KEY`
5. 设置 `DORIS_CALENDAR_ID=dogsinfashionca@gmail.com`

**测试：**
- [ ] Service Account 创建成功
- [ ] Doris 日历共享设置完成

---

### Step 3.2 ✅ 后端 — Google Calendar 事件创建

**操作：**
1. `backend/src/services/google-calendar.ts`：
   - `createEvent(booking, clientEmail)` → 创建事件，添加 Doris + 客户为 attendee
   - `deleteEvent(eventId)` → 取消预约时删除事件
   - `updateEvent(eventId, updates)` → 更新事件
   - 使用 `sendUpdates: 'all'` → Google 自动发邮件给 attendee
2. 集成到 `POST /api/bookings`：创建预约后创建日历事件，存 `google_event_id`
3. 集成到 `PATCH /api/bookings/:id/status`：取消时删除日历事件

**测试：**
- [ ] 创建预约 → Doris 的 Google Calendar 出现新事件
- [ ] 事件包含正确的时间、地点、描述
- [ ] Doris 和客户都收到日历邀请邮件
- [ ] 取消预约 → 日历事件被删除
- [ ] Service Account 密钥无效时 → 优雅降级（预约仍创建，只是无日历事件）

---

### Step 3.3 ✅ 后端 — 实时日历同步（可用时段感知）

**操作：**
1. 扩展 `slots.ts`：查询 Google Calendar 获取 Doris 的 freebusy 信息
   - `calendar.freebusy.query()` → 获取指定日期范围的忙碌时段
   - 将 Google Calendar 上的非本平台事件也作为不可用时段
2. 合并：数据库预约 + Google Calendar 忙碌时段 = 最终可用时段

**测试：**
- [ ] Doris 在 Google Calendar 手动添加一个私人事件
- [ ] 该时段在预约页面显示为不可用
- [ ] 删除私人事件后，时段恢复可用

---

## Phase 4: 管理后台

### Step 4.1 ✅ 前端 — AdminDashboard 预约管理

**操作：**
1. `frontend/src/pages/AdminDashboard.tsx`：
   - **预约管理 Tab**：
     - 预约列表（所有客户）
     - 按状态筛选（confirmed / completed / cancelled）
     - 按日期范围筛选
     - 操作按钮：标记完成、取消
   - 显示客户信息、狗狗信息、服务、时间、地址

**测试：**
- [ ] Admin 登录 → /admin → 看到所有预约
- [ ] 筛选功能正常
- [ ] 标记完成 → 状态变 completed
- [ ] 取消 → 状态变 cancelled + 日历事件删除

---

### Step 4.2 ✅ 前端 — AdminDashboard 排班管理

**操作：**
1. AdminDashboard 新增 **排班管理 Tab**：
   - `AvailabilityEditor.tsx`：每天的开始/结束时间编辑，开关 active
   - 休息日管理：日历选择 → 添加/删除
2. 后端路由：
   - `GET /api/availability/schedule` → 返回 availability + blocked_dates
   - `PUT /api/availability/schedule` → 批量更新 availability
   - `POST /api/availability/blocked-dates` → 添加休息日
   - `DELETE /api/availability/blocked-dates/:id` → 删除休息日

**测试：**
- [ ] 修改工作时间 → 预约页面时段同步变化
- [ ] 添加休息日 → 该日期无可用时段
- [ ] 删除休息日 → 时段恢复

---

## Phase 5: Email & SMS Reminders（自动提醒）

### Step 5.1 ✅ 建提醒表 + 后端邮件服务

**操作：**
1. 在 Supabase 执行 Phase 5 建表 SQL（reminders 表）
2. `backend/src/services/email.ts`：
   - `sendBookingConfirmation(booking, client)` — 预约确认邮件给客户
   - `notifyDorisNewBooking(booking, client)` — 通知 Doris 新预约
   - `sendReminder(booking, client)` — 预约提醒邮件
   - 使用 Nodemailer + Gmail SMTP（App Password）
3. 集成到 `POST /api/bookings`：创建预约时发确认邮件 + 通知 Doris

**环境变量：**
```
SMTP_USER=dogsinfashionca@gmail.com
SMTP_PASS=<gmail-app-password>
DORIS_EMAIL=dogsinfashionca@gmail.com
```

**测试：**
- [ ] 创建预约 → 客户收到确认邮件
- [ ] 创建预约 → Doris 收到新预约通知邮件
- [ ] 邮件内容包含完整预约信息

---

### Step 5.2 ✅ SMS 通知（Twilio）

**操作：**
1. `backend/src/services/sms.ts`：
   - 用 Twilio SDK 发短信
   - `sendSmsReminder(phone, message)` — 发提醒短信
   - `notifyDorisSms(message)` — 短信通知 Doris
2. 集成到预约创建：短信通知 Doris（如果客户提供了手机号）

**环境变量：**
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DORIS_PHONE=+19162871878
```

**测试：**
- [ ] 创建预约 → Doris 手机收到短信通知
- [ ] 无手机号客户 → 跳过短信，不报错

---

### Step 5.3 ✅ 自动提醒调度器

**操作：**
1. `backend/src/jobs/reminder-scheduler.ts`：
   - 预约创建时，在 reminders 表插入两条记录：
     - 邮件提醒：预约前 24 小时
     - 短信提醒：预约前 2 小时（如果客户有手机号）
   - 定时任务（每 10 分钟运行）：
     - 查询 `reminders` 表中 `status='pending'` 且 `scheduled_at <= now()`
     - 发送邮件或短信
     - 更新 `status` 为 `sent` 或 `failed`
2. 使用 `setInterval` 实现（简单方案，适合单实例）
3. 取消预约时，删除对应的 pending reminders

**测试：**
- [ ] 创建预约 → reminders 表有两条记录，scheduled_at 正确
- [ ] 手动修改 scheduled_at 为过去时间 → 调度器触发发送
- [ ] 邮件提醒发送成功
- [ ] 短信提醒发送成功
- [ ] 取消预约 → 对应 pending reminders 被删除
- [ ] 已发送的 reminder 不会重复发送

---

### Step 5.4 ✅ Admin 提醒设置

**操作：**
1. AdminDashboard 新增提醒设置：
   - 邮件提醒：开关 + 提前时间（默认 24h）
   - 短信提醒：开关 + 提前时间（默认 2h）
2. 后端配置存入数据库（或简单起见用环境变量）

**测试：**
- [ ] 关闭邮件提醒 → 不再生成邮件 reminder
- [ ] 修改提前时间 → scheduled_at 计算正确

---

## Phase 6: Credit Card Payments（Stripe 支付）

### Step 6.1 ⬜ Stripe 配置 + 支付表

**操作：**
1. 注册 Stripe 账号，获取 API keys（先用 test mode）
2. 在 Supabase 执行 Phase 6 建表 SQL
3. 后端安装 `stripe` 包
4. `backend/src/services/stripe.ts`：
   - `createPaymentIntent(amount, metadata)` — 创建支付意图
   - `handleWebhook(event)` — 处理 Stripe webhook

**环境变量：**
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...  # 给前端
```

**测试：**
- [ ] 能创建 PaymentIntent → 返回 client_secret
- [ ] Stripe Dashboard 显示测试支付

---

### Step 6.2 ⬜ 后端 — 支付流程

**操作：**
1. 修改预约创建流程：
   - Admin 可在服务设置中启用"需要支付"
   - 创建预约时如果需要支付 → 先创建 PaymentIntent → 返回 client_secret
   - 预约状态先设为 `confirmed` + `payment_status: 'pending'`
2. `POST /api/payments/webhook`：
   - 监听 `payment_intent.succeeded` → 更新 `payment_status: 'paid'`
   - 监听 `payment_intent.payment_failed` → 标记失败
3. Admin 可设置支付模式：
   - 全款支付
   - 定金（如 $25）
   - 仅收集卡号（不收费）

**测试：**
- [ ] 需要支付的预约 → 返回 client_secret
- [ ] Stripe 测试卡 4242... → 支付成功 → payment_status 变 paid
- [ ] 失败测试卡 → payment_status 不变
- [ ] Webhook 正确更新数据库

---

### Step 6.3 ⬜ 前端 — 支付界面

**操作：**
1. 安装 `@stripe/stripe-js`, `@stripe/react-stripe-js`
2. 在 BookingPage Step 4 集成 Stripe Elements：
   - 如果服务需要支付 → 显示信用卡输入框
   - 确认支付 → `stripe.confirmPayment()`
   - 支付成功 → 显示成功页
3. MyBookingsPage 显示支付状态

**测试：**
- [ ] 需要支付的服务 → 预约向导显示支付步骤
- [ ] 测试卡支付成功 → 预约完成
- [ ] 不需要支付的服务 → 不显示支付步骤
- [ ] MyBookingsPage 显示正确的支付状态

---

## Phase 7: 实时日历双向同步（增强）

### Step 7.1 ⬜ Google Calendar Webhook

**操作：**
1. `backend/src/services/google-calendar.ts` 扩展：
   - `watchCalendar()` — 注册 Google Calendar push notification
   - `POST /api/calendar/webhook` — 接收 Google Calendar 变更通知
2. 当 Doris 在 Google Calendar 修改/取消事件时：
   - 收到 webhook
   - 查找对应 booking（通过 google_event_id）
   - 同步更新数据库

**注意：** 需要公网 HTTPS 端点。部署到 Railway 后才能测试。

**测试：**
- [ ] 部署后注册 webhook → Google 返回成功
- [ ] Doris 在 Google Calendar 取消事件 → 数据库 booking 状态变 cancelled
- [ ] Doris 修改事件时间 → 数据库同步更新

---

## Phase 8: Recurring Appointments（重复预约）

### Step 8.1 ⬜ 重复预约规则

**操作：**
1. 在 Supabase 执行 Phase 8 建表 SQL
2. `backend/src/routes/recurring.ts`：
   - `POST /api/recurring` — 创建重复规则
   - `GET /api/recurring` — 查看我的重复规则
   - `PATCH /api/recurring/:id` — 修改规则
   - `DELETE /api/recurring/:id` — 停用规则
3. `backend/src/jobs/recurring-generator.ts`：
   - 每天运行一次
   - 查找 active 的 recurring_rules
   - 为未来 N 天（如 14 天）自动创建 booking
   - 跳过已有预约 + 休息日 + 时段冲突

**测试：**
- [ ] 创建"每周二 10:00"规则 → 未来 2 周自动生成 2 个预约
- [ ] 预约的 recurring_rule_id 关联正确
- [ ] 休息日跳过，不生成
- [ ] 时段冲突跳过，不生成

---

### Step 8.2 ⬜ 前端 — 重复预约管理

**操作：**
1. BookingPage 新增选项："Make this a recurring appointment"
   - 选择频率：每周 / 每两周 / 每月
2. MyBookingsPage 显示重复预约标记
3. 重复预约管理页面：
   - 查看/编辑/停用重复规则
   - 查看从规则生成的所有预约
   - 单次例外：取消某次但不影响规则

**测试：**
- [ ] 创建重复预约 → 规则保存 + 预约自动生成
- [ ] 修改频率 → 后续预约按新频率生成
- [ ] 停用规则 → 不再生成新预约
- [ ] 取消单次 → 规则不受影响，下次仍生成

---

## Phase 9: 部署上线

### Step 9.1 ⬜ 后端部署（Railway）

**操作：**
1. 创建 `backend/Dockerfile`
2. Railway 连接 GitHub repo → 设置 root directory = backend
3. 配置环境变量
4. 部署 → 获取公网 URL

**测试：**
- [ ] Railway URL + `/api/health` → 返回 ok
- [ ] 前端配置 VITE_API_URL 为 Railway URL → API 调用正常

---

### Step 9.2 ⬜ 前端部署（Vercel）

**操作：**
1. 创建 `frontend/vercel.json`（SPA rewrite）
2. Vercel 连接 GitHub → 设置 root directory = frontend
3. 配置环境变量（VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL）
4. 部署

**测试：**
- [ ] Vercel URL → 网站正常显示
- [ ] 登录 → 预约 → 全流程跑通

---

### Step 9.3 ⬜ DNS 迁移

**操作：**
1. 移除 GitHub Pages 的 CNAME
2. 在域名注册商把 www.dogsinfashion.com 指向 Vercel
3. Vercel 添加自定义域名 + 自动 HTTPS

**测试：**
- [ ] www.dogsinfashion.com → 新网站
- [ ] HTTPS 正常
- [ ] 所有功能端到端正常

---

## 环境变量汇总

### frontend/.env.local
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:3001
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### backend/.env
```env
PORT=3001
NODE_ENV=development

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google Calendar
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
DORIS_CALENDAR_ID=dogsinfashionca@gmail.com

# Email
DORIS_EMAIL=dogsinfashionca@gmail.com
SMTP_USER=dogsinfashionca@gmail.com
SMTP_PASS=<gmail-app-password>

# SMS (Twilio)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DORIS_PHONE=+19162871878

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# CORS
FRONTEND_URL=http://localhost:5173
```
