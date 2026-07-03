# MVP — fx-scalp-agent

## Goal
EUR/USD intraday agent on **VPS**, 1-second decision loop, path to OANDA tick stream.

## Phase 1 (now) — no broker
- [x] Project structure
- [x] Yahoo EUR/USD 1m/5m/15m
- [x] Regime: trend_up / trend_down / range
- [x] Strategy: 5m trend + 1m EMA9 pullback long
- [x] Simulate SL/TP in pips
- [x] Worker 1s tick
- [x] News blackout + DXY filter
- [x] Journal + /state API
- [ ] 1 week paper journal

## Phase 2 — OANDA demo
- [x] WebSocket pricing stream (code ready)
- [ ] Practice API token configured
- [ ] `FX_TICK_MS=500`
- [ ] Real spread filter
- [ ] Paper orders API

## Phase 3 — VPS production
- [ ] Hetzner London CX22
- [ ] systemd + Docker
- [ ] Telegram alerts

## Risk defaults
- 0.25% / trade
- 1.5% daily stop
- 8 pip TP / 5 pip SL
- Max 15 trades/day
