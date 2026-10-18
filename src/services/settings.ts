import { db } from '../db/database';
import { nowIso } from '../utils/format';
import type { Actor } from '../types';
import { assertAction } from './core';

export const SETTING_KEYS = {
  COMPANY_INFO: 'companyInfo',
  QUOTE_CONFIG: 'quoteConfig',
  PRINT_CONFIG: 'printConfig',
} as const;

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email?: string;
  website?: string;
  taxCode?: string;
  representative?: string;
  slogan?: string;
}

export interface QuoteConfig {
  defaultVatPct: number;
  defaultDiscountPct: number;
  defaultMilestonePcts: number[];
}

export interface PrintConfig {
  quoteFooterNote?: string;
  handoverFooterNote?: string;
  quotationValidityDays: number;
}

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  name: 'Nội thất KhoaDev',
  address: 'Số 18 ngõ 12 phố Trần Duy Hưng, Cầu Giấy, Hà Nội',
  phone: '0968 123 456',
  email: 'khoadev.company@gmail.com',
  website: 'khoadev.vn',
  taxCode: '0109876543',
  representative: 'Trần Văn Hùng — Giám đốc',
  slogan: 'Thiết kế – thi công trọn gói, minh bạch từng hạng mục',
};

export const DEFAULT_QUOTE_CONFIG: QuoteConfig = {
  defaultVatPct: 0,
  defaultDiscountPct: 5,
  defaultMilestonePcts: [30, 30, 30, 10],
};

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  quoteFooterNote:
    'Báo giá đã bao gồm nhân công thi công và vật tư theo mô tả. Không bao gồm phát sinh ngoài phạm vi. Thời gian thi công dự kiến 45–60 ngày kể từ ngày khởi công.',
  handoverFooterNote: 'Biên bản được lập thành 03 bản, mỗi bên giữ 01 bản có giá trị như nhau.',
  quotationValidityDays: 15,
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const record = await db.settings.get(key);
  if (!record) return fallback;
  return record.value as T;
}

export async function upsertSetting(actor: Actor, key: string, value: unknown): Promise<void> {
  assertAction(actor, 'settings.manage');
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key, value, updatedAt: nowIso() });
  });
}
