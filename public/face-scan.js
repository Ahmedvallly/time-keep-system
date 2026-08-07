const FACE_MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
const FACE_MATCH_THRESHOLD = 0.5;
const FACE_SCAN_INTERVAL_MS = 1400;
const FACE_SCAN_COOLDOWN_MS = 12000;

const summaryNode = document.getElementById("mobileSummary");
const faceScanVideo = document.getElementById("mobileFaceScanVideo");
const faceStatus = document.getElementById("mobileFaceStatus");
const faceHint = document.getElementById("mobileFaceHint");
const activityNode = document.getElementById("mobileActivity");

let employees = [];
let faceModelsReady = false;
let faceModelsLoading = null;
let faceScanTimer = null;
let faceScanBusy = false;
let lastMatchedEmployeeCode = "";
let lastMatchedAt = 0;
let refreshTimer = null;

async function refreshAll() {
  await Promise.all([loadEmployees(), loadDashboard()]);
}

async function loadEmployees() {
  const response = await fetch("/api/employees");
  employees = await response.json();
}

async function loadDashboard() {
  const month = new Date().toISOString().slice(0, 7);
  const response = await fetch(`/api/dashboard?month=${month}`);
  const data = await response.json();
  window.__latestTodayScans = data.todayScans;
  renderSummary(data.workers, data.todayScans);
  renderActivity(data.todayScans);
}

function renderSummary(workers, todayScans) {
  const workingCount = workers.filter((worker) => worker.status === "Working").length;
  const finishedCount = workers.filter((worker) => worker.status === "Finished").length;
  const readyFaces = workers.filter((worker) => {
    const employee = employees.find((entry) => entry.code === worker.code);
    return employee && Array.isArray(employee.faceDescriptor) && employee.faceDescriptor.length === 128;
  }).length;

  summaryNode.innerHTML = [
    summaryCard("Today scans", String(todayScans.length), "Live today"),
    summaryCard("Working", String(workingCount), "Currently in"),
    summaryCard("Finished", String(finishedCount), "Clocked out"),
    summaryCard("Workers", String(workers.length), "Total staff"),
    summaryCard("Faces ready", String(readyFaces), "Can scan"),
    summaryCard("Scanner", faceModelsReady ? "Ready" : "Loading", "Front camera")
  ].join("");
}

function summaryCard(label, value, helper) {
  return `
    <article class="mobile-stat">
      <p>${escapeHtml(label)}</p>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(helper)}</span>
    </article>
  `;
}

function renderActivity(scans) {
  if (scans.length === 0) {
    activityNode.innerHTML = `<p class="mobile-empty">No scans yet today.</p>`;
    return;
  }

  activityNode.innerHTML = scans
    .map(
      (scan) => `
        <article class="mobile-row">
          <div>
            <strong>${escapeHtml(scan.employeeName)}</strong>
            <p>${escapeHtml(formatEvent(scan.type))}</p>
          </div>
          <time>${escapeHtml(formatDateTime(scan.timestamp))}</time>
        </article>
      `
    )
    .join("");
}

async function startScanner() {
  await startVideoStream(faceScanVideo);
  await ensureFaceModels();
  startFaceScanLoop();
}

async function startVideoStream(video) {
  if (video.srcObject) {
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 720 },
      height: { ideal: 1280 }
    }
  });

  video.srcObject = stream;
  await video.play();
  await waitForVideoReady(video);
}

async function ensureFaceModels() {
  if (faceModelsReady) {
    return;
  }

  if (!faceModelsLoading) {
    faceModelsLoading = (async () => {
      setMessage(faceStatus, "Loading face models...");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL)
      ]);
      faceModelsReady = true;
      setMessage(faceStatus, "Face scanner ready.");
      faceHint.textContent = "One worker at a time. Hold still for a moment.";
    })();
  }

  return faceModelsLoading;
}

function startFaceScanLoop() {
  if (faceScanTimer) {
    return;
  }

  faceScanTimer = setInterval(() => {
    scanCurrentFace().catch((error) => {
      setMessage(faceStatus, error.message, true);
    });
  }, FACE_SCAN_INTERVAL_MS);
}

async function scanCurrentFace() {
  if (!faceModelsReady || !faceScanVideo.srcObject || faceScanBusy) {
    return;
  }

  if (employees.filter(hasRegisteredFace).length === 0) {
    setMessage(faceStatus, "No saved worker faces yet.", true);
    return;
  }

  faceScanBusy = true;

  try {
    const detection = await detectFaceDescriptor(faceScanVideo);
    const match = findBestFaceMatch(detection.descriptor);

    if (!match) {
      faceHint.textContent = "Face found, but no saved worker matched it.";
      return;
    }

    const now = Date.now();
    if (match.employee.code === lastMatchedEmployeeCode && now - lastMatchedAt < FACE_SCAN_COOLDOWN_MS) {
      faceHint.textContent = `${match.employee.name} was just scanned. Waiting a moment before scanning again.`;
      return;
    }

    setMessage(faceStatus, `Recognized ${match.employee.name}. Saving scan...`);
    const data = await sendJson("/api/scans", {
      method: "POST",
      body: {
        employeeCode: match.employee.code,
        requestedType: faceScanRequestedType(match.employee.code)
      }
    });

    lastMatchedEmployeeCode = match.employee.code;
    lastMatchedAt = now;
    const greeting = greetingForEvent(data.scan.type, data.scan.employeeName);
    setMessage(faceStatus, greeting);
    faceHint.textContent = `${formatEvent(data.scan.type)} at ${formatDateTime(data.scan.timestamp)}.`;
    speakMessage(greeting);
    await refreshAll();
  } finally {
    faceScanBusy = false;
  }
}

async function detectFaceDescriptor(source) {
  const detection = await faceapi
    .detectSingleFace(source, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (!detection) {
    throw new Error("No face detected. Move closer and keep one face in the frame.");
  }

  return detection;
}

function findBestFaceMatch(descriptor) {
  let best = null;

  for (const employee of employees.filter(hasRegisteredFace)) {
    const distance = faceapi.euclideanDistance(descriptor, employee.faceDescriptor);
    if (distance > FACE_MATCH_THRESHOLD) {
      continue;
    }

    if (!best || distance < best.distance) {
      best = { employee, distance };
    }
  }

  return best;
}

function faceScanRequestedType(employeeCode) {
  const today = todayDateValue();
  const employeeRows = Array.isArray(window.__latestTodayScans)
    ? window.__latestTodayScans.filter((scan) => scan.employeeCode === employeeCode)
    : [];

  if (employeeRows.length === 0) {
    return "clock_in";
  }

  const lastScan = employeeRows
    .filter((scan) => String(scan.timestamp || "").startsWith(today))
    .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))[0];

  if (!lastScan) {
    return "clock_in";
  }

  return lastScan.type === "clock_in" ? "clock_out" : "clock_in";
}

function greetingForEvent(type, employeeName) {
  return type === "clock_in" ? `Welcome ${employeeName}` : `Bye ${employeeName}`;
}

function speakMessage(message) {
  if (!("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function hasRegisteredFace(employee) {
  return Array.isArray(employee.faceDescriptor) && employee.faceDescriptor.length === 128;
}

async function sendJson(url, { method, body }) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

async function waitForVideoReady(video) {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    return;
  }

  await new Promise((resolve) => {
    const onReady = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      resolve();
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
  });
}

function setMessage(node, text, isError = false) {
  node.textContent = text;
  node.classList.toggle("negative", Boolean(isError));
  node.classList.toggle("positive", !isError && Boolean(text));
}

function formatEvent(type) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

refreshAll()
  .then(startScanner)
  .catch((error) => {
    setMessage(faceStatus, error.message, true);
  });

refreshTimer = setInterval(() => {
  refreshAll().catch(() => {});
}, 10000);

window.addEventListener("beforeunload", () => {
  if (faceScanTimer) {
    clearInterval(faceScanTimer);
  }
  const stream = faceScanVideo.srcObject;
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});
