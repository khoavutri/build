import { useState } from 'react';
import { Button, Card, Empty, Progress, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { StatusTag } from '../../../components/StatusTag';
import { MoneyDisplay } from '../../../components/MoneyDisplay';
import { ReceiptModal } from '../TransactionModals';
import { buildMilestoneRow, type MilestoneRow } from '../../../repositories/projects';
import { formatDate } from '../../../utils/format';
import { formatMoney } from '../../../utils/money';
import { TICKET_SEVERITY_META } from '../../../utils/status';
import type { Customer, Milestone, Project, Ticket, Transaction } from '../../../types';

export function OverviewTab({
  project,
  customer,
  milestones,
  transactions,
  tickets,
  progressPct,
  cashFlow,
}: {
  project: Project;
  customer?: Customer;
  milestones: Milestone[];
  transactions: Transaction[];
  tickets: Ticket[];
  progressPct: number;
  cashFlow: { inVnd: number; outVnd: number; netVnd: number };
}) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [defaultMilestoneId, setDefaultMilestoneId] = useState<string | undefined>(undefined);

  const rows: MilestoneRow[] = milestones.map(buildMilestoneRow);
  const openTickets = tickets.filter((t) => t.status !== 'DONE');
  const remainingVnd = rows.reduce((sum, row) => sum + row.remainingVnd, 0);

  const columns: TableColumnsType<MilestoneRow> = [
    { title: 'Đợt', key: 'name', render: (_, row) => <span className="text-strong">{row.milestone.name}</span> },
    { title: '%', key: 'pct', width: 60, align: 'center', render: (_, row) => `${row.milestone.pct}%` },
    { title: 'Số tiền', key: 'amount', width: 150, align: 'right', render: (_, row) => <MoneyDisplay value={row.milestone.amountVnd} /> },
    { title: 'Hạn thu', key: 'due', width: 110, render: (_, row) => formatDate(row.milestone.dueDate) },
    {
      title: 'Đã thu',
      key: 'paid',
      width: 200,
      render: (_, row) => (
        <div>
          <Progress
            percent={row.milestone.amountVnd > 0 ? Math.round((row.milestone.paidVnd / row.milestone.amountVnd) * 100) : 0}
            size="small"
            showInfo={false}
            strokeColor={row.milestone.paidVnd >= row.milestone.amountVnd ? '#2f9e44' : '#a16207'}
          />
          <span className="text-muted">
            {formatMoney(row.milestone.paidVnd)} / {formatMoney(row.milestone.amountVnd)}
          </span>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'state',
      width: 120,
      render: (_, row) => <Tag color={row.state.color}>{row.state.label}</Tag>,
    },
    {
      title: '',
      key: 'action',
      width: 110,
      render: (_, row) =>
        row.remainingVnd > 0 ? (
          <Button
            size="small"
            type="primary"
            onClick={() => {
              setDefaultMilestoneId(row.milestone.id);
              setReceiptOpen(true);
            }}
          >
            Thu tiền
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Tiến độ tổng" value={progressPct} suffix="%" formatter={(v) => Number(v).toLocaleString('vi-VN')} />
          <Progress percent={progressPct} showInfo={false} strokeColor="#a16207" />
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Đã thu / Kế hoạch" value={formatMoney(milestones.reduce((s, m) => s + m.paidVnd, 0))} />
          <Typography.Text type="secondary">Còn phải thu: {formatMoney(remainingVnd)}</Typography.Text>
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Dòng tiền dự án" value={formatMoney(cashFlow.netVnd)} styles={{ content: { color: cashFlow.netVnd >= 0 ? '#2f7d32' : '#c0392b' } }} />
          <Typography.Text type="secondary">
            Thu {formatMoney(cashFlow.inVnd)} · Chi {formatMoney(cashFlow.outVnd)}
          </Typography.Text>
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Giao dịch" value={transactions.length} suffix="phiếu" />
          <Typography.Text type="secondary">Bao gồm phiếu thu và phiếu chi của dự án</Typography.Text>
        </Card>
      </Space>

      <Card
        title="Thông tin dự án"
        size="small"
        style={{ marginBottom: 12 }}
        extra={
          <Space>
            <Tag color="gold">{dayjs(project.createdAt).format('DD/MM/YYYY')} tạo</Tag>
          </Space>
        }
      >
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <div>
            <span className="text-muted">Chủ nhà: </span>
            <strong>{customer?.name ?? '—'}</strong> · {customer?.phone ?? '—'}
          </div>
          <div>
            <span className="text-muted">Địa chỉ: </span>
            {project.address}
          </div>
          <div>
            <span className="text-muted">Khởi công: </span>
            {formatDate(project.startDate)} <span className="text-muted"> · Bàn giao dự kiến: </span>
            {formatDate(project.handoverDate)}
          </div>
          <div>
            <span className="text-muted">Giá trị hợp đồng: </span>
            <strong>{formatMoney(project.contractValueVnd)}</strong>
          </div>
          {project.note ? <Typography.Text type="secondary">{project.note}</Typography.Text> : null}
        </Space>
      </Card>

      <Card
        title="Các đợt thanh toán"
        size="small"
        style={{ marginBottom: 12 }}
        extra={
          <Button
            type="primary"
            icon={<DollarOutlined />}
            onClick={() => {
              setDefaultMilestoneId(undefined);
              setReceiptOpen(true);
            }}
          >
            Thu tiền
          </Button>
        }
      >
        <Table<MilestoneRow>
          rowKey={(row) => row.milestone.id}
          columns={columns}
          dataSource={rows}
          size="small"
          pagination={false}
          locale={{ emptyText: <Empty description="Dự án chưa có đợt thanh toán. Áp giá trị hợp đồng từ báo giá được duyệt để sinh đợt." /> }}
        />
      </Card>

      <Card title="Ticket bảo hành đang mở" size="small">
        {openTickets.length === 0 ? (
          <Typography.Text type="secondary">Không có ticket bảo hành nào đang mở.</Typography.Text>
        ) : (
          <Space orientation="vertical" size={6} style={{ width: '100%' }}>
            {openTickets.map((ticket) => (
              <div key={ticket.id} style={{ display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px dashed #f0e9dc', paddingBottom: 6 }}>
                <Tag color={TICKET_SEVERITY_META[ticket.severity].color}>{TICKET_SEVERITY_META[ticket.severity].label}</Tag>
                <span className="text-strong">{ticket.code}</span>
                <span>{ticket.description}</span>
                <span className="text-muted" style={{ marginLeft: 'auto' }}>
                  Mở ngày {formatDate(ticket.createdAt)}
                </span>
              </div>
            ))}
          </Space>
        )}
      </Card>

      <ReceiptModal
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        project={project}
        milestones={milestones}
        defaultMilestoneId={defaultMilestoneId}
      />

      <Space size={8} style={{ marginTop: 12 }}>
        <StatusTag kind="project" status={project.status} prefix="Trạng thái hiện tại" />
        <Typography.Text type="secondary">Chuyển trạng thái bằng nút "Đổi trạng thái" ở đầu trang.</Typography.Text>
      </Space>
    </div>
  );
}
