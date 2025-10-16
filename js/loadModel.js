cv["onRuntimeInitialized"] = async () => {
  console.log("OpenCV.js loaded");
  // Tampilkan pop-up loading
  document.getElementById("loadingPopup").style.display = "flex";

  const modelInputShape = [1, 3, 320, 320];
  const topk = 100; //maks jumlah objek hasil deteksi
  const iouThreshold = 0.5;
  const scoreThreshold = 0.5;

  // Buat session untuk model
  const [model_mangkok, model_kaki, nms, mask] = await Promise.all([
    ort.InferenceSession.create(`models/model_deteksi_sarang_mangkok.onnx`),
    ort.InferenceSession.create(`models/model_deteksi_kaki_sarang_magkok.onnx`),
    ort.InferenceSession.create(`models/nms-yolov8.onnx`),
    ort.InferenceSession.create("models/mask-yolov8-seg.onnx"),
  ]);

  // Warmup untuk model utama
  const tensor = new ort.Tensor(
    "float32",
    new Float32Array(modelInputShape.reduce((a, b) => a * b)),
    modelInputShape
  );

  const feedsMangkok = { input: tensor };
  await model_mangkok.run(feedsMangkok);

  const feedsKaki = { input: tensor };
  await model_mangkok.run(feedsKaki);

  mySession = setSession({
    netMangkok: model_mangkok,
    netKaki: model_kaki,
    nms: nms,
    mask: mask,
  });

  console.log("Models loaded");

  // Sembunyikan pop-up loading setelah model selesai dimuat
  document.getElementById("loadingPopup").style.display = "none";
};
