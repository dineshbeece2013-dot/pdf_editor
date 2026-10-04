# PDF Editor Pro

A browser-based PDF editor with optional accounts and Pro subscriptions.

| Layer | Stack |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind + pdf.js |
| Backend | Express 5 + PostgreSQL — see [server/README.md](server/README.md) |

The frontend is a static site. Accounts, subscriptions, payments and admin
permissions are enforced by the API in `server/` — passwords are hashed with
Argon2id, the session is an httpOnly cookie, and payment signatures are
verified server-side.

## Running it locally

```bash
# database
docker compose up -d

# API  (http://127.0.0.1:4000)
cd server && cp .env.example .env && npm install && npm run seed:admin && npm run dev

# frontend (http://localhost:5173, proxies /api to the API)
npm install && npm run dev
```

Full setup, API reference and security notes: [server/README.md](server/README.md).
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## Deployment

PDF Editor Pro is a fully static single-page app: rendering, editing, and PDF export all happen in the browser (pdf.js + pdf-lib), auth state is stored locally, and there are no backend services or `VITE_*` environment variables. Deploying it just means uploading the built `dist/` folder to any static host.

### Build

Requires **Node `^20.19.0 || >=22.12.0`** and npm.

```bash
npm install
npm run lint        # optional: oxlint (should report 0 errors)
npm run build       # tsc -b && vite build -> dist/
npm run preview     # optional: smoke-test the production bundle at http://localhost:4173
```

Deploy **`dist/` as a whole** — it contains the JS/CSS bundles, the pdf.js worker, and `dist/fonts/` (~8 MB of TTFs used both for on-screen font previews and for embedding fonts into exported PDFs). Missing fonts won't crash the app, but exports would silently fall back to Helvetica/Times/Courier.

### Static hosts (Netlify, Vercel, Cloudflare Pages)

Zero config needed:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node version | 20.19+ or 22.12+ (host defaults are fine) |

No redirect/rewrite rules are required — the app is single-route (there is no client-side router).

### nginx

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/pdf-editor-pro/dist;

    location / { try_files $uri /index.html; }

    # Hashed bundles can be cached forever; entry HTML must not be
    location /assets/ { add_header Cache-Control "public, immutable"; }
    location = /index.html { add_header Cache-Control "no-cache"; }

    # Fonts: on-screen previews + PDF export embedding
    location /fonts/ { expires 7d; add_header Cache-Control "public"; }
}
```

### Sub-path hosting (GitHub Pages project sites)

Sites served from a sub-path (e.g. `https://user.github.io/repo/`) must set Vite's `base` so all asset URLs — including the font files fetched during export via `import.meta.env.BASE_URL` — resolve under that prefix:

```bash
npx vite build --base=/repo/
# or: add base: '/repo/' to vite.config.ts, then npm run build
```

Example GitHub Pages workflow (push to `main` → deploy):

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build -- --base=/repo/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4
```

### Deploy-time configuration

- **Login gate:** `AUTH_ENABLED` in `src/config.ts` is baked in at build time and currently ships as `false` (login skipped). Set it to `true` and rebuild to require login.
- **No CORS/API setup:** PDFs, edits, and auth all stay in the user's browser — nothing is uploaded anywhere.

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
