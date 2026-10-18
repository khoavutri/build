import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { DollarOutlined, PrinterOutlined, RollbackOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { MoneyDisplay } from '../../components/MoneyDisplay';
import { useAction } from '../../hooks/useAction';
import { useRole } from '../../app/RoleContext';
import { useUrlState } from '../../hooks/useUrlState';
import { db } from '../../db/database';
import { buildCashBook, createReceipt, type ReceiptInput } from '../../services/finance';
import { PaymentModal, TransactionPrintModal } from '../projects/TransactionModals';
import { receivableRows, supplierDebtRows, type ReceivableRow, type SupplierDebtRow } from '../../repositories/reports';
import { can } from '../../services/permissions';
import { formatDate, toDateKey } from '../../utils/format';
import { formatMoney, parseMoneyInput } from '../../utils/money';
import { PAYMENT_METHOD_LABEL, TRANSACTION_CATEGORY_LABEL } from '../../utils/status';
import type { PaymentMethod, Transaction } from '../../types';

export function FinancePage() {
  const { actor, role } = useRole();
  const { loading, run } = useAction();
  const [filters, setFilters] = useUrlState<{ tab?: string; from?: string; to?: string }>({ tab: 'receipts', from: undefined, to: undefined });

  const transactions = useLiveQuery(async () => (await db.transactions.toArray()).sort((a, b) => b.at.localeCompare(a.at)), [], []);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [], []);
  const supplierById = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s])), [suppliers]);
  const receivables = useLiveQuery(() => receivableRows(), [], [] as ReceivableRow[]);
  const payables = useLiveQuery(() => supplierDebtRows(), [], [] as SupplierDebtRow[]);
  const milestones = useLiveQuery(() => db.milestones.toArray(), [], []);

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [printTx, setPrintTx] = useState<Transaction>();
  const [receiptForm] = Form.useForm<{ projectId?: string; milestoneId?: string; amountVnd: number; method: PaymentMethod; at: dayjs.Dayjs; payerName?: string; note?: string }>();

  const canReceipt = can(role, 'finance.receipt');
  const canPayment = can(role, 'finance.payment');

  const range = useMemo(() => {
    const from = filters.from ?? dayjs().subtract(60, 'day').format('YYYY-MM-DD');
    const to = filters.to ?? toDateKey(new Date());
    return { from, to };
  }, [filters.from, filters.to]);

  const inRows = useMemo(() => (transactions ?? []).filter((tx) => tx.type === 'IN'), [transactions]);
  const outRows = useMemo(() => (transactions ?? []).filter((tx) => tx.type === 'OUT'), [transactions]);

  const cashBook = useMemo(
    () => buildCashBook((transactions ?? []).filter((tx) => tx.at.slice(0, 10) >= range.from && tx.at.slice(0, 10) <= range.to)),
    [transactions, range],
  );
  const totalIn = cashBook.reduce((sum, row) => sum + row.inVnd, 0);
  const totalOut = cashBook.reduce((sum, row) => sum + row.outVnd, 0);
  const totalReceivable = (receivables ?? []).reduce((sum, row) => sum + row.remainingVnd, 0);
  const totalOverdue = (receivables ?? []).reduce((sum, row) => sum + row.overdueVnd, 0);
  const totalPayable = (payables ?? []).reduce((sum, row) => sum + row.debtVnd, 0);

  const selectedProjectId = Form.useWatch('projectId', receiptForm);
  const milestoneOptions = useMemo(
    () =>
      (milestones ?? [])
        .filter((m) => (selectedProjectId ? m.projectId === selectedProjectId : false))
        .sort((a, b) => a.seq - b.seq)
        .map((m) => ({
          value: m.id,
          label: `${m.name} — còn ${formatMoney(Math.max(0, m.amountVnd - m.paidVnd))}`,
        })),
    [milestones, selectedProjectId],
  );

  const submitReceipt = async () => {
    const values = await receiptForm.validateFields();
    const payload: ReceiptInput = {
      projectId: values.projectId,
      milestoneId: values.milestoneId,
      amountVnd: values.amountVnd,
      method: values.method,
      at: values.at.toDate().toISOString(),
      payerName: values.payerName,
      note: values.note,
    };
    await run((op) => createReceipt(actor, payload, { operationId: op }), {
      successMessage: 'Đã lập phiếu thu',
      onSuccess: () => {
        setReceiptOpen(false);
        receiptForm.resetFields();
      },
    });
  };

  const transactionColumns: TableColumnsType<Transaction> = [
    { title: 'Mã phiếu', key: 'code', width: 130, render: (_, tx) => <span className="text-strong">{tx.code}</span> },
    { title: 'Ngày', key: 'at', width: 110, render: (_, tx) => formatDate(tx.at) },
    {
      title: 'Dự án',
      key: 'project',
      width: 220,
      render: (_, tx) => {
        const project = tx.projectId ? projectById.get(tx.projectId) : undefined;
        return project ? (
          <div>
            <div className="text-strong">{project.code}</div>
            <div className="text-muted">{project.name}</div>
          </div>
        ) : (
          <span className="text-muted">Không gắn dự án</span>
        );
      },
    },
    {
      title: 'Đợt thanh toán',
      key: 'milestone',
      width: 190,
      render: (_, tx) => (tx.milestoneId ? (milestones ?? []).find((m) => m.id === tx.milestoneId)?.name ?? '—' : '—'),
    },
    {
      title: 'Loại',
      key: 'category',
      width: 140,
      render: (_, tx) => <Tag color={tx.type === 'IN' ? 'green' : 'red'}>{TRANSACTION_CATEGORY_LABEL[tx.category]}</Tag>,
    },
    {
      title: 'Người nộp / nhận',
      key: 'party',
      render: (_, tx) =>
        tx.type === 'IN'
          ? tx.payerName ?? '—'
          : tx.receiverName ?? (tx.partyId ? supplierById.get(tx.partyId)?.name ?? '—' : '—'),
    },
    { title: 'Phương thức', key: 'method', width: 130, render: (_, tx) => PAYMENT_METHOD_LABEL[tx.method] },
    { title: 'Số tiền', key: 'amount', width: 160, align: 'right', render: (_, tx) => <MoneyDisplay value={tx.amountVnd} strong /> },
    { title: 'Diễn giải', key: 'note', render: (_, tx) => tx.note ?? '—' },
    {
      title: '',
      key: 'print',
      width: 70,
      render: (_, tx) => <Button size="small" icon={<PrinterOutlined />} onClick={() => setPrintTx(tx)} />,
    },
  ];

  const cashBookColumns: TableColumnsType<(typeof cashBook)[number]> = [
    { title: 'Ngày', key: 'date', width: 130, render: (_, row) => formatDate(row.dateKey) },
    { title: 'Tổng thu', key: 'in', width: 170, align: 'right', render: (_, row) => <MoneyDisplay value={row.inVnd} /> },
    { title: 'Tổng chi', key: 'out', width: 170, align: 'right', render: (_, row) => <MoneyDisplay value={row.outVnd} /> },
    {
      title: 'Chênh lệch ngày',
      key: 'net',
      width: 170,
      align: 'right',
      render: (_, row) => (
        <span style={{ color: row.netVnd >= 0 ? '#2f7d32' : '#c0392b', fontWeight: 600 }}>{formatMoney(row.netVnd)}</span>
      ),
    },
    { title: 'Tồn lũy kế', key: 'balance', width: 180, align: 'right', render: (_, row) => <span className="text-strong">{formatMoney(row.balanceVnd)}</span> },
  ];

  const receivableColumns: TableColumnsType<ReceivableRow> = [
    {
      title: 'Dự án',
      key: 'project',
      render: (_, row) => (
        <div>
          <div className="text-strong">{row.project.code}</div>
          <div className="text-muted">
            {row.project.name} — {row.customerName}
          </div>
        </div>
      ),
    },
    { title: 'Kế hoạch thu', key: 'schedule', width: 160, align: 'right', render: (_, row) => <MoneyDisplay value={row.scheduleVnd} /> },
    { title: 'Đã thu', key: 'paid', width: 160, align: 'right', render: (_, row) => <MoneyDisplay value={row.paidVnd} /> },
    { title: 'Còn phải thu', key: 'remaining', width: 170, align: 'right', render: (_, row) => <MoneyDisplay value={row.remainingVnd} strong /> },
    {
      title: 'Quá hạn',
      key: 'overdue',
      width: 170,
      align: 'right',
      render: (_, row) =>
        row.overdueVnd > 0 ? <span style={{ color: '#c0392b', fontWeight: 700 }}>{formatMoney(row.overdueVnd)}</span> : <span className="text-muted">—</span>,
    },
  ];

  const payableColumns: TableColumnsType<SupplierDebtRow> = [
    { title: 'Đối tượng', key: 'name', render: (_, row) => <span className="text-strong">{row.supplier.name}</span> },
    {
      title: 'Loại',
      key: 'type',
      width: 130,
      render: (_, row) => <Tag color={row.supplier.type === 'MATERIAL' ? 'blue' : 'purple'}>{row.supplier.type === 'MATERIAL' ? 'NCC vật tư' : 'Thầu phụ'}</Tag>,
    },
    { title: 'Giá trị mua/dịch vụ', key: 'purchased', width: 180, align: 'right', render: (_, row) => <MoneyDisplay value={row.purchasedVnd} /> },
    { title: 'Đã trả', key: 'paid', width: 160, align: 'right', render: (_, row) => <MoneyDisplay value={row.paidVnd} /> },
    {
      title: 'Còn phải trả',
      key: 'debt',
      width: 170,
      align: 'right',
      render: (_, row) => (row.debtVnd > 0 ? <span style={{ color: '#c0392b', fontWeight: 700 }}>{formatMoney(row.debtVnd)}</span> : <MoneyDisplay value={0} />),
    },
  ];

  const items = [
    {
      key: 'receipts',
      label: `Phiếu thu (${inRows.length})`,
      children: (
        <Card
          size="small"
          extra={
            canReceipt ? (
              <Button
                type="primary"
                icon={<DollarOutlined />}
                onClick={() => {
                  setReceiptOpen(true);
                  receiptForm.resetFields();
                  receiptForm.setFieldsValue({ method: 'TRANSFER', at: dayjs() });
                }}
              >
                Tạo phiếu thu
              </Button>
            ) : null
          }
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title="Phiếu thu gắn đợt thanh toán sẽ tự cộng vào số đã thu của đợt; hệ thống chặn thu vượt số tiền còn lại của đợt."
          />
          <Table<Transaction>
            rowKey="id"
            columns={transactionColumns}
            dataSource={inRows}
            size="small"
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ x: 1350 }}
            locale={{ emptyText: <Empty description="Chưa có phiếu thu nào." /> }}
          />
        </Card>
      ),
    },
    {
      key: 'payments',
      label: `Phiếu chi (${outRows.length})`,
      children: (
        <Card
          size="small"
          extra={
            canPayment ? (
              <Button type="primary" icon={<RollbackOutlined />} onClick={() => setPaymentOpen(true)}>
                Tạo phiếu chi
              </Button>
            ) : null
          }
        >
          <Table<Transaction>
            rowKey="id"
            columns={transactionColumns}
            dataSource={outRows}
            size="small"
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ x: 1350 }}
            locale={{ emptyText: <Empty description="Chưa có phiếu chi nào." /> }}
          />
        </Card>
      ),
    },
    {
      key: 'cashbook',
      label: 'Sổ quỹ',
      children: (
        <Card size="small">
          <Space size={16} wrap style={{ marginBottom: 12 }}>
            <Statistic title="Tổng thu kỳ lọc" value={formatMoney(totalIn)} styles={{ content: { color: '#2f7d32' } }} />
            <Statistic title="Tổng chi kỳ lọc" value={formatMoney(totalOut)} styles={{ content: { color: '#c0392b' } }} />
            <Statistic title="Chênh lệch" value={formatMoney(totalIn - totalOut)} styles={{ content: { color: totalIn - totalOut >= 0 ? '#2f7d32' : '#c0392b' } }} />
          </Space>
          <Space wrap style={{ marginBottom: 12 }}>
            <DatePicker
              value={dayjs(range.from)}
              format="DD/MM/YYYY"
              onChange={(value) => value && setFilters({ from: toDateKey(value) })}
            />
            <span className="text-muted">đến</span>
            <DatePicker value={dayjs(range.to)} format="DD/MM/YYYY" onChange={(value) => value && setFilters({ to: toDateKey(value) })} />
            <Button onClick={() => setFilters({ from: dayjs().subtract(60, 'day').format('YYYY-MM-DD'), to: toDateKey(new Date()) })}>60 ngày gần đây</Button>
            <Button onClick={() => setFilters({ from: dayjs().startOf('month').format('YYYY-MM-DD'), to: toDateKey(new Date()) })}>Từ đầu tháng</Button>
          </Space>
          <Table
            rowKey="dateKey"
            columns={cashBookColumns}
            dataSource={cashBook}
            size="small"
            pagination={false}
            locale={{ emptyText: <Empty description="Không có giao dịch trong khoảng ngày đã chọn." /> }}
          />
        </Card>
      ),
    },
    {
      key: 'debt',
      label: 'Công nợ',
      children: (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <Space size={16} wrap>
            <Card size="small" style={{ minWidth: 200 }}>
              <Statistic title="Khách còn phải thu" value={formatMoney(totalReceivable)} />
            </Card>
            <Card size="small" style={{ minWidth: 200 }}>
              <Statistic title="Quá hạn cần thu" value={formatMoney(totalOverdue)} styles={{ content: { color: totalOverdue > 0 ? '#c0392b' : undefined } }} />
            </Card>
            <Card size="small" style={{ minWidth: 200 }}>
              <Statistic title="Phải trả NCC/thầu phụ" value={formatMoney(totalPayable)} styles={{ content: { color: totalPayable > 0 ? '#c0392b' : undefined } }} />
            </Card>
          </Space>
          <Card size="small" title="Khách phải thu theo dự án">
            <Table<ReceivableRow>
              rowKey={(row) => row.project.id}
              columns={receivableColumns}
              dataSource={receivables ?? []}
              size="small"
              pagination={false}
              locale={{ emptyText: <Empty description="Không có công nợ phải thu." /> }}
            />
          </Card>
          <Card size="small" title="Phải trả nhà cung cấp & thầu phụ">
            <Table<SupplierDebtRow>
              rowKey={(row) => row.supplier.id}
              columns={payableColumns}
              dataSource={(payables ?? []).filter((row) => row.purchasedVnd > 0)}
              size="small"
              pagination={false}
              locale={{ emptyText: <Empty description="Không có công nợ phải trả." /> }}
            />
          </Card>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tài chính"
        subtitle="Phiếu thu, phiếu chi, sổ quỹ theo ngày và công nợ hai chiều của khách hàng — nhà cung cấp."
      />

      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Tổng thu toàn kỳ" value={formatMoney(inRows.reduce((sum, tx) => sum + tx.amountVnd, 0))} />
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Tổng chi toàn kỳ" value={formatMoney(outRows.reduce((sum, tx) => sum + tx.amountVnd, 0))} />
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic
            title="Số dư hiện tại"
            value={formatMoney(inRows.reduce((sum, tx) => sum + tx.amountVnd, 0) - outRows.reduce((sum, tx) => sum + tx.amountVnd, 0))}
            styles={{ content: { color: '#2f7d32' } }}
          />
        </Card>
      </Space>

      <Tabs activeKey={filters.tab ?? 'receipts'} onChange={(key) => setFilters({ tab: key })} items={items} />

      <Modal
        title="Tạo phiếu thu"
        open={receiptOpen}
        onCancel={() => setReceiptOpen(false)}
        onOk={() => void submitReceipt()}
        okText="Lập phiếu thu"
        cancelText="Huỷ"
        confirmLoading={loading}
        destroyOnHidden
        width={620}
      >
        <Form form={receiptForm} layout="vertical">
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="projectId" label="Dự án" style={{ flex: 2 }} extra="Bỏ trống nếu là khoản thu khác không gắn dự án">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Chọn dự án (hoặc để trống)"
                options={(projects ?? []).map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
                onChange={() => receiptForm.setFieldValue('milestoneId', undefined)}
              />
            </Form.Item>
            <Form.Item name="milestoneId" label="Đợt thanh toán" style={{ flex: 2 }}>
              <Select allowClear placeholder="Chọn đợt (nếu thu theo đợt)" options={milestoneOptions} disabled={!selectedProjectId} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="amountVnd" label="Số tiền thu (₫)" style={{ flex: 2 }} rules={[{ required: true }]}>
              <InputNumber<number>
                min={0}
                step={1000000}
                style={{ width: '100%' }}
                formatter={(value) => (value == null ? '' : Number(value).toLocaleString('vi-VN'))}
                parser={(value) => parseMoneyInput(value) ?? 0}
              />
            </Form.Item>
            <Form.Item name="at" label="Ngày thu" style={{ flex: 1 }} rules={[{ required: true }]}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="payerName" label="Người nộp" style={{ flex: 2 }}>
              <Input />
            </Form.Item>
            <Form.Item name="method" label="Phương thức" style={{ flex: 2 }}>
              <Radio.Group
                options={[
                  { value: 'TRANSFER', label: 'Chuyển khoản' },
                  { value: 'CASH', label: 'Tiền mặt' },
                ]}
                optionType="button"
              />
            </Form.Item>
          </Space>
          <Form.Item name="note" label="Diễn giải">
            <Input.TextArea rows={2} placeholder="Nội dung thu, căn cứ theo đợt/hợp đồng..." />
          </Form.Item>
        </Form>
      </Modal>

      <PaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} projects={projects ?? []} />
      <TransactionPrintModal transaction={printTx} project={printTx?.projectId ? projectById.get(printTx.projectId) : undefined} open={!!printTx} onClose={() => setPrintTx(undefined)} />

      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        Sổ quỹ tính theo ngày giao dịch thực tế; tồn lũy kế dùng để đối chiếu nhanh với sao kê ngân hàng và tiền mặt tại quỹ.
      </Typography.Paragraph>
    </div>
  );
}
