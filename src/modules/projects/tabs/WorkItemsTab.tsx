import { useMemo, useState } from 'react';
import { App, Button, Card, DatePicker, Empty, Form, Input, InputNumber, Modal, Progress, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAction } from '../../../hooks/useAction';
import { useRole } from '../../../app/RoleContext';
import { deleteWorkItem, saveWorkItem, updateWorkItemProgress, ZONES } from '../../../services/workItems';
import { can } from '../../../services/permissions';
import { formatDate, toDateKey } from '../../../utils/format';
import { formatQuantity } from '../../../utils/money';
import { WORK_ITEM_STATUS_META } from '../../../utils/status';
import type { Project, WorkItem, WorkItemStatus } from '../../../types';

const PROGRESS_STEPS = [0, 25, 50, 75, 100];

interface WorkItemFormValues {
  zone: string;
  name: string;
  unit: string;
  quantity: number;
  assignedTo?: string;
  startDate?: dayjs.Dayjs | null;
  endDate?: dayjs.Dayjs | null;
  status: WorkItemStatus;
  progressPct: number;
  note?: string;
}

export function WorkItemsTab({ project, items }: { project: Project; items: WorkItem[] }) {
  const { actor, role } = useRole();
  const { modal } = App.useApp();
  const { loading, run } = useAction();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkItem>();
  const [form] = Form.useForm<WorkItemFormValues>();
  const canManage = can(role, 'workItem.manage');

  const grouped = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const item of items) {
      map.set(item.zone, [...(map.get(item.zone) ?? []), item]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ zone: ZONES[0], unit: 'm²', quantity: 1, status: 'TODO', progressPct: 0 });
    setOpen(true);
  };

  const openEdit = (item: WorkItem) => {
    setEditing(item);
    form.setFieldsValue({
      zone: item.zone,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      assignedTo: item.assignedTo,
      startDate: item.startDate ? dayjs(item.startDate) : null,
      endDate: item.endDate ? dayjs(item.endDate) : null,
      status: item.status,
      progressPct: item.progressPct,
      note: item.note,
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    await run(
      () =>
        saveWorkItem(
          actor,
          {
            projectId: project.id,
            zone: values.zone,
            name: values.name,
            unit: values.unit,
            quantity: values.quantity,
            assignedTo: values.assignedTo,
            startDate: values.startDate ? toDateKey(values.startDate) : undefined,
            endDate: values.endDate ? toDateKey(values.endDate) : undefined,
            status: values.status,
            progressPct: values.progressPct,
            note: values.note,
          },
          { id: editing?.id },
        ),
      {
        successMessage: editing ? 'Đã lưu hạng mục' : 'Đã thêm hạng mục',
        onSuccess: () => setOpen(false),
      },
    );
  };

  const columns: TableColumnsType<WorkItem> = [
    { title: 'Hạng mục', key: 'name', width: 300, render: (_, item) => <span className="text-strong">{item.name}</span> },
    { title: 'ĐVT', key: 'unit', width: 80, render: (_, item) => item.unit },
    { title: 'Khối lượng', key: 'qty', width: 100, align: 'right', render: (_, item) => formatQuantity(item.quantity) },
    { title: 'Tổ phụ trách', key: 'crew', width: 170, render: (_, item) => item.assignedTo ?? <span className="text-muted">Chưa gán</span> },
    {
      title: 'Thời gian',
      key: 'period',
      width: 190,
      render: (_, item) => (
        <span className="text-muted">
          {formatDate(item.startDate)} → {formatDate(item.endDate)}
        </span>
      ),
    },
    {
      title: 'Tiến độ',
      key: 'progress',
      width: 230,
      render: (_, item) =>
        canManage ? (
          <Select
            size="small"
            value={item.progressPct}
            style={{ width: 92 }}
            options={PROGRESS_STEPS.map((step) => ({ value: step, label: `${step}%` }))}
            onChange={(value) =>
              void run(() => updateWorkItemProgress(actor, item.id, value), { successMessage: `Đã cập nhật tiến độ "${item.name}" → ${value}%` })
            }
          />
        ) : (
          <Progress percent={item.progressPct} size="small" strokeColor="#a16207" />
        ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, item) => {
        const meta = WORK_ITEM_STATUS_META[item.status];
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_, item) =>
        canManage ? (
          <Space size={2}>
            <Button size="small" type="link" onClick={() => openEdit(item)}>
              Sửa
            </Button>
            <Tooltip title="Chỉ xoá được hạng mục chưa nghiệm thu">
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: `Xoá hạng mục "${item.name}"?`,
                    content: 'Hạng mục và tiến độ hiện tại sẽ bị xoá khỏi dự án. Thao tác không ảnh hưởng chứng từ vật tư đã xuất.',
                    okText: 'Xoá hạng mục',
                    okButtonProps: { danger: true },
                    onOk: () => void run(() => deleteWorkItem(actor, item.id), { successMessage: 'Đã xoá hạng mục' }),
                  })
                }
              />
            </Tooltip>
          </Space>
        ) : null,
    },
  ];

  return (
    <div>
      <Card
        size="small"
        style={{ marginBottom: 12 }}
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Thêm hạng mục
            </Button>
          ) : null
        }
      >
        <Space wrap size={16}>
          <span>
            <span className="text-muted">Tổng hạng mục: </span>
            <strong>{items.length}</strong>
          </span>
          <span>
            <span className="text-muted">Đã xong / nghiệm thu: </span>
            <strong>{items.filter((i) => i.status === 'DONE' || i.status === 'ACCEPTED').length}</strong>
          </span>
          <span>
            <span className="text-muted">Đang làm: </span>
            <strong>{items.filter((i) => i.status === 'DOING').length}</strong>
          </span>
          <span>
            <span className="text-muted">Quá hạn: </span>
            <strong style={{ color: '#c0392b' }}>
              {items.filter((i) => i.endDate && i.endDate < toDateKey(new Date()) && i.status !== 'DONE' && i.status !== 'ACCEPTED').length}
            </strong>
          </span>
        </Space>
        <Progress
          percent={items.length ? Math.round(items.reduce((sum, i) => sum + i.progressPct, 0) / items.length) : 0}
          strokeColor="#a16207"
          style={{ marginTop: 8, maxWidth: 420 }}
        />
      </Card>

      {grouped.length === 0 ? (
        <Card>
          <Empty description="Dự án chưa có hạng mục nào." />
        </Card>
      ) : (
        grouped.map(([zone, zoneItems]) => (
          <Card key={zone} size="small" title={`Khu vực: ${zone}`} style={{ marginBottom: 12 }}>
            <Table<WorkItem>
              rowKey="id"
              columns={columns}
              dataSource={zoneItems}
              size="small"
              pagination={false}
              rowClassName={(item) => (item.endDate && item.endDate < toDateKey(new Date()) && item.status !== 'DONE' && item.status !== 'ACCEPTED' ? 'row-overdue' : '')}
              locale={{ emptyText: <Empty description="Chưa có hạng mục" /> }}
            />
          </Card>
        ))
      )}

      <Modal
        title={editing ? 'Sửa hạng mục' : 'Thêm hạng mục thi công'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        okText={editing ? 'Lưu hạng mục' : 'Thêm hạng mục'}
        cancelText="Huỷ"
        confirmLoading={loading}
        destroyOnHidden
        width={640}
      >
        <Form form={form} layout="vertical">
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="zone" label="Khu vực" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select showSearch options={ZONES.map((zone) => ({ value: zone, label: zone }))} />
            </Form.Item>
            <Form.Item name="name" label="Tên hạng mục" style={{ flex: 2 }} rules={[{ required: true, min: 3 }]}>
              <Input placeholder="Ví dụ: Làm trần thạch cao phẳng" />
            </Form.Item>
          </Space>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="unit" label="ĐVT" style={{ width: 100 }} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="quantity" label="Khối lượng" style={{ flex: 1 }} rules={[{ required: true }]}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="assignedTo" label="Tổ phụ trách" style={{ flex: 1.5 }}>
              <Input placeholder="Ví dụ: Tổ mộc anh Phú" />
            </Form.Item>
          </Space>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="startDate" label="Bắt đầu" style={{ flex: 1 }}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="endDate" label="Kết thúc dự kiến" style={{ flex: 1 }}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="status" label="Trạng thái" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select
                options={(Object.keys(WORK_ITEM_STATUS_META) as WorkItemStatus[]).map((status) => ({
                  value: status,
                  label: WORK_ITEM_STATUS_META[status].label,
                }))}
                onChange={(value) => {
                  if (value === 'DONE' || value === 'ACCEPTED') form.setFieldValue('progressPct', 100);
                }}
              />
            </Form.Item>
            <Form.Item name="progressPct" label="% hoàn thành" style={{ flex: 1 }} rules={[{ required: true }]}>
              <InputNumber min={0} max={100} step={5} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        Tiến độ tổng của dự án là trung bình % hoàn thành của tất cả hạng mục; hạng mục đạt 100% có thể chuyển sang "Đã nghiệm thu" từ biên bản nghiệm thu.
      </Typography.Paragraph>
    </div>
  );
}
