const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const DATA_DIR = path.join(__dirname, "data");
const EMPLOYEES_FILE = path.join(DATA_DIR, "employees.json");
const SCANS_FILE = path.join(DATA_DIR, "scans.json");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB = process.env.MONGODB_DB || "time_keep_system";

let client;
let database;
let collections;
let initPromise;
let cache = {
  employees: [],
  scans: [],
  leaves: [],
  holidays: []
};

async function init() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = initInternal();
  return initPromise;
}

async function initInternal() {
  ensureDataDir();

  client = new MongoClient(MONGODB_URI);
  await client.connect();
  database = client.db(MONGODB_DB);
  collections = {
    employees: database.collection("employees"),
    scans: database.collection("scans"),
    leaves: database.collection("leaves"),
    holidays: database.collection("holidays")
  };

  await ensureIndexes();
  await migrateJsonIntoDatabase();
  await refreshCache();
  writeLegacyJsonSnapshots();
}

async function ensureIndexes() {
  await Promise.all([
    collections.employees.createIndex({ code: 1 }, { unique: true }),
    collections.scans.createIndex({ timestamp: 1 }),
    collections.scans.createIndex({ employeeCode: 1 }),
    collections.leaves.createIndex({ employeeCode: 1 }),
    collections.leaves.createIndex({ startDate: 1 }),
    collections.holidays.createIndex({ date: 1 }, { unique: true })
  ]);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      // Vercel and other serverless platforms may not allow writes beside the app bundle.
    }
  }
}

async function migrateJsonIntoDatabase() {
  const employeeCount = await collections.employees.countDocuments();
  const scanCount = await collections.scans.countDocuments();
  const leaveCount = await collections.leaves.countDocuments();
  const holidayCount = await collections.holidays.countDocuments();

  if (employeeCount === 0) {
    const employees = readJsonFile(EMPLOYEES_FILE, [
      {
        id: "emp-demo-1",
        code: "1001",
        name: "Demo Worker",
        role: "general",
        monthlyTargetHours: 176,
        notes: "Replace or edit this sample worker."
      }
    ]);
    await replaceEmployees(employees);
  }

  if (scanCount === 0) {
    const scans = readJsonFile(SCANS_FILE, []);
    await replaceScans(scans);
  }

  if (leaveCount === 0) {
    await replaceLeaves([]);
  }

  if (holidayCount === 0) {
    await replaceHolidays([]);
  }
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function refreshCache() {
  const [employees, scans, leaves, holidays] = await Promise.all([
    collections.employees.find({}).sort({ name: 1, code: 1 }).toArray(),
    collections.scans.find({}).sort({ timestamp: 1, id: 1 }).toArray(),
    collections.leaves.find({}).sort({ startDate: -1, createdAt: -1 }).toArray(),
    collections.holidays.find({}).sort({ date: 1, name: 1 }).toArray()
  ]);

  cache = {
    employees: employees.map(toEmployee),
    scans: scans.map(toScan),
    leaves: leaves.map(toLeave),
    holidays: holidays.map(toHoliday)
  };
}

function getEmployees() {
  return cache.employees.map((employee) => ({ ...employee }));
}

function getScans() {
  return cache.scans.map((scan) => ({ ...scan }));
}

function getLeaves() {
  return cache.leaves.map((leave) => ({ ...leave }));
}

function getHolidays() {
  return cache.holidays.map((holiday) => ({ ...holiday }));
}

async function replaceEmployees(employees) {
  const normalized = [...employees]
    .map((employee) => ({
      id: String(employee.id),
      code: String(employee.code),
      name: String(employee.name),
      role: String(employee.role || "general"),
      monthlyTargetHours: Number(employee.monthlyTargetHours),
      notes: String(employee.notes || ""),
      faceDescriptor: normalizeFaceDescriptor(employee.faceDescriptor),
      faceUpdatedAt: employee.faceUpdatedAt ? String(employee.faceUpdatedAt) : ""
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.code.localeCompare(right.code));

  await collections.employees.deleteMany({});
  if (normalized.length > 0) {
    await collections.employees.insertMany(normalized.map((employee) => ({ ...employee })));
  }

  cache.employees = normalized.map((employee) => ({ ...employee }));
  writeLegacyJsonSnapshots();
}

async function replaceScans(scans) {
  const normalized = [...scans]
    .map((scan) => ({
      id: String(scan.id),
      employeeCode: String(scan.employeeCode),
      employeeName: String(scan.employeeName),
      timestamp: String(scan.timestamp),
      type: String(scan.type)
    }))
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp) || left.id.localeCompare(right.id));

  await collections.scans.deleteMany({});
  if (normalized.length > 0) {
    await collections.scans.insertMany(normalized.map((scan) => ({ ...scan })));
  }

  cache.scans = normalized.map((scan) => ({ ...scan }));
  writeLegacyJsonSnapshots();
}

async function replaceLeaves(leaves) {
  const normalized = [...leaves]
    .map((leave) => ({
      id: String(leave.id),
      employeeCode: String(leave.employeeCode),
      employeeName: String(leave.employeeName),
      startDate: String(leave.startDate),
      endDate: String(leave.endDate),
      leaveType: String(leave.leaveType || "annual"),
      days: Number(leave.days),
      reason: String(leave.reason || ""),
      createdAt: String(leave.createdAt)
    }))
    .sort((left, right) => right.startDate.localeCompare(left.startDate) || right.createdAt.localeCompare(left.createdAt));

  await collections.leaves.deleteMany({});
  if (normalized.length > 0) {
    await collections.leaves.insertMany(normalized.map((leave) => ({ ...leave })));
  }

  cache.leaves = normalized.map((leave) => ({ ...leave }));
}

async function replaceHolidays(holidays) {
  const normalized = [...holidays]
    .map((holiday) => ({
      id: String(holiday.id),
      date: String(holiday.date),
      name: String(holiday.name),
      createdAt: String(holiday.createdAt)
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name));

  await collections.holidays.deleteMany({});
  if (normalized.length > 0) {
    await collections.holidays.insertMany(normalized.map((holiday) => ({ ...holiday })));
  }

  cache.holidays = normalized.map((holiday) => ({ ...holiday }));
}

function writeLegacyJsonSnapshots() {
  safeWriteFile(EMPLOYEES_FILE, JSON.stringify(cache.employees, null, 2));
  safeWriteFile(SCANS_FILE, JSON.stringify(cache.scans, null, 2));
}

function safeWriteFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content);
  } catch {
    // MongoDB is the source of truth in hosted environments.
  }
}

function toEmployee(document) {
  return {
    id: document.id,
    code: document.code,
    name: document.name,
    role: document.role || "general",
    monthlyTargetHours: Number(document.monthlyTargetHours),
    notes: document.notes || "",
    faceDescriptor: normalizeFaceDescriptor(document.faceDescriptor),
    faceUpdatedAt: document.faceUpdatedAt || ""
  };
}

function normalizeFaceDescriptor(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

function toScan(document) {
  return {
    id: document.id,
    employeeCode: document.employeeCode,
    employeeName: document.employeeName,
    timestamp: document.timestamp,
    type: document.type
  };
}

function toLeave(document) {
  return {
    id: document.id,
    employeeCode: document.employeeCode,
    employeeName: document.employeeName,
    startDate: document.startDate,
    endDate: document.endDate,
    leaveType: document.leaveType || "annual",
    days: Number(document.days),
    reason: document.reason || "",
    createdAt: document.createdAt
  };
}

function toHoliday(document) {
  return {
    id: document.id,
    date: document.date,
    name: document.name,
    createdAt: document.createdAt
  };
}

module.exports = {
  EMPLOYEES_FILE,
  SCANS_FILE,
  init,
  getEmployees,
  getScans,
  getLeaves,
  getHolidays,
  replaceEmployees,
  replaceScans,
  replaceLeaves,
  replaceHolidays
};
