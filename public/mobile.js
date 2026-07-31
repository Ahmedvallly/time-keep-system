const EVENT_TYPES = ["clock_in", "break_out", "break_in", "clock_out"];

const monthPicker = document.getElementById("mobileMonthPicker");
const summaryNode = document.getElementById("mobileSummary");
const scanForm = document.getElementById("mobileScanForm");
const scanCode = document.getElementById("mobileScanCode");
const scanMessage = document.getElementById("mobileScanMessage");
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
let activeTab = "scan";

monthPicker.value = new Date().toISOString().slice(0, 7);
timestampInput.value = nowLocalValue();
leaveStartDate.value = todayDateValue();
leaveEndDate.value = todayDateValue();
holidayDate.value = todayDateValue();

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab || "scan");
  });
}

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(scanMessage, "Saving scan...");

  try {
    const data = await sendJson("/api/scans", {
      method: "POST",
      body: { employeeCode: scanCode.value.trim() }
    });

    scanCode.value = "";
    setMessage(
      scanMessage,
      `${data.scan.employeeName}: ${formatEvent(data.scan.type)} at ${formatDateTime(data.scan.timestamp)}`
    );
    await refreshAll();
    scanCode.focus();
  } catch (error) {
    setMessage(scanMessage, error.message, true);
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
  await Promise.all([loadDashboard(), loadTimes(), loadLeaves(), loadHolidays()]);
}

async function loadDashboard() {
  const response = await fetch(`/api/dashboard?month=${monthPicker.value}`);
  const data = await response.json();
  renderSummary(data.workers, data.todayScans);
  renderActivity(data.todayScans);
}

async function loadTimes() {
  const response = await fetch(`/api/times?month=${monthPicker.value}`);
  const data = await response.json();
  employees = data.employees;
  renderEmployeeOptions();
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

function renderSummary(workers, todayScans) {
  const workingCount = workers.filter((worker) => worker.status === "Working").length;
  const breakCount = workers.filter((worker) => worker.status === "On break").length;
  const finishedCount = workers.filter((worker) => worker.status === "Finished").length;
  const absentCount = workers.filter((worker) => Number(worker.absentDays || 0) > 0).length;

  summaryNode.innerHTML = [
    summaryCard("Today scans", String(todayScans.length), "Live today"),
    summaryCard("Working", String(workingCount), "Currently in"),
    summaryCard("On break", String(breakCount), "Break status"),
    summaryCard("Finished", String(finishedCount), "Done today"),
    summaryCard("Workers", String(workers.length), "Total staff"),
    summaryCard("Absences", String(absentCount), "This month")
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

function renderEmployeeOptions() {
  const previousManual = employeeSelect.value;
  const previousLeave = leaveEmployeeCode.value;
  employeeSelect.innerHTML = `<option value="">Select worker</option>`;
  leaveEmployeeCode.innerHTML = `<option value="">Select worker</option>`;

  for (const employee of employees) {
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

refreshAll();
setActiveTab(activeTab);
refreshTimer = setInterval(refreshAll, 10000);

window.addEventListener("beforeunload", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});
