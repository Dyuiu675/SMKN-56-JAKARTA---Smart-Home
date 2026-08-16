/* ═════════════════════════════════════════════════════════════════
   SMART SCHOOL HOME — CONTROLLER & APPLICATION LOGIC
   SMKN 56 JAKARTA — IoT Smart Campus
═════════════════════════════════════════════════════════════════ */

/* ── 🔐 CREDENTIALS & CONSTANTS ── */
const AUTH_USERNAME = "56Jakarta";
const AUTH_PASSWORD = "56TMK08!";
const AUTH_STORAGE_KEY = "smartSchool_auth_session";
const SOUND_STORAGE_KEY = "smartSchool_sound_enabled";

/* ── 📊 APPLICATION STATE ── */
let mqttClient = null;
let soundEnabled = localStorage.getItem(SOUND_STORAGE_KEY) !== "false";
let packetCount = 0;
let currentActivityFilter = "all";
let currentActivitySearch = "";

let state = {
  online: false,

  // Vehicle gate (Ultrasonic monitors distance + gate state).
  // ultrasonicEnabled = mode otomatis: gerbang buka sendiri saat objek
  // terdeteksi, tetap terbuka selama objek ada, lalu tutup ±5 detik
  // setelah objek menghilang. Kalau false, gerbang murni manual (tombol).
  distance: 45.0,
  vehicle: false,
  gate: "CLOSED",
  ultrasonicEnabled: false,

  // Pedestrian / middle gate (Touch sensor + dual servo).
  // touchEnabled = mode otomatis: sentuh sensor untuk toggle buka/tutup.
  touchEnabled: false,
  gateMiddle: "CLOSED",

  // LDR sensor & Garden/Street Lamp
  ldrActive: false,     // reading: true = Gelap, false = Terang
  ldrEnabled: false,    // sensor auto-mode armed/disarmed
  gardenLamp: false,    // current lamp state (ON/OFF)

  // Garage lamp (Relay actuated, manual only)
  garageLamp: false
};

let activities = JSON.parse(localStorage.getItem("smartSchoolActivities") || "[]");
let lastMessageAt = null;
let clockInterval = null;
let freshnessInterval = null;

const $ = (id) => document.getElementById(id);

/* ═════════════════════════════════════════════════════════════════
   🚀 APPLICATION LIFECYCLE & INITIALIZATION
═════════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Setup School Branding
  const schoolCfg = getSchoolConfig();
  if (schoolCfg) {
    if ($("schoolName")) $("schoolName").textContent = schoolCfg.schoolName;
    if ($("heroSchool")) $("heroSchool").textContent = schoolCfg.systemName;
    if ($("footerSchool")) $("footerSchool").textContent = schoolCfg.schoolName;
    if ($("schoolLogo")) {
      $("schoolLogo").src = schoolCfg.logo;
      $("schoolLogo").addEventListener("error", () => {
        const wrap = $("brandLogoWrap");
        if (wrap) wrap.classList.add("logo-fallback");
      });
    }
  }

  // 2. Setup Sound Feedback UI
  updateSoundUI();
  const soundBtn = $("soundToggleBtn");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled);
      updateSoundUI();
      playSound("click");
      toast(soundEnabled ? "Audio Aktif" : "Audio Dimatikan", soundEnabled ? "Efek suara UI diaktifkan." : "Efek suara UI dinonaktifkan.");
    });
  }

  // 3. Setup Diagnostics Modal Trigger
  const connPill = $("connectionPill");
  if (connPill) connPill.addEventListener("click", openDiagnosticsModal);

  // 4. Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
    }
    // Switch tabs with 1, 2, 3 when not typing in an input
    if (!["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      if (e.key === "1") showSection("dashboard");
      if (e.key === "2") showSection("control");
      if (e.key === "3") showSection("activity");
    }
  });

  // 5. Initialize Auth Listeners & Check Saved Session
  initAuth();

  const savedUser = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (savedUser) {
    unlockApp(savedUser, false);
  } else {
    lockApp();
  }
});

/* ═════════════════════════════════════════════════════════════════
   🔊 WEB AUDIO SYNTHESIZER (No External Files Required)
═════════════════════════════════════════════════════════════ */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "click") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === "open") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === "close") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.18);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === "touch") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.08); // A5
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === "alert") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.setValueAtTime(600, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === "lamp") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, now); // E5
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch (err) {
    console.debug("Audio play error:", err);
  }
}

function updateSoundUI() {
  const onIcon = $("soundOnIcon");
  const offIcon = $("soundOffIcon");
  if (onIcon && offIcon) {
    onIcon.classList.toggle("hidden", !soundEnabled);
    offIcon.classList.toggle("hidden", soundEnabled);
  }
}

/* ═════════════════════════════════════════════════════════════════
   🔐 AUTHENTICATION & LOGIN CONTROLLER
═════════════════════════════════════════════════════════════════ */

function initAuth() {
  const authForm = $("authForm");
  const authPasswordToggle = $("authPasswordToggle");
  const authForgotBtn = $("authForgotBtn");
  const sidebarLogoutBtn = $("sidebarLogoutBtn");
  const userInput = $("authUsernameInput");
  const passInput = $("authPasswordInput");

  if (authForm) {
    authForm.addEventListener("submit", handleLogin);
  }

  if (userInput) userInput.addEventListener("input", hideAuthError);
  if (passInput) passInput.addEventListener("input", hideAuthError);

  if (authPasswordToggle) {
    authPasswordToggle.addEventListener("click", () => {
      const passInput = $("authPasswordInput");
      const eyeIcon = $("eyeIcon");
      const eyeOffIcon = $("eyeOffIcon");
      if (!passInput) return;

      const isPass = passInput.type === "password";
      passInput.type = isPass ? "text" : "password";
      if (eyeIcon) eyeIcon.classList.toggle("hidden", isPass);
      if (eyeOffIcon) eyeOffIcon.classList.toggle("hidden", !isPass);
      playSound("click");
    });
  }

  if (authForgotBtn) {
    authForgotBtn.addEventListener("click", () => {
      playSound("click");
      toast("Info Akun", "Kredensial login bersifat rahasia. Hubungi administrator sistem sekolah untuk mendapatkan akses.");
    });
  }

  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener("click", handleLogout);
  }
}

async function handleLogin(e) {
  e.preventDefault();

  const userInput = $("authUsernameInput");
  const passInput = $("authPasswordInput");
  const rememberMe = $("authRememberMe");
  const submitBtn = $("authSubmitBtn");
  const submitText = $("authSubmitText");
  const submitSpinner = $("authSubmitSpinner");
  const authCard = $("authCard");

  if (!userInput || !passInput) return;

  const enteredUser = userInput.value.trim();
  const enteredPass = passInput.value;

  // Set Loading State
  if (submitBtn) submitBtn.disabled = true;
  if (submitText) submitText.style.opacity = "0";
  if (submitSpinner) submitSpinner.classList.remove("hidden");
  hideAuthError();

  // Short realistic check delay
  await new Promise(resolve => setTimeout(resolve, 300));

  const isUserValid = (
    enteredUser.toLowerCase() === AUTH_USERNAME.toLowerCase() ||
    enteredUser.toLowerCase() === `${AUTH_USERNAME.toLowerCase()}@smkn56.sch.id`
  );
  const isPassValid = (enteredPass === AUTH_PASSWORD);

  if (isUserValid && isPassValid) {
    playSound("open");
    if (rememberMe && rememberMe.checked) {
      localStorage.setItem(AUTH_STORAGE_KEY, AUTH_USERNAME);
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, AUTH_USERNAME);
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    addActivity(`Administrator '${AUTH_USERNAME}' login ke sistem`, "system");
    unlockApp(AUTH_USERNAME, true);
    toast("Login Berhasil", `Selamat datang, ${AUTH_USERNAME}!`);
  } else {
    playSound("alert");
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.style.opacity = "1";
    if (submitSpinner) submitSpinner.classList.add("hidden");

    showAuthError("Username atau password salah!");

    if (authCard) {
      authCard.classList.remove("shake");
      void authCard.offsetWidth;
      authCard.classList.add("shake");
    }
  }
}

function showAuthError(msg) {
  const alert = $("authErrorAlert");
  const alertText = $("authErrorText");
  if (alert && alertText) {
    alertText.textContent = msg;
    alert.classList.remove("hidden");
  }
}

function hideAuthError() {
  const alert = $("authErrorAlert");
  if (alert) alert.classList.add("hidden");
}

function lockApp() {
  const authScreen = $("authScreen");
  const mainApp = $("mainApp");

  if (authScreen) {
    authScreen.classList.remove("hidden", "fade-out");
  }
  if (mainApp) {
    mainApp.classList.add("app-locked");
  }

  if (clockInterval) clearInterval(clockInterval);
  if (freshnessInterval) clearInterval(freshnessInterval);
  if (mqttClient && mqttClient.connected) {
    mqttClient.end(true);
    setConnection(false, "OFFLINE");
  }
}

function unlockApp(username, withAnimation = false) {
  const authScreen = $("authScreen");
  const mainApp = $("mainApp");
  const sidebarUser = $("sidebarUsername");

  if (sidebarUser) sidebarUser.textContent = username || AUTH_USERNAME;

  if (withAnimation && authScreen) {
    authScreen.classList.add("fade-out");
    setTimeout(() => {
      authScreen.classList.add("hidden");
      if (mainApp) mainApp.classList.remove("app-locked");
      initDashboard();
    }, 250);
  } else {
    if (authScreen) authScreen.classList.add("hidden");
    if (mainApp) mainApp.classList.remove("app-locked");
    initDashboard();
  }
}

window.handleLogout = function () {
  playSound("close");
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);

  addActivity("Pengguna telah logout dari sistem", "system");

  const userInput = $("authUsernameInput");
  const passInput = $("authPasswordInput");
  const submitBtn = $("authSubmitBtn");
  const submitText = $("authSubmitText");
  const submitSpinner = $("authSubmitSpinner");

  if (userInput) userInput.value = "";
  if (passInput) passInput.value = "";
  if (submitBtn) submitBtn.disabled = false;
  if (submitText) submitText.style.opacity = "1";
  if (submitSpinner) submitSpinner.classList.add("hidden");
  hideAuthError();

  lockApp();
  toast("Logout", "Anda telah keluar dari sesi dashboard.");
};

/* ═════════════════════════════════════════════════════════════════
   📱 DASHBOARD & NAVIGATION
═════════════════════════════════════════════════════════════ */

function initDashboard() {
  initNavigation();
  updateClock();

  if (clockInterval) clearInterval(clockInterval);
  if (freshnessInterval) clearInterval(freshnessInterval);

  clockInterval = setInterval(updateClock, 1000);
  freshnessInterval = setInterval(updateFreshness, 1000);

  renderActivities();
  updateUI();
  connectMQTT();

  const mobileBtn = $("mobileMenu");
  if (mobileBtn && !mobileBtn._hasBound) {
    mobileBtn._hasBound = true;
    mobileBtn.addEventListener("click", () => {
      playSound("click");
      $("sidebar").classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (window.innerWidth > 820) return;
      const sidebar = $("sidebar");
      if (!sidebar || !sidebar.classList.contains("open")) return;
      if (sidebar.contains(e.target) || e.target.closest("#mobileMenu")) return;
      sidebar.classList.remove("open");
    });
  }
}

function initNavigation() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    if (btn._hasBound) return;
    btn._hasBound = true;
    btn.addEventListener("click", () => {
      playSound("click");
      showSection(btn.dataset.section);
      const sidebar = $("sidebar");
      if (sidebar) sidebar.classList.remove("open");
    });
  });
}

function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  const targetSection = $(name);
  if (targetSection) targetSection.classList.add("active");

  const nav = document.querySelector(`.nav-btn[data-section="${name}"]`);
  if (nav) nav.classList.add("active");

  const titles = {
    dashboard: "Dashboard",
    control: "Smart Control",
    activity: "Activity Log"
  };
  const titleText = titles[name] || "Dashboard";
  if ($("pageTitle")) $("pageTitle").textContent = titleText;
}
window.showSection = showSection;

function updateClock() {
  const clockEl = $("clock");
  const dateEl = $("date");
  if (!clockEl || !dateEl) return;

  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  dateEl.textContent = now.toLocaleDateString("id-ID", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
}

function updateFreshness() {
  const el = $("lastUpdate");
  if (!el) return;
  if (!lastMessageAt) {
    el.textContent = "Menunggu data…";
    return;
  }
  const secs = Math.floor((Date.now() - lastMessageAt) / 1000);
  el.textContent = secs < 2 ? "Baru saja diperbarui" : `Diperbarui ${secs}s lalu`;
}

/* ═════════════════════════════════════════════════════════════════
   🌐 CONFIGURATION RESOLVER & MQTT BROKER ENGINE
═════════════════════════════════════════════════════════════ */

function getMqttConfig() {
  if (typeof window !== "undefined" && window.MQTT_CONFIG) return window.MQTT_CONFIG;
  if (typeof MQTT_CONFIG !== "undefined") return MQTT_CONFIG;
  return null;
}

function getSchoolConfig() {
  if (typeof window !== "undefined" && window.SCHOOL_CONFIG) return window.SCHOOL_CONFIG;
  if (typeof SCHOOL_CONFIG !== "undefined") return SCHOOL_CONFIG;
  return null;
}

function formatMqttUrl(rawUrl) {
  if (!rawUrl) return "";
  let url = rawUrl.trim();
  
  // If user only wrote hostname without wss://
  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    if (url.includes(":")) {
      url = `wss://${url}`;
    } else {
      url = `wss://${url}:8884/mqtt`;
    }
  }

  // Ensure HiveMQ cloud brokers use port 8884 and /mqtt path
  if (url.includes(".hivemq.cloud") && !url.includes(":8884")) {
    url = url.replace(/^(wss?:\/\/[^\/:]+)(:\d+)?(\/.*)?$/, "wss://$1:8884/mqtt").replace("wss://wss://", "wss://");
  }

  return url;
}

function connectMQTT() {
  if (!window.mqtt) {
    toast("MQTT.js tidak termuat", "Periksa koneksi internet.");
    return;
  }
  const config = getMqttConfig();
  if (!config) {
    console.warn("MQTT_CONFIG tidak ditemukan di config.js");
    return;
  }

  const brokerUrl = formatMqttUrl(config.url);
  const clientId = `web_${config.deviceId || "client"}_${Math.random().toString(16).slice(2, 8)}`;
  setConnection(false, "CONNECTING");

  console.log(`[MQTT] Menghubungkan ke: ${brokerUrl} (Client: ${clientId})`);

  try {
    mqttClient = mqtt.connect(brokerUrl, {
      clientId,
      username: config.username,
      password: config.password,
      clean: true,
      reconnectPeriod: config.reconnectPeriod || 3000,
      connectTimeout: config.connectTimeout || 15000,
      keepalive: config.keepalive || 30
    });
  } catch (e) {
    console.error("Gagal inisialisasi client MQTT:", e);
    setConnection(false, "ERROR");
    return;
  }

  mqttClient.on("connect", () => {
    setConnection(true, "ONLINE");
    if (config.topics) {
      Object.values(config.topics).slice(1).forEach(topic => {
        mqttClient.subscribe(topic, { qos: 0 });
      });
    }
    toast("Connected", "Dashboard berhasil terhubung ke broker HiveMQ Cloud.");
    addActivity("Dashboard terhubung ke HiveMQ broker", "system");
  });

  mqttClient.on("message", (topic, payload) => {
    packetCount++;
    if ($("diagPacketCount")) $("diagPacketCount").textContent = packetCount;

    const text = payload.toString();
    try {
      const data = JSON.parse(text);
      handleMQTTMessage(topic, data);
    } catch (e) {
      console.warn("Payload MQTT bukan format JSON valid:", text);
    }
  });

  mqttClient.on("reconnect", () => setConnection(false, "RECONNECTING"));
  mqttClient.on("offline", () => setConnection(false, "OFFLINE"));
  mqttClient.on("close", () => setConnection(false, "OFFLINE"));
  mqttClient.on("error", (err) => {
    console.error("MQTT Error:", err);
    setConnection(false, "ERROR");
  });
}

/* ── 🔒 OPTIMISTIC STATE LOCKS (Prevents Network Lag / In-Flight Telemetry Flicker) ── */
const optimisticLocks = {
  gate: null,
  ultrasonicEnabled: null,
  gateMiddle: null,
  touchEnabled: null,
  ldrEnabled: null,
  gardenLamp: null,
  garageLamp: null
};

function setOptimisticLock(field, value, durationMs = 3500) {
  optimisticLocks[field] = {
    value: value,
    expiry: Date.now() + durationMs
  };
}

function shouldIgnoreIncomingField(field, incomingValue) {
  const lock = optimisticLocks[field];
  if (!lock) return false;

  // Lock expired? Accept hardware state
  if (Date.now() > lock.expiry) {
    optimisticLocks[field] = null;
    return false;
  }

  // Check if hardware telemetry matches the desired user state
  const isMatch = (typeof lock.value === "string")
    ? (String(lock.value).toUpperCase() === String(incomingValue).toUpperCase())
    : (Boolean(lock.value) === Boolean(incomingValue));

  if (isMatch) {
    // Hardware acknowledged the new state! Clear lock
    optimisticLocks[field] = null;
    return false;
  }

  // Hardware is still sending old stale state while in-flight — ignore to eliminate flicker
  return true;
}

function handleMQTTMessage(topic, data) {
  lastMessageAt = Date.now();
  const config = getMqttConfig();

  if (config && config.topics) {
    if (topic === config.topics.status || topic === config.topics.sensor) {
      const safeData = { ...data };

      // Map any alternate hardware key names
      if ("touch" in safeData && !("touchEnabled" in safeData)) {
        safeData.touchEnabled = safeData.touch;
      }
      if ("ldr" in safeData && !("ldrEnabled" in safeData)) {
        safeData.ldrEnabled = safeData.ldr;
      }
      if ("ultrasonic" in safeData && !("ultrasonicEnabled" in safeData)) {
        safeData.ultrasonicEnabled = safeData.ultrasonic;
      }

      // Filter out stale fields if locked by user interaction
      if ("gate" in safeData && shouldIgnoreIncomingField("gate", safeData.gate)) {
        delete safeData.gate;
      }
      if ("ultrasonicEnabled" in safeData && shouldIgnoreIncomingField("ultrasonicEnabled", safeData.ultrasonicEnabled)) {
        delete safeData.ultrasonicEnabled;
      }
      if ("gateMiddle" in safeData && shouldIgnoreIncomingField("gateMiddle", safeData.gateMiddle)) {
        delete safeData.gateMiddle;
      }
      if ("touchEnabled" in safeData && shouldIgnoreIncomingField("touchEnabled", safeData.touchEnabled)) {
        delete safeData.touchEnabled;
      }
      if ("ldrEnabled" in safeData && shouldIgnoreIncomingField("ldrEnabled", safeData.ldrEnabled)) {
        delete safeData.ldrEnabled;
      }
      if ("gardenLamp" in safeData && shouldIgnoreIncomingField("gardenLamp", safeData.gardenLamp)) {
        delete safeData.gardenLamp;
      }
      if ("garageLamp" in safeData && shouldIgnoreIncomingField("garageLamp", safeData.garageLamp)) {
        delete safeData.garageLamp;
      }

      Object.assign(state, safeData);
    }

    if (topic === config.topics.event) {
      const message = data.message || "Event diterima dari hardware";
      const type = data.type || "event";
      addActivity(message, type);
      if (type === "alert") playSound("alert");
    }
  } else {
    Object.assign(state, data);
  }

  updateUI();
}

function publishCommand(action, value) {
  // Always update local state for instantaneous feedback (works in both Live MQTT and Mock Testbench mode!)
  applyLocalCommandState(action, value);

  const config = getMqttConfig();
  if (!mqttClient || !mqttClient.connected || !config || !config.topics) {
    console.debug(`[Sim/Mock] Perintah dijalankan lokal (MQTT offline): ${action} = ${value}`);
    return true;
  }

  try {
    const payload = JSON.stringify({ action, value });
    mqttClient.publish(config.topics.cmd, payload, { qos: 0, retain: false });
    return true;
  } catch (err) {
    console.error("Gagal mengirim MQTT publish:", err);
    return false;
  }
}

function applyLocalCommandState(action, value) {
  const LOCK_DURATION = 3500; // 3.5 seconds grace period for network latency / MQTT roundtrip

  if (action === "gate") {
    const val = String(value).toUpperCase();
    if (state.gate !== val) {
      state.gate = val;
      playSound(val === "OPEN" ? "open" : "close");
    }
    setOptimisticLock("gate", val, LOCK_DURATION);
  } else if (action === "ultrasonic") {
    const val = Boolean(value);
    if (state.ultrasonicEnabled !== val) {
      state.ultrasonicEnabled = val;
      playSound("click");
    }
    setOptimisticLock("ultrasonicEnabled", val, LOCK_DURATION);
  } else if (action === "gateMiddle") {
    const val = String(value).toUpperCase();
    if (state.gateMiddle !== val) {
      state.gateMiddle = val;
      playSound(val === "OPEN" ? "open" : "close");
    }
    setOptimisticLock("gateMiddle", val, LOCK_DURATION);
  } else if (action === "touch") {
    const val = Boolean(value);
    if (state.touchEnabled !== val) {
      state.touchEnabled = val;
      playSound("click");
    }
    setOptimisticLock("touchEnabled", val, LOCK_DURATION);
  } else if (action === "ldr") {
    const val = Boolean(value);
    if (state.ldrEnabled !== val) {
      state.ldrEnabled = val;
      if (val && state.ldrActive) {
        state.gardenLamp = true;
        setOptimisticLock("gardenLamp", true, LOCK_DURATION);
      }
      playSound("click");
    }
    setOptimisticLock("ldrEnabled", val, LOCK_DURATION);
  } else if (action === "gardenLamp") {
    const val = Boolean(value);
    if (state.gardenLamp !== val) {
      state.gardenLamp = val;
      playSound("lamp");
    }
    setOptimisticLock("gardenLamp", val, LOCK_DURATION);
  } else if (action === "garageLamp") {
    const val = Boolean(value);
    if (state.garageLamp !== val) {
      state.garageLamp = val;
      playSound("lamp");
    }
    setOptimisticLock("garageLamp", val, LOCK_DURATION);
  }

  lastMessageAt = Date.now();
  updateUI();
}

/* ═════════════════════════════════════════════════════════════════
   🎮 DEVICE COMMAND METHODS
═════════════════════════════════════════════════════════════ */

window.sendGate = function (value) {
  if (publishCommand("gate", value)) {
    addActivity(`Perintah gerbang kendaraan: ${value.toUpperCase()}`, "command");
    toast("Gerbang Kendaraan", `Perintah ${value.toUpperCase()} berhasil dikirim.`);
  }
};

window.toggleUltrasonicSensor = function (enabled) {
  if (publishCommand("ultrasonic", enabled)) {
    addActivity(`Mode otomatis gerbang mobil (ultrasonik): ${enabled ? "ARMED (AKTIF)" : "DISARMED (NONAKTIF)"}`, "command");
    toast("Sensor Ultrasonik", enabled ? "Mode otomatis DIAKTIFKAN." : "Mode otomatis DINONAKTIFKAN.");
  }
};

window.sendMiddleGate = function (value) {
  if (publishCommand("gateMiddle", value)) {
    addActivity(`Perintah gerbang tengah (pejalan kaki): ${value.toUpperCase()}`, "command");
    toast("Gerbang Tengah", `Perintah ${value.toUpperCase()} berhasil dikirim.`);
  }
};

window.toggleTouchSensor = function (enabled) {
  if (publishCommand("touch", enabled)) {
    addActivity(`Sensor touch gerbang tengah: ${enabled ? "ARMED (AKTIF)" : "DISARMED (NONAKTIF)"}`, "command");
    toast("Sensor Touch", enabled ? "Sensor touch DIAKTIFKAN." : "Sensor touch DINONAKTIFKAN.");
  }
};

window.toggleLdrSensor = function (enabled) {
  if (publishCommand("ldr", enabled)) {
    addActivity(`Sensor LDR otomatis (taman & jalan): ${enabled ? "ARMED (AKTIF)" : "NONAKTIF"}`, "command");
    toast("Sensor LDR", enabled ? "Otomatisasi LDR DIAKTIFKAN." : "Otomatisasi LDR DINONAKTIFKAN.");
  }
};

window.toggleGardenLamp = function (enabled) {
  if (publishCommand("gardenLamp", enabled)) {
    addActivity(`Saklar Lampu Taman & Jalan: ${enabled ? "ON (MENYALA)" : "OFF (MATI)"}`, "command");
    toast("Lampu Taman & Jalan", enabled ? "Lampu dinyalakan." : "Lampu dimatikan.");
  }
};

window.toggleGarageLamp = function (enabled) {
  if (publishCommand("garageLamp", enabled)) {
    addActivity(`Saklar Lampu Garasi & Rumah: ${enabled ? "ON (MENYALA)" : "OFF (MATI)"}`, "command");
    toast("Lampu Garasi & Rumah", enabled ? "Lampu garasi (AC) & lampu rumah (DC) dinyalakan." : "Lampu garasi (AC) & lampu rumah (DC) dimatikan.");
  }
};

/* ═════════════════════════════════════════════════════════════
   🖥️ UI RENDERING & SYNCHRONIZATION
═════════════════════════════════════════════════════════════ */

function setConnection(online, label) {
  const dot = $("connectionDot");
  const text = $("connectionText");
  const diagStatus = $("diagConnStatus");

  if (dot) dot.className = `dot ${online ? "online" : "offline"}`;
  if (text) text.textContent = label;
  if (diagStatus) {
    diagStatus.textContent = label;
    diagStatus.className = online ? "highlight" : "";
  }
  state.online = online;
}

function updateUI() {
  // 1. Vehicle Ultrasonic Radar
  const distance = Number(state.distance);
  const distanceText = Number.isFinite(distance) && distance < 900 ? distance.toFixed(1) : "---";

  if ($("distanceValue")) $("distanceValue").textContent = distanceText;
  if ($("distanceBig")) $("distanceBig").textContent = distanceText;

  const isVehicleDetected = Boolean(state.vehicle || (distance < 20.0 && distance > 0));
  if ($("vehicleBadge")) {
    $("vehicleBadge").textContent = isVehicleDetected ? "VEHICLE DETECTED" : "CLEAR";
    $("vehicleBadge").className = `badge ${isVehicleDetected ? "danger" : "neutral"}`;
  }

  // Sonar emitter wave animation & car detection
  const sonar = $("sonarEmitter");
  if (sonar) sonar.classList.toggle("active", isVehicleDetected);

  const car = $("carIcon");
  if (car) car.classList.toggle("detected", isVehicleDetected);

  // 2. Main Vehicle Gate
  const gate = (state.gate || "CLOSED").toUpperCase();
  if ($("gateStatus")) $("gateStatus").textContent = gate;
  if ($("gateStatusHero")) $("gateStatusHero").textContent = gate;
  if ($("controlGateStatus")) $("controlGateStatus").textContent = gate;
  if ($("gateDeviceText")) $("gateDeviceText").textContent = gate === "OPEN" ? "Terbuka (Open)" : "Tertutup (Closed)";
  if ($("gateArm")) $("gateArm").classList.toggle("open", gate === "OPEN");
  if ($("postLed")) $("postLed").classList.toggle("open", gate === "OPEN");
  if ($("gateDot")) $("gateDot").className = `status-dot ${gate === "OPEN" ? "on" : ""}`;

  if ($("gateAutoBadge")) {
    $("gateAutoBadge").textContent = state.ultrasonicEnabled ? "AUTO ON" : "AUTO OFF";
    $("gateAutoBadge").className = `badge ${state.ultrasonicEnabled ? "success" : "neutral"}`;
  }
  // Sync all ultrasonic auto-mode switches without redundant re-renders
  [$("quickUltrasonicSwitch"), $("controlUltrasonicSwitch")].forEach(sw => {
    if (sw && sw.checked !== !!state.ultrasonicEnabled) sw.checked = !!state.ultrasonicEnabled;
  });
  if ($("ultrasonicControlLabel")) $("ultrasonicControlLabel").textContent = state.ultrasonicEnabled ? "ON (Otomatis)" : "OFF (Manual)";
  if ($("ultrasonicHint")) {
    $("ultrasonicHint").textContent = state.ultrasonicEnabled ? "Aktif (Armed)" : "Nonaktif (Disarmed)";
  }
  if ($("ultrasonicPad")) $("ultrasonicPad").classList.toggle("active", !!state.ultrasonicEnabled);

  // 3. Middle Gate (Touch Sensor)
  const gateMiddle = (state.gateMiddle || "CLOSED").toUpperCase();
  if ($("touchStatBadge")) {
    $("touchStatBadge").textContent = state.touchEnabled ? "ARMED" : "OFF";
    $("touchStatBadge").className = `badge ${state.touchEnabled ? "success" : "neutral"}`;
  }
  if ($("touchStatValue")) $("touchStatValue").textContent = gateMiddle;
  if ($("middleGateStatus")) $("middleGateStatus").textContent = gateMiddle;
  if ($("middleGateDeviceText")) $("middleGateDeviceText").textContent = gateMiddle === "OPEN" ? "Terbuka (Open)" : "Tertutup (Closed)";
  if ($("middleGateDot")) $("middleGateDot").className = `status-dot ${gateMiddle === "OPEN" ? "on" : ""}`;
  if ($("middleGateArm")) $("middleGateArm").classList.toggle("open", gateMiddle === "OPEN");
  if ($("touchPad")) $("touchPad").classList.toggle("active", !!state.touchEnabled);
  
  // Sync all touch switches without redundant re-renders
  [$("quickTouchSwitch"), $("controlTouchSwitch"), $("touchSwitch")].forEach(sw => {
    if (sw && sw.checked !== !!state.touchEnabled) sw.checked = !!state.touchEnabled;
  });
  if ($("touchControlLabel")) $("touchControlLabel").textContent = state.touchEnabled ? "ON" : "OFF";
  if ($("touchHint")) {
    $("touchHint").textContent = state.touchEnabled
      ? (gateMiddle === "OPEN" ? "Sensor aktif — sentuh sekali lagi untuk MENUTUP gerbang." : "Sensor aktif — sentuh untuk MEMBUKA gerbang.")
      : "Sensor nonaktif — sentuhan tidak akan direspons.";
  }

  // 4. LDR Sensor (Darkness reading + arming)
  if ($("ldrValue")) $("ldrValue").textContent = state.ldrActive ? "GELAP" : "TERANG";
  if ($("envLdrText")) $("envLdrText").textContent = state.ldrActive ? "GELAP (Malam Hari)" : "TERANG (Siang Hari)";
  if ($("ldrBadge")) {
    $("ldrBadge").textContent = state.ldrEnabled ? "ARMED" : "OFF";
    $("ldrBadge").className = `badge ${state.ldrEnabled ? "success" : "neutral"}`;
  }

  // Sync all LDR switches without redundant re-renders
  [$("quickLdrSwitch"), $("controlLdrSwitch"), $("ldrSwitch")].forEach(sw => {
    if (sw && sw.checked !== !!state.ldrEnabled) sw.checked = !!state.ldrEnabled;
  });
  if ($("ldrControlLabel")) $("ldrControlLabel").textContent = state.ldrEnabled ? "ON" : "OFF";
  if ($("ldrHint")) {
    $("ldrHint").textContent = state.ldrEnabled
      ? (state.ldrActive ? "Sensor aktif — kondisi gelap, lampu otomatis menyala." : "Sensor aktif — kondisi terang, lampu otomatis mati.")
      : "Sensor nonaktif — gelap/terang tidak menyalakan lampu otomatis.";
  }

  // 5. Garden & Street Lamp
  if ($("gardenLampValue")) $("gardenLampValue").textContent = state.gardenLamp ? "ON" : "OFF";
  if ($("gardenLampBadge")) {
    $("gardenLampBadge").textContent = state.gardenLamp ? "ON" : "OFF";
    $("gardenLampBadge").className = `badge ${state.gardenLamp ? "success" : "neutral"}`;
  }
  if ($("gardenLampDeviceText")) $("gardenLampDeviceText").textContent = state.gardenLamp ? "Menyala (ON)" : "Mati (OFF)";
  if ($("gardenLampDot")) $("gardenLampDot").className = `status-dot ${state.gardenLamp ? "on" : ""}`;

  // Sync garden lamp switches
  [$("gardenLampSwitch")].forEach(sw => {
    if (sw && sw.checked !== !!state.gardenLamp) sw.checked = !!state.gardenLamp;
  });
  if ($("gardenLampControlLabel")) $("gardenLampControlLabel").textContent = state.gardenLamp ? "ON" : "OFF";
  if ($("gardenLampVisual")) $("gardenLampVisual").classList.toggle("on", !!state.gardenLamp);
  if ($("gardenLampVisualText")) $("gardenLampVisualText").textContent = state.gardenLamp ? "LIGHTS ON (MENYALA)" : "LIGHTS OFF (MATI)";

  // 6. Garage Lamp
  if ($("garageLampValue")) $("garageLampValue").textContent = state.garageLamp ? "ON" : "OFF";
  if ($("garageLampBadge")) {
    $("garageLampBadge").textContent = state.garageLamp ? "ON" : "OFF";
    $("garageLampBadge").className = `badge ${state.garageLamp ? "success" : "neutral"}`;
  }
  if ($("garageLampDeviceText")) $("garageLampDeviceText").textContent = state.garageLamp ? "Menyala (ON)" : "Mati (OFF)";
  if ($("garageLampDot")) $("garageLampDot").className = `status-dot ${state.garageLamp ? "on" : ""}`;

  // Sync garage lamp switches
  [$("quickGarageLampSwitch"), $("controlGarageLampSwitch"), $("garageLampSwitch")].forEach(sw => {
    if (sw && sw.checked !== !!state.garageLamp) sw.checked = !!state.garageLamp;
  });
  if ($("garageLampControlLabel")) $("garageLampControlLabel").textContent = state.garageLamp ? "ON" : "OFF";
  if ($("controlGarageLampControlLabel")) $("controlGarageLampControlLabel").textContent = state.garageLamp ? "ON" : "OFF";
  if ($("garageLampVisual")) $("garageLampVisual").classList.toggle("on", !!state.garageLamp);
  if ($("garageLampVisualText")) $("garageLampVisualText").textContent = state.garageLamp ? "LAMPU GARASI & RUMAH: ON" : "LAMPU GARASI & RUMAH: OFF";
}

/* ═════════════════════════════════════════════════════════════
   🚨 EMERGENCY OVERRIDE & MODALS
═════════════════════════════════════════════════════════════ */

window.emergencyOpenAll = function () {
  playSound("open");
  publishCommand("gate", "open");
  publishCommand("gateMiddle", "open");
  publishCommand("gardenLamp", true);
  publishCommand("garageLamp", true);
  addActivity("EMERGENCY OVERRIDE: Evakuasi darurat — Seluruh gerbang & lampu dibuka!", "alert");
  toast("Emergency Evacuation", "Semua gerbang dan penerangan diaktifkan seketika.");
  closeEmergencyModal();
};

window.emergencyCloseAll = function () {
  playSound("close");
  publishCommand("gate", "close");
  publishCommand("ultrasonic", false);
  publishCommand("gateMiddle", "close");
  publishCommand("touch", false);
  addActivity("EMERGENCY LOCKDOWN: Semua gerbang ditutup & sensor otomatis dinonaktifkan!", "alert");
  toast("Emergency Lockdown", "Semua gerbang dikunci.");
  closeEmergencyModal();
};

window.emergencyAllLightsOn = function () {
  playSound("lamp");
  publishCommand("gardenLamp", true);
  publishCommand("garageLamp", true);
  addActivity("Seluruh lampu penerangan kampus dinyalakan serentak", "command");
  toast("Lighting Override", "Lampu taman, jalan, dan garasi telah dinyalakan.");
  closeEmergencyModal();
};

/* ── Modal Controllers ── */
function openDiagnosticsModal() {
  playSound("click");
  const modal = $("diagnosticsModal");
  const config = getMqttConfig();
  if (modal) {
    modal.classList.remove("hidden");
    if ($("diagBrokerHost")) $("diagBrokerHost").textContent = config ? config.url : "--";
    if ($("diagDeviceId")) $("diagDeviceId").textContent = config ? config.deviceId : "--";
    if ($("diagConnStatus")) $("diagConnStatus").textContent = state.online ? "ONLINE" : "OFFLINE";
  }
}
function closeDiagnosticsModal() {
  playSound("click");
  const modal = $("diagnosticsModal");
  if (modal) modal.classList.add("hidden");
}

function openEmergencyModal() {
  playSound("alert");
  const modal = $("emergencyModal");
  if (modal) modal.classList.remove("hidden");
}
function closeEmergencyModal() {
  playSound("click");
  const modal = $("emergencyModal");
  if (modal) modal.classList.add("hidden");
}

function closeAllModals() {
  closeDiagnosticsModal();
  closeEmergencyModal();
}

window.reconnectMQTT = function () {
  playSound("click");
  if (mqttClient) {
    mqttClient.end(true, () => {
      connectMQTT();
      toast("Reconnecting", "Menghubungkan ulang ke MQTT broker...");
    });
  } else {
    connectMQTT();
  }
  closeDiagnosticsModal();
};

/* ═════════════════════════════════════════════════════════════
   📜 ACTIVITY LOG & CSV EXPORT
═════════════════════════════════════════════════════════════ */

function addActivity(message, type = "event") {
  const now = new Date();
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    time: now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    date: now.toLocaleDateString("id-ID"),
    timestamp: now.toISOString(),
    message,
    type
  };
  activities.unshift(item);
  activities = activities.slice(0, 150);
  localStorage.setItem("smartSchoolActivities", JSON.stringify(activities));
  renderActivities();

  if ($("activityCountBadge")) {
    $("activityCountBadge").textContent = activities.length;
  }
}

const ACTIVITY_DOT_COLOR = {
  command: "#2563eb",
  system: "#7c3aed",
  event: "#16a34a",
  alert: "#ea580c"
};

function renderActivities() {
  const previewTarget = $("activityPreview");
  const fullTarget = $("activityFull");

  if (previewTarget) {
    const list = activities.slice(0, 5);
    if (!list.length) {
      previewTarget.innerHTML = `<div class="activity-item"><time>--:--</time><span class="activity-bullet"></span><p>Belum ada aktivitas tercatat.</p></div>`;
    } else {
      previewTarget.innerHTML = list.map(item => createActivityItemHtml(item)).join("");
    }
  }

  if (fullTarget) {
    let list = activities;

    // Filter by type
    if (currentActivityFilter !== "all") {
      list = list.filter(item => item.type === currentActivityFilter);
    }

    // Search query filter
    if (currentActivitySearch) {
      const q = currentActivitySearch.toLowerCase();
      list = list.filter(item => item.message.toLowerCase().includes(q) || item.time.includes(q) || item.type.toLowerCase().includes(q));
    }

    if (!list.length) {
      fullTarget.innerHTML = `<div class="activity-item"><time>--:--</time><span class="activity-bullet"></span><p>Tidak ada riwayat aktivitas yang cocok.</p></div>`;
    } else {
      fullTarget.innerHTML = list.map(item => createActivityItemHtml(item)).join("");
    }
  }
}

function createActivityItemHtml(item) {
  const color = ACTIVITY_DOT_COLOR[item.type] || "#00f0ff";
  const style = `background:${color};box-shadow:0 0 8px ${color}`;
  return `
  <div class="activity-item">
    <time>${item.time}</time>
    <span class="activity-bullet" style="${style}"></span>
    <p>${escapeHtml(item.message)} <small>• ${item.date}</small></p>
  </div>`;
}

window.setActivityFilter = function (filterType, btn) {
  playSound("click");
  currentActivityFilter = filterType;
  document.querySelectorAll(".filter-tab-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderActivities();
};

window.handleActivitySearch = function (query) {
  currentActivitySearch = (query || "").trim();
  renderActivities();
};

window.exportActivityLog = function () {
  playSound("click");
  if (!activities.length) {
    toast("Export Gagal", "Belum ada riwayat aktivitas untuk diexport.");
    return;
  }

  const csvRows = [
    ["Waktu", "Tanggal", "Tipe", "Pesan"].join(",")
  ];

  activities.forEach(item => {
    const row = [
      `"${item.time}"`,
      `"${item.date}"`,
      `"${item.type}"`,
      `"${item.message.replace(/"/g, '""')}"`
    ];
    csvRows.push(row.join(","));
  });

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Activity_Log_SMKN56_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast("Export Berhasil", "File CSV riwayat aktivitas telah diunduh.");
};

window.clearActivity = function () {
  playSound("alert");
  if (confirm("Apakah Anda yakin ingin menghapus seluruh riwayat aktivitas?")) {
    activities = [];
    localStorage.removeItem("smartSchoolActivities");
    renderActivities();
    if ($("activityCountBadge")) $("activityCountBadge").textContent = "0";
    toast("Log Dibersihkan", "Semua riwayat aktivitas telah dihapus.");
  }
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function toast(title, message) {
  const wrap = $("toastContainer");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.classList.add("out"), 3600);
  setTimeout(() => el.remove(), 4000);
}
