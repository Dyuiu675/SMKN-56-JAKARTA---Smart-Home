let mqttClient = null;

let state = {
  online: false,

  // Vehicle gate (ultrasonic + servo)
  distance: null,
  vehicle: false,
  gate: "CLOSED",

  // Pedestrian / middle gate (touch sensor + servo)
  touchEnabled: false,
  gateMiddle: "CLOSED",

  // LDR -> lampu taman & jalan (satu output gabungan)
  ldrActive: false,
  gardenLamp: false,

  // Lampu garasi (relay, manual only, tanpa sensor)
  garageLamp: false,

  mode: "AUTO"
};

let activities = JSON.parse(localStorage.getItem("smartSchoolActivities") || "[]");
let lastMessageAt = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  $("schoolName").textContent = SCHOOL_CONFIG.schoolName;
  $("heroSchool").textContent = SCHOOL_CONFIG.systemName;
  $("footerSchool").textContent = SCHOOL_CONFIG.schoolName;
  $("schoolLogo").src = SCHOOL_CONFIG.logo;
  $("schoolLogo").addEventListener("error", () => {
    $("schoolLogo").closest(".brand-logo").classList.add("logo-fallback");
  });

  initNavigation();
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(updateFreshness, 1000);
  renderActivities();
  updateUI();
  connectMQTT();

  $("mobileMenu").addEventListener("click", () => {
    document.querySelector(".sidebar").classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (window.innerWidth > 780) return;
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar.classList.contains("open")) return;
    if (sidebar.contains(e.target) || e.target.closest("#mobileMenu")) return;
    sidebar.classList.remove("open");
  });
});

function initNavigation() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      showSection(btn.dataset.section);
      document.querySelector(".sidebar").classList.remove("open");
    });
  });
}

function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  $(name).classList.add("active");
  const nav = document.querySelector(`.nav-btn[data-section="${name}"]`);
  if (nav) nav.classList.add("active");

  const titles = {
    dashboard: "Dashboard",
    control: "Smart Control",
    activity: "Activity Log"
  };
  $("pageTitle").textContent = titles[name] || "Dashboard";
}
window.showSection = showSection;

function updateClock() {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  $("date").textContent = now.toLocaleDateString("id-ID", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
}

function updateFreshness() {
  const el = $("lastUpdate");
  if (!el) return;
  if (!lastMessageAt) { el.textContent = "Menunggu data…"; return; }
  const secs = Math.floor((Date.now() - lastMessageAt) / 1000);
  el.textContent = secs < 2 ? "Baru saja diperbarui" : `Diperbarui ${secs}s lalu`;
}

/* ───────────────────────── MQTT ───────────────────────── */

function connectMQTT() {
  if (!window.mqtt) {
    toast("MQTT.js tidak termuat", "Periksa koneksi internet.");
    return;
  }

  const clientId = `web_${MQTT_CONFIG.deviceId}_${Math.random().toString(16).slice(2, 8)}`;

  setConnection(false, "CONNECTING");

  mqttClient = mqtt.connect(MQTT_CONFIG.url, {
    clientId,
    username: MQTT_CONFIG.username,
    password: MQTT_CONFIG.password,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
    keepalive: 30
  });

  mqttClient.on("connect", () => {
    setConnection(true, "ONLINE");
    Object.values(MQTT_CONFIG.topics).slice(1).forEach(topic => {
      mqttClient.subscribe(topic, { qos: 0 });
    });
    toast("Connected", "Dashboard terhubung ke MQTT broker.");
    addActivity("Dashboard terhubung ke MQTT broker", "system");
  });

  mqttClient.on("message", (topic, payload) => {
    const text = payload.toString();
    try {
      const data = JSON.parse(text);
      handleMQTTMessage(topic, data);
    } catch (e) {
      console.warn("Payload bukan JSON:", text);
    }
  });

  mqttClient.on("reconnect", () => setConnection(false, "RECONNECTING"));
  mqttClient.on("offline", () => setConnection(false, "OFFLINE"));
  mqttClient.on("close", () => setConnection(false, "OFFLINE"));
  mqttClient.on("error", (err) => {
    console.error("MQTT error:", err);
    setConnection(false, "ERROR");
  });
}

function handleMQTTMessage(topic, data) {
  if (topic === MQTT_CONFIG.topics.status || topic === MQTT_CONFIG.topics.sensor) {
    Object.assign(state, data);
    lastMessageAt = Date.now();
  }

  if (topic === MQTT_CONFIG.topics.event) {
    const message = data.message || "Event diterima";
    const type = data.type || (message.toLowerCase().includes("alert") ? "alert" : "event");
    addActivity(message, type);
    toast("System Event", message);
  }

  updateUI();
}

function publishCommand(action, value) {
  if (!mqttClient || !mqttClient.connected) {
    toast("Tidak terhubung", "Pastikan MQTT broker dan internet aktif.");
    return false;
  }
  const payload = JSON.stringify({ action, value });
  mqttClient.publish(MQTT_CONFIG.topics.cmd, payload, { qos: 0, retain: false });
  return true;
}

/* ─────────────────────── Commands ─────────────────────── */

window.sendGate = function (value) {
  if (publishCommand("gate", value)) {
    addActivity(`Perintah gerbang mobil: ${value.toUpperCase()}`, "command");
    toast("Gate Command", `Gerbang mobil ${value === "open" ? "dibuka" : "ditutup"}.`);
  }
};

window.sendMiddleGate = function (value) {
  if (publishCommand("gateMiddle", value)) {
    addActivity(`Perintah gerbang tengah: ${value.toUpperCase()}`, "command");
    toast("Middle Gate", `Gerbang tengah ${value === "open" ? "dibuka" : "ditutup"}.`);
  }
};

window.toggleTouchSensor = function (enabled) {
  if (publishCommand("touch", enabled)) {
    addActivity(`Sensor touch gerbang tengah: ${enabled ? "AKTIF" : "NONAKTIF"}`, "command");
    toast("Touch Sensor", enabled
      ? "Sensor touch diaktifkan — sentuhan akan membuka gerbang tengah."
      : "Sensor touch dinonaktifkan.");
  } else {
    // revert the switch visually if publish failed
    $("touchSwitch").checked = state.touchEnabled;
  }
};

window.toggleGardenLamp = function (enabled) {
  if (publishCommand("gardenLamp", enabled)) {
    addActivity(`Lampu Taman & Jalan: ${enabled ? "ON" : "OFF"}`, "command");
    toast("Lampu Taman & Jalan", enabled ? "Lampu taman & jalan dinyalakan." : "Lampu taman & jalan dimatikan.");
  } else {
    $("gardenLampSwitch").checked = state.gardenLamp;
  }
};

window.toggleGarageLamp = function (enabled) {
  if (publishCommand("garageLamp", enabled)) {
    addActivity(`Lampu Garasi: ${enabled ? "ON" : "OFF"}`, "command");
    toast("Lampu Garasi", enabled ? "Lampu garasi dinyalakan." : "Lampu garasi dimatikan.");
  } else {
    $("garageLampSwitch").checked = state.garageLamp;
  }
};

window.setMode = function (mode) {
  if (publishCommand("mode", mode)) {
    addActivity(`Mode sistem diubah menjadi ${mode}`, "command");
    toast("Mode System", `Sistem sekarang dalam mode ${mode}.`);
  }
};

/* ────────────────────── UI rendering ───────────────────── */

function setConnection(online, label) {
  $("connectionDot").className = `dot ${online ? "online" : "offline"}`;
  $("connectionText").textContent = label;
  state.online = online;
}

function updateUI() {
  const distance = Number(state.distance);
  const distanceText = Number.isFinite(distance) && distance < 900 ? distance.toFixed(1) : "---";

  $("distanceValue").textContent = distanceText;
  $("distanceBig").textContent = distanceText;

  $("vehicleBadge").textContent = state.vehicle ? "VEHICLE" : "CLEAR";
  $("vehicleBadge").className = `badge ${state.vehicle ? "danger" : "neutral"}`;

  $("modeValue").textContent = state.mode || "AUTO";

  // Main vehicle gate
  const gate = (state.gate || "CLOSED").toUpperCase();
  $("gateStatus").textContent = gate;
  $("gateStatusHero").textContent = gate;
  $("controlGateStatus").textContent = gate;
  $("gateDeviceText").textContent = gate === "OPEN" ? "Terbuka" : "Tertutup";
  $("gateArm").classList.toggle("open", gate === "OPEN");
  $("carIcon").classList.toggle("detected", !!state.vehicle);
  $("gateDot").className = `status-dot ${gate === "OPEN" ? "on" : ""}`;

  // Middle / pedestrian gate
  const gateMiddle = (state.gateMiddle || "CLOSED").toUpperCase();
  $("touchStatBadge").textContent = state.touchEnabled ? "ARMED" : "OFF";
  $("touchStatBadge").className = `badge ${state.touchEnabled ? "success" : "neutral"}`;
  $("touchStatValue").textContent = gateMiddle;
  $("middleGateStatus").textContent = gateMiddle;
  $("middleGateDeviceText").textContent = gateMiddle === "OPEN" ? "Terbuka" : "Tertutup";
  $("middleGateDot").className = `status-dot ${gateMiddle === "OPEN" ? "on" : ""}`;
  $("middleGateArm").classList.toggle("open", gateMiddle === "OPEN");
  $("touchPad").classList.toggle("active", !!state.touchEnabled);
  $("touchSwitch").checked = !!state.touchEnabled;
  $("touchControlLabel").textContent = state.touchEnabled ? "ON" : "OFF";
  $("touchHint").textContent = state.touchEnabled
    ? "Sensor aktif — sentuhan akan membuka gerbang tengah."
    : "Sensor nonaktif — sentuhan tidak akan direspons.";

  // LDR sensor
  $("ldrValue").textContent = state.ldrActive ? "GELAP" : "TERANG";
  $("ldrBadge").textContent = state.ldrActive ? "GELAP" : "NORMAL";
  $("ldrBadge").className = `badge ${state.ldrActive ? "warning" : "neutral"}`;

  // Garden & street lamp (LDR-driven, overridable from web)
  $("gardenLampValue").textContent = state.gardenLamp ? "ON" : "OFF";
  $("gardenLampBadge").textContent = state.gardenLamp ? "ON" : "OFF";
  $("gardenLampBadge").className = `badge ${state.gardenLamp ? "success" : "neutral"}`;
  $("gardenLampDeviceText").textContent = state.gardenLamp ? "ON" : "OFF";
  $("gardenLampDot").className = `status-dot ${state.gardenLamp ? "on" : ""}`;
  $("gardenLampSwitch").checked = !!state.gardenLamp;
  $("gardenLampControlLabel").textContent = state.gardenLamp ? "ON" : "OFF";
  $("gardenLampHint").textContent = state.ldrActive
    ? "Sensor gelap — lampu otomatis menyala."
    : "Sensor terang — lampu otomatis mati.";

  // Garage lamp (manual only, relay-actuated)
  $("garageLampValue").textContent = state.garageLamp ? "ON" : "OFF";
  $("garageLampBadge").textContent = state.garageLamp ? "ON" : "OFF";
  $("garageLampBadge").className = `badge ${state.garageLamp ? "success" : "neutral"}`;
  $("garageLampDeviceText").textContent = state.garageLamp ? "ON" : "OFF";
  $("garageLampDot").className = `status-dot ${state.garageLamp ? "on" : ""}`;
  $("garageLampSwitch").checked = !!state.garageLamp;
  $("garageLampControlLabel").textContent = state.garageLamp ? "ON" : "OFF";

  // Mode
  $("autoModeBtn").classList.toggle("selected", state.mode === "AUTO");
  $("manualModeBtn").classList.toggle("selected", state.mode === "MANUAL");
}

/* ─────────────────────── Activity log ─────────────────────── */

function addActivity(message, type = "event") {
  const now = new Date();
  const item = {
    time: now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    date: now.toLocaleDateString("id-ID"),
    message,
    type
  };
  activities.unshift(item);
  activities = activities.slice(0, 80);
  localStorage.setItem("smartSchoolActivities", JSON.stringify(activities));
  renderActivities();
}

const ACTIVITY_DOT_COLOR = {
  command: "#37e7ff",
  system: "#9d5cff",
  event: "#ffd75c"
};

function renderActivities() {
  const targets = [$("activityPreview"), $("activityFull")];

  targets.forEach((target, index) => {
    if (!target) return;
    const list = index === 0 ? activities.slice(0, 5) : activities;

    if (!list.length) {
      target.innerHTML = `<div class="activity-item"><time>--:--</time><span class="activity-bullet"></span><p>Belum ada aktivitas.</p></div>`;
      return;
    }

    target.innerHTML = list.map(item => {
      const color = ACTIVITY_DOT_COLOR[item.type];
      const style = color ? `background:${color};box-shadow:0 0 8px ${color}` : "";
      return `
      <div class="activity-item">
        <time>${item.time}</time>
        <span class="activity-bullet" style="${style}"></span>
        <p>${escapeHtml(item.message)} <small>• ${item.date}</small></p>
      </div>`;
    }).join("");
  });
}

window.clearActivity = function () {
  activities = [];
  localStorage.removeItem("smartSchoolActivities");
  renderActivities();
  toast("Activity Log", "Riwayat aktivitas dihapus dari browser.");
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function toast(title, message) {
  const wrap = $("toastContainer");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.classList.add("out"), 3600);
  setTimeout(() => el.remove(), 4000);
}
