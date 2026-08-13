/*
  SMART SCHOOL HOME — WEB CONFIGURATION

  After creating a HiveMQ Cloud Serverless cluster:
  1. Copy your cluster host, e.g. xxxxx.s1.eu.hivemq.cloud
  2. Create MQTT credentials.
  3. Put them below.
  4. Do NOT publish this config on a public Git repository
     (use a private repo, or move credentials server-side later).

  ── SYSTEM OVERVIEW (3 sensors) ─────────────────────────────
  1. Ultrasonic + Servo  -> main vehicle gate (auto-opens for cars)
  2. IR sensor x2        -> motion -> lamp Room 1 / Room 2
  3. Touch sensor + Servo-> pedestrian "middle gate". The web can
     arm/disarm this sensor remotely (touchEnabled). While armed,
     a physical touch on the sensor opens the middle gate; while
     disarmed, touches are ignored by the ESP32.

  All of this is exchanged with the ESP32 over MQTT — see
  firmware/esp32_smart_school_home.ino for the matching payloads.
*/

const MQTT_CONFIG = {
  // Example:
  // wss://xxxxxxxx.s1.eu.hivemq.cloud:8884/mqtt
  url: "wss://2e30c690792240bc8d5c454f0ec97cfc.s1.eu.hivemq.cloud:8884/mqtt",

  username: "SMKN56JAKARTA",
  password: "56JAKARTA08!",

  deviceId: "school-smart-home-01",

  topics: {
    cmd: "school/smarthome/school-smart-home-01/cmd",
    status: "school/smarthome/school-smart-home-01/status",
    sensor: "school/smarthome/school-smart-home-01/sensor",
    event: "school/smarthome/school-smart-home-01/event"
  }
};

const SCHOOL_CONFIG = {
  schoolName: "SMKN 56 JAKARTA",
  systemName: "SMART SCHOOL HOME",
  // Put the school logo file at: assets/logo.png (same folder as index.html)
  logo: "assets/logo.png"
};
