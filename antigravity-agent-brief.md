# Reference Brief: Windows Print Agent (Electron)

## What this is
A system-tray Windows app that receives print jobs from a hosted backend
(polling, not WebSockets) and prints them silently — no print dialog, no
manual step on the PC — after the operator taps Accept on a tray
notification.

## Primary reference repo
https://github.com/sudospade/wireless-print
Study this for: its ID-card exact-mm-size printing mode, crop/rotate/scale
handling, manual duplex flow, and how it drives Windows printing from
Node.js. It's MIT licensed. Its own architecture is slightly different
(LAN/tunnel-based, not poll-based) — don't copy the networking approach,
just the printing internals.

## Already-built starting point (attached: pc-agent.zip)
A working Node.js/Express agent already exists that:
- Accepts a page image (PNG/JPEG data URL) + exact width/height in mm + copies
- Builds a PDF at that *exact* physical size using `pdf-lib`
- Sends it to the OS print queue via the `pdf-to-printer` npm package
  (wraps SumatraPDF, confirmed API: `print(pdfPath, { printer, copies,
  scale: 'noscale', silent: true })`)
- Exposes `GET /printers`, `GET /health`, `POST /print`
This printing logic should be reused almost unchanged inside Electron's
main process — it's already tested and working, don't rebuild it from
scratch.

## What needs to be built now
Convert the above into an Electron system-tray app that:
1. Polls a backend endpoint (`GET /api/agent/poll?shop_token=&agent_key=`)
   every 3–5 seconds for a pending job
2. On a new job: native Windows tray notification with a thumbnail +
   settings summary (paper size, copies, color/B&W), with Accept/Reject
   actions
3. On Accept: downloads the job's image, runs it through the existing
   pdf-lib + pdf-to-printer pipeline, then reports back
   (`POST /api/agent/jobs/:id/complete` with success/error)
4. On Reject: reports back with a reason
   (`POST /api/agent/jobs/:id/reject`)
5. Tray icon reflects state: idle / job waiting / printing / error
6. Settings screen: configured printer, shop token, agent key, poll
   interval — stored locally (e.g. `electron-store`)
7. Packaged with `electron-builder` into a Windows installer

## Full system context
This agent is one piece of a larger MVP (QR → mobile web "studio" → this
agent → printer) — full architecture, data model, and API contract are in
the attached `qr-print-mvp-plan.md`. The Agent-facing API section there
(`/api/agent/poll`, `/accept`, `/reject`, `/complete`) is the exact contract
this Electron app needs to implement against.
