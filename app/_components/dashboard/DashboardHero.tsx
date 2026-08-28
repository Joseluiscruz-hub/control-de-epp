"use client";

import { motion } from 'motion/react';
import { Activity, HardHat, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import type { DashboardStats, InsightData } from '@/app/_hooks/useDashboardData';

// ── Circular gauge SVG ────────────────────────────────────────
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

// ── Props ─────────────────────────────────────────────────────

export interface DashboardHeroProps {
  authDisplayName: string | null | undefined;
  stats: DashboardStats;
  insights: InsightData;
}

// ── Component ─────────────────────────────────────────────────

export function DashboardHero({ authDisplayName, stats, insights }: DashboardHeroProps) {
  return (
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
            <span className="badge-brand">Centro de mando EPP</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h1 className="text-4xl lg:text-6xl font-black tracking-tight text-white leading-[0.95]">
              Seguridad operativa,
              <span className="block text-gradient-red">
                inteligente y corporativa
              </span>
            </h1>
            <p className="text-white/60 text-base font-medium mt-4 leading-relaxed max-w-2xl">
              Hola {authDisplayName?.split(' ')[0] || 'Admin'}. Monitoreo activo de{' '}
              <span className="text-white/80 font-semibold">{stats.activeEmployees} colaboradores</span>
              {' '}con inventario, solicitudes de kiosko y análisis ARIA en un centro de control unificado.
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
            <div className="command-strip flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white/55">
              <Sparkles className="h-3.5 w-3.5" style={{color:'rgba(212,160,23,0.9)'}} />
              Cumplimiento {insights.complianceRate}%
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
  );
}
