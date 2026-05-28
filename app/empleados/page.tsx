"use client";

import { useEffect, useState, useCallback } from 'react';
import {
  collection, onSnapshot, doc,
  serverTimestamp, query, where, getDocs, getDoc, writeBatch
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Users, UserPlus, Search, UserX, UserCheck,
  HardHat, Loader2, Eye, ShieldCheck, Activity,
  Database, Upload, FileWarning, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
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

interface Employee {
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

interface Assignment {
  id: string;
  sku: string;
  assignedAt: Date;
  nextReplacementAt?: Date;
  status: string;
}

const AREAS = [
  'Soldadura', 'Ensamble', 'Pintura', 'Logística', 'Mantenimiento',
  'Calidad', 'Almacén', 'Administración', 'Seguridad Industrial', 'Producción'
];

export default function EmpleadosPage() {
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

  const openHistory = useCallback(async (emp: Employee) => {
    setSelectedEmployee(emp);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const q = query(
        collection(db, 'assignments'),
        where('employeeId', '==', emp.docId)
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

  const activeCount = employees.filter(e => e.active).length;
  const inactiveCount = employees.filter(e => !e.active).length;
  const importHasBlockingIssues = importPreview ? hasBlockingPersonnelIssues(importPreview) : false;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-6 pb-20"
    >
      {/* ── Header ───────────────────────────────── */}
      <div className="executive-hero flex flex-col lg:flex-row lg:items-center justify-between gap-8 p-8">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-red-600/10 to-transparent pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3">
             <span className="badge-femsa">Capital Humano · Seguridad</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white">
            Directorio de <span className="text-gradient-red">Talento</span>
          </h1>
          <p className="text-white/55 font-medium text-base max-w-xl">
            Gestión integral del personal y trazabilidad de su equipamiento de seguridad.
          </p>
        </div>
        
        <div className="relative z-10 flex flex-col sm:flex-row gap-4">
          <Button
            onClick={() => setImportOpen(true)}
            className="h-12 px-5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold uppercase tracking-widest text-xs gap-3 group"
          >
            <Database className="h-5 w-5 group-hover:scale-110 transition-transform text-sky-400" />
            Cargar Base Planta
          </Button>
          <Button
            onClick={syncKioskEmployees}
            disabled={syncingKiosk || employees.length === 0}
            className="h-12 px-5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold uppercase tracking-widest text-xs gap-3 group"
          >
            {syncingKiosk ? <Loader2 className="h-5 w-5 animate-spin" /> : <HardHat className="h-5 w-5 group-hover:scale-110 transition-transform text-amber-500" />}
            Sincronizar Kiosko
          </Button>
          <Button
            onClick={() => setAddOpen(true)}
            className="h-12 px-5 rounded-lg bg-[#F40009] hover:bg-red-700 text-white shadow-lg shadow-red-950/30 transition-all font-bold uppercase tracking-widest text-xs gap-3 group"
          >
            <UserPlus className="h-5 w-5 group-hover:scale-110 transition-transform" />
            Vincular Nuevo
          </Button>
        </div>
      </div>

      {/* ── Mini Stats Grid ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="kpi-card p-6 group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <Users className="h-20 w-20 text-white" />
          </div>
          <p className="section-eyebrow mb-2">Plantilla Total</p>
          <p className="text-4xl font-black text-white tracking-tight">{employees.length}</p>
        </div>
        
        <div className="kpi-card p-6 group" style={{borderColor: 'rgba(16,185,129,0.2)'}}>
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <UserCheck className="h-20 w-20 text-emerald-500" />
          </div>
          <p className="section-eyebrow mb-2" style={{color:'rgba(16,185,129,0.8)'}}>Colaboradores Activos</p>
          <p className="text-4xl font-black text-emerald-400 tracking-tight">{activeCount}</p>
        </div>

        <div className="kpi-card p-6 group" style={{borderColor: 'rgba(244,0,9,0.2)'}}>
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <UserX className="h-20 w-20 text-red-500" />
          </div>
          <p className="section-eyebrow mb-2" style={{color:'rgba(248,113,113,0.82)'}}>En Baja / Inactivos</p>
          <p className="text-4xl font-black text-red-500 tracking-tight">{inactiveCount}</p>
        </div>
      </div>

      {/* ── Filter and Search Bar ────────────────── */}
      <div className="enterprise-panel flex flex-col md:flex-row gap-4 p-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 group-focus-within:text-[#F40009] transition-colors" />
          <Input
            placeholder="Filtrar por nombre, nómina o departamento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-14 h-12 bg-white/5 border-white/10 rounded-lg text-white placeholder:text-white/30 focus-visible:ring-[#F40009] font-medium"
          />
        </div>
        <div className="flex p-1 bg-white/5 rounded-lg gap-1 border border-white/5">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <Button
              key={s}
              variant="ghost"
              onClick={() => setFilterStatus(s)}
              className={`h-10 px-5 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all ${
                filterStatus === s 
                  ? 'bg-white/15 text-white shadow-lg' 
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              {s === 'all' ? 'Ver Todos' : s === 'active' ? 'Solo Activos' : 'Solo Bajas'}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Corporate Table View ─────────────────── */}
      <div className="enterprise-panel">
        <div className="overflow-x-auto">
          <table className="w-full premium-table">
            <thead>
              <tr className="bg-white/5 text-left border-b border-white/10">
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Identificación</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Nombre Completo</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Unidad / Área</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Estatus</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-right">Controles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence mode="popLayout">
                {filtered.map((emp, idx) => (
                  <motion.tr 
                    layout
                    key={emp.docId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group hover:bg-white/[0.02] transition-colors cursor-default"
                  >
                    <td className="px-8 py-6 font-bold text-white/90 font-mono tracking-tight text-lg">#{emp.id}</td>
                    <td className="px-8 py-6">
                       <p className="font-bold text-white text-lg tracking-tight">{emp.name}</p>
                       <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                         {emp.position || emp.jobFunction || 'Colaborador FEMSA'}
                       </p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col items-start gap-2">
                        <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 font-bold text-[10px] tracking-widest uppercase text-white/70">
                          {emp.area}
                        </span>
                        {emp.personnelArea && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">
                            {emp.personnelArea}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-xl border font-bold text-[10px] uppercase tracking-widest ${
                        emp.active 
                          ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' 
                          : 'text-red-400 bg-red-400/10 border-red-400/20'
                      }`}>
                        <div className={`h-1.5 w-1.5 rounded-full ${emp.active ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                        {emp.active ? 'Activo' : 'Inactivo'}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm" variant="ghost"
                          className="h-10 px-4 rounded-xl bg-white/5 hover:bg-[#F40009]/20 hover:text-[#F40009] text-white/70 font-bold uppercase tracking-wider text-[10px] transition-all"
                          onClick={() => openHistory(emp)}
                        >
                          <Eye className="h-3.5 w-3.5 mr-2" />
                          EXPEDIENTE
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-10 w-10 rounded-xl transition-all ${
                            emp.active
                              ? 'text-red-400 hover:bg-red-500 hover:text-white'
                              : 'text-emerald-400 hover:bg-emerald-500 hover:text-white'
                          }`}
                          onClick={() => setConfirmToggle(emp)}
                          title={emp.active ? "Dar de baja" : "Reactivar"}
                        >
                          {emp.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Personnel Import Dialog ─────────────── */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open && !importingPersonnel) resetPersonnelImport();
        }}
      >
        <DialogContent className="sm:max-w-4xl rounded-[2rem] border border-white/10 p-0 overflow-hidden shadow-2xl bg-[#040813]">
          <div className="bg-white/5 p-8 relative border-b border-white/10">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Database className="h-20 w-20 text-white" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tight text-white uppercase">Base Operativa de Planta</DialogTitle>
              <p className="text-white/50 font-medium mt-1">Carga controlada de colaboradores autorizados para portal y kiosko.</p>
            </DialogHeader>
          </div>

          <div className="p-8 space-y-6 max-h-[72vh] overflow-y-auto">
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Archivo TSV / TXT de personal</Label>
              <Input
                type="file"
                accept=".txt,.tsv,text/plain,text/tab-separated-values"
                onChange={handlePersonnelFile}
                disabled={importingPersonnel}
                className="mt-3 h-14 rounded-xl bg-white/5 border-white/10 text-white file:mr-4 file:rounded-lg file:border-0 file:bg-[#F40009] file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-widest file:text-white hover:file:bg-red-700"
              />
              {importFileName && (
                <div className="mt-4 flex items-center gap-3 text-sm font-bold text-white/70">
                  <Upload className="h-4 w-4 text-sky-400" />
                  {importFileName}
                </div>
              )}
            </div>

            {importPreview && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="section-eyebrow mb-2">Registros</p>
                    <p className="text-3xl font-black text-white">{importPreview.summary.validRows}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="section-eyebrow mb-2">Columnas</p>
                    <p className="text-3xl font-black text-white">{importPreview.summary.columnCount}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="section-eyebrow mb-2">Duplicados</p>
                    <p className={`text-3xl font-black ${importPreview.summary.duplicateIds.length ? 'text-red-400' : 'text-emerald-400'}`}>
                      {importPreview.summary.duplicateIds.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="section-eyebrow mb-2">Estado</p>
                    <p className={`text-sm font-black uppercase tracking-widest ${importHasBlockingIssues ? 'text-red-400' : 'text-emerald-400'}`}>
                      {importHasBlockingIssues ? 'Bloqueado' : 'Listo'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">AREA PLANTA</h3>
                    <div className="space-y-3">
                      {Object.entries(importPreview.summary.byPlantArea).map(([area, total]) => (
                        <div key={area} className="flex items-center justify-between gap-4">
                          <span className="text-xs font-bold uppercase tracking-widest text-white/65">{area}</span>
                          <span className="rounded-lg bg-white/10 px-3 py-1 text-[10px] font-black text-white">{total}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">Validación</h3>
                    {importPreview.issues.length === 0 ? (
                      <div className="flex items-center gap-3 text-emerald-400 font-bold text-sm">
                        <CheckCircle2 className="h-5 w-5" />
                        Formato validado sin incidencias.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {importPreview.issues.slice(0, 6).map((issue, index) => (
                          <div key={`${issue.row}-${index}`} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                            <FileWarning className={`mt-0.5 h-4 w-4 ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`} />
                            <div>
                              <p className={`text-[10px] font-black uppercase tracking-widest ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                                Fila {issue.row} · {issue.severity === 'error' ? 'Error' : 'Aviso'}
                              </p>
                              <p className="text-xs font-medium text-white/65 mt-1">{issue.message}</p>
                            </div>
                          </div>
                        ))}
                        {importPreview.issues.length > 6 && (
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                            +{importPreview.issues.length - 6} incidencias adicionales
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300 mb-2">Datos privados omitidos</p>
                  <p className="text-sm font-medium leading-relaxed text-white/60">
                    RFC, IMSS, CURP y fecha de nacimiento no se escriben en el snapshot del kiosko ni en la carga operativa inicial.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="border-t border-white/10 p-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setImportOpen(false)}
              disabled={importingPersonnel}
              className="h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] text-white/50 hover:text-white hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={importPersonnelBase}
              disabled={!importPreview || importHasBlockingIssues || importingPersonnel || importPreview.records.length === 0}
              className="h-12 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest text-xs px-6"
            >
              {importingPersonnel ? <Loader2 className="h-5 w-5 animate-spin" /> : `Cargar ${importPreview?.summary.validRows ?? 0} colaboradores`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Employee Dialog ──────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-[2rem] border border-white/10 p-0 overflow-hidden shadow-2xl bg-[#040813]">
          <div className="bg-white/5 p-8 relative border-b border-white/10">
             <div className="absolute top-0 right-0 p-8 opacity-10">
                <UserPlus className="h-20 w-20 text-white" />
             </div>
             <DialogHeader>
                <DialogTitle className="text-2xl font-black tracking-tight text-white uppercase">Registro de Nómina</DialogTitle>
                <p className="text-white/50 font-medium mt-1">Añadir nuevo colaborador al sistema central de activos.</p>
             </DialogHeader>
          </div>
          <form onSubmit={handleAdd} className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Nº de Nómina / ID</Label>
                <Input
                  placeholder="Ej: 1881"
                  className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-medium focus-visible:ring-[#F40009]"
                  value={form.id}
                  onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Unidad de Negocio</Label>
                <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v ?? '' }))}>
                  <SelectTrigger className="h-12 rounded-xl bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Área..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1628] border-white/10 text-white rounded-xl">
                    {AREAS.map(a => <SelectItem key={a} value={a}>{a.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Nombre Completo</Label>
              <Input
                placeholder="Nombre y Apellidos"
                className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-medium focus-visible:ring-[#F40009]"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <DialogFooter className="pt-4">
              <Button
                type="submit"
                disabled={saving || !form.id || !form.name || !form.area}
                className="w-full h-14 rounded-xl bg-[#F40009] hover:bg-red-700 text-white font-bold uppercase tracking-widest transition-all"
              >
                {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : "Vincular a la Red FEMSA"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── History Dialog ───────────────────────── */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-3xl rounded-[2rem] border border-white/10 p-0 overflow-hidden shadow-2xl bg-[#040813]">
          <div className="bg-[#F40009] p-8 text-white flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Expediente de Seguridad</DialogTitle>
              <div className="flex items-center gap-3 mt-2">
                 <p className="text-white font-bold opacity-90">{selectedEmployee?.name}</p>
                 <span className="px-2 py-1 bg-white/20 rounded font-black text-[9px] tracking-widest">NÓMINA #{selectedEmployee?.id}</span>
              </div>
            </div>
            <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center">
               <ShieldCheck className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="p-8 max-h-[600px] overflow-y-auto">
            {historyLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-10 w-10 animate-spin text-[#F40009]" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-20 rounded-2xl border border-white/10 bg-white/5">
                <Activity className="h-12 w-12 mx-auto mb-4 text-white/20" />
                <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Sin registros de dotación</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {history.map(h => (
                  <motion.div 
                    key={h.id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/10"
                  >
                    <div className="flex items-center gap-4">
                       <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                         h.status === 'active' ? 'bg-[#F40009]/20 text-[#F40009]' : 'bg-white/10 text-white/40'
                       }`}>
                          <HardHat className="h-6 w-6" />
                       </div>
                       <div>
                          <p className="font-bold text-white text-base uppercase">{h.sku}</p>
                          <p className="text-[10px] text-white/50 font-bold tracking-widest uppercase mt-0.5">
                            DOTACIÓN: {format(h.assignedAt, 'dd MMM, yyyy', { locale: es })}
                          </p>
                       </div>
                    </div>
                    <div className="text-right">
                       <span className={`inline-block font-bold text-[9px] tracking-widest px-3 py-1 rounded-lg ${
                         h.status === 'active' ? 'bg-[#F40009] text-white' : 'bg-white/10 text-white/40'
                       }`}>
                          {h.status === 'active' ? 'EN OPERACIÓN' : 'HISTÓRICO'}
                       </span>
                       {h.nextReplacementAt && h.status === 'active' && (
                         <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mt-1.5 animate-pulse">
                           Cambio: {format(h.nextReplacementAt, 'dd/MM/yyyy')}
                         </p>
                       )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Toggle Status Dialog ─────────── */}
      <Dialog open={!!confirmToggle} onOpenChange={() => setConfirmToggle(null)}>
        <DialogContent className="sm:max-w-[450px] rounded-[2rem] border border-white/10 p-0 overflow-hidden bg-[#040813]">
          <div className={`p-8 text-white ${confirmToggle?.active ? 'bg-[#F40009]' : 'bg-emerald-600'}`}>
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">
                {confirmToggle?.active ? '¿Dar de Baja?' : '¿Reactivar Colaborador?'}
              </DialogTitle>
              <p className="text-white/80 font-medium mt-1 text-sm">
                {confirmToggle?.name} — Nómina #{confirmToggle?.id}
              </p>
            </DialogHeader>
          </div>
          <div className="p-8 space-y-6">
            <p className="text-white/70 font-medium text-sm">
              {confirmToggle?.active
                ? 'El colaborador será marcado como inactivo. Su historial de EPP se conservará intacto.'
                : 'El colaborador será reactivado y podrá recibir dotación de EPP.'}
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] text-white/50 hover:text-white hover:bg-white/10"
                onClick={() => setConfirmToggle(null)}
              >
                Cancelar
              </Button>
              <Button
                className={`flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] text-white ${
                  confirmToggle?.active 
                    ? 'bg-[#F40009] hover:bg-red-700' 
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
                onClick={() => confirmToggle && toggleStatus(confirmToggle)}
              >
                {confirmToggle?.active ? 'Confirmar Baja' : 'Confirmar Reactivación'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
