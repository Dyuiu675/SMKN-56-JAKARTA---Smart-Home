# SMART SCHOOL HOME - FINAL

Project lomba IoT:
- ESP32
- HC-SR04 untuk deteksi kendaraan
- Servo untuk gerbang
- 2 sensor IR
- 2 output relay/lampu
- Buzzer untuk notifikasi kendaraan dan alarm keamanan
- MQTT over TLS
- HiveMQ Cloud
- Web dashboard futuristik
- Jam/tanggal real-time
- Activity log
- AUTO / MANUAL mode
- Security ARMED / DISARMED
- Remote control dari internet

## 1. Arsitektur

HP/Laptop
   |
   | HTTPS + MQTT over WebSocket (WSS)
   v
HiveMQ Cloud
   |
   | MQTT over TLS
   v
ESP32
   |
   +-- HC-SR04 --> kendaraan --> Servo gate
   +-- IR 1 -----> Lampu 1
   +-- IR 2 -----> Lampu 2
   +-- Security --> Buzzer

Website dan ESP32 tidak perlu berada pada Wi-Fi yang sama.

## 2. Pin ESP32

| Komponen | GPIO |
|---|---:|
| HC-SR04 TRIG | 5 |
| HC-SR04 ECHO | 18 |
| Servo | 19 |
| IR 1 | 23 |
| IR 2 | 22 |
| Relay/Lamp 1 | 25 |
| Relay/Lamp 2 | 26 |
| Buzzer | 27 |

### PENTING
HC-SR04 ECHO dapat mengeluarkan 5V. GPIO ESP32 3.3V.
Gunakan voltage divider/level shifter untuk ECHO -> GPIO18.

Relay dan servo sebaiknya menggunakan supply eksternal yang sesuai.
Satukan GND supply eksternal dengan GND ESP32.

Jika relay Anda ACTIVE HIGH, ubah:
#define RELAY_ACTIVE_LOW false

Jika sensor IR Anda ACTIVE HIGH, ubah:
#define IR_ACTIVE_LOW false

## 3. Membuat HiveMQ Cloud

Gunakan HiveMQ Cloud Serverless untuk prototype/lomba.
Dokumentasi resmi:
https://docs.hivemq.com/hivemq-cloud/quick-start-guide.html

Langkah:
1. Buat akun HiveMQ.
2. Pilih Cloud.
3. Pilih Serverless / FREE.
4. Create Serverless Cluster.
5. Buka Manage Cluster.
6. Buat MQTT Credentials:
   - username
   - password
7. Catat:
   - Cluster Host
   - Username
   - Password

HiveMQ Cloud Serverless saat ini menyediakan 100 koneksi dan 10 GB traffic/bulan, serta mendukung MQTT over TLS dan WebSocket.

## 4. Konfigurasi ESP32

Buka:
esp32/smart_school_home.ino

Ubah:

const char* WIFI_SSID = "GANTI_NAMA_WIFI";
const char* WIFI_PASSWORD = "GANTI_PASSWORD_WIFI";

const char* MQTT_HOST = "GANTI_HOST_HIVEMQ";
const char* MQTT_USERNAME = "GANTI_MQTT_USERNAME";
const char* MQTT_PASSWORD = "GANTI_MQTT_PASSWORD";

MQTT_HOST jangan diberi https:// dan jangan diberi port.
Contoh:
xxxxxx.s1.eu.hivemq.cloud

Port ESP32:
8883

Install library Arduino:
- PubSubClient
- ArduinoJson
- ESP32Servo

WiFi dan WiFiClientSecure sudah tersedia pada ESP32 Arduino Core.

## 5. Upload ESP32

Arduino IDE:
1. Install ESP32 board package.
2. Pilih Board -> ESP32 Dev Module.
3. Pilih COM Port.
4. Install library yang diperlukan.
5. Upload.
6. Buka Serial Monitor 115200.

Jika berhasil akan muncul:
WiFi connected
IP: ...
Connecting MQTT... connected
SMART SCHOOL HOME READY

## 6. Konfigurasi website

Buka:
web/config.js

Ubah:

url: "wss://GANTI_HOST_HIVEMQ:8884/mqtt",
username: "GANTI_MQTT_USERNAME",
password: "GANTI_MQTT_PASSWORD",

Contoh:
url: "wss://xxxxxx.s1.eu.hivemq.cloud:8884/mqtt"

HiveMQ Cloud menggunakan MQTT over WebSocket pada port 8884.

Ganti:
schoolName: "NAMA SEKOLAH ANDA"

Logo:
Masukkan logo sekolah ke:
web/assets/logo.png

## 7. Menjalankan website di Windows

Jangan buka index.html dengan double-click jika browser bermasalah dengan module/network.
Cara paling mudah:

A. VS Code
1. Install VS Code.
2. Install extension "Live Server".
3. Buka folder:
   Smart_School_Home_FINAL/web
4. Klik kanan index.html.
5. Pilih "Open with Live Server".

Browser akan membuka alamat seperti:
http://127.0.0.1:5500

B. Python
Jika Python sudah terinstall:
1. Buka CMD di folder web.
2. Jalankan:
   python -m http.server 5500
3. Buka:
   http://localhost:5500

## 8. Alur pengujian

### Test 1 - MQTT
Pastikan:
- ESP32 ONLINE
- Website ONLINE

Website harus menunjukkan:
ONLINE

### Test 2 - Gerbang
Dekatkan kendaraan/objek ke HC-SR04 kurang dari 80 cm.

Hasil:
1. vehicle detected
2. buzzer bunyi singkat
3. servo membuka
4. website menunjukkan VEHICLE
5. activity log menerima event
6. setelah area kosong beberapa detik, gerbang menutup.

### Test 3 - Lampu
Aktifkan AUTO.
Lewatkan tangan di depan IR 1:
- Lampu 1 ON

Lewatkan tangan di depan IR 2:
- Lampu 2 ON

### Test 4 - Security
Tekan:
ARM SECURITY

Lalu aktifkan IR 1 atau IR 2.
Hasil:
- SECURITY ALERT
- buzzer alarm
- website berubah menjadi merah
- activity log mencatat alert

## 9. Remote test

Setelah sistem berhasil pada Wi-Fi yang sama:
1. ESP32 tetap terhubung ke Wi-Fi sekolah.
2. Jalankan website dari laptop.
3. Putuskan laptop dari Wi-Fi sekolah.
4. Gunakan hotspot HP / Wi-Fi lain.
5. Buka website lagi.
6. Jika website dan ESP32 sama-sama terhubung ke HiveMQ Cloud, kontrol tetap bekerja.

Inilah bagian yang menunjukkan sistem benar-benar remote.

## 10. Troubleshooting

### Website OFFLINE
Cek:
- internet browser
- MQTT host
- username/password
- URL harus:
  wss://HOST:8884/mqtt
- buka DevTools -> Console

### ESP32 MQTT gagal
Cek:
- MQTT host benar
- username/password benar
- port 8883
- Wi-Fi terhubung
- lihat Serial Monitor

### Servo bergerak tetapi arah salah
Ubah:
GATE_OPEN_ANGLE
GATE_CLOSED_ANGLE

### Relay terbalik
Ubah:
#define RELAY_ACTIVE_LOW false

atau true.

### IR terbalik
Ubah:
#define IR_ACTIVE_LOW false

atau true.

### HC-SR04 tidak membaca
Cek:
- TRIG
- ECHO
- GND
- voltage divider ECHO
- jangan supply ECHO 5V langsung ke ESP32.

## 11. Keamanan untuk versi lomba

Untuk demo prototype, kode ESP32 menggunakan:
secureClient.setInsecure();

Ini memudahkan TLS tanpa memasukkan CA certificate.
Untuk deployment sungguhan, gunakan CA certificate broker dengan setCACert().

Website static menyimpan username/password MQTT di browser.
Jangan gunakan credential super-admin.
Buat credential khusus dashboard dengan permission hanya untuk topic project:
school/smarthome/school-smart-home-01/#

Jika website akan dipublikasikan ke internet secara permanen, gunakan backend/proxy MQTT agar credential tidak terlihat di browser.

## 12. Ide presentasi lomba

Urutan demo:
1. Tampilkan dashboard.
2. Tunjukkan ESP32 ONLINE.
3. Tunjukkan jam/tanggal real-time.
4. Dekatkan kendaraan ke HC-SR04.
5. Gerbang membuka otomatis.
6. Tunjukkan activity log.
7. Aktifkan Security.
8. Gerakkan tangan di IR.
9. Tunjukkan alarm.
10. Pindah HP ke jaringan internet lain.
11. Kontrol lampu/gerbang dari jarak jauh.
12. Jelaskan MQTT Cloud sebagai penghubung.

## 13. Struktur project

Smart_School_Home_FINAL/
├── esp32/
│   └── smart_school_home.ino
├── web/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── config.js
│   └── assets/
│       └── logo.png
├── docs/
└── README.md
