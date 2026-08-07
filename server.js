const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const db = require("./db");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const EMPLOYEES_FILE = db.EMPLOYEES_FILE;
const SCANS_FILE = db.SCANS_FILE;
const LIVE_TIMES_FILE = path.join(DATA_DIR, "attendance-live-times.csv");
const LIVE_SUMMARY_FILE = path.join(DATA_DIR, "attendance-live-summary.csv");
const EVENT_TYPES = ["clock_in", "break_out", "break_in", "clock_out"];
const LEAVE_TYPES = ["annual", "sick", "unpaid"];
const ANNUAL_LEAVE_DAYS = 18;
const EMPLOYEE_ROLES = {
  general: { label: "General", monthlyTargetHours: 182 },
  driver: { label: "Driver", monthlyTargetHours: 210 },
  admin: { label: "Admin", monthlyTargetHours: 176 }
};
const MOBILE_APP_VERSION = process.env.MOBILE_APP_VERSION || "2026.08.07.15";
let readyPromise;

ensureDataFiles();

async function requestListener(req, res) {
  try {
    await ensureReady();
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        database: "mongodb",
        timestamp: new Date().toISOString()
      });
    }

    if (req.method === "GET" && url.pathname === "/api/app-shell-config") {
      return sendJson(res, 200, buildAppShellConfig(req));
    }

    if (req.method === "GET" && url.pathname === "/api/employees") {
      return sendJson(res, 200, getEmployees());
    }

    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      return sendJson(res, 200, buildDashboard(url.searchParams.get("month")));
    }

    if (req.method === "GET" && url.pathname === "/api/times") {
      return sendJson(res, 200, buildTimesheet(url.searchParams.get("month")));
    }

    if (req.method === "GET" && url.pathname === "/api/leaves") {
      return sendJson(res, 200, buildLeavesResponse(url.searchParams.get("month")));
    }

    if (req.method === "GET" && url.pathname === "/api/holidays") {
      return sendJson(res, 200, buildHolidaysResponse(url.searchParams.get("month")));
    }

    if (req.method === "GET" && url.pathname === "/api/weekly") {
      return sendJson(res, 200, buildWeeklyBreakdown(url.searchParams.get("month")));
    }

    if (req.method === "POST" && url.pathname === "/api/employees") {
      const body = await readJsonBody(req);
      const employee = await upsertEmployee(body);
      return sendJson(res, 201, employee);
    }

    if (req.method === "POST" && url.pathname === "/api/employees/restore") {
      const body = await readJsonBody(req);
      const employee = await restoreDeletedWorker(body);
      return sendJson(res, 201, employee);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/employees/")) {
      const deleted = await deleteEmployee(url.pathname.split("/").pop());
      return sendJson(res, 200, deleted);
    }

    if (req.method === "POST" && url.pathname === "/api/scans") {
      const body = await readJsonBody(req);
      const result = await recordScan(body);
      return sendJson(res, 201, result);
    }

    if (req.method === "POST" && url.pathname === "/api/scans/manual") {
      const body = await readJsonBody(req);
      const scan = await createManualScan(body);
      return sendJson(res, 201, scan);
    }

    if (req.method === "POST" && url.pathname === "/api/scans/restore") {
      const body = await readJsonBody(req);
      const scan = await restoreDeletedScan(body);
      return sendJson(res, 201, scan);
    }

    if (req.method === "POST" && url.pathname === "/api/leaves") {
      const body = await readJsonBody(req);
      const leave = await createLeave(body);
      return sendJson(res, 201, leave);
    }

    if (req.method === "POST" && url.pathname === "/api/holidays") {
      const body = await readJsonBody(req);
      const holiday = await createHoliday(body);
      return sendJson(res, 201, holiday);
    }

    if (req.method === "PUT" && url.pathname.startsWith("/api/scans/")) {
      const body = await readJsonBody(req);
      const scan = await updateScan(url.pathname.split("/").pop(), body);
      return sendJson(res, 200, scan);
    }

    if (req.method === "PUT" && url.pathname.startsWith("/api/leaves/")) {
      const body = await readJsonBody(req);
      const leave = await updateLeave(url.pathname.split("/").pop(), body);
      return sendJson(res, 200, leave);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/scans/")) {
      const deleted = await deleteScan(url.pathname.split("/").pop());
      return sendJson(res, 200, deleted);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/leaves/")) {
      await deleteLeave(url.pathname.split("/").pop());
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/holidays/")) {
      await deleteHoliday(url.pathname.split("/").pop());
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/import.csv") {
      const body = await readJsonBody(req);
      const result = await importTimesCsv(body.csvText || "");
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/export.csv") {
      const month = url.searchParams.get("month");
      const csv = buildCsv(month);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="attendance-${month || currentMonthKey()}.csv"`
      });
      res.end(csv);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/export-times.csv") {
      const month = url.searchParams.get("month");
      const csv = buildTimesCsv(month);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="attendance-times-${month || currentMonthKey()}.csv"`
      });
      res.end(csv);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/report.pdf") {
      const month = url.searchParams.get("month");
      const pdf = buildMonthlyPdf(month);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="attendance-report-${normalizeMonth(month)}.pdf"`
      });
      res.end(pdf);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/export-live.csv") {
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="attendance-live-times.csv"'
      });
      res.end(buildTimesCsv(null, { allMonths: true }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/export-live-summary.csv") {
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="attendance-live-summary.csv"'
      });
      res.end(buildCsv(currentMonthKey()));
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Internal server error"
    });
  }
}

async function startServer() {
  try {
    await ensureReady();
    const server = http.createServer(requestListener);
    server.listen(PORT, () => {
      console.log(`Time keep system running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.init();
      syncExcelFiles();
    })();
  }

  return readyPromise;
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      // Hosted deployments use MongoDB as the durable store and may not allow local writes.
    }
  }
}

function serveStatic(req, res, pathname) {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const requestedPath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  if (!requestedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(requestedPath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType(requestedPath) });
    res.end(data);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function buildAppShellConfig(req) {
  const requestProtocol = resolveExternalProtocol(req);
  const requestUrl = new URL(req.url, `${requestProtocol}://${req.headers.host}`);
  const configuredBaseUrl = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  const baseUrl = configuredBaseUrl || `${requestUrl.protocol}//${req.headers.host}`;
  const mobilePath = (process.env.MOBILE_WEB_PATH || "/mobile.html").trim();
  const mobileUrl = mobilePath.startsWith("http://") || mobilePath.startsWith("https://")
    ? mobilePath
    : `${baseUrl}${mobilePath.startsWith("/") ? mobilePath : `/${mobilePath}`}`;
  const cacheBustedMobileUrl = appendVersionQuery(mobileUrl, MOBILE_APP_VERSION);

  return {
    appName: "Time Keep Mobile",
    version: MOBILE_APP_VERSION,
    mobileUrl: cacheBustedMobileUrl,
    refreshIntervalMs: 300000,
    timestamp: new Date().toISOString()
  };
}

function appendVersionQuery(url, version) {
  const parsed = new URL(url);
  parsed.searchParams.set("v", version);
  return parsed.toString();
}

function resolveExternalProtocol(req) {
  const forwardedProtoHeader = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

  if (forwardedProtoHeader === "http" || forwardedProtoHeader === "https") {
    return forwardedProtoHeader;
  }

  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1"
  ) {
    return "http";
  }

  return "https";
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getEmployees() {
  return db.getEmployees();
}

function getScans() {
  return db.getScans();
}

function getLeaves() {
  return db.getLeaves();
}

function getHolidays() {
  return db.getHolidays();
}

async function upsertEmployee(input) {
  const name = String(input.name || "").trim();
  const code = String(input.code || "").trim();
  const role = normalizeEmployeeRole(input.role);
  const fallbackTarget = rolePresetHours(role);
  const monthlyTargetHours = input.monthlyTargetHours === "" || input.monthlyTargetHours == null
    ? fallbackTarget
    : Number(input.monthlyTargetHours);
  const notes = String(input.notes || "").trim();

  if (!name || !code || Number.isNaN(monthlyTargetHours) || monthlyTargetHours < 0) {
    throw httpError(400, "Employee name, code, and monthly target hours are required.");
  }

  const employees = getEmployees();
  const existingIndex = employees.findIndex((employee) => employee.code === code);
  const existingEmployee = existingIndex >= 0 ? employees[existingIndex] : null;
  const hasIncomingFaceDescriptor = Object.prototype.hasOwnProperty.call(input, "faceDescriptor");
  const faceDescriptor = hasIncomingFaceDescriptor
    ? normalizeFaceDescriptor(input.faceDescriptor)
    : normalizeFaceDescriptor(existingEmployee ? existingEmployee.faceDescriptor : []);
  const employee = {
    id: existingEmployee ? existingEmployee.id : `emp-${Date.now()}`,
    code,
    name,
    role,
    monthlyTargetHours,
    notes,
    faceDescriptor,
    faceUpdatedAt: faceDescriptor.length > 0
      ? (hasIncomingFaceDescriptor ? new Date().toISOString() : String(existingEmployee?.faceUpdatedAt || ""))
      : String(existingEmployee?.faceUpdatedAt || "")
  };

  if (existingIndex >= 0) {
    employees[existingIndex] = employee;
  } else {
    employees.push(employee);
  }

  await db.replaceEmployees(employees);
  syncExcelFiles();
  return employee;
}

async function recordScan(input) {
  const employeeCode = String(input.employeeCode || "").trim();
  const scanTime = input.timestamp ? new Date(input.timestamp) : new Date();
  const requestedType = input.requestedType ? normalizeEventType(input.requestedType) : "";

  if (!employeeCode) {
    throw httpError(400, "Employee code is required.");
  }

  if (Number.isNaN(scanTime.getTime())) {
    throw httpError(400, "Timestamp is invalid.");
  }

  const employees = getEmployees();
  const employee = employees.find((entry) => entry.code === employeeCode);
  if (!employee) {
    throw httpError(404, `No worker found for code ${employeeCode}.`);
  }

  const scans = getScans();
  const nextType = inferNextEventType(scans, employee.code, scanTime, requestedType);
  const scan = {
    id: nextScanId(),
    employeeCode: employee.code,
    employeeName: employee.name,
    timestamp: scanTime.toISOString(),
    type: nextType
  };

  scans.push(scan);
  scans.sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  await db.replaceScans(scans);
  syncExcelFiles();

  const summary = summarizeDayForEmployee(scans, employee.code, dateKey(scanTime));
  return { scan, summary };
}

async function createManualScan(input) {
  const employees = getEmployees();
  const employee = findEmployeeByCode(employees, input.employeeCode);
  const timestamp = parseTimestamp(input.timestamp);
  const type = normalizeEventType(input.type);
  const scans = getScans();

  const scan = {
    id: nextScanId(),
    employeeCode: employee.code,
    employeeName: employee.name,
    timestamp: timestamp.toISOString(),
    type
  };

  scans.push(scan);
  sortScans(scans);
  await db.replaceScans(scans);
  syncExcelFiles();
  return scan;
}

async function restoreDeletedWorker(input) {
  const employees = getEmployees();
  const scans = getScans();
  const leaves = getLeaves();
  const employee = normalizeRestoredEmployee(input.employee);
  const workerScans = Array.isArray(input.scans) ? input.scans.map(normalizeRestoredScan) : [];
  const workerLeaves = Array.isArray(input.leaves) ? input.leaves.map(normalizeRestoredLeave) : [];

  if (employees.some((entry) => entry.code === employee.code)) {
    throw httpError(400, `Worker ${employee.code} already exists.`);
  }

  employees.push(employee);
  scans.push(...workerScans);
  leaves.push(...workerLeaves);
  sortScans(scans);
  await db.replaceEmployees(employees);
  await db.replaceScans(scans);
  await db.replaceLeaves(leaves);
  syncExcelFiles();
  return employee;
}

async function restoreDeletedScan(input) {
  const scan = normalizeRestoredScan(input.scan);
  const scans = getScans();

  if (scans.some((entry) => entry.id === scan.id)) {
    throw httpError(400, `Scan ${scan.id} already exists.`);
  }

  scans.push(scan);
  sortScans(scans);
  await db.replaceScans(scans);
  syncExcelFiles();
  return scan;
}

async function deleteEmployee(employeeCode) {
  const code = decodeURIComponent(String(employeeCode || "")).trim();
  const employees = getEmployees();
  const employee = employees.find((entry) => entry.code === code);
  if (!employee) {
    throw httpError(404, "Worker not found.");
  }

  const workerScans = getScans().filter((scan) => scan.employeeCode === code);
  const workerLeaves = getLeaves().filter((leave) => leave.employeeCode === code);
  const nextEmployees = employees.filter((entry) => entry.code !== code);
  const nextScans = getScans().filter((scan) => scan.employeeCode !== code);
  const nextLeaves = getLeaves().filter((leave) => leave.employeeCode !== code);

  await db.replaceEmployees(nextEmployees);
  await db.replaceScans(nextScans);
  await db.replaceLeaves(nextLeaves);
  syncExcelFiles();
  return {
    employee,
    scans: workerScans,
    leaves: workerLeaves
  };
}

async function createLeave(input) {
  const leave = buildLeavePayload(input, `leave-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const leaves = getLeaves();
  leaves.push(leave);
  await db.replaceLeaves(leaves);
  return leave;
}

async function updateLeave(leaveId, input) {
  const leaves = getLeaves();
  const index = leaves.findIndex((leave) => leave.id === leaveId);
  if (index < 0) {
    throw httpError(404, "Leave record not found.");
  }

  leaves[index] = buildLeavePayload(input, leaveId, leaves[index].createdAt);
  await db.replaceLeaves(leaves);
  return leaves[index];
}

function buildLeavePayload(input, leaveId, createdAt = new Date().toISOString()) {
  const employees = getEmployees();
  const holidays = getHolidays();
  const employee = findEmployeeByCode(employees, input.employeeCode);
  const startDate = parseDateOnly(input.startDate, "Leave start date is invalid.");
  const endDate = parseDateOnly(input.endDate, "Leave end date is invalid.");
  const leaveType = normalizeLeaveType(input.leaveType);
  const reason = String(input.reason || "").trim();

  if (endDate < startDate) {
    throw httpError(400, "Leave end date cannot be before the start date.");
  }

  const days = countLeaveDays(startDate, endDate, holidays);
  if (days <= 0) {
    throw httpError(400, "Leave must include at least one Monday-to-Saturday non-holiday day.");
  }

  return {
    id: leaveId,
    employeeCode: employee.code,
    employeeName: employee.name,
    startDate: dateKey(startDate),
    endDate: dateKey(endDate),
    leaveType,
    days,
    reason,
    createdAt
  };
}

async function createHoliday(input) {
  const holidays = getHolidays();
  const date = parseDateOnly(input.date, "Holiday date is invalid.");
  const dateValue = dateKey(date);
  if (date.getDay() === 0) {
    throw httpError(400, "Sunday is already excluded from workdays and should not be added as a holiday.");
  }

  if (holidays.some((holiday) => holiday.date === dateValue)) {
    throw httpError(400, `Holiday already exists for ${dateValue}.`);
  }

  const holiday = {
    id: `holiday-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: dateValue,
    name: String(input.name || "").trim() || "Public holiday",
    createdAt: new Date().toISOString()
  };

  holidays.push(holiday);
  await db.replaceHolidays(holidays);
  return holiday;
}

async function updateScan(scanId, input) {
  const scans = getScans();
  const index = scans.findIndex((scan) => scan.id === scanId);
  if (index < 0) {
    throw httpError(404, "Scan not found.");
  }

  const employees = getEmployees();
  const employee = findEmployeeByCode(employees, input.employeeCode);
  const timestamp = parseTimestamp(input.timestamp);
  const type = normalizeEventType(input.type);

  scans[index] = {
    ...scans[index],
    employeeCode: employee.code,
    employeeName: employee.name,
    timestamp: timestamp.toISOString(),
    type
  };

  sortScans(scans);
  await db.replaceScans(scans);
  syncExcelFiles();
  return scans.find((scan) => scan.id === scanId);
}

async function deleteScan(scanId) {
  const scans = getScans();
  const deleted = scans.find((scan) => scan.id === scanId);
  const nextScans = scans.filter((scan) => scan.id !== scanId);
  if (nextScans.length === scans.length) {
    throw httpError(404, "Scan not found.");
  }

  await db.replaceScans(nextScans);
  syncExcelFiles();
  return { scan: deleted };
}

function normalizeEmployeeRole(value) {
  const role = String(value || "general").trim().toLowerCase();
  if (!EMPLOYEE_ROLES[role]) {
    throw httpError(400, `Employee role must be one of: ${Object.keys(EMPLOYEE_ROLES).join(", ")}.`);
  }
  return role;
}

function rolePresetHours(role) {
  return Number(EMPLOYEE_ROLES[role]?.monthlyTargetHours || EMPLOYEE_ROLES.general.monthlyTargetHours);
}

function normalizeRestoredEmployee(employee) {
  if (!employee || typeof employee !== "object") {
    throw httpError(400, "Employee payload is required for restore.");
  }

  return {
    id: String(employee.id),
    code: String(employee.code),
    name: String(employee.name),
    role: normalizeEmployeeRole(employee.role),
    monthlyTargetHours: Number(employee.monthlyTargetHours),
    notes: String(employee.notes || ""),
    faceDescriptor: normalizeFaceDescriptor(employee.faceDescriptor),
    faceUpdatedAt: String(employee.faceUpdatedAt || "")
  };
}

function normalizeRestoredScan(scan) {
  if (!scan || typeof scan !== "object") {
    throw httpError(400, "Scan payload is required for restore.");
  }

  return {
    id: String(scan.id),
    employeeCode: String(scan.employeeCode),
    employeeName: String(scan.employeeName),
    timestamp: String(scan.timestamp),
    type: normalizeEventType(scan.type)
  };
}

function normalizeRestoredLeave(leave) {
  if (!leave || typeof leave !== "object") {
    throw httpError(400, "Leave payload is required for restore.");
  }

  return {
    id: String(leave.id),
    employeeCode: String(leave.employeeCode),
    employeeName: String(leave.employeeName),
    startDate: String(leave.startDate),
    endDate: String(leave.endDate),
    leaveType: normalizeLeaveType(leave.leaveType),
    days: Number(leave.days),
    reason: String(leave.reason || ""),
    createdAt: String(leave.createdAt || new Date().toISOString())
  };
}

async function deleteLeave(leaveId) {
  const leaves = getLeaves();
  const nextLeaves = leaves.filter((leave) => leave.id !== leaveId);
  if (nextLeaves.length === leaves.length) {
    throw httpError(404, "Leave record not found.");
  }

  await db.replaceLeaves(nextLeaves);
}

async function deleteHoliday(holidayId) {
  const holidays = getHolidays();
  const nextHolidays = holidays.filter((holiday) => holiday.id !== holidayId);
  if (nextHolidays.length === holidays.length) {
    throw httpError(404, "Holiday not found.");
  }

  await db.replaceHolidays(nextHolidays);
}

function inferNextEventType(scans, employeeCode, scanTime, requestedType = "") {
  const dayScans = scans
    .filter((scan) => scan.employeeCode === employeeCode && dateKey(new Date(scan.timestamp)) === dateKey(scanTime))
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));

  if (dayScans.length === 0) {
    if (requestedType && requestedType !== "clock_in") {
      throw httpError(400, "The first scan of the day must be a clock in.");
    }
    return "clock_in";
  }

  const lastType = dayScans[dayScans.length - 1].type;
  if (lastType === "clock_in") {
    if (requestedType === "clock_out") {
      return "clock_out";
    }

    if (requestedType && requestedType !== "clock_out") {
      throw httpError(400, "After clock in, the next scan must be clock out.");
    }

    return "clock_out";
  }

  if (lastType === "clock_out") {
    if (requestedType && requestedType !== "clock_in") {
      throw httpError(400, "After clock out, the next scan must be clock in.");
    }

    return "clock_in";
  }

  return "clock_in";
}

function buildDashboard(monthParam) {
  const month = normalizeMonth(monthParam);
  const employees = getEmployees();
  const scans = getScans();
  const leaves = getLeaves();
  const holidays = getHolidays();
  const today = dateKey(new Date());
  const monthScans = scans.filter((scan) => scan.timestamp.startsWith(month));
  const todayScans = scans
    .filter((scan) => dateKey(new Date(scan.timestamp)) === today)
    .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));

  const workers = employees.map((employee) => {
    const employeeMonthScans = monthScans.filter((scan) => scan.employeeCode === employee.code);
    const employeeTodayScans = todayScans.filter((scan) => scan.employeeCode === employee.code);
    const totals = summarizeMonth(employeeMonthScans);
    const state = currentState(employeeTodayScans);
    const attendance = summarizeMonthlyAttendance(employee, scans, month, leaves, holidays);
    const leaveBalance = summarizeLeaveBalance(employee, leaves, month);

    return {
      ...employee,
      status: state,
      daysWorked: attendance.daysWorked,
      leaveDays: attendance.leaveDays,
      holidayDays: attendance.holidayDays,
      absentDays: attendance.absentDays,
      workedHours: minutesToHours(totals.workedMinutes),
      breakHours: minutesToHours(totals.breakMinutes),
      balanceHours: roundToTwo(minutesToHours(totals.workedMinutes) - employee.monthlyTargetHours),
      leaveEntitlementDays: leaveBalance.entitlementDays,
      leaveTakenDays: leaveBalance.takenDays,
      leaveRemainingDays: leaveBalance.remainingDays,
      todayEvents: employeeTodayScans
    };
  });

  return {
    month,
    workers,
    todayScans,
    eventLegend: {
      clock_in: "Clock in",
      clock_out: "Clock out"
    }
  };
}

function buildLeavesResponse(monthParam) {
  const month = normalizeMonth(monthParam);
  const employees = getEmployees();
  const leaves = getLeaves();

  return {
    month,
    entitlementDays: ANNUAL_LEAVE_DAYS,
    leaveTypes: LEAVE_TYPES,
    balances: employees.map((employee) => summarizeLeaveBalance(employee, leaves, month)),
    rows: leaves.filter((leave) => leave.startDate.startsWith(month) || leave.endDate.startsWith(month))
  };
}

function buildHolidaysResponse(monthParam) {
  const month = normalizeMonth(monthParam);
  const holidays = getHolidays();
  return {
    month,
    rows: holidays.filter((holiday) => holiday.date.startsWith(month))
  };
}

function buildTimesheet(monthParam) {
  const month = normalizeMonth(monthParam);
  const employees = getEmployees();
  const scans = getScans()
    .filter((scan) => scan.timestamp.startsWith(month))
    .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));

  return {
    month,
    employees: employees.map((employee) => ({
      code: employee.code,
      name: employee.name,
      hasFace: Array.isArray(employee.faceDescriptor) && employee.faceDescriptor.length > 0
    })),
    rows: scans.map((scan) => ({
      ...scan,
      date: dateKey(new Date(scan.timestamp)),
      time: localDateTimeValue(scan.timestamp)
    }))
  };
}

function buildWeeklyBreakdown(monthParam) {
  const month = normalizeMonth(monthParam);
  const employees = getEmployees();
  const scans = getScans().filter((scan) => scan.timestamp.startsWith(month));
  const weeks = getMonthWeeks(month);
  const holidays = getHolidays();
  const totalWorkdaysInMonth = countWorkdaysInMonth(month, holidays);

  return {
    month,
    weeks: weeks.map((week) => {
      const workdaysInWeek = countWorkdaysBetween(week.start, week.end, holidays);
      return {
        label: week.label,
        start: week.start,
        end: week.end,
        workers: employees.map((employee) => {
          const employeeWeekScans = scans.filter((scan) => {
            if (scan.employeeCode !== employee.code) {
              return false;
            }

            const day = dateKey(new Date(scan.timestamp));
            return day >= week.start && day <= week.end;
          });

          const grouped = groupScansByDay(employeeWeekScans);
          let workedMinutes = 0;
          let breakMinutes = 0;

          for (const dayScans of grouped.values()) {
            const summary = summarizeScans(dayScans);
            workedMinutes += summary.workedMinutes;
            breakMinutes += summary.breakMinutes;
          }

          const daysWorked = countPresentDays(grouped);
          const weekTargetHours = totalWorkdaysInMonth > 0
            ? roundToTwo((employee.monthlyTargetHours / totalWorkdaysInMonth) * workdaysInWeek)
            : 0;
          const workedHours = minutesToHours(workedMinutes);

          return {
            code: employee.code,
            name: employee.name,
            workedHours,
            breakHours: minutesToHours(breakMinutes),
            daysWorked,
            weekTargetHours,
            overHours: roundToTwo(Math.max(0, workedHours - weekTargetHours))
          };
        })
      };
    })
  };
}

function currentState(todayScans) {
  if (todayScans.length === 0) {
    return "Not started";
  }

  const lastType = todayScans[0].type;
  switch (lastType) {
    case "clock_in":
      return "Working";
    case "clock_out":
      return "Finished";
    default:
      return "Unknown";
  }
}

function summarizeMonth(scans) {
  const grouped = groupScansByDay(scans);

  let workedMinutes = 0;
  let breakMinutes = 0;
  for (const dayScans of grouped.values()) {
    const summary = summarizeScans(dayScans);
    workedMinutes += summary.workedMinutes;
    breakMinutes += summary.breakMinutes;
  }

  return { workedMinutes, breakMinutes };
}

function summarizeMonthlyAttendance(employee, scans, month, leaves = getLeaves(), holidays = getHolidays()) {
  const employeeScans = scans.filter((scan) => scan.employeeCode === employee.code && scan.timestamp.startsWith(month));
  const grouped = groupScansByDay(employeeScans);
  const totals = summarizeMonth(employeeScans);
  const daysWorked = countPresentDays(grouped);
  const workdays = listWorkdaysInMonth(month, holidays);
  const leaveDays = countLeaveDaysInMonth(
    leaves.filter((leave) => leave.employeeCode === employee.code),
    month,
    holidays
  );
  const holidayDays = countMonthHolidayDays(month, holidays);
  const absentDays = Math.max(0, workdays.length - daysWorked - leaveDays);

  return {
    code: employee.code,
    name: employee.name,
    monthlyTargetHours: employee.monthlyTargetHours,
    daysWorked,
    leaveDays,
    holidayDays,
    absentDays,
    totalWorkedHours: minutesToHours(totals.workedMinutes),
    totalBreakHours: minutesToHours(totals.breakMinutes),
    balanceHours: roundToTwo(minutesToHours(totals.workedMinutes) - employee.monthlyTargetHours)
  };
}

function summarizeLeaveBalance(employee, leaves, month) {
  const year = month.slice(0, 4);
  const employeeLeaves = leaves.filter(
    (leave) => leave.employeeCode === employee.code && leave.startDate.startsWith(year) && leave.leaveType === "annual"
  );
  const takenDays = roundToTwo(employeeLeaves.reduce((sum, leave) => sum + Number(leave.days || 0), 0));

  return {
    code: employee.code,
    name: employee.name,
    entitlementDays: ANNUAL_LEAVE_DAYS,
    takenDays,
    remainingDays: roundToTwo(ANNUAL_LEAVE_DAYS - takenDays)
  };
}

function summarizeDayForEmployee(scans, employeeCode, day) {
  const dayScans = scans.filter(
    (scan) => scan.employeeCode === employeeCode && dateKey(new Date(scan.timestamp)) === day
  );
  return summarizeScans(dayScans);
}

function summarizeScans(scans) {
  const ordered = [...scans].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  let shiftStart = null;
  let workedMinutes = 0;

  for (const scan of ordered) {
    const when = new Date(scan.timestamp);
    if (scan.type === "clock_in") {
      shiftStart = when;
    } else if (scan.type === "clock_out" && shiftStart) {
      workedMinutes += diffMinutes(shiftStart, when);
      shiftStart = null;
    }
  }

  if (ordered.length > 0) {
    const day = dateKey(new Date(ordered[ordered.length - 1].timestamp));
    const isPastDay = day < dateKey(new Date());
    const hasClockIn = ordered.some((scan) => scan.type === "clock_in");
    const hasClockOut = ordered.some((scan) => scan.type === "clock_out");

    if (isPastDay && hasClockIn && !hasClockOut) {
      workedMinutes = 8 * 60;
    }
  }

  return {
    workedMinutes,
    breakMinutes: 0,
    workedHours: minutesToHours(workedMinutes),
    breakHours: 0
  };
}

function buildCsv(monthParam) {
  const month = normalizeMonth(monthParam);
  const employees = getEmployees();
  const scans = getScans().filter((scan) => scan.timestamp.startsWith(month));
  const grouped = new Map();

  for (const employee of employees) {
    grouped.set(employee.code, new Map());
  }

  for (const scan of scans) {
    const day = dateKey(new Date(scan.timestamp));
    if (!grouped.has(scan.employeeCode)) {
      grouped.set(scan.employeeCode, new Map());
    }
    if (!grouped.get(scan.employeeCode).has(day)) {
      grouped.get(scan.employeeCode).set(day, []);
    }
    grouped.get(scan.employeeCode).get(day).push(scan);
  }

  const rows = [
    [
      "Employee Code",
      "Employee Name",
      "Date",
      "Monthly Target Hours",
      "Worked Hours",
      "Break Hours",
      "Balance vs Target",
      "Event Sequence"
    ]
  ];

  for (const employee of employees) {
    const days = grouped.get(employee.code) || new Map();
    const monthSummary = summarizeMonth(scans.filter((scan) => scan.employeeCode === employee.code));

    if (days.size === 0) {
      rows.push([
        employee.code,
        employee.name,
        "",
        employee.monthlyTargetHours,
        "0.00",
        "0.00",
        roundToTwo(0 - employee.monthlyTargetHours),
        ""
      ]);
      continue;
    }

    for (const [day, dayScans] of days.entries()) {
      const summary = summarizeScans(dayScans);
      rows.push([
        employee.code,
        employee.name,
        day,
        employee.monthlyTargetHours,
        summary.workedHours.toFixed(2),
        summary.breakHours.toFixed(2),
        roundToTwo(monthSummary.workedMinutes / 60 - employee.monthlyTargetHours),
        dayScans.map((scan) => `${scan.type}@${timePart(scan.timestamp)}`).join(" | ")
      ]);
    }
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function buildTimesCsv(monthParam, options = {}) {
  const scans = getScans()
    .filter((scan) => options.allMonths || scan.timestamp.startsWith(normalizeMonth(monthParam)))
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));

  const rows = [[
    "Scan ID",
    "Employee Code",
    "Employee Name",
    "Timestamp",
    "Event Type"
  ]];

  for (const scan of scans) {
    rows.push([
      scan.id,
      scan.employeeCode,
      scan.employeeName,
      localDateTimeValue(scan.timestamp),
      scan.type
    ]);
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function buildMonthlyPdf(monthParam) {
  const month = normalizeMonth(monthParam);
  const employees = getEmployees();
  const scans = getScans();
  const leaves = getLeaves();
  const holidays = getHolidays();
  const weekly = buildWeeklyBreakdown(month);
  const monthName = formatMonthTitle(month);
  const lines = [
    `Attendance Report - ${monthName}`,
    `Generated: ${new Date().toLocaleString()}`,
    ""
  ];

  for (const employee of employees) {
    const summary = summarizeMonthlyAttendance(employee, scans, month, leaves, holidays);
    const leaveBalance = summarizeLeaveBalance(employee, leaves, month);
    lines.push(`${summary.name} (${summary.code})`);
    lines.push(`Days worked: ${summary.daysWorked}`);
    lines.push(`Public holidays this month: ${summary.holidayDays.toFixed(2)}`);
    lines.push(`Leave days this month: ${summary.leaveDays.toFixed(2)}`);
    lines.push(`Days absent: ${summary.absentDays}`);
    lines.push(`Total worked hours: ${summary.totalWorkedHours.toFixed(2)}`);
    lines.push(`Total break hours: ${summary.totalBreakHours.toFixed(2)}`);
    lines.push(`Leave taken: ${leaveBalance.takenDays.toFixed(2)} days`);
    lines.push(`Leave remaining: ${leaveBalance.remainingDays.toFixed(2)} days`);
    lines.push(`Monthly target hours: ${summary.monthlyTargetHours.toFixed(2)}`);
    lines.push(`Balance vs target: ${summary.balanceHours.toFixed(2)}`);
    lines.push("Weekly breakdown:");

    for (const week of weekly.weeks) {
      const workerWeek = week.workers.find((worker) => worker.code === employee.code);
      lines.push(
        `${week.label} (${week.start} to ${week.end}) - worked ${workerWeek.workedHours.toFixed(2)}h, target ${workerWeek.weekTargetHours.toFixed(2)}h, over ${workerWeek.overHours.toFixed(2)}h`
      );
    }

    lines.push("");
  }

  lines.push("Absent days are counted as Monday to Saturday non-holiday dates in the selected month with no clock-in scan recorded and no approved leave.");
  return createSimplePdf(lines);
}

async function importTimesCsv(csvText) {
  const text = String(csvText || "").trim();
  if (!text) {
    throw httpError(400, "CSV file is empty.");
  }

  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw httpError(400, "CSV file must include a header row and at least one data row.");
  }

  const headerMap = rows[0].map((value) => normalizeHeader(value));
  const idIndex = headerMap.indexOf("scan id");
  const codeIndex = headerMap.indexOf("employee code");
  const timestampIndex = headerMap.indexOf("timestamp");
  const typeIndex = headerMap.indexOf("event type");

  if (codeIndex < 0 || timestampIndex < 0 || typeIndex < 0) {
    throw httpError(400, "CSV must include Employee Code, Timestamp, and Event Type columns.");
  }

  const employees = getEmployees();
  const scans = getScans();
  const scanIds = new Set(scans.map((scan) => scan.id));
  let imported = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.every((value) => !String(value || "").trim())) {
      continue;
    }

    const employee = findEmployeeByCode(employees, row[codeIndex]);
    const timestamp = parseTimestamp(row[timestampIndex]);
    const type = normalizeEventType(row[typeIndex]);
    const existingId = idIndex >= 0 ? String(row[idIndex] || "").trim() : "";
    const nextId = existingId || nextScanId();

    const payload = {
      id: nextId,
      employeeCode: employee.code,
      employeeName: employee.name,
      timestamp: timestamp.toISOString(),
      type
    };

    const existingIndex = scans.findIndex((scan) => scan.id === existingId);
    if (existingIndex >= 0) {
      scans[existingIndex] = payload;
    } else {
      if (scanIds.has(nextId)) {
        throw httpError(400, `Duplicate scan id ${nextId} in import file.`);
      }
      scans.push(payload);
      scanIds.add(nextId);
    }

    imported += 1;
  }

  sortScans(scans);
  await db.replaceScans(scans);
  syncExcelFiles();
  return { imported };
}

function syncExcelFiles() {
  safeWriteFile(LIVE_TIMES_FILE, buildTimesCsv(null, { allMonths: true }));
  safeWriteFile(LIVE_SUMMARY_FILE, buildCsv(currentMonthKey()));
}

function safeWriteFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content);
  } catch {
    // Ignore local snapshot write failures in serverless environments.
  }
}

module.exports = {
  requestListener,
  startServer
};

if (require.main === module) {
  startServer();
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

function listWorkdaysInMonth(month, holidays = getHolidays()) {
  const days = [];
  const start = new Date(`${month}-01T00:00:00`);
  const end = endOfMonth(month);
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const dayKey = dateKey(cursor);
    if (isWorkday(cursor, holidayDates)) {
      days.push(dayKey);
    }
  }

  return days;
}

function countWorkdaysInMonth(month, holidays = getHolidays()) {
  return listWorkdaysInMonth(month, holidays).length;
}

function countWorkdaysBetween(startKey, endKey, holidays = getHolidays()) {
  const start = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  let count = 0;

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (isWorkday(cursor, holidayDates)) {
      count += 1;
    }
  }

  return count;
}

function countPresentDays(groupedScans) {
  let presentDays = 0;

  for (const dayScans of groupedScans.values()) {
    if (dayScans.some((scan) => scan.type === "clock_in")) {
      presentDays += 1;
    }
  }

  return presentDays;
}

function countLeaveDays(startDate, endDate, holidays = getHolidays()) {
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  let count = 0;

  for (const cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
    if (isWorkday(cursor, holidayDates)) {
      count += 1;
    }
  }

  return count;
}

function countLeaveDaysInMonth(leaves, month, holidays = getHolidays()) {
  const monthStart = new Date(`${month}-01T00:00:00`);
  const monthEnd = endOfMonth(month);
  let total = 0;

  for (const leave of leaves) {
    const leaveStart = parseDateOnly(leave.startDate, "Leave start date is invalid.");
    const leaveEnd = parseDateOnly(leave.endDate, "Leave end date is invalid.");
    const overlapStart = leaveStart > monthStart ? leaveStart : monthStart;
    const overlapEnd = leaveEnd < monthEnd ? leaveEnd : monthEnd;

    if (overlapEnd >= overlapStart) {
      total += countLeaveDays(overlapStart, overlapEnd, holidays);
    }
  }

  return roundToTwo(total);
}

function countMonthHolidayDays(month, holidays = getHolidays()) {
  return holidays.filter((holiday) => holiday.date.startsWith(month) && new Date(`${holiday.date}T00:00:00`).getDay() !== 0).length;
}

function isWorkday(date, holidayDates = new Set()) {
  const dayKey = dateKey(date);
  return date.getDay() !== 0 && !holidayDates.has(dayKey);
}

function groupScansByDay(scans) {
  const grouped = new Map();
  for (const scan of scans) {
    const day = dateKey(new Date(scan.timestamp));
    if (!grouped.has(day)) {
      grouped.set(day, []);
    }
    grouped.get(day).push(scan);
  }
  return grouped;
}

function formatMonthTitle(month) {
  const date = new Date(`${month}-01T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric"
  }).format(date);
}

function createSimplePdf(lines) {
  const pageWidth = 595;
  const pageHeight = 842;
  const left = 40;
  const top = 800;
  const lineHeight = 16;
  const maxLinesPerPage = 46;
  const pages = [];

  for (let i = 0; i < lines.length; i += maxLinesPerPage) {
    pages.push(lines.slice(i, i + maxLinesPerPage));
  }

  const objects = [];
  const kids = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] >>`);

  for (const pageLines of pages) {
    const pageObjectId = objects.length + 1;
    const contentObjectId = pageObjectId + 1;
    kids.push(`${pageObjectId} 0 R`);

    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);

    const content = [
      "BT",
      "/F1 12 Tf"
    ];

    pageLines.forEach((line, index) => {
      const y = top - index * lineHeight;
      content.push(`1 0 0 1 ${left} ${y} Tm (${escapePdfText(line)}) Tj`);
    });

    content.push("ET");
    const stream = content.join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
  }

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function escapePdfText(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function normalizeMonth(month) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    return month;
  }
  return currentMonthKey();
}

function normalizeEventType(type) {
  const value = String(type || "").trim();
  if (!EVENT_TYPES.includes(value)) {
    throw httpError(400, `Event type must be one of: ${EVENT_TYPES.join(", ")}.`);
  }
  return value;
}

function normalizeFaceDescriptor(value) {
  if (value == null || value === "") {
    return [];
  }

  if (!Array.isArray(value)) {
    throw httpError(400, "Face descriptor must be an array of numbers.");
  }

  const descriptor = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));

  if (descriptor.length > 0 && descriptor.length !== 128) {
    throw httpError(400, "Face descriptor must contain 128 numeric values.");
  }

  return descriptor;
}

function normalizeLeaveType(type) {
  const value = String(type || "").trim().toLowerCase();
  if (!LEAVE_TYPES.includes(value)) {
    throw httpError(400, `Leave type must be one of: ${LEAVE_TYPES.join(", ")}.`);
  }
  return value;
}

function findEmployeeByCode(employees, code) {
  const employeeCode = String(code || "").trim();
  if (!employeeCode) {
    throw httpError(400, "Employee code is required.");
  }

  const employee = employees.find((entry) => entry.code === employeeCode);
  if (!employee) {
    throw httpError(404, `No worker found for code ${employeeCode}.`);
  }

  return employee;
}

function parseTimestamp(value) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw httpError(400, "Timestamp is invalid.");
  }
  return timestamp;
}

function parseDateOnly(value, message) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw httpError(400, message);
  }

  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, message);
  }

  return date;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timePart(timestamp) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function localDateTimeValue(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function diffMinutes(start, end) {
  return Math.max(0, Math.round((end - start) / 60000));
}

function minutesToHours(minutes) {
  return roundToTwo(minutes / 60);
}

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sortScans(scans) {
  scans.sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
}

function nextScanId() {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(httpError(400, "Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
