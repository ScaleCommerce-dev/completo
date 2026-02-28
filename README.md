# Completo

**All the toppings. None of the mess.**

---

Completo is a self-hosted project board for teams who just want to get things done. Named after the legendary Chilean hot dog, piled high with everything: avocado, tomato, mayo, sauerkraut. Your project starts the same way. Tasks stacked, ideas overflowing, endless opinions - too much of everything. Completo's boards help you make sense of the chaos. No setup marathons, no learning curve — just open a board and go. Get your stuff done. Drag. Drop. Completo.

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

### The philosophy

Your board should be empty at the end of the week. That's it. That's the philosophy. Every feature in Completo exists to help you get there faster. Everything that doesn't was never added in the first place.

All the toppings. None of the mess.


