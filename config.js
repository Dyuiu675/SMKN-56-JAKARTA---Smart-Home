/* ═════════════════════════════════════════════════════════════════
   SMART SCHOOL HOME — WEB & MQTT CONFIGURATION
   SMKN 56 JAKARTA — IoT Smart Campus System
═════════════════════════════════════════════════════════════════ */

const MQTT_CONFIG = {
  // HiveMQ Cloud Serverless WSS WebSocket Endpoint (Port 8884 /mqtt)
  // Host ini HARUS sama persis dengan MQTT_HOST di firmware ESP32
  // (esp32_smart_school_home.ino) — kalau beda cluster, website dan
  // ESP32 tidak akan pernah saling terhubung walau status "Connected".
  url: "wss://2e30c690792240bc8d5c454f0ec97cfc.s1.eu.hivemq.cloud:8884/mqtt",

  username: "SMKN56JAKARTA",
  password: "56JAKARTA08!",

  deviceId: "school-smart-home-01",

  topics: {
    cmd: "school/smarthome/school-smart-home-01/cmd",
    status: "school/smarthome/school-smart-home-01/status",
    sensor: "school/smarthome/school-smart-home-01/sensor",
    event: "school/smarthome/school-smart-home-01/event"
  },

  // Connection settings
  reconnectPeriod: 3000,
  connectTimeout: 10000,
  keepalive: 30
};

const SCHOOL_CONFIG = {
  schoolName: "SMKN 56 JAKARTA",
  systemName: "SMART SCHOOL HOME",
  tagline: "IoT Smart Campus & Automation Control System",
  logo: "https://smksedkijakarta.wordpress.com/wp-content/uploads/2017/11/ngrt7ave_400x400.png",
  version: "v3.0 Pro"
};

// Default Demo / Hardware Simulation Settings
const SIMULATION_CONFIG = {
  defaultDistance: 45.0,
  detectionThreshold: 20.0,
  autoCloseDelay: 4000
};

// Attach to window for standard browser environments
if (typeof window !== "undefined") {
  window.MQTT_CONFIG = MQTT_CONFIG;
  window.SCHOOL_CONFIG = SCHOOL_CONFIG;
  window.SIMULATION_CONFIG = SIMULATION_CONFIG;
}
