# Card Print Agent

A small background app that runs on the Windows PC connected to your printer.
It listens on your local WiFi network for print jobs sent from a phone or
browser (like Card Print Studio) and sends them straight to the printer's
queue — no print dialog, no touching the PC.

## How it fits together

```
Phone/browser (Card Print Studio)
        |  sends: page image + exact size (mm) + copies
        v
This PC Agent (runs on the printer's PC)
        |  builds an exact-size PDF, calls the OS print queue
        v
Printer (connected to this PC by USB cable)
```

The printer itself doesn't need WiFi — only this PC needs to be on the same
WiFi network as the phone. No internet connection or cloud server is
required for this setup.

## Setup (Windows)

1. **Install Node.js** (LTS version) from https://nodejs.org if you don't
   already have it.
2. **Copy this whole `pc-agent` folder** onto the PC connected to the
   printer.
3. **Open Command Prompt** in this folder (Shift + right-click inside the
   folder → "Open PowerShell/Command window here").
4. Run:
   ```
   npm install
   ```
5. Start the agent:
   ```
   npm start
   ```
6. The console will print something like:
   ```
   Card Print Agent is running on port 3000
   Open this from a phone on the SAME WiFi network:
     http://192.168.1.5:3000/test.html
   ```
   Note that IP address/URL — that's what your phone will use.
7. **Windows Firewall** will likely pop up asking to allow Node.js network
   access — click **Allow access** (Private networks is enough).
8. Keep this Command Prompt window open — closing it stops the agent.
   (Later, this can be set up to run automatically in the background /
   on startup, once you're happy it works.)

## Testing it

1. On a phone connected to the **same WiFi**, open the URL from step 6,
   e.g. `http://192.168.1.5:3000/test.html`.
2. It should say "✅ Connected to agent".
3. Upload a test image, set width/height in mm, pick a printer if you have
   more than one, and tap **Send to printer**.
4. It should print immediately with no dialog appearing on the PC.

If the phone can't reach the page at all, double check:
- Both devices are on the exact same WiFi network (not phone data / a
  guest network that isolates devices from each other)
- Windows Firewall allowed the connection in step 7
- You copied the IP address correctly (it can change if the PC reconnects
  to WiFi — re-check the console output if it stops working)

## What's next

Once this test page confirms printing works end-to-end, the next step is
pointing Card Print Studio's own "Print" buttons at this same agent
(`POST /print`) instead of opening the browser's print dialog — so the
whole flow becomes: scan on phone → adjust in Studio → tap Print → it just
comes out of the printer.

## API reference (for that next step)

- `GET /health` → `{ ok: true, time }`
- `GET /printers` → `{ printers: [{name, ...}], default: "Printer Name" }`
- `POST /print` — body:
  ```json
  {
    "imageDataUrl": "data:image/png;base64,....",
    "widthMM": 139.7,
    "heightMM": 88.9,
    "copies": 2,
    "printer": "Optional Printer Name"
  }
  ```
  The image should be the **already fully composed page** at its final
  layout (exactly what Card Print Studio currently sends to the browser's
  print dialog) — this agent just needs to know its physical size in mm.
