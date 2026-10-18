import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  DatePicker,
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
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
import { useRole } from '../../app/RoleContext';
import { useUrlState } from '../../hooks/useUrlState';
import { db } from '../../db/database';
import { deleteTimesheet, saveTimesheets, saveWorker, type TimesheetRowInput } from '../../services/parties';
import { laborByWorker, toCsv, downloadCsv, type LaborByWorkerRow } from '../../repositories/reports';
import { can } from '../../services/permissions';
import { formatDate, toDateKey } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import { EMPLOYMENT_TYPE_LABEL, TRADE_LABEL } from '../../utils/status';
import { matchesSearch } from '../../utils/text';
import type { Trade, Worker } from '../../types';

interface WorkerFormValues {
  name: string;
  trade: Trade;
  employmentType: Worker['employmentType'];
  dailyRateVnd: number;
  phone: string;
  active?: boolean;
}

interface DraftRow {
  key: string;
  workerId?: string;
  days: number;
  note?: string;
}

export function WorkersPage() {
  const { actor, role } = useRole();
  const { message } = App.useApp();
  const { loading, run } = useAction();
  const [filters, setFilters] = useUrlState<{ tab?: string; month?: string; projectId?: string; workerId?: string; q?: string }>({
    tab: 'workers',
    month: dayjs().format('YYYY-MM'),
    projectId: undefined,
    workerId: undefined,
    q: undefined,
  });

  const workers = useLiveQuery(async () => (await db.workers.toArray()).sort((a, b) => a.code.localeCompare(b.code)), [], []);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const timesheets = useLiveQuery(() => db.timesheets.toArray(), [], []);
  const laborRows = useLiveQuery(() => laborByWorker('0000-01-01', '9999-12-31'), [], [] as LaborByWorkerRow[]);

  const [workerModal, setWorkerModal] = useState<{ open: boolean; editing?: Worker }>({ open: false });
  const [workerForm] = Form.useForm<WorkerFormValues>();
  const [timesheetOpen, setTimesheetOpen] = useState(false);
  const [timesheetForm] = Form.useForm<{ projectId: string; date: dayjs.Dayjs }>();
  const [draftRows, setDraftRows] = useState<DraftRow[]>([{ key: 'row-1', days: 1 }]);

  const canManageWorkers = can(role, 'worker.manage');
  const canManageTimesheet = can(role, 'timesheet.manage');

  const month = filters.month ?? dayjs().format('YYYY-MM');
  const monthStart = dayjs(`${month}-01`);
  const monthEnd = monthStart.endOf('month');
  const workerById = useMemo(() => new Map((workers ?? []).map((w) => [w.id, w])), [workers]);
  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);

  const monthTimesheets = useMemo(
    () =>
      (timesheets ?? [])
        .filter((row) => row.date >= monthStart.format('YYYY-MM-DD') && row.date <= monthEnd.format('YYYY-MM-DD'))
        .filter((row) => (filters.projectId ? row.projectId === filters.projectId : true))
        .filter((row) => (filters.workerId ? row.workerId === filters.workerId : true))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [timesheets, monthStart, monthEnd, filters.projectId, filters.workerId],
  );

  const summary = useMemo(() => {
    const map = new Map<string, { worker: Worker; days: number; amountVnd: number; byProject: Map<string, number> }>();
    for (const row of monthTimesheets) {
      const worker = workerById.get(row.workerId);
      if (!worker) continue;
      const current = map.get(worker.id) ?? { worker, days: 0, amountVnd: 0, byProject: new Map<string, number>() };
      current.days += row.days;
      current.amountVnd += Math.round(row.days * worker.dailyRateVnd);
      current.byProject.set(row.projectId, (current.byProject.get(row.projectId) ?? 0) + row.days);
      map.set(worker.id, current);
    }
    return [...map.values()].sort((a, b) => b.amountVnd - a.amountVnd);
  }, [monthTimesheets, workerById]);

  const monthTotalDays = summary.reduce((sum, row) => sum + row.days, 0);
  const monthTotalAmount = summary.reduce((sum, row) => sum + row.amountVnd, 0);

  const filteredWorkers = useMemo(
    () => (workers ?? []).filter((worker) => (filters.q ? matchesSearch([worker.code, worker.name, worker.phone, TRADE_LABEL[worker.trade]], filters.q) : true)),
    [workers, filters.q],
  );

  const submitWorker = async () => {
    const values = await workerForm.validateFields();
    await run(() => saveWorker(actor, values, workerModal.editing?.id), {
      successMessage: workerModal.editing ? 'Đã lưu thông tin thợ' : 'Đã thêm thợ mới',
      onSuccess: () => setWorkerModal({ open: false }),
    });
  };

  const submitTimesheet = async () => {
    const values = await timesheetForm.validateFields();
    const rows: TimesheetRowInput[] = draftRows
      .filter((row) => row.workerId && row.days > 0)
      .map((row) => ({ workerId: row.workerId as string, days: row.days, note: row.note }));
    if (rows.length === 0) {
      message.warning('Chọn ít nhất một thợ với số công lớn hơn 0.');
      return;
    }
    await run((op) => saveTimesheets(actor, { projectId: values.projectId, date: toDateKey(values.date), rows }, { operationId: op }), {
      successMessage: `Đã ghi ${rows.length} dòng ngày công`,
      onSuccess: () => {
        setTimesheetOpen(false);
        setDraftRows([{ key: 'row-1', days: 1 }]);
      },
    });
  };

  const workerColumns: TableColumnsType<Worker> = [
    { title: 'Mã', key: 'code', width: 90, render: (_, row) => <span className="text-strong">{row.code}</span> },
    { title: 'Tên thợ', key: 'name', render: (_, row) => row.name },
    { title: 'Nghề', key: 'trade', width: 130, render: (_, row) => <Tag color="gold">{TRADE_LABEL[row.trade]}</Tag> },
    { title: 'Loại', key: 'employment', width: 110, render: (_, row) => EMPLOYMENT_TYPE_LABEL[row.employmentType] },
    { title: 'Đơn giá ngày công', key: 'rate', width: 160, align: 'right', render: (_, row) => formatMoney(row.dailyRateVnd) },
    { title: 'Điện thoại', key: 'phone', width: 140, render: (_, row) => row.phone },
    {
      title: 'Trạng thái',
      key: 'active',
      width: 120,
      render: (_, row) => (row.active ? <Tag color="green">Đang làm việc</Tag> : <Tag>Đã nghỉ</Tag>),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_, row) =>
        canManageWorkers ? (
          <Button
            size="small"
            onClick={() => {
              setWorkerModal({ open: true, editing: row });
              workerForm.setFieldsValue({
                name: row.name,
                trade: row.trade,
                employmentType: row.employmentType,
                dailyRateVnd: row.dailyRateVnd,
                phone: row.phone,
                active: row.active,
              });
            }}
          >
            Sửa
          </Button>
        ) : null,
    },
  ];

  const timesheetColumns: TableColumnsType<(typeof timesheets)[number]> = [
    { title: 'Ngày', key: 'date', width: 110, render: (_, row) => formatDate(row.date) },
    { title: 'Thợ', key: 'worker', width: 200, render: (_, row) => workerById.get(row.workerId)?.name ?? '—' },
    { title: 'Nghề', key: 'trade', width: 120, render: (_, row) => (workerById.get(row.workerId) ? TRADE_LABEL[(workerById.get(row.workerId) as Worker).trade] : '—') },
    {
      title: 'Dự án',
      key: 'project',
      width: 220,
      render: (_, row) => {
        const project = projectById.get(row.projectId);
        return project ? `${project.code} — ${project.name}` : '—';
      },
    },
    { title: 'Số công', key: 'days', width: 100, align: 'right', render: (_, row) => row.days.toLocaleString('vi-VN') },
    {
      title: 'Thành tiền',
      key: 'amount',
      width: 140,
      align: 'right',
      render: (_, row) => {
        const worker = workerById.get(row.workerId);
        return worker ? formatMoney(Math.round(row.days * worker.dailyRateVnd)) : '—';
      },
    },
    { title: 'Ghi chú', key: 'note', render: (_, row) => row.note ?? '—' },
    {
      title: '',
      key: 'actions',
      width: 70,
      render: (_, row) =>
        canManageTimesheet ? (
          <Popconfirm title="Xoá dòng ngày công này?" onConfirm={() => void run(() => deleteTimesheet(actor, row.id), { successMessage: 'Đã xoá dòng ngày công' })}>
            <Button size="small" danger type="text">
              Xoá
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  const summaryColumns: TableColumnsType<(typeof summary)[number]> = [
    { title: 'Thợ', key: 'name', render: (_, row) => <span className="text-strong">{row.worker.name}</span> },
    { title: 'Nghề', key: 'trade', width: 130, render: (_, row) => TRADE_LABEL[row.worker.trade] },
    { title: 'Tổng công', key: 'days', width: 110, align: 'right', render: (_, row) => row.days.toLocaleString('vi-VN') },
    { title: 'Đơn giá', key: 'rate', width: 140, align: 'right', render: (_, row) => formatMoney(row.worker.dailyRateVnd) },
    { title: 'Thành tiền', key: 'amount', width: 160, align: 'right', render: (_, row) => <span className="text-strong">{formatMoney(row.amountVnd)}</span> },
  ];

  const exportCsv = () => {
    downloadCsv(
      `ngay-cong-${month}.csv`,
      toCsv(
        summary.map((row) => ({
          code: row.worker.code,
          name: row.worker.name,
          trade: TRADE_LABEL[row.worker.trade],
          days: row.days,
          rate: row.worker.dailyRateVnd,
          amount: row.amountVnd,
        })),
        [
          { key: 'code', label: 'Mã thợ' },
          { key: 'name', label: 'Tên thợ' },
          { key: 'trade', label: 'Nghề' },
          { key: 'days', label: 'Tổng công' },
          { key: 'rate', label: 'Đơn giá ngày công' },
          { key: 'amount', label: 'Thành tiền' },
        ],
      ),
    );
  };

  const items = [
    {
      key: 'workers',
      label: `Nhân công (${filteredWorkers.length})`,
      children: (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <Space size={16} wrap>
            <Card size="small" style={{ minWidth: 190 }}>
              <Statistic title="Tổng thợ" value={(workers ?? []).length} suffix="người" />
            </Card>
            <Card size="small" style={{ minWidth: 190 }}>
              <Statistic title="Cơ hữu" value={(workers ?? []).filter((w) => w.employmentType === 'CORE').length} />
            </Card>
            <Card size="small" style={{ minWidth: 190 }}>
              <Statistic title="Khoán" value={(workers ?? []).filter((w) => w.employmentType === 'CONTRACT').length} />
            </Card>
          </Space>
          <Card
            size="small"
            extra={
              canManageWorkers ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setWorkerModal({ open: true });
                    workerForm.resetFields();
                    workerForm.setFieldsValue({ trade: 'MOC', employmentType: 'CORE', dailyRateVnd: 450000, active: true });
                  }}
                >
                  Thêm thợ
                </Button>
              ) : null
            }
          >
            <Table<Worker>
              rowKey="id"
              columns={workerColumns}
              dataSource={filteredWorkers}
              size="small"
              pagination={{ pageSize: 14, showSizeChanger: false }}
              locale={{ emptyText: <Empty description="Không có thợ phù hợp bộ lọc." /> }}
            />
          </Card>
        </Space>
      ),
    },
    {
      key: 'timesheets',
      label: `Ngày công (${monthTimesheets.length})`,
      children: (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <Card size="small">
            <Space wrap size={12}>
              <DatePicker
                picker="month"
                value={monthStart}
                format="MM/YYYY"
                onChange={(value) => value && setFilters({ month: value.format('YYYY-MM') })}
              />
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Lọc theo dự án"
                style={{ width: 250 }}
                value={filters.projectId}
                onChange={(value) => setFilters({ projectId: value })}
                options={(projects ?? []).map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
              />
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Lọc theo thợ"
                style={{ width: 210 }}
                value={filters.workerId}
                onChange={(value) => setFilters({ workerId: value })}
                options={(workers ?? []).map((worker) => ({ value: worker.id, label: `${worker.name} — ${TRADE_LABEL[worker.trade]}` }))}
              />
              {canManageTimesheet ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setTimesheetOpen(true);
                    timesheetForm.resetFields();
                    timesheetForm.setFieldsValue({ date: dayjs() });
                    setDraftRows([{ key: 'row-1', days: 1 }]);
                  }}
                >
                  Nhập ngày công
                </Button>
              ) : null}
            </Space>
          </Card>

          <Card size="small" title={`Bảng ngày công tháng ${monthStart.format('MM/YYYY')}`}>
            <Table
              rowKey="id"
              columns={timesheetColumns}
              dataSource={monthTimesheets}
              size="small"
              pagination={{ pageSize: 15, showSizeChanger: false }}
              scroll={{ x: 1100 }}
              locale={{ emptyText: <Empty description="Chưa có dòng ngày công trong kỳ lọc." /> }}
            />
          </Card>

          <Card
            size="small"
            title={`Tổng hợp tháng ${monthStart.format('MM/YYYY')}`}
            extra={
              <Button icon={<DownloadOutlined />} onClick={exportCsv}>
                Xuất CSV
              </Button>
            }
          >
            <Table
              rowKey={(row) => row.worker.id}
              columns={summaryColumns}
              dataSource={summary}
              size="small"
              pagination={false}
              expandable={{
                expandedRowRender: (row) => (
                  <Space orientation="vertical" size={2} style={{ width: '100%' }}>
                    {[...row.byProject.entries()].map(([projectId, days]) => (
                      <div key={projectId}>
                        <span className="text-muted">{projectById.get(projectId)?.code ?? '—'}</span> — {projectById.get(projectId)?.name ?? ''}:{' '}
                        <strong>{days.toLocaleString('vi-VN')} công</strong>{' '}
                        <span className="text-muted">≈ {formatMoney(Math.round(days * row.worker.dailyRateVnd))}</span>
                      </div>
                    ))}
                  </Space>
                ),
              }}
              locale={{ emptyText: <Empty description="Không có dữ liệu ngày công trong tháng." /> }}
            />
            <Space size={24} style={{ marginTop: 12 }}>
              <Statistic title="Tổng công" value={monthTotalDays} formatter={(value) => Number(value).toLocaleString('vi-VN')} />
              <Statistic title="Tổng tiền lương tháng" value={formatMoney(monthTotalAmount)} />
            </Space>
          </Card>

          <Typography.Paragraph type="secondary">
            Lương tháng = Σ ngày công × đơn giá ngày công hiện tại của thợ. Bấm vào dòng để xem phân bổ công theo từng dự án.
          </Typography.Paragraph>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Nhân công & ngày công"
        subtitle="Danh sách thợ theo nghề, nhập ngày công theo ngày cho từng dự án và tổng hợp lương tháng."
        extra={[
          <Input.Search
            key="search"
            allowClear
            placeholder="Tìm thợ theo tên, mã, nghề..."
            style={{ width: 280 }}
            value={filters.q}
            onChange={(e) => setFilters({ q: e.target.value })}
          />,
        ]}
      />

      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title={`Tổng công tháng ${monthStart.format('MM/YYYY')}`} value={monthTotalDays} formatter={(value) => Number(value).toLocaleString('vi-VN')} />
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Lương tháng" value={formatMoney(monthTotalAmount)} />
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Số dòng ngày công cả hệ thống" value={(timesheets ?? []).length} />
          <Typography.Text type="secondary">Tích lũy toàn kỳ: {formatMoney((laborRows ?? []).reduce((sum, row) => sum + row.amountVnd, 0))}</Typography.Text>
        </Card>
      </Space>

      <Tabs activeKey={filters.tab ?? 'workers'} onChange={(key) => setFilters({ tab: key })} items={items} />

      <Modal
        title={workerModal.editing ? `Sửa thợ ${workerModal.editing.code}` : 'Thêm thợ mới'}
        open={workerModal.open}
        onCancel={() => setWorkerModal({ open: false })}
        onOk={() => void submitWorker()}
        okText="Lưu"
        cancelText="Huỷ"
        confirmLoading={loading}
        destroyOnHidden
      >
        <Form form={workerForm} layout="vertical">
          <Form.Item name="name" label="Tên thợ" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="trade" label="Nghề" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select options={(Object.keys(TRADE_LABEL) as Trade[]).map((trade) => ({ value: trade, label: TRADE_LABEL[trade] }))} />
            </Form.Item>
            <Form.Item name="employmentType" label="Loại" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'CORE', label: 'Cơ hữu' },
                  { value: 'CONTRACT', label: 'Khoán' },
                ]}
              />
            </Form.Item>
          </Space>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="dailyRateVnd" label="Đơn giá ngày công (₫)" style={{ flex: 1 }} rules={[{ required: true }]}>
              <InputNumber<number>
                min={0}
                step={10000}
                style={{ width: '100%' }}
                formatter={(value) => (value == null ? '' : Number(value).toLocaleString('vi-VN'))}
                parser={(value) => Number((value ?? '').replace(/[^\d]/g, ''))}
              />
            </Form.Item>
            <Form.Item name="phone" label="Điện thoại" style={{ flex: 1 }} rules={[{ required: true, min: 4 }]}>
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="active" label="Trạng thái">
            <Select
              options={[
                { value: true, label: 'Đang làm việc' },
                { value: false, label: 'Đã nghỉ' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Nhập ngày công"
        open={timesheetOpen}
        onCancel={() => setTimesheetOpen(false)}
        onOk={() => void submitTimesheet()}
        okText="Lưu ngày công"
        cancelText="Huỷ"
        confirmLoading={loading}
        width={720}
        destroyOnHidden
      >
        <Form form={timesheetForm} layout="vertical">
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="projectId" label="Dự án" style={{ flex: 2 }} rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={(projects ?? []).map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
              />
            </Form.Item>
            <Form.Item name="date" label="Ngày" style={{ flex: 1 }} rules={[{ required: true }]}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Space>
        </Form>
        <Typography.Text type="secondary">Số công có thể là 0.5 / 1 / 1.5 tùy khối lượng làm việc trong ngày.</Typography.Text>
        <Space orientation="vertical" style={{ width: '100%', marginTop: 8 }} size={8}>
          {draftRows.map((row) => (
            <Space key={row.key} size={8} style={{ width: '100%' }} align="start">
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Chọn thợ"
                style={{ width: 280 }}
                value={row.workerId}
                options={(workers ?? [])
                  .filter((worker) => worker.active)
                  .map((worker) => ({ value: worker.id, label: `${worker.name} — ${TRADE_LABEL[worker.trade]} (${formatMoney(worker.dailyRateVnd)}/công)` }))}
                onChange={(value) => setDraftRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, workerId: value } : r)))}
              />
              <InputNumber
                min={0}
                step={0.5}
                style={{ width: 100 }}
                value={row.days}
                onChange={(value) => setDraftRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, days: Number(value ?? 0) } : r)))}
              />
              <Input
                style={{ width: 200 }}
                placeholder="Ghi chú"
                value={row.note}
                onChange={(e) => setDraftRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, note: e.target.value } : r)))}
              />
              {draftRows.length > 1 ? (
                <Button type="text" danger onClick={() => setDraftRows((prev) => prev.filter((r) => r.key !== row.key))}>
                  Xoá
                </Button>
              ) : null}
            </Space>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            style={{ width: 200 }}
            onClick={() => setDraftRows((prev) => [...prev, { key: `row-${Date.now()}`, days: 1 }])}
          >
            Thêm thợ
          </Button>
        </Space>
      </Modal>
    </div>
  );
}
