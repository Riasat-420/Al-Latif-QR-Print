# QR Print MVP — Product & Technical Plan

**Goal:** Replicate the qrseprint.in / qrtoprint.in flow — customer scans a QR,
adjusts their print in a mobile web "studio," submits it, and a Windows tray
app at the shop shows an Accept/Reject notification and prints — **without**
any payment feature, built on top of what's already working (Card Print
Studio's editor + the PC Agent's silent-print logic).

---

## 1. Scope

### In scope for MVP
- Single shop (your own printer/business) — not multi-tenant yet
- QR → mobile web studio → **scan (camera, auto edge-detect + perspective correction) or upload** → choose a size (ID card / A6 / Registration / full page presets, or free-form Custom) → edit (drag/resize/rotate, front+back) → settings (paper size, color/B&W, copies, orientation) → submit
- Windows system-tray Print Agent: polls for jobs, shows Accept/Reject notification, prints on accept
- Job status visible to the customer (pending → accepted → printed)
- **Browser dashboard** (password-protected, for you/the operator): job history with thumbnails, print/fail/reject counts, delete a saved document, reprint, or reopen in the editor before reprinting
- Uploaded files kept for a retention window (not deleted immediately) so the dashboard has something to show — see §7 for the privacy trade-off this creates

### Explicitly out of scope for MVP
- Payment/wallet/UPI integration
- Multi-shop / white-label / reseller features
- Auto-detection of document type (ID card vs A6 vs full page) — manual selection only
- Any customer-facing login/account system — QR link is the only access control on that side
- Advanced analytics (charts, exports, revenue-style reporting) — the dashboard is counts + a list, not a BI tool

---

## 2. User Flows

### Customer flow
1. Scan QR on shop counter → opens the Web Studio in their phone browser
2. **Scan or upload**: live camera view with an auto-detected document outline overlay (like CamScanner), or pick an existing photo/PDF. Scanned shots get auto-cropped, perspective-corrected, and de-skewed; a "retake" and manual corner-drag adjustment are always available in case detection guesses wrong
3. **Pick a size**: ID card, A6, Registration card, full page (A4/Letter), or **Custom** (free-form) — same preset-vs-custom choice already in Card Print Studio, so nothing about the existing editor gets removed
4. Editor screen: crop/position/rotate/resize (front + back if applicable), add more items if needed
5. Settings: paper size, color or B&W, copies, orientation
6. Review preview → **Submit**
7. Status screen: "Waiting for shop to accept" → "Printing…" → "Done — please collect your print"

### Shop operator flow
1. Print Agent runs in the system tray on the shop PC (starts on Windows boot)
2. New job arrives → tray notification pops up with a thumbnail + settings summary
3. Operator clicks **Accept** (prints immediately) or **Reject** (with an optional reason)
4. Tray icon reflects state (idle / job waiting / printing)
5. Anytime, from any browser: open the **dashboard**, log in, see today's/all jobs with status, counts of printed/failed/rejected, and per-job actions (view, delete, reprint, edit-then-reprint)

---

## 3. System Architecture

```
┌─────────────┐      HTTPS       ┌───────────────────────┐
│  Customer's │ ───────────────▶ │  Backend (Hostinger)   │
│  phone      │ ◀─────────────── │  Node.js + Express      │
│  (Web Studio)│   status polls   │  MySQL (jobs, shop)     │
└─────────────┘                  │  File storage (temp)    │
                                  └───────────┬────────────┘
                                              │ HTTPS (outbound only,
                                              │ agent polls every few sec)
                                  ┌───────────▼────────────┐
                                  │  Print Agent (Windows)  │
                                  │  System tray app        │
                                  │  - polls for jobs        │
                                  │  - Accept/Reject UI      │
                                  │  - builds exact-size PDF │
                                  │  - sends to printer      │
                                  └───────────┬────────────┘
                                              │ USB
                                  ┌───────────▼────────────┐
                                  │       Printer            │
                                  └──────────────────────────┘
```

**Key design decision:** the Agent makes *outbound* HTTP requests to the
backend (polling) — nothing needs to reach *into* the shop's PC. This is why
qrseprint-style tools work from "any Windows PC with internet," no port
forwarding, no same-WiFi requirement. Avoids WebSockets, which are fragile on
shared/managed Node hosting.

---

## 4. Components

### 4.1 Web Studio (customer-facing)
Adapts the **Custom mode** editor already built in `card-print-studio.html`
(Fabric.js drag/resize/rotate/flip/border/opacity canvas) into a hosted,
multi-step mobile flow that submits to the backend instead of printing
locally. Reuses:
- The Fabric.js canvas editor logic
- PDF.js for scanned-PDF uploads
- The exact-size-page export approach (`canvas.toDataURL` at a defined mm size)
- **The Step 1 size-preset choice (ID card / A6 / Registration / Custom)**
  stays exactly as-is — Custom still opens the free-form canvas, presets
  still use the guided flow. This new scan step just changes *what* feeds
  into that existing choice, not the choice itself.

New work: step navigation (scan/upload → size → edit → settings → review →
status), camera capture, and swapping the final "Print" button for a
`POST /api/jobs` call.

### 4.1a Document scanning (CamScanner-style)
This is the main new front-end capability. Two realistic library choices,
both run entirely client-side (no server round-trip, works offline once
loaded):

| Library | Size | Notes |
|---|---|---|
| **Scanic** | ~100KB gzipped, WASM, ~10ms transforms | Newer project (explicitly "inspired by jscanify"), much lighter — better fit for mobile data connections. Optional ML corner-detector for tricky photos. Smaller community so far. |
| **jscanify** | Depends on OpenCV.js (~8–30MB) | Mature, 1,600+ GitHub stars, widely used, well-documented. The size cost is real on mobile — OpenCV.js needs to load before scanning works. |

**Recommendation**: start with **Scanic** for the live-camera scan screen —
the tiny footprint matters a lot on a phone browser over mobile data, and
its feature set (edge detection, deskew, perspective correction) covers
everything CamScanner-style scanning needs for this use case. Keep jscanify
in mind as a fallback if Scanic's detection proves unreliable in testing —
it's the more battle-tested option at the cost of a much heavier download.

**Scan screen behavior:**
1. Live camera preview with a real-time outline drawn around the detected
   document edges (both libraries support this)
2. Capture → auto perspective-correct + crop + de-skew
3. Show corrected result with a **"Retake"** button and **draggable corner
   handles** in case the auto-detection missed an edge (both libraries
   expose the detected corner points, so a manual override is a small
   addition, not a separate system)
4. **Document mode toggle**: color / grayscale / high-contrast B&W-enhanced
   — this is a *preview/cleanup* filter on the scan itself (making faint
   text crisper), separate from the color-vs-B&W *print setting* chosen
   later in Settings
5. Feeds directly into the existing size-preset step (Step 1) and editor,
   unchanged


### 4.2 Backend (Hostinger Business — Node.js + MySQL)
Confirmed Hostinger Business hosting supports Node.js web apps (up to 5,
deployed via GitHub or zip through hPanel) plus MySQL is included. Responsible
for:
- Accepting job submissions (image + settings)
- Storing job records and files temporarily
- Serving job status to the customer
- Serving pending jobs to the Agent when it polls
- Deleting files per the retention policy in §7 (auto-purge after the retention window, immediate delete on operator request)

### 4.3 Print Agent (Windows system tray)
Evolves the existing `pc-agent` (Express + pdf-lib + pdf-to-printer) into a
**tray application** instead of a plain background server:
- Polls `GET /api/agent/poll` every few seconds
- On a new job: native Windows notification with thumbnail + summary, Accept/Reject buttons
- On Accept: reuses the existing pdf-lib "build exact-size PDF" + pdf-to-printer "silent print" logic already proven in `server.js`
- On Reject: tells the backend, no print happens
- Tray icon changes state (idle / job waiting / printing / error)

Recommended approach: **Electron**, because its Tray + Notification APIs are
mature and well-documented, and it can be packaged into a normal Windows
installer with `electron-builder`. The actual printing code (pdf-lib +
pdf-to-printer) drops in almost unchanged inside Electron's main process.

### 4.4 QR / shop identity
For MVP with a single shop, this can be as simple as one fixed `shop_token`
embedded in a QR code pointing at `https://yourdomain/s/<shop_token>`. Built
properly from day one anyway (a `shops` table, see below) so it's not a
rewrite if you ever add a second location.

### 4.5 Browser Dashboard (operator-facing)
A second, separate front-end (not customer-visible, not linked from the QR
flow) at something like `https://yourdomain/dashboard`, password-protected.
Screens:

- **Login** — single admin password for MVP (no need for a full user system
  with one shop). Session cookie, not per-request password.
- **Job list** — table/grid of jobs: thumbnail, date/time, status
  (pending/accepted/rejected/printed/failed), size, copies, color mode.
  Filterable by status and date range, newest first.
- **Stats bar** — counts: printed today / this week / all-time, failed count,
  rejected count. Simple totals, not charts — matches "counts + a list," not
  a BI tool, per the scope note above.
- **Per-job actions**:
  - **View** — full-size preview of what was/would be printed
  - **Delete** — removes the file and record immediately (for anything sensitive the operator wants gone before the retention window would normally clear it)
  - **Reprint** — clones the job as a new `pending` entry; the existing Agent poll loop picks it up like any other job, no new Agent-side code needed
  - **Edit then reprint** — opens the Web Studio editor pre-loaded with that job's image and settings, so the operator can nudge size/rotation/copies before resubmitting (reuses the exact same editor customers use — no separate editor to build or maintain)

This reuses the Web Studio's editor and the Agent's existing poll/print
pipeline almost entirely — the genuinely new work is the job-list UI, the
stats query, delete, and the "clone as new job" reprint action.

---

## 5. Data Model (MySQL)

```sql
shops
  id            INT PK
  name          VARCHAR
  token         VARCHAR (in the QR URL)
  agent_key     VARCHAR (secret the tray app authenticates with)
  dashboard_password_hash VARCHAR
  created_at    DATETIME

jobs
  id            INT PK
  shop_id       INT FK -> shops.id
  status        ENUM('pending','accepted','rejected','printed','failed','expired')
  file_path     VARCHAR (temp/retained storage path)
  thumbnail_path VARCHAR (small preview for the dashboard job list)
  width_mm      DECIMAL
  height_mm     DECIMAL
  copies        INT
  color_mode    ENUM('color','bw')
  paper_size    VARCHAR
  reject_reason VARCHAR (nullable)
  reprint_of    INT (nullable FK -> jobs.id — links a reprint back to its original)
  created_at    DATETIME
  updated_at    DATETIME
  printed_at    DATETIME (nullable)
  expires_at    DATETIME
```

Still a two-table schema — the dashboard doesn't need its own tables, just a
few more columns on `jobs` plus a password hash on `shops`.

---

## 6. API Design

**Customer-facing**
- `GET /api/shop/:token` → shop name + allowed paper sizes (validates the QR)
- `POST /api/jobs` → `{shop_token, imageDataUrl, widthMM, heightMM, copies, colorMode, paperSize}` → returns `{job_id}`
- `GET /api/jobs/:job_id/status` → `{status}` (polled by the status screen)

**Agent-facing** (authenticated with `agent_key`)
- `GET /api/agent/poll?shop_token=&agent_key=` → next pending job (if any), including a signed download URL
- `POST /api/agent/jobs/:job_id/accept`
- `POST /api/agent/jobs/:job_id/reject` → `{reason}`
- `POST /api/agent/jobs/:job_id/complete` → `{success, error?}`

**Dashboard-facing** (session auth, after login)
- `POST /api/admin/login` → `{password}` → session cookie
- `GET /api/admin/jobs?status=&from=&to=&page=` → paginated job list with thumbnails
- `GET /api/admin/stats` → `{printedToday, printedTotal, failed, rejected, pending}`
- `DELETE /api/admin/jobs/:id` → deletes file + record
- `POST /api/admin/jobs/:id/reprint` → clones the job as a new `pending` row (picked up by the existing Agent poll — no Agent changes needed)
- `GET /api/admin/jobs/:id` → full job data, used to preload the Web Studio editor for "edit then reprint"

---

## 7. Security & Privacy (MVP level)

- No customer login — the QR link itself is the access control, matching how the reference platforms work
- Agent authenticates with a per-shop secret key (`agent_key`), configured once in the tray app's settings
- Dashboard is password-protected (session cookie after login) — separate credential from the Agent's `agent_key`
- HTTPS via Hostinger's included SSL
- **Retention policy change from the original plan**: earlier this doc said
  "delete files immediately after a job finishes" for privacy. A dashboard
  with history/reprint needs those files to still exist afterward, so the
  policy becomes: **keep files for a configurable retention window (e.g. 14
  or 30 days), auto-purge after that, with a manual Delete button in the
  dashboard for anything the operator wants gone sooner** — the operator
  gets a choice, but the default isn't indefinite storage of ID documents.
  Worth deciding the exact window (see Open Decisions).
- No payment data anywhere, so no PCI/compliance surface to worry about for MVP

---

## 8. Tech Stack Summary

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | Matches the Agent's existing stack; Hostinger Business supports it natively |
| Database | MySQL | Included in Hostinger Business plan |
| Web Studio | Vanilla JS + Fabric.js + PDF.js | Directly reuses `card-print-studio.html`'s working editor |
| Document scanning | Scanic (fallback: jscanify) | Client-side edge detection + perspective correction; tiny footprint suits mobile data |
| Print Agent | Electron | Mature Tray + Notification APIs; wraps the already-working pdf-lib/pdf-to-printer code |
| Agent ↔ Backend | HTTP polling | Robust on shared hosting, avoids WebSocket compatibility issues |

---

## 9. Suggested Additional Options

A few things worth considering alongside the scan step and size selection —
none of these block MVP, flagged here so you can decide what's worth
including now vs. later:

- **Multi-page / multi-item scan sessions** — let the customer scan several
  pages or items (e.g. a 3-page document, or front+back of a card) in one
  sitting before moving to the size/editor step, instead of one scan = one
  session. Natural fit since the editor already supports adding multiple
  images.
- **Low-quality scan warning** — reuse the DPI-check logic already built into
  Card Print Studio's Custom editor; warn before submission if a scan is too
  blurry/low-res to print sharply, rather than the shop discovering it after
  printing.
- **"Original vs corrected" toggle** on the scan result — sometimes
  auto-correction over-crops or misreads a busy background; a one-tap way to
  fall back to the uncorrected photo avoids a full retake.
- **Duplicate-submission guard** — if a customer accidentally taps Submit
  twice, the backend should recognize a near-identical job within a short
  window and warn rather than queue two prints.
- **Simple print-count estimate shown before submit** — even without
  payment, showing "this will print on 2 sheets" avoids surprises for both
  customer and operator.
- **Agent-side daily job log** (just a local text/JSON file, not a full
  dashboard) — cheap to add now, useful if you ever need to answer "did job
  X actually print" without extra infrastructure.

---

## 10. Build Phases

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Card Print Studio (editor) + PC Agent (LAN silent print) | ✅ Done |
| 1 | This plan — architecture, data model, API contract | ✅ Done |
| 2 | Backend on Hostinger: `shops`/`jobs` tables, job submission + status + agent-poll APIs, retention/cleanup job | 🔲 Next |
| 3 | Web Studio: adapt the editor into a hosted step-flow that submits to the backend | 🔲 |
| 3a | Scan step: integrate Scanic (camera edge-detect + perspective correction), feed into the existing size-preset/Custom choice | 🔲 |
| 4 | Electron Print Agent: tray icon, poll loop, Accept/Reject notification, wire in the existing print logic | 🔲 |
| 5 | QR generation + end-to-end test at the actual shop/printer | 🔲 |
| 6 | Browser dashboard: login, job list + stats, delete, reprint, edit-then-reprint | 🔲 |
| 7 (post-MVP) | Auto-detect paper size, multi-shop support, payments (if ever wanted), analytics/exports | Later |

---

## 11. Open Decisions

A few things worth deciding before Phase 2 starts:

1. **Poll interval** — every 3–5 seconds is a reasonable default (near-instant
   for the operator, low enough load for shared hosting). Faster = snappier,
   slower = lighter on the server.
2. **File size limits** — what's the largest scan/photo you expect customers
   to upload? Sets the upload limit and storage cleanup urgency.
3. **Job expiry** — how long should an unaccepted job wait before it's
   auto-expired and removed (e.g. 15–30 minutes)?
4. **Reject reasons** — free text, or a short fixed list ("blurry scan",
   "wrong size", "printer out of paper")?
5. **Scan library pick** — comfortable starting with Scanic given its size
   advantage, or would you rather begin with the more battle-tested jscanify
   despite the heavier OpenCV.js download?
6. **Retention window** — how long should printed/rejected job files stay
   available for reprint/history before auto-purge? (14 and 30 days are both
   reasonable defaults — this mostly trades off storage usage on Hostinger
   against how far back "reprint" can reach.)
7. **Dashboard access** — a single shared admin password is enough for MVP
   with one operator; flag now if you'll actually have multiple staff who
   need their own logins, since that's a bigger change to design for later
   than to build in from the start.

None of these block starting Phase 2 — they're small config values, not
architecture decisions.
