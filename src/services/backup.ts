import { db, DB_NAME, SCHEMA_VERSION } from '../db/database';
import { nowIso } from '../utils/format';
import type { Actor } from '../types';
import { BusinessError, assertRule } from './errors';
import { assertAction, logActivity } from './core';
import { seedDatabase, SEED_VERSION } from '../db/seed';

export const APP_VERSION = '1.0.0';

export interface BackupFile {
  schemaVersion: number;
  appVersion: string;
  seedVersion: string;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(actor: Actor): Promise<BackupFile> {
  assertAction(actor, 'settings.manage');
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    if (table.name === 'operationReceipts') continue;
    tables[table.name] = (await table.toArray()) as Array<Record<string, unknown>>;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    seedVersion: SEED_VERSION,
    exportedAt: nowIso(),
    tables,
  };
}

export interface BackupValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary?: { tables: number; records: number; exportedAt?: string; schemaVersion?: number };
}

const REFERENCE_CHECKS: Array<{ table: string; field: string; target: string; label: string }> = [
  { table: 'projects', field: 'customerId', target: 'customers', label: 'chủ nhà của dự án' },
  { table: 'workItems', field: 'projectId', target: 'projects', label: 'dự án của hạng mục' },
  { table: 'milestones', field: 'projectId', target: 'projects', label: 'dự án của đợt thanh toán' },
  { table: 'quotes', field: 'projectId', target: 'projects', label: 'dự án của báo giá' },
  { table: 'quoteSections', field: 'quoteId', target: 'quotes', label: 'báo giá của nhóm hạng mục' },
  { table: 'quoteItems', field: 'quoteId', target: 'quotes', label: 'báo giá của dòng hạng mục' },
  { table: 'quoteItems', field: 'sectionId', target: 'quoteSections', label: 'nhóm của dòng hạng mục' },
  { table: 'purchaseOrderItems', field: 'poId', target: 'purchaseOrders', label: 'phiếu mua của dòng vật tư' },
  { table: 'materialIssueItems', field: 'issueId', target: 'materialIssues', label: 'phiếu xuất của dòng vật tư' },
  { table: 'materialIssues', field: 'projectId', target: 'projects', label: 'dự án nhận vật tư' },
  { table: 'timesheets', field: 'projectId', target: 'projects', label: 'dự án của ngày công' },
  { table: 'timesheets', field: 'workerId', target: 'workers', label: 'thợ của ngày công' },
  { table: 'transactions', field: 'projectId', target: 'projects', label: 'dự án của giao dịch' },
  { table: 'handovers', field: 'projectId', target: 'projects', label: 'dự án của biên bản' },
  { table: 'handoverItems', field: 'handoverId', target: 'handovers', label: 'biên bản của mục kiểm tra' },
  { table: 'tickets', field: 'projectId', target: 'projects', label: 'dự án của ticket bảo hành' },
];

export function validateBackupShape(raw: unknown): BackupValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Tệp không phải JSON bản sao lưu hợp lệ.'], warnings };
  }
  const file = raw as Partial<BackupFile>;
  if (typeof file.schemaVersion !== 'number') errors.push('Thiếu thông tin phiên bản lược đồ dữ liệu.');
  else if (file.schemaVersion > SCHEMA_VERSION) {
    errors.push(`Bản sao lưu dùng lược đồ v${file.schemaVersion} mới hơn phiên bản ứng dụng (v${SCHEMA_VERSION}). Hãy cập nhật ứng dụng trước.`);
  }
  if (!file.tables || typeof file.tables !== 'object') errors.push('Thiếu danh sách bảng dữ liệu.');
  if (errors.length > 0) return { ok: false, errors, warnings };

  const tables = file.tables as Record<string, unknown[]>;
  let records = 0;
  for (const [name, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows)) {
      errors.push(`Bảng "${name}" không đúng định dạng mảng.`);
      continue;
    }
    records += rows.length;
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        errors.push(`Bảng "${name}" có bản ghi không hợp lệ.`);
        break;
      }
      const id = (row as { id?: string; key?: string }).id ?? (row as { key?: string }).key;
      if (!id) {
        errors.push(`Bảng "${name}" có bản ghi thiếu ID/khóa.`);
        break;
      }
      if (ids.has(id)) {
        errors.push(`Bảng "${name}" có ID trùng "${id}".`);
        break;
      }
      ids.add(id);
    }
  }
  for (const check of REFERENCE_CHECKS) {
    const rows = tables[check.table];
    if (!rows) continue;
    const targets = new Set((tables[check.target] ?? []).map((r) => (r as { id?: string }).id).filter(Boolean) as string[]);
    let missing = 0;
    for (const row of rows) {
      const value = (row as Record<string, unknown>)[check.field];
      if (typeof value === 'string' && value.length > 0 && !targets.has(value)) missing += 1;
    }
    if (missing > 0) errors.push(`Thiếu liên kết: ${missing} bản ghi "${check.table}" tham chiếu ${check.label} không tồn tại trong tệp.`);
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: { tables: Object.keys(tables).length, records, exportedAt: file.exportedAt, schemaVersion: file.schemaVersion },
  };
}

export async function importBackup(actor: Actor, raw: unknown): Promise<{ importedTables: number; importedRecords: number }> {
  assertAction(actor, 'settings.manage');
  const validation = validateBackupShape(raw);
  if (!validation.ok) {
    throw new BusinessError(`Không thể nhập dữ liệu: ${validation.errors[0]}`, 'INVALID_BACKUP');
  }
  return db.transaction('rw', db.tables, async () => {
    const file = raw as BackupFile;
    for (const table of db.tables) {
      await table.clear();
    }
    let importedRecords = 0;
    for (const [name, rows] of Object.entries(file.tables)) {
      const table = db.table(name);
      if (!table) continue;
      await table.bulkAdd(rows as unknown[]);
      importedRecords += rows.length;
    }
    await db.appMeta.put({ key: 'seedVersion', value: SEED_VERSION });
    await db.appMeta.put({ key: 'lastImportAt', value: nowIso() });
    await logActivity({
      entityType: 'SYSTEM',
      entityId: 'backup',
      action: 'BACKUP_IMPORTED',
      actor,
      summary: `Khôi phục bản sao lưu (${importedRecords} bản ghi)`,
    });
    return { importedTables: Object.keys(file.tables).length, importedRecords };
  });
}

export async function readBackupFile(file: File): Promise<unknown> {
  assertRule(file.size <= 30 * 1024 * 1024, 'Tệp sao lưu vượt giới hạn 30 MB cho phép.');
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new BusinessError('Tệp sao lưu không phải JSON hợp lệ. Kiểm tra lại tệp trước khi nhập.', 'INVALID_BACKUP');
  }
}

/**
 * Khôi phục dữ liệu mẫu: xoá toàn bộ bản ghi hiện có rồi tạo lại bộ dữ liệu mẫu.
 * Không xoá database để tránh đóng kết nối đang phục vụ các truy vấn sống trên giao diện.
 */
export async function resetInitialData(actor: Actor): Promise<void> {
  assertAction(actor, 'settings.manage');
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }
  });
  await seedDatabase();
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number; percentage: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;
  const quota = estimate.quota ?? 0;
  return { usage, quota, percentage: quota > 0 ? (usage / quota) * 100 : 0 };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function backupFileName(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `buildone-backup-${stamp}.json`;
}

export async function downloadBackup(actor: Actor): Promise<string> {
  const backup = await exportBackup(actor);
  const name = backupFileName();
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return name;
}

export async function currentDbInfo(): Promise<{ schemaVersion: number; seedVersion?: string; seededAt?: string; dbName: string }> {
  const seedVersion = await db.appMeta.get('seedVersion');
  const seededAt = await db.appMeta.get('seededAt');
  return {
    schemaVersion: SCHEMA_VERSION,
    seedVersion: (seedVersion?.value as string) ?? undefined,
    seededAt: (seededAt?.value as string) ?? undefined,
    dbName: DB_NAME,
  };
}
