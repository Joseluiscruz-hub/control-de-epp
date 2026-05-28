"use client";

import { useEffect, useState, useCallback } from 'react';
import {
  collection, onSnapshot, doc,
  serverTimestamp, query, where, getDocs, getDoc, writeBatch, limit
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { toast } from 'sonner';
import {
  listLocalAssignmentsForEmployee,
  listLocalEmployees,
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
  assignedAt: Date;
  nextReplacementAt?: Date;
  status: string;
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
  const [historyLoading, setHistoryLoading] = useState(false);

  const [confirmToggle, setConfirmToggle] = useState<Employee | null>(null);

  /* ── Firestore listener / local fallback ───────── */

  const loadLocalEmployees = useCallback(() => {
    setEmployees(listLocalEmployees());
    setLoading(false);
  }, []);

  useEffect(() => {
    try {
      const q = activePlantId === 'todas'
        ? query(collection(db, 'employees'))
        : query(collection(db, 'employees'), where('plantaId', '==', activePlantId));
      const unsub = onSnapshot(q, (snap) => {
        const data = snap.docs.map(d => {
          const employee = d.data();
          return {
            docId: d.id,
            id: employee.id,
            name: employee.name,
            area: employee.area,
            personnelArea: employee.personnelArea,
            plantArea: employee.plantArea,
            position: employee.position,
            jobFunction: employee.jobFunction,
            plantaId: employee.plantaId,
            active: employee.active,
            createdAt: employee.createdAt?.toDate(),
          };
        });
        setEmployees(data);
        setLoading(false);
      }, () => loadLocalEmployees());
      return () => unsub();
    } catch {
      const timeout = window.setTimeout(() => {
        loadLocalEmployees();
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [activePlantId, loadLocalEmployees]);

  /* ── Add single employee ───────────────────────── */

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
      const localSync = savePersonnelLocally();
      toast.warning(`Sin conexión con servidor. Base guardada localmente con ${localSync.total} colaborador(es).`);
    } finally {
      setImportingPersonnel(false);
    }
  };

  /* ── Toggle active / inactive ──────────────────── */

  const toggleStatus = async (emp: Employee) => {
    try {
      const nextActive = !emp.active;
      const batch = writeBatch(db);
      batch.update(doc(db, 'employees', emp.docId), {
        active: nextActive,
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'kiosk_employees', emp.docId),
        {
          name: emp.name,
          area: emp.area,
          plantaId: emp.plantaId ?? writePlantId,
          personnelArea: emp.personnelArea ?? '',
          plantArea: emp.plantArea ?? emp.area,
          position: emp.position ?? '',
          jobFunction: emp.jobFunction ?? '',
          active: nextActive,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await batch.commit();
      setLocalEmployeeActive(emp.id, nextActive);
      toast.success(`${emp.name} fue ${emp.active ? 'dado de baja' : 'reactivado'} correctamente`);
      setConfirmToggle(null);
    } catch {
      const nextActive = !emp.active;
      setLocalEmployeeActive(emp.id, nextActive);
      setEmployees(listLocalEmployees());
      toast.success(`${emp.name} fue ${emp.active ? 'dado de baja' : 'reactivado'} localmente`);
      setConfirmToggle(null);
    }
  };

  /* ── Sync kiosk ────────────────────────────────── */

  const syncKioskEmployees = async () => {
    setSyncingKiosk(true);
    const localSync = syncLocalKioskEmployees(
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
    );

    try {
      const snapshots = await Promise.all(
        employees.map(emp => getDoc(doc(db, 'kiosk_employees', emp.docId)))
      );

      let batch = writeBatch(db);
      let writes = 0;
      let created = 0;

      for (let i = 0; i < employees.length; i++) {
        const emp = employees[i];
        const kioskRef = doc(db, 'kiosk_employees', emp.docId);
        const baseData = {
          name: emp.name,
          area: emp.area,
          personnelArea: emp.personnelArea ?? '',
          plantArea: emp.plantArea ?? emp.area,
          position: emp.position ?? '',
          jobFunction: emp.jobFunction ?? '',
          active: emp.active,
          plantaId: emp.plantaId ?? writePlantId,
          updatedAt: serverTimestamp(),
        };

        if (snapshots[i].exists()) {
          batch.set(kioskRef, baseData, { merge: true });
        } else {
          batch.set(kioskRef, {
            ...baseData,
            firstLogin: true,
            termsAccepted: false,
          });
          created++;
        }

        writes++;
        if (writes >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          writes = 0;
        }
      }

      if (writes > 0) {
        await batch.commit();
      }

      toast.success(
        created > 0
          ? `Kiosko sincronizado: ${created} colaborador(es) habilitado(s). Copia local lista.`
          : `Kiosko sincronizado. Copia local lista con ${localSync.total} colaborador(es).`
      );
    } catch (error) {
      console.error('[Kiosk employees sync error]', error);
      toast.warning(
        `Firebase no permitió sincronizar, pero el kiosko local quedó listo con ${localSync.total} colaborador(es).`
      );
    } finally {
      setSyncingKiosk(false);
    }
  };

  /* ── Open history (with limit(50) fix) ─────────── */

  const openHistory = useCallback(async (emp: Employee) => {
    setSelectedEmployee(emp);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const q = query(
        collection(db, 'assignments'),
        where('employeeId', '==', emp.docId),
        limit(50)
      );
      const snap = await getDocs(q);
      setHistory(
        snap.docs
          .map(d => ({
            id: d.id,
            sku: d.data().sku,
            assignedAt: d.data().assignedAt?.toDate() || new Date(),
            nextReplacementAt: d.data().nextReplacementAt?.toDate(),
            status: d.data().status,
          }))
          .sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime())
      );
    } catch {
      setHistory(
        listLocalAssignmentsForEmployee(emp.docId).map((assignment) => ({
          id: assignment.id,
          sku: assignment.sku,
          assignedAt: assignment.assignedAt,
          nextReplacementAt: assignment.nextReplacementAt,
          status: assignment.status,
        }))
      );
      toast.warning('Historial local cargado sin conexión corporativa');
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
    historyLoading,
    openHistory,

    // confirm toggle
    confirmToggle,
    setConfirmToggle,
    toggleStatus,
  };
}
