const EVENT_TYPES = ["clock_in", "clock_out"];
const FACE_MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
const ADMIN_USERNAME = "a";
const ADMIN_PASSWORD = "a";
const ADMIN_SESSION_KEY = "time-keep-mobile-admin-auth";

const authShell = document.getElementById("mobileAdminAuthShell");
const adminApp = document.getElementById("mobileAdminApp");
const topbarNode = document.querySelector(".mobile-topbar");
const loginForm = document.getElementById("mobileAdminLoginForm");
const loginMessage = document.getElementById("mobileAdminLoginMessage");
const logoutButton = document.getElementById("mobileAdminLogoutButton");
const topbarOpenButton = document.getElementById("mobileTopbarOpenButton");
const topbarCloseButton = document.getElementById("mobileTopbarCloseButton");
const topbarCollapsedBar = document.getElementById("mobileTopbarCollapsedBar");
const topbarMain = document.getElementById("mobileTopbarMain");
const topbarBody = document.getElementById("mobileTopbarBody");
const monthPicker = document.getElementById("mobileMonthPicker");
const summaryNode = document.getElementById("mobileSummary");
const quickActionsNode = document.getElementById("mobileQuickActions");
const homeTotalsNode = document.getElementById("mobileHomeTotals");
const issueListNode = document.getElementById("mobileIssueList");
const todayWorkersNode = document.getElementById("mobileTodayWorkers");
const workerCameraPanel = document.getElementById("mobileWorkerCameraPanel");
const workerCameraToggleButton = document.getElementById("mobileWorkerCameraToggleButton");
const workerCameraCloseButton = document.getElementById("mobileWorkerCameraCloseButton");
const workerVideo = document.getElementById("mobileWorkerVideo");
const workerCanvas = document.getElementById("mobileWorkerCanvas");
const workerForm = document.getElementById("mobileWorkerForm");
const workerMessage = document.getElementById("mobileWorkerMessage");
const captureFaceButton = document.getElementById("mobileCaptureFaceButton");
const facePreview = document.getElementById("mobileFacePreview");
const workerRoleInput = document.getElementById("mobileWorkerRole");
const workerTargetHoursInput = document.getElementById("mobileWorkerTargetHours");
const undoWorkerDeleteButton = document.getElementById("mobileUndoWorkerDeleteButton");
const workersNode = document.getElementById("mobileWorkers");
const manualForm = document.getElementById("mobileManualForm");
const employeeSelect = document.getElementById("mobileEmployeeCode");
const timestampInput = document.getElementById("mobileTimestamp");
const manualMessage = document.getElementById("mobileManualMessage");
const timesFilterInput = document.getElementById("mobileTimesFilter");
const timeViewButtons = Array.from(document.querySelectorAll("[data-time-view]"));
const timeEditModeButton = document.getElementById("mobileTimeEditModeButton");
const monthlyCsvLink = document.getElementById("mobileMonthlyCsvLink");
const monthlyPdfLink = document.getElementById("mobileMonthlyPdfLink");
const timeDeleteMessage = document.getElementById("mobileTimeDeleteMessage");
const undoTimeDeleteButton = document.getElementById("mobileUndoTimeDeleteButton");
const timesRoleFilter = document.getElementById("mobileTimesRoleFilter");
const timesStatusFilter = document.getElementById("mobileTimesStatusFilter");
const timesIssuesOnly = document.getElementById("mobileTimesIssuesOnly");
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
const tabButtons = Array.from(document.querySelectorAll(".mobile-topbar [data-tab]"));
const bottomTabButtons = Array.from(document.querySelectorAll(".mobile-bottom-tab"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
const TOPBAR_COLLAPSED_KEY = "time-keep-mobile-topbar-collapsed";

let employees = [];
let refreshTimer = null;
let editingLeaveId = null;
let activeTab = "home";
let faceModelsReady = false;
let faceModelsLoading = null;
let capturedFaceDescriptor = [];
let capturedFacePreviewUrl = "";
let latestTimeRows = [];
let latestHolidayRows = [];
let latestDashboardWorkers = [];
let topbarCollapsed = sessionStorage.getItem(TOPBAR_COLLAPSED_KEY) !== "0";
let workerCameraOpen = false;
let openTimeWorkerKeys = new Set();
let openTimeDayKeys = new Set();
let timeViewMode = "today";
let timeEditModeEnabled = false;
let lastDeletedWorkerPayload = null;
let lastDeletedTimePayload = null;

monthPicker.value = new Date().toISOString().slice(0, 7);
timestampInput.value = nowLocalValue();
leaveStartDate.value = todayDateValue();
leaveEndDate.value = todayDateValue();
holidayDate.value = todayDateValue();
workerRoleInput.value = "general";
workerTargetHoursInput.value = String(rolePresetHours(workerRoleInput.value));

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

topbarOpenButton.addEventListener("click", () => setTopbarCollapsed(false));
topbarCloseButton.addEventListener("click", () => setTopbarCollapsed(true));
workerCameraToggleButton.addEventListener("click", () => {
  setWorkerCameraOpen(true);
  ensureWorkerCamera().catch((error) => {
    setMessage(workerMessage, error.message, true);
  });
});
workerCameraCloseButton.addEventListener("click", () => setWorkerCameraOpen(false));

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab || "home");
  });
}

for (const button of bottomTabButtons) {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab || "home");
  });
}

timesFilterInput.addEventListener("input", () => {
  renderTimes(latestTimeRows);
});
timesRoleFilter.addEventListener("change", () => {
  renderTimes(latestTimeRows);
});
timesStatusFilter.addEventListener("change", () => {
  renderTimes(latestTimeRows);
});
timesIssuesOnly.addEventListener("change", () => {
  renderTimes(latestTimeRows);
});

workerRoleInput.addEventListener("change", () => {
  workerTargetHoursInput.value = String(rolePresetHours(workerRoleInput.value));
});

for (const button of timeViewButtons) {
  button.addEventListener("click", () => {
    setTimeViewMode(button.dataset.timeView || "today");
  });
}

timeEditModeButton.addEventListener("click", () => {
  timeEditModeEnabled = !timeEditModeEnabled;
  renderTimeEditModeButton();
  setMessage(
    manualMessage,
    timeEditModeEnabled
      ? "Edit mode is on. Time rows stay open while you update them."
      : "Edit mode is off. Normal auto refresh resumed."
  );
});

undoWorkerDeleteButton.addEventListener("click", async () => {
  if (!lastDeletedWorkerPayload) {
    return;
  }

  try {
    const employee = await sendJson("/api/employees/restore", {
      method: "POST",
      body: lastDeletedWorkerPayload
    });
    lastDeletedWorkerPayload = null;
    undoWorkerDeleteButton.hidden = true;
    setMessage(workerMessage, `Restored ${employee.name}.`);
    await refreshAll();
  } catch (error) {
    setMessage(workerMessage, error.message, true);
  }
});

undoTimeDeleteButton.addEventListener("click", async () => {
  if (!lastDeletedTimePayload) {
    return;
  }

  try {
    const scan = await sendJson("/api/scans/restore", {
      method: "POST",
      body: lastDeletedTimePayload
    });
    lastDeletedTimePayload = null;
    undoTimeDeleteButton.hidden = true;
    setMessage(timeDeleteMessage, `Restored ${scan.employeeName} at ${formatDateTime(scan.timestamp)}.`);
    await refreshAll();
  } catch (error) {
    setMessage(timeDeleteMessage, error.message, true);
  }
});

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
        role: formData.get("role"),
        monthlyTargetHours: Number(formData.get("monthlyTargetHours")),
        notes: formData.get("notes"),
        faceDescriptor: capturedFaceDescriptor
      }
    });

    workerForm.reset();
    workerRoleInput.value = "general";
    workerTargetHoursInput.value = String(rolePresetHours("general"));
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

monthPicker.addEventListener("change", () => {
  updateMonthExportLinks();
  refreshAll();
});

async function unlockAdmin() {
  authShell.hidden = true;
  authShell.style.display = "none";
  adminApp.hidden = false;
  adminApp.style.display = "";
  adminApp.setAttribute("aria-hidden", "false");
  applyTopbarState();
  setWorkerCameraOpen(false);
  renderTimeViewButtons();
  renderTimeEditModeButton();
  updateMonthExportLinks();
  await refreshAll();
  setActiveTab(activeTab);
  renderFacePreview();
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      if (timeEditModeEnabled && activeTab === "times") {
        return;
      }
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
  setWorkerCameraOpen(false);
  authShell.hidden = false;
  authShell.style.display = "";
  adminApp.hidden = true;
  adminApp.style.display = "none";
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
  renderHomeDashboard();
}

async function loadDashboard() {
  const response = await fetch(`/api/dashboard?month=${monthPicker.value}`);
  const data = await response.json();
  latestDashboardWorkers = data.workers;
  renderSummary(data.workers);
  renderHomeDashboard();
}

async function loadTimes() {
  const response = await fetch(`/api/times?month=${monthPicker.value}`);
  const data = await response.json();
  latestTimeRows = data.rows;
  updateMonthExportLinks();
  renderTimes(latestTimeRows);
  renderWorkers();
  renderHomeDashboard();
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
  latestHolidayRows = data.rows;
  renderHolidays(data.rows);
  if (latestTimeRows.length > 0) {
    renderTimes(latestTimeRows);
  }
  renderHomeDashboard();
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

function renderHomeDashboard() {
  const summaries = getAllTimeSummaries();
  const totals = summarizeDashboardTotals(summaries);
  const issues = summaries.filter((summary) => summary.issueCount > 0);
  const todayRows = [...summaries].sort(compareSummaryPriority);

  quickActionsNode.innerHTML = [
    quickActionButton("Add worker", "workers"),
    quickActionButton("Fix times", "times"),
    quickActionButton("Leave", "leave"),
    quickActionButton("Print month", "times")
  ].join("");

  for (const button of quickActionsNode.querySelectorAll("[data-tab-target]")) {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tabTarget || "home");
    });
  }

  homeTotalsNode.innerHTML = [
    summaryCard("Worked today", formatHours(totals.todayWorkedHours), "All workers"),
    summaryCard("Today +/-", formatSignedHours(totals.todayBalanceHours), totals.todayBalanceHours >= 0 ? "Over target" : "Under target"),
    summaryCard("Worked week", formatHours(totals.weekWorkedHours), "This week"),
    summaryCard("Week +/-", formatSignedHours(totals.weekBalanceHours), totals.weekBalanceHours >= 0 ? "Over target" : "Under target"),
    summaryCard("Worked month", formatHours(totals.monthWorkedHours), "This month"),
    summaryCard("Month +/-", formatSignedHours(totals.monthBalanceHours), totals.monthBalanceHours >= 0 ? "Over target" : "Under target")
  ].join("");

  if (issues.length === 0) {
    issueListNode.innerHTML = `<p class="mobile-empty">No urgent issues right now.</p>`;
  } else {
    issueListNode.innerHTML = issues
      .sort(compareSummaryPriority)
      .map((summary) => `
        <article class="mobile-data-card mobile-issue-card ${summary.issueSeverityClass}">
          <div class="mobile-card-topline">
            <strong>${escapeHtml(summary.employeeName)}</strong>
            <span class="mobile-badge">${escapeHtml(summary.issueLabel)}</span>
          </div>
          <div class="mobile-detail-list">
            <p><span>Status</span>${escapeHtml(summary.todayStatus)}</p>
            <p><span>Role</span>${escapeHtml(formatWorkerRole(summary.role))}</p>
            <p><span>Today</span>${escapeHtml(formatSignedHours(summary.todayBalanceHours))}</p>
            <p><span>Week</span>${escapeHtml(formatSignedHours(summary.currentWeekBalanceHours))}</p>
          </div>
        </article>
      `)
      .join("");
  }

  if (todayRows.length === 0) {
    todayWorkersNode.innerHTML = `<p class="mobile-empty">No workers loaded yet.</p>`;
    return;
  }

  todayWorkersNode.innerHTML = todayRows
    .map((summary) => `
      <article class="mobile-data-card mobile-worker-status-card ${summary.statusClass}">
        <div class="mobile-card-topline">
          <strong>${escapeHtml(summary.employeeName)}</strong>
          <span class="mobile-badge">${escapeHtml(summary.todayStatus)}</span>
        </div>
        <div class="mobile-metric-grid">
          <div>
            <label>Role</label>
            <strong>${escapeHtml(formatWorkerRole(summary.role))}</strong>
          </div>
          <div>
            <label>Today</label>
            <strong>${escapeHtml(formatHours(summary.todayWorkedHours))}</strong>
          </div>
          <div>
            <label>Week +/-</label>
            <strong class="${summary.currentWeekBalanceHours < 0 ? "negative" : "positive"}">${escapeHtml(formatSignedHours(summary.currentWeekBalanceHours))}</strong>
          </div>
          <div>
            <label>Month +/-</label>
            <strong class="${summary.monthBalanceHours < 0 ? "negative" : "positive"}">${escapeHtml(formatSignedHours(summary.monthBalanceHours))}</strong>
          </div>
        </div>
      </article>
    `)
    .join("");
}

function quickActionButton(label, tabName) {
  return `<button class="button secondary small-button" type="button" data-tab-target="${escapeAttribute(tabName)}">${escapeHtml(label)}</button>`;
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

  const summaries = getAllTimeSummaries();
  const summaryByCode = new Map(summaries.map((summary) => [summary.employeeCode, summary]));
  workersNode.innerHTML = `
    <div class="mobile-worker-table">
      <div class="mobile-worker-table-head">
        <span>Name</span>
        <span>Role</span>
        <span>Status</span>
        <span>Month target</span>
        <span>Face</span>
        <span>Actions</span>
      </div>
      <div class="mobile-worker-table-body"></div>
    </div>
  `;
  const bodyNode = workersNode.querySelector(".mobile-worker-table-body");

  for (const employee of employees) {
    const summary = summaryByCode.get(employee.code) || null;
    const hasFace = Array.isArray(employee.faceDescriptor) && employee.faceDescriptor.length === 128;
    const article = document.createElement("article");
    article.className = `mobile-worker-row ${summary ? summary.statusClass : ""}`;
    article.innerHTML = `
      <span class="mobile-worker-primary">
        <strong>${escapeHtml(employee.name)}</strong>
        <small>${escapeHtml(employee.code)}</small>
      </span>
      <span>${escapeHtml(formatWorkerRole(employee.role))}</span>
      <span class="mobile-badge">${escapeHtml(summary ? summary.todayStatus : "No scan")}</span>
      <span>${escapeHtml(formatHours(employee.monthlyTargetHours || 0))}</span>
      <span>${escapeHtml(hasFace ? "Ready" : "Missing")}</span>
      <span class="mobile-edit-actions">
        <button class="button secondary small-button" type="button" data-action="delete">Delete worker</button>
      </span>
    `;

    article.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      try {
        const response = await fetch(`/api/employees/${encodeURIComponent(employee.code)}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Delete failed.");
        }
        lastDeletedWorkerPayload = data;
        undoWorkerDeleteButton.hidden = false;
        setMessage(workerMessage, `Deleted ${employee.name}. Tap undo if needed.`);
        await refreshAll();
      } catch (error) {
        setMessage(workerMessage, error.message, true);
      }
    });

    bodyNode.appendChild(article);
  }
}

function renderTimes(rows) {
  latestTimeRows = rows;
  captureOpenTimePanels();
  renderTimeViewButtons();
  renderTimeEditModeButton();

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

  const visibleRows = rows.filter(matchesTimeFilter);
  if (visibleRows.length === 0) {
    timesNode.innerHTML = `<p class="mobile-empty">No workers match that search.</p>`;
    return;
  }

  const workerGroups = groupRowsByEmployee(visibleRows);
  let summaries = workerGroups.map((workerGroup) => {
    const worker = employees.find((entry) => entry.code === workerGroup.employeeCode) || {
      code: workerGroup.employeeCode,
      name: workerGroup.employeeName,
      monthlyTargetHours: 0
    };
    return buildWorkerTimeSummary(worker, workerGroup.rows, monthPicker.value, latestHolidayRows);
  });

  summaries = summaries
    .filter(matchesSummaryFilter)
    .sort(compareSummaryPriority);

  if (summaries.length === 0) {
    timesNode.innerHTML = `<p class="mobile-empty">No workers match those filters.</p>`;
    return;
  }

  timesNode.innerHTML = `
    <div class="mobile-time-table">
      <div class="mobile-time-table-head">
        <span>Worker</span>
        ${renderTimeTableHead()}
      </div>
      <div class="mobile-time-table-body"></div>
    </div>
  `;

  const bodyNode = timesNode.querySelector(".mobile-time-table-body");

  for (const summary of summaries) {
    const workerDetails = document.createElement("details");
    workerDetails.className = `mobile-time-worker-row ${summary.statusClass} ${summary.issueSeverityClass}`;
    workerDetails.dataset.workerKey = summary.employeeCode;
    workerDetails.innerHTML = `
      <summary class="mobile-time-worker-summary">
        <span class="mobile-time-worker-name">
          <strong>${escapeHtml(summary.employeeName)}</strong>
          <small>${escapeHtml(summary.employeeCode)} - ${escapeHtml(summary.workedDaysLabel)} - ${escapeHtml(formatWorkerRole(summary.role))}</small>
        </span>
        ${renderTimeSummaryColumns(summary)}
      </summary>
      <div class="mobile-time-worker-panel">
        <div class="mobile-metric-grid mobile-time-summary mobile-time-summary-wide">
          <div>
            <label>Today status</label>
            <strong>${escapeHtml(summary.todayStatus)}</strong>
          </div>
          <div>
            <label>Today worked</label>
            <strong>${escapeHtml(formatHours(summary.todayWorkedHours))}</strong>
          </div>
          <div>
            <label>Today +/-</label>
            <strong class="${summary.todayBalanceHours < 0 ? "negative" : "positive"}">${escapeHtml(formatSignedHours(summary.todayBalanceHours))}</strong>
          </div>
          <div>
            <label>Month target</label>
            <strong>${escapeHtml(formatHours(summary.monthTargetHours))}</strong>
          </div>
          <div>
            <label>Month worked</label>
            <strong>${escapeHtml(formatHours(summary.monthWorkedHours))}</strong>
          </div>
          <div>
            <label>This week target</label>
            <strong>${escapeHtml(formatHours(summary.currentWeekTargetHours))}</strong>
          </div>
          <div>
            <label>This week worked</label>
            <strong>${escapeHtml(formatHours(summary.currentWeekWorkedHours))}</strong>
          </div>
          <div>
            <label>Issues</label>
            <strong>${escapeHtml(summary.issueLabel)}</strong>
          </div>
        </div>
        <div class="mobile-list mobile-week-list"></div>
        <div class="mobile-list mobile-time-groups"></div>
      </div>
    `;
    workerDetails.open = openTimeWorkerKeys.has(summary.employeeCode);

    const weekListNode = workerDetails.querySelector(".mobile-week-list");
    for (const week of summary.weeks) {
      const weekCard = document.createElement("section");
      weekCard.className = "mobile-data-card mobile-week-card";
      weekCard.innerHTML = `
        <div class="mobile-card-topline">
          <strong>${escapeHtml(week.label)}</strong>
          <span class="mobile-badge ${week.balanceHours < 0 ? "negative" : "positive"}">${escapeHtml(formatSignedHours(week.balanceHours))}</span>
        </div>
        <div class="mobile-metric-grid mobile-time-summary">
          <div>
            <label>Target</label>
            <strong>${escapeHtml(formatHours(week.targetHours))}</strong>
          </div>
          <div>
            <label>Worked</label>
            <strong>${escapeHtml(formatHours(week.workedHours))}</strong>
          </div>
        </div>
      `;
      weekListNode.appendChild(weekCard);
    }

    const dayGroupsNode = workerDetails.querySelector(".mobile-time-groups");
    for (const day of summary.days) {
      const dayCard = document.createElement("section");
      dayCard.className = "mobile-data-card mobile-time-group";
      const dayKey = `${summary.employeeCode}__${day.date}`;
      dayCard.innerHTML = `
        <div class="mobile-card-topline">
          <div>
            <strong>${escapeHtml(formatDateLabel(day.date))}</strong>
            <p class="mobile-time-group-date">${escapeHtml(day.scanCountLabel)}</p>
          </div>
          <span class="mobile-badge ${day.balanceHours < 0 ? "negative" : "positive"}">${escapeHtml(formatSignedHours(day.balanceHours))}</span>
        </div>
        <div class="mobile-metric-grid mobile-time-summary mobile-time-summary-wide">
          <div>
            <label>Day target</label>
            <strong>${escapeHtml(formatHours(day.targetHours))}</strong>
          </div>
          <div>
            <label>Day worked</label>
            <strong>${escapeHtml(formatHours(day.workedHours))}</strong>
          </div>
          <div>
            <label>First in</label>
            <strong>${escapeHtml(day.firstIn)}</strong>
          </div>
          <div>
            <label>Last out</label>
            <strong>${escapeHtml(day.lastOut)}</strong>
          </div>
        </div>
        <div class="mobile-time-timeline">${day.timeline}</div>
        <details class="mobile-time-details">
          <summary class="mobile-time-details-toggle">Open edit rows</summary>
          <div class="mobile-list mobile-time-rows"></div>
        </details>
      `;
      const dayDetails = dayCard.querySelector(".mobile-time-details");
      dayDetails.dataset.dayKey = dayKey;
      dayDetails.open = openTimeDayKeys.has(dayKey);

      const rowsNode = dayCard.querySelector(".mobile-time-rows");
      for (const row of day.rows) {
        rowsNode.appendChild(createEditableTimeRow(row, employeeOptions, eventOptions));
      }

      dayGroupsNode.appendChild(dayCard);
    }

    bodyNode.appendChild(workerDetails);
  }
}

function captureOpenTimePanels() {
  const workerKeys = new Set();
  const dayKeys = new Set();

  for (const node of timesNode.querySelectorAll(".mobile-time-worker-row[open]")) {
    const key = String(node.dataset.workerKey || "").trim();
    if (key) {
      workerKeys.add(key);
    }
  }

  for (const node of timesNode.querySelectorAll(".mobile-time-details[open]")) {
    const key = String(node.dataset.dayKey || "").trim();
    if (key) {
      dayKeys.add(key);
    }
  }

  openTimeWorkerKeys = workerKeys;
  openTimeDayKeys = dayKeys;
}

function groupRowsByEmployee(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = row.employeeCode;
    if (!groups.has(key)) {
      groups.set(key, {
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        rows: []
      });
    }
    groups.get(key).rows.push(row);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
    }))
    .sort((left, right) => left.employeeName.localeCompare(right.employeeName));
}

function buildWorkerTimeSummary(worker, rows, month, holidays) {
  const holidayDates = new Set((holidays || []).map((holiday) => holiday.date));
  const totalWorkdaysInMonth = countWorkdaysInMonth(month, holidayDates);
  const dailyTargetHours = totalWorkdaysInMonth > 0
    ? roundToTwo(Number(worker.monthlyTargetHours || 0) / totalWorkdaysInMonth)
    : 0;
  const rowsByDay = groupRowsByDay(rows);
  const monthWorkedHours = roundToTwo(sumHours(Array.from(rowsByDay.values()).map((dayRows) => summarizeRowsWorkedHours(dayRows))));
  const monthBalanceHours = roundToTwo(monthWorkedHours - Number(worker.monthlyTargetHours || 0));
  const monthWeeks = getMonthWeeks(month).map((week) => {
    const weekRows = rows.filter((row) => row.date >= week.start && row.date <= week.end);
    const workedHours = roundToTwo(sumHours(groupRowsByDay(weekRows).values(), (dayRows) => summarizeRowsWorkedHours(dayRows)));
    const targetHours = roundToTwo(dailyTargetHours * countWorkdaysBetween(week.start, week.end, holidayDates));
    return {
      label: `${week.label} • ${formatShortDateRange(week.start, week.end)}`,
      workedHours,
      targetHours,
      balanceHours: roundToTwo(workedHours - targetHours)
    };
  }).filter((week) => week.workedHours > 0 || week.targetHours > 0);

  const days = Array.from(rowsByDay.entries())
    .map(([date, dayRows]) => buildDaySummary(date, dayRows, dailyTargetHours, holidayDates))
    .sort((left, right) => right.date.localeCompare(left.date));
  const currentWeek = monthWeeks.find((week) => {
    const today = todayDateValue();
    return today >= week.start && today <= week.end;
  }) || monthWeeks[monthWeeks.length - 1] || { targetHours: 0, workedHours: 0, balanceHours: 0 };
  const todaySummary = days.find((day) => day.date === todayDateValue()) || {
    workedHours: 0,
    targetHours: dailyTargetHours,
    rows: [],
    balanceHours: roundToTwo(0 - dailyTargetHours)
  };
  const todayStatus = deriveTodayStatus(todaySummary.rows || []);
  const issues = detectSummaryIssues(worker, todaySummary, currentWeek, {
    monthWorkedHours,
    monthBalanceHours
  });

  return {
    employeeCode: worker.code,
    employeeName: worker.name,
    role: worker.role || "general",
    workedDaysLabel: `${days.length} day${days.length === 1 ? "" : "s"} worked`,
    monthTargetHours: Number(worker.monthlyTargetHours || 0),
    monthWorkedHours,
    monthBalanceHours,
    todayWorkedHours: todaySummary.workedHours,
    todayTargetHours: Number(todaySummary.targetHours || 0),
    todayBalanceHours: roundToTwo(Number(todaySummary.workedHours || 0) - Number(todaySummary.targetHours || 0)),
    todayStatus,
    currentWeekTargetHours: currentWeek.targetHours,
    currentWeekWorkedHours: currentWeek.workedHours,
    currentWeekBalanceHours: currentWeek.balanceHours,
    issueCount: issues.length,
    issueLabel: issues[0] || "OK",
    issueSeverityClass: issues.length > 0 ? "has-issues" : "is-clean",
    statusClass: statusClassFor(todayStatus),
    weeks: monthWeeks,
    days
  };
}

function buildDaySummary(date, rows, dailyTargetHours, holidayDates) {
  const orderedRows = [...rows].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  const firstIn = orderedRows.find((row) => row.type === "clock_in");
  const lastOut = [...orderedRows].reverse().find((row) => row.type === "clock_out");
  const workedHours = summarizeRowsWorkedHours(orderedRows);
  const targetHours = isWorkdayKey(date, holidayDates) ? dailyTargetHours : 0;
  const timeline = orderedRows
    .map((row) => `
      <span class="mobile-time-pill">
        <strong>${escapeHtml(formatTimeOnly(row.timestamp))}</strong>
        <span>${escapeHtml(shortEventLabel(row.type))}</span>
      </span>
    `)
    .join("");

  return {
    date,
    rows: orderedRows,
    firstIn: firstIn ? formatTimeOnly(firstIn.timestamp) : "No in",
    lastOut: lastOut ? formatTimeOnly(lastOut.timestamp) : "No out",
    workedHours,
    targetHours,
    balanceHours: roundToTwo(workedHours - targetHours),
    timeline,
    scanCountLabel: `${orderedRows.length} scan${orderedRows.length === 1 ? "" : "s"}`
  };
}

function createEditableTimeRow(row, employeeOptions, eventOptions) {
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
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Delete failed.");
      }
      lastDeletedTimePayload = data;
      undoTimeDeleteButton.hidden = false;
      setMessage(timeDeleteMessage, "Time row deleted. Tap undo if needed.");
      await refreshAll();
    } catch (error) {
      setMessage(timeDeleteMessage, error.message, true);
    }
  });

  return rowCard;
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

  for (const button of bottomTabButtons) {
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
    if (workerCameraOpen) {
      ensureWorkerCamera().catch((error) => {
        setMessage(workerMessage, error.message, true);
      });
    }
  } else {
    stopVideoStream(workerVideo);
  }
}

function applyTopbarState() {
  topbarCollapsedBar.hidden = !topbarCollapsed;
  topbarMain.hidden = topbarCollapsed;
  topbarBody.hidden = topbarCollapsed;
  topbarNode.classList.toggle("is-collapsed", topbarCollapsed);
}

function setTopbarCollapsed(nextValue) {
  topbarCollapsed = Boolean(nextValue);
  sessionStorage.setItem(TOPBAR_COLLAPSED_KEY, topbarCollapsed ? "1" : "0");
  applyTopbarState();
}

function setWorkerCameraOpen(nextValue) {
  workerCameraOpen = Boolean(nextValue);
  workerCameraPanel.hidden = !workerCameraOpen;
  workerCameraToggleButton.hidden = workerCameraOpen;
  if (!workerCameraOpen) {
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

function formatWorkerRole(role) {
  const normalized = String(role || "general").trim().toLowerCase();
  if (normalized === "driver") {
    return "Driver";
  }
  if (normalized === "admin") {
    return "Admin";
  }
  return "General";
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

function formatHours(value) {
  return `${Number(value || 0).toFixed(2)}h`;
}

function formatSignedHours(value) {
  const amount = Number(value || 0);
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toFixed(2)}h`;
}

function formatShortDateRange(start, end) {
  return `${formatDateLabel(start)} to ${formatDateLabel(end)}`;
}

function renderTimeTableHead() {
  if (timeViewMode === "week") {
    return `
      <span>Worked</span>
      <span>Target</span>
      <span>+/- Week</span>
    `;
  }

  if (timeViewMode === "month") {
    return `
      <span>Worked</span>
      <span>Target</span>
      <span>+/- Month</span>
    `;
  }

  return `
    <span>Status</span>
    <span>Worked</span>
    <span>+/- Today</span>
  `;
}

function renderTimeSummaryColumns(summary) {
  if (timeViewMode === "week") {
    return `
      <span>${escapeHtml(formatHours(summary.currentWeekWorkedHours))}</span>
      <span>${escapeHtml(formatHours(summary.currentWeekTargetHours))}</span>
      <span class="${summary.currentWeekBalanceHours < 0 ? "negative" : "positive"}">${escapeHtml(formatSignedHours(summary.currentWeekBalanceHours))}</span>
    `;
  }

  if (timeViewMode === "month") {
    return `
      <span>${escapeHtml(formatHours(summary.monthWorkedHours))}</span>
      <span>${escapeHtml(formatHours(summary.monthTargetHours))}</span>
      <span class="${summary.monthBalanceHours < 0 ? "negative" : "positive"}">${escapeHtml(formatSignedHours(summary.monthBalanceHours))}</span>
    `;
  }

  return `
    <span>${escapeHtml(summary.todayStatus)}</span>
    <span>${escapeHtml(formatHours(summary.todayWorkedHours))}</span>
    <span class="${summary.todayBalanceHours < 0 ? "negative" : "positive"}">${escapeHtml(formatSignedHours(summary.todayBalanceHours))}</span>
  `;
}

function renderTimeViewButtons() {
  for (const button of timeViewButtons) {
    const isActive = button.dataset.timeView === timeViewMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function renderTimeEditModeButton() {
  timeEditModeButton.textContent = timeEditModeEnabled ? "Edit mode on" : "Edit mode off";
  timeEditModeButton.classList.toggle("is-active", timeEditModeEnabled);
}

function setTimeViewMode(nextMode) {
  timeViewMode = ["today", "week", "month"].includes(nextMode) ? nextMode : "today";
  renderTimeViewButtons();
  renderTimes(latestTimeRows);
}

function updateMonthExportLinks() {
  const month = encodeURIComponent(monthPicker.value || new Date().toISOString().slice(0, 7));
  monthlyCsvLink.href = `/api/export.csv?month=${month}`;
  monthlyPdfLink.href = `/api/report.pdf?month=${month}`;
}

function groupRowsByDay(rows) {
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.date)) {
      grouped.set(row.date, []);
    }
    grouped.get(row.date).push(row);
  }

  return grouped;
}

function summarizeRowsWorkedHours(rows) {
  const ordered = [...rows].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  let shiftStart = null;
  let workedMinutes = 0;

  for (const row of ordered) {
    const when = new Date(row.timestamp);
    if (row.type === "clock_in") {
      shiftStart = when;
    } else if (row.type === "clock_out" && shiftStart) {
      workedMinutes += diffMinutes(shiftStart, when);
      shiftStart = null;
    }
  }

  if (ordered.length > 0) {
    const day = ordered[ordered.length - 1].date;
    const isPastDay = day < todayDateValue();
    const hasClockIn = ordered.some((row) => row.type === "clock_in");
    const hasClockOut = ordered.some((row) => row.type === "clock_out");

    if (isPastDay && hasClockIn && !hasClockOut) {
      workedMinutes = 8 * 60;
    }
  }

  return roundToTwo(workedMinutes / 60);
}

function deriveTodayStatus(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "No scan";
  }

  const ordered = [...rows].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  const lastRow = ordered[ordered.length - 1];
  return lastRow.type === "clock_in" ? "Working" : "Out";
}

function detectSummaryIssues(worker, todaySummary, currentWeek, monthSummary) {
  const issues = [];
  const rows = Array.isArray(todaySummary.rows) ? todaySummary.rows : [];
  const hasFace = Array.isArray(worker.faceDescriptor) && worker.faceDescriptor.length === 128;
  const orderedRows = [...rows].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  const hasClockIn = orderedRows.some((row) => row.type === "clock_in");
  const hasClockOut = orderedRows.some((row) => row.type === "clock_out");

  if (!hasFace) {
    issues.push("Face missing");
  }

  if (orderedRows.length > 0 && hasClockIn && !hasClockOut) {
    issues.push("Missing clock out");
  }

  if (todaySummary.balanceHours < 0) {
    issues.push("Under today");
  } else if (todaySummary.balanceHours > 0) {
    issues.push("Over today");
  }

  if (currentWeek.balanceHours < 0) {
    issues.push("Under week");
  } else if (currentWeek.balanceHours > 0) {
    issues.push("Over week");
  }

  if (monthSummary.monthBalanceHours < 0) {
    issues.push("Under month");
  } else if (monthSummary.monthBalanceHours > 0) {
    issues.push("Over month");
  }

  return issues;
}

function statusClassFor(status) {
  if (status === "Working") {
    return "is-working";
  }
  if (status === "Out") {
    return "is-out";
  }
  return "is-idle";
}

function getMonthWeeks(month) {
  const weeks = [];
  const start = new Date(`${month}-01T00:00:00`);
  const end = endOfMonth(month);
  let cursor = new Date(start);
  let index = 1;

  while (cursor <= end) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay()));
    if (weekEnd > end) {
      weekEnd.setTime(end.getTime());
    }

    weeks.push({
      label: `Week ${index}`,
      start: dateKey(weekStart),
      end: dateKey(weekEnd)
    });

    cursor = new Date(weekEnd);
    cursor.setDate(cursor.getDate() + 1);
    index += 1;
  }

  return weeks;
}

function endOfMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0, 23, 59, 59, 999);
}

function countWorkdaysInMonth(month, holidayDates) {
  return countWorkdaysBetween(`${month}-01`, dateKey(endOfMonth(month)), holidayDates);
}

function countWorkdaysBetween(startKey, endKey, holidayDates) {
  const start = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  let count = 0;

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (isWorkday(cursor, holidayDates)) {
      count += 1;
    }
  }

  return count;
}

function isWorkday(date, holidayDates) {
  return date.getDay() !== 0 && !holidayDates.has(dateKey(date));
}

function isWorkdayKey(dayKey, holidayDates) {
  return isWorkday(new Date(`${dayKey}T00:00:00`), holidayDates);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function diffMinutes(start, end) {
  return Math.max(0, Math.round((end - start) / 60000));
}

function roundToTwo(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function sumHours(values, mapper) {
  let total = 0;
  for (const value of values) {
    total += mapper ? mapper(value) : Number(value || 0);
  }
  return total;
}

function getAllTimeSummaries() {
  if (employees.length === 0) {
    return [];
  }

  const employeeRows = new Map();
  for (const employee of employees) {
    employeeRows.set(employee.code, []);
  }

  for (const row of latestTimeRows) {
    if (!employeeRows.has(row.employeeCode)) {
      employeeRows.set(row.employeeCode, []);
    }
    employeeRows.get(row.employeeCode).push(row);
  }

  return Array.from(employeeRows.entries()).map(([employeeCode, rows]) => {
    const worker = employees.find((entry) => entry.code === employeeCode) || {
      code: employeeCode,
      name: rows[0]?.employeeName || employeeCode,
      role: "general",
      monthlyTargetHours: 0
    };
    return buildWorkerTimeSummary(worker, rows, monthPicker.value, latestHolidayRows);
  });
}

function summarizeDashboardTotals(summaries) {
  return {
    todayWorkedHours: roundToTwo(sumHours(summaries, (summary) => summary.todayWorkedHours)),
    todayBalanceHours: roundToTwo(sumHours(summaries, (summary) => summary.todayBalanceHours)),
    weekWorkedHours: roundToTwo(sumHours(summaries, (summary) => summary.currentWeekWorkedHours)),
    weekBalanceHours: roundToTwo(sumHours(summaries, (summary) => summary.currentWeekBalanceHours)),
    monthWorkedHours: roundToTwo(sumHours(summaries, (summary) => summary.monthWorkedHours)),
    monthBalanceHours: roundToTwo(sumHours(summaries, (summary) => summary.monthBalanceHours))
  };
}

function matchesTimeFilter(row) {
  const filter = normalizeSearch(timesFilterInput.value);
  if (!filter) {
    return true;
  }

  const haystack = normalizeSearch(`${row.employeeCode} ${row.employeeName}`);
  return haystack.includes(filter);
}

function matchesSummaryFilter(summary) {
  const textFilter = normalizeSearch(timesFilterInput.value);
  const roleFilter = String(timesRoleFilter.value || "").trim().toLowerCase();
  const statusFilter = String(timesStatusFilter.value || "").trim().toLowerCase();
  const issuesOnly = timesIssuesOnly.checked;

  if (textFilter) {
    const haystack = normalizeSearch(`${summary.employeeCode} ${summary.employeeName} ${summary.role}`);
    if (!haystack.includes(textFilter)) {
      return false;
    }
  }

  if (roleFilter && String(summary.role || "").toLowerCase() !== roleFilter) {
    return false;
  }

  if (statusFilter) {
    const normalizedStatus = normalizeStatusFilterValue(summary.todayStatus);
    if (normalizedStatus !== statusFilter) {
      return false;
    }
  }

  if (issuesOnly && summary.issueCount === 0) {
    return false;
  }

  return true;
}

function normalizeStatusFilterValue(status) {
  const normalized = normalizeSearch(status);
  if (normalized === "working") {
    return "working";
  }
  if (normalized === "out") {
    return "out";
  }
  return "no_scan";
}

function compareSummaryPriority(left, right) {
  return right.issueCount - left.issueCount
    || statusRank(right.todayStatus) - statusRank(left.todayStatus)
    || right.todayWorkedHours - left.todayWorkedHours
    || left.employeeName.localeCompare(right.employeeName);
}

function statusRank(status) {
  if (status === "Working") {
    return 3;
  }
  if (status === "Out") {
    return 2;
  }
  return 1;
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function rolePresetHours(role) {
  const normalized = String(role || "general").trim().toLowerCase();
  if (normalized === "driver") {
    return 210;
  }
  if (normalized === "admin") {
    return 176;
  }
  return 182;
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
  const now = new Date();
  return dateKey(now);
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
