# Dogs in Fashion — 基础设施与部署指南

> 最后更新：2026-04-09

---

## 一、系统架构总览

```
用户浏览器
    │
    ▼
┌─────────────────────────────┐
│  Vercel（前端）              │
│  React + Vite + Tailwind    │
│  域名: www.dogsinfashion.com │
└─────────────┬───────────────┘
              │ API 请求
              ▼
┌──────────────────────────────────────────┐
│  Railway（后端）                           │
│  Express + TypeScript                     │
│  域名: dogsinfashion-production.up.railway.app │
└──────┬──────────┬───────────┬────────────┘
       │          │           │
       ▼          ▼           ▼
   Supabase   Google Cal   Gmail SMTP
   (数据库+认证)  (日历同步)   (邮件通知)
```

| 组件 | 平台 | URL |
|------|------|-----|
| **前端** | Vercel | https://dogsinfashion-frontend.vercel.app |
| **后端** | Railway | https://dogsinfashion-production.up.railway.app |
| **数据库 + 认证** | Supabase | https://supabase.com/dashboard |
| **代码仓库** | GitHub | https://github.com/arianapan/dogsinfashion |
| **DNS** | Squarespace | www.dogsinfashion.com |

---

## 二、项目结构

frontend 和 backend 是**完全独立的 npm 项目**（没有 workspace），各自有自己的 `package.json` 和 `package-lock.json`，分别部署到不同平台。

```
dogsinfashion/
├── package.json              # 根目录（仅 concurrently，方便本地同时启动前后端）
├── .npmrc                    # 指定公共 npm 源
├── frontend/                 # → 部署到 Vercel
│   ├── package.json
│   ├── .node-version         # 指定 Node 20
│   ├── vercel.json           # SPA rewrite
│   └── src/
└── backend/                  # → 部署到 Railway
    ├── package.json
    ├── package-lock.json
    ├── railway.toml           # Railway 构建配置
    └── src/
```

---

## 三、自动部署流程

**每次 push 到 `main` 分支，Vercel 和 Railway 都会自动重新部署。**

```
本地改代码 → git commit → git push origin main
                                  │
                    ┌──────────────┼──────────────┐
                    ▼                             ▼
              Vercel 自动构建                Railway 自动构建
              (前端，约30-60秒)              (后端，约1-2分钟)
```

不需要任何手动操作，push 就上线。

---

## 四、Vercel 前端配置

### 构建设置

| 设置项 | 值 |
|--------|-----|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build`（默认） |
| Install Command | `npm install`（默认） |
| Node.js Version | 20.x（通过 `frontend/.node-version`） |

### 环境变量（在 Vercel Dashboard → Settings → Environment Variables）

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `VITE_SUPABASE_URL` | `https://<your-project>.supabase.co` | Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase 公开 key |
| `VITE_API_URL` | `https://dogsinfashion-production.up.railway.app` | 后端地址 |

### 手动重新部署

Vercel Dashboard → Deployments → 最近部署 → `...` → Redeploy

---

## 五、Railway 后端配置

### 构建设置

通过 `backend/railway.toml` 配置：

```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "node dist/index.js"
```

| 设置项 | 值 |
|--------|-----|
| Root Directory | `backend` |
| Builder | Nixpacks |

### 环境变量（在 Railway Dashboard → Variables）

| 变量名 | 说明 |
|--------|------|
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://www.dogsinfashion.com` |
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端密钥 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | GCP Service Account JSON |
| `DORIS_CALENDAR_ID` | 日历 ID（Gmail 地址） |
| `SMTP_USER` / `SMTP_PASS` / `DORIS_EMAIL` | 邮件配置 |

### 手动重新部署

Railway Dashboard → Deployments → Redeploy

---

## 六、本地开发

```bash
# 首次安装依赖
cd frontend && npm install && cd ..
cd backend && npm install && cd ..
npm install    # 根目录只装 concurrently

# 启动（同时启动前端 5173 + 后端 3001）
npm run dev

# 分别启动
npm run dev:fe
npm run dev:be
```

本地环境变量：
- `frontend/.env.local` — 前端（`VITE_API_URL` 留空即可，vite proxy 会转发到 3001）
- `backend/.env` — 后端

这两个文件在 `.gitignore` 中，不会推送到 GitHub。

---

## 七、日常维护

| 操作 | 怎么做 |
|------|--------|
| 改代码上线 | `git commit` → `git push` → 自动部署 |
| 改环境变量 | Railway/Vercel Dashboard → Variables → 修改保存 |
| 查看后端日志 | Railway Dashboard → 服务 → Deployments → View Logs |
| 查看预约数据 | Supabase Dashboard → Table Editor → `bookings` |
| 查看用户 | Supabase Dashboard → Authentication → Users |
| 回滚部署 | Dashboard → Deployments → 找到之前成功的 → Redeploy |

---

## 八、费用

| 平台 | 费用 |
|------|------|
| Vercel | 免费（Hobby plan） |
| Railway | Trial 有 $5 额度，到期后 Hobby plan $5/月 |
| Supabase | 免费（Free tier） |
| Squarespace | 域名续费（已有） |

---

## 九、密钥安全

- `.env` 文件永远不提交到 GitHub（已在 `.gitignore` 中）
- 所有密钥只存在 Railway / Vercel 的环境变量中（加密存储）
- 如果密钥泄露需要轮换：
  - Gmail App Password → https://myaccount.google.com/apppasswords
  - GCP Service Account Key → Google Cloud Console → IAM → Service Accounts
  - Supabase Key → Supabase Dashboard → Settings → API
