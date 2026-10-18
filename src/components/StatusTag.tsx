import { Tag } from 'antd';
import type { StatusMeta } from '../utils/status';
import {
  HANDOVER_RESULT_META,
  PROJECT_CATEGORY_META,
  PROJECT_STATUS_META,
  PURCHASE_STATUS_META,
  QUOTE_STATUS_META,
  TICKET_SEVERITY_META,
  TICKET_STATUS_META,
  WORK_ITEM_STATUS_META,
  statusMeta,
} from '../utils/status';

const META_BY_KIND = {
  project: PROJECT_STATUS_META,
  projectCategory: PROJECT_CATEGORY_META,
  workItem: WORK_ITEM_STATUS_META,
  quote: QUOTE_STATUS_META,
  purchase: PURCHASE_STATUS_META,
  handoverResult: HANDOVER_RESULT_META,
  ticketSeverity: TICKET_SEVERITY_META,
  ticketStatus: TICKET_STATUS_META,
} as const;

export function StatusTag({ kind, status, prefix }: { kind: keyof typeof META_BY_KIND; status?: string | null; prefix?: string }) {
  const meta: StatusMeta = statusMeta(META_BY_KIND[kind], status);
  return (
    <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
      {prefix ? `${prefix}: ` : ''}
      {meta.label}
    </Tag>
  );
}
