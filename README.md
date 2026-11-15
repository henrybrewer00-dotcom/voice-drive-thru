# Lily's Drive-Thru 🍔

A voice-powered fast-food drive-thru ordering system. Talk to an AI window
attendant the way you would at a real drive-thru — it takes your order, asks
about sizes, upsells once, applies coupons, reads back a tax-aware total, and
fires a live ticket to a kitchen display.

Built on [ElevenLabs Conversational AI](https://elevenlabs.io/conversational-ai)
for the voice agent, with a tiny Express backend and a vanilla-JS frontend.

## How it works

```
Browser (mic)  ──▶  ElevenLabs agent  ──▶  client tools  ──▶  order panel
     │                                                            │
     └────────────  /api/orders (POST)  ──────────────▶  Kitchen Display (SSE)
```

- **Voice agent** — a McDonald's-style attendant ("Lily") provisioned on
  ElevenLabs. Its system prompt enforces the rules that make it feel human:
  tool-call-before-talk, one upsell max, stop when the customer says "that's
  it", plain speech only (no stage directions leaking into TTS).
- **Client tools** — the agent drives the on-screen order by calling tools
  (`add_item`, `apply_coupon`, `get_order`, `finalize_order`, …). Nothing the
  agent "agrees to" verbally exists until the matching tool fires, so the
  spoken order and the screen never drift apart.
- **Menu** — a realistic burger-joint menu (`menu.js`) with sizes, per-item
  customizations, combo meals, coupons, and an 8.75% tax rate. This is the
  single source of truth for both the agent prompt and the totals math.
- **Kitchen Display** — finalized orders POST to the server and stream to
  `/kitchen.html` over Server-Sent Events, where staff can move tickets through
  `new → in progress → ready → done`.
- **Server** — a minimal Express app whose main job is to serve the frontend,
  expose the menu, hold the in-memory order list, and hand the browser a
  short-lived signed URL so the ElevenLabs API key never leaves the machine.

## Project layout

| File / dir | Purpose |
|---|---|
| `server.js` | Express server: static files, menu API, orders + SSE, signed-URL proxy |
| `provision-agent.js` | Creates/updates the ElevenLabs agent (system prompt + tools) |
| `menu.js` | Menu, customizations, coupons, tax rate — the source of truth |
| `public/index.html`, `app.js`, `styles.css` | Customer-facing voice ordering UI |
| `public/kitchen.html`, `kitchen.js`, `kitchen.css` | Live kitchen display |
| `tests/voice-test.js` | Voice flow test |

## Getting started

### Prerequisites

- Node.js 18+ (uses native `fetch` and ES modules)
- An [ElevenLabs](https://elevenlabs.io) account with a Conversational AI API key

### 1. Install

```bash
npm install
```

### 2. Configure

Create a `.env` file in the project root:

```bash
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
PORT=3010
```

### 3. Provision the agent

This creates (or updates) the ElevenLabs agent from the menu and system prompt,
and writes the resulting `agent_id` to `agent.json`:

```bash
npm run provision
```

### 4. Run

```bash
npm start
```

Then open:

- **Drive-thru:** http://localhost:3010
- **Kitchen display:** http://localhost:3010/kitchen.html

Click to start talking, place an order out loud, and watch the ticket appear on
the kitchen screen.

## Notes

- `.env`, `agent.json`, and `node_modules` are gitignored — your API key and
  agent ID stay on your machine.
- Orders are stored in memory and capped at 50; restarting the server clears
  them. This is a demo, not a POS.

## License

Private / unlicensed — personal project.

---

Built by [Henry Brewer](https://www.henrybrewer.dev), a 14-year-old developer from Austin.
