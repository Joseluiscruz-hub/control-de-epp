"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
  TrendingUp, CheckCircle2, Activity, Bot, ExternalLink, ShieldCheck,
  Sparkles, ClipboardCheck, Gauge, Radar
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { format, isBefore, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { AssignPpeDialog } from '@/components/assign-ppe-dialog';
import { useAuth } from '@/components/auth-provider';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';

function useAnimatedCounter(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const currentCount = useRef(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    const start = performance.now();
    const from = currentCount.current;
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(from + (target - from) * eased);
      currentCount.current = nextValue;
      setCount(nextValue);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return count;
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
  activeAssignments: number;
}

interface StatCardConfig {
  title: string;
  value: number | string;
  suffix?: string;
  icon: ReactNode;
  color: string;
  iconBg: string;
  sub: string;
  subColor: string;
}

const LOW_STOCK_THRESHOLD = 20;

function toDate(value: unknown): Date | undefined {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function startAndEndOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function calculateComplianceScore(stats: DashboardStats) {
  const inventoryHealth = stats.totalInventoryItems === 0
    ? 0
    : Math.max(0, 100 - Math.round((stats.lowStockItems / stats.totalInventoryItems) * 35));
  const alertPressure = stats.activeAssignments === 0
    ? 100
    : Math.max(0, 100 - Math.round((stats.alertsThisWeek / Math.max(stats.activeAssignments, 1)) * 100));
  const employeeCoverage = stats.activeEmployees > 0 ? 100 : 0;

  return Math.round((inventoryHealth * 0.45) + (alertPressure * 0.35) + (employeeCoverage * 0.2));
}

function KpiCard({ card, index }: { card: StatCardConfig; index: number }) {
  const numericValue = typeof card.value === 'number' ? card.value : 0;
  const animatedValue = useAnimatedCounter(numericValue);
  const displayValue = typeof card.value === 'number'
    ? `${animatedValue.toLocaleString()}${card.suffix ?? ''}`
    : card.value;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + (index * 0.1), duration: 0.8 }}
      whileHover={{ y: -10, transition: { duration: 0.3 } }}
    >
      <Card className="group relative h-full bg-white border-none shadow-xl rounded-[2.5rem] overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-red-100">
        <div className={`absolute top-0 left-0 w-2 h-full ${card.color} opacity-20 group-hover:opacity-100 transition-opacity duration-500`} />
        <CardHeader className="flex flex-row items-center justify-between pb-4 pt-10 px-10">
          <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{card.title}</CardTitle>
          <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${card.iconBg} shadow-inner group-hover:rotate-12 transition-transform duration-500`}>
            {card.icon}
          </div>
        </CardHeader>
        <CardContent className="px-10 pb-12">
          <div className="text-5xl font-black text-slate-950 tracking-tighter mb-4 tabular-nums">
            {displayValue}
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${card.subColor.replace('text-', 'bg-')} animate-pulse`} />
            <p className={`text-[10px] font-black uppercase tracking-widest ${card.subColor}`}>{card.sub}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const [recentAssignments, setRecentAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    todayAssignments: 0,
    activeEmployees: 0,
    alertsThisWeek: 0,
    totalInventoryItems: 0,
    lowStockItems: 0,
    totalStock: 0,
    activeAssignments: 0,
  });
  const [upcomingAlerts, setUpcomingAlerts] = useState<Assignment[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'assignments'), orderBy('assignedAt', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const assignments = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          employeeId: String(data.employeeId ?? 'SIN-ID'),
          sku: String(data.sku ?? 'SIN-SKU'),
          assignedAt: toDate(data.assignedAt) ?? new Date(),
          nextReplacementAt: toDate(data.nextReplacementAt),
          status: String(data.status ?? 'active'),
        };
      });
      setRecentAssignments(assignments);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'assignments');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const { start, end } = startAndEndOfToday();
        const nextWeek = addDays(new Date(), 7);

        const [empSnap, invSnap, todayAssignmentsSnap, activeAssignmentsSnap] = await Promise.all([
          getDocs(query(collection(db, 'employees'), where('active', '==', true))),
          getDocs(collection(db, 'ppe_catalog')),
          getDocs(query(
            collection(db, 'assignments'),
            where('assignedAt', '>=', Timestamp.fromDate(start)),
            where('assignedAt', '<', Timestamp.fromDate(end))
          )),
          getDocs(query(collection(db, 'assignments'), where('status', '==', 'active'))),
        ]);

        const invData = invSnap.docs.map(d => d.data());
        const totalStockValue = invData.reduce((sum, d) => sum + toNumber(d.stock), 0);
        const lowStock = invData.filter(d => toNumber(d.stock) <= toNumber(d.minStock) || toNumber(d.stock) <= LOW_STOCK_THRESHOLD).length;

        const activeAssignments = activeAssignmentsSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            employeeId: String(data.employeeId ?? 'SIN-ID'),
            sku: String(data.sku ?? 'SIN-SKU'),
            assignedAt: toDate(data.assignedAt) ?? new Date(),
            nextReplacementAt: toDate(data.nextReplacementAt),
            status: String(data.status ?? 'active'),
          };
        });

        const alerts = activeAssignments
          .filter(a => a.nextReplacementAt && isBefore(a.nextReplacementAt, nextWeek))
          .sort((a, b) => (a.nextReplacementAt?.getTime() ?? 0) - (b.nextReplacementAt?.getTime() ?? 0));

        setUpcomingAlerts(alerts.slice(0, 8));
        setStats({
          todayAssignments: todayAssignmentsSnap.size,
          activeEmployees: empSnap.size,
          alertsThisWeek: alerts.length,
          totalInventoryItems: invSnap.size,
          lowStockItems: lowStock,
          totalStock: totalStockValue,
          activeAssignments: activeAssignments.length,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'dashboard');
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const complianceScore = calculateComplianceScore(stats);
  const firstName = authUser?.displayName?.split(' ')[0] || 'Admin';
  const criticalSkuLabel = stats.lowStockItems > 0 ? `${stats.lowStockItems} SKUs críticos` : 'Inventario saludable';
  const operationalStatus = stats.alertsThisWeek > 0 ? 'Atención requerida' : 'Operación estable';

  const statCards: StatCardConfig[] = [
    {
      title: 'Entregas Hoy',
      value: statsLoading ? '—' : stats.todayAssignments,
      icon: <HardHat className="h-5 w-5" />,
      color: 'bg-slate-900',
      iconBg: 'bg-slate-50 text-slate-900',
      sub: stats.todayAssignments > 0 ? 'Movimiento activo' : 'Sin entregas registradas',
      subColor: 'text-slate-600',
    },
    {
      title: 'Plantilla Activa',
      value: statsLoading ? '—' : stats.activeEmployees,
      icon: <Users className="h-5 w-5" />,
      color: 'bg-[#F40009]',
      iconBg: 'bg-red-50 text-red-600',
      sub: 'Colaboradores cubiertos',
      subColor: 'text-red-600',
    },
    {
      title: 'Alertas Reposición',
      value: statsLoading ? '—' : stats.alertsThisWeek,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: stats.alertsThisWeek > 0 ? 'bg-orange-500' : 'bg-emerald-500',
      iconBg: stats.alertsThisWeek > 0 ? 'bg-orange-50 text-orange-500' : 'bg-emerald-50 text-emerald-600',
      sub: stats.alertsThisWeek > 0 ? 'Cambios pendientes' : 'Seguridad al 100%',
      subColor: stats.alertsThisWeek > 0 ? 'text-orange-600' : 'text-emerald-600',
    },
    {
      title: 'Stock Global',
      value: statsLoading ? '—' : stats.totalStock,
      icon: <Package className="h-5 w-5" />,
      color: stats.lowStockItems > 0 ? 'bg-[#F40009]' : 'bg-slate-900',
      iconBg: stats.lowStockItems > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-900',
      sub: criticalSkuLabel,
      subColor: stats.lowStockItems > 0 ? 'text-red-600' : 'text-slate-600',
    },
  ];

  const ariaInsights = useMemo(() => ([
    {
      title: 'Smart Stock Forecast',
      body: stats.lowStockItems > 0
        ? `Prioriza ${stats.lowStockItems} SKU con stock bajo antes del siguiente turno.`
        : 'El inventario está balanceado para la operación actual.',
      icon: <TrendingUp className="h-5 w-5" />,
      accent: 'text-[#F40009] bg-red-50',
    },
    {
      title: 'Team Compliance',
      body: stats.alertsThisWeek > 0
        ? `${stats.alertsThisWeek} asignaciones activas requieren reposición o revisión preventiva.`
        : 'Sin reposiciones críticas en los próximos 7 días.',
      icon: <CheckCircle2 className="h-5 w-5" />,
      accent: stats.alertsThisWeek > 0 ? 'text-orange-600 bg-orange-50' : 'text-emerald-600 bg-emerald-50',
    },
  ]), [stats.alertsThisWeek, stats.lowStockItems]);

  return (
    <div className="space-y-12 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-red-600/5 to-slate-900/5 rounded-[3rem] blur-3xl opacity-50 transition-opacity duration-1000" />
        <div className="relative bg-white border border-slate-100 p-8 sm:p-12 rounded-[3rem] shadow-2xl shadow-red-100/50 overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-10">
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-[0.03] pointer-events-none">
             <svg viewBox="0 0 100 100" className="w-full h-full text-red-600 fill-current" aria-hidden="true">
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

            <h1 className="text-5xl sm:text-6xl lg:text-8xl font-black tracking-tighter text-slate-950 leading-[0.9]">
              ¡Hola, <span className="text-[#F40009]">{firstName}</span>! 👋
            </h1>

            <div className="space-y-4">
              <p className="text-slate-500 text-xl font-bold leading-relaxed">
                Centro de Control EPP <span className="text-slate-950 underline decoration-femsa-red decoration-4 underline-offset-8">Coca-Cola FEMSA</span>.
              </p>
              <p className="text-slate-400 font-medium">
                Visión ejecutiva de <span className="text-slate-900 font-black">{stats.activeEmployees} colaboradores</span>, <span className="text-slate-900 font-black">{stats.activeAssignments} asignaciones activas</span> y alertas preventivas con <span className="text-red-600 font-black italic">ARIA AI</span>.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 pt-4">
              <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 rounded-2xl shadow-xl shadow-slate-200 group transition-all hover:scale-105">
                <div className={`h-2 w-2 rounded-full ${stats.alertsThisWeek > 0 ? 'bg-orange-500' : 'bg-emerald-500'} animate-pulse`} />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">{operationalStatus}</span>
              </div>
              <div className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <Activity className="h-4 w-4 text-red-600" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}</span>
              </div>
              <div className="flex items-center gap-2 px-5 py-2.5 bg-red-50 border border-red-100 rounded-2xl shadow-sm">
                <Radar className="h-4 w-4 text-red-600" />
                <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">IA predictiva activa</span>
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
                   <p className="text-[10px] font-black text-femsa-gold uppercase tracking-[0.3em] mb-4">Operational Pulse</p>
                   <div className="space-y-2">
                      <p className="text-5xl font-black text-white tracking-tighter tabular-nums kpi-femsa-glow" style={{color: 'white'}}>
                        {complianceScore}%
                      </p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Compliance Score</p>
                      <div className="h-3 w-full rounded-full bg-white/10 overflow-hidden mt-5">
                        <div className="h-full rounded-full bg-gradient-to-r from-red-600 via-orange-400 to-emerald-400 transition-all duration-1000" style={{ width: `${complianceScore}%` }} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-5 text-center">
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-lg font-black text-white">{stats.lowStockItems}</p>
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Críticos</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-lg font-black text-white">{stats.alertsThisWeek}</p>
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Alertas</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-lg font-black text-white">{stats.todayAssignments}</p>
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Hoy</p>
                        </div>
                      </div>
                   </div>
                   <div className="mt-8 pt-8 border-t border-white/10 flex items-center justify-between">
                      <div className="flex gap-1.5">
                         {[1,2,3].map(i => <div key={i} className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: `${i*200}ms` }} />)}
                      </div>
                      <span className="text-[9px] font-black text-white uppercase tracking-widest">Global Status: Active</span>
                   </div>
                </Card>
             </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {statCards.map((card, idx) => <KpiCard key={card.title} card={card} index={idx} />)}
      </div>

      <AnimatePresence>
        {upcomingAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-[3rem] border-4 border-red-50 bg-white p-8 sm:p-12 shadow-2xl shadow-red-200/30 flex flex-col lg:flex-row items-center gap-10 relative overflow-hidden"
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
                Se detectaron <span className="text-[#F40009] underline decoration-red-200 decoration-8 underline-offset-4">{stats.alertsThisWeek} casos críticos</span> de EPP por vencer o vencidos en planta.
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
        <Card className="xl:col-span-2 bg-white rounded-[3.5rem] border-none shadow-2xl overflow-hidden group">
          <CardHeader className="p-8 sm:p-12 pb-6 border-b border-slate-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="space-y-1">
                <CardTitle className="text-3xl font-black text-slate-950 tracking-tighter flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 shadow-inner">
                    <Activity className="h-7 w-7" />
                  </div>
                  Bitácora de Seguridad
                </CardTitle>
                <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em] pl-1">Coca-Cola FEMSA Industrial Ops</p>
              </div>
              <Badge className="bg-[#F40009] text-white border-none px-5 py-2 font-black text-[10px] tracking-widest uppercase rounded-full">
                Real-Time Data
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-6 p-12">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 bg-slate-50 rounded-3xl animate-pulse" />)}
              </div>
            ) : recentAssignments.length === 0 ? (
              <div className="p-12 text-center space-y-5">
                <div className="mx-auto h-20 w-20 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-300">
                  <ClipboardCheck className="h-10 w-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Aún no hay entregas registradas</h3>
                  <p className="text-slate-400 font-bold mt-2">Registra la primera asignación para activar la bitácora en tiempo real.</p>
                </div>
                <AssignPpeDialog />
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
                EXPLORAR DIRECTORIO COMPLETO FEMSA
                <ArrowRight className="h-6 w-6 group-hover:translate-x-3 transition-transform" />
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-12">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.2 }}
          >
            <Card className="border-none shadow-2xl bg-slate-950 rounded-[3.5rem] p-10 sm:p-12 text-white relative overflow-hidden group">
              <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-red-600 via-transparent to-transparent" />
              <div className="absolute top-0 right-0 p-10 opacity-10">
                 <ShieldCheck className="h-24 w-24" />
              </div>

              <h3 className="text-2xl font-black mb-10 flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-red-600 flex items-center justify-center shadow-2xl shadow-red-500/20">
                  <Package className="h-6 w-6 text-white" />
                </div>
                Quick Actions
              </h3>

              <div className="space-y-5 relative z-10">
                <AssignPpeDialog />
                <Link href="/inventario" className="block w-full">
                  <Button variant="outline" className="w-full h-20 bg-white/5 border-white/10 hover:bg-white/15 text-white rounded-[1.5rem] justify-between px-8 transition-all group">
                    <div className="flex items-center gap-5">
                      <Package className="h-6 w-6 text-red-500" />
                      <span className="font-black uppercase tracking-[0.2em] text-xs">Inventario Central</span>
                    </div>
                    <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all" />
                  </Button>
                </Link>
                <Link href="/portal" target="_blank" className="block w-full">
                  <Button variant="outline" className="w-full h-20 bg-white/5 border-white/10 hover:bg-white/15 text-white rounded-[1.5rem] justify-between px-8 transition-all group">
                    <div className="flex items-center gap-5">
                      <ExternalLink className="h-6 w-6 text-emerald-500" />
                      <span className="font-black uppercase tracking-[0.2em] text-xs">Public Portal</span>
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
            <Card className="relative bg-white rounded-[3.5rem] p-10 sm:p-12 border-none shadow-2xl overflow-hidden group">
              <div className="absolute top-0 right-0 p-10">
                <div className="flex gap-2">
                  {[1,2,3].map(i => <div key={i} className="h-2.5 w-2.5 rounded-full bg-red-600 animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}
                </div>
              </div>

              <h3 className="text-2xl font-black text-slate-950 mb-10 flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-red-600 flex items-center justify-center shadow-2xl shadow-red-200">
                  <Bot className="h-7 w-7 text-white" />
                </div>
                ARIA AI
              </h3>

              <div className="space-y-8 relative z-10">
                {ariaInsights.map((insight) => (
                  <div key={insight.title} className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 hover:bg-white transition-all shadow-sm group/item">
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${insight.accent}`}>
                        {insight.icon}
                      </div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{insight.title}</p>
                    </div>
                    <p className="text-base text-slate-900 leading-snug font-bold">
                      {insight.body}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
          >
            <Card className="rounded-[3rem] border-none bg-gradient-to-br from-red-600 to-slate-950 p-10 text-white shadow-2xl shadow-red-200/40 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-20">
                <Sparkles className="h-20 w-20" />
              </div>
              <div className="relative space-y-6">
                <div className="flex items-center gap-3">
                  <Gauge className="h-6 w-6 text-femsa-gold" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Executive Brief</p>
                </div>
                <h3 className="text-3xl font-black tracking-tighter">{operationalStatus}</h3>
                <p className="text-white/70 font-bold leading-relaxed">
                  Score actual {complianceScore}%. Mantén reposiciones, stock mínimo y entregas al día para sostener cumplimiento operativo.
                </p>
                <Link href="/inventario" className="inline-flex items-center gap-3 text-sm font-black uppercase tracking-widest text-white hover:text-femsa-gold transition-colors">
                  Revisar inventario <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
