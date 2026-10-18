import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { CheckOutlined, EditOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '../../components/PageHeader';
import { StatusTag } from '../../components/StatusTag';
import { useAction } from '../../hooks/useAction';
import { useRole } from '../../app/RoleContext';
import { useUrlState } from '../../hooks/useUrlState';
import { db } from '../../db/database';
import {
  adjustStock,
  createPurchaseOrder,
  issueMaterialsToProject,
  listStockRows,
  receivePurchaseOrder,
  saveMaterial,
  setPurchaseStatus,
  type StockRow,
} from '../../services/inventory';
import { can } from '../../services/permissions';
import { formatDate } from '../../utils/format';
import { formatMoney, formatQuantity, parseMoneyInput } from '../../utils/money';
import { MOVEMENT_TYPE_META } from '../../utils/status';
import { matchesSearch } from '../../utils/text';
import type { Material, MaterialIssue, PurchaseOrder } from '../../types';

interface DraftLine {
  key: string;
  materialId?: string;
  quantity: number;
  unitCostVnd: number;
}

/** Bộ đếm dòng nháp: khoá chỉ cần duy nhất trong phiên soạn, không cần ngẫu nhiên */
let draftLineSeq = 0;
function newDraftLineKey(): string {
  draftLineSeq += 1;
  return `line-${draftLineSeq}`;
}

export function MaterialsPage() {
  const { actor, role } = useRole();
  const { message } = App.useApp();
  const { loading, run } = useAction();
  const [filters, setFilters] = useUrlState<{ tab?: string; q?: string; movementType?: string; projectId?: string }>({
    tab: 'catalog',
    q: undefined,
    movementType: undefined,
    projectId: undefined,
  });

  const stockRows = useLiveQuery(() => listStockRows(), [], []);
  const materials = useMemo(() => (stockRows ?? []).map((row) => row.material), [stockRows]);
  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const suppliers = useLiveQuery(() => db.suppliers.orderBy('name').toArray(), [], []);
  const purchaseOrders = useLiveQuery(
    async () => (await db.purchaseOrders.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [],
    [],
  );
  const issues = useLiveQuery(async () => (await db.materialIssues.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [], []);
  const issueItems = useLiveQuery(() => db.materialIssueItems.toArray(), [], []);
  const movements = useLiveQuery(async () => (await db.stockMovements.toArray()).sort((a, b) => b.at.localeCompare(a.at)), [], []);

  const [materialModal, setMaterialModal] = useState<{ open: boolean; editing?: Material }>({ open: false });
  const [materialForm] = Form.useForm<{ name: string; unit: string; avgCostVnd: number; minQuantity?: number; openingQuantity?: number }>();

  const [stockCheck, setStockCheck] = useState<StockRow>();
  const [stockCheckForm] = Form.useForm<{ actualQuantity: number; reason: string }>();

  const [poOpen, setPoOpen] = useState(false);
  const [poForm] = Form.useForm<{ supplierId: string; projectId?: string; note?: string }>();
  const [poLines, setPoLines] = useState<DraftLine[]>([]);

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm] = Form.useForm<{ projectId: string; note?: string }>();
  const [issueLines, setIssueLines] = useState<DraftLine[]>([]);

  const [detailIssue, setDetailIssue] = useState<MaterialIssue>();

  const canPurchase = can(role, 'material.purchase');
  const canIssue = can(role, 'material.issue');
  const canAdjust = can(role, 'material.adjust');

  const keyword = filters.q ?? '';
  const filteredStock = useMemo(
    () => (stockRows ?? []).filter((row) => matchesSearch([row.material.code, row.material.name], keyword)),
    [stockRows, keyword],
  );
  const filteredMovements = useMemo(
    () =>
      (movements ?? []).filter((row) => {
        if (filters.movementType && row.type !== filters.movementType) return false;
        if (filters.projectId && row.projectId !== filters.projectId) return false;
        return true;
      }),
    [movements, filters.movementType, filters.projectId],
  );

  const stockValue = (stockRows ?? []).reduce((sum, row) => sum + row.valueVnd, 0);
  const lowCount = (stockRows ?? []).filter((row) => row.low).length;

  const newLine = (): DraftLine => ({ key: newDraftLineKey(), quantity: 1, unitCostVnd: 0 });

  const submitMaterial = async () => {
    const values = await materialForm.validateFields();
    await run(() => saveMaterial(actor, values, { id: materialModal.editing?.id, openingQuantity: values.openingQuantity }), {
      successMessage: materialModal.editing ? 'Đã lưu vật tư' : 'Đã thêm vật tư vào danh mục',
      onSuccess: () => setMaterialModal({ open: false }),
    });
  };

  const submitStockCheck = async () => {
    if (!stockCheck) return;
    const values = await stockCheckForm.validateFields();
    await run(() => adjustStock(actor, stockCheck.material.id, values.actualQuantity, values.reason), {
      successMessage: 'Đã điều chỉnh tồn kho theo kiểm kê',
      onSuccess: () => setStockCheck(undefined),
    });
  };

  const submitPo = async () => {
    const values = await poForm.validateFields();
    const lines = poLines.filter((line) => line.materialId && line.quantity > 0);
    if (lines.length === 0) {
      message.warning('Thêm ít nhất một dòng vật tư cho phiếu mua.');
      return;
    }
    await run(
      (op) =>
        createPurchaseOrder(
          actor,
          {
            supplierId: values.supplierId,
            projectId: values.projectId,
            note: values.note,
            items: lines.map((line) => ({ materialId: line.materialId as string, quantity: line.quantity, unitCostVnd: line.unitCostVnd })),
          },
          { operationId: op },
        ),
      {
        successMessage: 'Đã tạo phiếu mua hàng',
        onSuccess: () => {
          setPoOpen(false);
          setPoLines([]);
        },
      },
    );
  };

  const submitIssue = async () => {
    const values = await issueForm.validateFields();
    const lines = issueLines.filter((line) => line.materialId && line.quantity > 0);
    if (lines.length === 0) {
      message.warning('Thêm ít nhất một dòng vật tư cần xuất.');
      return;
    }
    await run(
      (op) =>
        issueMaterialsToProject(
          actor,
          { projectId: values.projectId, note: values.note, items: lines.map((line) => ({ materialId: line.materialId as string, quantity: line.quantity })) },
          { operationId: op },
        ),
      {
        successMessage: 'Đã xuất vật tư cho công trình',
        onSuccess: () => {
          setIssueOpen(false);
          setIssueLines([]);
        },
      },
    );
  };

  const catalogColumns: TableColumnsType<StockRow> = [
    { title: 'Mã VT', key: 'code', width: 100, render: (_, row) => <span className="text-strong">{row.material.code}</span> },
    { title: 'Tên vật tư', key: 'name', render: (_, row) => row.material.name },
    { title: 'ĐVT', key: 'unit', width: 80, render: (_, row) => row.material.unit },
    {
      title: 'Tồn kho',
      key: 'qty',
      width: 130,
      align: 'right',
      render: (_, row) => (
        <span style={row.low ? { color: '#c0392b', fontWeight: 600 } : undefined}>{formatQuantity(row.quantity)}</span>
      ),
    },
    { title: 'Định mức tối thiểu', key: 'min', width: 140, align: 'right', render: (_, row) => formatQuantity(row.material.minQuantity) },
    { title: 'Giá bình quân', key: 'avg', width: 140, align: 'right', render: (_, row) => formatMoney(row.material.avgCostVnd) },
    { title: 'Giá trị tồn', key: 'value', width: 150, align: 'right', render: (_, row) => <span className="text-strong">{formatMoney(row.valueVnd)}</span> },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 200,
      render: (_, row) => (
        <Space size={4}>
          {canAdjust ? (
            <Button
              size="small"
              onClick={() => {
                setStockCheck(row);
                stockCheckForm.setFieldsValue({ actualQuantity: row.quantity, reason: '' });
              }}
            >
              Kiểm kê
            </Button>
          ) : null}
          {canAdjust ? (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setMaterialModal({ open: true, editing: row.material });
                materialForm.setFieldsValue({
                  name: row.material.name,
                  unit: row.material.unit,
                  avgCostVnd: row.material.avgCostVnd,
                  minQuantity: row.material.minQuantity,
                });
              }}
            />
          ) : null}
        </Space>
      ),
    },
  ];

  const poColumns: TableColumnsType<PurchaseOrder> = [
    { title: 'Mã phiếu', key: 'code', width: 130, render: (_, row) => <span className="text-strong">{row.code}</span> },
    {
      title: 'Nhà cung cấp',
      key: 'supplier',
      width: 220,
      render: (_, row) => suppliers.find((s) => s.id === row.supplierId)?.name ?? '—',
    },
    {
      title: 'Dự án',
      key: 'project',
      width: 200,
      render: (_, row) => (row.projectId ? projectById.get(row.projectId)?.code ?? '—' : <span className="text-muted">Không gắn</span>),
    },
    { title: 'Số dòng', key: 'items', width: 90, align: 'right', render: (_, row) => row.itemCount },
    { title: 'Tổng tiền', key: 'total', width: 150, align: 'right', render: (_, row) => <span className="text-strong">{formatMoney(row.totalVnd)}</span> },
    { title: 'Ngày tạo', key: 'created', width: 110, render: (_, row) => formatDate(row.createdAt) },
    { title: 'Trạng thái', key: 'status', width: 120, render: (_, row) => <StatusTag kind="purchase" status={row.status} /> },
    { title: 'Ghi chú', key: 'note', render: (_, row) => row.note ?? '—' },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 210,
      render: (_, row) =>
        canPurchase ? (
          <Space size={4}>
            {row.status !== 'RECEIVED' && row.status !== 'CANCELLED' ? (
              <Popconfirm
                title="Nhận hàng cho phiếu này?"
                description="Tồn kho tổng sẽ được cộng và giá bình quân cập nhật; công nợ NCC tăng theo giá trị phiếu."
                onConfirm={() => void run(() => receivePurchaseOrder(actor, row.id), { successMessage: `Đã nhận hàng phiếu ${row.code}` })}
              >
                <Button size="small" type="primary" icon={<CheckOutlined />}>
                  Nhận hàng
                </Button>
              </Popconfirm>
            ) : null}
            {row.status === 'DRAFT' ? (
              <Button
                size="small"
                onClick={() => void run(() => setPurchaseStatus(actor, row.id, 'ORDERED'), { successMessage: 'Đã chuyển phiếu sang trạng thái Đã đặt' })}
              >
                Đặt hàng
              </Button>
            ) : null}
            {row.status !== 'RECEIVED' && row.status !== 'CANCELLED' ? (
              <Popconfirm title="Huỷ phiếu mua này?" onConfirm={() => void run(() => setPurchaseStatus(actor, row.id, 'CANCELLED'), { successMessage: 'Đã huỷ phiếu mua' })}>
                <Button size="small" danger type="text" icon={<StopOutlined />} />
              </Popconfirm>
            ) : null}
          </Space>
        ) : null,
    },
  ];

  const issueColumns: TableColumnsType<MaterialIssue> = [
    { title: 'Mã phiếu', key: 'code', width: 130, render: (_, row) => <span className="text-strong">{row.code}</span> },
    {
      title: 'Dự án',
      key: 'project',
      render: (_, row) => {
        const project = projectById.get(row.projectId);
        return project ? (
          <div>
            <div className="text-strong">{project.code}</div>
            <div className="text-muted">{project.name}</div>
          </div>
        ) : (
          '—'
        );
      },
    },
    { title: 'Số dòng', key: 'items', width: 90, align: 'right', render: (_, row) => row.itemCount },
    { title: 'Giá trị xuất', key: 'total', width: 150, align: 'right', render: (_, row) => <span className="text-strong">{formatMoney(row.totalVnd)}</span> },
    { title: 'Ngày xuất', key: 'created', width: 110, render: (_, row) => formatDate(row.createdAt) },
    { title: 'Người xuất', key: 'by', width: 150, render: (_, row) => row.createdByName ?? '—' },
    {
      title: '',
      key: 'detail',
      width: 100,
      render: (_, row) => (
        <Button size="small" onClick={() => setDetailIssue(row)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  const movementColumns: TableColumnsType<(typeof movements)[number]> = [
    { title: 'Thời điểm', key: 'at', width: 150, render: (_, row) => formatDate(row.at) },
    { title: 'Mã VT', key: 'code', width: 100, render: (_, row) => materialById.get(row.materialId)?.code ?? '—' },
    { title: 'Tên vật tư', key: 'name', render: (_, row) => materialById.get(row.materialId)?.name ?? '—' },
    { title: 'Loại', key: 'type', width: 140, render: (_, row) => <Tag color={MOVEMENT_TYPE_META[row.type].color}>{MOVEMENT_TYPE_META[row.type].label}</Tag> },
    {
      title: 'Số lượng ±',
      key: 'qty',
      width: 120,
      align: 'right',
      render: (_, row) => (
        <span style={row.quantity < 0 ? { color: '#c0392b' } : { color: '#2f7d32' }}>
          {row.quantity > 0 ? '+' : ''}
          {formatQuantity(row.quantity)} {materialById.get(row.materialId)?.unit}
        </span>
      ),
    },
    { title: 'Đơn giá', key: 'cost', width: 130, align: 'right', render: (_, row) => formatMoney(row.unitCostVnd) },
    { title: 'Giá trị', key: 'value', width: 140, align: 'right', render: (_, row) => formatMoney(Math.round(row.quantity * row.unitCostVnd)) },
    {
      title: 'Dự án',
      key: 'project',
      width: 180,
      render: (_, row) => (row.projectId ? projectById.get(row.projectId)?.code ?? '—' : <span className="text-muted">Kho tổng</span>),
    },
    { title: 'Diễn giải', key: 'note', render: (_, row) => row.note ?? '—' },
  ];

  const renderLines = (lines: DraftLine[], setLines: (next: DraftLine[]) => void, showCost: boolean) => (
    <Space orientation="vertical" style={{ width: '100%' }} size={8}>
      {lines.map((line) => (
        <Space key={line.key} size={8} style={{ width: '100%' }} align="start">
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Chọn vật tư"
            style={{ width: 320 }}
            value={line.materialId}
            options={materials.map((material) => ({
              value: material.id,
              label: `${material.code} — ${material.name} (${material.unit})`,
            }))}
            onChange={(value) =>
              setLines(
                lines.map((r) =>
                  r.key === line.key
                    ? { ...r, materialId: value, unitCostVnd: showCost ? materialById.get(value)?.avgCostVnd ?? r.unitCostVnd : r.unitCostVnd }
                    : r,
                ),
              )
            }
          />
          <InputNumber
            min={0}
            step={1}
            style={{ width: 110 }}
            value={line.quantity}
            onChange={(value) => setLines(lines.map((r) => (r.key === line.key ? { ...r, quantity: Number(value ?? 0) } : r)))}
          />
          {showCost ? (
            <InputNumber<number>
              min={0}
              step={10000}
              style={{ width: 150 }}
              value={line.unitCostVnd}
              formatter={(value) => (value == null ? '' : Number(value).toLocaleString('vi-VN'))}
              parser={(value) => parseMoneyInput(value) ?? 0}
              onChange={(value) => setLines(lines.map((r) => (r.key === line.key ? { ...r, unitCostVnd: Number(value ?? 0) } : r)))}
            />
          ) : null}
          <Button type="text" danger onClick={() => setLines(lines.filter((r) => r.key !== line.key))}>
            Xoá
          </Button>
        </Space>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} style={{ width: 220 }} onClick={() => setLines([...lines, newLine()])}>
        Thêm dòng
      </Button>
    </Space>
  );

  const items = [
    {
      key: 'catalog',
      label: 'Danh mục & tồn kho',
      children: (
        <Card
          size="small"
          extra={
            canAdjust ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setMaterialModal({ open: true });
                  materialForm.resetFields();
                  materialForm.setFieldsValue({ unit: 'm²', avgCostVnd: 0 });
                }}
              >
                Thêm vật tư
              </Button>
            ) : null
          }
        >
          <Alert
            type={lowCount > 0 ? 'warning' : 'info'}
            showIcon
            style={{ marginBottom: 12 }}
            title={`Tổng giá trị tồn kho ${formatMoney(stockValue)} · ${lowCount} vật tư dưới định mức tối thiểu`}
          />
          <Table<StockRow>
            rowKey={(row) => row.material.id}
            columns={catalogColumns}
            dataSource={filteredStock}
            size="small"
            pagination={{ pageSize: 15, showSizeChanger: false }}
            loading={stockRows === undefined}
            scroll={{ x: 1150 }}
            rowClassName={(row) => (row.low ? 'row-warning' : '')}
            locale={{ emptyText: <Empty description="Không có vật tư phù hợp." /> }}
          />
        </Card>
      ),
    },
    {
      key: 'purchases',
      label: `Nhập hàng (${(purchaseOrders ?? []).length})`,
      children: (
        <Card
          size="small"
          extra={
            canPurchase ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setPoOpen(true);
                  poForm.resetFields();
                  setPoLines([newLine()]);
                }}
              >
                Tạo phiếu mua
              </Button>
            ) : null
          }
        >
          <Table<PurchaseOrder>
            rowKey="id"
            columns={poColumns}
            dataSource={purchaseOrders ?? []}
            size="small"
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 1350 }}
            locale={{ emptyText: <Empty description="Chưa có phiếu mua nào." /> }}
          />
        </Card>
      ),
    },
    {
      key: 'issues',
      label: `Xuất công trình (${(issues ?? []).length})`,
      children: (
        <Card
          size="small"
          extra={
            canIssue ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setIssueOpen(true);
                  issueForm.resetFields();
                  setIssueLines([newLine()]);
                }}
              >
                Xuất vật tư
              </Button>
            ) : null
          }
        >
          <Table<MaterialIssue>
            rowKey="id"
            columns={issueColumns}
            dataSource={issues ?? []}
            size="small"
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 1000 }}
            locale={{ emptyText: <Empty description="Chưa có phiếu xuất công trình nào." /> }}
          />
        </Card>
      ),
    },
    {
      key: 'movements',
      label: `Phiếu kho (${filteredMovements.length})`,
      children: (
        <Card size="small">
          <div className="page-toolbar">
            <Select
              allowClear
              placeholder="Loại biến động"
              style={{ width: 200 }}
              value={filters.movementType}
              onChange={(value) => setFilters({ movementType: value })}
              options={[
                { value: 'RECEIPT', label: 'Nhập kho' },
                { value: 'ISSUE', label: 'Xuất công trình' },
                { value: 'ADJUST', label: 'Điều chỉnh' },
              ]}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Lọc theo dự án"
              style={{ width: 260 }}
              value={filters.projectId}
              onChange={(value) => setFilters({ projectId: value })}
              options={(projects ?? []).map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
            />
            <span className="text-muted">Hiển thị {filteredMovements.length} biến động kho</span>
          </div>
          <Table
            rowKey="id"
            columns={movementColumns}
            dataSource={filteredMovements}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 1300 }}
            locale={{ emptyText: <Empty description="Không có biến động kho phù hợp." /> }}
          />
        </Card>
      ),
    },
  ];

  const detailLines = (issueItems ?? []).filter((item) => item.issueId === detailIssue?.id);

  return (
    <div>
      <PageHeader
        title="Vật tư & kho công trình"
        subtitle="Danh mục vật tư, nhập hàng theo NCC, xuất vật tư cho dự án và theo dõi mọi biến động kho tổng."
        extra={[
          <Input.Search
            key="search"
            allowClear
            placeholder="Tìm vật tư theo mã/tên..."
            style={{ width: 280 }}
            value={filters.q}
            onChange={(e) => setFilters({ q: e.target.value })}
          />,
        ]}
      />

      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Giá trị tồn kho" value={formatMoney(stockValue)} />
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Vật tư dưới định mức" value={lowCount} suffix="mã" styles={{ content: { color: lowCount > 0 ? '#c0392b' : undefined } }} />
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Phiếu mua đang xử lý" value={(purchaseOrders ?? []).filter((po) => po.status === 'ORDERED' || po.status === 'DRAFT').length} suffix="phiếu" />
        </Card>
      </Space>

      <Tabs activeKey={filters.tab ?? 'catalog'} onChange={(key) => setFilters({ tab: key })} items={items} />

      <Modal
        title={materialModal.editing ? `Sửa vật tư ${materialModal.editing.code}` : 'Thêm vật tư mới'}
        open={materialModal.open}
        onCancel={() => setMaterialModal({ open: false })}
        onOk={() => void submitMaterial()}
        okText="Lưu vật tư"
        cancelText="Huỷ"
        confirmLoading={loading}
        destroyOnHidden
      >
        <Form form={materialForm} layout="vertical">
          <Form.Item name="name" label="Tên vật tư" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Ví dụ: Gạch Granite 80×80 Đồng Tâm" />
          </Form.Item>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="unit" label="Đơn vị tính" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Input placeholder="m², tấm, bộ..." />
            </Form.Item>
            <Form.Item name="avgCostVnd" label="Giá bình quân (₫)" style={{ flex: 1 }} rules={[{ required: true }]}>
              <InputNumber<number>
                min={0}
                step={10000}
                style={{ width: '100%' }}
                formatter={(value) => (value == null ? '' : Number(value).toLocaleString('vi-VN'))}
                parser={(value) => parseMoneyInput(value) ?? 0}
              />
            </Form.Item>
            <Form.Item name="minQuantity" label="Định mức tối thiểu" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          {!materialModal.editing ? (
            <Form.Item name="openingQuantity" label="Tồn đầu kỳ (nếu đã có sẵn trong kho)">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title={`Kiểm kê ${stockCheck?.material.code ?? ''}`}
        open={!!stockCheck}
        onCancel={() => setStockCheck(undefined)}
        onOk={() => void submitStockCheck()}
        okText="Cập nhật tồn kho"
        cancelText="Huỷ"
        confirmLoading={loading}
        destroyOnHidden
      >
        <Form form={stockCheckForm} layout="vertical">
          <Typography.Paragraph type="secondary">
            Tồn hệ thống hiện tại: <strong>{formatQuantity(stockCheck?.quantity)} {stockCheck?.material.unit}</strong>. Nhập số đếm thực tế, hệ thống ghi
            biến động điều chỉnh kèm lý do.
          </Typography.Paragraph>
          <Form.Item name="actualQuantity" label="Tồn thực tế" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="Lý do điều chỉnh" rules={[{ required: true, min: 3 }]}>
            <Input.TextArea rows={2} placeholder="Ví dụ: hao hụt khi thi công, hàng trả lại NCC..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Tạo phiếu mua hàng"
        open={poOpen}
        onCancel={() => setPoOpen(false)}
        onOk={() => void submitPo()}
        okText="Lưu phiếu mua"
        cancelText="Huỷ"
        confirmLoading={loading}
        width={820}
        destroyOnHidden
      >
        <Form form={poForm} layout="vertical">
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="supplierId" label="Nhà cung cấp" style={{ flex: 2 }} rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Chọn NCC vật tư"
                options={suppliers.filter((s) => s.type === 'MATERIAL').map((s) => ({ value: s.id, label: `${s.name} — ${s.phone}` }))}
              />
            </Form.Item>
            <Form.Item name="projectId" label="Dự án (tuỳ chọn)" style={{ flex: 2 }}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Gắn cho dự án nào"
                options={(projects ?? []).map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
              />
            </Form.Item>
          </Space>
          <Typography.Text type="secondary">Dòng vật tư: chọn vật tư, số lượng và đơn giá mua thực tế.</Typography.Text>
          <div style={{ marginTop: 8 }}>{renderLines(poLines, setPoLines, true)}</div>
          <Form.Item name="note" label="Ghi chú" style={{ marginTop: 12 }}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Xuất vật tư cho công trình"
        open={issueOpen}
        onCancel={() => setIssueOpen(false)}
        onOk={() => void submitIssue()}
        okText="Xuất kho"
        cancelText="Huỷ"
        confirmLoading={loading}
        width={760}
        destroyOnHidden
      >
        <Form form={issueForm} layout="vertical">
          <Form.Item name="projectId" label="Dự án nhận vật tư" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={(projects ?? []).map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
            />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Khu vực/hạng mục sử dụng vật tư" />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary">Hệ thống chặn xuất vượt tồn kho tổng và ghi biến động kho theo dự án.</Typography.Text>
        <div style={{ marginTop: 8 }}>{renderLines(issueLines, setIssueLines, false)}</div>
      </Modal>

      <Drawer
        title={detailIssue ? `Phiếu xuất ${detailIssue.code}` : ''}
        size={640}
        open={!!detailIssue}
        onClose={() => setDetailIssue(undefined)}
        destroyOnHidden
      >
        {detailIssue ? (
          <Space orientation="vertical" style={{ width: '100%' }}>
            <div>
              <span className="text-muted">Dự án: </span>
              <strong>{projectById.get(detailIssue.projectId)?.name ?? '—'}</strong>
            </div>
            <div>
              <span className="text-muted">Ngày xuất: </span>
              {formatDate(detailIssue.createdAt)} <span className="text-muted">· Người xuất: </span>
              {detailIssue.createdByName ?? '—'}
            </div>
            {detailIssue.note ? (
              <Typography.Text type="secondary">
                Ghi chú: {detailIssue.note}
              </Typography.Text>
            ) : null}
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detailLines}
              columns={[
                { title: 'Mã VT', key: 'code', width: 100, render: (_, row) => materialById.get(row.materialId)?.code ?? '—' },
                { title: 'Tên vật tư', key: 'name', render: (_, row) => materialById.get(row.materialId)?.name ?? '—' },
                { title: 'Số lượng', key: 'qty', width: 100, align: 'right', render: (_, row) => formatQuantity(row.quantity) },
                { title: 'Đơn giá', key: 'cost', width: 120, align: 'right', render: (_, row) => formatMoney(row.unitCostVnd) },
                { title: 'Thành tiền', key: 'total', width: 130, align: 'right', render: (_, row) => formatMoney(Math.round(row.quantity * row.unitCostVnd)) },
              ]}
            />
            <Typography.Text>
              Tổng giá trị phiếu: <strong>{formatMoney(detailIssue.totalVnd)}</strong>
            </Typography.Text>
          </Space>
        ) : null}
      </Drawer>

      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        Ngày xuất kho dùng cho báo cáo chi phí vật tư; giá bình quân cập nhật theo từng lần nhận hàng để bám sát giá thực tế.
      </Typography.Paragraph>
    </div>
  );
}
