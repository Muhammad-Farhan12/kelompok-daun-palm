const PALM_CONFIG = Object.freeze({
  pricePerKg: 200,
  lockAfterMinutes: 15,
  maxLocalEntries: 200,
  autoSaveIntervalMs: 30000,
  storageKey: "palm.timbangan.entries.v2",
  backendOrigin: "http://localhost:3000",
});

const ERROR_MESSAGES = Object.freeze({
  invalidWeight: "Berat Kotor harus lebih besar dari Berat Kosong!",
  queueFull: "Penyimpanan lokal penuh! Gagal menyimpan, batas maksimal 200 entri offline tercapai.",
  locked: "Data Locked tidak dapat dimodifikasi atau diedit.",
});

class TimbanganValidator {
  static toFiniteNumber(value, fieldName) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      throw new Error(`${fieldName} harus berupa angka valid.`);
    }

    return parsed;
  }

  static validateWeights(beratKotorKg, beratTaraKg) {
    const gross = this.toFiniteNumber(beratKotorKg, "Berat Kotor");
    const tare = this.toFiniteNumber(beratTaraKg, "Berat Kosong");

    if (gross <= tare) {
      throw new Error(ERROR_MESSAGES.invalidWeight);
    }

    return {
      gross,
      tare,
    };
  }
}

class TimbanganEntry {
  constructor({
    id,
    timestamp_catat,
    berat_kotor_kg,
    berat_tara_kg,
    price_per_kg = PALM_CONFIG.pricePerKg,
    sync_status = "pending",
    is_locked = false,
  }) {
    const weights = TimbanganValidator.validateWeights(berat_kotor_kg, berat_tara_kg);

    this.id = id;
    this.timestamp_catat = timestamp_catat;
    this.berat_kotor_kg = weights.gross;
    this.berat_tara_kg = weights.tare;
    this.price_per_kg = Number(price_per_kg) || PALM_CONFIG.pricePerKg;
    this.berat_bersih_kg = TimbanganEntry.calculateNetto(weights.gross, weights.tare);
    this.upah_rp = TimbanganEntry.calculateUpah(this.berat_bersih_kg, this.price_per_kg);
    this.sync_status = sync_status;
    this.is_locked = Boolean(is_locked);
    this.refreshLockStatus();
  }

  static create({ berat_kotor_kg, berat_tara_kg }) {
    const now = new Date();

    return new TimbanganEntry({
      id: `TRX-${now.getTime()}`,
      timestamp_catat: now.toISOString(),
      berat_kotor_kg,
      berat_tara_kg,
      price_per_kg: PALM_CONFIG.pricePerKg,
      sync_status: "pending",
      is_locked: false,
    });
  }

  static fromObject(record) {
    return new TimbanganEntry({
      id: record.id,
      timestamp_catat: record.timestamp_catat,
      berat_kotor_kg: record.berat_kotor_kg,
      berat_tara_kg: record.berat_tara_kg,
      price_per_kg: record.price_per_kg || PALM_CONFIG.pricePerKg,
      sync_status: record.sync_status || "pending",
      is_locked: record.is_locked,
    });
  }

  static calculateNetto(beratKotorKg, beratTaraKg) {
    return Number((Number(beratKotorKg) - Number(beratTaraKg)).toFixed(2));
  }

  static calculateUpah(beratBersihKg, pricePerKg = PALM_CONFIG.pricePerKg) {
    return Number((Number(beratBersihKg) * Number(pricePerKg)).toFixed(0));
  }

  isLockedAt(now = new Date()) {
    const timestamp = new Date(this.timestamp_catat).getTime();

    if (!Number.isFinite(timestamp)) {
      return true;
    }

    const elapsedMs = now.getTime() - timestamp;
    return elapsedMs > PALM_CONFIG.lockAfterMinutes * 60 * 1000;
  }

  refreshLockStatus(now = new Date()) {
    this.is_locked = this.is_locked || this.isLockedAt(now);
    return this.is_locked;
  }

  assertEditable() {
    this.refreshLockStatus();

    if (this.is_locked) {
      throw new Error(ERROR_MESSAGES.locked);
    }
  }

  updateWeights({ berat_kotor_kg, berat_tara_kg }) {
    this.assertEditable();

    const weights = TimbanganValidator.validateWeights(berat_kotor_kg, berat_tara_kg);
    this.berat_kotor_kg = weights.gross;
    this.berat_tara_kg = weights.tare;
    this.berat_bersih_kg = TimbanganEntry.calculateNetto(weights.gross, weights.tare);
    this.upah_rp = TimbanganEntry.calculateUpah(this.berat_bersih_kg, this.price_per_kg);
    this.sync_status = "pending";
  }

  forceTimestamp(timestamp) {
    this.timestamp_catat = timestamp;
    this.refreshLockStatus();
  }

  toJSON() {
    this.refreshLockStatus();

    return {
      id: this.id,
      timestamp_catat: this.timestamp_catat,
      berat_kotor_kg: this.berat_kotor_kg,
      berat_tara_kg: this.berat_tara_kg,
      price_per_kg: this.price_per_kg,
      berat_bersih_kg: this.berat_bersih_kg,
      upah_rp: this.upah_rp,
      sync_status: this.sync_status,
      is_locked: this.is_locked,
    };
  }
}

class LocalStorageRepository {
  constructor(storageKey) {
    this.storageKey = storageKey;
  }

  getAll() {
    const raw = window.localStorage.getItem(this.storageKey);

    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((item) => TimbanganEntry.fromObject(item));
    } catch (error) {
      return [];
    }
  }

  saveAll(entries) {
    const serialized = entries.map((entry) => entry.toJSON());
    window.localStorage.setItem(this.storageKey, JSON.stringify(serialized));
  }

  normalize() {
    const entries = this.getAll();
    this.saveAll(entries);
    return entries;
  }

  add(entry) {
    const entries = this.normalize();

    if (entries.length >= PALM_CONFIG.maxLocalEntries) {
      throw new Error(ERROR_MESSAGES.queueFull);
    }

    this.saveAll([entry, ...entries]);
  }

  update(entryId, updater) {
    const entries = this.normalize();
    let found = false;

    const nextEntries = entries.map((entry) => {
      if (entry.id !== entryId) {
        return entry;
      }

      found = true;
      entry.assertEditable();
      updater(entry);
      return entry;
    });

    if (!found) {
      throw new Error("Data tidak ditemukan.");
    }

    this.saveAll(nextEntries);
  }

  clear() {
    window.localStorage.removeItem(this.storageKey);
  }
}

class AutoSaveService {
  constructor({ repository, endpoint, statusElement, onSuccess, onError }) {
    this.repository = repository;
    this.endpoint = endpoint;
    this.statusElement = statusElement;
    this.onSuccess = onSuccess;
    this.onError = onError;
    this.intervalId = null;
  }

  async save({ manual = false } = {}) {
    const entries = this.repository.normalize().map((entry) => entry.toJSON());
    this.statusElement.textContent = "Menyimpan...";

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entries }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText || "Auto-save gagal."}`);
      }

      const result = await response.json();

      if (result.status !== "success") {
        throw new Error(result.message || "Auto-save gagal.");
      }

      const savedAt = result.saved_at ? new Date(result.saved_at) : new Date();
      this.statusElement.textContent = `Tersimpan ${savedAt.toLocaleTimeString("id-ID")}`;

      if (manual) {
        this.onSuccess(result.message);
      }
    } catch (error) {
      this.statusElement.textContent = "Gagal auto-save";
      this.onError(`Auto-save gagal: ${error.message}`);
    }
  }

  start() {
    window.clearInterval(this.intervalId);
    this.intervalId = window.setInterval(() => {
      this.save();
    }, PALM_CONFIG.autoSaveIntervalMs);
  }
}

class PalmApp {
  constructor() {
    this.repository = new LocalStorageRepository(PALM_CONFIG.storageKey);
    this.elements = this.collectElements();
    this.autoSaveService = new AutoSaveService({
      repository: this.repository,
      endpoint: this.resolveBackendUrl("/api/auto-save"),
      statusElement: this.elements.autoSaveStatus,
      onSuccess: (message) => this.showAlert(message, "success"),
      onError: (message) => this.showAlert(message, "error"),
    });
  }

  collectElements() {
    return {
      form: document.getElementById("entryForm"),
      grossInput: document.getElementById("grossInput"),
      tareInput: document.getElementById("tareInput"),
      priceDisplay: document.getElementById("priceDisplay"),
      nettoPreview: document.getElementById("nettoPreview"),
      wagePreview: document.getElementById("wagePreview"),
      alertBox: document.getElementById("alertBox"),
      entriesTableBody: document.getElementById("entriesTableBody"),
      emptyState: document.getElementById("emptyState"),
      totalNettoToday: document.getElementById("totalNettoToday"),
      totalWage: document.getElementById("totalWage"),
      pendingCount: document.getElementById("pendingCount"),
      capacityStatus: document.getElementById("capacityStatus"),
      autoSaveStatus: document.getElementById("autoSaveStatus"),
      timeTravelBtn: document.getElementById("timeTravelBtn"),
      autoSaveNowBtn: document.getElementById("autoSaveNowBtn"),
      clearBtn: document.getElementById("clearBtn"),
    };
  }

  init() {
    this.elements.priceDisplay.textContent = this.formatCurrency(PALM_CONFIG.pricePerKg);
    this.bindEvents();
    this.updatePreview();
    this.render();
    this.checkBackendHealth();
    this.autoSaveService.start();

    window.setInterval(() => {
      this.render();
    }, 1000);
  }

  bindEvents() {
    this.elements.form.addEventListener("submit", (event) => this.handleSubmit(event));

    [this.elements.grossInput, this.elements.tareInput].forEach((input) => {
      input.addEventListener("input", () => this.updatePreview());
    });

    this.elements.entriesTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='edit']");

      if (button) {
        this.handleEdit(button.dataset.id);
      }
    });

    this.elements.timeTravelBtn.addEventListener("click", () => this.simulateTimeTravel());
    this.elements.autoSaveNowBtn.addEventListener("click", () => this.autoSaveService.save({ manual: true }));
    this.elements.clearBtn.addEventListener("click", () => this.clearLocalData());
  }

  resolveBackendUrl(path) {
    const isExpressOrigin =
      window.location.hostname === "localhost" &&
      window.location.port === "3000" &&
      window.location.protocol.startsWith("http");

    if (isExpressOrigin) {
      return path;
    }

    return `${PALM_CONFIG.backendOrigin}${path}`;
  }

  async checkBackendHealth() {
    try {
      const response = await fetch(this.resolveBackendUrl("/api/health"));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.elements.autoSaveStatus.textContent = "Backend aktif";
    } catch (error) {
      this.elements.autoSaveStatus.textContent = "Backend belum aktif";
      this.showAlert("Backend Express belum aktif. Jalankan `node server.js` lalu buka http://localhost:3000.", "error");
    }
  }

  handleSubmit(event) {
    event.preventDefault();

    try {
      const entry = TimbanganEntry.create({
        berat_kotor_kg: this.elements.grossInput.value,
        berat_tara_kg: this.elements.tareInput.value,
      });

      this.repository.add(entry);
      this.elements.form.reset();
      this.updatePreview();
      this.render();
      this.showAlert("Data timbangan tersimpan sebagai antrean pending di LocalStorage.", "success");
    } catch (error) {
      this.showAlert(error.message, "error");
    }
  }

  handleEdit(entryId) {
    const entries = this.repository.normalize();
    const entry = entries.find((item) => item.id === entryId);

    if (!entry) {
      this.showAlert("Data tidak ditemukan.", "error");
      return;
    }

    if (entry.is_locked) {
      this.showAlert(ERROR_MESSAGES.locked, "error");
      return;
    }

    const nextGross = window.prompt("Masukkan Berat Kotor / Bruto (Kg):", entry.berat_kotor_kg);

    if (nextGross === null) {
      return;
    }

    const nextTare = window.prompt("Masukkan Berat Truk Kosong / Tara (Kg):", entry.berat_tara_kg);

    if (nextTare === null) {
      return;
    }

    try {
      this.repository.update(entryId, (record) => {
        record.updateWeights({
          berat_kotor_kg: nextGross,
          berat_tara_kg: nextTare,
        });
      });
      this.render();
      this.showAlert("Data timbangan berhasil diperbarui.", "success");
    } catch (error) {
      this.showAlert(error.message, "error");
    }
  }

  simulateTimeTravel() {
    const entries = this.repository.normalize();

    if (entries.length === 0) {
      this.showAlert("Belum ada data untuk disimulasikan.", "error");
      return;
    }

    const editableEntries = entries
      .filter((entry) => !entry.is_locked)
      .sort((first, second) => new Date(first.timestamp_catat) - new Date(second.timestamp_catat));
    const target = editableEntries[0];

    if (!target) {
      this.showAlert("Semua data sudah Locked. Tambahkan data baru untuk simulasi.", "error");
      return;
    }

    const simulatedTimestamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    this.repository.update(target.id, (entry) => {
      entry.forceTimestamp(simulatedTimestamp);
    });

    this.render();
    this.showAlert(`Data ${target.id} disetel menjadi 20 menit lalu dan kini Locked.`, "success");
  }

  clearLocalData() {
    if (!window.confirm("Kosongkan semua data lokal PALM?")) {
      return;
    }

    this.repository.clear();
    this.render();
    this.showAlert("Data lokal berhasil dikosongkan.", "success");
  }

  updatePreview() {
    try {
      if (!this.elements.grossInput.value || !this.elements.tareInput.value) {
        this.elements.nettoPreview.textContent = this.formatKg(0);
        this.elements.wagePreview.textContent = this.formatCurrency(0);
        return;
      }

      const weights = TimbanganValidator.validateWeights(
        this.elements.grossInput.value,
        this.elements.tareInput.value
      );
      const netto = TimbanganEntry.calculateNetto(weights.gross, weights.tare);
      const upah = TimbanganEntry.calculateUpah(netto);

      this.elements.nettoPreview.textContent = this.formatKg(netto);
      this.elements.wagePreview.textContent = this.formatCurrency(upah);
    } catch (error) {
      this.elements.nettoPreview.textContent = "-";
      this.elements.wagePreview.textContent = "-";
    }
  }

  render() {
    const entries = this.repository.normalize();
    this.renderDashboard(entries);
    this.renderTable(entries);
  }

  renderDashboard(entries) {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayEntries = entries.filter((entry) => entry.timestamp_catat.slice(0, 10) === todayKey);
    const totalNettoToday = todayEntries.reduce((sum, entry) => sum + entry.berat_bersih_kg, 0);
    const totalWage = entries.reduce((sum, entry) => sum + entry.upah_rp, 0);
    const pendingCount = entries.filter((entry) => entry.sync_status === "pending").length;

    this.elements.totalNettoToday.textContent = this.formatKg(totalNettoToday);
    this.elements.totalWage.textContent = this.formatCurrency(totalWage);
    this.elements.pendingCount.textContent = `${pendingCount} Pending`;
    this.elements.capacityStatus.textContent = `${entries.length} / ${PALM_CONFIG.maxLocalEntries}`;
  }

  renderTable(entries) {
    this.elements.entriesTableBody.innerHTML = "";
    this.elements.emptyState.classList.toggle("hidden", entries.length > 0);

    entries
      .slice()
      .sort((first, second) => new Date(second.timestamp_catat) - new Date(first.timestamp_catat))
      .forEach((entry) => {
        const row = document.createElement("tr");
        row.className = entry.is_locked ? "bg-red-50/40" : "hover:bg-slate-50";
        row.innerHTML = this.buildRowTemplate(entry);
        this.elements.entriesTableBody.appendChild(row);
      });
  }

  buildRowTemplate(entry) {
    const lockClass = entry.is_locked
      ? "bg-red-100 text-red-700 ring-1 ring-red-200"
      : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
    const editClass = entry.is_locked
      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100";
    const lockLabel = entry.is_locked ? "Locked (Merah)" : "Editable (Hijau)";

    return `
      <td class="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">${this.escapeHtml(entry.id)}</td>
      <td class="whitespace-nowrap px-4 py-3 text-slate-600">${this.formatDateTime(entry.timestamp_catat)}</td>
      <td class="whitespace-nowrap px-4 py-3 text-right">${this.formatKg(entry.berat_kotor_kg)}</td>
      <td class="whitespace-nowrap px-4 py-3 text-right">${this.formatKg(entry.berat_tara_kg)}</td>
      <td class="whitespace-nowrap px-4 py-3 text-right font-semibold">${this.formatKg(entry.berat_bersih_kg)}</td>
      <td class="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-700">${this.formatCurrency(entry.upah_rp)}</td>
      <td class="whitespace-nowrap px-4 py-3">
        <span class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold uppercase text-amber-700 ring-1 ring-amber-200">${this.escapeHtml(entry.sync_status)}</span>
      </td>
      <td class="whitespace-nowrap px-4 py-3">
        <span class="rounded-full px-2.5 py-1 text-xs font-bold ${lockClass}">${lockLabel}</span>
      </td>
      <td class="whitespace-nowrap px-4 py-3 text-right">
        <button data-action="edit" data-id="${this.escapeHtml(entry.id)}" class="rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${editClass}" ${entry.is_locked ? "disabled" : ""}>
          Edit
        </button>
      </td>
    `;
  }

  showAlert(message, type) {
    const isError = type === "error";
    this.elements.alertBox.textContent = message;
    this.elements.alertBox.className = isError
      ? "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
      : "rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800";
    this.elements.alertBox.classList.remove("hidden");

    window.clearTimeout(this.alertTimeoutId);
    this.alertTimeoutId = window.setTimeout(() => {
      this.elements.alertBox.classList.add("hidden");
    }, 5000);
  }

  formatKg(value) {
    return `${Number(value).toLocaleString("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} Kg`;
  }

  formatCurrency(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Number(value));
  }

  formatDateTime(isoString) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(isoString));
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new PalmApp();
  app.init();
});
