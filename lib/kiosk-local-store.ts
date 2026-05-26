import { KioskEmployee, KioskRequestItem, KioskRequestStatus, PPECatalogItem } from "./kiosk-types";

const EMPLOYEES_KEY = "assetguard.local.kiosk.employees";
const CATALOG_KEY = "assetguard.local.kiosk.catalog";
const REQUESTS_KEY = "assetguard.local.kiosk.requests";
const ASSIGNMENTS_KEY = "assetguard.local.assignments";

type StockAdjustType = "add" | "subtract" | "set";

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

export type LocalAssignmentRecord = {
  id: string;
  employeeId: string;
  sku: string;
  size?: string;
  assignedAt: string;
  nextReplacementAt?: string;
  status: string;
  replacementReason?: string;
  chargeAmount?: number;
  chargeApproved?: boolean;
  signatureDataUrl?: string | null;
  issuedByKiosk?: boolean;
  issuedByUserId?: string;
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

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function normalizeCatalogItem(item: PPECatalogItem): PPECatalogItem {
  const sizes = item.sizes;
  const sizeStock = sizes
    ? Object.values(sizes).reduce((sum, variant) => sum + Number(variant.stock ?? 0), 0)
    : 0;

  return {
    ...item,
    hasSizes: Boolean(item.hasSizes),
    stock: typeof item.stock === "number" ? item.stock : sizeStock,
    active: item.active !== false,
    available:
      item.available === true ||
      (typeof item.stock === "number" ? item.stock > 0 : sizeStock > 0),
  };
}

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
  if (!window.localStorage.getItem(ASSIGNMENTS_KEY)) {
    writeJson(ASSIGNMENTS_KEY, []);
  }
}

export function isOfflineRuntime() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function canUseLocalFallback() {
  if (typeof window === "undefined") return false;
  return (
    isOfflineRuntime() ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname) ||
    window.localStorage.getItem("assetguard.offline.adminSession") === "true"
  );
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

export function listLocalEmployees() {
  ensureLocalKioskSeed();
  const employees = readJson<Record<string, KioskEmployee>>(EMPLOYEES_KEY, DEFAULT_EMPLOYEES);
  return Object.values(employees)
    .map((employee) => ({
      docId: employee.id,
      id: employee.id,
      name: employee.name,
      area: employee.area ?? employee.plantArea ?? "Local",
      personnelArea: employee.personnelArea,
      plantArea: employee.plantArea,
      position: employee.position,
      jobFunction: employee.jobFunction,
      active: employee.active,
      createdAt: undefined as Date | undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function upsertLocalEmployee(input: {
  id: string;
  name: string;
  area: string;
  personnelArea?: string;
  plantArea?: string;
  position?: string;
  jobFunction?: string;
  active?: boolean;
}) {
  ensureLocalKioskSeed();
  const employees = readJson<Record<string, KioskEmployee>>(EMPLOYEES_KEY, DEFAULT_EMPLOYEES);
  const current = employees[input.id];

  employees[input.id] = {
    ...current,
    id: input.id,
    name: input.name,
    area: input.area,
    personnelArea: input.personnelArea ?? current?.personnelArea,
    plantArea: input.plantArea ?? current?.plantArea ?? input.area,
    position: input.position ?? current?.position,
    jobFunction: input.jobFunction ?? current?.jobFunction,
    active: input.active ?? current?.active ?? true,
    firstLogin: current?.firstLogin ?? true,
    termsAccepted: current?.termsAccepted ?? false,
    termsAcceptedAt: current?.termsAcceptedAt,
    pin: current?.pin,
    source: current?.source ?? "local",
    schemaVersion: current?.schemaVersion ?? 1,
  };

  writeJson(EMPLOYEES_KEY, employees);
  return employees[input.id];
}

export function setLocalEmployeeActive(employeeId: string, active: boolean) {
  ensureLocalKioskSeed();
  const employees = readJson<Record<string, KioskEmployee>>(EMPLOYEES_KEY, DEFAULT_EMPLOYEES);
  const current = employees[employeeId];
  if (!current) return null;

  employees[employeeId] = {
    ...current,
    active,
  };
  writeJson(EMPLOYEES_KEY, employees);
  return employees[employeeId];
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
    .map(normalizeCatalogItem)
    .filter((item) => item.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function listLocalInventory() {
  return getLocalPPECatalog().map((item) => ({
    docId: item.id,
    sku: item.sku ?? item.id,
    name: item.name,
    category: item.category,
    replacementDays: item.replacementDays,
    stock: Number(item.stock ?? 0),
    hasSizes: item.hasSizes,
    sizes: item.sizes,
    material: (item as PPECatalogItem & { material?: string }).material,
    location: (item as PPECatalogItem & { location?: string }).location,
    unit: (item as PPECatalogItem & { unit?: string }).unit,
    unitCost: item.unitCost,
    createdAt: undefined as Date | undefined,
  }));
}

export function upsertLocalCatalogItem(input: PPECatalogItem) {
  ensureLocalKioskSeed();
  const catalog = readJson<PPECatalogItem[]>(CATALOG_KEY, DEFAULT_CATALOG);
  const normalized = normalizeCatalogItem(input);
  const index = catalog.findIndex((item) => item.id === normalized.id);

  if (index >= 0) {
    catalog[index] = {
      ...catalog[index],
      ...normalized,
    };
  } else {
    catalog.push(normalized);
  }

  writeJson(CATALOG_KEY, catalog);
  return normalized;
}

export function replaceLocalCatalog(items: PPECatalogItem[]) {
  ensureLocalKioskSeed();
  writeJson(CATALOG_KEY, items.map(normalizeCatalogItem));
}

export function adjustLocalInventoryStock(input: {
  itemId: string;
  qty: number;
  type: StockAdjustType;
  size?: string;
}) {
  ensureLocalKioskSeed();
  const catalog = readJson<PPECatalogItem[]>(CATALOG_KEY, DEFAULT_CATALOG);
  const index = catalog.findIndex((item) => item.id === input.itemId);
  if (index < 0) throw new Error("local_item_not_found");

  const item = normalizeCatalogItem(catalog[index]);
  const qty = Math.max(0, input.qty);

  if (item.hasSizes && item.sizes && input.size) {
    const current = item.sizes[input.size];
    if (!current) throw new Error("local_size_not_found");

    let nextStock = Number(current.stock ?? 0);
    if (input.type === "add") nextStock += qty;
    else if (input.type === "subtract") nextStock -= qty;
    else nextStock = qty;
    nextStock = Math.max(0, nextStock);

    item.sizes = {
      ...item.sizes,
      [input.size]: {
        ...current,
        stock: nextStock,
        available: nextStock > 0,
      },
    };
    item.stock = Object.values(item.sizes).reduce((sum, variant) => sum + Number(variant.stock ?? 0), 0);
    item.available = item.stock > 0;
  } else {
    let nextStock = Number(item.stock ?? 0);
    if (input.type === "add") nextStock += qty;
    else if (input.type === "subtract") nextStock -= qty;
    else nextStock = qty;
    item.stock = Math.max(0, nextStock);
    item.available = item.stock > 0;
  }

  catalog[index] = item;
  writeJson(CATALOG_KEY, catalog);
  return item;
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

function readLocalAssignments() {
  ensureLocalKioskSeed();
  return readJson<LocalAssignmentRecord[]>(ASSIGNMENTS_KEY, []);
}

function writeLocalAssignments(assignments: LocalAssignmentRecord[]) {
  writeJson(ASSIGNMENTS_KEY, assignments);
}

function toAssignmentView(assignment: LocalAssignmentRecord) {
  return {
    ...assignment,
    assignedAt: new Date(assignment.assignedAt),
    nextReplacementAt: assignment.nextReplacementAt ? new Date(assignment.nextReplacementAt) : undefined,
  };
}

export function listLocalAssignments(max = 200) {
  return readLocalAssignments()
    .map(toAssignmentView)
    .sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime())
    .slice(0, Math.max(1, max));
}

export function listLocalAssignmentsForEmployee(employeeId: string) {
  return listLocalAssignments(500).filter((assignment) => assignment.employeeId === employeeId);
}

export function getLocalActiveAssignment(employeeId: string, sku: string) {
  return readLocalAssignments()
    .filter((assignment) => (
      assignment.employeeId === employeeId &&
      assignment.sku === sku &&
      assignment.status === "active"
    ))
    .map(toAssignmentView)
    .sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime())[0] ?? null;
}

export function createLocalAssignment(input: {
  employeeId: string;
  sku: string;
  size?: string;
  itemId: string;
  replacementDays: number;
  replacementReason?: string;
  chargeAmount?: number;
  signatureDataUrl?: string | null;
  issuedByKiosk?: boolean;
  issuedByUserId?: string;
}) {
  ensureLocalKioskSeed();
  const catalog = readJson<PPECatalogItem[]>(CATALOG_KEY, DEFAULT_CATALOG);
  const catalogIndex = catalog.findIndex((item) => item.id === input.itemId || item.sku === input.sku);
  if (catalogIndex < 0) throw new Error("local_item_not_found");

  const item = normalizeCatalogItem(catalog[catalogIndex]);
  const requestedSize = input.size && input.size !== "N/A" ? input.size : undefined;

  if (requestedSize && item.sizes) {
    const variant = item.sizes[requestedSize];
    const currentStock = Number(variant?.stock ?? 0);
    if (!variant || currentStock <= 0) throw new Error("out_of_stock");

    const nextStock = currentStock - 1;
    item.sizes = {
      ...item.sizes,
      [requestedSize]: {
        ...variant,
        stock: nextStock,
        available: nextStock > 0,
      },
    };
    item.stock = Object.values(item.sizes).reduce((sum, variantItem) => sum + Number(variantItem.stock ?? 0), 0);
    item.available = item.stock > 0;
  } else {
    const currentStock = Number(item.stock ?? 0);
    if (!Number.isFinite(currentStock) || currentStock <= 0) throw new Error("out_of_stock");
    item.stock = currentStock - 1;
    item.available = item.stock > 0;
  }

  catalog[catalogIndex] = item;
  writeJson(CATALOG_KEY, catalog);

  const now = new Date().toISOString();
  const id = `local-assignment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const assignments = readLocalAssignments().map((assignment) => (
    assignment.employeeId === input.employeeId &&
    assignment.sku === input.sku &&
    assignment.status === "active"
      ? { ...assignment, status: "replaced" }
      : assignment
  ));

  assignments.unshift({
    id,
    employeeId: input.employeeId,
    sku: input.sku,
    size: input.size || "N/A",
    assignedAt: now,
    nextReplacementAt: addDaysIso(input.replacementDays),
    status: "active",
    replacementReason: input.replacementReason,
    chargeAmount: input.chargeAmount ?? 0,
    chargeApproved: input.chargeAmount ? false : true,
    signatureDataUrl: input.signatureDataUrl ?? null,
    issuedByKiosk: input.issuedByKiosk,
    issuedByUserId: input.issuedByUserId ?? "offline-admin",
  });

  writeLocalAssignments(assignments);
  return id;
}

export function getLocalDashboardSnapshot() {
  const employees = listLocalEmployees();
  const inventory = listLocalInventory();
  const assignments = listLocalAssignments(200);
  const now = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(now.getDate() + 7);

  const activeEmployees = employees.filter((employee) => employee.active);
  const activeAssignments = assignments.filter((assignment) => assignment.status === "active");
  const upcomingAlerts = activeAssignments.filter((assignment) => (
    assignment.nextReplacementAt &&
    (assignment.nextReplacementAt < nextWeek || assignment.nextReplacementAt < now)
  ));
  const todayAssignments = assignments.filter((assignment) => assignment.assignedAt.toDateString() === now.toDateString()).length;

  const totalStock = inventory.reduce((sum, item) => sum + Number(item.stock ?? 0), 0);
  const lowStockItems = inventory.filter((item) => Number(item.stock ?? 0) <= 20).length;
  const lowestItem = [...inventory].sort((a, b) => Number(a.stock ?? 0) - Number(b.stock ?? 0))[0];

  const areaByEmployee = new Map(activeEmployees.map((employee) => [employee.id, employee.area]));
  const areaCounts: Record<string, number> = {};
  activeAssignments.forEach((assignment) => {
    const area = areaByEmployee.get(assignment.employeeId);
    if (area) areaCounts[area] = (areaCounts[area] ?? 0) + 1;
  });
  const topAreaEntry = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0];
  const compliant = activeAssignments.filter((assignment) => (
    !assignment.nextReplacementAt || assignment.nextReplacementAt > now
  ));

  return {
    assignments,
    upcomingAlerts,
    stats: {
      todayAssignments,
      activeEmployees: activeEmployees.length,
      alertsThisWeek: upcomingAlerts.length,
      totalInventoryItems: inventory.length,
      lowStockItems,
      totalStock,
    },
    insights: {
      lowStockItem: lowestItem ? { name: lowestItem.name, stock: Number(lowestItem.stock ?? 0) } : null,
      topArea: topAreaEntry ? { area: topAreaEntry[0], count: topAreaEntry[1] } : null,
      complianceRate: activeAssignments.length > 0
        ? Math.round((compliant.length / activeAssignments.length) * 100)
        : 100,
    },
  };
}
