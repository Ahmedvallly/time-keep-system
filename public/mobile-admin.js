const EVENT_TYPES = ["clock_in", "clock_out"];
const FACE_MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
const ADMIN_USERNAME = "a";
const ADMIN_PASSWORD = "a";
const ADMIN_SESSION_KEY = "time-keep-mobile-admin-auth";

const authShell = document.getElementById("mobileAdminAuthShell");
const adminApp = document.getElementById("mobileAdminApp");
const loginForm = document.getElementById("mobileAdminLoginForm");
const loginMessage = document.getElementById("mobileAdminLoginMessage");
const logoutButton = document.getElementById("mobileAdminLogoutButton");
const monthPicker = document.getElementById("mobileMonthPicker");
const summaryNode = document.getElementById("mobileSummary");
const workerVideo = document.getElementById("mobileWorkerVideo");
const workerCanvas = document.getElementById("mobileWorkerCanvas");
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
const timesNode = document.getElementById("mobileTimes");
const leaveBalancesNode = document.getElementById("mobileLeaveBalances");
const leavesNode = document.getElementById("mobileLeaves");
const holidaysNode = document.getElementById("mobileHolidays");
const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

let employees = [];
let refreshTimer = null;
let editingLeaveId = null;
let activeTab = "workers";
let faceModelsReady = false;
let faceModelsLoading = null;
let capturedFaceDescriptor = [];
let capturedFacePreviewUrl = "";

monthPicker.value = new Date().toISOString().slice(0, 7);
timestampInput.value = nowLocalValue();
leaveStartDate.value = todayDateValue();
leaveEndDate.value = todayDateValue();
holidayDate.value = todayDateValue();

lockAdmin();

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    lockAdmin();
    setMessage(loginMessage, "Incorrect username or password.", true);
    return;
  }

  sessionStorage.setItem(ADMIN_SESSION_KEY, "ok");
  setMessage(loginMessage, "");
  loginForm.reset();
  await unlockAdmin();
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  lockAdmin();
});

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab || "workers");
  });
}

captureFaceButton.addEventListener("click", async () => {
  captureFaceButton.disabled = true;
  setMessage(workerMessage, "Capturing face. Hold still and keep one face in the frame...");

  try {
    await ensureWorkerCamera();
    await ensureFaceModels();
    const capture = await captureWorkerFace(workerVideo, workerCanvas);
    capturedFaceDescriptor = Array.from(capture.descriptor.descriptor);
    capturedFacePreviewUrl = capture.previewUrl;
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

async function unlockAdmin() {
  authShell.hidden = true;
  adminApp.hidden = false;
  adminApp.setAttribute("aria-hidden", "false");
  await refreshAll();
  setActiveTab(activeTab);
  renderFacePreview();
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      refreshAll().catch(() => {});
    }, 10000);
  }
}

function lockAdmin() {
  stopVideoStream(workerVideo);
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  authShell.hidden = false;
  adminApp.hidden = true;
  adminApp.setAttribute("aria-hidden", "true");
}

async function refreshAll() {
  await loadEmployees();
  await Promise.all([loadDashboard(), loadTimes(), loadLeaves(), loadHolidays()]);
}

async function loadEmployees() {
  const response = await fetch("/api/employees");
  employees = await response.json();
  renderEmployeeOptions(employees);
  renderWorkers();
}

async function loadDashboard() {
  const response = await fetch(`/api/dashboard?month=${monthPicker.value}`);
  const data = await response.json();
  renderSummary(data.workers);
}

async function loadTimes() {
  const response = await fetch(`/api/times?month=${monthPicker.value}`);
  const data = await response.json();
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

function renderSummary(workers) {
  const workingCount = workers.filter((worker) => worker.status === "Working").length;
  const finishedCount = workers.filter((worker) => worker.status === "Finished").length;
  const absentCount = workers.filter((worker) => Number(worker.absentDays || 0) > 0).length;
  const readyFaces = workers.filter((worker) => {
    const employee = employees.find((entry) => entry.code === worker.code);
    return employee && Array.isArray(employee.faceDescriptor) && employee.faceDescriptor.length === 128;
  }).length;

  summaryNode.innerHTML = [
    summaryCard("Working", String(workingCount), "Currently in"),
    summaryCard("Finished", String(finishedCount), "Clocked out"),
    summaryCard("Workers", String(workers.length), "Total staff"),
    summaryCard("Faces ready", String(readyFaces), "Can scan"),
    summaryCard("Absences", String(absentCount), "This month"),
    summaryCard("Admin", "Unlocked", "Protected page")
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

  const groups = groupTimeRows(rows);
  timesNode.innerHTML = "";

  for (const group of groups) {
    const article = document.createElement("article");
    const summary = summarizeTimeGroup(group.rows);
    article.className = "mobile-data-card mobile-time-group";
    article.innerHTML = `
      <div class="mobile-card-topline">
        <div>
          <strong>${escapeHtml(group.employeeName)}</strong>
          <p class="mobile-time-group-date">${escapeHtml(formatDateLabel(group.date))}</p>
        </div>
        <span class="mobile-badge">${group.rows.length} scan${group.rows.length === 1 ? "" : "s"}</span>
      </div>
      <div class="mobile-metric-grid mobile-time-summary">
        <div>
          <label>First in</label>
          <strong>${escapeHtml(summary.firstIn)}</strong>
        </div>
        <div>
          <label>Last out</label>
          <strong>${escapeHtml(summary.lastOut)}</strong>
        </div>
      </div>
      <div class="mobile-time-timeline">${summary.timeline}</div>
      <div class="mobile-list mobile-time-rows"></div>
    `;

    const rowsNode = article.querySelector(".mobile-time-rows");
    for (const row of group.rows) {
      const rowCard = document.createElement("section");
      rowCard.className = "mobile-edit-card mobile-time-row-card";
      rowCard.innerHTML = `
        <div class="mobile-card-topline">
          <strong>${escapeHtml(formatEvent(row.type))}</strong>
          <span class="mobile-badge">${escapeHtml(formatTimeOnly(row.timestamp))}</span>
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

      rowCard.querySelector('[data-field="employeeCode"]').value = row.employeeCode;
      rowCard.querySelector('[data-field="type"]').value = row.type;

      rowCard.querySelector('[data-action="save"]').addEventListener("click", async () => {
        try {
          await sendJson(`/api/scans/${row.id}`, {
            method: "PUT",
            body: {
              employeeCode: rowCard.querySelector('[data-field="employeeCode"]').value,
              timestamp: rowCard.querySelector('[data-field="timestamp"]').value,
              type: rowCard.querySelector('[data-field="type"]').value
            }
          });
          setMessage(manualMessage, "Time row updated.");
          await refreshAll();
        } catch (error) {
          setMessage(manualMessage, error.message, true);
        }
      });

      rowCard.querySelector('[data-action="delete"]').addEventListener("click", async () => {
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

      rowsNode.appendChild(rowCard);
    }

    timesNode.appendChild(article);
  }
}

function groupTimeRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = `${row.employeeCode}__${row.date}`;
    if (!groups.has(key)) {
      groups.set(key, {
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        date: row.date,
        rows: []
      });
    }
    groups.get(key).rows.push(row);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    rows: [...group.rows].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
  }));
}

function summarizeTimeGroup(rows) {
  const firstIn = rows.find((row) => row.type === "clock_in");
  const lastOut = [...rows].reverse().find((row) => row.type === "clock_out");
  const timeline = rows
    .map((row) => `
      <span class="mobile-time-pill">
        <strong>${escapeHtml(formatTimeOnly(row.timestamp))}</strong>
        <span>${escapeHtml(shortEventLabel(row.type))}</span>
      </span>
    `)
    .join("");

  return {
    firstIn: firstIn ? formatTimeOnly(firstIn.timestamp) : "No in",
    lastOut: lastOut ? formatTimeOnly(lastOut.timestamp) : "No out",
    timeline
  };
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

  if (tabName === "workers") {
    ensureWorkerCamera().catch((error) => {
      setMessage(workerMessage, error.message, true);
    });
  } else {
    stopVideoStream(workerVideo);
  }
}

async function ensureWorkerCamera() {
  await startVideoStream(workerVideo);
  await waitForVideoReady(workerVideo);
  await pause(250);
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

  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  await waitForVideoReady(video);
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
    setMessage(workerMessage, "Loading face detection...");
    faceModelsLoading = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL)
    ]).then(() => {
      faceModelsReady = true;
    });
  }

  return faceModelsLoading;
}

async function captureWorkerFace(video, canvas) {
  const liveDetection = await tryDetectFaceDescriptor(video);
  captureVideoFrame(video, canvas);
  const previewUrl = canvas.toDataURL("image/jpeg", 0.9);

  if (liveDetection) {
    return { descriptor: liveDetection, previewUrl };
  }

  const imageDetection = await tryDetectFaceDescriptor(canvas);
  if (imageDetection) {
    return { descriptor: imageDetection, previewUrl };
  }

  throw new Error("No face found. Keep one face in the frame, move into better light, and try again.");
}

async function tryDetectFaceDescriptor(source) {
  const options = [
    { inputSize: 320, scoreThreshold: 0.35 },
    { inputSize: 224, scoreThreshold: 0.4 },
    { inputSize: 160, scoreThreshold: 0.3 }
  ];

  for (const option of options) {
    const detection = await faceapi
      .detectSingleFace(source, new faceapi.TinyFaceDetectorOptions(option))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (detection) {
      return detection;
    }
  }

  return null;
}

function captureVideoFrame(video, canvas) {
  const width = video.videoWidth || 480;
  const height = video.videoHeight || 640;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, width, height);
}

function pause(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function shortEventLabel(type) {
  if (type === "clock_in") {
    return "In";
  }
  if (type === "clock_out") {
    return "Out";
  }
  return formatEvent(type);
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

function formatDateLabel(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(new Date(`${value}T00:00:00`));
}

function formatTimeOnly(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
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

if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "ok") {
  unlockAdmin().catch((error) => {
    setMessage(loginMessage, error.message, true);
  });
}

window.addEventListener("beforeunload", () => {
  stopVideoStream(workerVideo);
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});
