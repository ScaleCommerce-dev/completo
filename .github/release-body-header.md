## Quick start

```bash
docker run -p 3000:3000 \
  -e NUXT_SESSION_PASSWORD=$(openssl rand -base64 32) \
  -v completo-data:/data \
  ghcr.io/scalecommerce-dev/completo:latest
```

Open `localhost:3000` — demo data included.

<details>
<summary>CLI for AI agents</summary>

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/scalecommerce-dev/completo/main/install.sh | sh
```

**Windows:** Download `completo-windows-amd64.exe` from the assets below.

</details>

---

