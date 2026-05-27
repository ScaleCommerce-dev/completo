## Quick start

```bash
docker run -p 3000:3000 \
  -e NUXT_SESSION_PASSWORD=$(openssl rand -base64 32) \
  -e ADMIN_USER_EMAIL=admin@yourdomain.com \
  -e ADMIN_USER_PASSWORD=change-this-password \
  -v completo-data:/data \
  ghcr.io/scalecommerce-dev/completo:latest
```

Open `localhost:3000` and log in with the admin email/password you set above. Demo data included.

<details>
<summary>CLI for AI agents</summary>

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/scalecommerce-dev/completo/main/install.sh | sh
```

**Windows:** Download `completo-windows-amd64.exe` from the assets below.

</details>

---

