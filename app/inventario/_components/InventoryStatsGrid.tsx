"use client";

import { FileText, Package, TrendingDown, AlertTriangle } from 'lucide-react';

export interface InventoryStatsGridProps {
  totalStock: number;
  lowStockCount: number;
  outOfStockCount: number;
  reorderCount: number;
}

export function InventoryStatsGrid({
  totalStock,
  lowStockCount,
  outOfStockCount,
  reorderCount,
}: InventoryStatsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      <div className="kpi-card p-6 group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
           <Package className="h-20 w-20 text-white" />
        </div>
        <p className="section-eyebrow mb-2">Piezas Totales (PZA)</p>
        <p className="text-4xl font-black text-white tracking-tight">{totalStock.toLocaleString()}</p>
      </div>
      
      <div className="kpi-card p-6 group" style={{borderColor: 'rgba(245,158,11,0.2)'}}>
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
           <FileText className="h-20 w-20 text-amber-400" />
        </div>
        <p className="section-eyebrow mb-2" style={{color:'rgba(252,211,77,0.82)'}}>SOLPED requerida</p>
        <p className="text-4xl font-black text-amber-300 tracking-tight">{reorderCount}</p>
      </div>

      <div className="kpi-card p-6 group" style={{borderColor: 'rgba(245,158,11,0.2)'}}>
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
           <TrendingDown className="h-20 w-20 text-orange-500" />
        </div>
        <p className="section-eyebrow mb-2" style={{color:'rgba(251,146,60,0.82)'}}>Stock Crítico</p>
        <p className="text-4xl font-black text-orange-400 tracking-tight">{lowStockCount}</p>
      </div>

      <div className="kpi-card p-6 group" style={{borderColor: 'rgba(244,0,9,0.2)'}}>
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
           <AlertTriangle className="h-20 w-20 text-red-500" />
        </div>
        <p className="section-eyebrow mb-2" style={{color:'rgba(248,113,113,0.82)'}}>Agotado Total</p>
        <p className="text-4xl font-black text-red-500 tracking-tight">{outOfStockCount}</p>
      </div>
    </div>
  );
}
