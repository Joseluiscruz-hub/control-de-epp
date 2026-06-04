"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  type QueryConstraint,
  Timestamp,
  where,
} from "firebase/firestore";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { handleFirestoreError, OperationType } from "@/lib/firestore-error";
import {
  canUseLocalFallback,
  listLocalAssignments,
  listLocalEmployees,
  listLocalInventory,
} from "@/lib/kiosk-local-store";
import { usePlantStore } from "@/store/usePlantStore";

/* ── Types ─────────────────────────────────────────────────────── */

export type PeriodMode = "day" | "month" | "year" | "range";

export interface EmployeeLookup {
  id: string;
  name: string;
  area: string;
  costCenter?: string;
}

export interface CatalogLookup {
  sku: string;
  itemName: string;
  category: string;
  material?: string;
}

export interface ConsumptionRow {
  id: string;
  folio: string;
  date: string;
  time: string;
  employeeId: string;
  employeeName: string;
  area: string;
  costCenter: string;
  sku: string;
  material: string;
  itemName: string;
  category: string;
  size: string;
  quantity: number;
  status: string;
  reason: string;
  source: string;
  hasMissingData: boolean;
}

export interface SummaryRow {
  key: string;
  date: string;
  sku: string;
  material: string;
  itemName: string;
  category: string;
  size: string;
  area: string;
  costCenter: string;
  quantity: number;
  employeeCount: number;
}

/* ── Constants ─────────────────────────────────────────────────── */

const REPORTABLE_STATUSES = new Set(["active", "replaced", "pending_review"]);

const REASON_LABELS: Record<string, string> = {
  vida_util: "Vida util",
  desgaste: "Uso normal",
  extravio: "Extravío",
};

/* ── Date helpers ──────────────────────────────────────────────── */

export function currentDateInputValue() {
  return format(new Date(), "yyyy-MM-dd");
}

export function currentMonthInputValue() {
  return format(new Date(), "yyyy-MM");
}

export function currentYearInputValue() {
  return format(new Date(), "yyyy");
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getDayRange(value: string) {
  const start = parseDateInput(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getMonthRange(value: string) {
  const [year, month] = value.split("-").map(Number);
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : new Date().getMonth() + 1;
  const start = new Date(safeYear, safeMonth - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(safeYear, safeMonth, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getYearRange(value: string) {
  const parsedYear = Number(value);
  const year = Number.isFinite(parsedYear) && parsedYear >= 1900 ? parsedYear : new Date().getFullYear();
  const start = new Date(year, 0, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, 11, 31);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getPeriodRange(params: {
  mode: PeriodMode;
  selectedDate: string;
  selectedMonth: string;
  selectedYear: string;
  rangeStart: string;
  rangeEnd: string;
}) {
  if (params.mode === "month") return getMonthRange(params.selectedMonth);
  if (params.mode === "year") return getYearRange(params.selectedYear);
  if (params.mode === "range") {
    const first = parseDateInput(params.rangeStart);
    const second = parseDateInput(params.rangeEnd);
    const start = first <= second ? first : second;
    const end = first <= second ? second : first;
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  return getDayRange(params.selectedDate);
}

export function formatPeriodLabel(start: Date, end: Date, mode: PeriodMode) {
  if (mode === "day") return format(start, "dd MMM yyyy", { locale: es });
  if (mode === "month") return format(start, "MMMM yyyy", { locale: es });
  if (mode === "year") return format(start, "yyyy", { locale: es });
  return `${format(start, "dd MMM yyyy", { locale: es })} - ${format(end, "dd MMM yyyy", { locale: es })}`;
}

function periodSlug(start: Date, end: Date, mode: PeriodMode) {
  if (mode === "day") return format(start, "yyyyMMdd");
  if (mode === "month") return format(start, "yyyyMM");
  if (mode === "year") return format(start, "yyyy");
  return `${format(start, "yyyyMMdd")}-${format(end, "yyyyMMdd")}`;
}

/* ── Data helpers ──────────────────────────────────────────────── */

function toDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === "object" && "toDate" in value) {
    const candidate = value as { toDate?: () => Date };
    if (typeof candidate.toDate === "function") return candidate.toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function buildEmployeeIndex(records: Array<{ id: string; data: Record<string, unknown> }>) {
  const index = new Map<string, EmployeeLookup>();
  for (const record of records) {
    const data = record.data;
    const area = safeText(data.area, safeText(data.plantArea, safeText(data.personnelArea, "SIN AREA")));
    index.set(record.id, {
      id: record.id,
      name: safeText(data.name, `Empleado ${record.id}`),
      area,
      costCenter: safeText(data.costCenter),
    });
  }
  return index;
}

function buildCatalogIndex(records: Array<{ id: string; data: Record<string, unknown> }>) {
  const index = new Map<string, CatalogLookup>();

  for (const record of records) {
    const data = record.data;
    const itemName = safeText(data.name, "Material sin nombre");
    const category = safeText(data.category, "EPP");
    const baseSku = safeText(data.sku, record.id);
    const baseLookup: CatalogLookup = {
      sku: baseSku,
      itemName,
      category,
      material: safeText(data.material, baseSku),
    };

    index.set(record.id, baseLookup);
    index.set(baseSku, baseLookup);

    const sizes = data.sizes;
    if (sizes && typeof sizes === "object" && !Array.isArray(sizes)) {
      for (const variant of Object.values(sizes as Record<string, Record<string, unknown>>)) {
        const sku = safeText(variant?.sku);
        if (!sku) continue;
        index.set(sku, {
          sku,
          itemName,
          category,
          material: safeText(variant?.material, sku),
        });
      }
    }
  }

  return index;
}

function buildRows(params: {
  assignments: Array<{ id: string; data: Record<string, unknown> }>;
  employees: Map<string, EmployeeLookup>;
  catalog: Map<string, CatalogLookup>;
}) {
  return params.assignments
    .map((record) => {
      const data = record.data;
      const status = safeText(data.status, "active");
      if (!REPORTABLE_STATUSES.has(status)) return null;

      const assignedAt = toDate(data.assignedAt);
      const employeeId = safeText(data.employeeId, "SIN NOMINA");
      const sku = safeText(data.sku, "SIN SKU");
      const employee = params.employees.get(employeeId);
      const item = params.catalog.get(sku);
      const date = format(assignedAt, "yyyy-MM-dd");
      const time = format(assignedAt, "HH:mm");
      const area = employee?.area ?? "SIN AREA";
      const itemName = item?.itemName ?? "Material no encontrado";

      return {
        id: record.id,
        folio: `EPP-${format(assignedAt, "yyyyMMdd")}-${record.id.slice(0, 6).toUpperCase()}`,
        date,
        time,
        employeeId,
        employeeName: employee?.name ?? safeText(data.employeeName, "Empleado no encontrado"),
        area,
        costCenter: employee?.costCenter ?? "",
        sku,
        material: item?.material ?? sku,
        itemName,
        category: item?.category ?? "EPP",
        size: safeText(data.size, "N/A"),
        quantity: 1,
        status,
        reason: REASON_LABELS[safeText(data.replacementReason)] ?? safeText(data.replacementReason, "Dotacion"),
        source: data.issuedByKiosk === true ? "Kiosko" : "Admin",
        hasMissingData: !employee || !item || area === "SIN AREA" || itemName === "Material no encontrado",
      } satisfies ConsumptionRow;
    })
    .filter((row): row is ConsumptionRow => row !== null)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function summarizeRows(rows: ConsumptionRow[]) {
  const summary = new Map<string, SummaryRow & { employeeIds: Set<string> }>();

  for (const row of rows) {
    const key = [row.date, row.material, row.size, row.area, row.costCenter].join("|");
    const current = summary.get(key);
    if (current) {
      current.quantity += row.quantity;
      current.employeeIds.add(row.employeeId);
      current.employeeCount = current.employeeIds.size;
      continue;
    }

    summary.set(key, {
      key,
      date: row.date,
      sku: row.sku,
      material: row.material,
      itemName: row.itemName,
      category: row.category,
      size: row.size,
      area: row.area,
      costCenter: row.costCenter,
      quantity: row.quantity,
      employeeCount: 1,
      employeeIds: new Set([row.employeeId]),
    });
  }

  return Array.from(summary.values())
    .map(({ employeeIds: _employeeIds, ...row }) => row)
    .sort((a, b) => b.quantity - a.quantity || a.area.localeCompare(b.area, "es"));
}

/* ── CSV helpers ───────────────────────────────────────────────── */

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [
    headers.map(csvEscape).join(";"),
    ...rows.map((row) => row.map(csvEscape).join(";")),
  ].join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/* ── Hook ──────────────────────────────────────────────────────── */

export function useReportData() {
  const [periodMode, setPeriodMode] = useState<PeriodMode>("day");
  const [selectedDate, setSelectedDate] = useState(currentDateInputValue);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthInputValue);
  const [selectedYear, setSelectedYear] = useState(currentYearInputValue);
  const [rangeStart, setRangeStart] = useState(currentDateInputValue);
  const [rangeEnd, setRangeEnd] = useState(currentDateInputValue);
  const [allRows, setAllRows] = useState<ConsumptionRow[]>([]);
  const [itemFilter, setItemFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [localMode, setLocalMode] = useState(false);
  const { activePlantId } = usePlantStore();

  /* ── Derived ─────────────────────────────────────────────────── */

  const activePeriod = useMemo(
    () => getPeriodRange({ mode: periodMode, selectedDate, selectedMonth, selectedYear, rangeStart, rangeEnd }),
    [periodMode, selectedDate, selectedMonth, selectedYear, rangeStart, rangeEnd]
  );

  const periodLabel = useMemo(
    () => formatPeriodLabel(activePeriod.start, activePeriod.end, periodMode),
    [activePeriod, periodMode]
  );

  const activePeriodSlug = useMemo(
    () => periodSlug(activePeriod.start, activePeriod.end, periodMode),
    [activePeriod, periodMode]
  );

  const rows = useMemo(() => {
    const itemNeedle = itemFilter.trim().toLowerCase();
    const employeeNeedle = employeeFilter.trim().toLowerCase();
    const areaNeedle = areaFilter.trim().toLowerCase();

    return allRows.filter((row) => {
      const matchesItem = !itemNeedle || [row.itemName, row.sku, row.material, row.category]
        .join(" ")
        .toLowerCase()
        .includes(itemNeedle);
      const matchesEmployee = !employeeNeedle || [row.employeeId, row.employeeName]
        .join(" ")
        .toLowerCase()
        .includes(employeeNeedle);
      const matchesArea = !areaNeedle || [row.area, row.costCenter]
        .join(" ")
        .toLowerCase()
        .includes(areaNeedle);
      return matchesItem && matchesEmployee && matchesArea;
    });
  }, [allRows, areaFilter, employeeFilter, itemFilter]);

  const summaryRows = useMemo(() => summarizeRows(rows), [rows]);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const uniqueEmployees = new Set(rows.map((row) => row.employeeId)).size;
  const missingRows = rows.filter((row) => row.hasMissingData).length;

  const topArea = useMemo(() => {
    const areas = new Map<string, number>();
    for (const row of rows) areas.set(row.area, (areas.get(row.area) ?? 0) + row.quantity);
    return Array.from(areas.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [rows]);

  const sapFolio = `SAP-EPP-${activePeriodSlug}-${String(totalQuantity).padStart(3, "0")}`;

  /* ── Load report ─────────────────────────────────────────────── */

  const loadReport = useCallback(async () => {
    setLoading(true);
    setLocalMode(false);
    const { start, end } = activePeriod;

    try {
      // FIX: Always include date filters in Firestore query, regardless of plant filter.
      const assignmentConstraints: QueryConstraint[] = activePlantId === "todas" ? [
        where("assignedAt", ">=", Timestamp.fromDate(start)),
        where("assignedAt", "<=", Timestamp.fromDate(end)),
        orderBy("assignedAt", "asc"),
      ] : [
        where("plantaId", "==", activePlantId),
        where("assignedAt", ">=", Timestamp.fromDate(start)),
        where("assignedAt", "<=", Timestamp.fromDate(end)),
        orderBy("assignedAt", "asc"),
      ];
      const [assignmentsSnap, employeesSnap, catalogSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "assignments"),
            ...assignmentConstraints
          )
        ),
        getDocs(activePlantId === "todas"
          ? collection(db, "employees")
          : query(collection(db, "employees"), where("plantaId", "==", activePlantId))
        ),
        getDocs(activePlantId === "todas"
          ? collection(db, "ppe_catalog")
          : query(collection(db, "ppe_catalog"), where("plantaId", "==", activePlantId))
        ),
      ]);

      const employees = buildEmployeeIndex(
        employeesSnap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }))
      );
      const catalog = buildCatalogIndex(
        catalogSnap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }))
      );
      const assignmentRecords = assignmentsSnap.docs
        .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }))
        .filter((record) => {
          const assignedAt = toDate(record.data.assignedAt);
          return assignedAt >= start && assignedAt <= end;
        });
      const nextRows = buildRows({
        assignments: assignmentRecords,
        employees,
        catalog,
      });

      setAllRows(nextRows);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "reporte diario SAP");
      if (!canUseLocalFallback()) {
        setAllRows([]);
        setLocalMode(false);
        return;
      }

      const localEmployees = buildEmployeeIndex(
        listLocalEmployees().map((employee) => ({
          id: employee.id,
          data: employee as unknown as Record<string, unknown>,
        }))
      );
      const localCatalog = buildCatalogIndex(
        listLocalInventory().map((item) => ({
          id: item.docId,
          data: item as unknown as Record<string, unknown>,
        }))
      );
      const localAssignments = listLocalAssignments(1000)
        .filter((assignment) => assignment.assignedAt >= start && assignment.assignedAt <= end)
        .map((assignment) => ({
          id: assignment.id,
          data: assignment as unknown as Record<string, unknown>,
        }));

      setAllRows(buildRows({ assignments: localAssignments, employees: localEmployees, catalog: localCatalog }));
      setLocalMode(true);
    } finally {
      setLoading(false);
    }
  }, [activePeriod, activePlantId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadReport();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadReport]);

  /* ── Export handlers ─────────────────────────────────────────── */

  const exportSap = useCallback(() => {
    downloadCsv(
      `sap-bajas-epp-${activePeriodSlug}.csv`,
      [
        "Periodo",
        "Fecha",
        "Material",
        "Descripcion",
        "Talla",
        "Area consumo",
        "Centro costo",
        "Cantidad",
        "Unidad",
        "Texto SAP",
      ],
      summaryRows.map((row) => [
        periodLabel,
        row.date,
        row.material,
        row.itemName,
        row.size,
        row.area,
        row.costCenter,
        row.quantity,
        "PZA",
        `${sapFolio} ${row.area} ${row.itemName}`.slice(0, 80),
      ])
    );
  }, [activePeriodSlug, periodLabel, sapFolio, summaryRows]);

  const exportDetail = useCallback(() => {
    downloadCsv(
      `detalle-consumo-epp-${activePeriodSlug}.csv`,
      [
        "Periodo",
        "Folio",
        "Fecha",
        "Hora",
        "Nomina",
        "Nombre",
        "Area consumo",
        "Centro costo",
        "Material",
        "SKU",
        "Descripcion",
        "Categoria",
        "Talla",
        "Cantidad",
        "Motivo",
        "Origen",
        "Estado",
      ],
      rows.map((row) => [
        periodLabel,
        row.folio,
        row.date,
        row.time,
        row.employeeId,
        row.employeeName,
        row.area,
        row.costCenter,
        row.material,
        row.sku,
        row.itemName,
        row.category,
        row.size,
        row.quantity,
        row.reason,
        row.source,
        row.status,
      ])
    );
  }, [activePeriodSlug, periodLabel, rows]);

  const copySummary = useCallback(async () => {
    const lines = [
      `${sapFolio} | ${periodLabel}`,
      `Total piezas: ${totalQuantity}`,
      `Colaboradores: ${uniqueEmployees}`,
      `Area lider: ${topArea ? `${topArea[0]} (${topArea[1]})` : "Sin consumo"}`,
      ...summaryRows.map((row) => `${row.material} | ${row.itemName} | ${row.area} | ${row.quantity} PZA`),
    ];

    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Resumen copiado.");
  }, [periodLabel, sapFolio, summaryRows, topArea, totalQuantity, uniqueEmployees]);

  return {
    /* Period state */
    periodMode,
    setPeriodMode,
    selectedDate,
    setSelectedDate,
    selectedMonth,
    setSelectedMonth,
    selectedYear,
    setSelectedYear,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    periodLabel,

    /* Filters */
    itemFilter,
    setItemFilter,
    employeeFilter,
    setEmployeeFilter,
    areaFilter,
    setAreaFilter,

    /* Data */
    loading,
    localMode,
    allRows,
    rows,
    summaryRows,
    totalQuantity,
    uniqueEmployees,
    missingRows,
    topArea,
    sapFolio,

    /* Actions */
    loadReport,
    exportSap,
    exportDetail,
    copySummary,
  };
}
