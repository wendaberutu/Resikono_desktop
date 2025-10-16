let kode_user_saat_ini = "1122";
let kontrasThreshold = 20;
let gelapThreshold = 200;
let minArea = 1;
let maxArea = 30;
let batasKotor = 5; // 🔹 Tambahan baru

function showKodeUserModal() {
    document.getElementById("modalKodeUser").classList.remove("hidden");
    document.getElementById("inputKodeUser").value = "";
}

function tutupKodeUserModal() {
    document.getElementById("modalKodeUser").classList.add("hidden");
}

function verifikasiKodeUser() {
    const kodeInput = document.getElementById("inputKodeUser").value.trim();
    if (kodeInput === kode_user_saat_ini) {
        tutupKodeUserModal();
        showModalSetting(); // buka menu setting utama
    } else {
        showAlert("Kode user salah!", "error");
    }
}

function showModalSetting() {
    document.getElementById("modalSetting").classList.remove("hidden");
}

function tutupModalSetting() {
    document.getElementById("modalSetting").classList.add("hidden");
}

function bukaModalUbahKodeUser() {
    document.getElementById("kodeLama").value = "";
    document.getElementById("kodeBaru").value = "";
    document.getElementById("konfirmasiKodeBaru").value = "";
    document.getElementById("modalUbahKodeUser").classList.remove("hidden");
}

function tutupModalUbahKodeUser() {
    document.getElementById("modalUbahKodeUser").classList.add("hidden");
}

async function simpanKodeUserBaru() {
    const lama = document.getElementById("kodeLama").value.trim();
    const baru = document.getElementById("kodeBaru").value.trim();
    const konfirmasi = document.getElementById("konfirmasiKodeBaru").value.trim();

    if (lama !== kode_user_saat_ini) {
        showAlert("Kode lama salah!", "error");
        return;
    }
    if (baru.length < 3) {
        showAlert("Kode baru terlalu pendek!", "error");
        return;
    }
    if (baru !== konfirmasi) {
        showAlert("Kode baru tidak cocok!", "error");
        return;
    }

    const settingsData = {
        kodeUser: baru,
        kontrasThreshold,
        gelapThreshold,
        minArea,
        maxArea,
        batasKotor, // 🔹 sertakan juga
    };

    const result = await window.electronAPI.saveSettings(settingsData);

    if (result.status) {
        kode_user_saat_ini = baru;
        showAlert("Kode user berhasil diperbarui!", "success");
        tutupModalUbahKodeUser();
    } else {
        showAlert("Gagal menyimpan kode user: " + result.message, "error");
    }
}

async function simpanPengaturan() {
    const newKontrasThreshold = parseFloat(
        document.getElementById("kontrasSliderPopup").value
    );
    const newGelapThreshold = parseFloat(
        document.getElementById("gelapSliderPopup").value
    );
    const newMinArea = parseFloat(
        document.getElementById("minAreaSliderPopup").value
    );
    const newMaxArea = parseFloat(
        document.getElementById("maxAreaSliderPopup").value
    );
    const newBatasKotor = parseFloat(
        document.getElementById("batasKotorSliderPopup").value
    ); // 🔹 tambahan baru

    const settingsData = {
        kodeUser: kode_user_saat_ini,
        kontrasThreshold: newKontrasThreshold,
        gelapThreshold: newGelapThreshold,
        minArea: newMinArea,
        maxArea: newMaxArea,
        batasKotor: newBatasKotor, // 🔹 simpan ke JSON
    };

    const result = await window.electronAPI.saveSettings(settingsData);

    if (result.status) {
        showAlert("Pengaturan berhasil disimpan!", "success");
        tutupModalSetting();
    } else {
        showAlert("Gagal menyimpan pengaturan: " + result.message, "error");
    }
}

async function loadPengaturanAwal() {
    const result = await window.electronAPI.loadSettings();

    if (result.status) {
        const settings = result.data;

        kontrasThreshold = typeof settings.kontrasThreshold === "number" ? settings.kontrasThreshold : 20;
        gelapThreshold = typeof settings.gelapThreshold === "number" ? settings.gelapThreshold : 200;
        minArea = typeof settings.minArea === "number" ? settings.minArea : 1;
        maxArea = typeof settings.maxArea === "number" ? settings.maxArea : 30;
        batasKotor = typeof settings.batasKotor === "number" ? settings.batasKotor : 5; // 🔹 ambil dari file
        kode_user_saat_ini = settings.kodeUser;

        document.getElementById("kontrasSliderPopup").value = kontrasThreshold;
        document.getElementById("kontrasValPopup").textContent = kontrasThreshold;

        document.getElementById("gelapSliderPopup").value = gelapThreshold;
        document.getElementById("gelapValPopup").textContent = gelapThreshold;

        document.getElementById("minAreaSliderPopup").value = minArea;
        document.getElementById("minAreaValPopup").textContent = minArea;

        document.getElementById("maxAreaSliderPopup").value = maxArea;
        document.getElementById("maxAreaValPopup").textContent = maxArea;

        document.getElementById("batasKotorSliderPopup").value = batasKotor;
        document.getElementById("batasKotorValPopup").textContent = batasKotor;
    } else {
        showAlert("Pengaturan awal gagal dimuat. Gunakan pengaturan default.", "info");
    }
}

// ===================================
// fungsi popUP
// =============================
function showLoading() {
    document.getElementById("loadingPopup").style.display = "flex";
}

function hideLoading() {
    document.getElementById("loadingPopup").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
    loadPengaturanAwal();
});
