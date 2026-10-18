import Dexie, { type EntityTable } from 'dexie';
import type {
  ActivityLog,
  AppMetaRecord,
  Customer,
  DocumentSequence,
  Employee,
  Handover,
  HandoverItem,
  Material,
  MaterialIssue,
  MaterialIssueItem,
  Milestone,
  OperationReceipt,
  Project,
  PurchaseOrder,
  PurchaseOrderItem,
  Quote,
  QuoteItem,
  QuoteSection,
  SettingRecord,
  Stock,
  StockMovement,
  Supplier,
  Ticket,
  Timesheet,
  Transaction,
  Worker,
  WorkItem,
} from '../types';

export const DB_NAME = 'build';
export const SCHEMA_VERSION = 1;
export const WAREHOUSE_ID = 'kho-tong';

type BuildDB = Dexie & {
  customers: EntityTable<Customer, 'id'>;
  employees: EntityTable<Employee, 'id'>;
  projects: EntityTable<Project, 'id'>;
  workItems: EntityTable<WorkItem, 'id'>;
  milestones: EntityTable<Milestone, 'id'>;
  quotes: EntityTable<Quote, 'id'>;
  quoteSections: EntityTable<QuoteSection, 'id'>;
  quoteItems: EntityTable<QuoteItem, 'id'>;
  materials: EntityTable<Material, 'id'>;
  stocks: EntityTable<Stock, 'id'>;
  purchaseOrders: EntityTable<PurchaseOrder, 'id'>;
  purchaseOrderItems: EntityTable<PurchaseOrderItem, 'id'>;
  materialIssues: EntityTable<MaterialIssue, 'id'>;
  materialIssueItems: EntityTable<MaterialIssueItem, 'id'>;
  stockMovements: EntityTable<StockMovement, 'id'>;
  suppliers: EntityTable<Supplier, 'id'>;
  workers: EntityTable<Worker, 'id'>;
  timesheets: EntityTable<Timesheet, 'id'>;
  transactions: EntityTable<Transaction, 'id'>;
  handovers: EntityTable<Handover, 'id'>;
  handoverItems: EntityTable<HandoverItem, 'id'>;
  tickets: EntityTable<Ticket, 'id'>;
  settings: EntityTable<SettingRecord, 'key'>;
  activityLogs: EntityTable<ActivityLog, 'id'>;
  operationReceipts: EntityTable<OperationReceipt, 'id'>;
  documentSequences: EntityTable<DocumentSequence, 'id'>;
  appMeta: EntityTable<AppMetaRecord, 'key'>;
};

export const db = new Dexie(DB_NAME) as BuildDB;

db.version(SCHEMA_VERSION).stores({
  customers: 'id, &code, searchName, normalizedPhone',
  employees: 'id, &code, role',
  projects: 'id, &code, customerId, status, category, startDate, handoverDate',
  workItems: 'id, projectId, zone, status, assignedTo, endDate',
  milestones: 'id, projectId, dueDate',
  quotes: 'id, &code, projectId, status',
  quoteSections: 'id, quoteId, seq',
  quoteItems: 'id, quoteId, sectionId',
  materials: 'id, &code, searchName',
  stocks: 'id, warehouseId, materialId, [warehouseId+materialId]',
  purchaseOrders: 'id, &code, supplierId, projectId, status, createdAt',
  purchaseOrderItems: 'id, poId, materialId',
  materialIssues: 'id, &code, projectId, createdAt',
  materialIssueItems: 'id, issueId, materialId',
  stockMovements: 'id, materialId, type, warehouseId, projectId, at, [materialId+at]',
  suppliers: 'id, &code, name, type',
  workers: 'id, &code, name, trade',
  timesheets: 'id, workerId, projectId, date',
  transactions: 'id, &code, projectId, type, category, partyId, milestoneId, at',
  handovers: 'id, &code, projectId, type, date',
  handoverItems: 'id, handoverId',
  tickets: 'id, &code, projectId, status, severity, createdAt',
  settings: 'key',
  activityLogs: 'id, [entityType+entityId], at, projectId, operationId',
  operationReceipts: 'id, operationType, completedAt',
  documentSequences: 'id, [documentType+period]',
  appMeta: 'key',
});

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name ?? '';
  return name === 'QuotaExceededError' || name === 'ConstraintError';
}
