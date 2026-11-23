# CareerOS — AI Career Operating System

An AI-powered, full-stack job search platform built for Indian developers. Track applications, analyze resumes, match jobs, and get personalized career coaching from an AI assistant.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| State | TanStack Query + Zustand + React Hook Form + Zod |
| Backend | Node.js + TypeScript + Express.js |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache / Queue | Redis 7 + BullMQ |
| AI | Anthropic Claude (agent with tools over your own data; streaming chat) |
| Auth | JWT access tokens + httpOnly refresh cookies |
| Storage | Local disk → S3/R2 (configurable) |
| Email | Nodemailer (SMTP) |
| Infra | Docker + docker-compose |

---

## Project Structure

```
career-os/
├── apps/
│   ├── api/          # Express.js REST API
│   └── web/          # React SPA
├── workers/          # BullMQ background workers
├── packages/
│   ├── shared/       # Shared utilities
│   ├── types/        # Shared TypeScript types
│   └── config/       # Shared config constants
├── prisma/
│   ├── schema.prisma # 26-model database schema
│   └── seed.ts       # Demo data seeder
├── docker-compose.yml
└── .env.example
```

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- An OpenAI API key

### 1. Clone and install

```bash
git clone <your-repo-url> career-os
cd career-os
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
DATABASE_URL="postgresql://careeros:secret@localhost:5432/careeros"
JWT_SECRET="your-random-32-char-secret"
JWT_REFRESH_SECRET="another-random-32-char-secret"
ANTHROPIC_API_KEY="sk-ant-..."   # Anthropic API key (console.anthropic.com)
AI_MODEL="claude-opus-5-5"       # users can switch model in Settings → AI preferences
REDIS_URL="redis://localhost:6379"
```

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start infrastructure (Postgres + Redis)

```bash
docker-compose up -d postgres redis
```

### 4. Set up database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed with demo data
npm run db:seed
```

Demo user created: `demo@careeros.dev` / `Demo@1234`

### 5. Start development servers

```bash
# Start API + Web in parallel
npm run dev

# Or separately:
npm run dev --workspace=apps/api    # http://localhost:3001
npm run dev --workspace=apps/web    # http://localhost:5173

# Start background workers
npm run dev --workspace=workers
```

---

## Production with Docker

### Full stack (all services)

```bash
# Build and start everything
docker-compose up --build

# Or detached
docker-compose up -d --build
```

Services:
- `web` → http://localhost:80 (Nginx + React SPA)
- `api` → http://localhost:3001
- `workers` → BullMQ background jobs
- `postgres` → port 5432
- `redis` → port 6379

### Environment variables for production

Create a `.env.production` or configure via your hosting provider:

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/careeros
JWT_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<different-strong-random-secret>
AI_API_KEY=sk-...
REDIS_URL=redis://host:6379
SMTP_HOST=smtp.gmail.com
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-password
FRONTEND_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com
```

---

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, get tokens |
| POST | `/api/auth/logout` | Invalidate refresh token |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/forgot-password` | Request reset email |
| POST | `/api/auth/reset-password` | Reset with token |
| GET | `/api/auth/me` | Get current user |

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs` | List jobs (with search + filter) |
| GET | `/api/jobs/:id` | Job details |
| POST | `/api/jobs/:id/save` | Save a job |
| DELETE | `/api/jobs/:id/save` | Unsave a job |
| GET | `/api/jobs/:id/match` | AI match score |

### Applications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/applications` | List applications |
| POST | `/api/applications` | Create application |
| PUT | `/api/applications/:id` | Update status/notes |
| DELETE | `/api/applications/:id` | Delete application |
| GET | `/api/applications/stats` | Pipeline summary |
| POST | `/api/applications/:id/interviews` | Add interview |

### Resumes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/resumes` | List resumes |
| POST | `/api/resumes` | Upload resume (multipart) |
| DELETE | `/api/resumes/:id` | Delete resume |
| POST | `/api/resumes/:id/set-default` | Set as default |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ai/conversations` | List conversations |
| POST | `/api/ai/conversations` | Create conversation |
| GET | `/api/ai/conversations/:id` | Get with messages |
| POST | `/api/ai/conversations/:id/messages` | Send message |
| DELETE | `/api/ai/conversations/:id` | Delete |
| POST | `/api/ai/resume-analysis` | Analyze resume |
| POST | `/api/ai/job-match` | Match job to profile |
| POST | `/api/ai/cover-letter` | Generate cover letter |
| POST | `/api/ai/interview-questions` | Generate interview prep |
| GET | `/api/ai/usage` | AI usage stats |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/dashboard` | Full dashboard data |
| GET | `/api/analytics/applications` | Application stats |
| GET | `/api/analytics/jobs` | Job discovery stats |
| GET | `/api/analytics/ai-usage` | AI consumption |

---

## Background Workers

Workers run independently and process async tasks:

| Queue | Schedule | Job |
|-------|----------|-----|
| `job-fetch` | Every 6 hours | Fetch new jobs from job boards |
| `job-match` | On-demand | AI match scoring for user+job pairs |
| `resume-parse` | On-demand | Extract text + ATS analysis from uploads |
| `notifications` | On-demand | Send emails + create in-app notifications |
| `reminders` | Daily 9am | Interview reminders + stale app nudges |

---

## Security

- **Passwords**: bcrypt with 12 rounds
- **Auth tokens**: JWT HS256 (access: 15min, refresh: 30d, httpOnly cookie)
- **Refresh rotation**: Old token deleted on every refresh
- **Rate limiting**: 100 req/15min global, 10 req/15min auth endpoints
- **Row-level isolation**: Every query scoped to `userId` — users cannot access each other's data
- **Validation**: Zod on both frontend and backend
- **Headers**: Helmet (CSP, HSTS, X-Frame-Options, etc.)
- **CORS**: Allowlist from `ALLOWED_ORIGINS` env var
- **Secrets**: Never in source code; always via environment variables

### What the AI will never do

- Fabricate experience, education, skills, or employment history
- Submit applications without explicit user approval
- Send messages without explicit user authorization
- Bypass CAPTCHA, 2FA, rate limits, or platform ToS
- Expose backend secrets, stack traces, or other users' data

---

## Development Scripts

```bash
# Root workspace
npm run dev              # Start api + web concurrently
npm run build            # Build all packages
npm run db:generate      # npx prisma generate
npm run db:migrate       # npx prisma migrate dev
npm run db:seed          # Run prisma/seed.ts
npm run db:studio        # Open Prisma Studio

# Per workspace
npm run dev --workspace=apps/api
npm run dev --workspace=apps/web
npm run dev --workspace=workers
```

---

## Deployment

### Railway / Render / Fly.io

1. Set all env vars in the dashboard
2. Use the `Dockerfile` in each app directory
3. Run `prisma migrate deploy` as a release command

### VPS (Ubuntu)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone + configure
git clone <repo> && cd career-os
cp .env.example .env && nano .env

# Deploy
docker-compose up -d --build

# Migrate
docker-compose exec api npx prisma migrate deploy
docker-compose exec api npx tsx prisma/seed.ts
```

---

## License

MIT — built by Azad Jangid for the IndiaHacks community.
