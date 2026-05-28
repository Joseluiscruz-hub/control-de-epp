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
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/firebase";
import { handleFirestoreError, OperationType } from "@/lib/firestore-error";
import {
  listLocalAssignments,
  listLocalEmployees,
  listLocalInventory,
} from "@/lib/kiosk-local-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePlantStore } from "@/store/usePlantStore";

type EmployeeLookup = {
  id: string;
  name: string;
  area: string;
  costCenter?: string;
};

type CatalogLookup = {
  sku: string;
  itemName: string;
  category: string;
  material?: string;
};

type ConsumptionRow = {
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
};

type SummaryRow = {
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
};

type PeriodMode = "day" | "month" | "year" | "range";

const REPORTABLE_STATUSES = new Set(["active", "replaced", "pending_review"]);

const REASON_LABELS: Record<string, string> = {
  vida_util: "Vida util",
  desgaste: "Uso normal",
  extravio: "Extravío",
};

function currentDateInputValue() {
  return format(new Date(), "yyyy-MM-dd");
}

function currentMonthInputValue() {
  return format(new Date(), "yyyy-MM");
}

function currentYearInputValue() {
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

function getPeriodRange(params: {
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

function formatPeriodLabel(start: Date, end: Date, mode: PeriodMode) {
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

function StatTile({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.04] text-white",
    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    red: "border-red-400/25 bg-red-500/10 text-red-200",
  }[tone];

  return (
    <div className={cn("rounded-lg border p-4", toneClass)}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-current/15 bg-black/10">
          {icon}
        </span>
        <span className="text-2xl font-black tracking-tight">{value}</span>
      </div>
      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] opacity-60">{label}</p>
    </div>
  );
}

export default function ReportesPage() {
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

  const loadReport = useCallback(async () => {
    setLoading(true);
    setLocalMode(false);
    const { start, end } = activePeriod;

    try {
      const assignmentConstraints: QueryConstraint[] = activePlantId === "todas" ? [
        where("assignedAt", ">=", Timestamp.fromDate(start)),
        where("assignedAt", "<=", Timestamp.fromDate(end)),
        orderBy("assignedAt", "asc"),
      ] : [
        where("plantaId", "==", activePlantId),
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

  const exportSap = () => {
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
  };

  const exportDetail = () => {
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
  };

  const copySummary = async () => {
    const lines = [
      `${sapFolio} | ${periodLabel}`,
      `Total piezas: ${totalQuantity}`,
      `Colaboradores: ${uniqueEmployees}`,
      `Area lider: ${topArea ? `${topArea[0]} (${topArea[1]})` : "Sin consumo"}`,
      ...summaryRows.map((row) => `${row.material} | ${row.itemName} | ${row.area} | ${row.quantity} PZA`),
    ];

    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Resumen copiado.");
  };

  return (
    <div className="space-y-6">
      <section className="enterprise-panel overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-300">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <p className="section-eyebrow">Bajas SAP</p>
                <h1 className="text-2xl font-black tracking-tight text-white">Reporte de Consumo EPP</h1>
                <p className="mt-1 text-sm font-semibold text-white/45">{periodLabel}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={periodMode}
                onChange={(event) => setPeriodMode(event.target.value as PeriodMode)}
                className="h-10 rounded-lg border border-white/10 bg-[#111827] px-3 text-sm font-bold text-white outline-none"
              >
                <option value="day">Diario</option>
                <option value="month">Mensual</option>
                <option value="year">Anual</option>
                <option value="range">Rango</option>
              </select>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                {periodMode === "day" && (
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="h-10 rounded-lg border-white/10 bg-white/5 pl-10 font-bold text-white"
                  />
                )}
                {periodMode === "month" && (
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    className="h-10 rounded-lg border-white/10 bg-white/5 pl-10 font-bold text-white"
                  />
                )}
                {periodMode === "year" && (
                  <Input
                    type="number"
                    value={selectedYear}
                    min="2020"
                    max="2100"
                    onChange={(event) => setSelectedYear(event.target.value)}
                    className="h-10 w-28 rounded-lg border-white/10 bg-white/5 pl-10 font-bold text-white"
                  />
                )}
              </div>
              {periodMode === "range" && (
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={rangeStart}
                    onChange={(event) => setRangeStart(event.target.value)}
                    className="h-10 rounded-lg border-white/10 bg-white/5 font-bold text-white"
                  />
                  <Input
                    type="date"
                    value={rangeEnd}
                    onChange={(event) => setRangeEnd(event.target.value)}
                    className="h-10 rounded-lg border-white/10 bg-white/5 font-bold text-white"
                  />
                </div>
              )}
              <Button
                variant="outline"
                className="h-10 rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10"
                onClick={() => void loadReport()}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Actualizar
              </Button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Input
              value={itemFilter}
              onChange={(event) => setItemFilter(event.target.value)}
              placeholder="Filtrar por articulo, SKU o material"
              className="h-10 rounded-lg border-white/10 bg-white/5 font-semibold text-white placeholder:text-white/30"
            />
            <Input
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
              placeholder="Filtrar por usuario o nomina"
              className="h-10 rounded-lg border-white/10 bg-white/5 font-semibold text-white placeholder:text-white/30"
            />
            <Input
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
              placeholder="Filtrar por area o CECO"
              className="h-10 rounded-lg border-white/10 bg-white/5 font-semibold text-white placeholder:text-white/30"
            />
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={<PackageCheck className="h-4 w-4" />}
            label="Piezas consumidas"
            value={totalQuantity}
            tone={totalQuantity > 0 ? "green" : "neutral"}
          />
          <StatTile
            icon={<Users className="h-4 w-4" />}
            label="Colaboradores"
            value={uniqueEmployees}
            tone="neutral"
          />
          <StatTile
            icon={<TrendingUp className="h-4 w-4" />}
            label="Area principal"
            value={topArea ? topArea[0] : "Sin consumo"}
            tone="amber"
          />
          <StatTile
            icon={missingRows > 0 ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            label="Revision de datos"
            value={missingRows > 0 ? `${missingRows} alertas` : "Listo"}
            tone={missingRows > 0 ? "red" : "green"}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-white/70">
              Folio {sapFolio}
            </Badge>
            <Badge className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-white/60">
              {rows.length} de {allRows.length} movimientos
            </Badge>
            {localMode && (
              <Badge className="rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-amber-200">
                Modo local
              </Badge>
            )}
            {missingRows > 0 && (
              <Badge className="rounded-md border border-red-400/25 bg-red-500/10 px-3 py-1 text-red-200">
                Datos por revisar
              </Badge>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="h-10 rounded-lg bg-[#F40009] font-black text-white hover:bg-red-700"
              onClick={exportSap}
              disabled={summaryRows.length === 0}
            >
              <Download className="h-4 w-4" />
              SAP CSV
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={exportDetail}
              disabled={rows.length === 0}
            >
              <Download className="h-4 w-4" />
              Detalle CSV
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-lg text-white/55 hover:bg-white/5 hover:text-white"
              onClick={() => void copySummary()}
              disabled={rows.length === 0}
            >
              <ClipboardCopy className="h-4 w-4" />
              Copiar
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="enterprise-panel overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 p-5">
            <div>
              <p className="section-eyebrow">Consolidado</p>
              <h2 className="text-lg font-black text-white">Material por area</h2>
            </div>
            <Badge className="rounded-md border border-white/10 bg-white/5 text-white/60">
              {summaryRows.length} lineas
            </Badge>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-red-400" />
            </div>
          ) : summaryRows.length === 0 ? (
            <div className="flex h-64 items-center justify-center px-6 text-center text-sm font-semibold text-white/45">
              Sin consumos registrados para este corte.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="px-5 text-[10px] font-black uppercase tracking-widest text-white/45">Material</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Area</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Talla</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-white/45">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryRows.map((row) => (
                  <TableRow key={row.key} className="border-white/10 hover:bg-white/[0.03]">
                    <TableCell className="px-5 py-4">
                      <div className="max-w-[380px]">
                        <p className="font-bold text-white">{row.itemName}</p>
                        <p className="mt-1 font-mono text-xs text-white/40">{row.material}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <p className="font-semibold text-white/75">{row.area}</p>
                      {row.costCenter && <p className="mt-1 text-xs text-white/35">CECO {row.costCenter}</p>}
                    </TableCell>
                    <TableCell className="py-4 text-white/60">{row.size}</TableCell>
                    <TableCell className="py-4 text-right">
                      <span className="inline-flex min-w-12 justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 font-black text-emerald-200">
                        {row.quantity}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <aside className="space-y-4">
          <div className="enterprise-panel p-5">
            <p className="section-eyebrow">Pulso del dia</p>
            <div className="mt-4 space-y-3">
              {summaryRows.slice(0, 5).map((row) => (
                <div key={`pulse-${row.key}`} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{row.itemName}</p>
                      <p className="mt-1 text-xs font-semibold text-white/40">{row.area}</p>
                    </div>
                    <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-black text-white">
                      {row.quantity}
                    </span>
                  </div>
                </div>
              ))}
              {!loading && summaryRows.length === 0 && (
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm font-semibold text-white/45">
                  Sin lineas para mostrar.
                </div>
              )}
            </div>
          </div>

          <div className="enterprise-panel p-5">
            <div className="flex items-start gap-3">
              <span className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                missingRows > 0
                  ? "border-red-400/25 bg-red-500/10 text-red-200"
                  : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              )}>
                {missingRows > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              </span>
              <div>
                <p className="font-black text-white">Control SAP</p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-white/50">
                  {missingRows > 0
                    ? "Hay lineas con empleado, area o material pendiente de validar."
                    : "El corte esta completo para captura operativa."}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="enterprise-panel overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <p className="section-eyebrow">Trazabilidad</p>
            <h2 className="text-lg font-black text-white">Detalle por colaborador</h2>
          </div>
          <Badge className="rounded-md border border-white/10 bg-white/5 text-white/60">
            {rows.length} movimientos
          </Badge>
        </div>

        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-red-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-72 items-center justify-center px-6 text-center text-sm font-semibold text-white/45">
            Sin movimientos de consumo para este dia.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="px-5 text-[10px] font-black uppercase tracking-widest text-white/45">Hora</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Colaborador</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Area</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Material</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-white/45">Motivo</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-white/45">Cantidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="border-white/10 hover:bg-white/[0.03]">
                  <TableCell className="px-5 py-4 font-mono text-xs text-white/55">{row.time}</TableCell>
                  <TableCell className="py-4">
                    <p className="font-bold text-white">{row.employeeName}</p>
                    <p className="mt-1 font-mono text-xs text-white/35">#{row.employeeId}</p>
                  </TableCell>
                  <TableCell className="py-4">
                    <p className="font-semibold text-white/75">{row.area}</p>
                    {row.hasMissingData && (
                      <p className="mt-1 text-xs font-bold text-red-300">Revisar dato maestro</p>
                    )}
                  </TableCell>
                  <TableCell className="py-4">
                    <p className="max-w-[280px] truncate font-semibold text-white/80">{row.itemName}</p>
                    <p className="mt-1 font-mono text-xs text-white/35">{row.material} · {row.size}</p>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge className="rounded-md border border-white/10 bg-white/5 text-white/55">
                      {row.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 text-right font-black text-white">{row.quantity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
