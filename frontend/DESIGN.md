# MarketPulse design system: "Night Ledger"

## Direction

A dark, quiet trading desk. Kite's density and keyboard flow for the watchlist, Robinhood's single
big number and green/red price motion for the hero, CRED's deep graphite surfaces and confident
type. The interface is monochrome: graphite surfaces, off-white text. The only saturated colour is
**meaning**. Green is up, coral is down, amber is an alert that needs attention. No brand
gradient, no glass, no glow.

Dark is the default. A light theme exists with the same hierarchy (System / Dark / Light in
Settings, stored per browser).

## Tokens (`src/styles/tokens.css`)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0c0d0f` | `#f4f5f6` | page |
| `--surface` | `#131518` | `#ffffff` | panels, rows on hover |
| `--surface-2` | `#1a1d21` | `#eceef0` | inputs, chips, skeletons |
| `--line` | `#25292e` | `#dfe2e6` | hairlines |
| `--line-strong` | `#353a41` | `#c5cad0` | input borders |
| `--text` | `#eceef0` | `#121417` | primary text |
| `--text-2` | `#a4aab2` | `#484e57` | secondary text |
| `--text-3` | `#7e848d` | `#626872` | tertiary, captions (>= 4.5:1 on `--bg`) |
| `--up` | `#3fd49a` | `#0a7a53` | gains, upper side |
| `--down` | `#ff7a66` | `#c2402b` | losses, lower side |
| `--signal` | `#f0b43c` | `#8f5d00` | BREACHED state, attention |
| `--focus` | `--text` | `--text` | 2px focus ring, 2px offset |

The primary button is inverted (off-white on graphite in dark, ink on paper in light). There is
no separate accent hue: the price colours already carry the page.

## Type

- **Geist Variable** for UI and headings. **Geist Mono Variable** for every number in tables,
  thresholds and timestamps. All numerals use `tabular-nums` so columns do not jitter on ticks.
- Scale (px): 12 caption / 13 table / 14 body / 16 lead / 20 h3 / 28 h2 / 44 to 64 hero number
  (fluid `clamp`). Headings weight 600, tracking -0.02em. Hero number weight 500, tracking -0.03em.
- AI summaries use 17px / 1.6 at max 62ch: the one "editorial" moment.

## Spacing and shape

- 4px base. Steps: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius rule: controls (buttons, inputs, segmented) 8px; panels and dialogs 14px; chips full pill.
- Layout max width 1240px, 16px gutter on phones, 32px from 768px up.
- Grouping uses hairlines and space first; a raised panel only when it is a separate object
  (dialog, toast, the detail side panel). Never a card inside a card.

## Motion

- Purpose only: price-tick flash (feedback), dialog/toast enter (state change), skeleton shimmer
  (loading), hover lift on rows (affordance).
- 160 to 240ms, `cubic-bezier(0.16, 1, 0.3, 1)`. Transform and opacity only.
- `prefers-reduced-motion: reduce` turns off flashes, shimmer and transitions entirely.

## Component inventory

- `AppShell` top bar (wordmark, Watchlist / Alerts / Settings, search trigger, demo-data tag);
  bottom tab bar on phones.
- `PriceHero` big number + change line, follows the chart cursor.
- `WatchRow` symbol, price (flash on tick), change, `ThresholdBand`, alert chips, row actions.
- `ThresholdBand` lower to upper track with a price marker; breached side turns amber.
- `AlertChip` UPPER / LOWER with BREACHED (amber, filled) or CLEAR (outlined).
- `SymbolSearch` command dialog (`/` or Ctrl/Cmd+K), debounced, arrow keys + Enter.
- `ThresholdDialog` edit upper / lower with inline validation, server error shown inline.
- `RangeTabs` 1D / 7D / 14D / 30D segmented control (maps to `days` 1/7/14/30).
- `PriceChart` recharts area with threshold reference lines (lazy route chunk).
- `SentimentBars` diverging bars around zero, one per day, selectable.
- `Toasts` transient success / error, error text comes from the API `error` field. Undo on remove.
- `Skeleton` blocks shaped like the final layout; `EmptyState` with a single action.

## Keyboard

`/` or Ctrl/Cmd+K opens search. In the watchlist: Up/Down (or j/k) moves, Enter opens, `e` edits
thresholds. Esc closes dialogs. All interactive elements show a visible focus ring.
