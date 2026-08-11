let mqttClient = null;
let state = {
  online: false,
  distance: null,
  vehicle: false,
  ir1: false,
  ir2: false,
  gate: "CLOSED",
  lamp1: false,
  lamp2: false,
  security: false,
  alarm: false,
  mode: "AUTO"
};

let activities = JSON.parse(localStorage.getItem("smartSchoolActivities") || "[]");

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  $("schoolName").textContent = SCHOOL_CONFIG.schoolName;
  $("heroSchool").textContent = SCHOOL_CONFIG.systemName;
  $("footerSchool").textContent = SCHOOL_CONFIG.schoolName;

  $("schoolLogo").src = SCHOOL_CONFIG.logo;

  initNavigation();
  updateClock();
  setInterval(updateClock, 1000);
  renderActivities();
  updateUI();
  connectMQTT();

  $("mobileMenu").addEventListener("click", () => {
    document.querySelector(".sidebar").classList.toggle("open");
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
    security: "Security Monitor",
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
  if (topic === MQTT_CONFIG.topics.status) {
    Object.assign(state, data);
  }

  if (topic === MQTT_CONFIG.topics.sensor) {
    Object.assign(state, data);
  }

  if (topic === MQTT_CONFIG.topics.event) {
    const message = data.message || "Event diterima";
    addActivity(message, message.toLowerCase().includes("alert") ? "alert" : "event");
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

window.sendGate = function(value) {
  if (publishCommand("gate", value)) {
    addActivity(`Perintah gerbang: ${value.toUpperCase()}`, "command");
    toast("Gate Command", `Gerbang ${value === "open" ? "dibuka" : "ditutup"}.`);
  }
};

window.toggleLamp = function(number, value) {
  if (publishCommand(`lamp${number}`, value)) {
    addActivity(`Lampu Area ${number}: ${value ? "ON" : "OFF"}`, "command");
  }
};

window.setMode = function(mode) {
  if (publishCommand("mode", mode)) {
    addActivity(`Mode sistem diubah menjadi ${mode}`, "command");
  }
};

window.toggleSecurity = function() {
  const next = !state.security;
  if (publishCommand("security", next)) {
    addActivity(`Security ${next ? "ARMED" : "DISARMED"}`, next ? "security" : "command");
    toast("Security", next ? "Sistem keamanan diaktifkan." : "Sistem keamanan dinonaktifkan.");
  }
};

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

  $("ir1Value").textContent = state.ir1 ? "DETECTED" : "CLEAR";
  $("ir2Value").textContent = state.ir2 ? "DETECTED" : "CLEAR";
  $("ir1Badge").textContent = state.ir1 ? "MOTION" : "NORMAL";
  $("ir2Badge").textContent = state.ir2 ? "MOTION" : "NORMAL";
  $("ir1Badge").className = `badge ${state.ir1 ? "danger" : "neutral"}`;
  $("ir2Badge").className = `badge ${state.ir2 ? "danger" : "neutral"}`;

  $("modeValue").textContent = state.mode || "AUTO";
  $("securityMini").textContent = state.security ? "SECURITY ON" : "SECURITY OFF";
  $("securityMini").className = `badge ${state.security ? "success" : "warning"}`;

  const gate = (state.gate || "CLOSED").toUpperCase();
  $("gateStatus").textContent = gate;
  $("gateStatusHero").textContent = gate;
  $("controlGateStatus").textContent = gate;
  $("gateDeviceText").textContent = gate === "OPEN" ? "Open" : "Closed";

  $("gateArm").classList.toggle("open", gate === "OPEN");
  $("carIcon").classList.toggle("detected", !!state.vehicle);

  $("lamp1Text").textContent = state.lamp1 ? "ON" : "OFF";
  $("lamp2Text").textContent = state.lamp2 ? "ON" : "OFF";
  $("lamp1Dot").className = `status-dot ${state.lamp1 ? "on" : ""}`;
  $("lamp2Dot").className = `status-dot ${state.lamp2 ? "on" : ""}`;
  $("gateDot").className = `status-dot ${gate === "OPEN" ? "on" : ""}`;

  $("securityText").textContent = state.security ? "ARMED" : "DISARMED";
  $("securityDot").className = `status-dot ${state.alarm ? "alert" : state.security ? "on" : ""}`;

  $("lamp1Switch").checked = !!state.lamp1;
  $("lamp2Switch").checked = !!state.lamp2;
  $("lamp1ControlLabel").textContent = state.lamp1 ? "ON" : "OFF";
  $("lamp2ControlLabel").textContent = state.lamp2 ? "ON" : "OFF";

  $("autoModeBtn").classList.toggle("selected", state.mode === "AUTO");
  $("manualModeBtn").classList.toggle("selected", state.mode === "MANUAL");

  updateSecurityUI();
}

function updateSecurityUI() {
  const hero = $("securityHero");

  hero.classList.toggle("armed", state.security && !state.alarm);
  hero.classList.toggle("alert", !!state.alarm);

  if (state.alarm) {
    $("securityHeroTitle").textContent = "SECURITY ALERT";
    $("securityHeroDesc").textContent = "Gerakan terdeteksi! Buzzer sedang aktif.";
    $("alarmTitle").textContent = "ALARM ACTIVE";
    $("alarmText").textContent = "Salah satu sensor IR mendeteksi gerakan.";
    $("alarmIcon").textContent = "🚨";
  } else if (state.security) {
    $("securityHeroTitle").textContent = "SYSTEM ARMED";
    $("securityHeroDesc").textContent = "Sistem keamanan aktif dan memonitor sensor IR.";
    $("alarmTitle").textContent = "SYSTEM ARMED";
    $("alarmText").textContent = "Monitoring keamanan berjalan normal.";
    $("alarmIcon").textContent = "🛡";
  } else {
    $("securityHeroTitle").textContent = "SYSTEM DISARMED";
    $("securityHeroDesc").textContent = "Security mode belum diaktifkan.";
    $("alarmTitle").textContent = "SYSTEM NORMAL";
    $("alarmText").textContent = "Tidak ada aktivitas mencurigakan.";
    $("alarmIcon").textContent = "🔔";
  }

  $("securityButtonText").textContent = state.security ? "DISARM SECURITY" : "ARM SECURITY";
  $("securityButtonIcon").textContent = state.security ? "●" : "◉";
  $("securityButton2").textContent = state.security ? "DISARM SECURITY" : "ARM SECURITY";

  $("securityIr1").textContent = state.ir1 ? "DETECTED" : "CLEAR";
  $("securityIr2").textContent = state.ir2 ? "DETECTED" : "CLEAR";
  $("sensorCircle1").classList.toggle("detected", !!state.ir1);
  $("sensorCircle2").classList.toggle("detected", !!state.ir2);
}

function addActivity(message, type = "event") {
  const now = new Date();
  const item = {
    time: now.toLocaleTimeString("id-ID", {hour:"2-digit", minute:"2-digit", second:"2-digit"}),
    date: now.toLocaleDateString("id-ID"),
    message,
    type
  };

  activities.unshift(item);
  activities = activities.slice(0, 80);
  localStorage.setItem("smartSchoolActivities", JSON.stringify(activities));
  renderActivities();
}

function renderActivities() {
  const targets = [$("activityPreview"), $("activityFull")];

  targets.forEach((target, index) => {
    if (!target) return;

    const list = index === 0 ? activities.slice(0, 5) : activities;

    if (!list.length) {
      target.innerHTML = `<div class="activity-item"><time>--:--</time><span class="activity-bullet"></span><p>Belum ada aktivitas.</p></div>`;
      return;
    }

    target.innerHTML = list.map(item => `
      <div class="activity-item">
        <time>${item.time}</time>
        <span class="activity-bullet" style="${item.type === "alert" ? "background:#ff5470;box-shadow:0 0 8px #ff5470" : ""}"></span>
        <p>${escapeHtml(item.message)} <small>• ${item.date}</small></p>
      </div>
    `).join("");
  });
}

window.clearActivity = function() {
  activities = [];
  localStorage.removeItem("smartSchoolActivities");
  renderActivities();
  toast("Activity Log", "Riwayat aktivitas dihapus dari browser.");
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function toast(title, message) {
  const wrap = $("toastContainer");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
