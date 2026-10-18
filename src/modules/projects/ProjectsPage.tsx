import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { StatusTag } from '../../components/StatusTag';
import { useAction } from '../../hooks/useAction';
import { useUrlState } from '../../hooks/useUrlState';
import { useRole } from '../../app/RoleContext';
import { db } from '../../db/database';
import { createProject, updateProject } from '../../services/projects';
import { createCustomer } from '../../services/customers';
import { listProjectRows, type ProjectRow } from '../../repositories/projects';
import { formatDate, toDateKey } from '../../utils/format';
import { formatMoney, formatMoneyShort, parseMoneyInput } from '../../utils/money';
import { PROJECT_CATEGORY_META, PROJECT_STATUS_META, PROJECT_STATUS_ORDER } from '../../utils/status';
import { normalizeText } from '../../utils/text';
import type { ProjectCategory, ProjectStatus } from '../../types';
import styles from './Projects.module.scss';

interface ProjectFormValues {
  name: string;
  customerId: string;
  category: ProjectCategory;
  address: string;
  contractValueVnd?: number;
  startDate?: dayjs.Dayjs | null;
  handoverDate?: dayjs.Dayjs | null;
  managerId?: string;
  designerId?: string;
  note?: string;
  createMilestones?: boolean;
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { actor, role } = useRole();
  const { message } = App.useApp();
  const { loading, run } = useAction();
  const [filters, setFilters] = useUrlState<{ status?: string; category?: string; q?: string }>({ status: undefined, category: undefined, q: undefined });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow>();
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [form] = Form.useForm<ProjectFormValues>();
  const [quickForm] = Form.useForm<{ name: string; phone: string; address?: string }>();

  const rows = useLiveQuery(() => listProjectRows(), []);
  const customers = useLiveQuery(() => db.customers.orderBy('code').reverse().toArray(), [], []);
  const employees = useLiveQuery(() => db.employees.toArray(), [], []);
  const canManage = role === 'MANAGER' || role === 'SALES';

  const filtered = useMemo(() => {
    const keyword = normalizeText(filters.q ?? '');
    return (rows ?? []).filter((row) => {
      if (filters.status && row.project.status !== filters.status) return false;
      if (filters.category && row.project.category !== filters.category) return false;
      if (keyword) {
        const haystack = normalizeText([row.project.code, row.project.name, row.customer?.name, row.project.address].filter(Boolean).join(' | '));
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  }, [rows, filters.status, filters.category, filters.q]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      construction: list.filter((r) => r.project.status === 'CONSTRUCTION').length,
      value: list.reduce((sum, r) => sum + r.project.contractValueVnd, 0),
      receivable: list.reduce((sum, r) => sum + Math.max(0, r.scheduleVnd - r.paidVnd), 0),
    };
  }, [rows]);

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ category: 'APARTMENT', createMilestones: true });
    setDrawerOpen(true);
  };

  const openEdit = (row: ProjectRow) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.project.name,
      customerId: row.project.customerId,
      category: row.project.category,
      address: row.project.address,
      contractValueVnd: row.project.contractValueVnd,
      startDate: row.project.startDate ? dayjs(row.project.startDate) : null,
      handoverDate: row.project.handoverDate ? dayjs(row.project.handoverDate) : null,
      managerId: row.project.managerId,
      designerId: row.project.designerId,
      note: row.project.note,
    });
    setDrawerOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      customerId: values.customerId,
      category: values.category,
      address: values.address,
      contractValueVnd: values.contractValueVnd ?? 0,
      startDate: values.startDate ? toDateKey(values.startDate) : undefined,
      handoverDate: values.handoverDate ? toDateKey(values.handoverDate) : undefined,
      managerId: values.managerId,
      designerId: values.designerId,
      note: values.note,
    };
    if (editing) {
      await run(() => updateProject(actor, editing.project.id, payload, editing.project.revision), {
        successMessage: 'Đã lưu thông tin dự án',
        onSuccess: () => setDrawerOpen(false),
      });
      return;
    }
    await run((op) => createProject(actor, payload, { operationId: op, createDefaultMilestones: values.createMilestones }), {
      successMessage: 'Đã tạo dự án mới',
      onSuccess: (project) => {
        setDrawerOpen(false);
        navigate(`/projects/${project.id}`);
      },
    });
  };

  const submitQuickCustomer = async () => {
    const values = await quickForm.validateFields();
    await run((op) => createCustomer(actor, values, { operationId: op }), {
      successMessage: 'Đã thêm chủ nhà mới',
      onSuccess: (customer) => {
        setQuickCustomerOpen(false);
        quickForm.resetFields();
        form.setFieldValue('customerId', customer.id);
      },
      onBusinessError: (error) => {
        if (error.code === 'DUPLICATE_PHONE') {
          message.warning(error.message);
        }
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Dự án thiết kế – thi công"
        subtitle={`${stats.total} dự án · ${stats.construction} đang thi công · tổng giá trị hợp đồng ${formatMoneyShort(stats.value)} · còn phải thu ${formatMoneyShort(
          stats.receivable,
        )}`}
        extra={
          canManage
            ? [
                <Button key="create" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  Tạo dự án
                </Button>,
              ]
            : []
        }
      />

      <div className="page-toolbar">
        <Input.Search
          allowClear
          placeholder="Tìm theo mã, tên dự án, chủ nhà, địa chỉ..."
          style={{ width: 300 }}
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })}
        />
        <Select
          allowClear
          placeholder="Trạng thái"
          style={{ width: 190 }}
          value={filters.status}
          onChange={(value) => setFilters({ status: value })}
          options={PROJECT_STATUS_ORDER.map((status) => ({ value: status, label: PROJECT_STATUS_META[status as ProjectStatus].label }))}
        />
        <Select
          allowClear
          placeholder="Loại công trình"
          style={{ width: 170 }}
          value={filters.category}
          onChange={(value) => setFilters({ category: value })}
          options={(Object.keys(PROJECT_CATEGORY_META) as ProjectCategory[]).map((category) => ({
            value: category,
            label: PROJECT_CATEGORY_META[category].label,
          }))}
        />
        <span className="text-muted">Hiển thị {filtered.length} dự án</span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <Empty description="Không có dự án phù hợp bộ lọc hiện tại." />
        </Card>
      ) : (
        <div className={styles.grid}>
          {filtered.map((row) => {
            const overdueHandover = row.project.handoverDate ? row.project.handoverDate < toDateKey(new Date()) : false;
            const progressColor = row.progressPct >= 100 ? '#2f9e44' : row.progressPct >= 50 ? '#a16207' : '#e8930c';
            return (
              <div key={row.project.id} className={styles.card} onClick={() => navigate(`/projects/${row.project.id}`)}>
                <div className={styles.cardHead}>
                  <div>
                    <div className={styles.code}>{row.project.code}</div>
                    <div className={styles.name}>{row.project.name}</div>
                  </div>
                  <StatusTag kind="project" status={row.project.status} />
                </div>

                <div className={styles.meta}>
                  <div>
                    <span className="text-muted">Chủ nhà: </span>
                    <strong>{row.customer?.name ?? '—'}</strong>
                  </div>
                  <Tag color={PROJECT_CATEGORY_META[row.project.category].color} style={{ marginInlineEnd: 0 }}>
                    {PROJECT_CATEGORY_META[row.project.category].label}
                  </Tag>
                </div>

                <div className={styles.address} title={row.project.address}>
                  {row.project.address}
                </div>

                <div className={styles.value}>{formatMoney(row.project.contractValueVnd)}</div>

                <div className={styles.progressBlock}>
                  <div className={styles.progressLabel}>
                    <span>Tiến độ thi công</span>
                    <span className="text-strong">{row.progressPct}%</span>
                  </div>
                  <Progress percent={row.progressPct} showInfo={false} strokeColor={progressColor} size="small" />
                </div>

                <div className={styles.progressBlock}>
                  <div className={styles.progressLabel}>
                    <span>Đã thu {row.collectedPct}%</span>
                    <span className="text-muted">Còn {formatMoneyShort(Math.max(0, row.scheduleVnd - row.paidVnd))}</span>
                  </div>
                  <div className={styles.collectBar}>
                    <div className={styles.collectFill} style={{ width: `${Math.min(100, row.collectedPct)}%` }} />
                  </div>
                </div>

                <div className={styles.cardFoot}>
                  <span>
                    <span className="text-muted">Chỉ huy: </span>
                    {row.manager?.name ?? '—'}
                  </span>
                  <span className={overdueHandover ? styles.overdue : undefined}>
                    Bàn giao: {formatDate(row.project.handoverDate)}
                  </span>
                </div>

                {canManage ? (
                  <div className={styles.cardActions}>
                    <Button
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(row);
                      }}
                    >
                      Sửa
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Drawer
        title={editing ? `Sửa dự án ${editing.project.code}` : 'Tạo dự án mới'}
        size={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Huỷ</Button>
            <Button type="primary" loading={loading} onClick={() => void submit()}>
              {editing ? 'Lưu thay đổi' : 'Tạo dự án'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item name="name" label="Tên dự án" rules={[{ required: true, min: 3 }]}>
            <Input placeholder="Ví dụ: Căn hộ Vinhomes Green Bay – A1205" />
          </Form.Item>

          <Form.Item label="Chủ nhà" required style={{ marginBottom: 8 }}>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="customerId" noStyle rules={[{ required: true, message: 'Vui lòng chọn chủ nhà' }]}>
                <Select
                  showSearch
                  placeholder="Chọn chủ nhà"
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  options={(customers ?? []).map((c) => ({ value: c.id, label: `${c.name} — ${c.phone}` }))}
                />
              </Form.Item>
              <Button icon={<UserAddOutlined />} onClick={() => setQuickCustomerOpen(true)}>
                Tạo nhanh
              </Button>
            </Space.Compact>
          </Form.Item>

          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="category" label="Loại công trình" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select
                options={(Object.keys(PROJECT_CATEGORY_META) as ProjectCategory[]).map((category) => ({
                  value: category,
                  label: PROJECT_CATEGORY_META[category].label,
                }))}
              />
            </Form.Item>
            <Form.Item name="contractValueVnd" label="Giá trị hợp đồng (₫)" style={{ flex: 1 }}>
              <InputNumber<number>
                min={0}
                step={10000000}
                style={{ width: '100%' }}
                formatter={(value) => (value == null ? '' : Number(value).toLocaleString('vi-VN'))}
                parser={(value) => parseMoneyInput(value) ?? 0}
              />
            </Form.Item>
          </Space>

          <Form.Item name="address" label="Địa chỉ công trình" rules={[{ required: true, min: 3 }]}>
            <Input placeholder="Số nhà, đường, quận/huyện, tỉnh/thành" />
          </Form.Item>

          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="startDate" label="Ngày bắt đầu" style={{ flex: 1 }}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} placeholder="Chọn ngày" />
            </Form.Item>
            <Form.Item name="handoverDate" label="Ngày bàn giao dự kiến" style={{ flex: 1 }}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} placeholder="Chọn ngày" />
            </Form.Item>
          </Space>

          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="managerId" label="Chỉ huy trưởng" style={{ flex: 1 }}>
              <Select
                allowClear
                placeholder="Chọn chỉ huy trưởng"
                options={(employees ?? [])
                  .filter((e) => e.role === 'SITE_MANAGER' || e.role === 'MANAGER')
                  .map((e) => ({ value: e.id, label: e.name }))}
              />
            </Form.Item>
            <Form.Item name="designerId" label="Người thiết kế / phụ trách" style={{ flex: 1 }}>
              <Select
                allowClear
                placeholder="Chọn người phụ trách"
                options={(employees ?? []).filter((e) => e.role === 'SALES').map((e) => ({ value: e.id, label: e.name }))}
              />
            </Form.Item>
          </Space>

          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Yêu cầu riêng của khách, lưu ý thi công..." />
          </Form.Item>

          {!editing ? (
            <Form.Item name="createMilestones" valuePropName="checked" style={{ marginBottom: 4 }}>
              <Checkbox>Tạo luôn 4 đợt thanh toán mẫu 30/30/30/10 theo giá trị hợp đồng</Checkbox>
            </Form.Item>
          ) : (
            <Typography.Text type="secondary">
              Đợt thanh toán và hạng mục quản lý trong trang chi tiết dự án sau khi lưu.
            </Typography.Text>
          )}
        </Form>
      </Drawer>

      <Modal
        title="Thêm chủ nhà nhanh"
        open={quickCustomerOpen}
        onCancel={() => setQuickCustomerOpen(false)}
        onOk={() => void submitQuickCustomer()}
        okText="Thêm chủ nhà"
        cancelText="Huỷ"
        confirmLoading={loading}
        destroyOnHidden
      >
        <Form form={quickForm} layout="vertical">
          <Form.Item name="name" label="Tên chủ nhà" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Anh/chị..." />
          </Form.Item>
          <Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, min: 9 }]}>
            <Input placeholder="09xx xxx xxx" />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
