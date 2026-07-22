"use client";

import { useEffect, useState, useCallback } from 'react';
import {
  collection, onSnapshot, query, orderBy, limit,
  where, Timestamp
} from 'firebase/firestore';
import { auth, db, ensureFirebaseReady } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { isToday, isBefore, addDays } from 'date-fns';
import { canUseLocalFallback, getLocalDashboardSnapshot } from '@/lib/kiosk-local-store';
import { usePlantStore } from '@/store/usePlantStore';
import { useAuth } from '@/components/auth-context';

// ── Interfaces ────────────────────────────────────────────────

export interface InsightData {
  lowStockItem: { name: string; stock: number } | null;
  topArea: { area: string; count: number } | null;
  complianceRate: number;
}

export interface Assignment {
  id: string;
  employeeId: string;
  sku: string;
  assignedAt: Date;
  nextReplacementAt?: Date;
  status: string;
}

export interface DashboardStats {
  todayAssignments: number;
  activeEmployees: number;
  alertsThisWeek: number;
  totalInventoryItems: number;
  lowStockItems: number;
  totalStock: number;
}

type LiveDoc = {
  id: string;
  data: Record<string, unknown>;
};

type MonitoringPayload = {
  assignments?: LiveDoc[];
  employees?: LiveDoc[];
  inventory?: LiveDoc[];
};

function toDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function readStock(item: Record<string, unknown>) {
  if (typeof item.stock === 'number') return item.stock;
  const sizes = item.sizes;
  if (!sizes || typeof sizes !== 'object' || Array.isArray(sizes)) return Number(item.stock ?? 0);
  return Object.values(sizes as Record<string, Record<string, unknown>>).reduce(
    (sum, variant) => sum + Number(variant.stock ?? 0),
    0
  );
}

function assignmentFromDoc(doc: LiveDoc): Assignment {
  return {
    id: doc.id,
    employeeId: String(doc.data.employeeId ?? ''),
    sku: String(doc.data.sku ?? ''),
    assignedAt: toDate(doc.data.assignedAt),
    nextReplacementAt: doc.data.nextReplacementAt ? toDate(doc.data.nextReplacementAt) : undefined,
    status: String(doc.data.status ?? ''),
  };
}

// ── Hook ──────────────────────────────────────────────────────

export function useDashboardData() {
  const { activePlantId } = usePlantStore();
  const { loading: authLoading, isAdmin, isOfflineSession } = useAuth();
  const firebaseAdminReady = !authLoading && isAdmin && !isOfflineSession;
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

  const applyLocalDashboard = useCallback(() => {
    if (!canUseLocalFallback()) {
      setLoading(false);
      return;
    }

    const local = getLocalDashboardSnapshot();
    setRecentAssignments(local.assignments.slice(0, 10).map((assignment) => ({
      id: assignment.id,
      employeeId: assignment.employeeId,
      sku: assignment.sku,
      assignedAt: assignment.assignedAt,
      nextReplacementAt: assignment.nextReplacementAt,
      status: assignment.status,
    })));
    setUpcomingAlerts(local.upcomingAlerts.map((assignment) => ({
      id: assignment.id,
      employeeId: assignment.employeeId,
      sku: assignment.sku,
      assignedAt: assignment.assignedAt,
      nextReplacementAt: assignment.nextReplacementAt,
      status: assignment.status,
    })));
    setStats(local.stats);
    setInsights(local.insights);
    setLoading(false);
  }, []);

  const applyServerDashboard = useCallback(async () => {
    if (!firebaseAdminReady) {
      if (!authLoading) applyLocalDashboard();
      return;
    }

    try {
      await ensureFirebaseReady();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('missing_admin_session');

      const response = await fetch(`/api/monitoring/live?plant=${encodeURIComponent(activePlantId)}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) throw new Error('dashboard_server_fallback_failed');

      const payload = await response.json() as MonitoringPayload;
      const assignments = (payload.assignments ?? [])
        .map(assignmentFromDoc)
        .sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime());
      const inventoryItems = (payload.inventory ?? []).map((doc) => doc.data);
      const employees = (payload.employees ?? []).map((doc) => ({
        id: doc.id,
        area: String(doc.data.area ?? ''),
      }));
      const stockValues = inventoryItems.map(readStock);
      const now = new Date();
      const nextWeek = addDays(now, 7);
      const upcoming = assignments.filter((assignment) =>
        assignment.nextReplacementAt && assignment.status === 'active' &&
        (isBefore(assignment.nextReplacementAt, nextWeek) || isBefore(assignment.nextReplacementAt, now))
      );

      const sortedByStock = [...inventoryItems].sort((a, b) => readStock(a) - readStock(b));
      const lowestItem = sortedByStock.length > 0
        ? { name: String(sortedByStock[0].name ?? 'EPP sin nombre'), stock: readStock(sortedByStock[0]) }
        : null;
      const empMap = new Map(employees.map((employee) => [employee.id, employee.area]));
      const areaCounts: Record<string, number> = {};
      assignments.forEach((assignment) => {
        const area = empMap.get(assignment.employeeId);
        if (area) areaCounts[area] = (areaCounts[area] || 0) + 1;
      });
      const topAreaEntry = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0];
      const activeAssigns = assignments.filter((assignment) => assignment.status === 'active');
      const compliant = activeAssigns.filter((assignment) => !assignment.nextReplacementAt || assignment.nextReplacementAt > now);

      setRecentAssignments(assignments.slice(0, 10));
      setUpcomingAlerts(upcoming);
      setStats({
        todayAssignments: assignments.filter((assignment) => isToday(assignment.assignedAt)).length,
        activeEmployees: employees.length,
        alertsThisWeek: upcoming.length,
        totalInventoryItems: inventoryItems.length,
        lowStockItems: stockValues.filter((stock) => stock <= 20).length,
        totalStock: stockValues.reduce((sum, stock) => sum + stock, 0),
      });
      setInsights({
        lowStockItem: lowestItem,
        topArea: topAreaEntry ? { area: topAreaEntry[0], count: topAreaEntry[1] } : null,
        complianceRate: activeAssigns.length > 0 ? Math.round((compliant.length / activeAssigns.length) * 100) : 100,
      });
      setLoading(false);
    } catch (error) {
      console.error('[Dashboard server fallback error]', error);
      applyLocalDashboard();
    }
  }, [activePlantId, applyLocalDashboard, authLoading, firebaseAdminReady]);

  useEffect(() => {
    if (authLoading || firebaseAdminReady) return;

    const timeout = window.setTimeout(() => {
      applyLocalDashboard();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [applyLocalDashboard, authLoading, firebaseAdminReady]);

  // ── Assignments listener (recent 10) ──────────────────────
  useEffect(() => {
    if (!firebaseAdminReady) return;

    try {
      const q = activePlantId === 'todas'
        ? query(collection(db, 'assignments'), orderBy('assignedAt', 'desc'), limit(10))
        : query(collection(db, 'assignments'), where('plantaId', '==', activePlantId), limit(50));
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
        }).sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime()).slice(0, 10);
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
        void applyServerDashboard();
      });
      return () => unsubscribe();
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'assignments');
      const timeout = window.setTimeout(() => {
        void applyServerDashboard();
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [activePlantId, applyLocalDashboard, applyServerDashboard, authLoading, firebaseAdminReady]);

  // ── Employees + Inventory + Assignments stats listener ────
  useEffect(() => {
    if (!firebaseAdminReady) return;

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

    try {
      const unsubscribeEmployees = onSnapshot(
        activePlantId === 'todas'
          ? query(collection(db, 'employees'), where('active', '==', true), limit(1000))
          : query(collection(db, 'employees'), where('plantaId', '==', activePlantId), limit(1000)),
        (snapshot) => {
          activeEmployees = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            area: String(docSnap.data().area ?? ''),
          })).filter((employee) => {
            const source = snapshot.docs.find((docSnap) => docSnap.id === employee.id)?.data();
            return source?.active === true;
          });
          employeesReady = true;
          recomputeStats();
        },
        (error) => {
          console.error('[Dashboard employees stats error]', error);
          void applyServerDashboard();
        }
      );

      const unsubscribeInventory = onSnapshot(
        activePlantId === 'todas'
          ? query(collection(db, 'ppe_catalog'), limit(500))
          : query(collection(db, 'ppe_catalog'), where('plantaId', '==', activePlantId), limit(500)),
        (snapshot) => {
          inventoryItems = snapshot.docs.map((docSnap) => docSnap.data());
          inventoryReady = true;
          recomputeStats();
        },
        (error) => {
          console.error('[Dashboard inventory stats error]', error);
          void applyServerDashboard();
        }
      );

      const unsubscribeAssignments = onSnapshot(
        activePlantId === 'todas'
          ? query(collection(db, 'assignments'), orderBy('assignedAt', 'desc'), limit(200))
          : query(collection(db, 'assignments'), where('plantaId', '==', activePlantId), limit(300)),
        (snapshot) => {
          assignmentItems = snapshot.docs.map((docSnap) => docSnap.data());
          assignmentsReady = true;
          recomputeStats();
        },
        (error) => {
          console.error('[Dashboard assignment stats error]', error);
          void applyServerDashboard();
        }
      );

      return () => {
        unsubscribeEmployees();
        unsubscribeInventory();
        unsubscribeAssignments();
      };
    } catch (error) {
      console.error('[Dashboard local fallback]', error);
      const timeout = window.setTimeout(() => {
        void applyServerDashboard();
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [activePlantId, applyLocalDashboard, applyServerDashboard, authLoading, firebaseAdminReady]);

  return {
    recentAssignments,
    loading,
    stats,
    upcomingAlerts,
    insights,
  };
}
