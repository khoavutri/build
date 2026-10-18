import dayjs from 'dayjs';

export const DATE_FORMAT = 'DD/MM/YYYY';
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';
export const DATE_KEY_FORMAT = 'YYYY-MM-DD';

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayKey(): string {
  return dayjs().format(DATE_KEY_FORMAT);
}

export function toDateKey(value: string | Date | dayjs.Dayjs): string {
  return dayjs(value).format(DATE_KEY_FORMAT);
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format(DATE_FORMAT) : '—';
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format(DATETIME_FORMAT) : '—';
}

export function startOfDayIso(date: string | Date | dayjs.Dayjs): string {
  return dayjs(date).startOf('day').toISOString();
}

export function endOfDayIso(date: string | Date | dayjs.Dayjs): string {
  return dayjs(date).endOf('day').toISOString();
}

export function isOverdue(value?: string | null, ref: dayjs.Dayjs = dayjs()): boolean {
  if (!value) return false;
  return dayjs(value).isBefore(ref, 'day');
}

export function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  return dayjs(value).startOf('day').diff(dayjs().startOf('day'), 'day');
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Số ngày giữa hai mốc (âm nếu mốc sau đã qua) */
export function daysBetween(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null;
  return dayjs(to).startOf('day').diff(dayjs(from).startOf('day'), 'day');
}
