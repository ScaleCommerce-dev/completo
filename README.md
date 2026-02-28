<p align="center">
  <img src="docs/logo.jpg" width="480" alt="Completo — All the Toppings. None of the Mess." />
</p>

<p align="center">
  <a href="https://github.com/ScaleCommerce-dev/completo/releases"><img src="https://img.shields.io/github/v/release/ScaleCommerce-dev/completo?style=flat-square&color=6366f1" alt="Release"></a>
  <a href="https://github.com/ScaleCommerce-dev/completo/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ScaleCommerce-dev/completo?style=flat-square&color=6366f1" alt="License"></a>
  <a href="https://github.com/ScaleCommerce-dev/completo/pkgs/container/completo"><img src="https://img.shields.io/badge/ghcr.io-completo-6366f1?style=flat-square&logo=docker&logoColor=white" alt="Docker"></a>
</p>

---

A self-hosted project board for teams who just want to get things done. Named after the legendary Chilean hot dog, piled high with everything: avocado, tomato, mayo, sauerkraut. Your project starts the same way — tasks stacked, ideas overflowing, endless opinions. Too much of everything. Completo helps you make sense of the chaos. No setup marathons, no learning curve. Just open a board and go.

### Free. Open Source. One command.

Completo costs nothing. Zero. Nil. `undefined`. It's MIT licensed — fork it, break it, fix it, ship it. No hosted plans. No premium tier. No "let's schedule a call to discuss pricing."

To install completo, the only thing you need is Node:

```bash
git clone https://github.com/ScaleCommerce-dev/completo.git
cd completo
npm install
npm run build
```

That's it. No Kubernetes manifests. No 14-step setup guide written by someone who clearly hates you. SQLite is baked in — there's no database to provision, no connection string to fumble. Start it. Open your browser. Drag. Drop. Completo.

Or if containers are your thing:

```bash
docker run -p 3000:3000 \
  -e NUXT_SESSION_PASSWORD=$(openssl rand -base64 32) \
  -v completo-data:/data \
  ghcr.io/scalecommerce-dev/completo:latest
```

One command. One container. Demo data included. Open `localhost:3000` and log in with `demo@example.com` / `demo1234` or `admin@example.com` / `admin1234`.

### Why it exists

Because every ticket system starts as "we just need something simple" and ends as a mass of gantt charts, resource leveling matrices, and a 200-page admin guide that nobody reads, maintained by nobody, understood by nobody.

You didn't want that. You wanted a board with columns and cards. So that's what we built. And then we stopped.

### What it does

- **Boards** — Create as many as you need. Configure the columns yourself. Done.
- **Cards** — Title. Description. Assignee. Priority. Drag it. That's the feature list.
- **Projects** — Separate your work. Invite your team. Keep things tidy.
- **My Tasks** — One checklist. Everything assigned to you. Across all projects. Check it off. Go home.
- **SSO** — Sign in with your existing identity provider. No new password to forget and then reset and then forget again.

### What it doesn't do

Gantt charts. Time tracking. Burndown charts. Sprint velocity. Story points. Epics. Dependencies. Custom fields. Webhooks. Integrations. Blockchain-based task verification.

You're welcome.

### Configuration

The only required environment variable is `NUXT_SESSION_PASSWORD` (min 32 characters). Everything else is optional and falls back to sensible defaults.

| Variable | What it does | Default |
|----------|-------------|---------|
| `NUXT_SESSION_PASSWORD` | Session encryption key (required) | — |
| `DATABASE_URL` | SQLite database path | `sqlite.db` |
| `UPLOAD_DIR` | File attachment storage | `data/uploads` |
| `SMTP_HOST` | SMTP server for email (empty = email disabled) | — |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_FROM` | Sender address | — |
| `APP_URL` | Public URL (used in emails) | — |
| `AI_PROVIDER` | `anthropic`, `openai`, or `openrouter` (empty = AI disabled) | — |
| `NUXT_OAUTH_GITHUB_CLIENT_ID/SECRET` | GitHub OAuth (empty = disabled) | — |
| `NUXT_OAUTH_GOOGLE_CLIENT_ID/SECRET` | Google OAuth (empty = disabled) | — |
| `NUXT_OAUTH_MICROSOFT_CLIENT_ID/SECRET` | Microsoft OAuth (empty = disabled) | — |

### CLI commands

Manage your instance from the command line. All commands work with both `npm run` and `pnpm`.

```bash
# Database
pnpm db:migrate          # Apply pending migrations (production)
pnpm db:seed             # Seed demo data (demo + admin users, sample project)
pnpm db:cleanup          # Remove expired sessions and soft-deleted data

# User management
pnpm user:create <email> <password> [name] [admin]   # Create a user ("admin" = admin role)
pnpm user:set-role <email> <admin|user>               # Promote or demote a user
pnpm user:verify-email <email>                        # Manually verify a user's email
```

### The philosophy

Your board should be empty at the end of the week. That's it. That's the philosophy. Every feature in Completo exists to help you get there faster. Everything that doesn't was never added in the first place.

All the toppings. None of the mess.


