import type {
  EmploymentType,
  HandoverResult,
  HandoverType,
  PaymentMethod,
  ProjectCategory,
  ProjectStatus,
  PurchaseStatus,
  QuoteStatus,
  RoleId,
  StockMovementType,
  TicketSeverity,
  TicketStatus,
  Trade,
  TransactionCategory,
  WorkItemStatus,
} from '../types';

export interface StatusMeta {
  label: string;
  color: string;
}

export const ROLE_LABEL: Record<RoleId, string> = {
  MANAGER: 'Giám đốc',
  SALES: 'Kinh doanh & thiết kế',
  SITE_MANAGER: 'Chỉ huy trưởng',
  ACCOUNTANT: 'Kế toán',
};

export const PROJECT_STATUS_META: Record<ProjectStatus, StatusMeta> = {
  DESIGN: { label: 'Đang thiết kế', color: 'purple' },
  QUOTING: { label: 'Báo giá', color: 'gold' },
  CONSTRUCTION: { label: 'Đang thi công', color: 'geekblue' },
  ACCEPTANCE: { label: 'Nghiệm thu', color: 'cyan' },
  HANDOVER: { label: 'Bàn giao', color: 'green' },
  WARRANTY: { label: 'Bảo hành', color: 'orange' },
  CLOSED: { label: 'Đã kết thúc', color: 'default' },
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = ['DESIGN', 'QUOTING', 'CONSTRUCTION', 'ACCEPTANCE', 'HANDOVER', 'WARRANTY', 'CLOSED'];

export const PROJECT_CATEGORY_META: Record<ProjectCategory, StatusMeta> = {
  APARTMENT: { label: 'Căn hộ', color: 'blue' },
  TOWNHOUSE: { label: 'Nhà phố', color: 'geekblue' },
  VILLA: { label: 'Biệt thự', color: 'purple' },
  OFFICE: { label: 'Văn phòng', color: 'cyan' },
  SHOP: { label: 'Shop', color: 'magenta' },
};

export const WORK_ITEM_STATUS_META: Record<WorkItemStatus, StatusMeta> = {
  TODO: { label: 'Chưa làm', color: 'default' },
  DOING: { label: 'Đang làm', color: 'geekblue' },
  DONE: { label: 'Xong', color: 'green' },
  ACCEPTED: { label: 'Đã nghiệm thu', color: 'success' },
};

export const QUOTE_STATUS_META: Record<QuoteStatus, StatusMeta> = {
  DRAFT: { label: 'Nháp', color: 'default' },
  SENT: { label: 'Đã gửi', color: 'gold' },
  APPROVED: { label: 'Khách duyệt', color: 'success' },
  REJECTED: { label: 'Từ chối', color: 'red' },
  SUPERSEDED: { label: 'Thay thế', color: 'default' },
};

export const PURCHASE_STATUS_META: Record<PurchaseStatus, StatusMeta> = {
  DRAFT: { label: 'Nháp', color: 'default' },
  ORDERED: { label: 'Đã đặt', color: 'blue' },
  RECEIVED: { label: 'Đã nhận', color: 'green' },
  CANCELLED: { label: 'Huỷ', color: 'red' },
};

export const MOVEMENT_TYPE_META: Record<StockMovementType, StatusMeta> = {
  RECEIPT: { label: 'Nhập kho', color: 'green' },
  ISSUE: { label: 'Xuất công trình', color: 'geekblue' },
  ADJUST: { label: 'Điều chỉnh', color: 'orange' },
};

export const SUPPLIER_TYPE_META = {
  MATERIAL: { label: 'NCC vật tư', color: 'blue' },
  SUBCONTRACTOR: { label: 'Thầu phụ', color: 'purple' },
} as const;

export const SPECIALTY_LABEL: Record<string, string> = {
  DIEN: 'Điện',
  NUOC: 'Nước',
  SON: 'Sơn',
  MOC: 'Mộc',
  DA: 'Đá',
  THACH_CAO: 'Thạch cao',
  KHAC: 'Khác',
};

export const TRADE_LABEL: Record<Trade, string> = {
  MOC: 'Mộc',
  DIEN: 'Điện',
  NUOC: 'Nước',
  SON: 'Sơn',
  THACH_CAO: 'Thạch cao',
  PHU_HO: 'Phụ hồ',
  KHAC: 'Khác',
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  CORE: 'Cơ hữu',
  CONTRACT: 'Khoán',
};

export const TRANSACTION_CATEGORY_LABEL: Record<TransactionCategory, string> = {
  MILESTONE: 'Thu theo đợt',
  OTHER_IN: 'Thu khác',
  SUPPLIER: 'NCC vật tư',
  SUBCONTRACTOR: 'Thầu phụ',
  LABOR: 'Nhân công',
  OTHER_OUT: 'Chi khác',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
};

export const HANDOVER_TYPE_LABEL: Record<HandoverType, string> = {
  ACCEPTANCE: 'Nghiệm thu',
  HANDOVER: 'Bàn giao',
};

export const HANDOVER_RESULT_META: Record<HandoverResult, StatusMeta> = {
  PASS: { label: 'Đạt', color: 'success' },
  PENDING: { label: 'Chờ xử lý', color: 'gold' },
};

export const TICKET_SEVERITY_META: Record<TicketSeverity, StatusMeta> = {
  LOW: { label: 'Thấp', color: 'default' },
  MEDIUM: { label: 'Vừa', color: 'gold' },
  HIGH: { label: 'Cao', color: 'red' },
};

export const TICKET_STATUS_META: Record<TicketStatus, StatusMeta> = {
  NEW: { label: 'Mới', color: 'red' },
  PROCESSING: { label: 'Đang xử lý', color: 'geekblue' },
  DONE: { label: 'Đã xong', color: 'success' },
};

export function statusMeta(meta: Record<string, StatusMeta>, key?: string | null): StatusMeta {
  if (!key) return { label: '—', color: 'default' };
  return meta[key] ?? { label: key, color: 'default' };
}

/** Trạng thái hiển thị của một đợt thanh toán */
export function milestoneState(amountVnd: number, paidVnd: number, dueDate?: string): { label: string; color: string } {
  if (paidVnd >= amountVnd && amountVnd > 0) return { label: 'Đã thu', color: 'success' };
  const overdue = dueDate ? new Date(dueDate).getTime() < Date.now() : false;
  if (overdue) return { label: 'Quá hạn', color: 'red' };
  if (paidVnd > 0) return { label: 'Thu một phần', color: 'gold' };
  return { label: 'Chờ thu', color: 'default' };
}
