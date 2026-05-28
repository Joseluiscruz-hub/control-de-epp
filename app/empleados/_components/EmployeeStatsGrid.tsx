"use client";

import { Users, UserCheck, UserX } from 'lucide-react';

export interface EmployeeStatsGridProps {
  total: number;
  activeCount: number;
  inactiveCount: number;
}

export function EmployeeStatsGrid({ total, activeCount, inactiveCount }: EmployeeStatsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="kpi-card p-6 group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
           <Users className="h-20 w-20 text-white" />
        </div>
        <p className="section-eyebrow mb-2">Plantilla Total</p>
        <p className="text-4xl font-black text-white tracking-tight">{total}</p>
      </div>
      
      <div className="kpi-card p-6 group" style={{borderColor: 'rgba(16,185,129,0.2)'}}>
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
           <UserCheck className="h-20 w-20 text-emerald-500" />
        </div>
        <p className="section-eyebrow mb-2" style={{color:'rgba(16,185,129,0.8)'}}>Colaboradores Activos</p>
        <p className="text-4xl font-black text-emerald-400 tracking-tight">{activeCount}</p>
      </div>

      <div className="kpi-card p-6 group" style={{borderColor: 'rgba(244,0,9,0.2)'}}>
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
           <UserX className="h-20 w-20 text-red-500" />
        </div>
        <p className="section-eyebrow mb-2" style={{color:'rgba(248,113,113,0.82)'}}>En Baja / Inactivos</p>
        <p className="text-4xl font-black text-red-500 tracking-tight">{inactiveCount}</p>
      </div>
    </div>
  );
}
