# Head Clear

A concussion-recovery companion app — daily rhythm checklist, exercise-dose
symptom scoring, and a return-to-sport ladder tracker. Installable to an
iPhone home screen as a PWA, works offline, all data stays on-device.

Live: https://REPLACE-ME.github.io/head-clear/

`docs/` — the app itself (served via GitHub Pages).
`worker/` — a small Cloudflare Worker that sends the twice-daily reminder
push notifications (8am / 8pm Africa/Johannesburg), deployed separately via
`wrangler deploy` from inside `worker/`.
