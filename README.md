# Homey Alarm.com App (Unofficial)

**Status:** PoC / example. Uses the community library `node-alarm-dot-com` (screen-scraping). Not affiliated with or supported by Alarm.com. Use at your own risk.

## Features
- Poll panel state every 60s (configurable)
- Flow triggers: **Alarm became armed**, **Alarm became disarmed**
- Flow **condition**: **Alarm state is ...** (armed / partially armed / disarmed)
- Flow actions: Arm Away/Stay & Disarm (**with** and **without PIN**)
- Dashboard controls: tile toggle (Away/Disarm), Mode dropdown (Disarmed/Stay/Away)
- Buttons in device view: Arm Stay, Arm Away

## Requirements
- Homey CLI installed: `npm i -g homey`
- Node.js 16 or 18 (Homey apps run on Node 16+/18+)

## Configure provider / region (e.g., Guarda Alarm, Sweden)
- In **Device Settings**, set **Provider** to the base host you use to log in on the web/app. Examples:
  - `www.alarm.com` (default North America)
  - `www.alarm.com/Europe` (EU portal)
  - A dealer-branded subdomain like `something.alarm.com` if your account uses one
- Tip: Open your Alarm.com web login page and copy the domain path before `/login` — paste that into **Provider**.

> For Guarda Alarm (Sweden), use the same host your mobile/web login redirects to. If unsure, leave Provider blank first; if login fails, set it to the EU portal path shown above.

## Develop & run
```bash
npm install
homey app run