/**
 * Menampilkan alert menggunakan SweetAlert2 (non-blocking, tidak bikin freeze)
 * @param {string} message - Pesan yang akan ditampilkan.
 * @param {'success' | 'error' | 'info' | 'warning' | 'question'} type - Jenis alert.
 * @returns {Promise<void>} - Resolve setelah user menekan OK.
 */
function showAlert(message, type = "info") {
  // Pilih icon sesuai tipe (emoji, atau bisa diganti <img src="...">)
  const iconMap = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    question: '❓'
  };

  // Pilih warna tombol OK sesuai tipe
  const colorMap = {
    success: "#16a34a", // hijau
    error: "#dc2626",   // merah
    warning: "#f59e0b", // kuning
    info: "#3b82f6",    // biru
    question: "#3b82f6"
  };

  // Pilih judul sesuai tipe
  const titleMap = {
    success: "Berhasil",
    error: "Gagal",
    warning: "Peringatan",
    info: "Info",
    question: "Konfirmasi"
  };

  // HTML layout rapi, icon center, judul bawahnya
  return Swal.fire({
    html: `
      <div style="display:flex; flex-direction:column; align-items:center;">
        <div style="font-size:70px; margin-bottom:10px;">${iconMap[type] || iconMap.info}</div>
        <div style="font-size:2rem; font-weight:bold; margin-bottom:8px;">${titleMap[type] || titleMap.info}</div>
        <div style="font-size:1.1rem;">${message}</div>
      </div>
    `,
    showConfirmButton: true,
    confirmButtonText: "OK",
    confirmButtonColor: colorMap[type] || colorMap.info,
    background: "#fff",
    color: "#333",
    allowOutsideClick: false,
    allowEscapeKey: true,
  });
}



/**
 * Menampilkan dialog konfirmasi (OK / Batal) menggunakan SweetAlert2
 * @param {string} message - Pesan konfirmasi
 * @param {'warning' | 'question'} type - Jenis icon
 * @returns {Promise<boolean>} - True jika user tekan OK, false jika Batal
 */
function showConfirm(message, type = "question") {
  return Swal.fire({
    title: "Konfirmasi",
    text: message,
    icon: type,
    showCancelButton: true,
    confirmButtonText: "OK",
    cancelButtonText: "Batal",
    confirmButtonColor: "#3b82f6",
    cancelButtonColor: "#6b7280",
    background: "#fff",
    color: "#333",
  }).then((result) => result.isConfirmed);
}


// Fungsi untuk menutup alert (jika dipanggil dari HTML)
function closeCustomAlert() {
  const modal =
    document.getElementById("customAlertModal") ||
    document.getElementById("customAlert");
  if (modal) modal.classList.add("hidden");
}
