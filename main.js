const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SerialPort } = require('serialport');
const fs = require('fs');

const userDataPath = app.getPath("userData");
const pengaturanPath = path.join(userDataPath, "pengaturan.json");
const hasilImagePath = path.join(userDataPath, "hasil");
console.log("PENGATURAN JSON PATH:", pengaturanPath);

let win;
let port;
const VENDOR = '1a86';
const PRODUCT = '7523';

let ports = [];
let isProcessing = false;

// Parser state
let parserState = {
  waitingMarker: true,
  markerBytes: Buffer.alloc(2),
  markerReceived: 0,
  waitingSize: false,
  sizeBuffer: Buffer.alloc(4),
  sizeReceived: 0,
  frameBuffer: null,
  frameSize: 0,
  frameReceived: 0,
  kodeAlatBytes: Buffer.alloc(2),
  kodeAlatReceived: 0,
  kodeAlat: "",
};

// ========================
// Window
// ========================

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);
  win.loadFile("index.html");
}

app.whenReady().then(() => {
  // Buat folder hasil di userData jika belum ada
  if (!fs.existsSync(hasilImagePath)) {
    fs.mkdirSync(hasilImagePath, { recursive: true });
  }
  createWindow();
});

// ========================
// Serial Handling
// ========================

function tryOpenPort() {
  SerialPort.list().then(list => {
    const devs = list.filter(d =>
      d.vendorId && d.productId &&
      d.vendorId.toLowerCase() === VENDOR &&
      d.productId.toLowerCase() === PRODUCT
    );

    if (devs.length === 0) {
      console.log('[MAIN] No matching devices found');
      return;
    }

    devs.forEach(dev => {
      if (!ports.some(p => p.path === dev.path && p.isOpen)) {
        openPort(dev.path);
      }
    });
  }).catch(err => console.error('[MAIN] List error:', err));
}

function openPort(path) {
  const port = new SerialPort({
    path,
    baudRate: 1000000,
    autoOpen: false,
    highWaterMark: 20000000
  });

  port.open(err => {
    if (err) {
      console.error(`[MAIN] Failed to open port ${path}`, err);
      return;
    }
    console.log('[MAIN] Serial port opened', path);
    resetParserState();
  });

  port.on('data', onData);
  port.on('error', err => console.error(`[MAIN] Serial error on ${path}`, err));
  port.on('close', () => {
    console.log(`[MAIN] Serial closed on ${path}, retrying...`);
    setTimeout(() => tryOpenPort(), 5000);
  });

  ports.push(port);
}

setInterval(tryOpenPort, 1500);

// ========================
// Data Parsing
// ========================

function resetParserState() {
  parserState = {
    waitingMarker: true,
    markerBytes: Buffer.alloc(2),
    markerReceived: 0,
    waitingSize: false,
    sizeBuffer: Buffer.alloc(4),
    sizeReceived: 0,
    frameBuffer: null,
    frameSize: 0,
    frameReceived: 0,
    kodeAlatBytes: Buffer.alloc(2),
    kodeAlatReceived: 0,
    kodeAlat: "",
  };
  isProcessing = false;
}

let frameSent = false;
let lastChunkTime = Date.now();

function onData(chunk) {
  const now = Date.now();

  if (now - lastChunkTime > 5000) {
    console.warn("[MAIN] Parser timeout — reset state");
    resetParserState();
  }
  lastChunkTime = now;

  try {
    let offset = 0;
    while (offset < chunk.length) {

      // 1️⃣ STATUS MARKER (AB CD)
      if (chunk[offset] === 0xAB && offset + 3 < chunk.length && chunk[offset + 1] === 0xCD) {
        const len = chunk.readUInt16LE(offset + 2);
        if (offset + 4 + len + 1 > chunk.length) break; // belum lengkap
        const msg = chunk.slice(offset + 4, offset + 4 + len).toString();
        const endMarker = chunk[offset + 4 + len];
        if (endMarker === 0xEF) {
          win?.webContents?.send('status-fokus', msg);
          console.log('[STATUS]', msg);
        }
        offset += 4 + len + 1;
        continue;
      }

      // 2️⃣ Marker awal frame (AA 55)
      if (parserState.waitingMarker) {
        if (chunk[offset] === 0xAA && offset + 1 < chunk.length && chunk[offset + 1] === 0x55) {
          parserState.waitingMarker = false;
          parserState.waitingSize = true;
          parserState.markerReceived = 2;
          offset += 2;
        } else {
          offset++;
        }
        continue;
      }

      // 3️⃣ Ukuran frame (4 byte)
      if (parserState.waitingSize) {
        const toCopy = Math.min(4 - parserState.sizeReceived, chunk.length - offset);
        chunk.copy(parserState.sizeBuffer, parserState.sizeReceived, offset, offset + toCopy);
        parserState.sizeReceived += toCopy;
        offset += toCopy;

        if (parserState.sizeReceived === 4) {
          parserState.frameSize = parserState.sizeBuffer.readUInt32LE(0);

          if (parserState.frameSize <= 0 || parserState.frameSize > 500000) {
            resetParserState();
            win?.webContents?.send("busy", `Frame size tidak valid: ${parserState.frameSize}`);
            return;
          }

          parserState.frameBuffer = Buffer.alloc(parserState.frameSize);
          parserState.frameReceived = 0;
          parserState.kodeAlatReceived = 0;
          parserState.waitingSize = false;
        }
        continue;
      }

      // 4️⃣ 2 byte kode alat
      if (parserState.kodeAlatReceived < 2) {
        const toCopy = Math.min(2 - parserState.kodeAlatReceived, chunk.length - offset);
        chunk.copy(parserState.kodeAlatBytes, parserState.kodeAlatReceived, offset, offset + toCopy);
        parserState.kodeAlatReceived += toCopy;
        offset += toCopy;

        if (parserState.kodeAlatReceived === 2) {
          parserState.kodeAlat = parserState.kodeAlatBytes.toString('utf8');
        }
        continue;
      }

      // 5️⃣ Salin isi frame
      const toCopy = Math.min(parserState.frameSize - parserState.frameReceived, chunk.length - offset);
      chunk.copy(parserState.frameBuffer, parserState.frameReceived, offset, offset + toCopy);
      parserState.frameReceived += toCopy;
      offset += toCopy;

      // 6️⃣ Kalau frame lengkap, cek end marker
      if (parserState.frameReceived === parserState.frameSize && offset + 2 <= chunk.length) {
        const end1 = chunk[offset++];
        const end2 = chunk[offset++];

        if (end1 === 0xDE && end2 === 0xAD) {
          try {
            const b64 = parserState.frameBuffer.toString('base64');
            win?.webContents?.send('frame', { b64, kodeAlat: parserState.kodeAlat });
            saveFrame(b64, parserState.kodeAlat);
          } catch (err) {
            console.error('[MAIN] Error sending frame:', err);
          } finally {
            isProcessing = false;
            resetParserState();
          }
        } else {
          console.warn("[MAIN] Invalid end marker:", end1, end2);
          resetParserState();
        }
      }
    }
  } catch (err) {
    console.error("[MAIN] Parser error:", err);
    resetParserState();
  }
}

// ========================
// IPC: request image
// ========================
let processingTimeout = null;

ipcMain.on('request-image', (event, inputParam) => {
  resetParserState();
  if (ports.length === 0) return;

  if (isProcessing) {
    console.warn("[MAIN] ⛔ Permintaan ditolak — masih proses sebelumnya");
    if (win && win.webContents)
      win.webContents.send('busy', 'Masih memproses gambar sebelumnya...');
    return;
  }

  isProcessing = true;
  console.log("[MAIN] 🚀 Mulai proses pengambilan gambar...");

  processingTimeout = setTimeout(() => {
    console.warn("[MAIN] ⏱️ Timeout — reset status proses");
    isProcessing = false;
    if (win && win.webContents)
      win.webContents.send('busy', 'Timeout: tidak ada respons dari alat.');
  }, 10000);

  let kodeAlat = '';
  if (typeof inputParam === 'string') {
    kodeAlat = inputParam;
  }
  const cmd = kodeAlat + '\n';

  ports.forEach(p => {
    if (p.isOpen) {
      p.write(cmd, err => {
        if (err) {
          console.error('[MAIN] Write error on', p.path, err);
          isProcessing = false;
          clearTimeout(processingTimeout);
        }
      });
    }
  });
});

ipcMain.on('request-fokus', (event, inputParam) => {
  const cmd = inputParam + '\n';

  console.log("permintaan", inputParam);
  ports.forEach(p => {
    if (p.isOpen) {
      p.write(cmd, err => {
        if (err) console.error('[MAIN] Write error on', p.path, err);
      });
    }
  });
});

// ========================
// Simpan gambar dari renderer
// ========================
let lastSave = 0;

ipcMain.on("simpan-gambar", (event, base64img, kodeAlat) => {
  try {
    const cleanBase64 = base64img.replace(/^data:image\/\w+;base64,/, "");
    saveFrame(cleanBase64, kodeAlat);
  } catch (error) {
    console.error("❌ Gagal menyimpan gambar:", error);
  }
});

// ========================
// Simpan frame ke file
// ========================
function saveFrame(b64, kodeAlat) {
  const now = Date.now();
  lastSave = now;

  const buffer = Buffer.from(b64, 'base64');
  const filename = `${kodeAlat}_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
  const filepath = path.join(hasilImagePath, filename);

  fs.writeFile(filepath, buffer, err => {
    if (err) {
      console.error('[MAIN] Gagal simpan gambar:', err);
    } else {
      console.log('[MAIN] Gambar disimpan:', filepath);
    }
  });
}

// ====================================
// setting dan Load handler
// =======================================
ipcMain.handle("loadSettings", async () => {
  try {
    if (!fs.existsSync(pengaturanPath)) {
      return { status: false, message: "File pengaturan tidak ditemukan." };
    }
    const data = fs.readFileSync(pengaturanPath, "utf-8");
    return { status: true, data: JSON.parse(data) };
  } catch (error) {
    return { status: false, message: error.message };
  }
});

ipcMain.handle("saveSettings", async (event, settingsData) => {
  try {
    fs.writeFileSync(pengaturanPath, JSON.stringify(settingsData, null, 2));
    return { status: true, message: "Pengaturan berhasil disimpan." };
  } catch (error) {
    return { status: false, message: error.message };
  }
});
