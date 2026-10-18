import { useMemo, useState } from 'react';
import { Button, Card, DatePicker, Empty, Progress, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { MoneyDisplay } from '../../components/MoneyDisplay';
import { useRole } from '../../app/RoleContext';
import { useUrlState } from '../../hooks/useUrlState';
import { db } from '../../db/database';
import {
  downloadCsv,
  laborByTrade,
  laborByWorker,
  materialCostByProject,
  overdueWorkItems,
  projectReport,
  toCsv,
  topMaterials,
  type LaborByTradeRow,
  type LaborByWorkerRow,
  type MaterialCostRow,
  type ProjectReportRow,
  type TopMaterialRow,
} from '../../repositories/reports';
import { formatDate, toDateKey } from '../../utils/format';
import { formatMoney, formatQuantity } from '../../utils/money';
import { TRADE_LABEL, WORK_ITEM_STATUS_META } from '../../utils/status';
import type { Project, WorkItem } from '../../types';

export function ReportsPage() {
  const navigate = useNavigate();
  const { role } = useRole();
  const [filters, setFilters] = useUrlState<{ tab?: string; from?: string; to?: string }>({ tab: 'projects', from: undefined, to: undefined });
  const [days, setDays] = useState('30');

  const range = useMemo(() => {
    const fromKey = filters.from ?? dayjs().subtract(Number(days) - 1, 'day').format('YYYY-MM-DD');
    const toKey = filters.to ?? toDateKey(new Date());
    return { fromKey, toKey, fromIso: new Date(`${fromKey}T00:00:00`).toISOString(), toIso: new Date(`${toKey}T23:59:59`).toISOString() };
  }, [filters.from, filters.to, days]);

  const isFinancial = role === 'MANAGER' || role === 'ACCOUNTANT';

  const projectRows = useLiveQuery(() => projectReport(), [], [] as ProjectReportRow[]);
  const materialRows = useLiveQuery(() => materialCostByProject(range.fromIso, range.toIso), [range.fromIso, range.toIso], [] as MaterialCostRow[]);
  const materialTop = useLiveQuery(() => topMaterials(range.fromIso, range.toIso, 10), [range.fromIso, range.toIso], [] as TopMaterialRow[]);
  const laborRows = useLiveQuery(() => laborByWorker(range.fromKey, range.toKey), [range.fromKey, range.toKey], [] as LaborByWorkerRow[]);
  const tradeRows = useLiveQuery(() => laborByTrade(range.fromKey, range.toKey), [range.fromKey, range.toKey], [] as LaborByTradeRow[]);
  const workItems = useLiveQuery(() => db.workItems.toArray(), [], []);
  const projects = useLiveQuery(() => db.projects.toArray(), [], [] as Project[]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const todayKey = toDateKey(new Date());
  const overdue = overdueWorkItems(workItems ?? [], todayKey);
  const lateProjects = (projects ?? []).filter((p) => p.handoverDate && p.handoverDate < todayKey && p.status !== 'CLOSED' && p.status !== 'WARRANTY');
  const leadTimes = (projects ?? [])
    .filter((p) => p.startDate && (p.status === 'HANDOVER' || p.status === 'WARRANTY' || p.status === 'CLOSED'))
    .map((p) => dayjs(p.handoverDate ?? todayKey).diff(dayjs(p.startDate as string), 'day'));
  const avgLeadTime = leadTimes.length > 0 ? Math.round(leadTimes.reduce((sum, v) => sum + v, 0) / leadTimes.length) : 0;

  const totals = useMemo(
    () => ({
      contract: projectRows.reduce((sum, row) => sum + row.contractValueVnd, 0),
      collected: projectRows.reduce((sum, row) => sum + row.collectedVnd, 0),
      cost: projectRows.reduce((sum, row) => sum + row.costVnd, 0),
      profit: projectRows.reduce((sum, row) => sum + row.profitVnd, 0),
    }),
    [projectRows],
  );

  const projectColumns: TableColumnsType<ProjectReportRow> = [
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
    { title: 'Giá trị HĐ', key: 'contract', width: 160, align: 'right', render: (_, row) => <MoneyDisplay value={row.contractValueVnd} /> },
    { title: 'Đã thu', key: 'collected', width: 160, align: 'right', render: (_, row) => <MoneyDisplay value={row.collectedVnd} /> },
    { title: 'Chi phí vật tư', key: 'material', width: 150, align: 'right', render: (_, row) => <MoneyDisplay value={row.materialCostVnd} /> },
    { title: 'Nhân công', key: 'labor', width: 150, align: 'right', render: (_, row) => <MoneyDisplay value={row.laborCostVnd} /> },
    { title: 'Chi khác', key: 'other', width: 130, align: 'right', render: (_, row) => <MoneyDisplay value={row.otherCostVnd} /> },
    {
      title: 'Lợi nhuận tạm tính',
      key: 'profit',
      width: 180,
      align: 'right',
      render: (_, row) => (
        <span style={{ fontWeight: 700, color: row.profitVnd >= 0 ? '#2f7d32' : '#c0392b' }}>{formatMoney(row.profitVnd)}</span>
      ),
    },
    {
      title: 'Tiến độ',
      key: 'progress',
      width: 160,
      render: (_, row) => <Progress percent={row.progressPct} size="small" strokeColor="#a16207" />,
    },
    {
      title: '',
      key: 'open',
      width: 90,
      render: (_, row) => (
        <Button size="small" onClick={() => navigate(`/projects/${row.project.id}`)}>
          Mở
        </Button>
      ),
    },
  ];

  const materialColumns: TableColumnsType<MaterialCostRow> = [
    { title: 'Dự án', key: 'project', render: (_, row) => `${row.projectCode} — ${row.projectName}` },
    { title: 'Tháng', key: 'month', width: 120, render: (_, row) => row.monthKey },
    { title: 'Chi phí vật tư', key: 'cost', width: 180, align: 'right', render: (_, row) => <MoneyDisplay value={row.costVnd} strong /> },
  ];

  const topMaterialColumns: TableColumnsType<TopMaterialRow> = [
    { title: 'Mã VT', key: 'code', width: 100, render: (_, row) => row.material.code },
    { title: 'Tên vật tư', key: 'name', render: (_, row) => row.material.name },
    { title: 'ĐVT', key: 'unit', width: 80, render: (_, row) => row.material.unit },
    { title: 'Khối lượng xuất', key: 'qty', width: 150, align: 'right', render: (_, row) => formatQuantity(row.quantity) },
    { title: 'Giá trị', key: 'cost', width: 160, align: 'right', render: (_, row) => <MoneyDisplay value={row.costVnd} strong /> },
  ];

  const laborColumns: TableColumnsType<LaborByWorkerRow> = [
    { title: 'Thợ', key: 'name', render: (_, row) => <span className="text-strong">{row.worker.name}</span> },
    { title: 'Nghề', key: 'trade', width: 120, render: (_, row) => TRADE_LABEL[row.worker.trade] },
    { title: 'Loại', key: 'type', width: 110, render: (_, row) => (row.worker.employmentType === 'CORE' ? 'Cơ hữu' : 'Khoán') },
    { title: 'Tổng công', key: 'days', width: 110, align: 'right', render: (_, row) => row.days.toLocaleString('vi-VN') },
    { title: 'Đơn giá', key: 'rate', width: 130, align: 'right', render: (_, row) => formatMoney(row.worker.dailyRateVnd) },
    { title: 'Thành tiền', key: 'amount', width: 160, align: 'right', render: (_, row) => <MoneyDisplay value={row.amountVnd} strong /> },
    {
      title: 'Phân bổ dự án',
      key: 'projects',
      render: (_, row) =>
        row.byProject.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <Space size={4} wrap>
            {row.byProject.map((item) => (
              <Tag key={item.projectId} color="gold">
                {item.projectCode}: {item.days} công
              </Tag>
            ))}
          </Space>
        ),
    },
  ];

  const tradeColumns: TableColumnsType<LaborByTradeRow> = [
    { title: 'Nghề', key: 'trade', render: (_, row) => <Tag color="geekblue">{row.trade}</Tag> },
    { title: 'Số thợ', key: 'workers', width: 110, align: 'right', render: (_, row) => row.workerCount },
    { title: 'Tổng công', key: 'days', width: 120, align: 'right', render: (_, row) => row.days.toLocaleString('vi-VN') },
    { title: 'Chi phí nhân công', key: 'amount', width: 190, align: 'right', render: (_, row) => <MoneyDisplay value={row.amountVnd} strong /> },
  ];

  const overdueColumns: TableColumnsType<WorkItem> = [
    { title: 'Dự án', key: 'project', width: 200, render: (_, row) => projectById.get(row.projectId)?.code ?? '—' },
    { title: 'Khu vực', key: 'zone', width: 130, render: (_, row) => row.zone },
    { title: 'Hạng mục', key: 'name', render: (_, row) => row.name },
    { title: 'Tổ', key: 'crew', width: 160, render: (_, row) => row.assignedTo ?? '—' },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, row) => <Tag color={WORK_ITEM_STATUS_META[row.status].color}>{WORK_ITEM_STATUS_META[row.status].label}</Tag>,
    },
    { title: 'Hạn kết thúc', key: 'end', width: 120, render: (_, row) => <span style={{ color: '#c0392b', fontWeight: 600 }}>{formatDate(row.endDate)}</span> },
    {
      title: 'Quá hạn',
      key: 'late',
      width: 110,
      align: 'right',
      render: (_, row) => `${dayjs().diff(dayjs(row.endDate), 'day')} ngày`,
    },
  ];

  const exportCurrent = () => {
    const tab = filters.tab ?? 'projects';
    if (tab === 'projects') {
      downloadCsv(
        `bao-cao-du-an-${todayKey}.csv`,
        toCsv(
          projectRows.map((row) => ({
            code: row.project.code,
            name: row.project.name,
            customer: row.customerName ?? '',
            contract: row.contractValueVnd,
            collected: row.collectedVnd,
            material: row.materialCostVnd,
            labor: row.laborCostVnd,
            other: row.otherCostVnd,
            cost: row.costVnd,
            profit: row.profitVnd,
            progress: row.progressPct,
          })),
          [
            { key: 'code', label: 'Mã dự án' },
            { key: 'name', label: 'Tên dự án' },
            { key: 'customer', label: 'Chủ nhà' },
            { key: 'contract', label: 'Giá trị hợp đồng' },
            { key: 'collected', label: 'Đã thu' },
            { key: 'material', label: 'Chi phí vật tư' },
            { key: 'labor', label: 'Chi phí nhân công' },
            { key: 'other', label: 'Chi khác' },
            { key: 'cost', label: 'Tổng chi phí' },
            { key: 'profit', label: 'Lợi nhuận tạm tính' },
            { key: 'progress', label: 'Tiến độ %' },
          ],
        ),
      );
      return;
    }
    if (tab === 'materials') {
      downloadCsv(
        `bao-cao-vat-tu-nhan-cong-${todayKey}.csv`,
        toCsv(
          laborRows.map((row) => ({
            code: row.worker.code,
            name: row.worker.name,
            trade: TRADE_LABEL[row.worker.trade],
            days: row.days,
            amount: row.amountVnd,
          })),
          [
            { key: 'code', label: 'Mã thợ' },
            { key: 'name', label: 'Tên thợ' },
            { key: 'trade', label: 'Nghề' },
            { key: 'days', label: 'Tổng công' },
            { key: 'amount', label: 'Chi phí nhân công' },
          ],
        ),
      );
      return;
    }
    downloadCsv(
      `bao-cao-tien-do-${todayKey}.csv`,
      toCsv(
        overdue.map((row) => ({
          project: projectById.get(row.projectId)?.code ?? '',
          zone: row.zone,
          name: row.name,
          crew: row.assignedTo ?? '',
          end: row.endDate ?? '',
        })),
        [
          { key: 'project', label: 'Dự án' },
          { key: 'zone', label: 'Khu vực' },
          { key: 'name', label: 'Hạng mục' },
          { key: 'crew', label: 'Tổ phụ trách' },
          { key: 'end', label: 'Hạn kết thúc' },
        ],
      ),
    );
  };

  const dateToolbar = (
    <Space wrap>
      <Select
        value={days}
        style={{ width: 170 }}
        onChange={(value) => setDays(value)}
        options={[
          { value: '30', label: '30 ngày gần đây' },
          { value: '60', label: '60 ngày gần đây' },
          { value: '90', label: '90 ngày gần đây' },
        ]}
      />
      <DatePicker value={dayjs(range.fromKey)} format="DD/MM/YYYY" onChange={(value) => value && setFilters({ from: toDateKey(value) })} />
      <span className="text-muted">đến</span>
      <DatePicker value={dayjs(range.toKey)} format="DD/MM/YYYY" onChange={(value) => value && setFilters({ to: toDateKey(value) })} />
      <Button icon={<DownloadOutlined />} onClick={exportCurrent}>
        Xuất CSV
      </Button>
    </Space>
  );

  const items = [
    ...(isFinancial
      ? [
          {
            key: 'projects',
            label: 'Dự án & lợi nhuận',
            children: (
              <Card size="small">
                <Space size={16} wrap style={{ marginBottom: 12 }}>
                  <Statistic title="Tổng giá trị hợp đồng" value={formatMoney(totals.contract)} />
                  <Statistic title="Tổng đã thu" value={formatMoney(totals.collected)} />
                  <Statistic title="Tổng chi phí tạm tính" value={formatMoney(totals.cost)} />
                  <Statistic
                    title="Lợi nhuận tạm tính"
                    value={formatMoney(totals.profit)}
                    styles={{ content: { color: totals.profit >= 0 ? '#2f7d32' : '#c0392b' } }}
                  />
                </Space>
                <Table<ProjectReportRow>
                  rowKey={(row) => row.project.id}
                  columns={projectColumns}
                  dataSource={projectRows}
                  size="small"
                  loading={projectRows.length === 0}
                  pagination={false}
                  scroll={{ x: 1400 }}
                  locale={{ emptyText: <Empty description="Chưa có dữ liệu dự án." /> }}
                />
                <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                  Lợi nhuận tạm tính = tổng phiếu thu đã ghi nhận − (chi phí vật tư xuất công trình + chi phí nhân công theo ngày công + chi khác của dự án).
                  Chưa gồm chi phí gián tiếp văn phòng.
                </Typography.Paragraph>
              </Card>
            ),
          },
        ]
      : []),
    {
      key: 'materials',
      label: 'Vật tư & nhân công',
      children: (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <Card size="small" title={`Chi phí vật tư theo dự án / tháng (${range.fromKey} → ${range.toKey})`}>
            <Table<MaterialCostRow>
              rowKey={(row) => `${row.projectId}-${row.monthKey}`}
              columns={materialColumns}
              dataSource={materialRows}
              size="small"
              pagination={false}
              locale={{ emptyText: <Empty description="Không phát sinh phiếu xuất vật tư trong kỳ." /> }}
            />
          </Card>
          <Card size="small" title="Top vật tư theo giá trị xuất kho">
            <Table<TopMaterialRow>
              rowKey={(row) => row.material.id}
              columns={topMaterialColumns}
              dataSource={materialTop}
              size="small"
              pagination={false}
              locale={{ emptyText: <Empty description="Không có dữ liệu vật tư xuất trong kỳ." /> }}
            />
          </Card>
          <Card size="small" title="Công & tiền lương theo thợ">
            <Table<LaborByWorkerRow>
              rowKey={(row) => row.worker.id}
              columns={laborColumns}
              dataSource={laborRows}
              size="small"
              pagination={false}
              scroll={{ x: 1150 }}
              locale={{ emptyText: <Empty description="Không có dữ liệu ngày công trong kỳ." /> }}
            />
          </Card>
          <Card size="small" title="Tổng hợp theo nghề">
            <Table<LaborByTradeRow>
              rowKey="trade"
              columns={tradeColumns}
              dataSource={tradeRows}
              size="small"
              pagination={false}
              locale={{ emptyText: <Empty description="Không có dữ liệu." /> }}
            />
          </Card>
        </Space>
      ),
    },
    {
      key: 'progress',
      label: 'Tiến độ',
      children: (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <Space size={16} wrap>
            <Card size="small" style={{ minWidth: 210 }}>
              <Statistic title="Dự án trễ bàn giao" value={lateProjects.length} suffix="dự án" styles={{ content: { color: lateProjects.length > 0 ? '#c0392b' : undefined } }} />
            </Card>
            <Card size="small" style={{ minWidth: 210 }}>
              <Statistic title="Hạng mục quá hạn" value={overdue.length} suffix="hạng mục" styles={{ content: { color: overdue.length > 0 ? '#c0392b' : undefined } }} />
            </Card>
            <Card size="small" style={{ minWidth: 210 }}>
              <Statistic title="Lead time bàn giao trung bình" value={avgLeadTime} suffix="ngày" />
            </Card>
          </Space>
          <Card size="small" title="Dự án trễ hạn bàn giao">
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={lateProjects}
              locale={{ emptyText: <Empty description="Không có dự án nào trễ hạn bàn giao." /> }}
              columns={[
                { title: 'Mã', key: 'code', width: 130, render: (_, row) => row.code },
                { title: 'Tên dự án', key: 'name', render: (_, row) => row.name },
                { title: 'Bàn giao dự kiến', key: 'handover', width: 150, render: (_, row) => formatDate(row.handoverDate) },
                { title: 'Trạng thái', key: 'status', width: 140, render: (_, row) => <Tag color="gold">{row.status}</Tag> },
              ]}
            />
          </Card>
          <Card size="small" title="Hạng mục quá hạn chưa xong">
            <Table<WorkItem>
              rowKey="id"
              columns={overdueColumns}
              dataSource={overdue}
              size="small"
              pagination={{ pageSize: 15, showSizeChanger: false }}
              scroll={{ x: 1100 }}
              locale={{ emptyText: <Empty description="Không có hạng mục quá hạn." /> }}
            />
          </Card>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Báo cáo"
        subtitle="Báo cáo lợi nhuận tạm tính theo dự án, chi phí vật tư – nhân công và tiến độ thi công toàn công ty."
        extra={dateToolbar}
      />

      <Tabs activeKey={filters.tab ?? (isFinancial ? 'projects' : 'materials')} onChange={(key) => setFilters({ tab: key })} items={items} />
    </div>
  );
}
