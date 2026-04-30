"use client";

import { useEffect, useState } from 'react';
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
  TrendingUp, Clock, CheckCircle2, Activity
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { format, isToday, isBefore, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { AssignPpeDialog } from '@/components/assign-ppe-dialog';
import Link from 'next/link';

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
    // Fetch static stats
    const fetchStats = async () => {
      try {
        const [empSnap, invSnap] = await Promise.all([
          getDocs(query(collection(db, 'employees'), where('active', '==', true))),
          getDocs(collection(db, 'ppe_catalog')),
        ]);

        const invData = invSnap.docs.map(d => d.data());
        const totalStock = invData.reduce((sum, d) => sum + (d.stock || 0), 0);
        const lowStock = invData.filter(d => d.stock <= 20).length;

        setStats(prev => ({
          ...prev,
          activeEmployees: empSnap.size,
          totalInventoryItems: invSnap.size,
          totalStock,
          lowStockItems: lowStock,
        }));
      } catch { /* silently fail */ }
    };
    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Entregas de Hoy',
      value: loading ? '—' : stats.todayAssignments,
      icon: <HardHat className="h-5 w-5" />,
      color: 'border-l-blue-500',
      iconBg: 'bg-blue-50 text-blue-600',
      sub: 'Registradas en el turno actual',
      subColor: 'text-blue-600',
    },
    {
      title: 'Empleados Activos',
      value: stats.activeEmployees || '—',
      icon: <Users className="h-5 w-5" />,
      color: 'border-l-indigo-500',
      iconBg: 'bg-indigo-50 text-indigo-600',
      sub: 'Personal en planta',
      subColor: 'text-indigo-600',
    },
    {
      title: 'Alertas de Reposición',
      value: stats.alertsThisWeek,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: stats.alertsThisWeek > 0 ? 'border-l-orange-500' : 'border-l-green-400',
      iconBg: stats.alertsThisWeek > 0 ? 'bg-orange-50 text-orange-500' : 'bg-green-50 text-green-600',
      sub: stats.alertsThisWeek > 0 ? 'Requieren cambio esta semana' : 'Sin alertas pendientes ✓',
      subColor: stats.alertsThisWeek > 0 ? 'text-orange-600' : 'text-green-600',
    },
    {
      title: 'SKUs en Catálogo',
      value: stats.totalInventoryItems || '—',
      icon: <Package className="h-5 w-5" />,
      color: stats.lowStockItems > 0 ? 'border-l-red-400' : 'border-l-emerald-500',
      iconBg: stats.lowStockItems > 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600',
      sub: stats.lowStockItems > 0
        ? `${stats.lowStockItems} artículo(s) con stock bajo`
        : `${stats.totalStock.toLocaleString()} unidades disponibles`,
      subColor: stats.lowStockItems > 0 ? 'text-red-600' : 'text-emerald-600',
    },
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2rem] border border-gray-100 shadow-xl shadow-indigo-50/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/30 rounded-full -mr-20 -mt-20 blur-3xl" />
        <div className="relative z-10">
          <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50 border-none px-3 py-1 mb-4 rounded-full font-bold text-[10px] uppercase tracking-widest">
            Panel de Control Central
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 lg:text-5xl">
            ¡Hola, {user?.displayName?.split(' ')[0] || 'Admin'}! 👋
          </h1>
          <p className="text-gray-500 mt-3 flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-green-500 animate-pulse" />
            El sistema está monitoreando la seguridad de <span className="font-bold text-gray-700">{stats.activeEmployees} colaboradores</span>
          </p>
        </div>
        
        <div className="relative z-10 flex flex-col items-end gap-2">
          <div className="text-right">
            <p className="text-sm font-bold text-indigo-600 uppercase tracking-tighter">Estado Global</p>
            <p className="text-2xl font-black text-gray-900 leading-tight">Óptimo</p>
          </div>
          <p className="text-sm font-medium text-gray-400 bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
            {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, idx) => (
          <Card key={card.title} 
            className={`group relative overflow-hidden border-none shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 bg-white rounded-3xl animate-in fade-in slide-in-from-bottom-4`}
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <div className={`absolute top-0 left-0 w-1.5 h-full ${card.color.replace('border-l-', 'bg-')}`} />
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-6 px-6">
              <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-widest">{card.title}</CardTitle>
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${card.iconBg} shadow-inner transition-transform group-hover:scale-110 duration-500`}>
                {card.icon}
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-8">
              <div className="text-4xl font-black text-gray-900 tracking-tight">{card.value}</div>
              <div className="mt-3 flex items-center gap-1.5">
                <div className={`h-1.5 w-1.5 rounded-full ${card.subColor.replace('text-', 'bg-')} animate-pulse`} />
                <p className={`text-xs font-bold ${card.subColor}`}>{card.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts Banner */}
      {upcomingAlerts.length > 0 && (
        <div className="rounded-[2rem] border border-orange-100 bg-gradient-to-br from-orange-50/50 via-amber-50/30 to-white p-8 shadow-lg shadow-orange-100/20 flex flex-col md:flex-row items-center gap-6">
          <div className="h-16 w-16 rounded-2xl bg-orange-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-8 w-8 text-orange-600 animate-bounce" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-xl font-bold text-orange-900">
              Atención: Equipos por vencer
            </h2>
            <p className="text-orange-700/70 font-medium mt-1">
              Hay {upcomingAlerts.length} elementos que requieren reposición inmediata para garantizar la seguridad.
            </p>
          </div>
          <div className="flex -space-x-3 overflow-hidden">
             {upcomingAlerts.slice(0, 4).map((a, i) => (
               <div key={a.id} className="h-10 w-10 rounded-full border-2 border-white bg-white flex items-center justify-center shadow-sm" title={a.sku}>
                 <HardHat className="h-5 w-5 text-gray-400" />
               </div>
             ))}
             {upcomingAlerts.length > 4 && (
               <div className="h-10 w-10 rounded-full border-2 border-white bg-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-700 shadow-sm">
                 +{upcomingAlerts.length - 4}
               </div>
             )}
          </div>
          <Link href="/empleados">
            <Button className="bg-orange-600 hover:bg-orange-700 text-white rounded-2xl px-6 h-12 shadow-lg shadow-orange-200">
              Ver Detalles
            </Button>
          </Link>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Recent Activity Table */}
        <Card className="xl:col-span-2 border-none shadow-xl bg-white rounded-[2rem] overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Clock className="h-6 w-6 text-indigo-500" />
                  Actividad Reciente
                </CardTitle>
                <p className="text-sm text-gray-400 mt-1">Sincronizado en tiempo real con la nube</p>
              </div>
              <Badge variant="outline" className="text-[10px] font-black tracking-widest uppercase border-indigo-100 text-indigo-500 px-3">
                Live Feed
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4 p-8">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="animate-pulse h-12 bg-gray-50 rounded-2xl" />
                ))}
              </div>
            ) : recentAssignments.length === 0 ? (
              <div className="text-center py-20">
                <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="h-10 w-10 text-gray-200" />
                </div>
                <p className="font-bold text-gray-400">Sin registros recientes</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-gray-50 bg-gray-50/30">
                      <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Colaborador</th>
                      <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Material SKU</th>
                      <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha/Hora</th>
                      <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentAssignments.map((a) => {
                      const isOverdue = a.nextReplacementAt && isBefore(a.nextReplacementAt, new Date());
                      return (
                        <tr key={a.id} className="group hover:bg-indigo-50/30 transition-colors">
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 font-bold text-xs">
                                {a.employeeId.slice(-2)}
                              </div>
                              <span className="font-bold text-gray-700">Emp #{a.employeeId}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <code className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg font-bold">
                              {a.sku}
                            </code>
                          </td>
                          <td className="px-8 py-5">
                            <p className="text-xs font-bold text-gray-500">
                              {format(a.assignedAt, 'dd MMM, HH:mm', { locale: es })}
                            </p>
                          </td>
                          <td className="px-8 py-5 text-right">
                            {isOverdue ? (
                              <Badge className="bg-red-50 text-red-600 hover:bg-red-50 border-none font-bold text-[10px]">
                                VENCIDO
                              </Badge>
                            ) : (
                              <Badge className={a.status === 'active' ? 'bg-green-50 text-green-600 hover:bg-green-50 border-none font-bold text-[10px]' : 'bg-gray-50 text-gray-400 border-none font-bold text-[10px]'}>
                                {a.status === 'active' ? 'ACTIVO' : 'REEMPLAZADO'}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="p-8 border-t border-gray-50 bg-gray-50/20 text-center">
              <Link href="/empleados" className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center justify-center gap-2 group">
                Ver historial completo
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions & AI Intelligence */}
        <div className="space-y-8">
          <Card className="border-none shadow-xl bg-gradient-to-br from-indigo-600 to-purple-800 rounded-[2rem] p-8 text-white relative overflow-hidden">
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Bot className="h-6 w-6" />
              Acciones Rápidas
            </h3>
            <div className="space-y-4">
              <AssignPpeDialog />
              <Link href="/inventario" className="block w-full">
                <Button variant="outline" className="w-full h-14 bg-white/10 border-white/20 hover:bg-white/20 text-white rounded-2xl justify-between group transition-all">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5" />
                    <span className="font-bold">Gestionar Inventario</span>
                  </div>
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/portal" target="_blank" className="block w-full">
                <Button variant="outline" className="w-full h-14 bg-white/10 border-white/20 hover:bg-white/20 text-white rounded-2xl justify-between group transition-all">
                  <div className="flex items-center gap-3">
                    <ExternalLink className="h-5 w-5" />
                    <span className="font-bold">Ir al Portal Público</span>
                  </div>
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* AI Insights Card */}
          <Card className="border-none shadow-xl bg-white rounded-[2rem] p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-ping" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Bot className="h-5 w-5 text-indigo-500" />
              ARIA AI Insights
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                <p className="text-xs font-bold text-indigo-700 uppercase tracking-widest mb-2">Predicción de Stock</p>
                <p className="text-sm text-gray-700 leading-relaxed font-medium">
                  Se recomienda reabastecer <span className="text-indigo-600 font-black">Cascos de Seguridad</span> en los próximos 15 días basado en la tasa de reposición actual.
                </p>
              </div>
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-2">Cumplimiento</p>
                <p className="text-sm text-gray-700 leading-relaxed font-medium">
                  El área de <span className="text-emerald-600 font-black">Soldadura</span> mantiene un cumplimiento del 98% en equipos activos.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
