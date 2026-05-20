"use client";

import { useEffect, useState, useRef } from 'react';
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
  TrendingUp, Clock, CheckCircle2, Activity, Bot, ExternalLink, ShieldCheck,
  Zap, BarChart3
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { format, isToday, isBefore, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { AssignPpeDialog } from '@/components/assign-ppe-dialog';
import { KioskRequestsPanel } from '@/components/kiosk-requests-panel';
import { useAuth } from '@/components/auth-provider';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';

// Animated counter hook
function useAnimatedCounter(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    const start = performance.now();
    const from = count;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return count;
}

interface InsightData {
  lowStockItem: { name: string; stock: number } | null;
  topArea: { area: string; count: number } | null;
  complianceRate: number;
}

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

const BRAND_RED = "#F40009";

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
  const [insights, setInsights] = useState<InsightData>({
    lowStockItem: null,
    topArea: null,
    complianceRate: 0,
  });

  // Animated KPI values
  const animatedToday = useAnimatedCounter(stats.todayAssignments);
  const animatedEmployees = useAnimatedCounter(stats.activeEmployees);
  const animatedAlerts = useAnimatedCounter(stats.alertsThisWeek);
  const animatedStock = useAnimatedCounter(stats.totalStock);

  useEffect(() => {
    // Real-time assignments feed
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

      // Upcoming alerts (next 7 days)
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
    // Fetch static stats + dynamic insights
    const fetchStats = async () => {
      try {
        const [empSnap, invSnap, allAssignSnap] = await Promise.all([
          getDocs(query(collection(db, 'employees'), where('active', '==', true))),
          getDocs(collection(db, 'ppe_catalog')),
          getDocs(query(collection(db, 'assignments'), orderBy('assignedAt', 'desc'), limit(200))),
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

        // --- Dynamic insights ---
        // 1. Find lowest stock item
        const sortedByStock = [...invData].sort((a, b) => (a.stock || 0) - (b.stock || 0));
        const lowestItem = sortedByStock.length > 0 ? { name: sortedByStock[0].name as string, stock: sortedByStock[0].stock as number } : null;

        // 2. Find top consuming area
        const empMap = new Map<string, string>();
        empSnap.docs.forEach(d => { empMap.set(d.id, d.data().area as string); });
        const areaCounts: Record<string, number> = {};
        allAssignSnap.docs.forEach(d => {
          const area = empMap.get(d.data().employeeId as string);
          if (area) areaCounts[area] = (areaCounts[area] || 0) + 1;
        });
        const topAreaEntry = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0];
        const topArea = topAreaEntry ? { area: topAreaEntry[0], count: topAreaEntry[1] } : null;

        // 3. Compliance rate: active assignments that haven't expired / total active
        const now = new Date();
        const activeAssigns = allAssignSnap.docs.filter(d => d.data().status === 'active');
        const compliant = activeAssigns.filter(d => {
          const next = d.data().nextReplacementAt;
          if (!next) return true;
          const nextDate = next instanceof Timestamp ? next.toDate() : new Date(next);
          return nextDate > now;
        });
        const complianceRate = activeAssigns.length > 0
          ? Math.round((compliant.length / activeAssigns.length) * 100)
          : 100;

        setInsights({
          lowStockItem: lowestItem,
          topArea,
          complianceRate,
        });
      } catch (err) {
        console.error('[Dashboard stats error]', err);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Entregas Hoy',
      value: loading ? '—' : animatedToday,
      icon: <HardHat className="h-5 w-5" />,
      color: 'border-l-slate-900',
      iconBg: 'bg-slate-50 text-slate-900',
      sub: 'En turno actual',
      subColor: 'text-slate-600',
    },
    {
      title: 'Plantilla Activa',
      value: animatedEmployees || '—',
      icon: <Users className="h-5 w-5" />,
      color: `border-l-[${BRAND_RED}]`,
      iconBg: 'bg-red-50 text-red-600',
      sub: 'Colaboradores en planta',
      subColor: 'text-red-600',
    },
    {
      title: 'Alertas Reposición',
      value: animatedAlerts,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: stats.alertsThisWeek > 0 ? 'border-l-orange-500' : 'border-l-emerald-500',
      iconBg: stats.alertsThisWeek > 0 ? 'bg-orange-50 text-orange-500' : 'bg-emerald-50 text-emerald-600',
      sub: stats.alertsThisWeek > 0 ? 'Cambios pendientes' : 'Seguridad al 100%',
      subColor: stats.alertsThisWeek > 0 ? 'text-orange-600' : 'text-emerald-600',
    },
    {
      title: 'Stock Global',
      value: animatedStock || '—',
      icon: <Package className="h-5 w-5" />,
      color: stats.lowStockItems > 0 ? `border-l-[${BRAND_RED}]` : 'border-l-slate-900',
      iconBg: stats.lowStockItems > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-900',
      sub: stats.lowStockItems > 0 ? `${stats.lowStockItems} SKUs críticos` : 'Inventario estable',
      subColor: stats.lowStockItems > 0 ? 'text-red-600' : 'text-slate-600',
    },
  ];

  return (
    <div className="space-y-12 pb-20">
      {/* Premium Hero Section - Coca-Cola FEMSA Style */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-red-600/5 to-slate-900/5 rounded-[3rem] blur-3xl opacity-50 transition-opacity duration-1000" />
        
        <div className="relative bg-white border border-slate-100 p-12 rounded-[3rem] shadow-2xl shadow-red-100/50 overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-10">
          {/* Brand Wave Pattern (Subtle) */}
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-[0.03] pointer-events-none">
             <svg viewBox="0 0 100 100" className="w-full h-full text-red-600 fill-current">
                <path d="M0,50 Q25,0 50,50 T100,50 V100 H0 Z" />
             </svg>
          </div>

          <div className="relative z-10 space-y-6 max-w-2xl">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Badge className="badge-femsa">
                Seguridad Industrial & Salud Ocupacional
              </Badge>
            </motion.div>
            
            <h1 className="text-6xl lg:text-8xl font-black tracking-tighter text-slate-950 leading-[0.9]">
              ¡Hola, <span className="text-[#F40009]">{authUser?.displayName?.split(' ')[0] || 'Admin'}</span>! 👋
            </h1>
            
            <div className="space-y-4">
              <p className="text-slate-500 text-xl font-bold leading-relaxed">
                Panel de Control de EPP <span className="text-slate-950 underline decoration-femsa-red decoration-4 underline-offset-8">Coca-Cola FEMSA</span>.
              </p>
              <p className="text-slate-400 font-medium">
                Monitoreo activo de <span className="text-slate-900 font-black">{stats.activeEmployees} colaboradores</span> con respaldo de <span className="text-red-600 font-black italic">ARIA IA</span>.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 pt-4">
              <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 rounded-2xl shadow-xl shadow-slate-200 group transition-all hover:scale-105">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Sistemas OK</span>
              </div>
              <div className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <Activity className="h-4 w-4 text-red-600" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}</span>
              </div>
            </div>
          </div>
          
          <div className="relative z-10 flex flex-col items-center lg:items-end justify-center">
             <div className="relative group">
                <div className="absolute inset-0 bg-red-600 rounded-[2.5rem] blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
                <Card className="relative bg-slate-950 border-none p-10 rounded-[2.5rem] w-full sm:w-80 overflow-hidden shadow-2xl">
                   <div className="absolute top-0 right-0 p-6 opacity-20">
                      <ShieldCheck className="h-20 w-20 text-white" />
                   </div>
                   <p className="text-[10px] font-black text-femsa-gold uppercase tracking-[0.3em] mb-4">Pulso Operativo</p>
                   <div className="space-y-2">
                      <p className="text-5xl font-black text-white tracking-tighter tabular-nums kpi-femsa-glow" style={{color: 'white'}}>
                        {insights.complianceRate}%
                      </p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Cumplimiento EPP</p>
                      {/* Mini bar chart visual */}
                      <div className="flex items-end gap-1 pt-3">
                        {[65,80,45,90,70,85,95].map((v,i) => (
                          <div key={i} className="flex-1 rounded-sm bg-femsa-gold/20 overflow-hidden" style={{height: `${v * 0.3}px`}}>
                            <div className="w-full bg-femsa-gold rounded-sm" style={{height: `${v}%`, transition: `height 1s ${i*0.1}s ease`}} />
                          </div>
                        ))}
                      </div>
                   </div>
                   <div className="mt-8 pt-8 border-t border-white/10 flex items-center justify-between">
                      <div className="flex gap-1.5">
                         {[1,2,3].map(i => <div key={i} className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: `${i*200}ms` }} />)}
                      </div>
                      <span className="text-[9px] font-black text-white uppercase tracking-widest">Estado Global: Activo</span>
                   </div>
                </Card>
             </div>
          </div>
        </div>
      </motion.div>

      {/* Corporate KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {statCards.map((card, idx) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + (idx * 0.1), duration: 0.8 }}
            whileHover={{ y: -10, transition: { duration: 0.3 } }}
          >
            <Card className="group relative h-full bg-white border-none shadow-xl rounded-[2.5rem] overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-red-100">
              <div className={`absolute top-0 left-0 w-2 h-full ${card.color.startsWith('border-l-[') ? 'bg-[#F40009]' : card.color.replace('border-l-', 'bg-')} opacity-10 group-hover:opacity-100 transition-opacity duration-500`} />
              
              <CardHeader className="flex flex-row items-center justify-between pb-4 pt-10 px-10">
                <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{card.title}</CardTitle>
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${card.iconBg} shadow-inner group-hover:rotate-12 transition-transform duration-500`}>
                  {card.icon}
                </div>
              </CardHeader>
              
              <CardContent className="px-10 pb-12">
                <div className="text-5xl font-black text-slate-950 tracking-tighter mb-4">
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

      <AnimatePresence>
        {upcomingAlerts.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-[3rem] border-4 border-red-50 bg-white p-12 shadow-2xl shadow-red-200/30 flex flex-col lg:flex-row items-center gap-10 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-3 h-full bg-[#F40009]" />
            <div className="h-24 w-24 rounded-[2rem] bg-[#F40009] flex items-center justify-center shrink-0 shadow-2xl shadow-red-300 group hover:rotate-12 transition-transform duration-500">
              <AlertTriangle className="h-12 w-12 text-white animate-bounce" />
            </div>
            
            <div className="flex-1 text-center lg:text-left space-y-3">
              <h2 className="text-3xl font-black text-slate-950 uppercase tracking-tighter">
                Alerta de Seguridad Corporativa
              </h2>
              <p className="text-slate-500 font-bold text-xl leading-tight">
                Se detectaron <span className="text-[#F40009] underline decoration-red-200 decoration-8 underline-offset-4">{upcomingAlerts.length} casos críticos</span> de EPP por vencer en planta.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex -space-x-5 overflow-hidden">
                {upcomingAlerts.slice(0, 5).map((a) => (
                  <div key={a.id} className="h-16 w-16 rounded-2xl border-4 border-white bg-slate-50 flex items-center justify-center shadow-lg transform hover:-translate-y-2 transition-transform cursor-help" title={a.sku}>
                    <HardHat className="h-8 w-8 text-slate-300" />
                  </div>
                ))}
              </div>
              <Link href="/empleados">
                <Button className="bg-slate-950 hover:bg-[#F40009] text-white rounded-[1.5rem] px-10 h-20 shadow-2xl transition-all font-black uppercase tracking-widest text-sm active:scale-95 group">
                   Intervenir Ahora
                   <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
        {/* Operations Board */}
        <Card className="xl:col-span-2 bg-white rounded-[3.5rem] border-none shadow-2xl overflow-hidden group">
          <CardHeader className="p-12 pb-6 border-b border-slate-50">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-3xl font-black text-slate-950 tracking-tighter flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 shadow-inner">
                    <Activity className="h-7 w-7" />
                  </div>
                  Bitácora de Seguridad
                </CardTitle>
                <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em] pl-1">Coca-Cola FEMSA Operaciones Industriales</p>
              </div>
              <Badge className="bg-[#F40009] text-white border-none px-5 py-2 font-black text-[10px] tracking-widest uppercase rounded-full">
                Datos en Tiempo Real
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-6 p-12">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 bg-slate-50 rounded-3xl animate-pulse" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left bg-slate-50/70">
                      <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Colaborador</th>
                      <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">EPP Asignado</th>
                      <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Fecha Entrega</th>
                      <th className="px-12 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Estatus</th>
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
                          className="group hover:bg-slate-50/80 transition-all cursor-default"
                        >
                          <td className="px-12 py-8">
                            <div className="flex items-center gap-5">
                              <div className="h-14 w-14 rounded-2xl bg-white shadow-md ring-1 ring-slate-100 flex items-center justify-center text-slate-900 font-black text-sm group-hover:bg-[#F40009] group-hover:text-white group-hover:scale-110 transition-all duration-300">
                                {a.employeeId.slice(-2)}
                              </div>
                              <span className="font-black text-slate-900 tracking-tight text-lg">#{a.employeeId}</span>
                            </div>
                          </td>
                          <td className="px-12 py-8">
                            <span className="text-xs font-black bg-slate-900 text-white px-5 py-2 rounded-xl group-hover:bg-[#F40009] transition-colors shadow-lg">
                              {a.sku}
                            </span>
                          </td>
                          <td className="px-12 py-8">
                            <p className="text-xs font-black text-slate-500 font-mono">
                              {format(a.assignedAt, 'dd MMM, HH:mm', { locale: es })}
                            </p>
                          </td>
                          <td className="px-12 py-8 text-right">
                            <Badge className={`font-black text-[10px] tracking-widest px-4 py-1.5 border-none shadow-lg ${
                              isOverdue 
                                ? 'bg-[#F40009] text-white shadow-red-200' 
                                : a.status === 'active' 
                                  ? 'bg-emerald-500 text-white shadow-emerald-200' 
                                  : 'bg-slate-300 text-white'
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
            <div className="p-12 border-t border-slate-50 bg-slate-50/30 text-center">
              <Link href="/empleados" className="inline-flex items-center gap-4 text-sm font-black text-[#F40009] hover:text-slate-900 transition-all group tracking-tighter">
                EXPLORAR DIRECTORIO COMPLETO
                <ArrowRight className="h-6 w-6 group-hover:translate-x-3 transition-transform" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar Widgets */}
        <div className="space-y-12">
          <KioskRequestsPanel />

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.2 }}
          >
            <Card className="border-none shadow-2xl bg-slate-950 rounded-[3.5rem] p-12 text-white relative overflow-hidden group">
              <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-red-600 via-transparent to-transparent" />
              <div className="absolute top-0 right-0 p-10 opacity-10">
                 <ShieldCheck className="h-24 w-24" />
              </div>
              
              <h3 className="text-2xl font-black mb-10 flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-red-600 flex items-center justify-center shadow-2xl shadow-red-500/20">
                  <Package className="h-6 w-6 text-white" />
                </div>
                Acciones Rápidas
              </h3>
              
              <div className="space-y-5 relative z-10">
                <AssignPpeDialog />
                <Link href="/inventario" className="block w-full">
                  <Button variant="outline" className="w-full h-20 bg-white/5 border-white/10 hover:bg-white/15 text-white rounded-[1.5rem] justify-between px-8 transition-all group">
                    <div className="flex items-center gap-5">
                      <Package className="h-6 w-6 text-red-500" />
                      <span className="font-black uppercase tracking-[0.2em] text-xs">Inventario de Planta</span>
                    </div>
                    <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all" />
                  </Button>
                </Link>
                <Link href="/portal" target="_blank" className="block w-full">
                  <Button variant="outline" className="w-full h-20 bg-white/5 border-white/10 hover:bg-white/15 text-white rounded-[1.5rem] justify-between px-8 transition-all group">
                    <div className="flex items-center gap-5">
                      <ExternalLink className="h-6 w-6 text-emerald-500" />
                      <span className="font-black uppercase tracking-[0.2em] text-xs">Portal del Colaborador</span>
                    </div>
                    <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all" />
                  </Button>
                </Link>
                <Link href="/kiosko" target="_blank" className="block w-full">
                  <Button variant="outline" className="w-full h-20 bg-white/5 border-white/10 hover:bg-white/15 text-white rounded-[1.5rem] justify-between px-8 transition-all group">
                    <div className="flex items-center gap-5">
                      <HardHat className="h-6 w-6 text-amber-400" />
                      <span className="font-black uppercase tracking-[0.2em] text-xs">Kiosko de EPP</span>
                    </div>
                    <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all" />
                  </Button>
                </Link>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.4 }}
          >
            <Card className="relative bg-white rounded-[3.5rem] p-12 border-none shadow-2xl overflow-hidden group">
              <div className="absolute top-0 right-0 p-10">
                <div className="flex gap-2">
                  {[1,2,3].map(i => <div key={i} className="h-2.5 w-2.5 rounded-full bg-red-600 animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}
                </div>
              </div>
               <h3 className="text-2xl font-black text-slate-950 mb-10 flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-red-600 flex items-center justify-center shadow-2xl shadow-red-200">
                  <Bot className="h-7 w-7 text-white" />
                </div>
                ARIA IA
              </h3>
               
              <div className="space-y-8 relative z-10">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 hover:bg-white transition-all shadow-sm group/item">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center text-[#F40009]">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Pronóstico de Stock</p>
                  </div>
                  <p className="text-base text-slate-900 leading-snug font-bold">
                    {insights.lowStockItem
                      ? <>Se recomienda reabastecer <span className="text-red-600 underline underline-offset-4 decoration-red-200">{insights.lowStockItem.name}</span> — solo quedan <span className="text-red-600 font-black">{insights.lowStockItem.stock}</span> unidades.</>
                      : <>Todos los artículos del catálogo tienen niveles de stock <span className="text-emerald-600 font-black">saludables</span>.</>
                    }
                  </p>
                </div>
                 
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 hover:bg-white transition-all shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Consumo por Área</p>
                  </div>
                  <p className="text-base text-slate-900 leading-snug font-bold">
                    {insights.topArea
                      ? <>El área de <span className="text-emerald-600 font-black">{insights.topArea.area}</span> lidera con <span className="font-black">{insights.topArea.count}</span> dotaciones registradas.</>
                      : <>Aún no hay datos suficientes para analizar patrones de consumo.</>
                    }
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
