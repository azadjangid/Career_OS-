# CareerOS — AI Career Operating System

A full-stack job search workspace built for Indian developers: track applications on a Kanban board, keep resumes, import jobs from several sources, prepare for interviews with AI feedback, draft recruiter messages, and get reminders before interviews and follow-ups.

## Stack

| Layer | Technology |
|-------|-----------|
| Web | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand |
| API | Node.js 20, Express, TypeScript, Zod |
| Database | PostgreSQL 16 with Prisma |
| Background jobs | BullMQ on Redis 7 (reminders, scheduled job imports, cleanup) |
| AI | Anthropic Claude (or NVIDIA NIM), with tools over the user's own data |
| Auth | 15-minute JWT access tokens in memory, rotating refresh tokens in an httpOnly cookie |
| Email | Nodemailer over SMTP (Mailpit for local development) |
| Files | Private resume storage on local disk or any S3-compatible bucket (AWS S3, Cloudflare R2) |
| Monitoring | Optional Sentry for API and web, JSON logs in production |
| Tests | Vitest + Supertest (API), Vitest + Testing Library (web), Playwright (end to end) |

## Project structure

```
career-os/
├── apps/
│   ├── api/                 Express API and the background worker
│   │   ├── src/server.ts    HTTP server entry
│   │   ├── src/worker.ts    Background worker entry (same code base, separate process)
│   │   ├── src/workers/     Scheduled tasks: reminders, job imports, cleanup
│   │   └── tests/           API tests (run against a real Postgres)
│   └── web/                 React single-page app (served by nginx in Docker)
├── prisma/                  Schema, migrations and the demo seed
├── e2e/                     Playwright end-to-end tests
├── docker/                  Entry point, Caddy config and backup script for Docker
├── docker-compose.yml       Local stack (Postgres, Redis, Mailpit, optional full app)
├── docker-compose.prod.yml  Single-server production stack with HTTPS and backups
└── .env.example             Every setting, documented
```

## Run it locally

You need Node.js 20+ and Docker.

```bash
npm install
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` and `JWT_REFRESH_SECRET` to two different random strings. Generate each with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add `ANTHROPIC_API_KEY` if you want the AI features (everything else works without it).

Start Postgres, Redis and the test mail inbox, then set up the database:

```bash
docker compose up -d postgres redis mailpit
npm run db:generate
npm run db:migrate
npm run db:seed        # optional: demo@careeros.dev / Demo@1234 with sample data
```

Start the API, web app and worker together:

```bash
npm run dev
```

| What | Where |
|------|-------|
| Web app | http://localhost:5173 |
| API | http://localhost:3001/api (health check at `/api/health`) |
| Emails the app sent (password reset, confirmations, reminders) | http://localhost:8025 |

To run the whole stack in containers the way production does, use `docker compose up -d --build` and open http://localhost:8080.

## Tests and checks

```bash
npm run lint           # ESLint for the whole repo
npm run typecheck      # TypeScript for api and web
npm test               # API + web tests
npm run test:e2e       # Playwright: starts the API and web app itself
npm run format         # Prettier (optional, not enforced in CI)
```

API and end-to-end tests need a Postgres database with migrations applied. By default they use `postgresql://careeros:password@localhost:5432/careeros_test`; point `TEST_DATABASE_URL` and `E2E_DATABASE_URL` somewhere else if you like. Create it once with:

```bash
createdb careeros_test
DATABASE_URL=postgresql://careeros:password@localhost:5432/careeros_test npm run db:migrate:prod
```

Every push and pull request runs `.github/workflows/ci.yml`: lint, typecheck, unit and integration tests, a schema/migration drift check, the seed, the Playwright smoke test, and both Docker image builds.

## Deploy to a server

`docker-compose.prod.yml` runs everything on one Linux server: Postgres, Redis, the API, the worker, the web app behind nginx, Caddy for automatic HTTPS, and a nightly database backup.

1. Point your domain's DNS A record at the server and open ports 80 and 443.
2. Install Docker: `curl -fsSL https://get.docker.com | sh`
3. Clone the repo, then `cp .env.example .env.production` and fill in at least `DOMAIN`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SMTP_*` and `EMAIL_FROM`. For resumes, set `STORAGE_PROVIDER=s3` or `r2` and the `S3_*` values so files survive server rebuilds.
4. Start it:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
   ```

Database migrations run automatically when the API container starts (`RUN_MIGRATIONS=false` turns that off if your platform runs `npm run db:migrate:prod` as a release step instead). Check `https://your-domain/api/health`: it returns 200 when the API can reach the database and 503 when it can't, so point your uptime monitor at it.

**Backups.** The `backup` service writes `careeros-YYYYmmdd-HHMM.sql.gz` to the `backups` volume every 24 hours and keeps the newest 14 (`BACKUP_KEEP`). Copy them off the server regularly. To restore:

```bash
docker compose -f docker-compose.prod.yml exec backup sh -c 'ls -1t /backups | head'
docker compose -f docker-compose.prod.yml exec backup sh -c 'gunzip -c /backups/<file>.sql.gz | psql'
```

**Platforms like Railway, Render or Fly.io.** Build `apps/api/Dockerfile` twice: once with the default command (API) and once with the command `worker`. Build `apps/web/Dockerfile` and set `API_UPSTREAM` to the API's internal URL. Use managed Postgres and Redis, and set the same variables as above.

**Error monitoring.** Set `SENTRY_DSN` for the API and worker, and pass `VITE_SENTRY_DSN` as a build argument for the web app. Request bodies, cookies and headers are never sent.

## Background worker

`npm run worker` (or the `worker` container) runs these on a schedule through BullMQ. Times use `SCHEDULER_TZ` (India by default).

| Task | When | What it does |
|------|------|--------------|
| `reminders` | Daily 9:00 | In-app notifications plus one email for interviews in the next 24 hours and due follow-ups. Never repeats a reminder. |
| `job-fetch` | Every 6 hours | For users who turned on automatic fetching, imports new jobs from their chosen sources and tells them. |
| `cleanup` | Daily 3:30 | Removes expired sessions, used or expired links, and read notifications older than 90 days. |
| `search-alerts` | Every 2 hours at :15 | Checks each saved search with alerts on and notifies about new matching jobs above the user's minimum match score. |
| `daily-summary` | Daily 8:30 | Short summary of new matches, due follow-ups and today's interviews (in-app, email if `emailDailySummary` is on). |
| `weekly-report` | Monday 9:00 | Last week's applications, responses and interviews with next steps. |
| `resume-nudges` | Wednesday 11:00 | Suggests updating resumes with a low ATS score or no update in 60 days. |

Each task retries up to 4 times with exponential backoff, never sends the same notice twice (keyed by a reference id), and skips users who paused automation in Settings → Notifications & automation. One user's failure does not stop the others.
Emails only go to confirmed addresses and respect each user's settings.

## Job sources

Pick sources in Settings → Job sources. Each import links back to the original posting.

| Source | Needs |
|--------|-------|
| Remotive, RemoteOK, Arbeitnow | Nothing (free public feeds) |
| Adzuna India | Free `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` from developer.adzuna.com |
| Greenhouse and Lever boards | The company's board name, e.g. `postman` from boards.greenhouse.io/postman |

LinkedIn, Indeed and Naukri have no public job APIs, so they are not included.

## API overview

All routes are under `/api` and, except auth and health, need `Authorization: Bearer <access token>` (or a personal API key starting with `cos_`, created in Settings).

| Area | Routes |
|------|--------|
| Health | `GET /health` (database check), `GET /health/live` |
| Auth | `POST /auth/register`, `/login`, `/logout`, `/refresh`, `/forgot-password`, `/reset-password`, `/verify-email`, `/resend-verification`; `GET /auth/me` |
| Jobs | `GET /jobs`, `/jobs/suggest`, `/jobs/saved`, `/jobs/sources`, `/jobs/:id`, `/jobs/:id/match`; `POST /jobs`, `/jobs/fetch`, `/jobs/:id/save`; `DELETE /jobs/:id/save` |
| Applications | `GET/POST /applications`, `GET /applications/stats`, `GET/PUT/DELETE /applications/:id`, `GET /applications/:id/history`, notes under `/applications/:id/notes`, `POST /applications/:id/interviews`, `POST /applications/bulk/status`, `/bulk/delete` |
| Interviews | `GET /interviews`, `GET /interviews/calendar.ics`, `GET/PUT/DELETE /interviews/:id`, `GET /interviews/:id/calendar.ics`, practice: `POST /interviews/:id/practice`, `POST /interviews/:id/practice/:questionId/answer` |
| Recruiter messages | `GET /recruiter-messages`, `POST /recruiter-messages/draft`, `PUT/DELETE /recruiter-messages/:id` |
| Resumes | `GET/POST /resumes`, `GET/PUT/DELETE /resumes/:id`, `GET /resumes/:id/preview`, `GET /resumes/:id/file` (owner-only download), `POST /resumes/:id/parse`, `/duplicate`, `/set-default`; ATS: `GET /resumes/:id/ats?jobId=`; versions: `GET/POST /resumes/:id/versions`, `GET /resumes/:id/versions/:versionId`, `POST /resumes/:id/versions/:versionId/restore`, `GET /resumes/:id/compare?a=&b=`; `POST /resumes/:id/improve` (AI) |
| AI | `POST /ai/chat`, `/ai/chat/stream`, `/ai/resume-analysis`, `/ai/resume-tailor`, `/ai/job-match`, `/ai/cover-letter`, `/ai/interview-questions`; `POST /ai/career/:task` (`jd_analysis`, `skill_gap`, `roadmap`, `application_help`); conversations under `/ai/conversations`; `GET /ai/usage` |
| Interview prep | `GET /prep/topics`, `GET/POST /prep/sessions`, `GET/DELETE /prep/sessions/:id`, `POST /prep/sessions/:id/questions/:questionId/answer` (AI grading), `.../self-rate`, `POST /prep/sessions/:id/complete` |
| Learning | `GET /learning/paths`, `GET /learning/gaps`, `GET/POST /learning/goals`, `PUT/DELETE /learning/goals/:id`, `POST /learning/roadmap` (AI), `POST /learning/goals/:id/steps/:stepId` (toggle), `POST /learning/goals/:id/complete` |
| Profile and account | `/users/profile` (+ skills, experience, education, projects), `/users/account`, `/users/account/password`, `/users/settings`, `/users/api-key`, `GET /users/export`, `DELETE /users/data` |
| Other | `/notifications`, `/analytics/*`, `GET /search`, `POST /demo/load`, `DELETE /demo` |

AI features need `ANTHROPIC_API_KEY` (or the NVIDIA key). Without one they answer `503 AI_NOT_CONFIGURED` and the app shows a setup message; ATS scoring, version compare, the question bank, learning paths, analytics and automation all work without a key. `AI_RATE_LIMIT_PER_MINUTE` (default 20) limits AI calls per user.

## Security

- Passwords hashed with bcrypt (12 rounds); sign-in timing doesn't reveal which emails exist.
- Access tokens last 15 minutes and live only in memory in the browser. Refresh tokens rotate on every use, are stored only as SHA-256 hashes, sit in an httpOnly `SameSite=Strict` cookie limited to `/api/auth`, and reusing an old one ends every session for that user.
- Password reset and email confirmation links are single-use, expire (1 hour and 24 hours), are stored hashed, and are never logged.
- Resumes are private: no public URLs, the API streams files only to their owner, and uploads are checked by their actual content (PDF or DOCX only, 10 MB max).
- Every query is scoped to the signed-in user, with tests that check users can't read or change each other's data.
- Strict security headers: a `default-src 'none'` CSP on the API, a tight CSP plus `X-Frame-Options`, `nosniff` and HSTS on the web app.
- Rate limits on sign-in, password reset, token refresh, AI calls and the API overall (with correct client IPs behind proxies).
- Security events (sign-in, password changes, exports, API key creation) go to an audit log that users get in their data export.
- The AI never invents experience, never sends anything on the user's behalf, and treats resumes and job descriptions as untrusted input.

## Scripts

```bash
npm run dev              # API + web + worker with reload
npm run build            # Build api and web
npm run lint             # ESLint
npm run typecheck        # TypeScript
npm test                 # API + web tests
npm run test:e2e         # Playwright smoke test
npm run db:generate      # Generate the Prisma client
npm run db:migrate       # Create/apply migrations in development
npm run db:migrate:prod  # Apply migrations (production, CI)
npm run db:seed          # Demo account and sample data (refuses in production)
npm run db:studio        # Browse the database
```

## License

MIT
