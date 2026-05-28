"use client";

import { useEffect, useState, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  HardHat, Users, AlertTriangle, Package,
  ArrowUpRight,
} from 'lucide-react';
import type { DashboardStats } from '@/app/_hooks/useDashboardData';

// ── Animated counter hook ─────────────────────────────────────

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

// ── SparkBars ─────────────────────────────────────────────────

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

// ── Props ─────────────────────────────────────────────────────

export interface KpiCardGridProps {
  loading: boolean;
  stats: DashboardStats;
}

// ── KPI card definition ───────────────────────────────────────

interface KpiCard {
  title: string;
  value: number | string;
  icon: ReactNode;
  iconColor: string;
  iconBg: string;
  iconBorder: string;
  accentColor: string;
  sub: string;
  trend: number[];
  positive: boolean;
}

// ── Component ─────────────────────────────────────────────────

export function KpiCardGrid({ loading, stats }: KpiCardGridProps) {
  const animatedToday = useAnimatedCounter(stats.todayAssignments);
  const animatedEmployees = useAnimatedCounter(stats.activeEmployees);
  const animatedAlerts = useAnimatedCounter(stats.alertsThisWeek);
  const animatedStock = useAnimatedCounter(stats.totalStock);

  const kpiCards: KpiCard[] = [
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
  );
}
