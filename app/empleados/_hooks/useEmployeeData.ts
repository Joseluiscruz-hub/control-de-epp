"use client";

import { useEffect, useState, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import {
  canUseLocalFallback,
  listLocalAssignmentsForEmployee,
  listLocalEmployees,
  listLocalKioskRequestsForEmployee,
  setLocalEmployeeActive,
  syncLocalKioskEmployees,
  upsertLocalEmployee,
} from '@/lib/kiosk-local-store';
import {
  hasBlockingPersonnelIssues,
  parsePersonnelTsv,
  type ParsedPersonnelImport,
  type PersonnelRecord,
} from '@/lib/personnel-import';
import { normalizePlantId } from '@/lib/plants';
import { usePlantStore } from '@/store/usePlantStore';

/* ── Shared types ────────────────────────────────── */

export interface Employee {
  docId: string;
  id: string;
  name: string;
  area: string;
  personnelArea?: string;
  plantArea?: string;
  position?: string;
  jobFunction?: string;
  plantaId?: string;
  active: boolean;
  createdAt?: Date;
}

export interface Assignment {
  id: string;
  sku: string;
  itemName?: string;
  size?: string;
  assignedAt: Date;
  nextReplacementAt?: Date;
  status: string;
}

export interface KioskRequestHistoryItem {
  itemId: string;
  itemName: string;
  sku: string;
  size: string;
  replacementDays: number;
  replacementReason?: string;
  chargeAmount?: number;
}

export interface KioskRequestHistory {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  items: KioskRequestHistoryItem[];
  createdAt?: Date;
  updatedAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  hasEarlyReplacementAlert?: boolean;
  assignmentIds?: string[];
}

export const AREAS = [
  'Soldadura', 'Ensamble', 'Pintura', 'Logística', 'Mantenimiento',
  'Calidad', 'Almacén', 'Administración', 'Seguridad Industrial', 'Producción'
];

/* ── Hook ─────────────────────────────────────────── */

export function useEmployeeData() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<ParsedPersonnelImport | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingKiosk, setSyncingKiosk] = useState(false);
  const [importingPersonnel, setImportingPersonnel] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', area: '' });
  const { activePlantId } = usePlantStore();
  const writePlantId = normalizePlantId(activePlantId);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [history, setHistory] = useState<Assignment[]>([]);
  const [kioskRequests, setKioskRequests] = useState<KioskRequestHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [confirmToggle, setConfirmToggle] = useState<Employee | null>(null);

  /* ── Firestore listener / local fallback ───────── */

  const loadLocalEmployees = useCallback(() => {
    if (!canUseLocalFallback()) {
      setEmployees([]);
      setLoading(false);
      return;
    }

    setEmployees(listLocalEmployees());
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadEmployees = async () => {
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('missing_admin_session');

        const response = await fetch(`/api/employees?plant=${encodeURIComponent(activePlantId)}`, {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof result?.error === 'string' ? result.error : 'employees_load_failed');
        }

        if (cancelled) return;
        const data = Array.isArray(result?.employees) ? result.employees : [];
        setEmployees(data.map((employee: Employee & { createdAt?: string }) => ({
          ...employee,
          createdAt: employee.createdAt ? new Date(employee.createdAt) : undefined,
        })));
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error('[Employee admin list error]', error);
        toast.error('No se pudo cargar la base de colaboradores desde Firebase.');
        loadLocalEmployees();
      }
    };

    void loadEmployees();

    return () => {
      cancelled = true;
    };
  }, [activePlantId, loadLocalEmployees]);

  /* ── Add single employee ──────────────────────── */

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id || !form.name || !form.area) return;
    setSaving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('missing_admin_session');

      const record: PersonnelRecord = {
        id: form.id.trim(),
        name: form.name.trim(),
        area: form.area.trim(),
        hireDate: '',
        division: '',
        positionId: '',
        position: '',
        personnelArea: form.area.trim(),
        plantArea: form.area.trim(),
        costCenter: '',
        jobFunction: '',
        sex: '',
        sourceRow: 1,
      };

      const response = await fetch('/api/personnel/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ records: [record], plantaId: writePlantId }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'employee_create_failed');
      }

      upsertLocalEmployee({ id: form.id, name: form.name, area: form.area, active: true });
      toast.success(`Empleado registrado: ${form.name}`);
      setForm({ id: '', name: '', area: '' });
      setAddOpen(false);
    } catch (error) {
      console.error('[Employee admin create error]', error);
      toast.error('No se pudo registrar en la plataforma administradora. Revisa tu sesión online.');
    } finally {
      setSaving(false);
    }
  };

  /* ── Personnel file parsing ────────────────────── */

  const handlePersonnelFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parsePersonnelTsv(text);
      setImportFileName(file.name);
      setImportPreview(parsed);

      if (hasBlockingPersonnelIssues(parsed)) {
        toast.error('La base tiene errores de formato. Revisa la vista previa.');
      } else {
        toast.success(`Base validada: ${parsed.summary.validRows} colaboradores listos.`);
      }
    } catch (error) {
      console.error('[Personnel import parse error]', error);
      toast.error('No se pudo leer la base de personal');
    }
  };

  const resetPersonnelImport = () => {
    setImportFileName('');
    setImportPreview(null);
  };

  /* ── Import personnel base ─────────────────────── */

  const importPersonnelBase = async () => {
    if (!importPreview || hasBlockingPersonnelIssues(importPreview) || importPreview.records.length === 0) return;

    setImportingPersonnel(true);
    const savePersonnelLocally = () => {
      const localSync = syncLocalKioskEmployees(
        importPreview.records.map(record => ({
          id: record.id,
          name: record.name,
          area: record.area,
          personnelArea: record.personnelArea,
          plantArea: record.plantArea,
          position: record.position,
          jobFunction: record.jobFunction,
          active: true,
        }))
      );
      setEmployees(listLocalEmployees());
      setImportOpen(false);
      resetPersonnelImport();
      return localSync;
    };

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('missing_admin_session');
      }

      const response = await fetch('/api/personnel/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ records: importPreview.records, plantaId: writePlantId }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'personnel_import_failed');
      }

      const localSync = savePersonnelLocally();

      toast.success(
        `Base cargada: ${result.createdEmployees ?? 0} nuevos, ${result.updatedEmployees ?? 0} actualizados. Kiosko local: ${localSync.total}.`
      );
    } catch (error) {
      console.error('[Personnel import write error]', error);
      if (canUseLocalFallback()) {
        const localSync = savePersonnelLocally();
        toast.warning(`Sin conexión con servidor. Base guardada localmente con ${localSync.total} colaborador(es).`);
      } else {
        toast.error('No se pudo cargar la base en Firebase.');
      }
    } finally {
      setImportingPersonnel(false);
    }
  };

  /* ── Toggle active / inactive ──────────────────── */

  const toggleStatus = async (emp: Employee) => {
    try {
      const nextActive = !emp.active;
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('missing_admin_session');

      const response = await fetch('/api/employees', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ employeeId: emp.docId, active: nextActive }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(typeof result?.error === 'string' ? result.error : 'employee_status_failed');
      }

      if (canUseLocalFallback()) setLocalEmployeeActive(emp.id, nextActive);
      setEmployees((current) => current.map((item) => (
        item.docId === emp.docId ? { ...item, active: nextActive } : item
      )));
      toast.success(`${emp.name} fue ${emp.active ? 'dado de baja' : 'reactivado'} correctamente`);
      setConfirmToggle(null);
    } catch {
      const nextActive = !emp.active;
      if (canUseLocalFallback()) {
        setLocalEmployeeActive(emp.id, nextActive);
        setEmployees(listLocalEmployees());
        toast.success(`${emp.name} fue ${emp.active ? 'dado de baja' : 'reactivado'} localmente`);
      } else {
        toast.error('Firebase no permitió actualizar el colaborador.');
      }
      setConfirmToggle(null);
    }
  };

  /* ── Sync kiosk ────────────────────────────────── */

  const syncKioskEmployees = async () => {
    setSyncingKiosk(true);
    const localSync = canUseLocalFallback()
      ? syncLocalKioskEmployees(
        employees.map(emp => ({
          id: emp.id,
          name: emp.name,
          area: emp.area,
          personnelArea: emp.personnelArea,
          plantArea: emp.plantArea,
          position: emp.position,
          jobFunction: emp.jobFunction,
          active: emp.active,
        }))
      )
      : { total: 0 };

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('missing_admin_session');
      const response = await fetch(`/api/employees/sync-kiosk?plant=${encodeURIComponent(activePlantId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'kiosk_sync_failed');
      }

      toast.success(
        result.created > 0
          ? `Kiosko sincronizado: ${result.created} colaborador(es) habilitado(s).`
          : `Kiosko sincronizado con ${result.total ?? employees.length} colaborador(es).`
      );
    } catch (error) {
      console.error('[Kiosk employees sync error]', error);
      if (canUseLocalFallback()) {
        toast.warning(
          `Firebase no permitió sincronizar, pero el kiosko local quedó listo con ${localSync.total} colaborador(es).`
        );
      } else {
        toast.error('Firebase no permitió sincronizar el kiosko.');
      }
    } finally {
      setSyncingKiosk(false);
    }
  };

  /* ── Open history (with limit(50) fix) ─────────── */

  const openHistory = useCallback(async (emp: Employee) => {
    setSelectedEmployee(emp);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistory([]);
    setKioskRequests([]);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('missing_admin_session');
      const params = new URLSearchParams({
        employeeId: emp.id,
        employeeDocId: emp.docId,
      });
      const response = await fetch(`/api/employees/history?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'employee_history_failed');
      }

      setHistory(
        ((Array.isArray(result?.assignments) ? result.assignments : [])
          .map((assignment: Assignment & { assignedAt?: string; nextReplacementAt?: string }) => ({
            id: assignment.id,
            sku: assignment.sku,
            itemName: assignment.itemName,
            size: assignment.size,
            assignedAt: assignment.assignedAt ? new Date(assignment.assignedAt) : new Date(),
            nextReplacementAt: assignment.nextReplacementAt ? new Date(assignment.nextReplacementAt) : undefined,
            status: assignment.status,
          })) as Assignment[])
          .sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime())
      );
      setKioskRequests(
        ((Array.isArray(result?.requests) ? result.requests : [])
          .map((request: {
            id: string;
            status: string;
            items?: KioskRequestHistoryItem[];
            createdAt?: string;
            updatedAt?: string;
            approvedAt?: string;
            rejectedAt?: string;
            hasEarlyReplacementAlert?: boolean;
            assignmentIds?: string[];
          }) => ({
            id: request.id,
            status: request.status,
            items: Array.isArray(request.items) ? request.items : [],
            createdAt: request.createdAt ? new Date(request.createdAt) : undefined,
            updatedAt: request.updatedAt ? new Date(request.updatedAt) : undefined,
            approvedAt: request.approvedAt ? new Date(request.approvedAt) : undefined,
            rejectedAt: request.rejectedAt ? new Date(request.rejectedAt) : undefined,
            hasEarlyReplacementAlert: request.hasEarlyReplacementAlert,
            assignmentIds: request.assignmentIds,
          })) as KioskRequestHistory[])
          .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      );
    } catch {
      if (canUseLocalFallback()) {
        setHistory(
          listLocalAssignmentsForEmployee(emp.id).map((assignment) => ({
            id: assignment.id,
            sku: assignment.sku,
            itemName: assignment.itemId,
            size: assignment.size,
            assignedAt: assignment.assignedAt,
            nextReplacementAt: assignment.nextReplacementAt,
            status: assignment.status,
          }))
        );
        setKioskRequests(
          listLocalKioskRequestsForEmployee(emp.id).map((request) => ({
            id: request.id,
            status: request.status,
            items: request.items.map((item) => ({
              itemId: item.itemId,
              itemName: item.itemName,
              sku: item.sku,
              size: item.size,
              replacementDays: item.replacementDays,
              replacementReason: item.replacementReason,
              chargeAmount: item.chargeAmount,
            })),
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
            hasEarlyReplacementAlert: request.hasEarlyReplacementAlert,
            assignmentIds: request.assignmentIds,
          }))
        );
        toast.warning('Historial local cargado sin conexion corporativa');
      } else {
        setHistory([]);
        setKioskRequests([]);
        toast.error('No se pudo cargar el historial desde Firebase.');
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  /* ── Filtering ─────────────────────────────────── */

  const filtered = employees.filter(emp => {
    const searchable = [
      emp.name,
      emp.id,
      emp.area,
      emp.personnelArea,
      emp.plantArea,
      emp.position,
      emp.jobFunction,
    ].filter(Boolean).join(' ').toLowerCase();
    const matchSearch = searchable.includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' ? true :
      filterStatus === 'active' ? emp.active : !emp.active;
    return matchSearch && matchStatus;
  });

  /* ── Computed stats ────────────────────────────── */

  const activeCount = employees.filter(e => e.active).length;
  const inactiveCount = employees.filter(e => !e.active).length;
  const importHasBlockingIssues = importPreview ? hasBlockingPersonnelIssues(importPreview) : false;

  return {
    // data
    employees,
    filtered,
    loading,
    activeCount,
    inactiveCount,

    // search & filter
    search,
    setSearch,
    filterStatus,
    setFilterStatus,

    // add dialog
    addOpen,
    setAddOpen,
    form,
    setForm,
    saving,
    handleAdd,

    // import dialog
    importOpen,
    setImportOpen,
    importFileName,
    importPreview,
    importingPersonnel,
    importHasBlockingIssues,
    handlePersonnelFile,
    resetPersonnelImport,
    importPersonnelBase,

    // kiosk sync
    syncingKiosk,
    syncKioskEmployees,

    // history dialog
    historyOpen,
    setHistoryOpen,
    selectedEmployee,
    history,
    kioskRequests,
    historyLoading,
    openHistory,

    // confirm toggle
    confirmToggle,
    setConfirmToggle,
    toggleStatus,
  };
}
