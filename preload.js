const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onFrame: (callback) =>
    ipcRenderer.on("frame", (event, data) => callback(data)),
  requestImage: (inputParam) => {
    // inputParam bisa berupa string atau object
    ipcRenderer.send("request-image", inputParam);
  },

  FokuskanKamera: (inputParamKamera) => {
    // inputParam bisa berupa string atau object
    ipcRenderer.send("request-fokus", inputParamKamera);
  },

  simpanGambar: (base64img, kodeAlat) => {
    // inputParam bisa berupa string atau object
    ipcRenderer.send("simpan-gambar", base64img, kodeAlat);
  },

  onStatusFokus: (callback) =>
    ipcRenderer.on("status-fokus", (event, data) => callback(data)),

  saveSettings: (data) => ipcRenderer.invoke("saveSettings", data),
  loadSettings: () => ipcRenderer.invoke("loadSettings"),
});
