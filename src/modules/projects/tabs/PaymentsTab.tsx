import { useMemo, useState } from 'react';
import { Button, Card, Empty, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DollarOutlined, PrinterOutlined, RollbackOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/database';
import { MoneyDisplay } from '../../../components/MoneyDisplay';
import { PaymentModal, ReceiptModal, TransactionPrintModal } from '../TransactionModals';
import { formatDate } from '../../../utils/format';
import { formatMoney } from '../../../utils/money';
import { PAYMENT_METHOD_LABEL, TRANSACTION_CATEGORY_LABEL } from '../../../utils/status';
import type { Milestone, Project, Transaction } from '../../../types';

export function PaymentsTab({ project, milestones, transactions }: { project: Project; milestones: Milestone[]; transactions: Transaction[] }) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [printTx, setPrintTx] = useState<Transaction>();
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [], []);
  const supplierById = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s])), [suppliers]);

  const inRows = useMemo(() => (transactions ?? []).filter((t) => t.type === 'IN'), [transactions]);
  const outRows = useMemo(() => (transactions ?? []).filter((t) => t.type === 'OUT'), [transactions]);
  const totalIn = inRows.reduce((sum, t) => sum + t.amountVnd, 0);
  const totalOut = outRows.reduce((sum, t) => sum + t.amountVnd, 0);

  const commonColumns: TableColumnsType<Transaction> = [
    { title: 'Mã phiếu', key: 'code', width: 130, render: (_, tx) => <span className="text-strong">{tx.code}</span> },
    { title: 'Ngày', key: 'at', width: 110, render: (_, tx) => formatDate(tx.at) },
    {
      title: 'Loại',
      key: 'category',
      width: 140,
      render: (_, tx) => <Tag color={tx.type === 'IN' ? 'green' : 'red'}>{TRANSACTION_CATEGORY_LABEL[tx.category]}</Tag>,
    },
    {
      title: 'Đối tượng',
      key: 'party',
      render: (_, tx) =>
        tx.type === 'IN' ? tx.payerName ?? '—' : tx.receiverName ?? (tx.partyId ? supplierById.get(tx.partyId)?.name ?? '—' : '—'),
    },
    { title: 'Phương thức', key: 'method', width: 130, render: (_, tx) => PAYMENT_METHOD_LABEL[tx.method] },
    {
      title: 'Số tiền',
      key: 'amount',
      width: 160,
      align: 'right',
      render: (_, tx) => <MoneyDisplay value={tx.amountVnd} strong />,
    },
    { title: 'Ghi chú', key: 'note', render: (_, tx) => tx.note ?? '—' },
    {
      title: '',
      key: 'print',
      width: 70,
      render: (_, tx) => <Button size="small" icon={<PrinterOutlined />} onClick={() => setPrintTx(tx)} />,
    },
  ];

  return (
    <div>
      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 210 }}>
          <Statistic title="Tổng thu của dự án" value={formatMoney(totalIn)} styles={{ content: { color: '#2f7d32' } }} />
        </Card>
        <Card size="small" style={{ minWidth: 210 }}>
          <Statistic title="Tổng chi của dự án" value={formatMoney(totalOut)} styles={{ content: { color: '#c0392b' } }} />
        </Card>
        <Card size="small" style={{ minWidth: 210 }}>
          <Statistic
            title="Chênh lệch thu − chi"
            value={formatMoney(totalIn - totalOut)}
            styles={{ content: { color: totalIn - totalOut >= 0 ? '#2f7d32' : '#c0392b' } }}
          />
        </Card>
        <Card size="small" style={{ minWidth: 260 }}>
          <Space>
            <Button type="primary" icon={<DollarOutlined />} onClick={() => setReceiptOpen(true)}>
              Thu tiền
            </Button>
            <Button icon={<RollbackOutlined />} onClick={() => setPaymentOpen(true)}>
              Chi tiền
            </Button>
          </Space>
          <div className="text-muted" style={{ marginTop: 6 }}>
            Phiếu thu gắn đợt thanh toán sẽ tự cập nhật số đã thu.
          </div>
        </Card>
      </Space>

      <Card size="small" title={`Phiếu thu (${inRows.length})`} style={{ marginBottom: 12 }}>
        <Table<Transaction>
          rowKey="id"
          columns={commonColumns}
          dataSource={inRows}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1000 }}
          locale={{ emptyText: <Empty description="Chưa có phiếu thu nào cho dự án." /> }}
        />
      </Card>

      <Card size="small" title={`Phiếu chi (${outRows.length})`}>
        <Table<Transaction>
          rowKey="id"
          columns={commonColumns}
          dataSource={outRows}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1000 }}
          locale={{ emptyText: <Empty description="Chưa có phiếu chi nào cho dự án." /> }}
        />
      </Card>

      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        Chi phí NCC vật tư/thầu phụ gắn dự án được đối chiếu với công nợ trong màn Tài chính; chi nhân công ghi theo kỳ trả lương.
      </Typography.Paragraph>

      <ReceiptModal open={receiptOpen} onClose={() => setReceiptOpen(false)} project={project} milestones={milestones} />
      <PaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} projects={[project]} defaultProjectId={project.id} />
      <TransactionPrintModal transaction={printTx} project={project} open={!!printTx} onClose={() => setPrintTx(undefined)} />
    </div>
  );
}
