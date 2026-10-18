import { useMemo, useState } from 'react';
import { Button, Card, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Rate, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DollarOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '../../components/PageHeader';
import { MoneyDisplay } from '../../components/MoneyDisplay';
import { useAction } from '../../hooks/useAction';
import { useRole } from '../../app/RoleContext';
import { useUrlState } from '../../hooks/useUrlState';
import { db } from '../../db/database';
import { saveSupplier } from '../../services/parties';
import { supplierDebtRows, type SupplierDebtRow } from '../../repositories/reports';
import { PaymentModal } from '../projects/TransactionModals';
import { can } from '../../services/permissions';
import { formatDate } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import { SPECIALTY_LABEL, SUPPLIER_TYPE_META, TRANSACTION_CATEGORY_LABEL } from '../../utils/status';
import { matchesSearch } from '../../utils/text';
import type { Project, Supplier, SupplierType } from '../../types';

interface SupplierFormValues {
  name: string;
  type: SupplierType;
  specialty?: string;
  phone: string;
  address?: string;
  rating: number;
  note?: string;
}

export function SuppliersPage() {
  const { actor, role } = useRole();
  const { loading, run } = useAction();
  const [filters, setFilters] = useUrlState<{ q?: string; type?: string }>({ q: undefined, type: undefined });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier>();
  const [detail, setDetail] = useState<Supplier>();
  const [payFor, setPayFor] = useState<Supplier>();
  const [form] = Form.useForm<SupplierFormValues>();

  const rows = useLiveQuery(() => supplierDebtRows(), [], [] as SupplierDebtRow[]);
  const projects = useLiveQuery(() => db.projects.toArray(), [], [] as Project[]);
  const purchaseOrders = useLiveQuery(() => db.purchaseOrders.toArray(), [], []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []);

  const canManage = can(role, 'supplier.manage');
  const canPay = can(role, 'supplier.pay');

  const filtered = useMemo(
    () =>
      (rows ?? []).filter((row) => {
        if (filters.type && row.supplier.type !== filters.type) return false;
        if (filters.q && !matchesSearch([row.supplier.name, row.supplier.phone, row.supplier.code, row.supplier.specialty], filters.q)) return false;
        return true;
      }),
    [rows, filters.type, filters.q],
  );

  const totalDebt = (rows ?? []).reduce((sum, row) => sum + row.debtVnd, 0);
  const totalPurchased = (rows ?? []).reduce((sum, row) => sum + row.purchasedVnd, 0);
  const totalPaid = (rows ?? []).reduce((sum, row) => sum + row.paidVnd, 0);

  const submit = async () => {
    const values = await form.validateFields();
    await run(() => saveSupplier(actor, values, editing?.id), {
      successMessage: editing ? 'Đã lưu nhà cung cấp/thầu phụ' : 'Đã thêm nhà cung cấp/thầu phụ',
      onSuccess: () => setFormOpen(false),
    });
  };

  const columns: TableColumnsType<SupplierDebtRow> = [
    { title: 'Mã', key: 'code', width: 100, render: (_, row) => <span className="text-strong">{row.supplier.code}</span> },
    { title: 'Tên', key: 'name', render: (_, row) => row.supplier.name },
    {
      title: 'Loại',
      key: 'type',
      width: 130,
      render: (_, row) => <Tag color={SUPPLIER_TYPE_META[row.supplier.type].color}>{SUPPLIER_TYPE_META[row.supplier.type].label}</Tag>,
    },
    {
      title: 'Chuyên môn',
      key: 'specialty',
      width: 130,
      render: (_, row) => (row.supplier.specialty ? SPECIALTY_LABEL[row.supplier.specialty] ?? row.supplier.specialty : '—'),
    },
    { title: 'Điện thoại', key: 'phone', width: 130, render: (_, row) => row.supplier.phone },
    {
      title: 'Đánh giá',
      key: 'rating',
      width: 170,
      render: (_, row) =>
        canManage ? (
          <Rate
            value={row.supplier.rating}
            allowHalf
            onChange={(value) =>
              void run(
                () =>
                  saveSupplier(
                    actor,
                    {
                      name: row.supplier.name,
                      type: row.supplier.type,
                      specialty: row.supplier.specialty,
                      phone: row.supplier.phone,
                      address: row.supplier.address,
                      rating: value,
                      note: row.supplier.note,
                    },
                    row.supplier.id,
                  ),
                { successMessage: `Đã cập nhật đánh giá ${row.supplier.name}: ${value} sao` },
              )
            }
          />
        ) : (
          <Rate value={row.supplier.rating} disabled allowHalf />
        ),
    },
    { title: 'Tổng mua/dịch vụ', key: 'purchased', width: 150, align: 'right', render: (_, row) => <MoneyDisplay value={row.purchasedVnd} /> },
    { title: 'Đã trả', key: 'paid', width: 140, align: 'right', render: (_, row) => <MoneyDisplay value={row.paidVnd} /> },
    { title: 'Còn nợ', key: 'debt', width: 140, align: 'right', render: (_, row) => <MoneyDisplay value={row.debtVnd} strong danger /> },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 210,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" onClick={() => setDetail(row.supplier)}>
            Chi tiết
          </Button>
          {canPay ? (
            <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => setPayFor(row.supplier)}>
              Thanh toán
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditing(row.supplier);
                form.setFieldsValue({
                  name: row.supplier.name,
                  type: row.supplier.type,
                  specialty: row.supplier.specialty,
                  phone: row.supplier.phone,
                  address: row.supplier.address,
                  rating: row.supplier.rating,
                  note: row.supplier.note,
                });
                setFormOpen(true);
              }}
            />
          ) : null}
        </Space>
      ),
    },
  ];

  const detailOrders = (purchaseOrders ?? []).filter((po) => po.supplierId === detail?.id);
  const detailTransactions = (transactions ?? []).filter((tx) => tx.partyId === detail?.id);
  const detailRow = (rows ?? []).find((row) => row.supplier.id === detail?.id);

  const items = [
    {
      key: 'all',
      label: `Tất cả (${(rows ?? []).length})`,
      children: null,
    },
    {
      key: 'MATERIAL',
      label: `NCC vật tư (${(rows ?? []).filter((r) => r.supplier.type === 'MATERIAL').length})`,
      children: null,
    },
    {
      key: 'SUBCONTRACTOR',
      label: `Thầu phụ (${(rows ?? []).filter((r) => r.supplier.type === 'SUBCONTRACTOR').length})`,
      children: null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Nhà cung cấp & thầu phụ"
        subtitle="Quản lý đối tác cung cấp vật tư và các tổ thầu phụ: đánh giá chất lượng, giá trị mua, đã trả và công nợ."
        extra={
          canManage
            ? [
                <Button
                  key="create"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditing(undefined);
                    form.resetFields();
                    form.setFieldsValue({ type: 'MATERIAL', rating: 4 });
                    setFormOpen(true);
                  }}
                >
                  Thêm đối tác
                </Button>,
              ]
            : []
        }
      />

      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Tổng giá trị đã mua/dịch vụ" value={formatMoney(totalPurchased)} />
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Tổng đã thanh toán" value={formatMoney(totalPaid)} />
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Công nợ hiện tại" value={formatMoney(totalDebt)} styles={{ content: { color: totalDebt > 0 ? '#c0392b' : undefined } }} />
        </Card>
      </Space>

      <div className="page-toolbar">
        <Tabs
          activeKey={filters.type ?? 'all'}
          onChange={(key) => setFilters({ type: key === 'all' ? undefined : key })}
          items={items}
          style={{ marginBottom: 0 }}
        />
        <Input.Search
          allowClear
          placeholder="Tìm theo tên, mã, điện thoại..."
          style={{ width: 280 }}
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })}
        />
        <span className="text-muted">Hiển thị {filtered.length} đối tác</span>
      </div>

      <Table<SupplierDebtRow>
        rowKey={(row) => row.supplier.id}
        columns={columns}
        dataSource={filtered}
        size="small"
        pagination={{ pageSize: 15, showSizeChanger: false }}
        scroll={{ x: 1400 }}
        locale={{ emptyText: <Empty description="Không có đối tác phù hợp bộ lọc." /> }}
      />

      <Modal
        title={editing ? `Sửa ${editing.name}` : 'Thêm nhà cung cấp / thầu phụ'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={() => void submit()}
        okText="Lưu"
        cancelText="Huỷ"
        confirmLoading={loading}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tên đối tác" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="type" label="Loại" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'MATERIAL', label: 'NCC vật tư' },
                  { value: 'SUBCONTRACTOR', label: 'Thầu phụ' },
                ]}
              />
            </Form.Item>
            <Form.Item name="specialty" label="Chuyên môn (thầu phụ)" style={{ flex: 1 }}>
              <Select
                allowClear
                options={Object.entries(SPECIALTY_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
          </Space>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="phone" label="Điện thoại" style={{ flex: 1 }} rules={[{ required: true, min: 4 }]}>
              <Input />
            </Form.Item>
            <Form.Item name="rating" label="Đánh giá (sao)" style={{ flex: 1 }}>
              <InputNumber min={0} max={5} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="address" label="Địa chỉ">
            <Input />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detail ? `${detail.code} — ${detail.name}` : ''}
        size={720}
        open={!!detail}
        onClose={() => setDetail(undefined)}
        destroyOnHidden
      >
        {detail ? (
          <Space orientation="vertical" style={{ width: '100%' }} size={12}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="Loại">
                <Tag color={SUPPLIER_TYPE_META[detail.type].color}>{SUPPLIER_TYPE_META[detail.type].label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Chuyên môn">{detail.specialty ? SPECIALTY_LABEL[detail.specialty] ?? detail.specialty : '—'}</Descriptions.Item>
              <Descriptions.Item label="Điện thoại">{detail.phone}</Descriptions.Item>
              <Descriptions.Item label="Đánh giá">
                <Rate value={detail.rating} disabled allowHalf />
              </Descriptions.Item>
              <Descriptions.Item label="Địa chỉ" span={2}>
                {detail.address ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Tổng mua">{formatMoney(detailRow?.purchasedVnd ?? 0)}</Descriptions.Item>
              <Descriptions.Item label="Còn nợ">
                <span style={{ color: (detailRow?.debtVnd ?? 0) > 0 ? '#c0392b' : undefined }}>{formatMoney(detailRow?.debtVnd ?? 0)}</span>
              </Descriptions.Item>
            </Descriptions>

            <Card size="small" title="Phiếu mua hàng">
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detailOrders}
                locale={{ emptyText: <Empty description="Chưa có phiếu mua nào." /> }}
                columns={[
                  { title: 'Mã', key: 'code', width: 120, render: (_, row) => row.code },
                  {
                    title: 'Trạng thái',
                    key: 'status',
                    width: 110,
                    render: (_, row) => <Tag color={row.status === 'RECEIVED' ? 'green' : row.status === 'CANCELLED' ? 'red' : 'gold'}>{row.status}</Tag>,
                  },
                  { title: 'Số dòng', key: 'items', width: 90, align: 'right', render: (_, row) => row.itemCount },
                  { title: 'Tổng tiền', key: 'total', align: 'right', render: (_, row) => formatMoney(row.totalVnd) },
                  { title: 'Ngày', key: 'created', width: 110, render: (_, row) => formatDate(row.createdAt) },
                ]}
              />
            </Card>

            <Card size="small" title="Lịch sử thanh toán">
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detailTransactions}
                locale={{ emptyText: <Empty description="Chưa có phiếu chi nào cho đối tác này." /> }}
                columns={[
                  { title: 'Mã', key: 'code', width: 120, render: (_, row) => row.code },
                  { title: 'Ngày', key: 'at', width: 110, render: (_, row) => formatDate(row.at) },
                  { title: 'Loại', key: 'category', width: 130, render: (_, row) => TRANSACTION_CATEGORY_LABEL[row.category] },
                  { title: 'Số tiền', key: 'amount', align: 'right', render: (_, row) => formatMoney(row.amountVnd) },
                  { title: 'Diễn giải', key: 'note', render: (_, row) => row.note ?? '—' },
                ]}
              />
            </Card>

            {canPay ? (
              <Button type="primary" icon={<DollarOutlined />} onClick={() => setPayFor(detail)}>
                Thanh toán cho {detail.name}
              </Button>
            ) : null}
          </Space>
        ) : null}
      </Drawer>

      <PaymentModal
        open={!!payFor}
        onClose={() => setPayFor(undefined)}
        projects={projects ?? []}
        defaultSupplierId={payFor?.id}
      />

      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        Công nợ = tổng phiếu mua đã nhận − tổng phiếu chi cho đối tác. Phiếu mua ở trạng thái Nháp/Đã đặt/Huỷ chưa tính vào công nợ.
      </Typography.Paragraph>
    </div>
  );
}
