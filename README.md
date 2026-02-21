# SkiAnimator

Connect your personal Strava account and browse a dashboard of all activities plus winter run animations.

## Features

- Strava OAuth connect/disconnect flow for a single local user.
- Pulls your latest Strava activities and presents a searchable dashboard view.
- Filters activities by sport type and runs by difficulty/search.
- Maps winter activity distance/time/elevation into animated pixel skiers.
- Deterministic fixture fallback when Strava is not configured.
- Deterministic test suite using local fixtures.

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Add Strava credentials in your shell:
   ```bash
   export STRAVA_CLIENT_ID=<your_client_id>
   export STRAVA_CLIENT_SECRET=<your_client_secret>
   ```
3. Start the app:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` and click **Connect Strava**.

> Set your Strava app callback URL to `http://localhost:3000/auth/strava/callback`.

### Configure Strava callback URL (required)

In Strava, open **Settings → My API Application** and set:

- **Authorization Callback Domain**: `localhost`
- App callback URL used by this app: `http://localhost:3000/auth/strava/callback`

Yes, this makes a difference. If the callback domain/URL or your client secret is wrong, Strava OAuth returns to:

- `/?strava=missing-code` (callback mismatch or interrupted auth), or
- `/?strava=auth-error&strava_reason=...` (token exchange failed; reason is included).

## Run tests

```bash
npm test
```

## API notes

- `GET /api/strava/status` — configuration + connection state.
- `GET /api/strava/connect` — returns Strava authorize URL.
- `GET /auth/strava/callback` — OAuth callback route.
- `GET /api/strava/logout` — clear local in-memory token.
- `GET /api/runs` — Strava-mapped winter runs, includes `totalActivities` when connected.
- `GET /api/activities` — all mapped activities for dashboard filtering.
