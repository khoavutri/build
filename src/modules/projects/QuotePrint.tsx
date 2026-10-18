import { Fragment } from 'react';
import { Typography } from 'antd';
import dayjs from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { PrintLetterhead } from '../../components/PrintLetterhead';
import {
  DEFAULT_COMPANY_INFO,
  DEFAULT_PRINT_CONFIG,
  getSetting,
  SETTING_KEYS,
  type CompanyInfo,
  type PrintConfig,
} from '../../services/settings';
import { formatMoney, formatQuantity, lineTotalVnd } from '../../utils/money';
import type { Customer, Project, Quote, QuoteItem, QuoteSection } from '../../types';

/** Bố cục in báo giá A4: nhóm hạng mục, đơn giá vật tư & nhân công, chiết khấu, chữ ký */
export function QuotePrintDocument({
  quote,
  project,
  customer,
  sections,
  items,
  draft = false,
}: {
  quote?: Quote;
  project?: Project;
  customer?: Customer;
  sections: QuoteSection[];
  items: QuoteItem[];
  draft?: boolean;
}) {
  const printConfig = useLiveQuery(() => getSetting<PrintConfig>(SETTING_KEYS.PRINT_CONFIG, DEFAULT_PRINT_CONFIG), [], DEFAULT_PRINT_CONFIG);
  const company = useLiveQuery(() => getSetting<CompanyInfo>(SETTING_KEYS.COMPANY_INFO, DEFAULT_COMPANY_INFO), [], DEFAULT_COMPANY_INFO);

  const sortedSections = [...sections].sort((a, b) => a.seq - b.seq);
  const orderedItems = sortedSections.flatMap((section) =>
    items.filter((item) => item.sectionId === section.id).sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const indexById = new Map(orderedItems.map((item, index) => [item.id, index + 1]));
  const lines = sortedSections.map((section) => ({
    section,
    rows: orderedItems
      .filter((item) => item.sectionId === section.id)
      .map((item) => ({ ...item, index: indexById.get(item.id) ?? 0, total: lineTotalVnd(item) })),
  }));

  const subtotalVnd = items.reduce((sum, item) => sum + lineTotalVnd(item), 0);
  const discountPct = quote?.discountPct ?? 0;
  const discountVnd = Math.round((subtotalVnd * discountPct) / 100);
  const totalVnd = subtotalVnd - discountVnd;
  const materialVnd = items.reduce((sum, item) => sum + Math.round(item.quantity * item.materialCostVnd), 0);
  const laborVnd = subtotalVnd - materialVnd;

  return (
    <div>
      <PrintLetterhead
        right={
          <span>
            <div>Mã báo giá: {quote?.code ?? '(nháp)'}</div>
            <div>Phiên bản: v{quote?.version ?? 1}</div>
            <div>Ngày lập: {quote?.createdAt ? dayjs(quote.createdAt).format('DD/MM/YYYY') : '(chưa lưu)'}</div>
            <div>Hiệu lực: {printConfig.quotationValidityDays} ngày</div>
          </span>
        }
      />
      <h2>Báo giá thi công nội thất{draft ? ' (bản nháp)' : ''}</h2>
      <Typography.Paragraph style={{ marginBottom: 6 }}>
        Kính gửi: <strong>{customer?.name ?? '...'}</strong> {customer?.phone ? `— Điện thoại: ${customer.phone}` : ''}
        <br />
        Công trình: <strong>{project?.name ?? '...'}</strong> — {project?.address ?? ''}
        <br />
        Đại diện công ty: {company.name} — {company.phone}
      </Typography.Paragraph>

      <table>
        <thead>
          <tr>
            <th style={{ width: 34 }}>TT</th>
            <th>Nội dung công việc</th>
            <th style={{ width: 52 }}>ĐVT</th>
            <th style={{ width: 56 }}>KL</th>
            <th style={{ width: 96 }}>Đơn giá VT</th>
            <th style={{ width: 96 }}>Đơn giá NC</th>
            <th style={{ width: 110 }}>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <Fragment key={line.section.id}>
              <tr className="section-row">
                <td colSpan={7}>{line.section.name}</td>
              </tr>
              {line.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.index}</td>
                  <td>{row.description}</td>
                  <td>{row.unit}</td>
                  <td className="amount">{formatQuantity(row.quantity)}</td>
                  <td className="amount">{formatMoney(row.materialCostVnd)}</td>
                  <td className="amount">{formatMoney(row.laborCostVnd)}</td>
                  <td className="amount">{formatMoney(row.total)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>

      <table style={{ width: '60%', marginLeft: 'auto' }}>
        <tbody>
          <tr>
            <td>Tạm tính vật tư</td>
            <td className="amount">{formatMoney(materialVnd)}</td>
          </tr>
          <tr>
            <td>Tạm tính nhân công</td>
            <td className="amount">{formatMoney(laborVnd)}</td>
          </tr>
          <tr>
            <td>Tổng trước chiết khấu</td>
            <td className="amount">{formatMoney(subtotalVnd)}</td>
          </tr>
          <tr>
            <td>Chiết khấu ({discountPct}%)</td>
            <td className="amount">-{formatMoney(discountVnd)}</td>
          </tr>
          <tr>
            <td>
              <strong>Tổng cộng</strong>
            </td>
            <td className="amount">
              <strong>{formatMoney(totalVnd)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {quote?.note ? <Typography.Paragraph style={{ marginTop: 8 }}>Ghi chú: {quote.note}</Typography.Paragraph> : null}
      {printConfig.quoteFooterNote ? (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          {printConfig.quoteFooterNote}
        </Typography.Paragraph>
      ) : null}

      <div className="print-signatures">
        <div>
          Đại diện công ty
          <br />
          <span style={{ fontSize: 11 }}>(Ký, đóng dấu)</span>
        </div>
        <div>
          Chủ đầu tư
          <br />
          <span style={{ fontSize: 11 }}>(Ký, ghi rõ họ tên)</span>
        </div>
      </div>
    </div>
  );
}
