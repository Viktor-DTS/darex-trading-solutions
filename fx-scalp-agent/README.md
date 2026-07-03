# fx-scalp-agent

Low-latency FX agent for **intraday → scalp** path. Built for **VPS**, not Render.

## Architecture

```
VPS (London / Frankfurt)
├── worker/          ← tick loop (1s → 100ms with OANDA stream)
├── services/
│   ├── market-data/ ← Yahoo (MVP) | OANDA WebSocket (phase 2)
│   ├── analyzer/    ← regime + pullback signal
│   ├── risk/        ← daily limits, position size
│   └── executor/    ← simulate → OANDA orders
└── api/             ← /health /analyze /state
```

## Modes

| Mode | Data | Tick | Target |
|------|------|------|--------|
| `intraday` | Yahoo 1m/5m | 1s poll | +8 pips |
| `scalp` | OANDA stream | sub-second | +3–5 pips (phase 2) |

## Quick start (local)

```bash
cd fx-scalp-agent
cp .env.example .env
npm install
npm run analyze          # one-shot EURUSD analysis
npm start                # worker loop
npm run api              # API on :8787 (separate terminal)
```

## VPS deploy (Hetzner / OVH)

```bash
# Ubuntu 22.04, London region recommended for EUR/USD
git clone <repo> /opt/fx-scalp-agent
cd /opt/fx-scalp-agent
cp .env.example .env
npm install --production

# systemd
sudo cp deploy/fx-agent.service /etc/systemd/system/
sudo systemctl enable fx-agent
sudo systemctl start fx-agent
```

## Environment

See `.env.example`. Key vars:

- `FX_TICK_MS=1000` — worker interval (100–500 when on OANDA)
- `FX_DATA_PROVIDER=yahoo|oanda`
- `FX_MODE=intraday|scalp`

## API

- `GET /health`
- `GET /analyze?pair=EURUSD`
- `GET /state` — worker status (if running)

## Roadmap

1. ✅ Yahoo 1m/5m + regime + simulate
2. ⬜ OANDA demo stream (`FX_DATA_PROVIDER=oanda`)
3. ⬜ Economic calendar blackout
4. ⬜ DXY macro filter
5. ⬜ Journal + dashboard

## No broker account needed for phase 1

Real EUR/USD rates from Yahoo. OANDA demo only when adding live stream + paper orders.
