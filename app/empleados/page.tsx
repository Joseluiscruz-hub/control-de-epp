"use client";

import { useEffect, useState, useCallback } from 'react';
import {
  collection, onSnapshot, doc, setDoc,
  serverTimestamp, query, where, getDocs, getDoc, writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  HardHat, Loader2, Eye, ShieldCheck, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { syncLocalKioskEmployees } from '@/lib/kiosk-local-store';

interface Employee {
  docId: string;
  id: string;
  name: string;
  area: string;
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

const BRAND_RED = "#F40009";

export default function EmpleadosPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingKiosk, setSyncingKiosk] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', area: '' });

  // History dialog
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [history, setHistory] = useState<Assignment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Confirm toggle dialog
  const [confirmToggle, setConfirmToggle] = useState<Employee | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'employees'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({
        docId: d.id,
        id: d.data().id,
        name: d.data().name,
        area: d.data().area,
        active: d.data().active,
        createdAt: d.data().createdAt?.toDate(),
      }));
      setEmployees(data);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id || !form.name || !form.area) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'employees', form.id), {
        id: form.id,
        name: form.name,
        area: form.area,
        active: true,
        firstLogin: true,
        termsAccepted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'kiosk_employees', form.id), {
        name: form.name,
        active: true,
        firstLogin: true,
        termsAccepted: false,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      toast.success(`Empleado registrado: ${form.name}`);
      setForm({ id: '', name: '', area: '' });
      setAddOpen(false);
    } catch {
      toast.error('Error al registrar el empleado');
    } finally {
      setSaving(false);
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
          active: nextActive,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await batch.commit();
      toast.success(`${emp.name} fue ${emp.active ? 'dado de baja' : 'reactivado'} correctamente`);
      setConfirmToggle(null);
    } catch {
      toast.error('Error al actualizar el estado');
    }
  };

  const syncKioskEmployees = async () => {
    setSyncingKiosk(true);
    const localSync = syncLocalKioskEmployees(
      employees.map(emp => ({
        id: emp.id,
        name: emp.name,
        area: emp.area,
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
          active: emp.active,
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
      toast.error('Error al cargar historial corporativo');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const filtered = employees.filter(emp => {
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase()) ||
      emp.id.toLowerCase().includes(search.toLowerCase()) ||
      emp.area.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' ? true :
      filterStatus === 'active' ? emp.active : !emp.active;
    return matchSearch && matchStatus;
  });

  const activeCount = employees.filter(e => e.active).length;
  const inactiveCount = employees.filter(e => !e.active).length;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-12 pb-20"
    >
      {/* Header - Corporate Style */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-2xl shadow-red-100/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-full bg-red-600/5 -mr-20 -skew-x-12" />
        
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-3 mb-2">
             <Badge className="bg-red-600 text-white border-none px-4 py-1 rounded-full font-black text-[10px] uppercase tracking-widest">Capital Humano · Seguridad</Badge>
          </div>
          <h1 className="text-5xl lg:text-6xl font-black tracking-tighter text-slate-950">Directorio de <span className="text-red-600">Talento</span></h1>
          <p className="text-slate-400 font-bold text-lg max-w-xl">Gestión integral del personal y trazabilidad de su equipamiento de seguridad.</p>
        </div>
        
        <div className="relative z-10 flex flex-col sm:flex-row gap-4">
          <Button
            onClick={syncKioskEmployees}
            disabled={syncingKiosk || employees.length === 0}
            className="h-20 px-8 rounded-[2rem] bg-white hover:bg-amber-50 text-slate-900 hover:text-amber-700 border border-slate-100 shadow-xl transition-all font-black uppercase tracking-widest text-xs gap-4 active:scale-95 group"
          >
            {syncingKiosk ? <Loader2 className="h-6 w-6 animate-spin" /> : <HardHat className="h-6 w-6 group-hover:scale-110 transition-transform" />}
            Sincronizar Kiosko
          </Button>
          <Button
            onClick={() => setAddOpen(true)}
            className="h-20 px-10 rounded-[2rem] bg-slate-950 hover:bg-[#F40009] text-white shadow-2xl transition-all font-black uppercase tracking-widest text-xs gap-4 active:scale-95 group"
          >
            <UserPlus className="h-6 w-6 group-hover:scale-110 transition-transform" />
            Vincular Nuevo
          </Button>
        </div>
      </div>

      {/* Mini Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="bg-slate-950 p-10 rounded-[3rem] border-none shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <Users className="h-20 w-20 text-white" />
          </div>
          <p className="text-[11px] font-black text-red-500 uppercase tracking-[0.3em] mb-3">Plantilla Total</p>
          <p className="text-6xl font-black text-white tracking-tighter">{employees.length}</p>
        </Card>
        
        <Card className="bg-white p-10 rounded-[3rem] border-none shadow-xl relative overflow-hidden group border border-slate-100">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <UserCheck className="h-20 w-20 text-emerald-600" />
          </div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3">Colaboradores Activos</p>
          <p className="text-6xl font-black text-emerald-600 tracking-tighter">{activeCount}</p>
        </Card>

        <Card className="bg-white p-10 rounded-[3rem] border-none shadow-xl relative overflow-hidden group border border-slate-100">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <UserX className="h-20 w-20 text-red-600" />
          </div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3">En Baja / Inactivos</p>
          <p className="text-6xl font-black text-red-600 tracking-tighter">{inactiveCount}</p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-6 bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-lg">
        <div className="relative flex-1 group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-6 w-6 text-slate-400 group-focus-within:text-red-600 transition-colors" />
          <Input
            placeholder="Filtrar por nombre, nómina o departamento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-16 h-16 bg-transparent border-none rounded-2xl focus-visible:ring-0 font-bold text-lg"
          />
        </div>
        <div className="flex p-1 bg-slate-100 rounded-2xl gap-1">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <Button
              key={s}
              variant={filterStatus === s ? 'default' : 'ghost'}
              onClick={() => setFilterStatus(s)}
              className={`h-14 px-8 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${filterStatus === s ? 'bg-slate-950 text-white shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {s === 'all' ? 'Ver Todos' : s === 'active' ? 'Solo Activos' : 'Solo Bajas'}
            </Button>
          ))}
        </div>
      </div>

      {/* Corporate Table View */}
      <Card className="bg-white rounded-[3.5rem] border-none shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/70 text-left">
                <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Identificación</th>
                <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Nombre Completo</th>
                <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Unidad de Negocio / Área</th>
                <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Estatus Laboral</th>
                <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Controles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence mode="popLayout">
                {filtered.map((emp, idx) => (
                  <motion.tr 
                    layout
                    key={emp.docId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group hover:bg-red-50/30 transition-all cursor-default"
                  >
                    <td className="px-12 py-10 font-black text-slate-900 font-mono tracking-tighter text-lg">#{emp.id}</td>
                    <td className="px-12 py-10">
                       <p className="font-black text-slate-900 text-xl tracking-tight leading-tight">{emp.name}</p>
                       <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Colaborador FEMSA</p>
                    </td>
                    <td className="px-12 py-10">
                      <Badge className="bg-slate-100 text-slate-600 border-slate-200 px-4 py-1.5 rounded-xl font-black text-[9px] tracking-widest uppercase">
                        {emp.area}
                      </Badge>
                    </td>
                    <td className="px-12 py-10">
                      <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-2xl border-2 font-black text-[10px] shadow-sm uppercase tracking-widest ${emp.active ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-700 bg-red-50 border-red-100'}`}>
                        <div className={`h-2 w-2 rounded-full ${emp.active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                        {emp.active ? 'Activo' : 'Inactivo'}
                      </div>
                    </td>
                    <td className="px-12 py-10 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Button
                          size="sm" variant="outline"
                          className="h-12 px-6 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 hover:ring-[#F40009] hover:text-[#F40009] font-black uppercase tracking-tighter text-[10px] transition-all active:scale-95"
                          onClick={() => openHistory(emp)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          EXPEDIENTE
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-12 w-12 rounded-2xl transition-all active:scale-90 ${emp.active
                            ? 'bg-red-50 text-red-600 hover:bg-[#F40009] hover:text-white'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}
                          onClick={() => setConfirmToggle(emp)}
                          title={emp.active ? "Dar de baja" : "Reactivar"}
                        >
                          {emp.active ? <UserX className="h-5 w-5" /> : <UserCheck className="h-5 w-5" />}
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Employee Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-[3rem] border-none p-0 overflow-hidden shadow-2xl">
          <div className="bg-slate-950 p-12 text-white relative">
             <div className="absolute top-0 right-0 p-10 opacity-10">
                <UserPlus className="h-24 w-24" />
             </div>
             <DialogHeader>
                <DialogTitle className="text-3xl font-black tracking-tight uppercase">Registro de Nómina</DialogTitle>
                <p className="text-slate-400 font-bold mt-2">Añadir nuevo colaborador al sistema central de activos.</p>
             </DialogHeader>
          </div>
          <form onSubmit={handleAdd} className="p-12 space-y-8 bg-white">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 ml-1">Nº de Nómina / ID</Label>
                <Input
                  placeholder="Ej: 1881"
                  className="h-16 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-lg"
                  value={form.id}
                  onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 ml-1">Unidad de Negocio</Label>
                <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v ?? '' }))}>
                  <SelectTrigger className="h-16 rounded-2xl bg-slate-50 border-none shadow-inner font-black">
                    <SelectValue placeholder="Área..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {AREAS.map(a => <SelectItem key={a} value={a} className="font-bold">{a.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 ml-1">Nombre Completo del Colaborador</Label>
              <Input
                placeholder="Nombre y Apellidos"
                className="h-16 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-lg"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <DialogFooter className="pt-6">
              <Button
                type="submit"
                disabled={saving || !form.id || !form.name || !form.area}
                className="w-full h-20 rounded-[1.5rem] bg-[#F40009] hover:bg-slate-900 text-white font-black uppercase tracking-widest shadow-2xl transition-all"
              >
                {saving ? <Loader2 className="h-8 w-8 animate-spin" /> : "Vincular a la Red FEMSA"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-3xl rounded-[3rem] border-none p-0 overflow-hidden shadow-2xl">
          <div className="bg-[#F40009] p-12 text-white flex items-center justify-between">
            <div>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">Expediente de Seguridad</DialogTitle>
              <div className="flex items-center gap-3 mt-2">
                 <p className="text-white font-bold opacity-90 text-lg">{selectedEmployee?.name}</p>
                 <Badge className="bg-white/10 text-white border-none font-black text-[9px] tracking-widest">NÓMINA #{selectedEmployee?.id}</Badge>
              </div>
            </div>
            <div className="h-20 w-20 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md">
               <ShieldCheck className="h-10 w-10 text-white" />
            </div>
          </div>
          <div className="p-12 max-h-[600px] overflow-y-auto bg-slate-50/30">
            {historyLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-12 w-12 animate-spin text-[#F40009]" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-inner">
                <Activity className="h-16 w-16 mx-auto mb-4 text-slate-200" />
                <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Sin registros de dotación detectados</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {history.map(h => (
                  <motion.div 
                    key={h.id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-6 rounded-3xl bg-white shadow-sm border border-slate-100 group hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-5">
                       <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shadow-inner ${h.status === 'active' ? 'bg-red-50 text-[#F40009]' : 'bg-slate-100 text-slate-400'}`}>
                          <HardHat className="h-7 w-7" />
                       </div>
                       <div>
                          <p className="font-black text-slate-900 text-lg tracking-tight uppercase">{h.sku}</p>
                          <p className="text-[10px] text-slate-400 font-black tracking-widest uppercase mt-1">
                            DOTACIÓN: {format(h.assignedAt, 'dd MMM, yyyy', { locale: es })}
                          </p>
                       </div>
                    </div>
                    <div className="text-right">
                       <Badge className={`font-black text-[9px] tracking-widest px-4 py-1.5 border-none shadow-sm ${h.status === 'active' ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          {h.status === 'active' ? 'EN OPERACIÓN' : 'HISTÓRICO'}
                       </Badge>
                       {h.nextReplacementAt && h.status === 'active' && (
                         <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mt-2 animate-pulse">
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

      {/* Confirm Toggle Status Dialog */}
      <Dialog open={!!confirmToggle} onOpenChange={() => setConfirmToggle(null)}>
        <DialogContent className="sm:max-w-[450px] rounded-[3rem] border-none p-0 overflow-hidden shadow-2xl">
          <div className={`p-10 text-white ${confirmToggle?.active ? 'bg-[#F40009]' : 'bg-emerald-600'}`}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">
                {confirmToggle?.active ? '¿Dar de Baja?' : '¿Reactivar Colaborador?'}
              </DialogTitle>
              <p className="text-white/80 font-bold mt-2">
                {confirmToggle?.name} — Nómina #{confirmToggle?.id}
              </p>
            </DialogHeader>
          </div>
          <div className="p-10 bg-white space-y-6">
            <p className="text-slate-600 font-medium leading-relaxed">
              {confirmToggle?.active
                ? 'El colaborador será marcado como inactivo. Su historial de EPP se conservará intacto para auditorías.'
                : 'El colaborador será reactivado y podrá recibir dotación de EPP nuevamente.'}
            </p>
            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px]"
                onClick={() => setConfirmToggle(null)}
              >
                Cancelar
              </Button>
              <Button
                className={`flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] text-white shadow-xl ${
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
