"use client";

import { motion } from 'motion/react';
import { useAuth } from '@/components/auth-provider';
import { KioskRequestsPanel } from '@/components/kiosk-requests-panel';
import { useDashboardData } from '@/app/_hooks/useDashboardData';
import { DashboardHero } from '@/app/_components/dashboard/DashboardHero';
import { KpiCardGrid } from '@/app/_components/dashboard/KpiCardGrid';
import { AlertBanner } from '@/app/_components/dashboard/AlertBanner';
import { ActivityFeedTable } from '@/app/_components/dashboard/ActivityFeedTable';
import { QuickActionsPanel } from '@/app/_components/dashboard/QuickActionsPanel';
import { AriaInsightsPanel } from '@/app/_components/dashboard/AriaInsightsPanel';

export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const {
    recentAssignments,
    loading,
    stats,
    upcomingAlerts,
    insights,
  } = useDashboardData();

  return (
    <div className="space-y-6 pb-20">

      {/* ── Hero Section ──────────────────────── */}
      <DashboardHero
        authDisplayName={authUser?.displayName}
        stats={stats}
        insights={insights}
      />

      {/* ── KPI Grid ──────────────────────────── */}
      <KpiCardGrid loading={loading} stats={stats} />

      {/* ── Alert Banner ──────────────────────── */}
      <AlertBanner upcomingAlerts={upcomingAlerts} />

      {/* ── Main Grid ─────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Activity Feed */}
        <ActivityFeedTable
          loading={loading}
          recentAssignments={recentAssignments}
        />

        {/* Sidebar Widgets */}
        <div className="space-y-4">

          {/* Kiosk Requests */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.75 }}
          >
            <KioskRequestsPanel />
          </motion.div>

          {/* Quick Actions */}
          <QuickActionsPanel />

          {/* ARIA Insights */}
          <AriaInsightsPanel insights={insights} />
        </div>
      </div>
    </div>
  );
}
