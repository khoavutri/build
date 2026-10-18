/** Bỏ dấu tiếng Việt và chuẩn hóa chữ thường để tìm kiếm */
export function normalizeText(input?: string | null): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Chuẩn hóa số điện thoại: chỉ giữ chữ số, +84 -> 0 */
export function normalizePhone(input?: string | null): string {
  if (!input) return '';
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
  return digits.replace(/\D/g, '');
}

export function isValidPhone(phone: string): boolean {
  const n = normalizePhone(phone);
  return n.length >= 9 && n.length <= 11;
}

export function buildSearchName(name: string): string {
  return normalizeText(name);
}

export function matchesSearch(haystack: Array<string | undefined | null>, keyword: string): boolean {
  const kw = normalizeText(keyword);
  if (!kw) return true;
  return haystack.some((v) => (v ? normalizeText(v).includes(kw) : false));
}

/** Tìm theo từ khóa chưa bỏ dấu hoặc đã bỏ dấu */
export function searchable(...parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).map((p) => normalizeText(p)).join(' | ');
}
