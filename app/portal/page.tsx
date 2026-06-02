"use client";

import { useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db, getAppCheckTokenForRequest } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HardHat, Search, AlertTriangle, CheckCircle2, ArrowLeft, Loader2, ShieldCheck, Activity } from 'lucide-react';
import { format, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { getLocalKioskEmployee, listLocalAssignmentsForEmployee } from '@/lib/kiosk-local-store';

interface Assignment {
  id: string;
  sku: string;
  assignedAt: Date;
  nextReplacementAt?: Date;
  status: string;
}

interface Employee {
  id: string;
  name: string;
  area: string;
}

export default function UserPortal() {
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId.trim()) return;

    setLoading(true);
    try {
      const normalizedEmployeeId = employeeId.trim();
      const appCheckToken = await getAppCheckTokenForRequest();
      const employeeResponse = await fetch('/api/kiosk/employee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
        },
        body: JSON.stringify({ employeeId: normalizedEmployeeId }),
      });
      const payload = employeeResponse.ok ? await employeeResponse.json() : null;
      const employeeData = payload?.employee;

      if (!employeeData || employeeData.active !== true) {
        const localEmployee = getLocalKioskEmployee(normalizedEmployeeId);
        if (!localEmployee || localEmployee.active !== true) {
          setEmployee(null);
          setAssignments([]);
          toast.error('Número de empleado no válido');
          return;
        }
        setEmployee({
          id: localEmployee.id,
          name: localEmployee.name,
          area: localEmployee.area ?? localEmployee.plantArea ?? 'SIN ÁREA',
        });
        setAssignments(listLocalAssignmentsForEmployee(localEmployee.id).map((assignment) => ({
          id: assignment.id,
          sku: assignment.sku,
          assignedAt: assignment.assignedAt,
          nextReplacementAt: assignment.nextReplacementAt,
          status: assignment.status,
        })));
        return;
      }

      setEmployee({
        id: employeeData.id,
        name: employeeData.name,
        area: employeeData.area ?? employeeData.plantArea ?? 'SIN ÁREA',
      });

      try {
        const assQuery = query(collection(db, 'assignments'), where('employeeId', '==', employeeData.id));
        const assSnap = await getDocs(assQuery);

        const assData = assSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            sku: data.sku,
            assignedAt: data.assignedAt instanceof Timestamp ? data.assignedAt.toDate() : new Date(),
            nextReplacementAt: data.nextReplacementAt instanceof Timestamp ? data.nextReplacementAt.toDate() : undefined,
            status: data.status,
          };
        }).sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime());
        setAssignments(assData);
      } catch (historyError) {
        console.warn('[Portal assignments unavailable]', historyError);
        setAssignments([]);
      }
    } catch (error) {
      console.error(error);
      const localEmployee = getLocalKioskEmployee(employeeId.trim());
      if (!localEmployee || localEmployee.active !== true) {
        toast.error('Error de conexión con el servidor corporativo');
        return;
      }
      setEmployee({
        id: localEmployee.id,
        name: localEmployee.name,
        area: localEmployee.area ?? localEmployee.plantArea ?? 'SIN ÁREA',
      });
      setAssignments(listLocalAssignmentsForEmployee(localEmployee.id).map((assignment) => ({
        id: assignment.id,
        sku: assignment.sku,
        assignedAt: assignment.assignedAt,
        nextReplacementAt: assignment.nextReplacementAt,
        status: assignment.status,
      })));
      toast.warning('Modo offline: datos locales cargados');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090d] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* ── Dynamic Background ───────────────────── */}
      <div className="absolute inset-0 pointer-events-none">
         <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
         <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(244,0,9,0.14),transparent_38%,rgba(212,160,23,0.06))]" />
      </div>

      <div className="w-full max-w-2xl relative z-10">
        {/* ── Branding ───────────────────────────── */}
        <motion.div 
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <div className="inline-flex h-16 w-16 rounded-xl bg-white/5 border border-white/10 items-center justify-center shadow-xl shadow-black/30 mb-8">
            <ShieldCheck className="h-10 w-10 text-[#F40009]" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase mb-2">Portal de Seguridad</h1>
          <p className="text-[#F40009] font-black tracking-[0.3em] uppercase text-[10px]">Coca-Cola FEMSA Corporativo</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {!employee ? (
            <motion.div
              key="search-box"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5, type: "spring", damping: 20 }}
            >
              <div className="enterprise-panel relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#F40009] to-transparent opacity-50" />
                <div className="p-8 pb-5 text-center">
                  <h2 className="text-2xl font-black text-white tracking-tight">Bienvenido, Colaborador</h2>
                  <p className="text-sm text-white/50 font-medium mt-2">Consulta el estado de tu Equipo de Protección Personal.</p>
                </div>
                <div className="p-8 pt-5">
                  <form onSubmit={handleSearch} className="space-y-6">
                    <div className="relative group">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-6 w-6 text-white/40 group-focus-within:text-[#F40009] transition-colors" />
                      <Input
                        placeholder="Número de Nómina"
                        className="pl-16 py-7 text-xl rounded-lg border-white/10 bg-white/5 focus-visible:ring-[#F40009] text-white placeholder:text-white/30 transition-all font-black text-center"
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full h-14 text-sm font-black bg-[#F40009] hover:bg-red-700 text-white transition-all active:scale-[0.98] rounded-lg uppercase tracking-widest group shadow-lg shadow-red-950/30"
                      disabled={loading || !employeeId}
                    >
                      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                        <>
                          Validar Identidad
                          <ArrowLeft className="ml-3 h-5 w-5 rotate-180 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </Button>
                    <Link
                      href="/kiosko"
                      className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 h-14 text-[11px] font-bold uppercase tracking-widest text-white/70 transition-all hover:border-[#F40009]/50 hover:text-white"
                    >
                      <HardHat className="h-4 w-4 text-amber-500" />
                      Solicitar EPP en Kiosko
                    </Link>
                  </form>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="profile-data"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
            {/* ── Corporate Profile Card ───────────────── */}
            <div className="enterprise-panel">
              <div className="bg-[#0A1628]/50 p-8 flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-white/10">
                <div className="flex items-center gap-6 text-center sm:text-left">
                  <div className="h-14 w-14 rounded-lg bg-[#F40009]/20 border border-[#F40009]/30 flex items-center justify-center text-[#F40009] shadow-lg">
                    <HardHat className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">{employee.name}</h2>
                    <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-2">
                       <span className="bg-white/10 text-white/80 px-3 py-1 font-bold rounded-lg text-[10px] tracking-widest">ID: {employee.id}</span>
                       <span className="bg-[#F40009] text-white px-3 py-1 font-bold rounded-lg text-[10px] tracking-widest uppercase">{employee.area}</span>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEmployee(null)} className="text-white/40 hover:text-white hover:bg-white/10 rounded-lg px-4 py-5 font-bold uppercase tracking-widest text-[10px]">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Salir
                </Button>
              </div>

              <div className="p-8">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] pl-1 mb-4">Inventario Asignado</h3>
                  
                  {assignments.length === 0 ? (
                    <div className="py-16 text-center space-y-4 rounded-lg border border-white/5 bg-white/[0.02]">
                       <div className="h-16 w-16 bg-white/5 rounded-lg flex items-center justify-center mx-auto">
                          <Activity className="h-8 w-8 text-white/20" />
                       </div>
                       <p className="text-white/50 font-bold text-sm">No se registran equipos asignados a esta nómina.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {assignments.map((ass) => {
                        const isOverdue = ass.nextReplacementAt && isBefore(ass.nextReplacementAt, new Date());
                        const isActive = ass.status === 'active';
                        
                        return (
                          <motion.div
                            key={ass.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`surface-action p-5 flex flex-col sm:flex-row items-center justify-between gap-4 ${!isActive ? 'opacity-50 grayscale' : ''}`}
                          >
                            <div className="flex items-center gap-4 w-full sm:w-auto">
                              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${isActive ? (isOverdue ? 'bg-[#F40009]/20 text-[#F40009]' : 'bg-emerald-500/20 text-emerald-400') : 'bg-white/10 text-white/40'}`}>
                                <ShieldCheck className="h-6 w-6" />
                              </div>
                              <div>
                                <h4 className="text-lg font-black text-white tracking-tight">{ass.sku}</h4>
                                <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest mt-0.5">
                                  Entrega: {format(ass.assignedAt, "dd MMM, yyyy", { locale: es })}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-center sm:items-end gap-2 w-full sm:w-auto">
                              {isActive ? (
                                isOverdue ? (
                                  <div className="bg-[#F40009]/20 text-[#F40009] border border-[#F40009]/30 flex items-center gap-2 py-1.5 px-4 rounded-lg font-bold text-[10px] tracking-widest uppercase">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Reposición
                                  </div>
                                ) : (
                                  <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-2 py-1.5 px-4 rounded-lg font-bold text-[10px] tracking-widest uppercase">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Vigente
                                  </div>
                                )
                              ) : (
                                <div className="bg-white/10 text-white/50 border border-white/10 py-1.5 px-4 rounded-lg font-bold text-[10px] tracking-widest uppercase">
                                  Histórico
                                </div>
                              )}
                              
                              {ass.nextReplacementAt && isActive && (
                                <p className={`text-[9px] font-bold uppercase tracking-widest ${isOverdue ? 'text-[#F40009] animate-pulse' : 'text-white/40'}`}>
                                  Cambio: {format(ass.nextReplacementAt, "dd/MM/yyyy")}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="enterprise-panel p-6 text-center">
              <Link
                href="/kiosko"
                className="mb-4 flex w-full items-center justify-center gap-3 rounded-lg bg-[#F40009] px-6 py-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-red-700 shadow-lg shadow-red-950/30"
              >
                <HardHat className="h-4 w-4" />
                Abrir Kiosko para solicitar EPP
              </Link>
              <p className="text-white/40 text-[11px] font-medium leading-relaxed max-w-sm mx-auto">
                Si encuentras discrepancias, reportalo al área de <span className="text-[#F40009] font-bold uppercase">Seguridad Industrial</span>.
              </p>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
        
        {/* ── Footer ───────────────────────────────── */}
        <div className="mt-12 text-center space-y-4 relative z-10">
          <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em]">AssetGuard · Coca-Cola FEMSA v4.0</p>
          <div className="flex items-center justify-center gap-6">
            <Link href="/" className="text-white/40 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-widest">Admin Login</Link>
            <div className="h-1 w-1 rounded-full bg-[#F40009]" />
            <a href="#" className="text-white/40 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-widest">Soporte Técnico</a>
          </div>
        </div>
      </div>
    </div>
  );
}
