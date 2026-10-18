import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso, toDateKey } from '../utils/format';
import type { Actor, Milestone, Project, ProjectCategory, ProjectStatus } from '../types';
import { assertAction, assertRevision, logActivity, nextCode } from './core';
import { NotFoundError, assertRule } from './errors';

export interface ProjectInput {
  name: string;
  customerId: string;
  category: ProjectCategory;
  address: string;
  contractValueVnd?: number;
  startDate?: string;
  handoverDate?: string;
  managerId?: string;
  designerId?: string;
  note?: string;
}

/** Luồng trạng thái hợp lệ của dự án */
export const PROJECT_STATUS_FLOW: ProjectStatus[] = ['DESIGN', 'QUOTING', 'CONSTRUCTION', 'ACCEPTANCE', 'HANDOVER', 'WARRANTY', 'CLOSED'];

/** Đợt thanh toán mặc định 30/30/30/10 */
export function defaultMilestonePlan(contractValueVnd: number, pcts: number[] = [30, 30, 30, 10]): Array<{ name: string; pct: number; amountVnd: number }> {
  return pcts.map((pct, index) => ({
    name: `Đợt ${index + 1} — ${milestoneLabel(index, pcts.length)}`,
    pct,
    amountVnd: Math.round((contractValueVnd * pct) / 100),
  }));
}

function milestoneLabel(index: number, total: number): string {
  if (index === 0) return 'Tạm ứng ký hợp đồng';
  if (index === total - 1) return 'Quyết toán & bảo hành';
  if (index === 1) return 'Thanh toán theo tiến độ';
  return 'Nghiệm thu hoàn thiện';
}

export async function createMilestones(
  projectId: string,
  contractValueVnd: number,
  pcts: number[],
  startDate?: string,
): Promise<Milestone[]> {
  const plan = defaultMilestonePlan(contractValueVnd, pcts);
  const base = startDate ? new Date(startDate) : new Date();
  const milestones: Milestone[] = plan.map((row, index) => {
    const due = new Date(base);
    due.setDate(due.getDate() + (index + 1) * 30);
    return {
      id: newId(),
      projectId,
      name: row.name,
      pct: row.pct,
      amountVnd: row.amountVnd,
      dueDate: toDateKey(due),
      paidVnd: 0,
      seq: index + 1,
    };
  });
  await db.milestones.bulkAdd(milestones);
  return milestones;
}

export async function createProject(
  actor: Actor,
  input: ProjectInput,
  options: { operationId?: string; createDefaultMilestones?: boolean; milestonePcts?: number[] } = {},
): Promise<Project> {
  assertAction(actor, 'project.manage');
  assertRule(input.name.trim().length >= 3, 'Tên dự án cần có ít nhất 3 ký tự.');
  assertRule(!!input.customerId, 'Vui lòng chọn chủ nhà cho dự án.');
  assertRule(input.address.trim().length >= 3, 'Vui lòng nhập địa chỉ công trình.');
  return db.transaction(
    'rw',
    [db.projects, db.customers, db.milestones, db.documentSequences, db.activityLogs, db.operationReceipts],
    async () => {
      const customer = await db.customers.get(input.customerId);
      if (!customer) throw new NotFoundError('Không tìm thấy chủ nhà đã chọn.');
      const code = await nextCode('PROJECT');
      const now = nowIso();
      const contractValueVnd = Math.max(0, Math.round(input.contractValueVnd ?? 0));
      const project: Project = {
        id: newId(),
        code,
        name: input.name.trim(),
        customerId: input.customerId,
        category: input.category,
        status: contractValueVnd > 0 ? 'CONSTRUCTION' : 'DESIGN',
        address: input.address.trim(),
        contractValueVnd,
        startDate: input.startDate,
        handoverDate: input.handoverDate,
        managerId: input.managerId,
        designerId: input.designerId,
        note: input.note?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        createdBy: actor.employeeId,
        revision: 1,
      };
      await db.projects.add(project);
      if (options.createDefaultMilestones && contractValueVnd > 0) {
        await createMilestones(project.id, contractValueVnd, options.milestonePcts ?? [30, 30, 30, 10], input.startDate);
      }
      await logActivity({
        entityType: 'PROJECT',
        entityId: project.id,
        projectId: project.id,
        action: 'PROJECT_CREATED',
        actor,
        summary: `Tạo dự án ${project.code} — ${project.name}`,
        operationId: options.operationId,
      });
      return project;
    },
  );
}

export async function updateProject(
  actor: Actor,
  id: string,
  patch: Partial<ProjectInput>,
  expectedRevision?: number,
): Promise<Project> {
  assertAction(actor, 'project.manage');
  return db.transaction('rw', [db.projects, db.activityLogs], async () => {
    const current = await db.projects.get(id);
    if (!current) throw new NotFoundError('Không tìm thấy dự án cần cập nhật.');
    assertRevision(current.revision, expectedRevision);
    if (patch.name !== undefined) assertRule(patch.name.trim().length >= 3, 'Tên dự án cần có ít nhất 3 ký tự.');
    const updated: Project = {
      ...current,
      name: patch.name?.trim() ?? current.name,
      customerId: patch.customerId ?? current.customerId,
      category: patch.category ?? current.category,
      address: patch.address?.trim() ?? current.address,
      contractValueVnd: patch.contractValueVnd !== undefined ? Math.max(0, Math.round(patch.contractValueVnd)) : current.contractValueVnd,
      startDate: patch.startDate !== undefined ? patch.startDate || undefined : current.startDate,
      handoverDate: patch.handoverDate !== undefined ? patch.handoverDate || undefined : current.handoverDate,
      managerId: patch.managerId !== undefined ? patch.managerId || undefined : current.managerId,
      designerId: patch.designerId !== undefined ? patch.designerId || undefined : current.designerId,
      note: patch.note !== undefined ? patch.note.trim() || undefined : current.note,
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };
    await db.projects.put(updated);
    await logActivity({
      entityType: 'PROJECT',
      entityId: id,
      projectId: id,
      action: 'PROJECT_UPDATED',
      actor,
      summary: `Cập nhật dự án ${updated.code}`,
    });
    return updated;
  });
}

export async function changeProjectStatus(actor: Actor, id: string, status: ProjectStatus, note?: string): Promise<Project> {
  assertAction(actor, 'project.statusChange');
  return db.transaction('rw', [db.projects, db.activityLogs], async () => {
    const current = await db.projects.get(id);
    if (!current) throw new NotFoundError('Không tìm thấy dự án.');
    assertRule(current.status !== status, 'Dự án đang ở đúng trạng thái này rồi.');
    const now = nowIso();
    const updated: Project = { ...current, status, updatedAt: now, revision: current.revision + 1 };
    await db.projects.put(updated);
    await logActivity({
      entityType: 'PROJECT',
      entityId: id,
      projectId: id,
      action: 'PROJECT_STATUS_CHANGED',
      actor,
      summary: `Chuyển dự án ${current.code} sang trạng thái mới${note ? ` — ${note}` : ''}`,
      changes: { from: current.status, to: status },
    });
    if (status === 'HANDOVER' && !updated.handoverDate) {
      await db.projects.put({ ...updated, handoverDate: toDateKey(new Date()) });
    }
    return updated;
  });
}

/** Cập nhật giá trị hợp đồng (dùng khi "áp vào giá trị HĐ" từ báo giá được duyệt) */
export async function applyContractValue(projectId: string, contractValueVnd: number, quoteCode: string): Promise<Project> {
  const current = await db.projects.get(projectId);
  if (!current) throw new NotFoundError('Không tìm thấy dự án để cập nhật giá trị hợp đồng.');
  const updated: Project = {
    ...current,
    contractValueVnd: Math.max(0, Math.round(contractValueVnd)),
    updatedAt: nowIso(),
    revision: current.revision + 1,
  };
  await db.projects.put(updated);
  // Sinh lại các đợt thanh toán chưa thu theo giá trị hợp đồng mới
  const milestones = await db.milestones.where('projectId').equals(projectId).toArray();
  for (const milestone of milestones) {
    if (milestone.paidVnd === 0) {
      await db.milestones.put({ ...milestone, amountVnd: Math.round((updated.contractValueVnd * milestone.pct) / 100) });
    }
  }
  await logActivity({
    entityType: 'PROJECT',
    entityId: projectId,
    projectId,
    action: 'CONTRACT_VALUE_APPLIED',
    summary: `Áp giá trị hợp đồng ${updated.contractValueVnd.toLocaleString('vi-VN')} ₫ từ báo giá ${quoteCode}`,
  });
  return updated;
}
