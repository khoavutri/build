import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/format';
import { buildSearchName, normalizePhone } from '../utils/text';
import type { Actor, Customer } from '../types';
import { assertAction, assertRevision, logActivity, nextCode } from './core';
import { BusinessError, NotFoundError, assertRule } from './errors';

export interface CustomerInput {
  name: string;
  phone: string;
  address?: string;
  taxCode?: string;
  note?: string;
}

function validate(input: CustomerInput): void {
  assertRule(input.name.trim().length >= 2, 'Tên chủ nhà cần có ít nhất 2 ký tự.');
  assertRule(normalizePhone(input.phone).length >= 9, 'Số điện thoại chưa hợp lệ (cần ít nhất 9 chữ số).');
}

/** Cảnh báo trùng theo số điện thoại để tránh tạo hai chủ nhà cho cùng một người */
export async function findCustomerByPhone(phone: string): Promise<Customer | undefined> {
  const normalized = normalizePhone(phone);
  if (!normalized) return undefined;
  return db.customers.where('normalizedPhone').equals(normalized).first();
}

export async function createCustomer(
  actor: Actor,
  input: CustomerInput,
  options: { operationId?: string; allowDuplicatePhone?: boolean } = {},
): Promise<Customer> {
  assertAction(actor, 'customer.manage');
  validate(input);
  const duplicate = await findCustomerByPhone(input.phone);
  if (duplicate && !options.allowDuplicatePhone) {
    throw new BusinessError(
      `Số điện thoại ${input.phone} đã thuộc chủ nhà "${duplicate.name}" (${duplicate.code}). Chọn chủ nhà có sẵn hoặc xác nhận tạo trùng.`,
      'DUPLICATE_PHONE',
    );
  }
  return db.transaction('rw', [db.customers, db.documentSequences, db.activityLogs, db.operationReceipts], async () => {
    const code = await nextCode('CUSTOMER');
    const now = nowIso();
    const customer: Customer = {
      id: newId(),
      code,
      name: input.name.trim(),
      searchName: buildSearchName(input.name),
      phone: input.phone.trim(),
      normalizedPhone: normalizePhone(input.phone),
      address: input.address?.trim() || undefined,
      taxCode: input.taxCode?.trim() || undefined,
      note: input.note?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await db.customers.add(customer);
    await logActivity({
      entityType: 'CUSTOMER',
      entityId: customer.id,
      action: 'CUSTOMER_CREATED',
      actor,
      summary: `Thêm chủ nhà ${customer.name} (${customer.code})`,
      operationId: options.operationId,
    });
    return customer;
  });
}

export async function updateCustomer(
  actor: Actor,
  id: string,
  input: Partial<CustomerInput> & { active?: boolean },
  expectedRevision?: number,
): Promise<Customer> {
  assertAction(actor, 'customer.manage');
  return db.transaction('rw', [db.customers, db.activityLogs], async () => {
    const current = await db.customers.get(id);
    if (!current) throw new NotFoundError('Không tìm thấy chủ nhà cần cập nhật.');
    assertRevision(current.revision, expectedRevision);
    const name = input.name?.trim() || current.name;
    if (input.phone) validate({ name, phone: input.phone });
    const updated: Customer = {
      ...current,
      name,
      searchName: buildSearchName(name),
      phone: input.phone?.trim() ?? current.phone,
      normalizedPhone: input.phone ? normalizePhone(input.phone) : current.normalizedPhone,
      address: input.address !== undefined ? input.address.trim() || undefined : current.address,
      taxCode: input.taxCode !== undefined ? input.taxCode.trim() || undefined : current.taxCode,
      note: input.note !== undefined ? input.note.trim() || undefined : current.note,
      active: input.active ?? current.active,
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };
    await db.customers.put(updated);
    await logActivity({
      entityType: 'CUSTOMER',
      entityId: id,
      action: 'CUSTOMER_UPDATED',
      actor,
      summary: `Cập nhật chủ nhà ${updated.name} (${updated.code})`,
    });
    return updated;
  });
}

/** Tìm chủ nhà không dấu theo tên hoặc số điện thoại */
export async function searchCustomers(keyword: string, limit = 8): Promise<Customer[]> {
  const kw = buildSearchName(keyword);
  const digits = normalizePhone(keyword);
  const rows: Customer[] = [];
  if (kw.length >= 2) {
    const found = await db.customers.where('searchName').startsWith(kw).limit(limit).toArray();
    rows.push(...found);
  }
  if (digits.length >= 3) {
    const byPhone = await db.customers.where('normalizedPhone').startsWith(digits).limit(limit).toArray();
    for (const row of byPhone) if (!rows.some((r) => r.id === row.id)) rows.push(row);
  }
  return rows.slice(0, limit);
}
