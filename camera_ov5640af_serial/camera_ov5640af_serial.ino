#include <WiFi.h>
#include "esp_camera.h"
#include "ESP32_OV5640_AF.h"

#define CAMERA_MODEL_ESP32_CAM_PLUS
#include "camera_pins.h"

OV5640 ov5640 = OV5640();  // Autofocus driver
sensor_t* sensor;          // global pointer ke sensor

void trigger_autofocus_once() {
  if (!sensor) return;
  // 0x3022 = AF control register
  sensor->set_reg(sensor, 0x3022, 0xFF, 0x03);  // trigger AF
  delay(500);
  sensor->set_reg(sensor, 0x3022, 0xFF, 0x06);  // lock fokus
  // Serial.println("🔄 Autofocus retriggered & locked");
}

void setupCamera() {
  if (!psramFound()) {
    // Serial.println("❌ PSRAM nggak ada, XGA gampang crash!");
  } else {
    // Serial.println("✅ PSRAM terdeteksi");
  }

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 2;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.fb_count = 1;
  config.grab_mode = CAMERA_GRAB_LATEST;

  if (esp_camera_init(&config) != ESP_OK) {
    // Serial.println("❌ Camera init failed!");
    while (true)
      ;
  }

  Serial.println("✅ Camera ready");

  // Inisialisasi autofocus
  sensor = esp_camera_sensor_get();
  ov5640.start(sensor);

  if (ov5640.focusInit() == 0) {
    Serial.println("✅ OV5640 Focus Init sukses");
    trigger_autofocus_once();  // langsung fokus sekali di awal
  } else {
    Serial.println("❌ Focus Init gagal");
  }

  // sensor->set_brightness(sensor, 1);  // -2 to +2
  // sensor->set_contrast(sensor, 1);    // -2 to +2
  sensor->set_sharpness(sensor, 3);  // 0 to 3
}

void setup() {
  Serial.begin(2000000);
  setupCamera();
  // Serial.println("🌐 Ready. Commands: gambarKN | fokus");
}

bool busy = false;
void loop() {
  if (Serial.available() > 0 && !busy) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "gambarKameraKanan") {
        // delay(100);
      busy = true;

      // Buang frame pertama
      camera_fb_t* fb = esp_camera_fb_get();
      if (fb) esp_camera_fb_return(fb);
      delay(30);

      fb = esp_camera_fb_get();
      if (!fb) {
        busy = false;
        delay(10);
        return;
      }

      uint32_t len = fb->len;

      // Batasi frame
      if (len > 2 * 1024 * 1024) {
        esp_camera_fb_return(fb);
        busy = false;
        delay(10);
        return;
      }

      const char kode_alat[2] = { 'K', 'N' };
      uint8_t marker[2] = { 0xAA, 0x55 };

      Serial.write(marker, 2);
      Serial.write((uint8_t*)&len, 4);
      Serial.write((uint8_t*)kode_alat, 2);

      // kirim frame dalam chunk
      const int chunkSize = 2048;
      for (int i = 0; i < fb->len; i += chunkSize) {
        size_t size = min((size_t)chunkSize, fb->len - i);
        Serial.write(fb->buf + i, size);
        Serial.flush();
      }

      // tunggu semua data keluar dari buffer serial
      Serial.flush();
      // kirim penanda selesai
      Serial.println("DONE");

      esp_camera_fb_return(fb);
      busy = false;
    } else if (cmd == "fokus") {
      trigger_autofocus_once();
    } else if (cmd == "cek_nama_alat") {
      Serial.print("kamera_kanan");
    }
  }

  delay(10);
}
