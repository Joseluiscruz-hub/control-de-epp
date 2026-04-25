"use client";

import { useEffect, useState, useCallback } from 'react';
import {
  collection, onSnapshot, doc, setDoc, updateDoc,
  serverTimestamp, query, where, getDocs, orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
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
  HardHat, Loader2, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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

export default function EmpleadosPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', area: '' });

  // History dialog
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [history, setHistory] = useState<Assignment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
      await setDoc(doc(db, 'employees', form.id), {
        id: form.id,
        name: form.name,
        area: form.area,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success(`Empleado ${form.name} registrado exitosamente`);
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
      await updateDoc(doc(db, 'employees', emp.docId), {
        active: !emp.active,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Empleado ${emp.active ? 'desactivado' : 'activado'} correctamente`);
    } catch {
      toast.error('Error al actualizar el estado');
    }
  };

  const openHistory = useCallback(async (emp: Employee) => {
    setSelectedEmployee(emp);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const q = query(
        collection(db, 'assignments'),
        where('employeeId', '==', emp.docId),
        orderBy('assignedAt', 'desc')
      );
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({
        id: d.id,
        sku: d.data().sku,
        assignedAt: d.data().assignedAt?.toDate() || new Date(),
        nextReplacementAt: d.data().nextReplacementAt?.toDate(),
        status: d.data().status,
      })));
    } catch {
      toast.error('No se pudo cargar el historial');
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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Directorio de Empleados</h1>
          <p className="text-gray-500 mt-1">Gestiona el personal activo y su historial de EPP.</p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo Empleado
        </Button>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-indigo-600" />
              Registrar Nuevo Empleado
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label htmlFor="emp-id">Número de Empleado *</Label>
              <Input
                id="emp-id"
                placeholder="Ej: 1881"
                value={form.id}
                onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-name">Nombre Completo *</Label>
              <Input
                id="emp-name"
                placeholder="Ej: Juan Pérez García"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-area">Área de Trabajo *</Label>
              <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v ?? '' }))}>
                <SelectTrigger id="emp-area" className="w-full">
                  <SelectValue placeholder="Selecciona un área" />
                </SelectTrigger>
                <SelectContent>
                  {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving || !form.id || !form.name || !form.area}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Total Empleados</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{employees.length}</p>
              </div>
              <Users className="h-8 w-8 text-indigo-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Activos</p>
                <p className="text-3xl font-bold text-green-700 mt-1">{activeCount}</p>
              </div>
              <UserCheck className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-400">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Inactivos</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{inactiveCount}</p>
              </div>
              <UserX className="h-8 w-8 text-red-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre, ID o área..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={filterStatus === s ? 'default' : 'outline'}
              onClick={() => setFilterStatus(s)}
              className={filterStatus === s ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
            >
              {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : 'Inactivos'}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center p-16 text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No se encontraron empleados</p>
              <p className="text-sm mt-1">Intenta ajustar los filtros o agrega uno nuevo</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/60">
                    <th className="h-11 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">ID</th>
                    <th className="h-11 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Nombre</th>
                    <th className="h-11 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Área</th>
                    <th className="h-11 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Estado</th>
                    <th className="h-11 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Alta</th>
                    <th className="h-11 px-5 text-right font-semibold text-gray-500 text-xs uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(emp => (
                    <tr key={emp.docId} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-semibold text-gray-600 text-xs">{emp.id}</td>
                      <td className="px-5 py-3.5 font-semibold text-gray-900">{emp.name}</td>
                      <td className="px-5 py-3.5 text-gray-600">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {emp.area}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={emp.active ? 'default' : 'secondary'}
                          className={emp.active ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                          {emp.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs">
                        {emp.createdAt ? format(emp.createdAt, 'dd MMM yyyy', { locale: es }) : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm" variant="outline"
                            className="gap-1.5 text-xs h-8"
                            onClick={() => openHistory(emp)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Historial
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`gap-1.5 text-xs h-8 ${emp.active
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                            onClick={() => toggleStatus(emp)}
                          >
                            {emp.active
                              ? <><UserX className="h-3.5 w-3.5" />Dar de Baja</>
                              : <><UserCheck className="h-3.5 w-3.5" />Reactivar</>
                            }
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-indigo-600" />
              Historial EPP — {selectedEmployee?.name}
              <span className="ml-1 text-sm font-normal text-gray-500">#{selectedEmployee?.id}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <HardHat className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Sin entregas registradas para este empleado</p>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between p-3.5 rounded-lg border bg-gray-50/60">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{h.sku}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Entrega: {format(h.assignedAt, 'dd MMM yyyy', { locale: es })}
                        {h.nextReplacementAt && (
                          <span className={`ml-3 ${new Date() > h.nextReplacementAt ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            · Cambio: {format(h.nextReplacementAt, 'dd MMM yyyy', { locale: es })}
                            {new Date() > h.nextReplacementAt && ' ⚠️'}
                          </span>
                        )}
                      </p>
                    </div>
                    <Badge variant={h.status === 'active' ? 'default' : 'secondary'}
                      className={h.status === 'active' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : ''}>
                      {h.status === 'active' ? 'En uso' : 'Reemplazado'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
