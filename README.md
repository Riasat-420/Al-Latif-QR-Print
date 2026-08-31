# 🖨️ Al-Latif QR Print MVP

Complete QR-to-Print workflow system: Customer scans counter QR code ➔ opens mobile Web Studio on phone ➔ scans/uploads & customizes document ➔ submits job ➔ Windows Tray Print Agent notifies shop operator & executes silent printing via connected printer.

---

## 🏗️ Architecture & Folders

- **`backend/`**: Node.js + Express REST API, MySQL database integration, file storage, auto-cleanup cron, and admin sessions.
- **`web-studio/`**: Customer-facing mobile web application (Fabric.js canvas, PDF.js support, camera capture, multi-step print setup).
- **`dashboard/`**: Shop operator web dashboard for viewing print statistics, managing jobs, downloading previews, reprinting, and deleting history.
- **`print-agent/`**: Windows Electron system tray application that polls backend for pending jobs, triggers native Windows notifications, and executes silent noscale printing.
- **`pc-agent/`**: Standalone local LAN Express print agent reference.

---

## 🚀 Deployment on Hostinger (via GitHub)

### 1. Database Setup (Hostinger MySQL)
1. Go to **hPanel** ➔ **Databases** ➔ **MySQL Databases**.
2. Create a new database (e.g. `u123456789_qrprint`) and database user.
3. Open **phpMyAdmin** for that database.
4. Import / execute the SQL queries from [`backend/schema.sql`](backend/schema.sql).

### 2. Node.js Application Setup (Hostinger hPanel)
1. In hPanel, go to **Websites** ➔ **Manage** ➔ **Node.js**.
2. Connect your GitHub repository: `https://github.com/Riasat-420/Al-Latif-QR-Print`.
3. Set **Application Root**: `backend` (or root if using root npm scripts).
4. Set **Application Startup File**: `src/server.js`.
5. Set **Node.js Version**: 18.x or 20.x.
6. Configure Environment Variables in hPanel (or create `backend/.env`):
   ```env
   PORT=3000
   NODE_ENV=production
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_NAME=your_db_name
   SESSION_SECRET=generate_a_long_random_secret_here
   UPLOAD_DIR=uploads
   MAX_FILE_SIZE_MB=10
   POLL_INTERVAL_HINT_SEC=5
   JOB_EXPIRY_MINUTES=30
   RETENTION_DAYS=14
   SHOP_NAME="Al-Latif Print Shop"
   DASHBOARD_PASSWORD="YourSecureAdminPassword"
   ```
7. Click **Deploy** / **Install Dependencies** (`npm install`).
8. Run the database seed once: `node src/seed.js` to create the initial shop record and generate your `shop_token` and `agent_key`.

---

## 🖥️ Print Agent Setup (Shop PC)

1. On the Windows PC connected to the printer, clone or download the `print-agent/` folder.
2. Open terminal in `print-agent/` and install dependencies:
   ```bash
   npm install
   npm start
   ```
3. In the Settings window that appears:
   - **Server URL**: `https://yourdomain.com`
   - **Agent Key**: The `agent_key` output by `node backend/src/seed.js`
   - **Printer**: Select your connected physical printer (or leave default)
4. To build a standalone `.exe` installer:
   ```bash
   npm run build
   ```
