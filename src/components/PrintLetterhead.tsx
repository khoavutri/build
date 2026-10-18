import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { DEFAULT_COMPANY_INFO, getSetting, SETTING_KEYS, type CompanyInfo } from '../services/settings';

/** Khối tiêu đề mẫu in A4: tên, MST, địa chỉ, liên hệ công ty và phần bên phải (mã chứng từ, ngày) */
export function PrintLetterhead({ right }: { right?: ReactNode }) {
  const company = useLiveQuery(() => getSetting<CompanyInfo>(SETTING_KEYS.COMPANY_INFO, DEFAULT_COMPANY_INFO), [], DEFAULT_COMPANY_INFO);
  const contacts = [company.phone, company.email, company.website].filter(Boolean).join(' · ');
  return (
    <div className="print-header">
      <div>
        <strong>{company.name}</strong>
        <div>{company.address}</div>
        <div>{company.taxCode ? `MST: ${company.taxCode} · ` : ''}{contacts}</div>
      </div>
      <div style={{ textAlign: 'right' }}>{right}</div>
    </div>
  );
}
