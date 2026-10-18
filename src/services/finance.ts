import { db } from '../db/database';
import { newId } from '../utils/ids';
import type { Actor, PaymentMethod, Transaction, TransactionCategory } from '../types';
import { assertAction, logActivity, nextCode } from './core';
import { NotFoundError, assertRule } from './errors';

export interface ReceiptInput {
  projectId?: string;
  milestoneId?: string;
  amountVnd: number;
  method: PaymentMethod;
  at: string;
  payerName?: string;
  note?: string;
  category?: 'MILESTONE' | 'OTHER_IN';
}

/** Phiếu thu: bắt buộc gắn dự án hoặc ghi rõ là khoản thu khác; chặn thu vượt số tiền đợt */
export async function createReceipt(
  actor: Actor,
  input: ReceiptInput,
  options: { operationId?: string } = {},
): Promise<Transaction> {
  assertAction(actor, 'finance.receipt');
  assertRule(input.amountVnd > 0, 'Số tiền thu phải lớn hơn 0.');
  const category = input.category ?? (input.milestoneId ? 'MILESTONE' : 'OTHER_IN');
  assertRule(!!input.projectId || category === 'OTHER_IN', 'Phiếu thu theo đợt phải chọn dự án tương ứng.');
  return db.transaction(
    'rw',
    [db.transactions, db.projects, db.milestones, db.documentSequences, db.activityLogs, db.operationReceipts],
    async () => {
      const project = input.projectId ? await db.projects.get(input.projectId) : undefined;
      if (input.projectId && !project) throw new NotFoundError('Không tìm thấy dự án của phiếu thu.');
      let milestoneName = '';
      if (input.milestoneId) {
        const milestone = await db.milestones.get(input.milestoneId);
        if (!milestone) throw new NotFoundError('Không tìm thấy đợt thanh toán đã chọn.');
        assertRule(milestone.projectId === input.projectId, 'Đợt thanh toán không thuộc dự án đã chọn.');
        const remaining = milestone.amountVnd - milestone.paidVnd;
        assertRule(
          input.amountVnd <= remaining,
          `Đợt "${milestone.name}" chỉ còn ${remaining.toLocaleString('vi-VN')} ₫ chưa thu, không thể thu ${input.amountVnd.toLocaleString('vi-VN')} ₫.`,
          'MILESTONE_OVERPAY',
        );
        await db.milestones.put({ ...milestone, paidVnd: milestone.paidVnd + input.amountVnd });
        milestoneName = milestone.name;
      }
      const code = await nextCode('RECEIPT');
      const receipt: Transaction = {
        id: newId(),
        code,
        projectId: input.projectId,
        type: 'IN',
        category,
        amountVnd: Math.round(input.amountVnd),
        method: input.method,
        at: input.at,
        milestoneId: input.milestoneId,
        payerName: input.payerName?.trim() || undefined,
        receiverName: actor.name,
        note: input.note?.trim() || undefined,
        createdBy: actor.employeeId,
        createdByName: actor.name,
        revision: 1,
      };
      await db.transactions.add(receipt);      await logActivity({
        entityType: 'TRANSACTION',
        entityId: receipt.id,
        projectId: receipt.projectId,
        action: 'RECEIPT_CREATED',
        actor,
        summary: `Lập phiếu thu ${code}${project ? ` cho dự án ${project.code}` : ''}${milestoneName ? ` — ${milestoneName}` : ''}: ${receipt.amountVnd.toLocaleString('vi-VN')} ₫`,
        operationId: options.operationId,
      });
      return receipt;
    },
  );
}

export interface PaymentInput {
  projectId?: string;
  category: Exclude<TransactionCategory, 'MILESTONE' | 'OTHER_IN'>;
  partyId?: string;
  amountVnd: number;
  method: PaymentMethod;
  at: string;
  receiverName: string;
  note?: string;
}

/** Phiếu chi: NCC vật tư / thầu phụ / nhân công / khác */
export async function createPayment(
  actor: Actor,
  input: PaymentInput,
  options: { operationId?: string } = {},
): Promise<Transaction> {
  assertAction(actor, 'finance.payment');
  assertRule(input.amountVnd > 0, 'Số tiền chi phải lớn hơn 0.');
  assertRule(input.receiverName.trim().length >= 2, 'Vui lòng nhập tên người/đơn vị nhận tiền.');
  if (input.category === 'SUPPLIER' || input.category === 'SUBCONTRACTOR') {
    assertRule(!!input.partyId, 'Vui lòng chọn nhà cung cấp hoặc thầu phụ nhận tiền.');
  }
  return db.transaction('rw', [db.transactions, db.projects, db.suppliers, db.documentSequences, db.activityLogs, db.operationReceipts], async () => {
    if (input.projectId) {
      const project = await db.projects.get(input.projectId);
      if (!project) throw new NotFoundError('Không tìm thấy dự án của phiếu chi.');
    }
    if (input.partyId && (input.category === 'SUPPLIER' || input.category === 'SUBCONTRACTOR')) {
      const supplier = await db.suppliers.get(input.partyId);
      if (!supplier) throw new NotFoundError('Không tìm thấy nhà cung cấp/thầu phụ nhận tiền.');
    }
    const code = await nextCode('PAYMENT');
    const payment: Transaction = {
      id: newId(),
      code,
      projectId: input.projectId,
      type: 'OUT',
      category: input.category,
      partyId: input.partyId,
      amountVnd: Math.round(input.amountVnd),
      method: input.method,
      at: input.at,
      receiverName: input.receiverName.trim(),
      note: input.note?.trim() || undefined,
      createdBy: actor.employeeId,
      createdByName: actor.name,
      revision: 1,
    };
    await db.transactions.add(payment);
    await logActivity({
      entityType: 'TRANSACTION',
      entityId: payment.id,
      projectId: payment.projectId,
      action: 'PAYMENT_CREATED',
      actor,
      summary: `Lập phiếu chi ${code}: ${payment.amountVnd.toLocaleString('vi-VN')} ₫ cho ${payment.receiverName}`,
      operationId: options.operationId,
    });
    return payment;
  });
}

export interface CashBookRow {
  dateKey: string;
  inVnd: number;
  outVnd: number;
  netVnd: number;
  balanceVnd: number;
}

/** Sổ quỹ theo ngày: tổng thu, tổng chi, chênh lệch ngày và tồn lũy kế */
export function buildCashBook(transactions: Transaction[]): CashBookRow[] {
  const byDay = new Map<string, { inVnd: number; outVnd: number }>();
  for (const tx of transactions) {
    const key = tx.at.slice(0, 10);
    const row = byDay.get(key) ?? { inVnd: 0, outVnd: 0 };
    if (tx.type === 'IN') row.inVnd += tx.amountVnd;
    else row.outVnd += tx.amountVnd;
    byDay.set(key, row);
  }
  let balance = 0;
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateKey, row]) => {
      const netVnd = row.inVnd - row.outVnd;
      balance += netVnd;
      return { dateKey, inVnd: row.inVnd, outVnd: row.outVnd, netVnd, balanceVnd: balance };
    });
}
