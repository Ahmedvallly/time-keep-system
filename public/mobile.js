const EVENT_TYPES = ["clock_in", "clock_out"];
const FACE_MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
const FACE_MATCH_THRESHOLD = 0.5;
const FACE_SCAN_INTERVAL_MS = 1400;
const FACE_SCAN_COOLDOWN_MS = 12000;

const monthPicker = document.getElementById("mobileMonthPicker");
const summaryNode = document.getElementById("mobileSummary");
const faceScanVideo = document.getElementById("mobileFaceScanVideo");
const workerVideo = document.getElementById("mobileWorkerVideo");
const workerCanvas = document.getElementById("mobileWorkerCanvas");
const faceStatus = document.getElementById("mobileFaceStatus");
const faceHint = document.getElementById("mobileFaceHint");
const workerForm = document.getElementById("mobileWorkerForm");
const workerMessage = document.getElementById("mobileWorkerMessage");
const captureFaceButton = document.getElementById("mobileCaptureFaceButton");
const facePreview = document.getElementById("mobileFacePreview");
const workersNode = document.getElementById("mobileWorkers");
const manualForm = document.getElementById("mobileManualForm");
const employeeSelect = document.getElementById("mobileEmployeeCode");
const timestampInput = document.getElementById("mobileTimestamp");
const manualMessage = document.getElementById("mobileManualMessage");
const leaveForm = document.getElementById("mobileLeaveForm");
const leaveEmployeeCode = document.getElementById("mobileLeaveEmployeeCode");
const leaveType = document.getElementById("mobileLeaveType");
const leaveStartDate = document.getElementById("mobileLeaveStartDate");
const leaveEndDate = document.getElementById("mobileLeaveEndDate");
const leaveReason = document.getElementById("mobileLeaveReason");
const leaveSubmitButton = document.getElementById("mobileLeaveSubmitButton");
const leaveCancelButton = document.getElementById("mobileLeaveCancelButton");
const leaveMessage = document.getElementById("mobileLeaveMessage");
const holidayForm = document.getElementById("mobileHolidayForm");
const holidayDate = document.getElementById("mobileHolidayDate");
const holidayMessage = document.getElementById("mobileHolidayMessage");
const activityNode = document.getElementById("mobileActivity");
const timesNode = document.getElementById("mobileTimes");
const leaveBalancesNode = document.getElementById("mobileLeaveBalances");
const leavesNode = document.getElementById("mobileLeaves");
const holidaysNode = document.getElementById("mobileHolidays");
const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

let employees = [];
let refreshTimer = null;
let editingLeaveId = null;
let activeTab = "face-scan";
let faceModelsReady = false;
let faceModelsLoading = null;
let faceScanTimer = null;
let faceScanBusy = false;
let lastMatchedEmployeeCode = "";
let lastMatchedAt = 0;
let capturedFaceDescriptor = [];
let capturedFacePreviewUrl = "";

monthPicker.value = new Date().toISOString().slice(0, 7);
timestampInput.value = nowLocalValue();
leaveStartDate.value = todayDateValue();
leaveEndDate.value = todayDateValue();
holidayDate.value = todayDateValue();

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab || "face-scan");
  });
}

captureFaceButton.addEventListener("click", async () => {
  captureFaceButton.disabled = true;
  setMessage(workerMessage, "Capturing face...");

  try {
    await ensureFaceModels();
    const descriptor = await detectFaceDescriptor(workerVideo);
    capturedFaceDescriptor = descriptor;
    capturedFacePreviewUrl = captureVideoFrame(workerVideo, workerCanvas);
    renderFacePreview();
    setMessage(workerMessage, "Face captured. Save the worker now.");
  } catch (error) {
    setMessage(workerMessage, error.message, true);
  } finally {
    captureFaceButton.disabled = false;
  }
});

workerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(workerForm);

  if (capturedFaceDescriptor.length !== 128) {
    setMessage(workerMessage, "Capture the worker face before saving.", true);
    return;
  }

  setMessage(workerMessage, "Saving worker...");

  try {
    const employee = await sendJson("/api/employees", {
      method: "POST",
      body: {
        name: formData.get("name"),
        code: formData.get("code"),
        monthlyTargetHours: Number(formData.get("monthlyTargetHours")),
        notes: formData.get("notes"),
        faceDescriptor: capturedFaceDescriptor
      }
    });

    workerForm.reset();
    document.getElementById("mobileWorkerTargetHours").value = "176";
    capturedFaceDescriptor = [];
    capturedFacePreviewUrl = "";
    renderFacePreview();
    setMessage(workerMessage, `Saved ${employee.name} with a face profile.`);
    await refreshAll();
  } catch (error) {
    setMessage(workerMessage, error.message, true);
  }
});

manualForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(manualForm);
  setMessage(manualMessage, "Saving time row...");

  try {
    const scan = await sendJson("/api/scans/manual", {
      method: "POST",
      body: {
        employeeCode: formData.get("employeeCode"),
        timestamp: formData.get("timestamp"),
        type: formData.get("type")
      }
    });

    timestampInput.value = nowLocalValue();
    setMessage(manualMessage, `Saved ${scan.employeeName} at ${formatDateTime(scan.timestamp)}.`);
    await refreshAll();
  } catch (error) {
    setMessage(manualMessage, error.message, true);
  }
});

leaveForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(leaveForm);
  const actionLabel = editingLeaveId ? "Updated" : "Saved";
  setMessage(leaveMessage, editingLeaveId ? "Updating leave..." : "Saving leave...");

  try {
    const leave = await sendJson(editingLeaveId ? `/api/leaves/${editingLeaveId}` : "/api/leaves", {
      method: editingLeaveId ? "PUT" : "POST",
      body: {
        employeeCode: formData.get("employeeCode"),
        leaveType: formData.get("leaveType"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        reason: formData.get("reason")
      }
    });

    resetLeaveForm();
    setMessage(leaveMessage, `${actionLabel} leave for ${leave.employeeName}: ${Number(leave.days).toFixed(2)} day(s).`);
    await refreshAll();
  } catch (error) {
    setMessage(leaveMessage, error.message, true);
  }
});

leaveCancelButton.addEventListener("click", () => {
  resetLeaveForm();
  setMessage(leaveMessage, "Leave edit cancelled.");
});

holidayForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(holidayForm);
  setMessage(holidayMessage, "Saving holiday...");

  try {
    const holiday = await sendJson("/api/holidays", {
      method: "POST",
      body: {
        date: formData.get("date"),
        name: formData.get("name")
      }
    });

    holidayForm.reset();
    holidayDate.value = todayDateValue();
    setMessage(holidayMessage, `Saved holiday ${holiday.name} on ${holiday.date}.`);
    await refreshAll();
  } catch (error) {
    setMessage(holidayMessage, error.message, true);
  }
});

monthPicker.addEventListener("change", refreshAll);

async function refreshAll() {
  await loadEmployees();
  await Promise.all([loadDashboard(), loadTimes(), loadLeaves(), loadHolidays()]);
}

async function loadDashboard() {
  const response = await fetch(`/api/dashboard?month=${monthPicker.value}`);
  const data = await response.json();
  window.__latestTodayScans = data.todayScans;
  renderSummary(data.workers, data.todayScans);
  renderActivity(data.todayScans);
}

async function loadTimes() {
  const response = await fetch(`/api/times?month=${monthPicker.value}`);
  const data = await response.json();
  renderEmployeeOptions(data.employees);
  renderTimes(data.rows);
}

async function loadLeaves() {
  const response = await fetch(`/api/leaves?month=${monthPicker.value}`);
  const data = await response.json();
  renderLeaveBalances(data.balances);
  renderLeaves(data.rows);
}

async function loadHolidays() {
  const response = await fetch(`/api/holidays?month=${monthPicker.value}`);
  const data = await response.json();
  renderHolidays(data.rows);
}

async function loadEmployees() {
  const response = await fetch("/api/employees");
  employees = await response.json();
  renderEmployeeOptions(employees);
  renderWorkers();
}

function renderSummary(workers, todayScans) {
  const workingCount = workers.filter((worker) => worker.status === "Working").length;
  const breakCount = workers.filter((worker) => worker.status === "On break").length;
  const finishedCount = workers.filter((worker) => worker.status === "Finished").length;
  const absentCount = workers.filter((worker) => Number(worker.absentDays || 0) > 0).length;
  const readyFaces = workers.filter((worker) => {
    const employee = employees.find((entry) => entry.code === worker.code);
    return employee && Array.isArray(employee.faceDescriptor) && employee.faceDescriptor.length === 128;
  }).length;

  summaryNode.innerHTML = [
    summaryCard("Today scans", String(todayScans.length), "Live today"),
    summaryCard("Working", String(workingCount), "Currently in"),
    summaryCard("On break", String(breakCount), "Break status"),
    summaryCard("Finished", String(finishedCount), "Done today"),
    summaryCard("Workers", String(workers.length), "Total staff"),
    summaryCard("Faces ready", String(readyFaces), "Can scan")
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

function renderEmployeeOptions(list) {
  const previousManual = employeeSelect.value;
  const previousLeave = leaveEmployeeCode.value;
  employeeSelect.innerHTML = `<option value="">Select worker</option>`;
  leaveEmployeeCode.innerHTML = `<option value="">Select worker</option>`;

  for (const employee of list) {
    const option = document.createElement("option");
    option.value = employee.code;
    option.textContent = `${employee.code} - ${employee.name}`;
    employeeSelect.appendChild(option);

    const leaveOption = document.createElement("option");
    leaveOption.value = employee.code;
    leaveOption.textContent = `${employee.code} - ${employee.name}`;
    leaveEmployeeCode.appendChild(leaveOption);
  }

  employeeSelect.value = previousManual;
  leaveEmployeeCode.value = previousLeave;
}

function renderWorkers() {
  if (employees.length === 0) {
    workersNode.innerHTML = `<p class="mobile-empty">No workers saved yet.</p>`;
    return;
  }

  workersNode.innerHTML = employees
    .map((employee) => {
      const hasFace = Array.isArray(employee.faceDescriptor) && employee.faceDescriptor.length === 128;
      return `
        <article class="mobile-data-card">
          <div class="mobile-card-topline">
            <strong>${escapeHtml(employee.name)}</strong>
            <span class="mobile-badge">${hasFace ? "Face ready" : "No face"}</span>
          </div>
          <div class="mobile-detail-list">
            <p><span>Code</span>${escapeHtml(employee.code)}</p>
            <p><span>Target hours</span>${Number(employee.monthlyTargetHours || 0).toFixed(2)}</p>
            <p><span>Notes</span>${escapeHtml(employee.notes || "No notes")}</p>
          </div>
        </article>
      `;
    })
    .join("");
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

function renderTimes(rows) {
  if (rows.length === 0) {
    timesNode.innerHTML = `<p class="mobile-empty">No time rows for this month.</p>`;
    return;
  }

  const employeeOptions = employees
    .map((employee) => `<option value="${escapeHtml(employee.code)}">${escapeHtml(employee.code)} - ${escapeHtml(employee.name)}</option>`)
    .join("");

  const eventOptions = EVENT_TYPES
    .map((type) => `<option value="${type}">${escapeHtml(formatEvent(type))}</option>`)
    .join("");

  timesNode.innerHTML = "";

  for (const row of rows) {
    const article = document.createElement("article");
    article.className = "mobile-data-card";
    article.innerHTML = `
      <div class="mobile-card-topline">
        <strong>${escapeHtml(row.employeeName)}</strong>
        <span class="mobile-badge">${escapeHtml(formatEvent(row.type))}</span>
      </div>
      <div class="mobile-edit-fields">
        <select data-field="employeeCode">${employeeOptions}</select>
        <input data-field="timestamp" type="datetime-local" value="${escapeAttribute(row.time)}">
        <select data-field="type">${eventOptions}</select>
      </div>
      <div class="mobile-edit-actions">
        <button class="button small-button" type="button" data-action="save">Save</button>
        <button class="button secondary small-button" type="button" data-action="delete">Delete</button>
      </div>
    `;

    article.querySelector('[data-field="employeeCode"]').value = row.employeeCode;
    article.querySelector('[data-field="type"]').value = row.type;

    article.querySelector('[data-action="save"]').addEventListener("click", async () => {
      try {
        await sendJson(`/api/scans/${row.id}`, {
          method: "PUT",
          body: {
            employeeCode: article.querySelector('[data-field="employeeCode"]').value,
            timestamp: article.querySelector('[data-field="timestamp"]').value,
            type: article.querySelector('[data-field="type"]').value
          }
        });
        setMessage(manualMessage, "Time row updated.");
        await refreshAll();
      } catch (error) {
        setMessage(manualMessage, error.message, true);
      }
    });

    article.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      try {
        const response = await fetch(`/api/scans/${row.id}`, { method: "DELETE" });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Delete failed.");
        }
        setMessage(manualMessage, "Time row deleted.");
        await refreshAll();
      } catch (error) {
        setMessage(manualMessage, error.message, true);
      }
    });

    timesNode.appendChild(article);
  }
}

function renderLeaveBalances(balances) {
  if (balances.length === 0) {
    leaveBalancesNode.innerHTML = `<p class="mobile-empty">No workers saved yet.</p>`;
    return;
  }

  leaveBalancesNode.innerHTML = balances
    .map(
      (balance) => `
        <article class="mobile-data-card">
          <div class="mobile-card-topline">
            <strong>${escapeHtml(balance.name)}</strong>
            <span class="mobile-badge">Annual</span>
          </div>
          <div class="mobile-metric-grid">
            <div>
              <label>Taken</label>
              <strong>${Number(balance.takenDays).toFixed(2)}</strong>
            </div>
            <div>
              <label>Left</label>
              <strong>${Number(balance.remainingDays).toFixed(2)}</strong>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderLeaves(rows) {
  if (rows.length === 0) {
    leavesNode.innerHTML = `<p class="mobile-empty">No leave records for this month.</p>`;
    return;
  }

  leavesNode.innerHTML = "";

  for (const row of rows) {
    const article = document.createElement("article");
    article.className = "mobile-data-card";
    article.innerHTML = `
      <div class="mobile-card-topline">
        <strong>${escapeHtml(row.employeeName)}</strong>
        <span class="mobile-badge">${escapeHtml(formatLeaveType(row.leaveType))}</span>
      </div>
      <div class="mobile-detail-list">
        <p><span>Date</span>${escapeHtml(row.startDate)} to ${escapeHtml(row.endDate)}</p>
        <p><span>Days</span>${Number(row.days).toFixed(2)}</p>
        <p><span>Reason</span>${escapeHtml(row.reason || "No reason added")}</p>
      </div>
      <div class="mobile-edit-actions">
        <button class="button small-button" type="button" data-action="edit">Edit</button>
        <button class="button secondary small-button" type="button" data-action="delete">Delete</button>
      </div>
    `;

    article.querySelector('[data-action="edit"]').addEventListener("click", () => {
      editingLeaveId = row.id;
      leaveEmployeeCode.value = row.employeeCode;
      leaveType.value = row.leaveType || "annual";
      leaveStartDate.value = row.startDate;
      leaveEndDate.value = row.endDate;
      leaveReason.value = row.reason || "";
      leaveSubmitButton.textContent = "Update leave";
      leaveCancelButton.hidden = false;
      setMessage(leaveMessage, `Editing leave for ${row.employeeName}.`);
      setActiveTab("leave");
      leaveForm.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    article.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      try {
        const response = await fetch(`/api/leaves/${row.id}`, { method: "DELETE" });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Delete failed.");
        }
        setMessage(leaveMessage, "Leave record deleted.");
        await refreshAll();
      } catch (error) {
        setMessage(leaveMessage, error.message, true);
      }
    });

    leavesNode.appendChild(article);
  }
}

function renderHolidays(rows) {
  if (rows.length === 0) {
    holidaysNode.innerHTML = `<p class="mobile-empty">No holidays saved for this month.</p>`;
    return;
  }

  holidaysNode.innerHTML = "";

  for (const row of rows) {
    const article = document.createElement("article");
    article.className = "mobile-data-card";
    article.innerHTML = `
      <div class="mobile-card-topline">
        <strong>${escapeHtml(row.name)}</strong>
        <span class="mobile-badge">Holiday</span>
      </div>
      <div class="mobile-detail-list">
        <p><span>Date</span>${escapeHtml(row.date)}</p>
      </div>
      <div class="mobile-edit-actions">
        <button class="button secondary small-button" type="button" data-action="delete">Delete</button>
      </div>
    `;

    article.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      try {
        const response = await fetch(`/api/holidays/${row.id}`, { method: "DELETE" });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Delete failed.");
        }
        setMessage(holidayMessage, "Holiday deleted.");
        await refreshAll();
      } catch (error) {
        setMessage(holidayMessage, error.message, true);
      }
    });

    holidaysNode.appendChild(article);
  }
}

function setActiveTab(tabName) {
  activeTab = tabName;

  for (const button of tabButtons) {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  for (const panel of tabPanels) {
    const isActive = panel.dataset.tabPanel === tabName;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  }

  syncCameraState().catch((error) => {
    setMessage(faceStatus, error.message, true);
  });
}

async function syncCameraState() {
  const wantsFaceScan = activeTab === "face-scan";
  const wantsWorkerCamera = activeTab === "workers";

  if (wantsFaceScan || wantsWorkerCamera) {
    await startVideoStream(wantsFaceScan ? faceScanVideo : workerVideo);
    if (wantsFaceScan) {
      stopVideoStream(workerVideo);
      await ensureFaceModels();
      startFaceScanLoop();
    } else {
      stopFaceScanLoop();
      stopVideoStream(faceScanVideo);
      await ensureFaceModels();
    }
    return;
  }

  stopFaceScanLoop();
  stopVideoStream(faceScanVideo);
  stopVideoStream(workerVideo);
}

async function startVideoStream(video) {
  if (video.srcObject) {
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("This phone browser does not support camera access.");
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
}

function stopVideoStream(video) {
  const stream = video.srcObject;
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }

  video.srcObject = null;
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
      faceHint.textContent = "One worker at a time. Hold the phone still for a moment.";
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

function stopFaceScanLoop() {
  if (!faceScanTimer) {
    return;
  }

  clearInterval(faceScanTimer);
  faceScanTimer = null;
}

async function scanCurrentFace() {
  if (!faceModelsReady || !faceScanVideo.srcObject || faceScanBusy) {
    return;
  }

  if (employees.filter(hasRegisteredFace).length === 0) {
    setMessage(faceStatus, "Register at least one worker face first.", true);
    return;
  }

  faceScanBusy = true;

  try {
    const detection = await faceapi
      .detectSingleFace(faceScanVideo, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      faceHint.textContent = "No face detected. Move closer and keep one face in the frame.";
      return;
    }

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

async function detectFaceDescriptor(video) {
  if (!video.srcObject) {
    throw new Error("Open the worker camera first.");
  }

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (!detection) {
    throw new Error("No face found. Move closer and capture again.");
  }

  return Array.from(detection.descriptor);
}

function captureVideoFrame(video, canvas) {
  const width = video.videoWidth || 480;
  const height = video.videoHeight || 640;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function renderFacePreview() {
  if (!capturedFacePreviewUrl) {
    facePreview.className = "mobile-face-preview mobile-empty";
    facePreview.textContent = "No face captured yet.";
    return;
  }

  facePreview.className = "mobile-face-preview";
  facePreview.innerHTML = `
    <img src="${capturedFacePreviewUrl}" alt="Captured worker face">
    <p>Face captured and ready to save.</p>
  `;
}

function greetingForEvent(type, employeeName) {
  switch (type) {
    case "clock_in":
      return `Welcome ${employeeName}`;
    case "clock_out":
      return `Bye ${employeeName}`;
    default:
      return `${employeeName} scanned successfully`;
  }
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

  if (lastScan.type === "clock_in") {
    return "clock_out";
  }

  return "clock_in";
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

function formatLeaveType(type) {
  const value = String(type || "annual");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function nowLocalValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function resetLeaveForm() {
  editingLeaveId = null;
  leaveEmployeeCode.value = "";
  leaveType.value = "annual";
  leaveStartDate.value = todayDateValue();
  leaveEndDate.value = todayDateValue();
  leaveReason.value = "";
  leaveSubmitButton.textContent = "Save leave";
  leaveCancelButton.hidden = true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

refreshAll().catch((error) => {
  setMessage(faceStatus, error.message, true);
});
setActiveTab(activeTab);
renderFacePreview();
refreshTimer = setInterval(() => {
  refreshAll().catch(() => {});
}, 10000);

window.addEventListener("beforeunload", () => {
  stopFaceScanLoop();
  stopVideoStream(faceScanVideo);
  stopVideoStream(workerVideo);
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});
