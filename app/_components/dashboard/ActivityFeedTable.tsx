"use client";

import { motion } from 'motion/react';
import { Activity, Package, ArrowRight } from 'lucide-react';
import { format, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import type { Assignment } from '@/app/_hooks/useDashboardData';

// ── Props ─────────────────────────────────────────────────────

export interface ActivityFeedTableProps {
  loading: boolean;
  recentAssignments: Assignment[];
}

// ── Component ─────────────────────────────────────────────────

export function ActivityFeedTable({ loading, recentAssignments }: ActivityFeedTableProps) {
  return (
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
  );
}
