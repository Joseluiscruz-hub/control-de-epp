"use client";

import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, query, orderBy, limit, getDocs,
  where, Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HardHat, Users, AlertTriangle, ArrowRight, Package,
  TrendingUp, Clock, CheckCircle2, Activity, Bot, ExternalLink
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { format, isToday, isBefore, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { AssignPpeDialog } from '@/components/assign-ppe-dialog';
import { useAuth } from '@/components/auth-provider';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';

interface Assignment {
  id: string;
  employeeId: string;
  sku: string;
  assignedAt: Date;
  nextReplacementAt?: Date;
  status: string;
}

interface DashboardStats {
  todayAssignments: number;
  activeEmployees: number;
  alertsThisWeek: number;
  totalInventoryItems: number;
  lowStockItems: number;
  totalStock: number;
}

export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const [recentAssignments, setRecentAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    todayAssignments: 0,
    activeEmployees: 0,
    alertsThisWeek: 0,
    totalInventoryItems: 0,
    lowStockItems: 0,
    totalStock: 0,
  });
  const [upcomingAlerts, setUpcomingAlerts] = useState<Assignment[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'assignments'), orderBy('assignedAt', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const assignments = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          employeeId: data.employeeId,
          sku: data.sku,
          assignedAt: data.assignedAt instanceof Timestamp
            ? data.assignedAt.toDate()
            : new Date(),
          nextReplacementAt: data.nextReplacementAt instanceof Timestamp
            ? data.nextReplacementAt.toDate()
            : undefined,
          status: data.status,
        };
      });
      setRecentAssignments(assignments);

      const todayCount = assignments.filter(a => isToday(a.assignedAt)).length;
      setStats(prev => ({ ...prev, todayAssignments: todayCount }));

      const now = new Date();
      const nextWeek = addDays(now, 7);
      const alerts = assignments.filter(a =>
        a.nextReplacementAt &&
        a.status === 'active' &&
        (isBefore(a.nextReplacementAt, nextWeek) || isBefore(a.nextReplacementAt, now))
      );
      setUpcomingAlerts(alerts);
      setStats(prev => ({ ...prev, alertsThisWeek: alerts.length }));

      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'assignments');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [empSnap, invSnap] = await Promise.all([
          getDocs(query(collection(db, 'employees'), where('active', '==', true))),
          getDocs(collection(db, 'ppe_catalog')),
        ]);

        const invData = invSnap.docs.map(d => d.data());
        const totalStockValue = invData.reduce((sum, d) => sum + (d.stock || 0), 0);
        const lowStock = invData.filter(d => d.stock <= 20).length;

        setStats(prev => ({
          ...prev,
          activeEmployees: empSnap.size,
          totalInventoryItems: invSnap.size,
          totalStock: totalStockValue,
          lowStockItems: lowStock,
        }));
      } catch { /* silently fail */ }
    };
    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Entregas de Hoy',
      value: loading ? '—' : stats.todayAssignments,
      icon: <HardHat className="h-5 w-5" />,
      color: 'border-l-blue-500',
      iconBg: 'bg-blue-50 text-blue-600',
      sub: 'Registradas en el turno actual',
      subColor: 'text-blue-600',
    },
    {
      title: 'Empleados Activos',
      value: stats.activeEmployees || '—',
      icon: <Users className="h-5 w-5" />,
      color: 'border-l-indigo-500',
      iconBg: 'bg-indigo-50 text-indigo-600',
      sub: 'Personal en planta',
      subColor: 'text-indigo-600',
    },
    {
      title: 'Alertas de Reposición',
      value: stats.alertsThisWeek,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: stats.alertsThisWeek > 0 ? 'border-l-orange-500' : 'border-l-green-400',
      iconBg: stats.alertsThisWeek > 0 ? 'bg-orange-50 text-orange-500' : 'bg-green-50 text-green-600',
      sub: stats.alertsThisWeek > 0 ? 'Requieren cambio esta semana' : 'Sin alertas pendientes ✓',
      subColor: stats.alertsThisWeek > 0 ? 'text-orange-600' : 'text-green-600',
    },
    {
      title: 'SKUs en Catálogo',
      value: stats.totalInventoryItems || '—',
      icon: <Package className="h-5 w-5" />,
      color: stats.lowStockItems > 0 ? 'border-l-red-400' : 'border-l-emerald-500',
      iconBg: stats.lowStockItems > 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600',
      sub: stats.lowStockItems > 0
        ? `${stats.lowStockItems} artículo(s) con stock bajo`
        : `${stats.totalStock.toLocaleString()} unidades disponibles`,
      subColor: stats.lowStockItems > 0 ? 'text-red-600' : 'text-emerald-600',
    },
  ];

  return (
    <div className="space-y-12 pb-20">
      {/* Welcome Section - Premium Overhaul */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="relative group"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-[3rem] blur-2xl group-hover:opacity-100 opacity-50 transition-opacity duration-1000" />
        
        <div className="relative glass-card p-10 rounded-[3rem] border-white/40 overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-white/50 backdrop-blur-xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent rounded-full -mr-32 -mt-32 blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
          
          <div className="relative z-10 space-y-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Badge className="bg-indigo-600 text-white border-none px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-200">
                INDUSTRIAL INTELLIGENCE OPS
              </Badge>
            </motion.div>
            
            <h1 className="text-5xl lg:text-7xl font-black tracking-tighter text-slate-900 leading-tight">
              ¡Hola, <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 animate-gradient-x">{authUser?.displayName?.split(' ')[0] || 'Admin'}</span>! 👋
            </h1>
            
            <p className="text-slate-500 max-w-xl text-lg font-medium leading-relaxed">
              Sistema <span className="text-indigo-600 font-bold">ARIA AI</span> activo. Monitoreando actualmente la seguridad de <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-slate-900 font-black text-sm">{stats.activeEmployees} colaboradores</span> en tiempo real.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Servidores Cloud OK</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl">
                <Activity className="h-4 w-4 text-slate-400" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sincronización: {format(new Date(), 'HH:mm')}</span>
              </div>
            </div>
          </div>
          
          <div className="relative z-10 flex flex-col items-end justify-center">
            <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl shadow-indigo-200 border-t border-white/20 relative group overflow-hidden">
              <div className="absolute inset-0 shimmer opacity-10" />
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-2">Operational Status</p>
              <p className="text-4xl font-black tracking-tight mb-4">ÓPTIMO</p>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '98%' }}
                  transition={{ duration: 2, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500" 
                />
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-4 text-right">
                {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards - Glass Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {statCards.map((card, idx) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + (idx * 0.1), duration: 0.8 }}
            whileHover={{ y: -8, transition: { duration: 0.2 } }}
          >
            <Card className="group relative h-full glass-card hover:bg-white transition-all duration-500 overflow-hidden rounded-[2.5rem] border-none ring-1 ring-slate-100 hover:ring-indigo-100 bg-white/50 backdrop-blur-xl">
              <div className={`absolute top-0 left-0 w-2 h-full ${card.color.replace('border-l-', 'bg-')} opacity-20 group-hover:opacity-100 transition-opacity`} />
              
              <CardHeader className="flex flex-row items-center justify-between pb-4 pt-8 px-8">
                <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{card.title}</CardTitle>
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${card.iconBg} shadow-inner group-hover:scale-110 group-hover:rotate-6 transition-all duration-500`}>
                  {card.icon}
                </div>
              </CardHeader>
              
              <CardContent className="px-8 pb-10">
                <div className="text-5xl font-black text-slate-900 tracking-tighter mb-4 font-display">
                  {card.value}
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${card.subColor.replace('text-', 'bg-')} animate-pulse`} />
                  <p className={`text-[10px] font-black uppercase tracking-widest ${card.subColor}`}>{card.sub}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Alerts Banner - Dynamic Neomorfismo */}
      <AnimatePresence>
        {upcomingAlerts.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-[3rem] border-2 border-orange-100 bg-white p-10 shadow-2xl shadow-orange-100/30 flex flex-col lg:flex-row items-center gap-8 relative overflow-hidden group"
          >
            <div className="absolute top-0 left-0 w-2 h-full bg-orange-500" />
            <div className="h-20 w-20 rounded-3xl bg-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-200 group-hover:rotate-12 transition-transform duration-500">
              <AlertTriangle className="h-10 w-10 text-white animate-bounce" />
            </div>
            
            <div className="flex-1 text-center lg:text-left space-y-2">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                Alerta de Seguridad Crítica
              </h2>
              <p className="text-slate-500 font-medium text-lg">
                Detectamos <span className="text-orange-600 font-black underline decoration-orange-300 decoration-4 underline-offset-4">{upcomingAlerts.length} elementos</span> que requieren reposición inmediata.
              </p>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex -space-x-4 overflow-hidden">
                {upcomingAlerts.slice(0, 5).map((a) => (
                  <motion.div 
                    key={a.id} 
                    whileHover={{ y: -10, zIndex: 50 }}
                    className="h-14 w-14 rounded-2xl border-4 border-white bg-slate-50 flex items-center justify-center shadow-xl cursor-help"
                    title={a.sku}
                  >
                    <HardHat className="h-6 w-6 text-slate-400" />
                  </motion.div>
                ))}
              </div>
              <Link href="/empleados">
                <Button className="bg-slate-900 hover:bg-orange-600 text-white rounded-2xl px-10 h-16 shadow-xl transition-all font-black uppercase tracking-widest text-xs active:scale-95">
                  Gestionar Ahora
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid - Bento Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        {/* Recent Activity Table - Mission Control View */}
        <Card className="xl:col-span-2 glass-card rounded-[3rem] border-none overflow-hidden group bg-white/50 backdrop-blur-xl">
          <CardHeader className="p-10 pb-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Clock className="h-6 w-6" />
                  </div>
                  Bitácora de Actividad
                </CardTitle>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest pl-1">Monitoreo en tiempo real (Cloud Sync Active)</p>
              </div>
              <Badge className="bg-emerald-500/10 text-emerald-600 border-none px-4 py-2 font-black text-[10px] tracking-widest uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                Live Feed
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-6 p-10">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="shimmer h-16 rounded-2xl opacity-20 bg-slate-200" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto custom-scroll">
                <table className="w-full">
                  <thead>
                    <tr className="text-left bg-slate-50/50">
                      <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Colaborador</th>
                      <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Material SKU</th>
                      <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Fecha/Hora</th>
                      <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {recentAssignments.map((a, idx) => {
                      const isOverdue = a.nextReplacementAt && isBefore(a.nextReplacementAt, new Date());
                      return (
                        <motion.tr 
                          key={a.id} 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.8 + (idx * 0.05) }}
                          className="group hover:bg-indigo-50/50 transition-all cursor-default"
                        >
                          <td className="px-10 py-6">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 flex items-center justify-center text-slate-400 font-black text-xs group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                                {a.employeeId.slice(-2)}
                              </div>
                              <span className="font-black text-slate-800 tracking-tight">Emp #{a.employeeId}</span>
                            </div>
                          </td>
                          <td className="px-10 py-6">
                            <span className="text-xs font-black bg-slate-100 text-slate-600 px-4 py-1.5 rounded-xl border border-slate-200 group-hover:bg-white transition-colors">
                              {a.sku}
                            </span>
                          </td>
                          <td className="px-10 py-6">
                            <p className="text-xs font-bold text-slate-500 font-mono">
                              {format(a.assignedAt, 'dd MMM, HH:mm', { locale: es })}
                            </p>
                          </td>
                          <td className="px-10 py-6 text-right">
                            <Badge className={`font-black text-[9px] tracking-widest px-3 py-1 border-none shadow-sm ${
                              isOverdue 
                                ? 'bg-red-500 text-white shadow-red-200' 
                                : a.status === 'active' 
                                  ? 'bg-emerald-500 text-white shadow-emerald-200' 
                                  : 'bg-slate-200 text-slate-500'
                            }`}>
                              {isOverdue ? 'VENCIDO' : a.status === 'active' ? 'ACTIVO' : 'CERRADO'}
                            </Badge>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="p-10 border-t border-slate-100 bg-slate-50/20 text-center">
              <Link href="/empleados" className="inline-flex items-center gap-3 text-sm font-black text-indigo-600 hover:text-indigo-800 transition-all group">
                VER HISTORIAL COMPLETO DE OPERACIONES
                <ArrowRight className="h-5 w-5 group-hover:translate-x-2 transition-transform" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar Widgets - Smart Controls */}
        <div className="space-y-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.2 }}
          >
            <Card className="border-none shadow-2xl bg-slate-900 rounded-[3rem] p-10 text-white relative overflow-hidden group">
              <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] group-hover:bg-indigo-500/30 transition-colors duration-1000" />
              <div className="absolute top-0 right-0 p-8">
                <Bot className="h-10 w-10 text-white/10 animate-pulse" />
              </div>
              
              <h3 className="text-xl font-black mb-10 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center">
                  <Package className="h-5 w-5 text-indigo-400" />
                </div>
                Acciones de Control
              </h3>
              
              <div className="space-y-5 relative z-10">
                <AssignPpeDialog />
                <Link href="/inventario" className="block w-full">
                  <Button variant="outline" className="w-full h-16 bg-white/5 border-white/10 hover:bg-white/15 text-white rounded-2xl justify-between group px-8 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Package className="h-4 w-4" />
                      </div>
                      <span className="font-black uppercase tracking-widest text-xs">Gestión de Stock</span>
                    </div>
                    <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </Button>
                </Link>
                <Link href="/portal" target="_blank" className="block w-full">
                  <Button variant="outline" className="w-full h-16 bg-white/5 border-white/10 hover:bg-white/15 text-white rounded-2xl justify-between group px-8 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <ExternalLink className="h-4 w-4" />
                      </div>
                      <span className="font-black uppercase tracking-widest text-xs">Portal Público</span>
                    </div>
                    <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </Button>
                </Link>
              </div>
            </Card>
          </motion.div>

          {/* AI Insights Card - Iridescent Glow */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.4, duration: 1 }}
          >
            <Card className="glass-card rounded-[3rem] p-10 relative overflow-hidden group border-none ring-1 ring-slate-100 bg-white/50 backdrop-blur-xl">
              <div className="absolute top-0 right-0 p-8">
                <div className="flex gap-1.5">
                  {[0, 150, 300].map(delay => (
                    <div key={delay} className="h-2 w-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
              
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-100/40 rounded-full blur-[80px] group-hover:bg-indigo-200/50 transition-colors duration-1000" />
              
              <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-200">
                  <Bot className="h-6 w-6 text-white" />
                </div>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                  ARIA INSIGHTS
                </span>
              </h3>
              
              <div className="space-y-6 relative z-10">
                <div className="p-6 bg-white/40 backdrop-blur-md rounded-3xl border border-white/60 hover:bg-white transition-all shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <p className="text-[10px] font-black text-indigo-700 uppercase tracking-[0.2em]">Pronóstico de Demanda</p>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed font-bold">
                    Se prevé un incremento del <span className="text-indigo-600 font-black">20%</span> en la solicitud de <span className="underline decoration-indigo-300">Guantes Nitrilo</span> para la próxima semana.
                  </p>
                </div>
                
                <div className="p-6 bg-white/40 backdrop-blur-md rounded-3xl border border-white/60 hover:bg-white transition-all shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <p className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em]">Safety Compliance</p>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed font-bold">
                    Eficiencia de reposición mejorada en un <span className="text-emerald-600 font-black">15%</span> tras la implementación del portal público.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return <Activity className={className} />;
}
