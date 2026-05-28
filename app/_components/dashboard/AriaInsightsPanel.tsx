"use client";

import { motion } from 'motion/react';
import { Bot, TrendingUp, CheckCircle2 } from 'lucide-react';
import type { InsightData } from '@/app/_hooks/useDashboardData';

// ── Props ─────────────────────────────────────────────────────

export interface AriaInsightsPanelProps {
  insights: InsightData;
}

// ── Component ─────────────────────────────────────────────────

export function AriaInsightsPanel({ insights }: AriaInsightsPanelProps) {
  return (
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
  );
}
