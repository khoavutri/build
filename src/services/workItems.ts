import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso, toDateKey } from '../utils/format';
import type { Actor, WorkItem, WorkItemStatus } from '../types';
import { assertAction, logActivity } from './core';
import { NotFoundError, assertRule } from './errors';

/** Khu vực chuẩn dùng khi nhập hạng mục */
export const ZONES = ['Phòng khách', 'Bếp', 'Phòng ngủ 1', 'Phòng ngủ 2', 'Phòng ngủ 3', 'WC', 'Sảnh', 'Ban công', 'Hành lang', 'Toàn nhà'];

export interface WorkItemInput {
  projectId: string;
  zone: string;
  name: string;
  unit: string;
  quantity: number;
  assignedTo?: string;
  startDate?: string;
  endDate?: string;
  status: WorkItemStatus;
  progressPct: number;
  note?: string;
}

function validate(input: WorkItemInput): void {
  assertRule(input.name.trim().length >= 3, 'Tên hạng mục cần có ít nhất 3 ký tự.');
  assertRule(input.zone.trim().length >= 1, 'Vui lòng chọn hoặc nhập khu vực thi công.');
  assertRule(input.quantity > 0, 'Khối lượng hạng mục phải lớn hơn 0.');
  assertRule(input.progressPct >= 0 && input.progressPct <= 100, 'Tiến độ phải trong khoảng 0–100%.');
}

export async function saveWorkItem(
  actor: Actor,
  input: WorkItemInput,
  options: { id?: string; operationId?: string } = {},
): Promise<WorkItem> {
  assertAction(actor, 'workItem.manage');
  validate(input);
  return db.transaction('rw', [db.workItems, db.activityLogs, db.operationReceipts], async () => {
    const now = nowIso();
    if (options.id) {
      const current = await db.workItems.get(options.id);
      if (!current) throw new NotFoundError('Không tìm thấy hạng mục cần cập nhật.');
      const updated: WorkItem = {
        ...current,
        ...input,
        name: input.name.trim(),
        zone: input.zone.trim(),
        note: input.note?.trim() || undefined,
        updatedAt: now,
        revision: current.revision + 1,
      };
      await db.workItems.put(updated);
      await logActivity({
        entityType: 'WORK_ITEM',
        entityId: updated.id,
        projectId: updated.projectId,
        action: 'WORK_ITEM_UPDATED',
        actor,
        summary: `Cập nhật hạng mục "${updated.name}" (${updated.zone}) — ${updated.progressPct}%`,
      });
      return updated;
    }
    const created: WorkItem = {
      id: newId(),
      ...input,
      name: input.name.trim(),
      zone: input.zone.trim(),
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await db.workItems.add(created);
    await logActivity({
      entityType: 'WORK_ITEM',
      entityId: created.id,
      projectId: created.projectId,
      action: 'WORK_ITEM_CREATED',
      actor,
      summary: `Thêm hạng mục "${created.name}" tại ${created.zone}`,
    });
    return created;
  });
}

/** Cập nhật nhanh tiến độ trên bảng; tự suy ra trạng thái tương ứng */
export async function updateWorkItemProgress(actor: Actor, id: string, progressPct: number): Promise<WorkItem> {
  assertAction(actor, 'workItem.manage', 'Chỉ chỉ huy trưởng hoặc giám đốc được cập nhật tiến độ hạng mục.');
  return db.transaction('rw', [db.workItems, db.activityLogs], async () => {
    const current = await db.workItems.get(id);
    if (!current) throw new NotFoundError('Không tìm thấy hạng mục cần cập nhật tiến độ.');
    let status: WorkItemStatus = current.status;
    if (progressPct >= 100) {
      if (status === 'TODO' || status === 'DOING') status = 'DONE';
    } else if (progressPct > 0) {
      if (status === 'TODO' || status === 'DONE') status = 'DOING';
    } else if (status !== 'ACCEPTED') {
      status = 'TODO';
    }
    const updated: WorkItem = { ...current, progressPct, status, updatedAt: nowIso(), revision: current.revision + 1 };
    await db.workItems.put(updated);
    await logActivity({
      entityType: 'WORK_ITEM',
      entityId: id,
      projectId: current.projectId,
      action: 'WORK_ITEM_PROGRESS',
      actor,
      summary: `Cập nhật tiến độ "${current.name}" → ${progressPct}% (${updated.status})`,
    });
    return updated;
  });
}

export async function setWorkItemStatus(actor: Actor, id: string, status: WorkItemStatus): Promise<WorkItem> {
  assertAction(actor, 'workItem.manage');
  return db.transaction('rw', [db.workItems, db.activityLogs], async () => {
    const current = await db.workItems.get(id);
    if (!current) throw new NotFoundError('Không tìm thấy hạng mục.');
    const progressPct = status === 'ACCEPTED' || status === 'DONE' ? 100 : current.progressPct;
    const updated: WorkItem = { ...current, status, progressPct, updatedAt: nowIso(), revision: current.revision + 1 };
    await db.workItems.put(updated);
    await logActivity({
      entityType: 'WORK_ITEM',
      entityId: id,
      projectId: current.projectId,
      action: 'WORK_ITEM_STATUS',
      actor,
      summary: `Đổi trạng thái "${current.name}" → ${status}`,
    });
    return updated;
  });
}

export async function deleteWorkItem(actor: Actor, id: string): Promise<void> {
  assertAction(actor, 'workItem.manage');
  await db.transaction('rw', [db.workItems, db.activityLogs], async () => {
    const current = await db.workItems.get(id);
    if (!current) throw new NotFoundError('Không tìm thấy hạng mục cần xoá.');
    assertRule(
      current.status !== 'ACCEPTED',
      'Hạng mục đã nghiệm thu không thể xoá. Hãy đổi trạng thái trước nếu thật sự cần sửa.',
      'INVALID_STATE',
    );
    await db.workItems.delete(id);
    await logActivity({
      entityType: 'WORK_ITEM',
      entityId: id,
      projectId: current.projectId,
      action: 'WORK_ITEM_DELETED',
      actor,
      summary: `Xoá hạng mục "${current.name}"`,
    });
  });
}

/** Tiến độ tổng của dự án = trung bình % hoàn thành các hạng mục */
export function projectProgress(items: WorkItem[]): number {
  if (items.length === 0) return 0;
  return Math.round(items.reduce((sum, item) => sum + item.progressPct, 0) / items.length);
}

export function workItemOverdue(item: WorkItem): boolean {
  if (!item.endDate) return false;
  if (item.status === 'DONE' || item.status === 'ACCEPTED') return false;
  return item.endDate < toDateKey(new Date());
}
