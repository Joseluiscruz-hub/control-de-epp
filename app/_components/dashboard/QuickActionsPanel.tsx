"use client";

import { motion } from 'motion/react';
import { HardHat, Package, ArrowRight, ExternalLink, Zap } from 'lucide-react';
import Link from 'next/link';
import { AssignPpeDialog } from '@/components/assign-ppe-dialog';

// ── Component ─────────────────────────────────────────────────

export function QuickActionsPanel() {
  return (
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
  );
}
