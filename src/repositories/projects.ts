import { db } from '../db/database';
import type { Customer, Employee, Milestone, Project, WorkItem } from '../types';
import { milestoneState } from '../utils/status';

export interface ProjectRow {
  project: Project;
  customer?: Customer;
  manager?: Employee;
  progressPct: number;
  workItemCount: number;
  paidVnd: number;
  scheduleVnd: number;
  collectedPct: number;
}

export interface MilestoneRow {
  milestone: Milestone;
  remainingVnd: number;
  state: { label: string; color: string };
}

export function buildMilestoneRow(milestone: Milestone): MilestoneRow {
  return {
    milestone,
    remainingVnd: Math.max(0, milestone.amountVnd - milestone.paidVnd),
    state: milestoneState(milestone.amountVnd, milestone.paidVnd, milestone.dueDate),
  };
}

export function averageProgress(items: WorkItem[]): number {
  if (items.length === 0) return 0;
  return Math.round(items.reduce((sum, item) => sum + item.progressPct, 0) / items.length);
}

/** Bảng dự án tổng hợp: tiến độ hạng mục, đã thu theo đợt, chỉ huy trưởng */
export async function listProjectRows(): Promise<ProjectRow[]> {
  const [projects, customers, employees, workItems, milestones] = await Promise.all([
    db.projects.toArray(),
    db.customers.toArray(),
    db.employees.toArray(),
    db.workItems.toArray(),
    db.milestones.toArray(),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  return projects
    .sort((a, b) => b.code.localeCompare(a.code))
    .map((project) => {
      const items = workItems.filter((i) => i.projectId === project.id);
      const projectMilestones = milestones.filter((m) => m.projectId === project.id);
      const paidVnd = projectMilestones.reduce((sum, m) => sum + m.paidVnd, 0);
      const scheduleVnd = projectMilestones.reduce((sum, m) => sum + m.amountVnd, 0);
      const collectedPct = scheduleVnd > 0 ? Math.round((paidVnd / scheduleVnd) * 100) : 0;
      return {
        project,
        customer: customerById.get(project.customerId),
        manager: project.managerId ? employeeById.get(project.managerId) : undefined,
        progressPct: averageProgress(items),
        workItemCount: items.length,
        paidVnd,
        scheduleVnd,
        collectedPct,
      };
    });
}

export async function listProjectMilestones(projectId: string): Promise<MilestoneRow[]> {
  const rows = await db.milestones.where('projectId').equals(projectId).toArray();
  return rows.sort((a, b) => a.seq - b.seq).map(buildMilestoneRow);
}

export async function listProjectWorkItems(projectId: string): Promise<WorkItem[]> {
  const rows = await db.workItems.where('projectId').equals(projectId).toArray();
  return rows.sort((a, b) => a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name));
}

/** Dòng tiền của một dự án: tổng thu − tổng chi */
export async function projectCashFlow(projectId: string): Promise<{ inVnd: number; outVnd: number; netVnd: number }> {
  const rows = await db.transactions.where('projectId').equals(projectId).toArray();
  const inVnd = rows.filter((r) => r.type === 'IN').reduce((sum, r) => sum + r.amountVnd, 0);
  const outVnd = rows.filter((r) => r.type === 'OUT').reduce((sum, r) => sum + r.amountVnd, 0);
  return { inVnd, outVnd, netVnd: inVnd - outVnd };
}

/** Tổng vật tư đã xuất cho dự án */
export async function projectMaterialCost(projectId: string): Promise<number> {
  const issues = await db.materialIssues.where('projectId').equals(projectId).toArray();
  return issues.reduce((sum, issue) => sum + issue.totalVnd, 0);
}

/** Tổng lương nhân công đã ghi theo dự án */
export async function projectLaborCost(projectId: string): Promise<number> {
  const rows = await db.timesheets.where('projectId').equals(projectId).toArray();
  const workers = await db.workers.toArray();
  const rateByWorker = new Map(workers.map((w) => [w.id, w.dailyRateVnd]));
  return Math.round(rows.reduce((sum, row) => sum + row.days * (rateByWorker.get(row.workerId) ?? 0), 0));
}
