import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/format';
import type { Actor, Supplier, SupplierType, Timesheet, Worker } from '../types';
import { assertAction, logActivity, nextCode } from './core';
import { NotFoundError, assertRule } from './errors';

export interface SupplierInput {
  name: string;
  type: SupplierType;
  specialty?: string;
  phone: string;
  address?: string;
  rating: number;
  note?: string;
}

export async function saveSupplier(actor: Actor, input: SupplierInput, id?: string): Promise<Supplier> {
  assertAction(actor, 'supplier.manage');
  assertRule(input.name.trim().length >= 2, 'Tên nhà cung cấp/thầu phụ cần có ít nhất 2 ký tự.');
  assertRule(input.phone.trim().length >= 4, 'Vui lòng nhập số điện thoại liên hệ.');
  assertRule(input.rating >= 0 && input.rating <= 5, 'Đánh giá phải trong khoảng 0–5 sao.');
  return db.transaction('rw', [db.suppliers, db.documentSequences, db.activityLogs], async () => {
    const now = nowIso();
    if (id) {
      const current = await db.suppliers.get(id);
      if (!current) throw new NotFoundError('Không tìm thấy nhà cung cấp cần cập nhật.');
      const updated: Supplier = {
        ...current,
        ...input,
        name: input.name.trim(),
        phone: input.phone.trim(),
        address: input.address?.trim() || undefined,
        note: input.note?.trim() || undefined,
        updatedAt: now,
        revision: current.revision + 1,
      };
      await db.suppliers.put(updated);
      await logActivity({
        entityType: 'SUPPLIER',
        entityId: updated.id,
        action: 'SUPPLIER_UPDATED',
        actor,
        summary: `Cập nhật ${updated.type === 'MATERIAL' ? 'nhà cung cấp' : 'thầu phụ'} ${updated.name}`,
      });
      return updated;
    }
    const code = await nextCode('SUPPLIER', '');
    const created: Supplier = {
      id: newId(),
      code,
      ...input,
      name: input.name.trim(),
      phone: input.phone.trim(),
      address: input.address?.trim() || undefined,
      note: input.note?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await db.suppliers.add(created);
    await logActivity({
      entityType: 'SUPPLIER',
      entityId: created.id,
      action: 'SUPPLIER_CREATED',
      actor,
      summary: `Thêm ${created.type === 'MATERIAL' ? 'nhà cung cấp' : 'thầu phụ'} ${created.name} (${created.code})`,
    });
    return created;
  });
}

export interface WorkerInput {
  name: string;
  trade: Worker['trade'];
  employmentType: Worker['employmentType'];
  dailyRateVnd: number;
  phone: string;
  active?: boolean;
}

export async function saveWorker(actor: Actor, input: WorkerInput, id?: string): Promise<Worker> {
  assertAction(actor, 'worker.manage');
  assertRule(input.name.trim().length >= 2, 'Tên thợ cần có ít nhất 2 ký tự.');
  assertRule(input.dailyRateVnd > 0, 'Đơn giá ngày công phải lớn hơn 0.');
  return db.transaction('rw', [db.workers, db.documentSequences, db.activityLogs], async () => {
    const now = nowIso();
    if (id) {
      const current = await db.workers.get(id);
      if (!current) throw new NotFoundError('Không tìm thấy thợ cần cập nhật.');
      const updated: Worker = {
        ...current,
        ...input,
        name: input.name.trim(),
        phone: input.phone.trim(),
        active: input.active ?? current.active,
        updatedAt: now,
        revision: current.revision + 1,
      };
      await db.workers.put(updated);
      await logActivity({
        entityType: 'WORKER',
        entityId: updated.id,
        action: 'WORKER_UPDATED',
        actor,
        summary: `Cập nhật thợ ${updated.name} (${updated.code})`,
      });
      return updated;
    }
    const code = await nextCode('WORKER', '');
    const created: Worker = {
      id: newId(),
      code,
      ...input,
      name: input.name.trim(),
      phone: input.phone.trim(),
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await db.workers.add(created);
    await logActivity({
      entityType: 'WORKER',
      entityId: created.id,
      action: 'WORKER_CREATED',
      actor,
      summary: `Thêm thợ ${created.name} — ${created.trade}`,
    });
    return created;
  });
}

export interface TimesheetRowInput {
  workerId: string;
  days: number;
  note?: string;
}

/** Nhập ngày công theo ngày + dự án cho nhiều thợ trong một lần */
export async function saveTimesheets(
  actor: Actor,
  input: { projectId: string; date: string; rows: TimesheetRowInput[] },
  options: { operationId?: string } = {},
): Promise<Timesheet[]> {
  assertAction(actor, 'timesheet.manage');
  assertRule(!!input.projectId, 'Vui lòng chọn dự án ghi ngày công.');
  assertRule(!!input.date, 'Vui lòng chọn ngày ghi ngày công.');
  assertRule(input.rows.length > 0, 'Cần ít nhất một dòng thợ để ghi ngày công.');
  const valid = input.rows.filter((row) => row.days > 0);
  assertRule(valid.length > 0, 'Số công phải lớn hơn 0.');
  for (const row of valid) {
    assertRule(row.days <= 3, `Số công của một thợ trong ngày không nên vượt 3 (đang nhập ${row.days}).`);
  }
  return db.transaction('rw', [db.timesheets, db.workers, db.projects, db.activityLogs, db.operationReceipts], async () => {
    const project = await db.projects.get(input.projectId);
    if (!project) throw new NotFoundError('Không tìm thấy dự án ghi ngày công.');
    const now = nowIso();
    const created: Timesheet[] = [];
    for (const row of valid) {
      const worker = await db.workers.get(row.workerId);
      if (!worker) throw new NotFoundError('Có thợ không còn tồn tại trong danh sách. Hãy tải lại dữ liệu.');
      const record: Timesheet = {
        id: newId(),
        workerId: row.workerId,
        projectId: project.id,
        date: input.date,
        days: row.days,
        note: row.note?.trim() || undefined,
        createdAt: now,
        createdBy: actor.employeeId,
      };
      await db.timesheets.add(record);
      created.push(record);
    }
    const totalDays = created.reduce((sum, row) => sum + row.days, 0);
    await logActivity({
      entityType: 'PROJECT',
      entityId: project.id,
      projectId: project.id,
      action: 'TIMESHEETS_SAVED',
      actor,
      summary: `Ghi ${created.length} dòng ngày công (${totalDays} công) cho dự án ${project.code} ngày ${input.date}`,
      operationId: options.operationId,
    });
    return created;
  });
}

export async function deleteTimesheet(actor: Actor, id: string): Promise<void> {
  assertAction(actor, 'timesheet.manage');
  await db.transaction('rw', [db.timesheets, db.activityLogs], async () => {
    const row = await db.timesheets.get(id);
    if (!row) throw new NotFoundError('Không tìm thấy dòng ngày công.');
    await db.timesheets.delete(id);
    await logActivity({
      entityType: 'PROJECT',
      entityId: row.projectId,
      projectId: row.projectId,
      action: 'TIMESHEET_DELETED',
      actor,
      summary: `Xoá dòng ngày công ${row.date} (${row.days} công)`,
    });
  });
}
