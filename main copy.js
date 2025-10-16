const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SerialPort } = require('serialport');

let win;
let port;
const VENDOR = '1a86';
const PRODUCT = '7523';

let ports = [];

// Parser state
const parserState = {
  waitingMarker: true,
  markerBytes: Buffer.alloc(2),
  markerReceived: 0,

  waitingSize: false,
  sizeBuffer: Buffer.alloc(4),
  sizeReceived: 0,
  frameSize: 0,

  kodeAlatBytes: Buffer.alloc(2),
  kodeAlatReceived: 0,
  kodeAlat: '',

  frameBuffer: null,
  frameReceived: 0
};

// ========================
// Window
// ========================
function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

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
      // cek apakah port ini sudah dibuka
      if (!ports.some(p => p.path === dev.path && p.isOpen)) {
        openPort(dev.path);
      }
    });
  }).catch(err => console.error('[MAIN] List error:', err));
}

function openPort(path) {
  const port = new SerialPort({
    path,
    baudRate: 2000000,
    autoOpen: false,
    highWaterMark: 65536
  });

  port.open(err => {
    if (err) {
      console.error(`[MAIN] Failed to open port ${path}`, err);
      return;
    }
    console.log('[MAIN] Serial port opened', path);
  });

  port.on('data', onData);
  port.on('error', err => console.error(`[MAIN] Serial error on ${path}`, err));
  port.on('close', () => {
    console.log(`[MAIN] Serial closed on ${path}, retrying...`);
    setTimeout(() => tryOpenPort(), 2000);
  });

  ports.push(port); // simpan port
}

setInterval(tryOpenPort, 1500);

// ========================
// Data Parsing
// ========================

let frameSent = false;

function onData(chunk) {
  let offset = 0;

  while (offset < chunk.length) {
    // 1️⃣ Cari marker 0xAA 0x55
    if (parserState.waitingMarker) {
      while (offset < chunk.length && parserState.markerReceived < 2) {
        parserState.markerBytes[parserState.markerReceived++] = chunk[offset++];
      }
      if (parserState.markerReceived === 2) {
        if (parserState.markerBytes[0] === 0xAA && parserState.markerBytes[1] === 0x55) {
          parserState.waitingMarker = false;
          parserState.waitingSize = true;
          parserState.sizeReceived = 0;
        } else {
          // marker salah, geser 1 byte
          parserState.markerBytes[0] = parserState.markerBytes[1];
          parserState.markerReceived = 1;
        }
      }
      continue;
    }

    // 2️⃣ Ambil 4 byte ukuran frame
    if (parserState.waitingSize) {
      const toCopy = Math.min(4 - parserState.sizeReceived, chunk.length - offset);
      chunk.copy(parserState.sizeBuffer, parserState.sizeReceived, offset, offset + toCopy);
      parserState.sizeReceived += toCopy;
      offset += toCopy;

      if (parserState.sizeReceived === 4) {
        parserState.frameSize = parserState.sizeBuffer.readUInt32LE(0);
        if (parserState.frameSize <= 0 || parserState.frameSize > 2_000_000) {
          console.warn('[MAIN] Invalid frame size:', parserState.frameSize);
          parserState.waitingMarker = true;
          parserState.markerReceived = 0;
          parserState.waitingSize = false;
          continue;
        }
        parserState.frameBuffer = Buffer.alloc(parserState.frameSize);
        parserState.frameReceived = 0;
        parserState.kodeAlatReceived = 0;
        parserState.waitingSize = false;
      }
      continue;
    }

    // 3️⃣ Ambil 2 byte kode alat
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

    // 4️⃣ Ambil frame
    const toCopy = Math.min(parserState.frameSize - parserState.frameReceived, chunk.length - offset);
    chunk.copy(parserState.frameBuffer, parserState.frameReceived, offset, offset + toCopy);
    parserState.frameReceived += toCopy;
    offset += toCopy;

    if (parserState.frameReceived === parserState.frameSize) {
      try {
        const b64 = parserState.frameBuffer.toString('base64');
        if (win && win.webContents) {
          win.webContents.send('frame', { b64, kodeAlat: parserState.kodeAlat });
        }

        // simpan tiap 5 detik
        saveFrame(b64, parserState.kodeAlat);


      } catch (err) {
        console.error('[MAIN] Error sending frame:', err);
      }

      // Reset parser
      parserState.waitingMarker = true;
      parserState.markerReceived = 0;
      parserState.waitingSize = false;
      parserState.sizeReceived = 0;
      parserState.frameBuffer = null;
      parserState.frameReceived = 0;
      parserState.kodeAlatReceived = 0;
    }
  }
}

// ========================
// IPC: request image
// ========================
ipcMain.on('request-image', (event, inputParam) => {
  if (ports.length === 0) return;

  console.log(inputParam);

  let kodeAlat = ''; // default
  if (typeof inputParam === 'string') {
    kodeAlat = inputParam;
  }
  const cmd = kodeAlat + '\n';


  // Kirim ke semua port
  ports.forEach(p => {
    if (p.isOpen) {

      p.write(cmd, err => {
        if (err) console.error('[MAIN] Write error on', p.path, err);
      });
    }
  });
});


const fs = require('fs');

// buat folder hasil kalau belum ada
const hasilDir = path.join(__dirname, 'hasil');
if (!fs.existsSync(hasilDir)) {
  fs.mkdirSync(hasilDir);
}

// ========================
// Simpan gambar tiap 5 detik
// ========================
let lastSave = 0;

function saveFrame(b64, kodeAlat) {
  const now = Date.now();
  // if (now - lastSave < 5000) return; // jaga interval 5 detik

  lastSave = now;

  const buffer = Buffer.from(b64, 'base64');
  const filename = `${kodeAlat}_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
  const filepath = path.join(hasilDir, filename);

  fs.writeFile(filepath, buffer, err => {
    if (err) {
      console.error('[MAIN] Gagal simpan gambar:', err);
    } else {
      console.log('[MAIN] Gambar disimpan:', filepath);
    }
  });
}
