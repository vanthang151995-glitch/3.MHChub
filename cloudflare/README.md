# MHChub Cloudflare Tunnel

Cloudflare Tunnel is not configured for this workspace.

Current intended mode is LAN/internal access through the MHChub Windows service. Do not expose this app publicly until the API, CORS, authentication, rate limits, and document download routes are reviewed for the target public hostname.

Recommended local checks before any future tunnel setup:

- `npm run verify`
- `npm run ops:health -- -BaseUrl http://127.0.0.1:3333 -StrictReady`
- Review `.env` without printing secrets.
- Confirm `ALLOWED_ORIGINS` and `TRUST_PROXY` for the public hostname.

