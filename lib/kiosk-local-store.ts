import { KioskEmployee, KioskRequestItem, KioskRequestStatus, PPECatalogItem } from "./kiosk-types";

const EMPLOYEES_KEY = "assetguard.local.kiosk.employees";
const CATALOG_KEY = "assetguard.local.kiosk.catalog";
const REQUESTS_KEY = "assetguard.local.kiosk.requests";

type LocalKioskRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  items: KioskRequestItem[];
  status: KioskRequestStatus;
  createdAt: string;
  updatedAt: string;
  source: "local-kiosk";
};

const DEFAULT_EMPLOYEES: Record<string, KioskEmployee> = {
  "1881": {
    id: "1881",
    name: "Empleado Demo",
    area: "Produccion",
    active: true,
    firstLogin: true,
    termsAccepted: false,
  },
  "1001": {
    id: "1001",
    name: "Colaborador Local",
    area: "Almacen",
    active: true,
    firstLogin: true,
    termsAccepted: false,
  },
};

const DEFAULT_CATALOG: PPECatalogItem[] = [
  {
    id: "CAS-001",
    sku: "CAS-001",
    name: "Casco de seguridad",
    category: "Cascos",
    replacementDays: 365,
    stock: 25,
    minStock: 5,
    hasSizes: false,
    active: true,
    available: true,
  },
  {
    id: "GUA-001",
    sku: "GUA-001",
    name: "Guantes anticorte",
    category: "Guantes",
    replacementDays: 30,
    stock: 80,
    minStock: 20,
    hasSizes: false,
    active: true,
    available: true,
  },
  {
    id: "LEN-001",
    sku: "LEN-001",
    name: "Lentes de seguridad",
    category: "Gafas",
    replacementDays: 180,
    stock: 40,
    minStock: 10,
    hasSizes: false,
    active: true,
    available: true,
  },
  {
    id: "BOT-001",
    name: "Botas de seguridad",
    category: "Calzado",
    replacementDays: 365,
    hasSizes: true,
    active: true,
    sizes: {
      "26": { sku: "BOT-001-26", stock: 8, minStock: 2, available: true },
      "27": { sku: "BOT-001-27", stock: 12, minStock: 2, available: true },
      "28": { sku: "BOT-001-28", stock: 10, minStock: 2, available: true },
    },
  },
];

function canUseLocalStore() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseLocalStore()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseLocalStore()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function ensureLocalKioskSeed() {
  if (!canUseLocalStore()) return;
  if (!window.localStorage.getItem(EMPLOYEES_KEY)) {
    writeJson(EMPLOYEES_KEY, DEFAULT_EMPLOYEES);
  }
  if (!window.localStorage.getItem(CATALOG_KEY)) {
    writeJson(CATALOG_KEY, DEFAULT_CATALOG);
  }
  if (!window.localStorage.getItem(REQUESTS_KEY)) {
    writeJson(REQUESTS_KEY, []);
  }
}

export function getLocalKioskEmployee(employeeId: string, createIfMissing = false): KioskEmployee | null {
  ensureLocalKioskSeed();
  const employees = readJson<Record<string, KioskEmployee>>(EMPLOYEES_KEY, DEFAULT_EMPLOYEES);
  const existing = employees[employeeId];
  if (existing) return existing;

  if (!createIfMissing) return null;

  const created: KioskEmployee = {
    id: employeeId,
    name: `Colaborador ${employeeId}`,
    area: "Local",
    active: true,
    firstLogin: true,
    termsAccepted: false,
  };
  employees[employeeId] = created;
  writeJson(EMPLOYEES_KEY, employees);
  return created;
}

export function saveLocalKioskEmployeePin(employeeId: string, pinHash: string) {
  ensureLocalKioskSeed();
  const employees = readJson<Record<string, KioskEmployee>>(EMPLOYEES_KEY, DEFAULT_EMPLOYEES);
  const current = employees[employeeId] ?? getLocalKioskEmployee(employeeId, true);
  if (!current) return;

  employees[employeeId] = {
    ...current,
    pin: pinHash,
    firstLogin: false,
    termsAccepted: true,
    termsAcceptedAt: new Date().toISOString(),
  };
  writeJson(EMPLOYEES_KEY, employees);
}

export function syncLocalKioskEmployees(input: Array<{
  id: string;
  name: string;
  area?: string;
  personnelArea?: string;
  plantArea?: string;
  position?: string;
  jobFunction?: string;
  active: boolean;
}>) {
  ensureLocalKioskSeed();
  const employees = readJson<Record<string, KioskEmployee>>(EMPLOYEES_KEY, DEFAULT_EMPLOYEES);
  let created = 0;
  let updated = 0;

  for (const employee of input) {
    const current = employees[employee.id];
    if (current) {
      updated++;
    } else {
      created++;
    }

    employees[employee.id] = {
      ...current,
      id: employee.id,
      name: employee.name,
      area: employee.area ?? current?.area ?? "Local",
      personnelArea: employee.personnelArea ?? current?.personnelArea,
      plantArea: employee.plantArea ?? current?.plantArea,
      position: employee.position ?? current?.position,
      jobFunction: employee.jobFunction ?? current?.jobFunction,
      active: employee.active,
      firstLogin: current?.firstLogin ?? true,
      termsAccepted: current?.termsAccepted ?? false,
      termsAcceptedAt: current?.termsAcceptedAt,
      pin: current?.pin,
    };
  }

  writeJson(EMPLOYEES_KEY, employees);
  return { created, updated, total: input.length };
}

export function getLocalPPECatalog(): PPECatalogItem[] {
  ensureLocalKioskSeed();
  return readJson<PPECatalogItem[]>(CATALOG_KEY, DEFAULT_CATALOG)
    .filter((item) => item.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function createLocalKioskRequest(input: {
  employeeId: string;
  employeeName: string;
  items: KioskRequestItem[];
}) {
  ensureLocalKioskSeed();
  const requests = readJson<LocalKioskRequest[]>(REQUESTS_KEY, []);
  const now = new Date().toISOString();
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  requests.unshift({
    id,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    items: input.items,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    source: "local-kiosk",
  });
  writeJson(REQUESTS_KEY, requests);
  return id;
}

export function getLocalKioskRequestStatus(requestId: string): KioskRequestStatus | null {
  ensureLocalKioskSeed();
  const requests = readJson<LocalKioskRequest[]>(REQUESTS_KEY, []);
  return requests.find((request) => request.id === requestId)?.status ?? null;
}

export function listLocalKioskRequests(status: KioskRequestStatus, max: number) {
  ensureLocalKioskSeed();
  const requests = readJson<LocalKioskRequest[]>(REQUESTS_KEY, []);
  return requests
    .filter((request) => request.status === status)
    .slice(0, Math.max(1, Math.min(max, 50)))
    .map((request) => ({
      id: request.id,
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      items: request.items,
      status: request.status,
      createdAt: new Date(request.createdAt),
    }));
}

export function updateLocalKioskRequestStatus(requestId: string, status: Extract<KioskRequestStatus, "approved" | "rejected">) {
  ensureLocalKioskSeed();
  const requests = readJson<LocalKioskRequest[]>(REQUESTS_KEY, []);
  const next = requests.map((request) =>
    request.id === requestId
      ? { ...request, status, updatedAt: new Date().toISOString() }
      : request
  );
  writeJson(REQUESTS_KEY, next);
}

export function isLocalKioskRequestId(requestId: string) {
  return requestId.startsWith("local-");
}
