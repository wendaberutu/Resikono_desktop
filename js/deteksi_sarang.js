// React State implementation in Vanilla JS
const useState = (defaultValue) => {
  let value = defaultValue;
  const getValue = () => value;
  const setValue = (newValue) => (value = newValue);
  return [getValue, setValue];
};

// Declare variables
const numClass = 2;
const [session, setSession] = useState(null);
let mySession;

const modelInputBadanShape = [1, 3, 320, 320];
const topk = 1; //maks jumlah objek hasil deteksi
const iouThreshold = 0.3;
const scoreThreshold = 0.3;

const detectImageTinggi = async (image, canvas, session, kode_kamera) => {
  const ctx = canvas.getContext("2d");
  const W = image.width,
    H = image.height;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const modelWidth = 320,
    modelHeight = 320;
  const [input, xRatio, yRatio] = preprocessing(image, modelWidth, modelHeight);

  const tensor = new ort.Tensor("float32", input.data32F, [
    1,
    3,
    modelHeight,
    modelWidth,
  ]);
  const t0 = performance.now();

  let results = [];
  let output = [];
  if (kode_kamera == "BW") {
    const results = await session.netKaki.run({
      [session.netKaki.inputNames[0]]: tensor,
    });

      output = results[session.netKaki.outputNames[0]];
  } else {
    const results = await session.netMangkok.run({
      [session.netMangkok.inputNames[0]]: tensor,
    });

      output = results[session.netMangkok.outputNames[0]];
  }

  const t1 = performance.now();

  console.log(`⏱ ONNX Inference time (ms): ${(t1 - t0).toFixed(2)}`);



  const [_, nClass, height, width] = output.dims;
  const data = output.data;

  // --- Argmax langsung pakai TypedArray ---
  const mask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    let maxScore = data[i],
      maxClass = 0;
    for (let c = 1; c < nClass; c++) {
      const s = data[c * width * height + i];
      if (s > maxScore) {
        maxScore = s;
        maxClass = c;
      }
    }
    mask[i] = maxClass > 0 ? 255 : 0;
  }

  // --- Buat cv.Mat mask langsung ---
  const maskMat = cv.matFromArray(height, width, cv.CV_8UC1, mask);

  // --- Find contours ---
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(
    maskMat,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  const allContours = [];
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const pts = cnt.data32S;
    const contourPoints = [];
    for (let j = 0; j < pts.length; j += 2) {
      let x = Math.round((pts[j] * (W * xRatio)) / modelWidth);
      let y = Math.round((pts[j + 1] * (H * yRatio)) / modelHeight);
      x = Math.max(0, Math.min(W - 1, x));
      y = Math.max(0, Math.min(H - 1, y));
      contourPoints.push([x, y]);
    }
    allContours.push(contourPoints);
    cnt.delete();
  }

  // --- Draw final mask langsung pakai ImageData ---
  const imgCanvas = document.createElement("canvas");
  imgCanvas.width = width;
  imgCanvas.height = height;
  const imgCtx = imgCanvas.getContext("2d");
  imgCtx.drawImage(image, 0, 0, width, height);
  const imgData = imgCtx.getImageData(0, 0, width, height);

  for (let i = 0; i < width * height; i++) {
    imgData.data[i * 4 + 3] = mask[i]; // alpha
  }

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = W;
  finalCanvas.height = H;
  const fCtx = finalCanvas.getContext("2d");
  fCtx.putImageData(imgData, 0, 0);
  ctx.drawImage(finalCanvas, 0, 0, W, H);

  // Cleanup
  maskMat.delete();
  contours.delete();
  hierarchy.delete();

  return [allContours, allContours.length];
};

/**
 * Preprocessing image
 * @param {HTMLImageElement} source image source
 * @param {Number} modelWidth model input width
 * @param {Number} modelHeight model input height
 * @param {Number} stride model stride
 * @return preprocessed image and configs
 */
const preprocessing = (source, modelWidth, modelHeight, stride = 32) => {
  const mat = cv.imread(source); // read from img tag
  const matC3 = new cv.Mat(mat.rows, mat.cols, cv.CV_8UC3); // new image matrix
  cv.cvtColor(mat, matC3, cv.COLOR_RGBA2BGR); // RGBA to BGR

  const [w, h] = divStride(stride, matC3.cols, matC3.rows);
  cv.resize(matC3, matC3, new cv.Size(w, h));

  // padding image to [n x n] dim
  const maxSize = Math.max(matC3.rows, matC3.cols); // get max size from width and height
  const xPad = maxSize - matC3.cols, // set xPadding
    xRatio = maxSize / matC3.cols; // set xRatio
  const yPad = maxSize - matC3.rows, // set yPadding
    yRatio = maxSize / matC3.rows; // set yRatio
  const matPad = new cv.Mat(); // new mat for padded image
  cv.copyMakeBorder(matC3, matPad, 0, yPad, 0, xPad, cv.BORDER_CONSTANT); // padding black

  const input = cv.blobFromImage(
    matPad,
    1 / 255.0, // normalize
    new cv.Size(modelWidth, modelHeight), // resize to model input size
    new cv.Scalar(0, 0, 0),
    true, // swapRB
    false // crop
  ); // preprocessing image matrix

  // release mat opencv
  mat.delete();
  matC3.delete();
  matPad.delete();

  return [input, xRatio, yRatio];
};

/**
 * Get divisible image size by stride
 * @param {Number} stride
 * @param {Number} width
 * @param {Number} height
 * @returns {Number[2]} image size [w, h]
 */
const divStride = (stride, width, height) => {
  if (width % stride !== 0) {
    if (width % stride >= stride / 2)
      width = (Math.floor(width / stride) + 1) * stride;
    else width = Math.floor(width / stride) * stride;
  }
  if (height % stride !== 0) {
    if (height % stride >= stride / 2)
      height = (Math.floor(height / stride) + 1) * stride;
    else height = Math.floor(height / stride) * stride;
  }
  return [width, height];
};

/**
 * Handle overflow boxes based on maxSize
 * @param {Number[4]} box box in [x, y, w, h] format
 * @param {Number} maxSize
 * @returns non overflow boxes
 */
const overflowBoxes = (box, maxSize) => {
  box[0] = box[0] >= 0 ? box[0] : 0;
  box[1] = box[1] >= 0 ? box[1] : 0;
  box[2] = box[0] + box[2] <= maxSize ? box[2] : maxSize - box[0];
  box[3] = box[1] + box[3] <= maxSize ? box[3] : maxSize - box[1];
  return box;
};

class Colors {
  // ultralytics color palette https://ultralytics.com/
  constructor() {
    this.palette = ["#00FF00"];
    this.n = this.palette.length;
  }

  get = (i) => this.palette[Math.floor(i) % this.n];

  static hexToRgba = (hex, alpha) => {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16),
          alpha,
        ]
      : null;
  };
}

const colors = new Colors();
const yellow = new cv.Scalar(0, 255, 255, 255); // BGRA kuning
const red = new cv.Scalar(0, 0, 255, 255); // BGRA merah
const green = new cv.Scalar(0, 255, 0, 255); // BGRA hijau
const white = new cv.Scalar(255, 255, 255, 255); // BGRA putih
const blue = new cv.Scalar(255, 0, 0, 255); // BGRA biru
function getContourArea(contour) {
  // Hitung area dengan rumus shoelace (luas poligon)
  let area = 0;
  for (let i = 0; i < contour.length; i++) {
    const [x1, y1] = contour[i];
    const [x2, y2] = contour[(i + 1) % contour.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

async function runInference_deteksi(img_data, kode_kamera) {
  const img = new Image();
  img.src = img_data;
  await img.decode();

  const W = img.width;
  const H = img.height;

  const t0 = performance.now();
  const [allContours, jumlah] = await detectImageTinggi(
    img,
    document.createElement("canvas"),
    mySession,
    modelInputBadanShape,
    kode_kamera
  );
  const t1 = performance.now();

  console.log("detectImageTinggi execution time (ms):", (t1 - t0).toFixed(2));

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = W;
  finalCanvas.height = H;
  const finalCtx = finalCanvas.getContext("2d");

  // background putih
  finalCtx.fillStyle = "white";
  finalCtx.fillRect(0, 0, W, H);

  // === pilih kontur terbesar saja ===
  let biggestContour = null;
  if (allContours.length > 0) {
    biggestContour = allContours.reduce((maxC, c) =>
      getContourArea(c) > getContourArea(maxC) ? c : maxC
    );
  }

  if (biggestContour) {
    const contour = biggestContour;

    // --- Buat mask alpha murni ---
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = W;
    maskCanvas.height = H;
    const maskCtx = maskCanvas.getContext("2d");

    maskCtx.fillStyle = "black";
    maskCtx.fillRect(0, 0, W, H);

    maskCtx.save();
    maskCtx.beginPath();
    maskCtx.moveTo(contour[0][0], contour[0][1]);
    for (let j = 1; j < contour.length; j++)
      maskCtx.lineTo(contour[j][0], contour[j][1]);
    maskCtx.closePath();
    maskCtx.clip();

    maskCtx.fillStyle = "white";
    maskCtx.fillRect(0, 0, W, H);
    maskCtx.restore();

    // --- Apply mask ke gambar asli ---
    const imgCanvas = document.createElement("canvas");
    imgCanvas.width = W;
    imgCanvas.height = H;
    const imgCtx = imgCanvas.getContext("2d");
    imgCtx.drawImage(img, 0, 0, W, H);

    const maskData = maskCtx.getImageData(0, 0, W, H);
    const imgData = imgCtx.getImageData(0, 0, W, H);

    for (let i = 0; i < maskData.data.length; i += 4) {
      imgData.data[i + 3] = maskData.data[i]; // alpha
    }
    imgCtx.putImageData(imgData, 0, 0);

    // --- Tempel hasil masking ke canvas akhir ---
    finalCtx.drawImage(imgCanvas, 0, 0);

    // --- Tambah outline putih KELUAR kontur ---
    finalCtx.save();
    finalCtx.beginPath();
    finalCtx.moveTo(contour[0][0], contour[0][1]);
    for (let j = 1; j < contour.length; j++)
      finalCtx.lineTo(contour[j][0], contour[j][1]);
    finalCtx.closePath();
    finalCtx.strokeStyle = "white";
    finalCtx.lineWidth = 6;
    finalCtx.lineJoin = "round";
    finalCtx.stroke();
    finalCtx.restore();
  }

  console.log("Input image size: ", W, "x", H);
  console.log("Number of detected contours: ", allContours.length);

  return [finalCanvas.toDataURL("image/png"), allContours.length];
}
