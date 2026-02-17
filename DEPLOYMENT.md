# Avioscanner Deployment Runbook (Render)

This is the exact setup used for the first production deployment.

## 1) Service Type
- Platform: Render
- Service: Web Service
- Runtime: Node
- Repo: `raymondronglezhu/avioscanner`
- Branch: `master`
- Root Directory: (leave blank)

## 2) Build and Start Commands
- Build Command:
```bash
npm install && npm run build
```
- Start Command:
```bash
npm start
```

## 3) Required Environment Variables
Set these in Render -> Service -> Environment:

- `SEATS_AERO_CLIENT_ID`
- `SEATS_AERO_CLIENT_SECRET`
- `SEATS_AERO_REDIRECT_URI`

Use this redirect URI format:
```text
https://<your-render-service>.onrender.com/api/oauth/callback
```

Also set the same callback URL in your Seats OAuth app configuration.

## 4) Deploy Steps
1. Push changes to `master`.
2. In Render, click `Manual Deploy` -> `Deploy latest commit` (or rely on Auto-Deploy if enabled).
3. Wait for build and start to finish.

## 5) Post-Deploy Checks
- App URL loads (no `Cannot GET /`).
- `GET /api/oauth/status` returns JSON and `"enabled": true` when env vars are set.
- OAuth connect flow opens and returns to the app.

## 6) Common Failure: `Cannot GET /`
Cause: backend is running but frontend assets are not being served.

This repo is already configured to serve `dist` from Express in production.  
If this appears again, verify:
- Build command includes `npm run build`
- Deploy used the latest commit
- Build logs show Vite produced `dist/index.html`

## 7) Secret Hygiene
- If OAuth credentials are ever exposed, rotate `SEATS_AERO_CLIENT_SECRET` in Seats.
- Update Render env var with the new secret and redeploy.
