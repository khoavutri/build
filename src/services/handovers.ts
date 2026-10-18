import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso, toDateKey } from '../utils/format';
import type { Actor, Handover, HandoverResult, HandoverType, Ticket, TicketSeverity, TicketStatus } from '../types';
import { assertAction, logActivity, nextCode } from './core';
import { NotFoundError, assertRule } from './errors';

export interface HandoverItemInput {
  description: string;
  ok: boolean;
  note?: string;
}

/** Biên bản nghiệm thu / bàn giao với checklist các hạng mục */
export async function createHandover(
  actor: Actor,
  input: { projectId: string; type: HandoverType; date: string; receiverName: string; result: HandoverResult; note?: string; items: HandoverItemInput[] },
  options: { operationId?: string } = {},
): Promise<Handover> {
  assertAction(actor, 'handover.manage');
  assertRule(!!input.projectId, 'Vui lòng chọn dự án lập biên bản.');
  assertRule(input.receiverName.trim().length >= 2, 'Vui lòng nhập tên người nhận bàn giao.');
  assertRule(input.items.length > 0, 'Biên bản cần ít nhất một mục kiểm tra.');
  return db.transaction(
    'rw',
    [db.handovers, db.handoverItems, db.projects, db.documentSequences, db.activityLogs, db.operationReceipts],
    async () => {
      const project = await db.projects.get(input.projectId);
      if (!project) throw new NotFoundError('Không tìm thấy dự án lập biên bản.');
      const code = await nextCode('HANDOVER');
      const handoverId = newId();
      const now = nowIso();
      const handover: Handover = {
        id: handoverId,
        code,
        projectId: project.id,
        type: input.type,
        date: input.date,
        receiverName: input.receiverName.trim(),
        result: input.result,
        itemCount: input.items.length,
        note: input.note?.trim() || undefined,
        createdBy: actor.employeeId,
        createdAt: now,
        revision: 1,
      };
      await db.handovers.add(handover);
      await db.handoverItems.bulkAdd(
        input.items.map((item, index) => ({
          id: newId(),
          handoverId,
          description: item.description.trim(),
          ok: item.ok,
          note: item.note?.trim() || undefined,
          sortOrder: index + 1,
        })),
      );
      // Đánh dấu hạng mục đã nghiệm thu khi biên bản đạt
      if (input.result === 'PASS') {
        const accepted = await db.workItems.filter((i) => i.projectId === project.id && i.status === 'DONE').toArray();
        for (const item of accepted) {
          await db.workItems.put({ ...item, status: 'ACCEPTED', updatedAt: now, revision: item.revision + 1 });
        }
        if (input.type === 'HANDOVER' && project.status !== 'WARRANTY' && project.status !== 'CLOSED') {
          await db.projects.put({ ...project, status: 'WARRANTY', handoverDate: project.handoverDate ?? input.date, updatedAt: now, revision: project.revision + 1 });
        }
      }
      await logActivity({
        entityType: 'PROJECT',
        entityId: project.id,
        projectId: project.id,
        action: input.type === 'HANDOVER' ? 'HANDOVER_CREATED' : 'ACCEPTANCE_CREATED',
        actor,
        summary: `Lập biên bản ${input.type === 'HANDOVER' ? 'bàn giao' : 'nghiệm thu'} ${code} (${input.items.length} mục, ${input.result === 'PASS' ? 'đạt' : 'chờ xử lý'})`,
        operationId: options.operationId,
      });
      return handover;
    },
  );
}

/** Prefill checklist từ các hạng mục đã xong/đã nghiệm thu của dự án */
export async function buildHandoverChecklist(projectId: string): Promise<HandoverItemInput[]> {
  const items = await db.workItems.where('projectId').equals(projectId).toArray();
  return items
    .filter((item) => item.status === 'DONE' || item.status === 'ACCEPTED')
    .sort((a, b) => a.zone.localeCompare(b.zone))
    .map((item) => ({
      description: `${item.zone} — ${item.name} (${item.quantity} ${item.unit})`,
      ok: true,
    }));
}

export async function createTicket(
  actor: Actor,
  input: { projectId: string; description: string; severity: TicketSeverity; createdAt?: string },
  options: { operationId?: string } = {},
): Promise<Ticket> {
  assertAction(actor, 'ticket.manage');
  assertRule(!!input.projectId, 'Vui lòng chọn dự án phát sinh bảo hành.');
  assertRule(input.description.trim().length >= 5, 'Mô tả nội dung bảo hành cần rõ ràng (ít nhất 5 ký tự).');
  return db.transaction('rw', [db.tickets, db.projects, db.documentSequences, db.activityLogs, db.operationReceipts], async () => {
    const project = await db.projects.get(input.projectId);
    if (!project) throw new NotFoundError('Không tìm thấy dự án.');
    const code = await nextCode('TICKET');
    const ticket: Ticket = {
      id: newId(),
      code,
      projectId: project.id,
      description: input.description.trim(),
      severity: input.severity,
      status: 'NEW',
      createdAt: input.createdAt ?? nowIso(),
      createdBy: actor.employeeId,
      revision: 1,
    };
    await db.tickets.add(ticket);
    await logActivity({
      entityType: 'PROJECT',
      entityId: project.id,
      projectId: project.id,
      action: 'TICKET_CREATED',
      actor,
      summary: `Mở ticket bảo hành ${code} cho dự án ${project.code} (mức độ ${input.severity})`,
      operationId: options.operationId,
    });
    return ticket;
  });
}

export async function updateTicket(
  actor: Actor,
  ticketId: string,
  patch: { status?: TicketStatus; note?: string; severity?: TicketSeverity },
): Promise<Ticket> {
  assertAction(actor, 'ticket.manage');
  return db.transaction('rw', [db.tickets, db.activityLogs], async () => {
    const ticket = await db.tickets.get(ticketId);
    if (!ticket) throw new NotFoundError('Không tìm thấy ticket bảo hành.');
    const status = patch.status ?? ticket.status;
    const now = nowIso();
    const updated: Ticket = {
      ...ticket,
      status,
      severity: patch.severity ?? ticket.severity,
      note: patch.note !== undefined ? patch.note.trim() || undefined : ticket.note,
      resolvedAt: status === 'DONE' ? ticket.resolvedAt ?? toDateKey(now) : undefined,
      revision: ticket.revision + 1,
    };
    await db.tickets.put(updated);
    await logActivity({
      entityType: 'PROJECT',
      entityId: ticket.projectId,
      projectId: ticket.projectId,
      action: 'TICKET_UPDATED',
      actor,
      summary: `Cập nhật ticket ${ticket.code} → ${status}`,
    });
    return updated;
  });
}
