
import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("pos_tracker.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS terminals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT UNIQUE NOT NULL,
    model TEXT DEFAULT 'DX8000',
    batch_name TEXT,
    procured_date TEXT,
    status TEXT DEFAULT 'IN_STOCK',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS issuances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT NOT NULL,
    mid TEXT NOT NULL,
    merchant_name TEXT,
    tid TEXT,
    issue_date TEXT,
    return_date TEXT,
    issued_by TEXT,
    notes TEXT,
    FOREIGN KEY (serial_number) REFERENCES terminals(serial_number)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed default settings if not exists
const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
insertSetting.run("procurement_import_locked", "false");
insertSetting.run("expected_procurement_count", "600");

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  
  // Get Settings
  app.get("/api/stock/settings", (req, res) => {
    const rows = db.prepare("SELECT * FROM settings").all() as { key: string, value: string }[];
    const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
    res.json(settings);
  });

  // Import Terminals
  app.post("/api/stock/import", (req, res) => {
    const { serials, batchName, procuredDate } = req.body;
    
    const isLocked = db.prepare("SELECT value FROM settings WHERE key = 'procurement_import_locked'").get() as { value: string };
    if (isLocked.value === "true") {
      return res.status(403).json({ error: "Procurement import is locked." });
    }

    if (!Array.isArray(serials)) {
      return res.status(400).json({ error: "Invalid data format." });
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    const insertTerminal = db.prepare(`
      INSERT OR IGNORE INTO terminals (serial_number, model, batch_name, procured_date, status)
      VALUES (?, 'DX8000', ?, ?, 'IN_STOCK')
    `);

    const transaction = db.transaction((items) => {
      for (const serial of items) {
        try {
          const result = insertTerminal.run(serial, batchName, procuredDate);
          if (result.changes > 0) {
            imported++;
          } else {
            skipped++;
          }
        } catch (e) {
          errors++;
        }
      }
    });

    transaction(serials);

    // Check if we should lock
    const countResult = db.prepare("SELECT COUNT(*) as count FROM terminals").get() as { count: number };
    const expectedResult = db.prepare("SELECT value FROM settings WHERE key = 'expected_procurement_count'").get() as { value: string };
    
    if (countResult.count >= parseInt(expectedResult.value)) {
      db.prepare("UPDATE settings SET value = 'true' WHERE key = 'procurement_import_locked'").run();
    }

    res.json({ imported, skipped, errors, total: countResult.count });
  });

  // Get Stats
  app.get("/api/stock/stats", (req, res) => {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'IN_STOCK' THEN 1 ELSE 0 END) as in_stock,
        SUM(CASE WHEN status = 'ISSUED' THEN 1 ELSE 0 END) as issued,
        SUM(CASE WHEN status = 'RETURNED' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN status = 'FAULTY' THEN 1 ELSE 0 END) as faulty,
        SUM(CASE WHEN status = 'SCRAPPED' THEN 1 ELSE 0 END) as scrapped
      FROM terminals
    `).get();
    res.json(stats);
  });

  // Get Terminals List
  app.get("/api/stock/terminals", (req, res) => {
    const { status, search } = req.query;
    let query = `
      SELECT t.*, i.mid, i.merchant_name, i.tid, i.issue_date
      FROM terminals t
      LEFT JOIN issuances i ON t.serial_number = i.serial_number AND i.return_date IS NULL
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      query += " AND t.status = ?";
      params.push(status);
    }

    if (search) {
      query += " AND (t.serial_number LIKE ? OR i.mid LIKE ? OR i.merchant_name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  // Issue Terminal
  app.post("/api/stock/issue", (req, res) => {
    const { serial_number, mid, merchant_name, tid, issue_date, issued_by, notes } = req.body;

    const terminal = db.prepare("SELECT status FROM terminals WHERE serial_number = ?").get() as { status: string };
    if (!terminal || terminal.status !== 'IN_STOCK') {
      return res.status(400).json({ error: "Terminal is not available for issuance." });
    }

    const issueTransaction = db.transaction(() => {
      db.prepare("UPDATE terminals SET status = 'ISSUED', updated_at = CURRENT_TIMESTAMP WHERE serial_number = ?").run(serial_number);
      db.prepare(`
        INSERT INTO issuances (serial_number, mid, merchant_name, tid, issue_date, issued_by, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(serial_number, mid, merchant_name, tid, issue_date, issued_by, notes);
    });

    issueTransaction();
    res.json({ success: true });
  });

  // Return Terminal
  app.post("/api/stock/return", (req, res) => {
    const { serial_number, return_date, notes } = req.body;

    const terminal = db.prepare("SELECT status FROM terminals WHERE serial_number = ?").get() as { status: string };
    if (!terminal || terminal.status !== 'ISSUED') {
      return res.status(400).json({ error: "Terminal is not currently issued." });
    }

    const returnTransaction = db.transaction(() => {
      db.prepare("UPDATE terminals SET status = 'IN_STOCK', updated_at = CURRENT_TIMESTAMP WHERE serial_number = ?").run(serial_number);
      db.prepare("UPDATE issuances SET return_date = ?, notes = notes || ? WHERE serial_number = ? AND return_date IS NULL")
        .run(return_date, ` | Return Note: ${notes}`, serial_number);
    });

    returnTransaction();
    res.json({ success: true });
  });

  // Reset Import (Admin)
  app.post("/api/stock/reset", (req, res) => {
    db.transaction(() => {
      db.prepare("DELETE FROM issuances").run();
      db.prepare("DELETE FROM terminals").run();
      db.prepare("UPDATE settings SET value = 'false' WHERE key = 'procurement_import_locked'").run();
    })();
    res.json({ success: true });
  });

  // Sync Assignments from POS List
  app.post("/api/stock/sync-assignments", (req, res) => {
    const { assignments } = req.body;
    if (!Array.isArray(assignments)) {
      return res.status(400).json({ error: "Invalid assignments format." });
    }

    console.log(`[Stock Sync] Starting sync for ${assignments.length} assignments...`);

    let updated = 0;
    let ignored = 0;
    let notFound = 0;

    const syncTransaction = db.transaction((list) => {
      for (const item of list) {
        const { serial, mid, merchantName, tid } = item;
        
        if (!serial) {
          ignored++;
          continue;
        }

        // 1. Check if terminal exists in our stock (case-insensitive and trimmed)
        const terminal = db.prepare("SELECT serial_number, status FROM terminals WHERE UPPER(TRIM(serial_number)) = UPPER(TRIM(?))").get(serial) as { serial_number: string, status: string };
        
        if (terminal) {
          const dbSerial = terminal.serial_number;
          // 2. Check if already issued to this exact MID/TID
          const existing = db.prepare(`
            SELECT id FROM issuances 
            WHERE serial_number = ? AND mid = ? AND tid = ? AND return_date IS NULL
          `).get(dbSerial, mid, tid);

          if (!existing) {
            // Update terminal status
            db.prepare("UPDATE terminals SET status = 'ISSUED', updated_at = CURRENT_TIMESTAMP WHERE serial_number = ?").run(dbSerial);
            
            // Close any other open issuances for this serial (if it moved)
            db.prepare("UPDATE issuances SET return_date = DATE('now'), notes = notes || ' | Auto-closed by POS Sync' WHERE serial_number = ? AND return_date IS NULL").run(dbSerial);

            // Create new issuance
            db.prepare(`
              INSERT INTO issuances (serial_number, mid, merchant_name, tid, issue_date, issued_by, notes)
              VALUES (?, ?, ?, ?, DATE('now'), 'System Sync', 'Imported from Master POS List')
            `).run(dbSerial, mid, merchantName, tid);
            
            updated++;
          } else {
            ignored++;
          }
        } else {
          notFound++;
        }
      }
    });

    try {
      syncTransaction(assignments);
      console.log(`[Stock Sync] Completed: ${updated} updated, ${ignored} ignored, ${notFound} not found in stock.`);
      res.json({ success: true, updated, ignored, notFound });
    } catch (error: any) {
      console.error(`[Stock Sync] Error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Cloud Proxy Endpoints (to bypass CORS)
  app.get("/api/cloud/fetch", async (req, res) => {
    const scriptUrl = process.env.VITE_GOOGLE_SCRIPT_URL;
    if (!scriptUrl) {
      console.error("VITE_GOOGLE_SCRIPT_URL is missing from process.env");
      return res.status(500).json({ error: "VITE_GOOGLE_SCRIPT_URL is not defined in your Secrets/Environment." });
    }

    console.log(`[Proxy] Fetching from Google: ${scriptUrl}`);

    // URL Validation
    if (scriptUrl.includes('docs.google.com/spreadsheets')) {
      return res.status(400).json({ 
        error: "Wrong URL Type", 
        details: "You are using a Google Sheets URL. You must use the 'Web App URL' from the Script Editor (Deploy > New Deployment)." 
      });
    }

    if (!scriptUrl.includes('script.google.com/macros/s/') || !scriptUrl.includes('/exec')) {
      return res.status(400).json({ 
        error: "Invalid Web App URL", 
        details: "The URL must look like 'https://script.google.com/macros/s/.../exec'. Ensure you are not using the '/dev' URL." 
      });
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'GET',
        redirect: 'follow'
      });
      
      const text = await response.text();
      
      if (!response.ok) {
        console.error(`[Proxy] Google returned HTTP ${response.status}`);
        return res.status(response.status).json({ 
          error: `Google Script returned HTTP ${response.status}`,
          details: text.substring(0, 500)
        });
      }

      try {
        // Try to find JSON within the response
        let jsonStr = text.trim();
        const start = jsonStr.indexOf('[');
        const end = jsonStr.lastIndexOf(']');
        
        if (start !== -1 && end !== -1 && start < end) {
          jsonStr = jsonStr.substring(start, end + 1);
        }

        const data = JSON.parse(jsonStr);
        res.json(data);
      } catch (e) {
        console.error("[Proxy] JSON Parse Error. Raw response (first 1000 chars):", text.substring(0, 1000));
        
        if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
          const titleMatch = text.match(/<title>(.*?)<\/title>/);
          const title = titleMatch ? titleMatch[1] : "Unknown Error";
          
          // Check for specific Google error strings
          let specificHint = "Check if 'Who has access' is set to 'Anyone'.";
          if (text.includes('Google Account') || text.includes('Service Login')) {
            specificHint = "Google is asking for a login. You MUST deploy the script with 'Who has access: Anyone'.";
          } else if (text.includes('script not found') || text.includes('404')) {
            specificHint = "The script was not found. Check if the URL is correct and the deployment is active.";
          }

          return res.status(500).json({ 
            error: `Google Error: "${title}"`,
            details: specificHint
          });
        }
        res.status(500).json({ error: "Google Script returned invalid JSON.", details: text.substring(0, 100) });
      }
    } catch (error: any) {
      console.error("[Proxy] Connection Error:", error);
      res.status(500).json({ error: "Failed to connect to Google.", details: error.message });
    }
  });

  app.get("/api/cloud/stock", async (req, res) => {
    const scriptUrl = process.env.VITE_GOOGLE_SCRIPT_URL;
    if (!scriptUrl) return res.status(500).json({ error: "VITE_GOOGLE_SCRIPT_URL is not defined." });

    try {
      const url = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}action=stock`;
      const response = await fetch(url, { method: 'GET', redirect: 'follow' });
      const text = await response.text();
      
      // Basic JSON extraction
      let jsonStr = text.trim();
      const start = jsonStr.indexOf('[');
      const end = jsonStr.lastIndexOf(']');
      if (start !== -1 && end !== -1 && start < end) {
        jsonStr = jsonStr.substring(start, end + 1);
      }
      
      const data = JSON.parse(jsonStr);
      res.json(data);
    } catch (error: any) {
      console.error("[Proxy Stock] Error:", error);
      res.status(500).json({ error: "Failed to fetch stock from cloud.", details: error.message });
    }
  });

  app.post("/api/cloud/sync", async (req, res) => {
    const scriptUrl = process.env.VITE_GOOGLE_SCRIPT_URL;
    if (!scriptUrl) {
      return res.status(500).json({ error: "VITE_GOOGLE_SCRIPT_URL is not defined on server." });
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      
      // Apps Script POST usually returns 200 even if it fails internally, 
      // or it might redirect. fetch handles redirects by default.
      res.json({ success: true });
    } catch (error: any) {
      console.error("Proxy Sync Error:", error);
      res.status(500).json({ error: error.message || "Failed to proxy sync to Google Script" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
