# MarketPulse frontend

React 19 + Vite + TypeScript + react-router + recharts.

## Design direction

"Night Ledger": a dark, quiet trading desk. It uses Kite's dense, keyboard-friendly watchlist, Robinhood's single big number with green/red price motion, and CRED's deep graphite surfaces.
The UI is monochrome (Geist + Geist Mono, off-white on graphite). The only saturated colours carry meaning: green up, coral down, amber for a breached alert.
The full spec (tokens, type scale, spacing, motion, components) is in [DESIGN.md](./DESIGN.md). Screenshots are in [docs/screens](./docs/screens).

## Run

```bash
npm install
npm test          # vitest (API client contract tests)
npm run build     # tsc + vite build
```

**Mock mode** (no backend needed). It is used when `VITE_USE_MOCKS=1` or when `VITE_API_URL` is unset:

```bash
VITE_USE_MOCKS=1 npm run dev        # PowerShell: $env:VITE_USE_MOCKS="1"; npm run dev
```

Any email and password sign you in, and any 6-digit code confirms a sign-up. The data is in-memory sample data: 8 symbols, 30 sessions of half-hourly prices, daily sentiment with headlines and summaries, and three breached alerts. A "Sample data" tag shows in the top bar.

**Real mode** (the default whenever the env vars are set): copy `.env.example` to `.env.local`, fill in `VITE_API_URL`, `VITE_USER_POOL_ID` and `VITE_CLIENT_ID`, and leave `VITE_USE_MOCKS` unset or `0`.

## Kept boundary

- `src/api/client.ts`, `src/api/types.ts`, `src/api/errors.ts` (typed client for `docs/openapi.yaml`, exported as `api`, `createClient`, `ApiError`, `MarketPulseApi`)
- `src/auth/cognito.ts` (Cognito sign-up / sign-in wrapper)
- `src/api/mode.ts` (mock switch)

All data access goes through these. Mocks live only in `src/api/mock/`. To remove them, delete that folder and the `USE_MOCKS` branches in `client.ts` and `cognito.ts`.

Everything else (`src/pages`, `src/ui`, `src/shell`, `src/state`, `src/styles`) is presentation.

## Keyboard

`/` or Ctrl/Cmd+K opens search. In the watchlist, `j`/`k` or the arrow keys move between rows, Enter opens a row and `e` edits its alerts. Esc closes dialogs.
