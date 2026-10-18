import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { canViewRoute, DEFAULT_PAGE_BY_ROLE, useRole } from './RoleContext';
import { NotFoundPage } from '../modules/misc/NotFoundPage';
import { AccessDeniedPage } from '../modules/misc/AccessDeniedPage';
import { DashboardPage } from '../modules/dashboard/DashboardPage';
import { ProjectsPage } from '../modules/projects/ProjectsPage';
import { ProjectDetailPage } from '../modules/projects/ProjectDetailPage';
import { QuoteEditorPage } from '../modules/projects/QuoteEditorPage';
import { WorkItemsPage } from '../modules/work-items/WorkItemsPage';
import { HandoversPage } from '../modules/handovers/HandoversPage';
import { MaterialsPage } from '../modules/materials/MaterialsPage';
import { SuppliersPage } from '../modules/suppliers/SuppliersPage';
import { WorkersPage } from '../modules/workers/WorkersPage';
import { FinancePage } from '../modules/finance/FinancePage';
import { ReportsPage } from '../modules/reports/ReportsPage';
import { SettingsPage } from '../modules/settings/SettingsPage';

function Guard({ path, children }: { path: string; children: ReactNode }) {
  const { role } = useRole();
  if (!canViewRoute(role, path)) return <AccessDeniedPage />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { role } = useRole();
  return <Navigate to={DEFAULT_PAGE_BY_ROLE[role]} replace />;
}

function CurrentPath() {
  const location = useLocation();
  return <NotFoundPage path={location.pathname} />;
}

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route
            path="/dashboard"
            element={
              <Guard path="/dashboard">
                <DashboardPage />
              </Guard>
            }
          />
          <Route
            path="/projects"
            element={
              <Guard path="/projects">
                <ProjectsPage />
              </Guard>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <Guard path="/projects">
                <ProjectDetailPage />
              </Guard>
            }
          />
          <Route
            path="/projects/:projectId/quote/:quoteId"
            element={
              <Guard path="/projects">
                <QuoteEditorPage />
              </Guard>
            }
          />
          <Route
            path="/work-items"
            element={
              <Guard path="/work-items">
                <WorkItemsPage />
              </Guard>
            }
          />
          <Route
            path="/handovers"
            element={
              <Guard path="/handovers">
                <HandoversPage />
              </Guard>
            }
          />
          <Route
            path="/materials"
            element={
              <Guard path="/materials">
                <MaterialsPage />
              </Guard>
            }
          />
          <Route
            path="/suppliers"
            element={
              <Guard path="/suppliers">
                <SuppliersPage />
              </Guard>
            }
          />
          <Route
            path="/workers"
            element={
              <Guard path="/workers">
                <WorkersPage />
              </Guard>
            }
          />
          <Route
            path="/finance"
            element={
              <Guard path="/finance">
                <FinancePage />
              </Guard>
            }
          />
          <Route
            path="/reports"
            element={
              <Guard path="/reports">
                <ReportsPage />
              </Guard>
            }
          />
          <Route
            path="/settings"
            element={
              <Guard path="/settings">
                <SettingsPage />
              </Guard>
            }
          />
          <Route path="*" element={<CurrentPath />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
