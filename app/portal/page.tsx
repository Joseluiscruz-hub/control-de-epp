"use client";

import { useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { HardHat, Search, Calendar, AlertTriangle, CheckCircle2, ArrowLeft, Loader2, ShieldCheck, Activity } from 'lucide-react';
import { format, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

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

const BRAND_RED = "#F40009";

export default function UserPortal() {
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const empQuery = query(collection(db, 'employees'), where('id', '==', employeeId.trim()));
      const empSnap = await getDocs(empQuery);

      if (empSnap.empty) {
        setEmployee(null);
        setAssignments([]);
        toast.error('Número de empleado no válido');
        return;
      }

      const empDoc = empSnap.docs[0];
      setEmployee({
        id: empDoc.data().id,
        name: empDoc.data().name,
        area: empDoc.data().area,
      });

      const assQuery = query(collection(db, 'assignments'), where('employeeId', '==', empDoc.id));
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
    } catch (error) {
      console.error(error);
      toast.error('Error de conexión con el servidor corporativo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
         <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-red-600/20 via-transparent to-slate-900/50" />
         <div className="absolute -top-40 -left-40 w-96 h-96 bg-red-600/20 rounded-full blur-[120px]" />
         <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-red-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-2xl relative z-10">
        {/* Branding */}
        <motion.div 
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <div className="inline-flex h-24 w-24 rounded-[2rem] bg-white items-center justify-center shadow-2xl shadow-red-900/40 mb-8 group hover:scale-110 transition-transform duration-500">
            <ShieldCheck className="h-12 w-12 text-[#F40009]" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase mb-2">Portal de Seguridad</h1>
          <p className="text-femsa-red font-black tracking-[0.3em] uppercase text-xs">Coca-Cola FEMSA Corporativo</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {!employee ? (
            <motion.div
              key="search-box"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.5, type: "spring", damping: 20 }}
            >
              <Card className="border-none overflow-hidden rounded-[3rem] bg-white shadow-2xl shadow-red-900/20">
                <div className="h-3 bg-[#F40009]" />
                <CardHeader className="p-12 pb-6">
                  <CardTitle className="text-3xl font-black text-slate-950 tracking-tight">Bienvenido, Colaborador</CardTitle>
                  <CardDescription className="text-lg text-slate-500 font-medium">Consulta el estado de tu Equipo de Protección Personal.</CardDescription>
                </CardHeader>
                <CardContent className="p-12 pt-6">
                  <form onSubmit={handleSearch} className="space-y-8">
                    <div className="relative group">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 group-focus-within:text-[#F40009] transition-colors" />
                      <Input
                        placeholder="Número de Nómina"
                        className="pl-16 py-10 text-2xl rounded-[1.5rem] border-slate-100 bg-slate-50 focus-visible:ring-[#F40009] transition-all shadow-inner font-black"
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full py-10 text-2xl font-black bg-[#F40009] hover:bg-slate-950 text-white shadow-2xl shadow-red-200 transition-all active:scale-[0.98] rounded-[1.5rem] uppercase tracking-widest group"
                      disabled={loading || !employeeId}
                    >
                      {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : (
                        <>
                          Validar Identidad
                          <ArrowLeft className="ml-4 h-6 w-6 rotate-180 group-hover:translate-x-2 transition-transform" />
                        </>
                      )}
                    </Button>
                    <Link
                      href="/kiosko"
                      className="flex w-full items-center justify-center gap-3 rounded-[1.5rem] border-2 border-slate-100 bg-white py-6 text-sm font-black uppercase tracking-widest text-slate-700 shadow-sm transition-all hover:border-[#F40009] hover:text-[#F40009]"
                    >
                      <HardHat className="h-5 w-5" />
                      Solicitar EPP en Kiosko
                    </Link>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="profile-data"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-8"
            >
            {/* Corporate Profile Card */}
            <Card className="border-none shadow-2xl bg-white rounded-[3rem] overflow-hidden">
              <div className="bg-slate-900 p-10 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6 text-center sm:text-left">
                  <div className="h-20 w-20 rounded-3xl bg-[#F40009] flex items-center justify-center text-white shadow-xl shadow-red-900/20">
                    <HardHat className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight">{employee.name}</h2>
                    <div className="flex flex-wrap justify-center sm:justify-start gap-3 mt-2">
                       <Badge className="bg-white/10 text-white border-none px-3 py-1 font-bold">ID: {employee.id}</Badge>
                       <Badge className="bg-[#F40009] text-white border-none px-3 py-1 font-bold uppercase tracking-widest text-[9px]">{employee.area}</Badge>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEmployee(null)} className="text-slate-400 hover:text-white hover:bg-white/10 rounded-xl px-4 py-6 font-bold uppercase tracking-tighter">
                  <ArrowLeft className="h-5 w-5 mr-2" /> Salir
                </Button>
              </div>

              <CardContent className="p-10 bg-slate-50/50">
                <div className="space-y-6">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] pl-1 mb-8">Inventario de Seguridad Personal</h3>
                  
                  {assignments.length === 0 ? (
                    <div className="py-20 text-center space-y-4">
                       <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto opacity-50">
                          <Activity className="h-10 w-10 text-slate-400" />
                       </div>
                       <p className="text-slate-400 font-bold">No se registran equipos asignados a esta nómina.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {assignments.map((ass) => {
                        const isOverdue = ass.nextReplacementAt && isBefore(ass.nextReplacementAt, new Date());
                        const isActive = ass.status === 'active';
                        
                        return (
                          <motion.div
                            key={ass.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6 hover:shadow-md transition-all ${!isActive ? 'opacity-50 grayscale' : ''}`}
                          >
                            <div className="flex items-center gap-5 w-full sm:w-auto">
                              <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shadow-inner ${isActive ? (isOverdue ? 'bg-red-50 text-[#F40009]' : 'bg-emerald-50 text-emerald-600') : 'bg-slate-100 text-slate-400'}`}>
                                <ShieldCheck className="h-7 w-7" />
                              </div>
                              <div>
                                <h4 className="text-xl font-black text-slate-900 tracking-tight">{ass.sku}</h4>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                                  Entrega: {format(ass.assignedAt, "d 'de' MMMM, yyyy", { locale: es })}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-center sm:items-end gap-3 w-full sm:w-auto">
                              {isActive ? (
                                isOverdue ? (
                                  <Badge className="bg-[#F40009] text-white border-none gap-2 py-2 px-5 rounded-full font-black text-[10px] tracking-widest shadow-lg shadow-red-200 uppercase">
                                    <AlertTriangle className="h-4 w-4" /> Reposición Urgente
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-500 text-white border-none gap-2 py-2 px-5 rounded-full font-black text-[10px] tracking-widest shadow-lg shadow-emerald-200 uppercase">
                                    <CheckCircle2 className="h-4 w-4" /> Equipo Vigente
                                  </Badge>
                                )
                              ) : (
                                <Badge className="bg-slate-200 text-slate-500 border-none px-5 py-2 rounded-full font-black text-[10px] tracking-widest uppercase">
                                  Histórico
                                </Badge>
                              )}
                              
                              {ass.nextReplacementAt && isActive && (
                                <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isOverdue ? 'text-[#F40009] animate-pulse' : 'text-slate-400'}`}>
                                  Próximo cambio: {format(ass.nextReplacementAt, "dd/MM/yyyy")}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <div className="bg-white/5 backdrop-blur-md rounded-[2rem] p-8 border border-white/10 text-center">
              <Link
                href="/kiosko"
                className="mb-6 flex w-full items-center justify-center gap-3 rounded-[1.5rem] bg-[#F40009] px-6 py-5 text-sm font-black uppercase tracking-widest text-white shadow-2xl shadow-red-900/20 transition-all hover:bg-white hover:text-[#F40009]"
              >
                <HardHat className="h-5 w-5" />
                Abrir Kiosko para solicitar EPP
              </Link>
              <p className="text-slate-400 text-sm font-medium leading-relaxed">
                Si encuentras alguna discrepancia en tu historial, por favor reportalo de inmediato al área de <span className="text-red-500 font-black uppercase tracking-widest">Seguridad Industrial</span> de tu planta.
              </p>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
        
        {/* Footer */}
        <div className="mt-16 text-center space-y-6">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">AssetGuard · Coca-Cola FEMSA v4.0</p>
          <div className="flex items-center justify-center gap-8">
            <Link href="/" className="text-slate-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">Admin Login</Link>
            <div className="h-1.5 w-1.5 rounded-full bg-red-600" />
            <a href="#" className="text-slate-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">Soporte Técnico</a>
          </div>
        </div>
      </div>
    </div>
  );
}
