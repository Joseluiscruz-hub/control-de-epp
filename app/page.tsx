"use client";

import { useEffect, useState, useRef } from 'react';
import {
  collection, onSnapshot, query, orderBy, limit,
  where, Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HardHat, Users, AlertTriangle, ArrowRight, Package,
  TrendingUp, Clock, CheckCircle2, Activity, Bot, ExternalLink, ShieldCheck,
  BarChart3, Zap, ArrowUpRight, Flame, Star
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
function useAnimatedCounter(target: number, duration = 1400) {
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
      const eased = 1 - Math.pow(1 - progress, 4);
      setCount(Math.round(from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return count;
}

// Circular gauge SVG
function GaugeCircle({ value, size = 120 }: { value: number; size?: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  const color = value >= 90 ? '#10B981' : value >= 70 ? '#D4A017' : '#F40009';

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="rotate-[-90deg]">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
      <circle
        cx="50" cy="50" r={radius} fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.22,1,0.36,1)', filter: `drop-shadow(0 0 6px ${color}80)` }}
      />
    </svg>
  );
}

// Mini sparkline bars
function SparkBars({ data, color = '#F40009' }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div
            className="w-full rounded-sm"
            style={{
              height: `${(v / max) * 100}%`,
              background: color,
              opacity: i === data.length - 1 ? 1 : 0.3 + (i / data.length) * 0.5,
              transition: `height 1s ${i * 0.08}s cubic-bezier(0.22,1,0.36,1)`,
            }}
          />
        </div>
      ))}
    </div>
  );
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

  const animatedToday = useAnimatedCounter(stats.todayAssignments);
  const animatedEmployees = useAnimatedCounter(stats.activeEmployees);
  const animatedAlerts = useAnimatedCounter(stats.alertsThisWeek);
  const animatedStock = useAnimatedCounter(stats.totalStock);

  useEffect(() => {
    const q = query(collection(db, 'assignments'), orderBy('assignedAt', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const assignments = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          employeeId: data.employeeId,
          sku: data.sku,
          assignedAt: data.assignedAt instanceof Timestamp ? data.assignedAt.toDate() : new Date(),
          nextReplacementAt: data.nextReplacementAt instanceof Timestamp ? data.nextReplacementAt.toDate() : undefined,
          status: data.status,
        };
      });
      setRecentAssignments(assignments);
      const todayCount = assignments.filter(a => isToday(a.assignedAt)).length;
      setStats(prev => ({ ...prev, todayAssignments: todayCount }));
      const now = new Date();
      const nextWeek = addDays(now, 7);
      const alerts = assignments.filter(a =>
        a.nextReplacementAt && a.status === 'active' &&
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
    let activeEmployees: Array<{ id: string; area: string }> = [];
    let inventoryItems: Array<Record<string, unknown>> = [];
    let assignmentItems: Array<Record<string, unknown>> = [];
    let employeesReady = false;
    let inventoryReady = false;
    let assignmentsReady = false;

    const recomputeStats = () => {
      if (!employeesReady || !inventoryReady || !assignmentsReady) return;

      const totalStockValue = inventoryItems.reduce((sum, item) => sum + Number(item.stock ?? 0), 0);
      const lowStock = inventoryItems.filter((item) => Number(item.stock ?? 0) <= 20).length;
      const sortedByStock = [...inventoryItems].sort((a, b) => Number(a.stock ?? 0) - Number(b.stock ?? 0));
      const lowestItem = sortedByStock.length > 0
        ? { name: String(sortedByStock[0].name ?? "EPP sin nombre"), stock: Number(sortedByStock[0].stock ?? 0) }
        : null;

      setStats(prev => ({
        ...prev,
        activeEmployees: activeEmployees.length,
        totalInventoryItems: inventoryItems.length,
        totalStock: totalStockValue,
        lowStockItems: lowStock,
      }));

      const empMap = new Map(activeEmployees.map((employee) => [employee.id, employee.area]));
      const areaCounts: Record<string, number> = {};
      assignmentItems.forEach((assignment) => {
        const area = empMap.get(String(assignment.employeeId ?? ""));
        if (area) areaCounts[area] = (areaCounts[area] || 0) + 1;
      });

      const topAreaEntry = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0];
      const topArea = topAreaEntry ? { area: topAreaEntry[0], count: topAreaEntry[1] } : null;
      const now = new Date();
      const activeAssigns = assignmentItems.filter((assignment) => assignment.status === 'active');
      const compliant = activeAssigns.filter((assignment) => {
        const next = assignment.nextReplacementAt;
        if (!next) return true;
        const nextDate = next instanceof Timestamp ? next.toDate() : new Date(String(next));
        return nextDate > now;
      });
      const complianceRate = activeAssigns.length > 0
        ? Math.round((compliant.length / activeAssigns.length) * 100)
        : 100;

      setInsights({ lowStockItem: lowestItem, topArea, complianceRate });
    };

    const unsubscribeEmployees = onSnapshot(
      query(collection(db, 'employees'), where('active', '==', true)),
      (snapshot) => {
        activeEmployees = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          area: String(docSnap.data().area ?? ''),
        }));
        employeesReady = true;
        recomputeStats();
      },
      (error) => {
        console.error('[Dashboard employees stats error]', error);
      }
    );

    const unsubscribeInventory = onSnapshot(
      collection(db, 'ppe_catalog'),
      (snapshot) => {
        inventoryItems = snapshot.docs.map((docSnap) => docSnap.data());
        inventoryReady = true;
        recomputeStats();
      },
      (error) => {
        console.error('[Dashboard inventory stats error]', error);
      }
    );

    const unsubscribeAssignments = onSnapshot(
      query(collection(db, 'assignments'), orderBy('assignedAt', 'desc'), limit(200)),
      (snapshot) => {
        assignmentItems = snapshot.docs.map((docSnap) => docSnap.data());
        assignmentsReady = true;
        recomputeStats();
      },
      (error) => {
        console.error('[Dashboard assignment stats error]', error);
      }
    );

    return () => {
      unsubscribeEmployees();
      unsubscribeInventory();
      unsubscribeAssignments();
    };
  }, []);

  const kpiCards = [
    {
      title: 'Entregas Hoy',
      value: loading ? '—' : animatedToday,
      icon: <HardHat className="h-5 w-5" />,
      iconColor: 'text-white',
      iconBg: 'rgba(244,0,9,0.15)',
      iconBorder: 'rgba(244,0,9,0.2)',
      accentColor: '#F40009',
      sub: 'En turno actual',
      trend: [2, 5, 3, 8, 4, 7, animatedToday || 1],
      positive: true,
    },
    {
      title: 'Plantilla Activa',
      value: animatedEmployees || '—',
      icon: <Users className="h-5 w-5" />,
      iconColor: 'text-white',
      iconBg: 'rgba(59,130,246,0.15)',
      iconBorder: 'rgba(59,130,246,0.2)',
      accentColor: '#3B82F6',
      sub: 'Colaboradores en planta',
      trend: [12, 18, 15, 22, 19, 24, animatedEmployees || 1],
      positive: true,
    },
    {
      title: 'Alertas Reposición',
      value: animatedAlerts,
      icon: <AlertTriangle className="h-5 w-5" />,
      iconColor: 'text-white',
      iconBg: stats.alertsThisWeek > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
      iconBorder: stats.alertsThisWeek > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)',
      accentColor: stats.alertsThisWeek > 0 ? '#F59E0B' : '#10B981',
      sub: stats.alertsThisWeek > 0 ? 'Requieren atención' : 'Todo en orden',
      trend: [1, 3, 2, 5, 3, 2, animatedAlerts || 0],
      positive: stats.alertsThisWeek === 0,
    },
    {
      title: 'Stock Global',
      value: animatedStock || '—',
      icon: <Package className="h-5 w-5" />,
      iconColor: 'text-white',
      iconBg: stats.lowStockItems > 0 ? 'rgba(244,0,9,0.15)' : 'rgba(212,160,23,0.15)',
      iconBorder: stats.lowStockItems > 0 ? 'rgba(244,0,9,0.2)' : 'rgba(212,160,23,0.2)',
      accentColor: stats.lowStockItems > 0 ? '#F40009' : '#D4A017',
      sub: stats.lowStockItems > 0 ? `${stats.lowStockItems} SKUs críticos` : 'Inventario estable',
      trend: [200, 320, 280, 400, 350, 420, animatedStock || 1],
      positive: stats.lowStockItems === 0,
    },
  ];

  return (
    <div className="space-y-6 pb-20">

      {/* ── Hero Section ──────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="executive-hero"
      >
        <div className="relative z-10 p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          {/* Left: Welcome text */}
          <div className="space-y-5 max-w-3xl">
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <span className="badge-femsa">Centro de mando EPP</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="text-4xl lg:text-6xl font-black tracking-tight text-white leading-[0.95]">
                Operación segura,{' '}
                <span className="text-gradient-red">
                  visible y bajo control
                </span>
              </h1>
              <p className="text-white/55 text-base font-medium mt-4 leading-relaxed max-w-2xl">
                Hola {authUser?.displayName?.split(' ')[0] || 'Admin'}. Monitoreo activo de{' '}
                <span className="text-white/70 font-semibold">{stats.activeEmployees} colaboradores</span>
                {' '}con inventario, solicitudes de kiosko y análisis ARIA en una sola consola ejecutiva.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-wrap gap-3"
            >
              <div className="command-strip flex items-center gap-2 px-4 py-2 text-xs font-semibold" style={{color:'rgba(16,185,129,0.9)'}}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Sistemas Operativos
              </div>
              <div className="command-strip flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white/50">
                <Activity className="h-3.5 w-3.5" style={{color:'rgba(244,0,9,0.7)'}} />
                {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
              </div>
              <Link href="/kiosko" target="_blank" className="command-strip flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-300 hover:text-amber-200 transition-colors">
                <HardHat className="h-3.5 w-3.5" />
                Kiosko activo
              </Link>
            </motion.div>
          </div>

          {/* Right: Compliance gauge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 150, damping: 20 }}
            className="relative flex-shrink-0"
          >
            <div className="relative w-56 p-5 command-strip">
              <p className="section-eyebrow mb-4" style={{color:'rgba(212,160,23,0.8)'}}>Pulso Operativo</p>

              <div className="relative flex items-center justify-center mb-4">
                <GaugeCircle value={insights.complianceRate} size={110} />
                <div className="absolute text-center">
                  <span className="text-3xl font-black text-white" style={{textShadow:'0 0 20px rgba(16,185,129,0.4)'}}>
                    {insights.complianceRate}%
                  </span>
                </div>
              </div>

              <p className="text-center text-[11px] font-semibold text-white/45 uppercase tracking-widest">Cumplimiento EPP</p>

              <div className="mt-4 pt-4 flex items-center justify-between" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                <div className="flex gap-1.5">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: `${i*200}ms` }} />
                  ))}
                </div>
                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">En vivo</span>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* ── KPI Grid ──────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + idx * 0.08, duration: 0.7 }}
            className="kpi-card p-6"
          >
            {/* Top row */}
            <div className="flex items-start justify-between mb-4">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ background: card.iconBg, border: `1px solid ${card.iconBorder}` }}
              >
                <span style={{ color: card.accentColor }}>{card.icon}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg" style={{
                color: card.positive ? 'rgba(16,185,129,0.8)' : 'rgba(245,158,11,0.8)',
                background: card.positive ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
              }}>
                {card.positive ? <ArrowUpRight className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              </div>
            </div>

            {/* Value */}
            <div className="mb-3">
              <div className="text-4xl font-black text-white tracking-tighter kpi-white-glow tabular-nums">
                {card.value}
              </div>
              <div className="text-[11px] font-semibold text-white/35 uppercase tracking-widest mt-1">
                {card.title}
              </div>
            </div>

            {/* Sparkline */}
            <SparkBars data={card.trend} color={card.accentColor} />

            {/* Sub */}
            <div className="flex items-center gap-2 mt-3">
              <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: card.accentColor }} />
              <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">{card.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Alert Banner ──────────────────────── */}
      <AnimatePresence>
        {upcomingAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="enterprise-panel relative p-5 flex flex-col sm:flex-row items-center gap-5"
            style={{
              background: 'rgba(244,0,9,0.06)',
              border: '1px solid rgba(244,0,9,0.2)',
            }}
          >
            <div className="h-12 w-12 rounded-lg flex items-center justify-center shrink-0 shadow-lg relative z-10" style={{background:'rgba(244,0,9,0.15)', border:'1px solid rgba(244,0,9,0.25)'}}>
              <AlertTriangle className="h-7 w-7 animate-pulse" style={{color:'#F40009'}} />
            </div>
            <div className="flex-1 text-center sm:text-left relative z-10">
              <h2 className="text-lg font-black text-white mb-1">Alerta de Seguridad Corporativa</h2>
              <p className="text-white/50 text-sm font-medium">
                Se detectaron{' '}
                <span className="font-black" style={{color:'#F40009'}}>{upcomingAlerts.length} casos críticos</span>
                {' '}de EPP por vencer en planta.
              </p>
            </div>
            <Link href="/empleados" className="relative z-10 shrink-0">
              <Button className="rounded-lg px-5 h-10 font-bold text-sm text-white transition-all group" style={{background:'rgba(244,0,9,0.9)'}}>
                Intervenir
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Grid ─────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="xl:col-span-2 enterprise-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5" style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{background:'rgba(244,0,9,0.12)', border:'1px solid rgba(244,0,9,0.2)'}}>
                <Activity className="h-4.5 w-4.5" style={{color:'#F40009'}} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Bitácora de Seguridad</h2>
                <p className="section-eyebrow">Coca-Cola FEMSA · Tiempo Real</p>
              </div>
            </div>
            <div className="command-strip flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold" style={{color:'rgba(244,0,9,0.9)'}}>
              <span className="h-1.5 w-1.5 rounded-full bg-[#F40009] animate-pulse inline-block" />
              En Vivo
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-3 p-6">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-14 rounded-xl skeleton-pulse" />
              ))}
            </div>
          ) : recentAssignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/20">
              <Package className="h-10 w-10 mb-3" />
              <p className="text-sm font-semibold">Sin asignaciones registradas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full premium-table">
                <thead>
                  <tr style={{background:'rgba(255,255,255,0.02)'}}>
                    {['Colaborador','EPP Asignado','Fecha Entrega','Estatus'].map((h, i) => (
                      <th key={h} className={`px-6 py-4 text-[10px] font-black text-white/25 uppercase tracking-widest ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentAssignments.map((a, idx) => {
                    const isOverdue = a.nextReplacementAt && isBefore(a.nextReplacementAt, new Date());
                    return (
                      <motion.tr
                        key={a.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.8 + idx * 0.04 }}
                        className="group transition-all cursor-default"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                            className="h-9 w-9 rounded-lg flex items-center justify-center text-xs font-black transition-all duration-300 group-hover:scale-105"
                              style={{ background: 'rgba(244,0,9,0.1)', border: '1px solid rgba(244,0,9,0.15)', color: '#F40009' }}
                            >
                              {a.employeeId.slice(-2).toUpperCase()}
                            </div>
                            <span className="text-sm font-semibold text-white/70">#{a.employeeId.slice(-6)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold px-3 py-1.5 rounded-md text-white/60" style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)'}}>
                            {a.sku}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono text-white/35">
                            {format(a.assignedAt, 'dd MMM · HH:mm', { locale: es })}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider ${
                            isOverdue
                              ? 'text-red-400'
                              : a.status === 'active'
                                ? 'text-emerald-400'
                                : 'text-white/30'
                          }`} style={{
                            background: isOverdue ? 'rgba(244,0,9,0.1)' : a.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isOverdue ? 'rgba(244,0,9,0.2)' : a.status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
                          }}>
                            {isOverdue ? 'Vencido' : a.status === 'active' ? 'Activo' : 'Cerrado'}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-6 py-4 flex justify-center" style={{borderTop:'1px solid rgba(255,255,255,0.04)'}}>
            <Link href="/empleados" className="flex items-center gap-2 text-xs font-semibold text-white/30 hover:text-white/60 transition-all group uppercase tracking-widest">
              Ver directorio completo
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </motion.div>

        {/* Sidebar Widgets */}
        <div className="space-y-4">

          {/* Kiosk Requests */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.75 }}
          >
            <KioskRequestsPanel />
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.85 }}
            className="enterprise-panel p-5"
          >
            <h3 className="text-sm font-bold text-white/70 mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4" style={{color:'#F40009'}} />
              Acciones Rápidas
            </h3>
            <div className="space-y-2">
              <AssignPpeDialog />
              <Link href="/inventario" className="block w-full">
                <button className="surface-action w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white/55 hover:text-white/85 group">
                  <div className="flex items-center gap-3">
                    <Package className="h-4 w-4" style={{color:'rgba(212,160,23,0.7)'}} />
                    Inventario de Planta
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </button>
              </Link>
              <Link href="/portal" target="_blank" className="block w-full">
                <button className="surface-action w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white/55 hover:text-white/85 group">
                  <div className="flex items-center gap-3">
                    <ExternalLink className="h-4 w-4" style={{color:'rgba(59,130,246,0.7)'}} />
                    Portal del Colaborador
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </button>
              </Link>
              <Link href="/kiosko" target="_blank" className="block w-full">
                <button className="surface-action w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white/55 hover:text-amber-400 group">
                  <div className="flex items-center gap-3">
                    <HardHat className="h-4 w-4 text-amber-500/60 group-hover:text-amber-400 transition-colors" />
                    Kiosko de EPP
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </button>
              </Link>
            </div>
          </motion.div>

          {/* ARIA Insights */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.95 }}
            className="enterprise-panel p-5"
            style={{ background: 'rgba(212,160,23,0.04)', border: '1px solid rgba(212,160,23,0.12)' }}
          >
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{color:'rgba(212,160,23,0.9)'}}>
              <Bot className="h-4 w-4" />
              ARIA · Análisis IA
            </h3>

            <div className="space-y-3">
              <div className="p-4 rounded-lg" style={{background:'rgba(255,255,255,0.045)', border:'1px solid rgba(255,255,255,0.07)'}}>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Pronóstico de Stock</span>
                </div>
                <p className="text-sm text-white/60 leading-snug">
                  {insights.lowStockItem
                    ? <><span className="text-red-400 font-semibold">{insights.lowStockItem.name}</span> — solo quedan <span className="font-bold text-white/80">{insights.lowStockItem.stock}</span> unidades. Reabastece pronto.</>
                    : <><span className="text-emerald-400 font-semibold">Todos los artículos</span> tienen stock saludable.</>
                  }
                </p>
              </div>

              <div className="p-4 rounded-lg" style={{background:'rgba(255,255,255,0.045)', border:'1px solid rgba(255,255,255,0.07)'}}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Área Top</span>
                </div>
                <p className="text-sm text-white/60 leading-snug">
                  {insights.topArea
                    ? <>Área <span className="text-emerald-400 font-semibold">{insights.topArea.area}</span> lidera con <span className="font-bold text-white/80">{insights.topArea.count}</span> dotaciones.</>
                    : <>Sin suficientes datos para análisis de área.</>
                  }
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
