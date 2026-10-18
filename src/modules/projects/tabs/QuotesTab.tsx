import { useState } from 'react';
import { Button, Card, Empty, Popconfirm, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, EditOutlined, PrinterOutlined, PlusOutlined, SendOutlined, SwapOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/database';
import { useAction } from '../../../hooks/useAction';
import { useRole } from '../../../app/RoleContext';
import { PrintPreview } from '../../../components/PrintPreview';
import { StatusTag } from '../../../components/StatusTag';
import { QuotePrintDocument } from '../QuotePrint';
import { can } from '../../../services/permissions';
import { createQuote, discardQuoteDraft, recordQuoteApproval, rejectQuote, sendQuote, supersedeQuote } from '../../../services/quotations';
import { applyContractValue } from '../../../services/projects';
import { formatDate } from '../../../utils/format';
import { formatMoney } from '../../../utils/money';
import type { Project, Quote } from '../../../types';

function QuotePrintModal({ quote, project, open, onClose }: { quote?: Quote; project: Project; open: boolean; onClose: () => void }) {
  const customer = useLiveQuery(() => db.customers.get(project.customerId), [project.customerId]);
  const sections = useLiveQuery(
    async () => (quote ? (await db.quoteSections.where('quoteId').equals(quote.id).toArray()).sort((a, b) => a.seq - b.seq) : []),
    [quote?.id],
    [],
  );
  const items = useLiveQuery(
    async () => (quote ? (await db.quoteItems.where('quoteId').equals(quote.id).toArray()).sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [quote?.id],
    [],
  );
  if (!quote) return null;
  return (
    <PrintPreview open={open} onClose={onClose} title={`Xem trước báo giá ${quote.code} v${quote.version}`} printLabel="In báo giá A4">
      <QuotePrintDocument quote={quote} project={project} customer={customer} sections={sections ?? []} items={items ?? []} />
    </PrintPreview>
  );
}

export function QuotesTab({ project, quotes }: { project: Project; quotes: Quote[] }) {
  const navigate = useNavigate();
  const { actor, role } = useRole();
  const { loading, run } = useAction();
  const [printQuote, setPrintQuote] = useState<Quote>();
  const [printOpen, setPrintOpen] = useState(false);

  const canDraft = can(role, 'quote.draft');
  const canApprove = can(role, 'quote.approve');

  const sorted = [...quotes].sort((a, b) => b.version - a.version);
  const approved = sorted.find((q) => q.status === 'APPROVED');
  const maxTotal = Math.max(1, ...sorted.map((q) => q.totalVnd));

  const columns: TableColumnsType<Quote> = [
    {
      title: 'Phiên bản',
      key: 'version',
      width: 110,
      render: (_, quote) => <span className="text-strong">v{quote.version}</span>,
    },
    { title: 'Mã báo giá', key: 'code', width: 150, render: (_, quote) => quote.code },
    { title: 'Ngày lập', key: 'createdAt', width: 110, render: (_, quote) => formatDate(quote.createdAt) },
    { title: 'Số dòng', key: 'itemCount', width: 90, align: 'right', render: (_, quote) => quote.itemCount },
    {
      title: 'Tổng sau chiết khấu',
      key: 'total',
      width: 190,
      align: 'right',
      render: (_, quote) => (
        <Tooltip title={`Trước chiết khấu ${formatMoney(quote.subtotalVnd)} · Chiết khấu ${quote.discountPct}%`}>
          <span className="text-strong">{formatMoney(quote.totalVnd)}</span>
        </Tooltip>
      ),
    },
    {
      title: 'So sánh',
      key: 'compare',
      width: 140,
      render: (_, quote) => <Progress percent={Math.round((quote.totalVnd / maxTotal) * 100)} size="small" showInfo={false} strokeColor="#a16207" />,
    },
    { title: 'Trạng thái', key: 'status', width: 120, render: (_, quote) => <StatusTag kind="quote" status={quote.status} /> },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 320,
      render: (_, quote) => (
        <Space size={4} wrap>
          <Button size="small" icon={<PrinterOutlined />} onClick={() => { setPrintQuote(quote); setPrintOpen(true); }}>
            In
          </Button>
          {quote.status === 'DRAFT' && canDraft ? (
            <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => navigate(`/projects/${project.id}/quote/${quote.id}`)}>
              Sửa nháp
            </Button>
          ) : null}
          {quote.status === 'DRAFT' && canDraft ? (
            <Button
              size="small"
              icon={<SendOutlined />}
              loading={loading}
              onClick={() => void run(() => sendQuote(actor, quote.id), { successMessage: 'Đã gửi báo giá cho chủ nhà' })}
            >
              Gửi khách
            </Button>
          ) : null}
          {(quote.status === 'SENT' || quote.status === 'DRAFT') && canApprove ? (
            <Button
              size="small"
              icon={<CheckCircleOutlined />}
              loading={loading}
              onClick={() => void run(() => recordQuoteApproval(actor, quote.id), { successMessage: 'Đã ghi nhận khách duyệt báo giá' })}
            >
              Khách duyệt
            </Button>
          ) : null}
          {quote.status === 'SENT' && canApprove ? (
            <Popconfirm
              title="Khách từ chối báo giá này?"
              onConfirm={() => void run(() => rejectQuote(actor, quote.id), { successMessage: 'Đã ghi nhận từ chối' })}
            >
              <Button size="small" danger icon={<CloseCircleOutlined />}>
                Từ chối
              </Button>
            </Popconfirm>
          ) : null}
          {quote.status !== 'SUPERSEDED' && canDraft && quote.status !== 'APPROVED' ? (
            <Button
              size="small"
              icon={<SwapOutlined />}
              loading={loading}
              onClick={() =>
                void run(() => supersedeQuote(actor, quote.id), {
                  successMessage: 'Đã tạo phiên bản mới kế thừa nội dung',
                  onSuccess: (created) => navigate(`/projects/${project.id}/quote/${created.id}`),
                })
              }
            >
              Phiên bản mới
            </Button>
          ) : null}
          {quote.status === 'DRAFT' && canDraft ? (
            <Popconfirm
              title="Xoá báo giá nháp này?"
              onConfirm={() => void run(() => discardQuoteDraft(actor, quote.id), { successMessage: 'Đã xoá báo giá nháp' })}
            >
              <Button size="small" danger type="text">
                Xoá
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        size="small"
        style={{ marginBottom: 12 }}
        title="So sánh nhanh các phiên bản"
        extra={
          canDraft ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={loading}
              onClick={() =>
                void run((op) => createQuote(actor, project.id, {}, { operationId: op }), {
                  successMessage: 'Đã tạo báo giá nháp mới',
                  onSuccess: (quote) => navigate(`/projects/${project.id}/quote/${quote.id}`),
                })
              }
            >
              Tạo báo giá
            </Button>
          ) : null
        }
      >
        {sorted.length === 0 ? (
          <Empty description="Dự án chưa có báo giá nào." />
        ) : (
          <Space wrap size={12}>
            {sorted.map((quote) => (
              <div key={quote.id} style={{ border: '1px solid #ebe3d5', borderRadius: 8, padding: '8px 12px', minWidth: 200 }}>
                <Space size={6}>
                  <strong>v{quote.version}</strong>
                  <StatusTag kind="quote" status={quote.status} />
                </Space>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#7c4d06' }}>{formatMoney(quote.totalVnd)}</div>
                <div className="text-muted">
                  {quote.itemCount} dòng · chiết khấu {quote.discountPct}% · {formatDate(quote.createdAt)}
                </div>
                {quote.status === 'APPROVED' ? <Tag color="success">Đang áp dụng</Tag> : null}
              </div>
            ))}
          </Space>
        )}
      </Card>

      {approved && approved.totalVnd !== project.contractValueVnd ? (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space wrap>
            <Typography.Text>
              Báo giá <strong>{approved.code} v{approved.version}</strong> đã được duyệt với tổng{' '}
              <strong>{formatMoney(approved.totalVnd)}</strong> nhưng giá trị hợp đồng dự án đang là{' '}
              <strong>{formatMoney(project.contractValueVnd)}</strong>.
            </Typography.Text>
            {can(role, 'project.statusChange') || role === 'MANAGER' ? (
              <Button
                type="primary"
                loading={loading}
                onClick={() =>
                  void run(() => applyContractValue(project.id, approved.totalVnd, approved.code), {
                    successMessage: 'Đã áp giá trị báo giá vào hợp đồng và sinh lại các đợt chưa thu',
                  })
                }
              >
                Áp vào giá trị HĐ
              </Button>
            ) : null}
          </Space>
        </Card>
      ) : null}

      <Table<Quote>
        rowKey="id"
        columns={columns}
        dataSource={sorted}
        size="small"
        pagination={false}
        loading={quotes.length === 0}
        scroll={{ x: 1200 }}
        locale={{ emptyText: <Empty description="Chưa có báo giá. Tạo báo giá mới để lập dự toán theo nhóm hạng mục." /> }}
      />

      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        Báo giá gồm đơn giá vật tư và đơn giá nhân công cho từng dòng; bản nháp sửa trực tiếp, bản đã gửi muốn đổi phạm vi thì tạo phiên bản mới.
      </Typography.Paragraph>

      <QuotePrintModal quote={printQuote} project={project} open={printOpen} onClose={() => setPrintOpen(false)} />
    </div>
  );
}
