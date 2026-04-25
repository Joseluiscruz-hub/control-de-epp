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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1.5 flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-green-500" />
            Sistema activo —{' '}
            <span className="font-medium text-gray-700">
              {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
            </span>
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card) => (
          <Card key={card.title} className={`border-l-4 ${card.color} hover:shadow-md transition-shadow`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-medium text-gray-500">{card.title}</CardTitle>
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                {card.icon}
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="text-3xl font-bold text-gray-900">{card.value}</div>
              <p className={`text-xs mt-1.5 font-medium ${card.subColor}`}>{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upcoming alerts */}
      {upcomingAlerts.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <h2 className="font-semibold text-orange-900 text-sm">
              {upcomingAlerts.length} equipos requieren cambio en los próximos 7 días
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcomingAlerts.slice(0, 5).map(a => (
              <span key={a.id}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-orange-200 text-xs font-medium text-orange-700 shadow-sm">
                <Clock className="h-3 w-3" />
                {a.sku} — Emp. #{a.employeeId}
                {a.nextReplacementAt && isBefore(a.nextReplacementAt, new Date()) && (
                  <span className="text-red-600 font-bold">VENCIDO</span>
                )}
              </span>
            ))}
            {upcomingAlerts.length > 5 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-orange-100 text-xs font-medium text-orange-700">
                +{upcomingAlerts.length - 5} más
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assignments Table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-500" />
                Últimas Asignaciones
              </CardTitle>
              {!loading && recentAssignments.length > 0 && (
                <span className="text-xs text-gray-400">Tiempo real</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col gap-3 p-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse flex gap-4">
                    <div className="h-4 bg-gray-100 rounded w-16" />
                    <div className="h-4 bg-gray-100 rounded w-24" />
                    <div className="h-4 bg-gray-100 rounded w-32" />
                    <div className="h-4 bg-gray-100 rounded w-16" />
                  </div>
                ))}
              </div>
            ) : recentAssignments.length === 0 ? (
              <div className="text-center p-12 text-gray-400">
                <HardHat className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No hay asignaciones registradas.</p>
                <p className="text-sm mt-1">Usa el botón de acciones rápidas para registrar la primera entrega.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/60">
                      <th className="h-10 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Empleado</th>
                      <th className="h-10 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">SKU</th>
                      <th className="h-10 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Fecha</th>
                      <th className="h-10 px-5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAssignments.map((a) => {
                      const isOverdue = a.nextReplacementAt && isBefore(a.nextReplacementAt, new Date());
                      return (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3 font-medium text-gray-900">Emp #{a.employeeId}</td>
                          <td className="px-5 py-3 font-mono text-xs text-indigo-600 font-semibold">{a.sku}</td>
                          <td className="px-5 py-3 text-gray-500 text-xs">
                            {format(a.assignedAt, 'dd MMM yyyy, HH:mm', { locale: es })}
                          </td>
                          <td className="px-5 py-3">
                            {isOverdue ? (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1">
                                <AlertTriangle className="h-3 w-3" />Vencido
                              </Badge>
                            ) : (
                              <Badge variant={a.status === 'active' ? 'default' : 'secondary'}
                                className={a.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-100 gap-1' : 'gap-1'}>
                                {a.status === 'active'
                                  ? <><CheckCircle2 className="h-3 w-3" />En uso</>
                                  : 'Reemplazado'
                                }
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
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-900">Acciones Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <AssignPpeDialog />
              <Link href="/empleados">
                <button className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 rounded-xl transition-all border border-gray-200 text-left cursor-pointer text-gray-700 font-medium group">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                      <Users className="h-4 w-4 text-indigo-600" />
                    </div>
                    <span className="text-sm">Gestionar Empleados</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                </button>
              </Link>
              <Link href="/inventario">
                <button className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-200 rounded-xl transition-all border border-gray-200 text-left cursor-pointer text-gray-700 font-medium group mt-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                      <Package className="h-4 w-4 text-emerald-600" />
                    </div>
                    <span className="text-sm">Gestionar Inventario</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-emerald-600 transition-colors" />
                </button>
              </Link>
            </CardContent>
          </Card>

          {/* System status */}
          <Card className="border-green-100 bg-gradient-to-b from-green-50 to-white">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="text-sm font-semibold text-green-800">Sistema Operativo</span>
              </div>
              <div className="space-y-2 text-xs text-green-700">
                <p className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />Firebase conectado
                </p>
                <p className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />Sincronización en tiempo real
                </p>
                <p className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />ARIA IA disponible
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
