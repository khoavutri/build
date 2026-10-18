import { db } from '../db/database';
import type { ActivityLog, Material, Milestone, Project, Supplier, Ticket, Timesheet, Worker, WorkItem } from '../types';
import { buildMilestoneRow, averageProgress, type MilestoneRow } from './projects';
import { milestoneState, TRADE_LABEL } from '../utils/status';
import { toDateKey } from '../utils/format';

// ---------------- Tổng quan ----------------

export interface WeeklyFlowRow {
  label: string;
  fromKey: string;
  toKey: string;
  inVnd: number;
  outVnd: number;
}

export interface DashboardData {
  activeProjects: number;
  runningContractValueVnd: number;
  collectedThisMonthVnd: number;
  receivableVnd: number;
  avgProgressPct: number;
  supplierDebtVnd: number;
  monthInVnd: number;
  monthOutVnd: number;
  monthNetVnd: number;
  materialCost30dVnd: number;
  payrollThisMonthVnd: number;
  cashRevenueVnd: number;
  weeklyFlow: WeeklyFlowRow[];
  projectProgress: Array<{ project: Project; customerName?: string; progressPct: number }>;
  overdueMilestones: Array<{ milestone: Milestone; project: Project; row: MilestoneRow }>;
  upcomingHandovers: Array<{ project: Project; daysLeft: number }>;
  overdueItems: Array<{ item: WorkItem; project: Project }>;
  openTickets: Array<{ ticket: Ticket; project: Project }>;
  upcomingMilestones: Array<{ milestone: Milestone; project: Project }>;
  recentActivities: ActivityLog[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getDashboardData(): Promise<DashboardData> {
  const [projects, customers, workItems, milestones, transactions, materialIssues, timesheets, workers, tickets, logs] = await Promise.all([
    db.projects.toArray(),
    db.customers.toArray(),
    db.workItems.toArray(),
    db.milestones.toArray(),
    db.transactions.toArray(),
    db.materialIssues.toArray(),
    db.timesheets.toArray(),
    db.workers.toArray(),
    db.tickets.toArray(),
    db.activityLogs.orderBy('at').reverse().limit(8).toArray(),
  ]);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const rateByWorker = new Map(workers.map((w) => [w.id, w.dailyRateVnd]));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartIso = monthStart.toISOString();
  const todayKey = toDateKey(now);
  const in30d = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  const running = projects.filter((p) => p.status === 'CONSTRUCTION' || p.status === 'ACCEPTANCE');

  const collectedThisMonthVnd = transactions
    .filter((t) => t.type === 'IN' && t.at >= monthStartIso)
    .reduce((sum, t) => sum + t.amountVnd, 0);

  const receivableVnd = milestones.reduce((sum, m) => sum + Math.max(0, m.amountVnd - m.paidVnd), 0);

  const progressOf = (projectId: string) => averageProgress(workItems.filter((i) => i.projectId === projectId));
  const avgProgressPct = running.length > 0 ? Math.round(running.reduce((sum, p) => sum + progressOf(p.id), 0) / running.length) : 0;

  // Công nợ NCC/thầu phụ: Σ phiếu mua đã nhận − Σ phiếu chi cho đối tượng
  const receivedPos = await db.purchaseOrders.filter((po) => po.status === 'RECEIVED').toArray();
  const purchasesBySupplier = new Map<string, number>();
  for (const po of receivedPos) purchasesBySupplier.set(po.supplierId, (purchasesBySupplier.get(po.supplierId) ?? 0) + po.totalVnd);
  const paidBySupplier = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type === 'OUT' && tx.partyId && (tx.category === 'SUPPLIER' || tx.category === 'SUBCONTRACTOR')) {
      paidBySupplier.set(tx.partyId, (paidBySupplier.get(tx.partyId) ?? 0) + tx.amountVnd);
    }
  }
  let supplierDebtVnd = 0;
  for (const [supplierId, purchased] of purchasesBySupplier) {
    supplierDebtVnd += Math.max(0, purchased - (paidBySupplier.get(supplierId) ?? 0));
  }

  const monthInVnd = transactions.filter((t) => t.type === 'IN' && t.at >= monthStartIso).reduce((sum, t) => sum + t.amountVnd, 0);
  const monthOutVnd = transactions.filter((t) => t.type === 'OUT' && t.at >= monthStartIso).reduce((sum, t) => sum + t.amountVnd, 0);
  const materialCost30dVnd = materialIssues.filter((i) => i.createdAt >= in30d).reduce((sum, i) => sum + i.totalVnd, 0);
  const payrollThisMonthVnd = Math.round(
    timesheets.filter((t) => t.date >= toDateKey(monthStart)).reduce((sum, t) => sum + t.days * (rateByWorker.get(t.workerId) ?? 0), 0),
  );
  const cashRevenueVnd = transactions.filter((t) => t.type === 'IN').reduce((sum, t) => sum + t.amountVnd, 0);

  // Thu – chi 6 tuần gần nhất
  const weeklyFlow: WeeklyFlowRow[] = [];
  for (let index = 5; index >= 0; index -= 1) {
    const start = new Date(now.getTime() - index * 7 * DAY_MS);
    const end = new Date(start.getTime() + 6 * DAY_MS);
    const fromKey = toDateKey(start);
    const toKey = toDateKey(end);
    const inVnd = transactions.filter((t) => t.type === 'IN' && t.at.slice(0, 10) >= fromKey && t.at.slice(0, 10) <= toKey).reduce((sum, t) => sum + t.amountVnd, 0);
    const outVnd = transactions.filter((t) => t.type === 'OUT' && t.at.slice(0, 10) >= fromKey && t.at.slice(0, 10) <= toKey).reduce((sum, t) => sum + t.amountVnd, 0);
    weeklyFlow.push({
      label: index === 0 ? 'Tuần này' : `Tuần ${fromKey.slice(8, 10)}/${fromKey.slice(5, 7)}`,
      fromKey,
      toKey,
      inVnd,
      outVnd,
    });
  }

  const projectProgress = running
    .map((project) => ({ project, customerName: customerById.get(project.customerId)?.name, progressPct: progressOf(project.id) }))
    .sort((a, b) => a.progressPct - b.progressPct);

  const overdueMilestones = milestones
    .filter((m) => m.paidVnd < m.amountVnd && m.dueDate && m.dueDate < todayKey)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 5)
    .map((m) => ({ milestone: m, project: projectById.get(m.projectId)!, row: buildMilestoneRow(m) }))
    .filter((row) => row.project);

  const upcomingHandovers = projects
    .filter((p) => p.handoverDate && p.status !== 'CLOSED')
    .map((p) => ({ project: p, daysLeft: Math.round((new Date(p.handoverDate as string).getTime() - new Date(todayKey).getTime()) / DAY_MS) }))
    .filter((row) => row.daysLeft <= 14)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  const overdueItems = workItems
    .filter((i) => i.endDate && i.endDate < todayKey && i.status !== 'DONE' && i.status !== 'ACCEPTED')
    .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''))
    .slice(0, 5)
    .map((item) => ({ item, project: projectById.get(item.projectId)! }))
    .filter((row) => row.project);

  const openTickets = tickets
    .filter((t) => t.status !== 'DONE')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((ticket) => ({ ticket, project: projectById.get(ticket.projectId)! }))
    .filter((row) => row.project);

  const upcomingMilestones = milestones
    .filter((m) => m.paidVnd < m.amountVnd && m.dueDate && m.dueDate >= todayKey)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 5)
    .map((m) => ({ milestone: m, project: projectById.get(m.projectId)! }))
    .filter((row) => row.project);

  return {
    activeProjects: running.length,
    runningContractValueVnd: running.reduce((sum, p) => sum + p.contractValueVnd, 0),
    collectedThisMonthVnd,
    receivableVnd,
    avgProgressPct,
    supplierDebtVnd,
    monthInVnd,
    monthOutVnd,
    monthNetVnd: monthInVnd - monthOutVnd,
    materialCost30dVnd,
    payrollThisMonthVnd,
    cashRevenueVnd,
    weeklyFlow,
    projectProgress,
    overdueMilestones,
    upcomingHandovers,
    overdueItems,
    openTickets,
    upcomingMilestones,
    recentActivities: logs,
  };
}

// ---------------- Báo cáo ----------------

export interface ProjectReportRow {
  project: Project;
  customerName?: string;
  contractValueVnd: number;
  collectedVnd: number;
  revenueVnd: number;
  materialCostVnd: number;
  laborCostVnd: number;
  otherCostVnd: number;
  costVnd: number;
  profitVnd: number;
  progressPct: number;
  payableVnd: number;
}

export async function projectReport(): Promise<ProjectReportRow[]> {
  const [projects, customers, transactions, issues, timesheets, workers, workItems, milestones] = await Promise.all([
    db.projects.toArray(),
    db.customers.toArray(),
    db.transactions.toArray(),
    db.materialIssues.toArray(),
    db.timesheets.toArray(),
    db.workers.toArray(),
    db.workItems.toArray(),
    db.milestones.toArray(),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const rateByWorker = new Map(workers.map((w) => [w.id, w.dailyRateVnd]));
  return projects
    .filter((p) => p.status !== 'CLOSED' || p.contractValueVnd > 0)
    .sort((a, b) => b.code.localeCompare(a.code))
    .map((project) => {
      const projectTx = transactions.filter((t) => t.projectId === project.id);
      const revenueVnd = projectTx.filter((t) => t.type === 'IN').reduce((sum, t) => sum + t.amountVnd, 0);
      const materialCostVnd = issues.filter((i) => i.projectId === project.id).reduce((sum, i) => sum + i.totalVnd, 0);
      const projectTimesheets = timesheets.filter((t) => t.projectId === project.id);
      const laborCostVnd = Math.round(projectTimesheets.reduce((sum, t) => sum + t.days * (rateByWorker.get(t.workerId) ?? 0), 0));
      const otherCostVnd = projectTx
        .filter((t) => t.type === 'OUT' && t.category === 'OTHER_OUT')
        .reduce((sum, t) => sum + t.amountVnd, 0);
      const costVnd = materialCostVnd + laborCostVnd + otherCostVnd;
      const remaining = milestones.filter((m) => m.projectId === project.id).reduce((sum, m) => sum + Math.max(0, m.amountVnd - m.paidVnd), 0);
      return {
        project,
        customerName: customerById.get(project.customerId)?.name,
        contractValueVnd: project.contractValueVnd,
        collectedVnd: revenueVnd,
        revenueVnd,
        materialCostVnd,
        laborCostVnd,
        otherCostVnd,
        costVnd,
        profitVnd: revenueVnd - costVnd,
        progressPct: averageProgress(workItems.filter((i) => i.projectId === project.id)),
        payableVnd: remaining,
      };
    });
}

export interface MaterialCostRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  monthKey: string;
  costVnd: number;
}

export async function materialCostByProject(fromIso: string, toIso: string): Promise<MaterialCostRow[]> {
  const [issues, projects] = await Promise.all([db.materialIssues.toArray(), db.projects.toArray()]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const map = new Map<string, MaterialCostRow>();
  for (const issue of issues) {
    if (issue.createdAt < fromIso || issue.createdAt > toIso) continue;
    const project = projectById.get(issue.projectId);
    const monthKey = issue.createdAt.slice(0, 7);
    const key = `${issue.projectId}::${monthKey}`;
    const row = map.get(key) ?? {
      projectId: issue.projectId,
      projectCode: project?.code ?? '—',
      projectName: project?.name ?? '—',
      monthKey,
      costVnd: 0,
    };
    row.costVnd += issue.totalVnd;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.costVnd - a.costVnd || a.monthKey.localeCompare(b.monthKey));
}

export interface TopMaterialRow {
  material: Material;
  quantity: number;
  costVnd: number;
}

export async function topMaterials(fromIso: string, toIso: string, limit = 10): Promise<TopMaterialRow[]> {
  const [issues, materials] = await Promise.all([db.materialIssues.toArray(), db.materials.toArray()]);
  const validIssues = issues.filter((i) => i.createdAt >= fromIso && i.createdAt <= toIso);
  const items = await db.materialIssueItems.toArray();
  const issueIds = new Set(validIssues.map((i) => i.id));
  const byMaterial = new Map<string, { quantity: number; costVnd: number }>();
  for (const item of items) {
    if (!issueIds.has(item.issueId)) continue;
    const row = byMaterial.get(item.materialId) ?? { quantity: 0, costVnd: 0 };
    row.quantity += item.quantity;
    row.costVnd += Math.round(item.quantity * item.unitCostVnd);
    byMaterial.set(item.materialId, row);
  }
  const materialById = new Map(materials.map((m) => [m.id, m]));
  return [...byMaterial.entries()]
    .map(([materialId, row]) => ({ material: materialById.get(materialId) as Material, quantity: row.quantity, costVnd: row.costVnd }))
    .filter((row) => row.material)
    .sort((a, b) => b.costVnd - a.costVnd)
    .slice(0, limit);
}

export interface LaborByWorkerRow {
  worker: Worker;
  days: number;
  amountVnd: number;
  byProject: Array<{ projectId: string; projectCode: string; days: number; amountVnd: number }>;
}

export async function laborByWorker(fromKey: string, toKey: string): Promise<LaborByWorkerRow[]> {
  const [timesheets, workers, projects] = await Promise.all([db.timesheets.toArray(), db.workers.toArray(), db.projects.toArray()]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const rows = timesheets.filter((t) => t.date >= fromKey && t.date <= toKey);
  return workers
    .map((worker) => {
      const own = rows.filter((t) => t.workerId === worker.id);
      const byProjectMap = new Map<string, { days: number; amountVnd: number }>();
      for (const row of own) {
        const current = byProjectMap.get(row.projectId) ?? { days: 0, amountVnd: 0 };
        current.days += row.days;
        current.amountVnd += Math.round(row.days * worker.dailyRateVnd);
        byProjectMap.set(row.projectId, current);
      }
      return {
        worker,
        days: own.reduce((sum, t) => sum + t.days, 0),
        amountVnd: Math.round(own.reduce((sum, t) => sum + t.days * worker.dailyRateVnd, 0)),
        byProject: [...byProjectMap.entries()].map(([projectId, value]) => ({
          projectId,
          projectCode: projectById.get(projectId)?.code ?? '—',
          days: value.days,
          amountVnd: value.amountVnd,
        })),
      };
    })
    .filter((row) => row.days > 0)
    .sort((a, b) => b.amountVnd - a.amountVnd);
}

export interface LaborByTradeRow {
  trade: string;
  days: number;
  amountVnd: number;
  workerCount: number;
}

export async function laborByTrade(fromKey: string, toKey: string): Promise<LaborByTradeRow[]> {
  const rows = await laborByWorker(fromKey, toKey);
  const map = new Map<string, { days: number; amountVnd: number; workerCount: number }>();
  for (const row of rows) {
    const key = TRADE_LABEL[row.worker.trade];
    const current = map.get(key) ?? { days: 0, amountVnd: 0, workerCount: 0 };
    current.days += row.days;
    current.amountVnd += row.amountVnd;
    current.workerCount += 1;
    map.set(key, current);
  }
  return [...map.entries()].map(([trade, value]) => ({ trade, ...value })).sort((a, b) => b.amountVnd - a.amountVnd);
}

/** Timesheet theo tháng của một thợ (dùng cho tab Nhân công) */
export function timesheetDays(rows: Timesheet[], workerId: string): number {
  return rows.filter((r) => r.workerId === workerId).reduce((sum, r) => sum + r.days, 0);
}

export interface SupplierDebtRow {
  supplier: Supplier;
  purchasedVnd: number;
  paidVnd: number;
  debtVnd: number;
}

export async function supplierDebtRows(): Promise<SupplierDebtRow[]> {
  const [suppliers, purchaseOrders, transactions] = await Promise.all([db.suppliers.toArray(), db.purchaseOrders.toArray(), db.transactions.toArray()]);
  const purchases = new Map<string, number>();
  for (const po of purchaseOrders) {
    if (po.status !== 'RECEIVED') continue;
    purchases.set(po.supplierId, (purchases.get(po.supplierId) ?? 0) + po.totalVnd);
  }
  const payments = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== 'OUT' || !tx.partyId) continue;
    if (tx.category !== 'SUPPLIER' && tx.category !== 'SUBCONTRACTOR') continue;
    payments.set(tx.partyId, (payments.get(tx.partyId) ?? 0) + tx.amountVnd);
  }
  return suppliers
    .map((supplier) => {
      const purchasedVnd = purchases.get(supplier.id) ?? 0;
      const paidVnd = payments.get(supplier.id) ?? 0;
      return { supplier, purchasedVnd, paidVnd, debtVnd: Math.max(0, purchasedVnd - paidVnd) };
    })
    .sort((a, b) => b.debtVnd - a.debtVnd);
}

export interface ReceivableRow {
  project: Project;
  customerName?: string;
  scheduleVnd: number;
  paidVnd: number;
  remainingVnd: number;
  overdueVnd: number;
}

export async function receivableRows(): Promise<ReceivableRow[]> {
  const [projects, customers, milestones] = await Promise.all([db.projects.toArray(), db.customers.toArray(), db.milestones.toArray()]);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const todayKey = toDateKey(new Date());
  return projects
    .map((project) => {
      const own = milestones.filter((m) => m.projectId === project.id);
      const scheduleVnd = own.reduce((sum, m) => sum + m.amountVnd, 0);
      const paidVnd = own.reduce((sum, m) => sum + m.paidVnd, 0);
      const overdueVnd = own
        .filter((m) => m.dueDate && m.dueDate < todayKey && m.paidVnd < m.amountVnd)
        .reduce((sum, m) => sum + (m.amountVnd - m.paidVnd), 0);
      return {
        project,
        customerName: customerById.get(project.customerId)?.name,
        scheduleVnd,
        paidVnd,
        remainingVnd: Math.max(0, scheduleVnd - paidVnd),
        overdueVnd,
      };
    })
    .filter((row) => row.scheduleVnd > 0)
    .sort((a, b) => b.remainingVnd - a.remainingVnd);
}

/** Hạng mục quá hạn chưa xong (dùng cho báo cáo tiến độ) */
export function overdueWorkItems(items: WorkItem[], todayKey: string): WorkItem[] {
  return items.filter((i) => i.endDate && i.endDate < todayKey && i.status !== 'DONE' && i.status !== 'ACCEPTED');
}

/** Trạng thái đợt thanh toán (tái xuất cho UI) */
export { milestoneState };

// ---------------- CSV ----------------

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<{ key: keyof T; label: string }>): string {
  const escape = (value: unknown): string => {
    const text = value == null ? '' : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(',')).join('\n');
  return `\uFEFF${header}\n${body}`;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
