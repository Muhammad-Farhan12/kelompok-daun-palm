const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const STORAGE_FILE = path.join(__dirname, "pending_storage.json");

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

app.get("/", (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/health", (request, response) => {
  response.json({
    status: "success",
    message: "PALM backend aktif.",
  });
});

app.post("/api/auto-save", async (request, response) => {
  try {
    const entries = request.body && Array.isArray(request.body.entries) ? request.body.entries : null;

    if (!entries) {
      response.status(400).json({
        status: "error",
        message: "Payload auto-save tidak valid. Field entries harus berupa array.",
      });
      return;
    }

    const payload = {
      saved_at: new Date().toISOString(),
      total_entries: entries.length,
      entries,
    };

    await fs.writeFile(STORAGE_FILE, JSON.stringify(payload, null, 2), "utf8");

    response.json({
      status: "success",
      message: "Auto-save berhasil disimpan ke pending_storage.json.",
      saved_at: payload.saved_at,
      total_entries: payload.total_entries,
    });
  } catch (error) {
    console.error("Auto-save gagal:", error);
    response.status(500).json({
      status: "error",
      message: "Auto-save gagal disimpan di backend.",
    });
  }
});

app.get("/api/pending-storage", async (request, response) => {
  try {
    const raw = await fs.readFile(STORAGE_FILE, "utf8");
    response.type("application/json").send(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.json({
        status: "success",
        message: "pending_storage.json belum dibuat.",
        saved_at: null,
        total_entries: 0,
        entries: [],
      });
      return;
    }

    console.error("Gagal membaca pending_storage.json:", error);
    response.status(500).json({
      status: "error",
      message: "Gagal membaca pending_storage.json.",
    });
  }
});

app.use((request, response) => {
  response.status(404).json({
    status: "error",
    message: "Route tidak ditemukan.",
  });
});

app.listen(PORT, () => {
  console.log(`PALM berjalan di http://localhost:${PORT}`);
  console.log("Auto-save endpoint tersedia di POST /api/auto-save");
});
