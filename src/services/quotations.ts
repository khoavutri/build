import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/format';
import { quoteTotals } from '../utils/money';
import type { Actor, Quote, QuoteItem, QuoteSection } from '../types';
import { assertAction, assertRevision, getOperationReceipt, logActivity, nextCode, saveOperationReceipt } from './core';
import { NotFoundError, assertRule } from './errors';
import { applyContractValue } from './projects';

/** Nhóm hạng mục gợi ý khi lập báo giá thi công nội thất */
export const QUOTE_SECTION_TEMPLATES = [
  'Tháo dỡ & vệ sinh',
  'Điện nước',
  'Trần & thạch cao',
  'Sơn & hoàn thiện',
  'Sàn & ốp lát',
  'Nội thất gỗ',
  'Đá & mặt bàn',
  'Thiết bị & khác',
];

export interface SaveSectionInput {
  id?: string;
  name: string;
}

export interface SaveQuoteItemInput {
  id?: string;
  sectionId: string;
  description: string;
  unit: string;
  quantity: number;
  materialCostVnd: number;
  laborCostVnd: number;
}

export interface SaveQuoteDraftInput {
  sections: SaveSectionInput[];
  items: SaveQuoteItemInput[];
  discountPct: number;
  note?: string;
  expectedRevision?: number;
}

function validateItems(items: SaveQuoteItemInput[], sectionIds: Set<string>): void {
  assertRule(items.length > 0, 'Báo giá cần ít nhất một dòng hạng mục trước khi lưu.');
  for (const item of items) {
    assertRule(item.description.trim().length >= 2, 'Mỗi dòng báo giá cần có mô tả nội dung.');
    assertRule(item.quantity > 0, `Khối lượng của "${item.description}" phải lớn hơn 0.`);
    assertRule(item.materialCostVnd >= 0 && item.laborCostVnd >= 0, `Đơn giá của "${item.description}" không được âm.`);
    assertRule(sectionIds.has(item.sectionId), 'Có dòng báo giá chưa thuộc nhóm hạng mục nào. Hãy tải lại dữ liệu.');
  }
}

export async function createQuote(
  actor: Actor,
  projectId: string,
  input: { note?: string; discountPct?: number },
  options: { operationId?: string } = {},
): Promise<Quote> {
  assertAction(actor, 'quote.draft');
  return db.transaction(
    'rw',
    [db.quotes, db.projects, db.documentSequences, db.activityLogs, db.operationReceipts],
    async () => {
      const existingReceipt = await getOperationReceipt(options.operationId);
      if (existingReceipt) {
        const found = await db.quotes.get(existingReceipt.resultEntityIds[0]);
        if (found) return found;
      }
      const project = await db.projects.get(projectId);
      if (!project) throw new NotFoundError('Không tìm thấy dự án để lập báo giá.');
      const versions = await db.quotes.where('projectId').equals(projectId).toArray();
      const version = versions.length === 0 ? 1 : Math.max(...versions.map((q) => q.version)) + 1;
      const code = await nextCode('QUOTE');
      const now = nowIso();
      const quote: Quote = {
        id: newId(),
        code,
        projectId,
        version,
        status: 'DRAFT',
        discountPct: input.discountPct ?? 0,
        subtotalVnd: 0,
        totalVnd: 0,
        itemCount: 0,
        createdAt: now,
        updatedAt: now,
        note: input.note?.trim() || undefined,
        createdBy: actor.employeeId,
        revision: 1,
      };
      await db.quotes.add(quote);
      await logActivity({
        entityType: 'PROJECT',
        entityId: projectId,
        projectId,
        action: 'QUOTE_CREATED',
        actor,
        summary: `Tạo báo giá ${code} v${version} cho dự án ${project.code}`,
        operationId: options.operationId,
      });
      await saveOperationReceipt(options.operationId, 'createQuote', [quote.id]);
      return quote;
    },
  );
}

export async function saveQuoteDraft(actor: Actor, quoteId: string, input: SaveQuoteDraftInput): Promise<Quote> {
  assertAction(actor, 'quote.draft');
  return db.transaction('rw', [db.quotes, db.quoteSections, db.quoteItems, db.activityLogs], async () => {
    const quote = await db.quotes.get(quoteId);
    if (!quote) throw new NotFoundError('Không tìm thấy báo giá.');
    assertRule(quote.status === 'DRAFT', 'Chỉ sửa trực tiếp báo giá nháp. Báo giá đã gửi cần tạo phiên bản mới.', 'INVALID_STATE');
    assertRevision(quote.revision, input.expectedRevision);
    assertRule(input.sections.length > 0, 'Báo giá cần ít nhất một nhóm hạng mục.');
    assertRule(input.discountPct >= 0 && input.discountPct <= 100, 'Chiết khấu phải trong khoảng 0–100%.');

    // Chuẩn hóa nhóm: nhóm mới dùng id tạm do trình soạn thảo sinh
    const sectionIds = new Map<string, string>();
    const savedSections: QuoteSection[] = [];
    for (const [index, section] of input.sections.entries()) {
      assertRule(section.name.trim().length >= 2, 'Tên nhóm hạng mục cần có ít nhất 2 ký tự.');
      const id = section.id && !section.id.startsWith('tmp-') ? section.id : newId();
      sectionIds.set(section.id ?? id, id);
      sectionIds.set(id, id);
      savedSections.push({ id, quoteId, name: section.name.trim(), seq: index + 1 });
    }
    validateItems(input.items, new Set(savedSections.map((s) => s.id)));

    await db.quoteSections.where('quoteId').equals(quoteId).delete();
    await db.quoteItems.where('quoteId').equals(quoteId).delete();
    await db.quoteSections.bulkAdd(savedSections);

    const items: QuoteItem[] = input.items.map((item, index) => ({
      id: item.id && !item.id.startsWith('tmp-') ? item.id : newId(),
      quoteId,
      sectionId: sectionIds.get(item.sectionId) ?? savedSections[0].id,
      description: item.description.trim(),
      unit: item.unit.trim() || 'm²',
      quantity: item.quantity,
      materialCostVnd: Math.round(item.materialCostVnd),
      laborCostVnd: Math.round(item.laborCostVnd),
      sortOrder: index + 1,
      revision: 1,
    }));
    await db.quoteItems.bulkAdd(items);

    const totals = quoteTotals(items, input.discountPct);
    const updated: Quote = {
      ...quote,
      discountPct: input.discountPct,
      subtotalVnd: totals.subtotalVnd,
      totalVnd: totals.totalVnd,
      itemCount: items.length,
      note: input.note !== undefined ? input.note.trim() || undefined : quote.note,
      updatedAt: nowIso(),
      revision: quote.revision + 1,
    };
    await db.quotes.put(updated);
    await logActivity({
      entityType: 'PROJECT',
      entityId: quote.projectId,
      projectId: quote.projectId,
      action: 'QUOTE_SAVED',
      actor,
      summary: `Lưu báo giá ${quote.code} v${quote.version} — ${items.length} dòng, tổng ${totals.totalVnd.toLocaleString('vi-VN')} ₫`,
    });
    return updated;
  });
}

export async function sendQuote(actor: Actor, quoteId: string): Promise<Quote> {
  assertAction(actor, 'quote.send');
  return db.transaction('rw', [db.quotes, db.quoteItems, db.projects, db.activityLogs], async () => {
    const quote = await db.quotes.get(quoteId);
    if (!quote) throw new NotFoundError('Không tìm thấy báo giá.');
    assertRule(quote.status === 'DRAFT', 'Chỉ gửi được báo giá đang ở trạng thái nháp.', 'INVALID_STATE');
    const itemCount = await db.quoteItems.where('quoteId').equals(quoteId).count();
    assertRule(itemCount > 0, 'Báo giá chưa có dòng nào. Hãy nhập hạng mục trước khi gửi khách.');
    const now = nowIso();
    const updated: Quote = { ...quote, status: 'SENT', sentAt: now, updatedAt: now, revision: quote.revision + 1 };
    await db.quotes.put(updated);
    const project = await db.projects.get(quote.projectId);
    if (project && (project.status === 'DESIGN' || project.status === 'QUOTING')) {
      await db.projects.put({ ...project, status: 'QUOTING', updatedAt: now, revision: project.revision + 1 });
    }
    await logActivity({
      entityType: 'PROJECT',
      entityId: quote.projectId,
      projectId: quote.projectId,
      action: 'QUOTE_SENT',
      actor,
      summary: `Gửi báo giá ${quote.code} v${quote.version} cho chủ nhà`,
    });
    return updated;
  });
}

export async function recordQuoteApproval(
  actor: Actor,
  quoteId: string,
  input: { applyToContract?: boolean } = {},
): Promise<Quote> {
  assertAction(actor, 'quote.approve');
  return db.transaction('rw', [db.quotes, db.projects, db.activityLogs, db.operationReceipts], async () => {
    const quote = await db.quotes.get(quoteId);
    if (!quote) throw new NotFoundError('Không tìm thấy báo giá.');
    assertRule(quote.status === 'SENT' || quote.status === 'DRAFT', 'Chỉ ghi nhận duyệt cho báo giá nháp hoặc đã gửi.', 'INVALID_STATE');
    const now = nowIso();
    const updated: Quote = { ...quote, status: 'APPROVED', approvedAt: now, updatedAt: now, revision: quote.revision + 1 };
    await db.quotes.put(updated);
    await logActivity({
      entityType: 'PROJECT',
      entityId: quote.projectId,
      projectId: quote.projectId,
      action: 'QUOTE_APPROVED',
      actor,
      summary: `Khách duyệt báo giá ${quote.code} v${quote.version} (${quote.totalVnd.toLocaleString('vi-VN')} ₫)`,
    });
    if (input.applyToContract) {
      await applyContractValue(quote.projectId, quote.totalVnd, quote.code);
    }
    return updated;
  });
}

export async function rejectQuote(actor: Actor, quoteId: string, reason?: string): Promise<Quote> {
  assertAction(actor, 'quote.approve');
  return db.transaction('rw', [db.quotes, db.activityLogs], async () => {
    const quote = await db.quotes.get(quoteId);
    if (!quote) throw new NotFoundError('Không tìm thấy báo giá.');
    assertRule(quote.status !== 'APPROVED', 'Báo giá đã được duyệt, không thể chuyển sang từ chối.', 'INVALID_STATE');
    const note = [quote.note, reason].filter(Boolean).join(' — ');
    const updated: Quote = { ...quote, status: 'REJECTED', note: note || undefined, updatedAt: nowIso(), revision: quote.revision + 1 };
    await db.quotes.put(updated);
    await logActivity({
      entityType: 'PROJECT',
      entityId: quote.projectId,
      projectId: quote.projectId,
      action: 'QUOTE_REJECTED',
      actor,
      summary: `Khách từ chối báo giá ${quote.code} v${quote.version}`,
    });
    return updated;
  });
}

/** Tạo phiên bản mới kế thừa toàn bộ nội dung; bản cũ giữ để tra cứu */
export async function supersedeQuote(actor: Actor, quoteId: string): Promise<Quote> {
  assertAction(actor, 'quote.draft');
  return db.transaction('rw', [db.quotes, db.quoteSections, db.quoteItems, db.activityLogs], async () => {
    const quote = await db.quotes.get(quoteId);
    if (!quote) throw new NotFoundError('Không tìm thấy báo giá.');
    assertRule(quote.status !== 'SUPERSEDED', 'Báo giá này đã bị thay thế bởi phiên bản khác.', 'INVALID_STATE');
    const sections = await db.quoteSections.where('quoteId').equals(quoteId).toArray();
    const items = await db.quoteItems.where('quoteId').equals(quoteId).toArray();
    const code = await nextCode('QUOTE');
    const now = nowIso();
    const newQuote: Quote = {
      ...quote,
      id: newId(),
      code,
      version: quote.version + 1,
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
      sentAt: undefined,
      approvedAt: undefined,
      revision: 1,
    };
    await db.quotes.add(newQuote);
    const sectionMap = new Map<string, string>();
    for (const section of sections.sort((a, b) => a.seq - b.seq)) {
      const id = newId();
      sectionMap.set(section.id, id);
      await db.quoteSections.add({ ...section, id, quoteId: newQuote.id });
    }
    for (const item of items.sort((a, b) => a.sortOrder - b.sortOrder)) {
      await db.quoteItems.add({
        ...item,
        id: newId(),
        quoteId: newQuote.id,
        sectionId: sectionMap.get(item.sectionId) ?? '',
      });
    }
    await db.quotes.put({ ...quote, status: 'SUPERSEDED', updatedAt: now, revision: quote.revision + 1 });
    await logActivity({
      entityType: 'PROJECT',
      entityId: quote.projectId,
      projectId: quote.projectId,
      action: 'QUOTE_SUPERSEDED',
      actor,
      summary: `Tạo phiên bản ${code} v${newQuote.version} từ ${quote.code} v${quote.version}`,
    });
    return newQuote;
  });
}

export async function discardQuoteDraft(actor: Actor, quoteId: string): Promise<void> {
  assertAction(actor, 'quote.draft');
  await db.transaction('rw', [db.quotes, db.quoteSections, db.quoteItems, db.activityLogs], async () => {
    const quote = await db.quotes.get(quoteId);
    if (!quote) throw new NotFoundError('Không tìm thấy báo giá.');
    assertRule(quote.status === 'DRAFT', 'Chỉ xoá được báo giá nháp chưa gửi khách.', 'INVALID_STATE');
    await db.quoteSections.where('quoteId').equals(quoteId).delete();
    await db.quoteItems.where('quoteId').equals(quoteId).delete();
    await db.quotes.delete(quoteId);
    await logActivity({
      entityType: 'PROJECT',
      entityId: quote.projectId,
      projectId: quote.projectId,
      action: 'QUOTE_DISCARDED',
      actor,
      summary: `Xoá báo giá nháp ${quote.code} v${quote.version}`,
    });
  });
}
