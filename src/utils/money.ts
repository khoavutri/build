/** Tính toán tiền VND (số nguyên) cho báo giá: KL × (đơn giá vật tư + đơn giá nhân công) */

export interface LineCostInput {
  quantity: number;
  materialCostVnd: number;
  laborCostVnd: number;
}

export function roundVnd(value: number): number {
  return Math.round(value);
}

/** Thành tiền một dòng báo giá */
export function lineTotalVnd(input: LineCostInput): number {
  return roundVnd(input.quantity * (input.materialCostVnd + input.laborCostVnd));
}

/** Tạm tính vật tư / nhân công / tổng trước chiết khấu của một báo giá */
export function quoteTotals(
  items: Array<LineCostInput>,
  discountPct: number,
): { materialVnd: number; laborVnd: number; subtotalVnd: number; discountVnd: number; totalVnd: number } {
  let materialVnd = 0;
  let laborVnd = 0;
  for (const item of items) {
    materialVnd += roundVnd(item.quantity * item.materialCostVnd);
    laborVnd += roundVnd(item.quantity * item.laborCostVnd);
  }
  const subtotalVnd = materialVnd + laborVnd;
  const discountVnd = roundVnd((subtotalVnd * Math.max(0, Math.min(100, discountPct))) / 100);
  return { materialVnd, laborVnd, subtotalVnd, discountVnd, totalVnd: subtotalVnd - discountVnd };
}

export function formatMoney(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(Math.round(value));
  return `${sign}${abs.toLocaleString('vi-VN')} ₫`;
}

export function formatMoneyShort(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} nghìn`;
  return formatMoney(value);
}

/** Đọc chuỗi người dùng nhập (có thể chứa dấu chấm, phẩy) thành số VND */
export function parseMoneyInput(input?: string | number | null): number | undefined {
  if (input == null || input === '') return undefined;
  if (typeof input === 'number') return Math.round(input);
  const cleaned = input.replace(/[^\d-]/g, '');
  if (!cleaned || cleaned === '-') return undefined;
  const n = Number(cleaned);
  return Number.isNaN(n) ? undefined : Math.round(n);
}

export function formatQuantity(value?: number | null, maxFractionDigits = 3): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('vi-VN', { maximumFractionDigits: maxFractionDigits });
}

export function formatPercent(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}
