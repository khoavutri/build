import { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Empty, Input, InputNumber, Modal, Select, Space, Statistic, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ExportOutlined, PlusOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/database';
import { useAction } from '../../../hooks/useAction';
import { useRole } from '../../../app/RoleContext';
import { issueMaterialsToProject, listStockRows } from '../../../services/inventory';
import { can } from '../../../services/permissions';
import { formatDate } from '../../../utils/format';
import { formatMoney, formatQuantity } from '../../../utils/money';
import type { MaterialIssue, Project } from '../../../types';

interface IssueRowDraft {
  key: string;
  materialId?: string;
  quantity: number;
}

interface IssueLineRow {
  key: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  unitCostVnd: number;
  totalVnd: number;
  issueCode: string;
  createdAt: string;
  createdByName?: string;
}

export function MaterialsTab({ project }: { project: Project }) {
  const { actor, role } = useRole();
  const { message } = App.useApp();
  const { loading, run } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<IssueRowDraft[]>([{ key: 'row-1', quantity: 1 }]);

  const stockRows = useLiveQuery(() => listStockRows(), [], []);
  const issues = useLiveQuery(
    async () => (await db.materialIssues.where('projectId').equals(project.id).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [project.id],
    [],
  );
  const issueItems = useLiveQuery(() => db.materialIssueItems.toArray(), [], []);
  const movements = useLiveQuery(
    () => db.stockMovements.where('projectId').equals(project.id).toArray(),
    [project.id],
    [],
  );

  const materialById = useMemo(() => new Map((stockRows ?? []).map((row) => [row.material.id, row.material])), [stockRows]);

  const lines: IssueLineRow[] = useMemo(() => {
    const issueById = new Map((issues ?? []).map((issue) => [issue.id, issue]));
    return (issueItems ?? [])
      .filter((item) => issueById.has(item.issueId))
      .map((item) => {
        const issue = issueById.get(item.issueId) as MaterialIssue;
        const material = materialById.get(item.materialId);
        return {
          key: item.id,
          code: material?.code ?? '—',
          name: material?.name ?? '—',
          unit: material?.unit ?? '',
          quantity: item.quantity,
          unitCostVnd: item.unitCostVnd,
          totalVnd: Math.round(item.quantity * item.unitCostVnd),
          issueCode: issue.code,
          createdAt: issue.createdAt,
          createdByName: issue.createdByName,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [issueItems, issues, materialById]);

  const totalVnd = lines.reduce((sum, line) => sum + line.totalVnd, 0);
  const canIssue = can(role, 'material.issue');

  const stockByMaterial = useMemo(
    () => new Map((stockRows ?? []).map((row) => [row.material.id, row.quantity])),
    [stockRows],
  );

  const draftTotal = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const material = row.materialId ? materialById.get(row.materialId) : undefined;
        return sum + (material ? Math.round(row.quantity * material.avgCostVnd) : 0);
      }, 0),
    [rows, materialById],
  );

  const columns: TableColumnsType<IssueLineRow> = [
    { title: 'Phiếu xuất', key: 'issueCode', width: 130, render: (_, line) => line.issueCode },
    { title: 'Ngày', key: 'date', width: 110, render: (_, line) => formatDate(line.createdAt) },
    { title: 'Mã VT', key: 'code', width: 100, render: (_, line) => line.code },
    { title: 'Tên vật tư', key: 'name', render: (_, line) => line.name },
    { title: 'ĐVT', key: 'unit', width: 70, render: (_, line) => line.unit },
    { title: 'Số lượng', key: 'qty', width: 100, align: 'right', render: (_, line) => formatQuantity(line.quantity) },
    { title: 'Đơn giá', key: 'cost', width: 130, align: 'right', render: (_, line) => formatMoney(line.unitCostVnd) },
    { title: 'Thành tiền', key: 'total', width: 140, align: 'right', render: (_, line) => <span className="text-strong">{formatMoney(line.totalVnd)}</span> },
    { title: 'Người xuất', key: 'by', width: 150, render: (_, line) => line.createdByName ?? '—' },
  ];

  const submit = async () => {
    const payload = rows.filter((row) => row.materialId && row.quantity > 0);
    if (payload.length === 0) {
      message.warning('Chọn ít nhất một dòng vật tư với số lượng lớn hơn 0.');
      return;
    }
    await run(
      (op) =>
        issueMaterialsToProject(
          actor,
          {
            projectId: project.id,
            note,
            items: payload.map((row) => ({ materialId: row.materialId as string, quantity: row.quantity })),
          },
          { operationId: op },
        ),
      {
        successMessage: 'Đã xuất vật tư cho dự án và trừ tồn kho tổng',
        onSuccess: () => {
          setOpen(false);
          setRows([{ key: 'row-1', quantity: 1 }]);
          setNote('');
        },
      },
    );
  };

  return (
    <div>
      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 210 }}>
          <Statistic title="Tổng chi phí vật tư" value={formatMoney(totalVnd)} />
          <Typography.Text type="secondary">{issues?.length ?? 0} phiếu xuất cho dự án</Typography.Text>
        </Card>
        <Card size="small" style={{ minWidth: 210 }}>
          <Statistic title="Số dòng vật tư" value={lines.length} suffix="dòng" />
          <Typography.Text type="secondary">Bao gồm mọi lần xuất theo tiến độ</Typography.Text>
        </Card>
        <Card size="small" style={{ minWidth: 210 }}>
          <Statistic title="Biến động kho gắn dự án" value={movements?.length ?? 0} suffix="lần" />
          <Typography.Text type="secondary">
            Xuất kho {formatMoney(-(movements ?? []).filter((m) => m.type === 'ISSUE').reduce((sum, m) => sum + m.quantity * m.unitCostVnd, 0))}
          </Typography.Text>
        </Card>
        {canIssue ? (
          <Card size="small" style={{ minWidth: 210 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              Xuất vật tư cho DA
            </Button>
            <div className="text-muted" style={{ marginTop: 6 }}>
              Trừ tồn kho tổng và ghi phiếu xuất
            </div>
          </Card>
        ) : null}
      </Space>

      <Card size="small" title="Vật tư đã xuất cho dự án">
        <Table<IssueLineRow>
          rowKey="key"
          columns={columns}
          dataSource={lines}
          size="small"
          pagination={{ pageSize: 15, showSizeChanger: false }}
          scroll={{ x: 1100 }}
          locale={{ emptyText: <Empty description="Chưa xuất vật tư nào cho dự án này." /> }}
        />
      </Card>

      <Modal
        title={`Xuất vật tư cho ${project.code}`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        okText="Xuất vật tư"
        cancelText="Huỷ"
        confirmLoading={loading}
        width={760}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title="Phiếu xuất sẽ trừ tồn kho tổng và ghi biến động kho theo dự án. Không thể xuất vượt tồn hiện có."
        />
        <Space orientation="vertical" style={{ width: '100%' }} size={8}>
          {rows.map((row) => {
            const stock = row.materialId ? stockByMaterial.get(row.materialId) ?? 0 : undefined;
            return (
              <Space key={row.key} size={8} style={{ width: '100%' }} align="start">
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn vật tư từ kho tổng"
                  style={{ width: 420 }}
                  value={row.materialId}
                  options={(stockRows ?? []).map((item) => ({
                    value: item.material.id,
                    label: `${item.material.code} — ${item.material.name} (tồn ${formatQuantity(item.quantity)} ${item.material.unit})`,
                  }))}
                  onChange={(value) =>
                    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, materialId: value, quantity: 1 } : r)))
                  }
                />
                <InputNumber
                  min={0}
                  step={1}
                  style={{ width: 110 }}
                  value={row.quantity}
                  onChange={(value) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, quantity: Number(value ?? 0) } : r)))}
                />
                <div style={{ lineHeight: '34px', minWidth: 190 }} className="text-muted">
                  {row.materialId
                    ? `Tồn ${formatQuantity(stock ?? 0)} ${materialById.get(row.materialId)?.unit ?? ''} · ${formatMoney(
                        Math.round(row.quantity * (materialById.get(row.materialId)?.avgCostVnd ?? 0)),
                      )}`
                    : 'Chưa chọn vật tư'}
                </div>
                {rows.length > 1 ? (
                  <Button type="text" danger onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}>
                    Xoá
                  </Button>
                ) : null}
              </Space>
            );
          })}
          <Button
            icon={<PlusOutlined />}
            onClick={() => setRows((prev) => [...prev, { key: `row-${Date.now()}`, quantity: 1 }])}
            type="dashed"
            style={{ width: 200 }}
          >
            Thêm dòng vật tư
          </Button>
          <Input.TextArea rows={2} placeholder="Ghi chú phiếu xuất (hạng mục, khu vực sử dụng...)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Typography.Text>
            Tạm tính giá trị xuất kho: <strong>{formatMoney(draftTotal)}</strong> (theo giá bình quân hiện tại của kho tổng)
          </Typography.Text>
        </Space>
      </Modal>

      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        <ExportOutlined /> Dữ liệu kho gắn dự án dùng để tính chi phí vật tư trong báo cáo lợi nhuận tạm tính. Mọi thao tác xuất kho được ghi nhật ký.
      </Typography.Paragraph>
    </div>
  );
}
