import type { RoleId } from '../types';
import { PermissionError } from './errors';

/** Tập hành động nghiệp vụ cần kiểm tra quyền tại tầng service */
export type Action =
  | 'customer.manage'
  | 'project.manage'
  | 'project.statusChange'
  | 'workItem.manage'
  | 'quote.draft'
  | 'quote.send'
  | 'quote.approve'
  | 'material.purchase'
  | 'material.issue'
  | 'material.adjust'
  | 'supplier.manage'
  | 'supplier.pay'
  | 'worker.manage'
  | 'timesheet.manage'
  | 'finance.receipt'
  | 'finance.payment'
  | 'handover.manage'
  | 'ticket.manage'
  | 'report.financial'
  | 'settings.manage';

const MANAGEMENT: Action[] = ['customer.manage', 'project.manage', 'quote.draft', 'quote.send'];

/** Giám đốc: toàn quyền */
const ALL: Action[] = [
  ...MANAGEMENT,
  'project.statusChange',
  'workItem.manage',
  'quote.approve',
  'material.purchase',
  'material.issue',
  'material.adjust',
  'supplier.manage',
  'supplier.pay',
  'worker.manage',
  'timesheet.manage',
  'finance.receipt',
  'finance.payment',
  'handover.manage',
  'ticket.manage',
  'report.financial',
  'settings.manage',
];

export const PERMISSIONS: Record<RoleId, Action[]> = {
  MANAGER: ALL,
  // Kinh doanh & thiết kế: khách, dự án, báo giá (không ghi nhận tiền/kho)
  SALES: [...MANAGEMENT, 'quote.approve'],
  // Chỉ huy trưởng: hạng mục, xuất vật tư, ngày công, nghiệm thu, bảo hành
  SITE_MANAGER: ['project.statusChange', 'workItem.manage', 'material.issue', 'timesheet.manage', 'handover.manage', 'ticket.manage'],
  // Kế toán: thu chi, nhà cung cấp, mua hàng, báo cáo
  ACCOUNTANT: ['finance.receipt', 'finance.payment', 'supplier.manage', 'supplier.pay', 'material.purchase', 'material.adjust', 'report.financial'],
};

export function can(role: RoleId, action: Action): boolean {
  return PERMISSIONS[role]?.includes(action) ?? false;
}

export function assertPermission(role: RoleId, action: Action, message?: string): void {
  if (!can(role, action)) {
    throw new PermissionError(message);
  }
}
