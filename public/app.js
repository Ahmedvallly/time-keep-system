const EVENT_TYPES = ["clock_in", "clock_out"];

const monthPicker = document.getElementById("monthPicker");
const exportLink = document.getElementById("exportLink");
const timesExportLink = document.getElementById("timesExportLink");
const reportPdfLink = document.getElementById("reportPdfLink");
const weeklyPdfLink = document.getElementById("weeklyPdfLink");
const scanForm = document.getElementById("scanForm");
const scanCode = document.getElementById("scanCode");
const scanMessage = document.getElementById("scanMessage");
const employeeForm = document.getElementById("employeeForm");
const employeeMessage = document.getElementById("employeeMessage");
const leaveForm = document.getElementById("leaveForm");
const leaveEmployeeCode = document.getElementById("leaveEmployeeCode");
const leaveType = document.getElementById("leaveType");
const leaveStartDate = document.getElementById("leaveStartDate");
const leaveEndDate = document.getElementById("leaveEndDate");
const leaveMessage = document.getElementById("leaveMessage");
const leaveSubmitButton = document.getElementById("leaveSubmitButton");
const leaveCancelButton = document.getElementById("leaveCancelButton");
const manualScanForm = document.getElementById("manualScanForm");
const manualEmployeeCode = document.getElementById("manualEmployeeCode");
const manualTimestamp = document.getElementById("manualTimestamp");
const manualScanMessage = document.getElementById("manualScanMessage");
const importForm = document.getElementById("importForm");
const importFile = document.getElementById("importFile");
const importMessage = document.getElementById("importMessage");
const workersBody = document.getElementById("workersBody");
const scansBody = document.getElementById("scansBody");
const timesBody = document.getElementById("timesBody");
const legendList = document.getElementById("legendList");
const weeklyBreakdown = document.getElementById("weeklyBreakdown");
const leaveBalances = document.getElementById("leaveBalances");
const leavesBody = document.getElementById("leavesBody");
const holidayForm = document.getElementById("holidayForm");
const holidayDate = document.getElementById("holidayDate");
const holidayMessage = document.getElementById("holidayMessage");
const holidaysBody = document.getElementById("holidaysBody");

let editingLeaveId = null;

monthPicker.value = new Date().toISOString().slice(0, 7);
manualTimestamp.value = nowLocalValue();
leaveStartDate.value = todayDateValue();
leaveEndDate.value = todayDateValue();
holidayDate.value = todayDateValue();

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(scanMessage, "Saving scan...");

  try {
    const data = await sendJson("/api/scans", {
      method: "POST",
      body: {
        employeeCode: scanCode.value.trim()
      }
    });

    setMessage(
      scanMessage,
      `${data.scan.employeeName}: ${formatEvent(data.scan.type)} at ${formatDateTime(data.scan.timestamp)}`
    );
    scanCode.value = "";
    scanCode.focus();
    await refreshAll();
  } catch (error) {
    setMessage(scanMessage, error.message, true);
  }
});

employeeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(employeeForm);
  setMessage(employeeMessage, "Saving worker...");

  try {
    const data = await sendJson("/api/employees", {
      method: "POST",
      body: {
        name: formData.get("name"),
        code: formData.get("code"),
        monthlyTargetHours: Number(formData.get("monthlyTargetHours")),
        notes: formData.get("notes")
      }
    });

    employeeForm.reset();
    setMessage(employeeMessage, `Saved ${data.name} (${data.code}).`);
    await refreshAll();
  } catch (error) {
    setMessage(employeeMessage, error.message, true);
  }
});

manualScanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(manualScanForm);
  setMessage(manualScanMessage, "Adding time row...");

  try {
    const scan = await sendJson("/api/scans/manual", {
      method: "POST",
      body: {
        employeeCode: formData.get("employeeCode"),
        timestamp: formData.get("timestamp"),
        type: formData.get("type")
      }
    });

    manualTimestamp.value = nowLocalValue();
    setMessage(manualScanMessage, `Added ${scan.employeeName} at ${formatDateTime(scan.timestamp)}.`);
    await refreshAll();
  } catch (error) {
    setMessage(manualScanMessage, error.message, true);
  }
});

leaveForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(leaveForm);
  setMessage(leaveMessage, editingLeaveId ? "Updating leave..." : "Saving leave...");

  try {
    const actionLabel = editingLeaveId ? "Updated" : "Saved";
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

importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = importFile.files[0];
  if (!file) {
    setMessage(importMessage, "Choose a CSV file first.", true);
    return;
  }

  setMessage(importMessage, "Importing CSV...");

  try {
    const csvText = await file.text();
    const result = await sendJson("/api/import.csv", {
      method: "POST",
      body: { csvText }
    });

    importForm.reset();
    setMessage(importMessage, `Imported ${result.imported} rows from CSV.`);
    await refreshAll();
  } catch (error) {
    setMessage(importMessage, error.message, true);
  }
});

monthPicker.addEventListener("change", async () => {
  updateExportLinks();
  await refreshAll();
});

async function refreshAll() {
  await Promise.all([loadDashboard(), loadTimes(), loadWeeklyBreakdown(), loadLeaves(), loadHolidays()]);
}

function updateExportLinks() {
  exportLink.href = `/api/export.csv?month=${monthPicker.value}`;
  timesExportLink.href = `/api/export-times.csv?month=${monthPicker.value}`;
  reportPdfLink.href = `/api/report.pdf?month=${monthPicker.value}`;
  weeklyPdfLink.href = `/api/weekly-report.pdf?month=${monthPicker.value}`;
}

async function loadDashboard() {
  const response = await fetch(`/api/dashboard?month=${monthPicker.value}`);
  const data = await response.json();

  renderLegend(data.eventLegend);
  renderWorkers(data.workers);
  renderScans(data.todayScans);
}

async function loadTimes() {
  const response = await fetch(`/api/times?month=${monthPicker.value}`);
  const data = await response.json();

  renderEmployeeOptions(data.employees);
  renderTimes(data.rows, data.employees);
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

function renderLegend(legend) {
  legendList.innerHTML = "";
  for (const [key, label] of Object.entries(legend)) {
    const li = document.createElement("li");
    li.textContent = `${label} (${key})`;
    legendList.appendChild(li);
  }
}

function renderWorkers(workers) {
  workersBody.innerHTML = "";

  if (workers.length === 0) {
    workersBody.innerHTML = `<tr><td colspan="10">No workers saved yet.</td></tr>`;
    return;
  }

  for (const worker of workers) {
    const tr = document.createElement("tr");
    const balanceClass = worker.balanceHours < 0 ? "negative" : "positive";
    tr.innerHTML = `
      <td>${escapeHtml(worker.code)}</td>
      <td>${escapeHtml(worker.name)}</td>
      <td><span class="pill">${escapeHtml(worker.status)}</span></td>
      <td>${Number(worker.daysWorked || 0)}</td>
      <td>${Number(worker.leaveDays || 0).toFixed(2)}</td>
      <td>${Number(worker.absentDays || 0)}</td>
      <td>${Number(worker.monthlyTargetHours).toFixed(2)}</td>
      <td>${Number(worker.workedHours).toFixed(2)}</td>
      <td>${Number(worker.leaveRemainingDays || 0).toFixed(2)}</td>
      <td class="${balanceClass}">${Number(worker.balanceHours).toFixed(2)}</td>
    `;
    workersBody.appendChild(tr);
  }
}

async function loadWeeklyBreakdown() {
  const response = await fetch(`/api/weekly?month=${monthPicker.value}`);
  const data = await response.json();
  renderWeeklyBreakdown(data.weeks);
}

function renderWeeklyBreakdown(weeks) {
  weeklyBreakdown.innerHTML = "";

  if (weeks.length === 0) {
    weeklyBreakdown.innerHTML = `<p class="message">No weekly data for this month.</p>`;
    return;
  }

  for (const week of weeks) {
    const section = document.createElement("section");
    section.className = "week-card";

    const rows = week.workers
      .map((worker) => {
        const overClass = worker.overHours > 0 ? "negative" : "positive";
        return `
          <tr>
            <td>${escapeHtml(worker.name)}</td>
            <td>${Number(worker.daysWorked).toFixed(0)}</td>
            <td>${Number(worker.workedHours).toFixed(2)}</td>
            <td>${Number(worker.weekTargetHours).toFixed(2)}</td>
            <td class="${overClass}">${Number(worker.overHours).toFixed(2)}</td>
          </tr>
        `;
      })
      .join("");

    section.innerHTML = `
      <div class="card-head">
        <h3>${escapeHtml(week.label)}</h3>
        <p>${escapeHtml(week.start)} to ${escapeHtml(week.end)}</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Worker</th>
              <th>Days worked</th>
              <th>Worked hrs</th>
              <th>Week target</th>
              <th>Over hrs</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    weeklyBreakdown.appendChild(section);
  }
}

function renderScans(scans) {
  scansBody.innerHTML = "";

  if (scans.length === 0) {
    scansBody.innerHTML = `<tr><td colspan="3">No scans yet today.</td></tr>`;
    return;
  }

  for (const scan of scans) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateTime(scan.timestamp)}</td>
      <td>${escapeHtml(scan.employeeName)}</td>
      <td>${escapeHtml(formatEvent(scan.type))}</td>
    `;
    scansBody.appendChild(tr);
  }
}

function renderEmployeeOptions(employees) {
  const previousValue = manualEmployeeCode.value;
  const previousLeaveValue = leaveEmployeeCode.value;
  manualEmployeeCode.innerHTML = `<option value="">Select worker</option>`;
  leaveEmployeeCode.innerHTML = `<option value="">Select worker</option>`;

  for (const employee of employees) {
    const option = document.createElement("option");
    option.value = employee.code;
    option.textContent = `${employee.code} - ${employee.name}`;
    manualEmployeeCode.appendChild(option);

    const leaveOption = document.createElement("option");
    leaveOption.value = employee.code;
    leaveOption.textContent = `${employee.code} - ${employee.name}`;
    leaveEmployeeCode.appendChild(leaveOption);
  }

  manualEmployeeCode.value = previousValue;
  leaveEmployeeCode.value = previousLeaveValue;
}

function renderLeaveBalances(balances) {
  if (balances.length === 0) {
    leaveBalances.innerHTML = `<p class="message">No workers saved yet.</p>`;
    return;
  }

  leaveBalances.innerHTML = balances
    .map((balance) => `
      <article class="leave-balance-card">
        <strong>${escapeHtml(balance.name)}</strong>
        <p>Annual taken: ${Number(balance.takenDays).toFixed(2)} days</p>
        <p>Remaining: ${Number(balance.remainingDays).toFixed(2)} days</p>
      </article>
    `)
    .join("");
}

function renderLeaves(rows) {
  leavesBody.innerHTML = "";

  if (rows.length === 0) {
    leavesBody.innerHTML = `<tr><td colspan="7">No leave records for this month.</td></tr>`;
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.employeeName)}</td>
      <td>${escapeHtml(formatLeaveType(row.leaveType))}</td>
      <td>${escapeHtml(row.startDate)}</td>
      <td>${escapeHtml(row.endDate)}</td>
      <td>${Number(row.days).toFixed(2)}</td>
      <td>${escapeHtml(row.reason || "")}</td>
      <td class="actions-cell">
        <button class="button small-button" type="button" data-action="edit">Edit</button>
        <button class="button secondary small-button" type="button" data-action="delete">Delete</button>
      </td>
    `;

    tr.querySelector('[data-action="edit"]').addEventListener("click", () => {
      editingLeaveId = row.id;
      leaveEmployeeCode.value = row.employeeCode;
      leaveType.value = row.leaveType || "annual";
      leaveStartDate.value = row.startDate;
      leaveEndDate.value = row.endDate;
      leaveForm.querySelector("textarea[name='reason']").value = row.reason || "";
      leaveSubmitButton.textContent = "Update leave";
      leaveCancelButton.hidden = false;
      setMessage(leaveMessage, `Editing leave for ${row.employeeName}.`);
    });

    tr.querySelector('[data-action="delete"]').addEventListener("click", async () => {
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

    leavesBody.appendChild(tr);
  }
}

function renderHolidays(rows) {
  holidaysBody.innerHTML = "";

  if (rows.length === 0) {
    holidaysBody.innerHTML = `<tr><td colspan="3">No holidays saved for this month.</td></tr>`;
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.name)}</td>
      <td class="actions-cell">
        <button class="button secondary small-button" type="button" data-action="delete">Delete</button>
      </td>
    `;

    tr.querySelector('[data-action="delete"]').addEventListener("click", async () => {
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

    holidaysBody.appendChild(tr);
  }
}

function renderTimes(rows, employees) {
  timesBody.innerHTML = "";

  if (rows.length === 0) {
    timesBody.innerHTML = `<tr><td colspan="4">No time rows for this month.</td></tr>`;
    return;
  }

  const employeeOptions = employees
    .map((employee) => `<option value="${escapeHtml(employee.code)}">${escapeHtml(employee.code)} - ${escapeHtml(employee.name)}</option>`)
    .join("");

  const eventOptions = EVENT_TYPES
    .map((type) => `<option value="${type}">${escapeHtml(formatEvent(type))}</option>`)
    .join("");

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <select data-field="employeeCode">
          ${employeeOptions}
        </select>
      </td>
      <td>
        <input data-field="timestamp" type="datetime-local" value="${escapeAttribute(row.time)}">
      </td>
      <td>
        <select data-field="type">
          ${eventOptions}
        </select>
      </td>
      <td class="actions-cell">
        <button class="button small-button" type="button" data-action="save">Save</button>
        <button class="button secondary small-button" type="button" data-action="delete">Delete</button>
      </td>
    `;

    tr.querySelector('[data-field="employeeCode"]').value = row.employeeCode;
    tr.querySelector('[data-field="type"]').value = row.type;

    const saveButton = tr.querySelector('[data-action="save"]');
    const deleteButton = tr.querySelector('[data-action="delete"]');

    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      deleteButton.disabled = true;

      try {
        await sendJson(`/api/scans/${row.id}`, {
          method: "PUT",
          body: {
            employeeCode: tr.querySelector('[data-field="employeeCode"]').value,
            timestamp: tr.querySelector('[data-field="timestamp"]').value,
            type: tr.querySelector('[data-field="type"]').value
          }
        });
        setMessage(importMessage, "Time row updated.");
        await refreshAll();
      } catch (error) {
        setMessage(importMessage, error.message, true);
      } finally {
        saveButton.disabled = false;
        deleteButton.disabled = false;
      }
    });

    deleteButton.addEventListener("click", async () => {
      deleteButton.disabled = true;
      saveButton.disabled = true;

      try {
        const response = await fetch(`/api/scans/${row.id}`, { method: "DELETE" });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Delete failed.");
        }
        setMessage(importMessage, "Time row deleted.");
        await refreshAll();
      } catch (error) {
        setMessage(importMessage, error.message, true);
      } finally {
        deleteButton.disabled = false;
        saveButton.disabled = false;
      }
    });

    timesBody.appendChild(tr);
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

function formatLeaveType(type) {
  const value = String(type || "annual");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resetLeaveForm() {
  editingLeaveId = null;
  leaveEmployeeCode.value = "";
  leaveType.value = "annual";
  leaveStartDate.value = todayDateValue();
  leaveEndDate.value = todayDateValue();
  leaveForm.querySelector("textarea[name='reason']").value = "";
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

updateExportLinks();
refreshAll();
scanCode.focus();
