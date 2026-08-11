/*
  SMART SCHOOL HOME - WEB CONFIGURATION

  After creating HiveMQ Cloud Serverless:
  1. Copy your cluster host, e.g. xxxxx.s1.eu.hivemq.cloud
  2. Create MQTT credentials.
  3. Put them below.
  4. Do NOT publish this config on a public Git repository.
*/

const MQTT_CONFIG = {
  // Example:
  // wss://xxxxxxxx.s1.eu.hivemq.cloud:8884/mqtt
  url:"wss://2e30c690792240bc8d5c454f0ec97cfc.s1.eu.hivemq.cloud:8884/mqtt",

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
  logo: "assets/logo.png"
};
