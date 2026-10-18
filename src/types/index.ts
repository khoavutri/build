// Kiểu dữ liệu dùng chung toàn hệ thống BuildOne
export type Id = string;

export interface Actor {
  employeeId: Id;
  name: string;
  role: RoleId;
}

// ---------- Vai trò ----------
export type RoleId = 'MANAGER' | 'SALES' | 'SITE_MANAGER' | 'ACCOUNTANT';

export interface Employee {
  id: Id;
  code: string;
  name: string;
  role: RoleId;
  phone: string;
  title?: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  revision: number;
}

// ---------- Chủ nhà / khách hàng ----------
export interface Customer {
  id: Id;
  code: string;
  name: string;
  searchName: string;
  phone: string;
  normalizedPhone: string;
  address?: string;
  taxCode?: string;
  note?: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  revision: number;
}

// ---------- Dự án ----------
export type ProjectCategory = 'APARTMENT' | 'TOWNHOUSE' | 'VILLA' | 'OFFICE' | 'SHOP';
export type ProjectStatus = 'DESIGN' | 'QUOTING' | 'CONSTRUCTION' | 'ACCEPTANCE' | 'HANDOVER' | 'WARRANTY' | 'CLOSED';

export interface Project {
  id: Id;
  code: string;
  name: string;
  customerId: Id;
  category: ProjectCategory;
  status: ProjectStatus;
  address: string;
  contractValueVnd: number;
  startDate?: string;
  handoverDate?: string;
  managerId?: Id;
  designerId?: Id;
  note?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: Id;
  revision: number;
}

// ---------- Hạng mục thi công ----------
export type WorkItemStatus = 'TODO' | 'DOING' | 'DONE' | 'ACCEPTED';

export interface WorkItem {
  id: Id;
  projectId: Id;
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
  createdAt: string;
  updatedAt?: string;
  revision: number;
}

// ---------- Đợt thanh toán ----------
export interface Milestone {
  id: Id;
  projectId: Id;
  name: string;
  pct: number;
  amountVnd: number;
  dueDate?: string;
  paidVnd: number;
  seq: number;
}

// ---------- Báo giá ----------
export type QuoteStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

export interface Quote {
  id: Id;
  code: string;
  projectId: Id;
  version: number;
  status: QuoteStatus;
  discountPct: number;
  subtotalVnd: number;
  totalVnd: number;
  itemCount: number;
  createdAt: string;
  updatedAt?: string;
  sentAt?: string;
  approvedAt?: string;
  note?: string;
  createdBy?: Id;
  revision: number;
}

export interface QuoteSection {
  id: Id;
  quoteId: Id;
  name: string;
  seq: number;
}

export interface QuoteItem {
  id: Id;
  quoteId: Id;
  sectionId: Id;
  description: string;
  unit: string;
  quantity: number;
  materialCostVnd: number;
  laborCostVnd: number;
  sortOrder: number;
  revision: number;
}

// ---------- Vật tư & kho ----------
export interface Material {
  id: Id;
  code: string;
  name: string;
  searchName: string;
  unit: string;
  avgCostVnd: number;
  minQuantity?: number;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  revision: number;
}

export interface Stock {
  id: Id;
  warehouseId: string;
  materialId: Id;
  quantity: number;
}

export type PurchaseStatus = 'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrder {
  id: Id;
  code: string;
  supplierId: Id;
  projectId?: Id;
  status: PurchaseStatus;
  totalVnd: number;
  itemCount: number;
  createdAt: string;
  receivedAt?: string;
  note?: string;
  createdBy?: Id;
  revision: number;
}

export interface PurchaseOrderItem {
  id: Id;
  poId: Id;
  materialId: Id;
  quantity: number;
  unitCostVnd: number;
}

export interface MaterialIssue {
  id: Id;
  code: string;
  projectId: Id;
  totalVnd: number;
  itemCount: number;
  createdAt: string;
  note?: string;
  createdBy?: Id;
  createdByName?: string;
  revision: number;
}

export interface MaterialIssueItem {
  id: Id;
  issueId: Id;
  materialId: Id;
  quantity: number;
  unitCostVnd: number;
}

export type StockMovementType = 'RECEIPT' | 'ISSUE' | 'ADJUST';

export interface StockMovement {
  id: Id;
  materialId: Id;
  type: StockMovementType;
  quantity: number;
  unitCostVnd: number;
  warehouseId: string;
  projectId?: Id;
  refType: string;
  refId: string;
  at: string;
  note?: string;
}

// ---------- Nhà cung cấp & thầu phụ ----------
export type SupplierType = 'MATERIAL' | 'SUBCONTRACTOR';

export interface Supplier {
  id: Id;
  code: string;
  name: string;
  type: SupplierType;
  specialty?: string;
  phone: string;
  address?: string;
  rating: number;
  note?: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  revision: number;
}

// ---------- Nhân công ----------
export type Trade = 'MOC' | 'DIEN' | 'NUOC' | 'SON' | 'THACH_CAO' | 'PHU_HO' | 'KHAC';
export type EmploymentType = 'CORE' | 'CONTRACT';

export interface Worker {
  id: Id;
  code: string;
  name: string;
  trade: Trade;
  employmentType: EmploymentType;
  dailyRateVnd: number;
  phone: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  revision: number;
}

export interface Timesheet {
  id: Id;
  workerId: Id;
  projectId: Id;
  date: string;
  days: number;
  note?: string;
  createdAt: string;
  createdBy?: Id;
}

// ---------- Giao dịch tài chính ----------
export type TransactionType = 'IN' | 'OUT';
export type TransactionCategory =
  | 'MILESTONE'
  | 'OTHER_IN'
  | 'SUPPLIER'
  | 'SUBCONTRACTOR'
  | 'LABOR'
  | 'OTHER_OUT';
export type PaymentMethod = 'CASH' | 'TRANSFER';

export interface Transaction {
  id: Id;
  code: string;
  projectId?: Id;
  type: TransactionType;
  category: TransactionCategory;
  partyId?: Id;
  milestoneId?: Id;
  amountVnd: number;
  method: PaymentMethod;
  at: string;
  payerName?: string;
  receiverName?: string;
  note?: string;
  createdBy?: Id;
  createdByName?: string;
  revision: number;
}

// ---------- Nghiệm thu / bàn giao ----------
export type HandoverType = 'ACCEPTANCE' | 'HANDOVER';
export type HandoverResult = 'PASS' | 'PENDING';

export interface Handover {
  id: Id;
  code: string;
  projectId: Id;
  type: HandoverType;
  date: string;
  receiverName: string;
  result: HandoverResult;
  itemCount: number;
  note?: string;
  createdBy?: Id;
  createdAt: string;
  revision: number;
}

export interface HandoverItem {
  id: Id;
  handoverId: Id;
  description: string;
  ok: boolean;
  note?: string;
  sortOrder: number;
}

// ---------- Bảo hành / khiếu nại ----------
export type TicketSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type TicketStatus = 'NEW' | 'PROCESSING' | 'DONE';

export interface Ticket {
  id: Id;
  code: string;
  projectId: Id;
  description: string;
  severity: TicketSeverity;
  status: TicketStatus;
  createdAt: string;
  resolvedAt?: string;
  note?: string;
  createdBy?: Id;
  revision: number;
}

// ---------- Hệ thống ----------
export interface ActivityLog {
  id: Id;
  entityType: string;
  entityId: Id;
  projectId?: Id;
  action: string;
  actorId?: Id;
  actorName?: string;
  at: string;
  summary: string;
  changes?: Record<string, unknown>;
  operationId?: string;
}

export interface OperationReceipt {
  id: Id;
  operationType: string;
  resultEntityIds: Id[];
  completedAt: string;
  summary?: string;
}

export interface DocumentSequence {
  id: Id;
  documentType: string;
  period: string;
  nextValue: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface AppMetaRecord {
  key: string;
  value: unknown;
}
