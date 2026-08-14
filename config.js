/*
  SMART SCHOOL HOME — WEB CONFIGURATION

  After creating a HiveMQ Cloud Serverless cluster:
  1. Copy your cluster host, e.g. xxxxx.s1.eu.hivemq.cloud
  2. Create MQTT credentials.
  3. Put them below.
  4. Do NOT publish this config on a public Git repository
     (use a private repo, or move credentials server-side later).

  ── SYSTEM OVERVIEW (3 sensors + 1 manual servo lamp) ────────
  Setiap sensor (ultrasonik, touch, LDR) punya dua mode:
    - MANUAL: kontrol lewat tombol/switch di web, sensor diabaikan.
    - OTOMATIS (di-ARM dari web): begitu sensor mendeteksi sesuatu,
      aksi terjadi sendiri, dan untuk gerbang akan otomatis tertutup
      lagi setelah beberapa saat.

  1. Ultrasonic + Servo  -> main vehicle gate. Tombol OPEN/CLOSE selalu
     bisa dipakai manual. Kalau mode otomatis di-ARM (ultrasonicEnabled),
     gerbang otomatis terbuka saat kendaraan terdeteksi lalu tertutup
     otomatis begitu kendaraan sudah tidak terdeteksi lagi.
  2. Touch sensor + Servo-> pedestrian "middle gate". The web can
     arm/disarm this sensor remotely (touchEnabled). While armed,
     a physical touch opens the middle gate, which then closes itself
     automatically a few seconds later; while disarmed, touches are
     ignored by the ESP32.
  3. LDR                 -> combined garden + street lamp
     (gardenLamp). Turns on automatically when it gets dark (only
     while ldrEnabled is armed), and can also be switched manually
     from the web at any time.
  4. Garage lamp          -> no sensor, relay-actuated switch,
     purely manual ON/OFF from the web (garageLamp).

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
