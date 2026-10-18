import { useMemo } from 'react';
import { Button, Card, Descriptions, Dropdown, Progress, Space, Tabs, Tag, Typography } from 'antd';
import { EditOutlined, SwapOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '../../components/PageHeader';
import { StatusTag } from '../../components/StatusTag';
import { useAction } from '../../hooks/useAction';
import { useRole } from '../../app/RoleContext';
import { useUrlState } from '../../hooks/useUrlState';
import { db } from '../../db/database';
import { changeProjectStatus } from '../../services/projects';
import { listProjectRows, averageProgress } from '../../repositories/projects';
import { can } from '../../services/permissions';
import { formatDate } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import { PROJECT_CATEGORY_META, PROJECT_STATUS_META, PROJECT_STATUS_ORDER } from '../../utils/status';
import { OverviewTab } from './tabs/OverviewTab';
import { WorkItemsTab } from './tabs/WorkItemsTab';
import { QuotesTab } from './tabs/QuotesTab';
import { MaterialsTab } from './tabs/MaterialsTab';
import { PaymentsTab } from './tabs/PaymentsTab';
import { LogsTab } from './tabs/LogsTab';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { actor, role } = useRole();
  const { loading, run } = useAction();
  const [filters, setFilters] = useUrlState<{ tab?: string }>({ tab: 'overview' });

  const project = useLiveQuery(async () => (projectId ? db.projects.get(projectId) : undefined), [projectId]);
  const customer = useLiveQuery(async () => (project ? db.customers.get(project.customerId) : undefined), [project?.customerId]);
  const manager = useLiveQuery(async () => (project?.managerId ? db.employees.get(project.managerId) : undefined), [project?.managerId]);
  const workItems = useLiveQuery(async () => (projectId ? db.workItems.where('projectId').equals(projectId).toArray() : []), [projectId], []);
  const milestones = useLiveQuery(
    async () => (projectId ? (await db.milestones.where('projectId').equals(projectId).toArray()).sort((a, b) => a.seq - b.seq) : []),
    [projectId],
    [],
  );
  const quotes = useLiveQuery(
    async () => (projectId ? (await db.quotes.where('projectId').equals(projectId).toArray()).sort((a, b) => b.version - a.version) : []),
    [projectId],
    [],
  );
  const transactions = useLiveQuery(
    async () => (projectId ? (await db.transactions.where('projectId').equals(projectId).toArray()).sort((a, b) => b.at.localeCompare(a.at)) : []),
    [projectId],
    [],
  );
  const issues = useLiveQuery(
    async () => (projectId ? (await db.materialIssues.where('projectId').equals(projectId).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [projectId],
    [],
  );
  const tickets = useLiveQuery(
    async () => (projectId ? (await db.tickets.where('projectId').equals(projectId).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [projectId],
    [],
  );
  const rows = useLiveQuery(() => listProjectRows(), []);
  const row = useMemo(() => (rows ?? []).find((r) => r.project.id === projectId), [rows, projectId]);

  const progressPct = useMemo(() => averageProgress(workItems ?? []), [workItems]);
  const cashFlow = useMemo(() => {
    const inVnd = (transactions ?? []).filter((t) => t.type === 'IN').reduce((sum, t) => sum + t.amountVnd, 0);
    const outVnd = (transactions ?? []).filter((t) => t.type === 'OUT').reduce((sum, t) => sum + t.amountVnd, 0);
    return { inVnd, outVnd, netVnd: inVnd - outVnd };
  }, [transactions]);

  const canChangeStatus = can(role, 'project.statusChange');

  if (!project) {
    return <Card loading />;
  }

  const statusMenu = PROJECT_STATUS_ORDER.filter((s) => s !== project.status).map((status) => ({
    key: status,
    label: PROJECT_STATUS_META[status].label,
  }));

  const items = [
    {
      key: 'overview',
      label: 'Tổng quan',
      children: (
        <OverviewTab
          project={project}
          customer={customer}
          milestones={milestones ?? []}
          transactions={transactions ?? []}
          tickets={tickets ?? []}
          progressPct={progressPct}
          cashFlow={cashFlow}
        />
      ),
    },
    {
      key: 'work-items',
      label: `Hạng mục (${(workItems ?? []).length})`,
      children: <WorkItemsTab project={project} items={workItems ?? []} />,
    },
    {
      key: 'quotes',
      label: `Báo giá (${(quotes ?? []).length})`,
      children: <QuotesTab project={project} quotes={quotes ?? []} />,
    },
    {
      key: 'materials',
      label: `Vật tư (${(issues ?? []).length})`,
      children: <MaterialsTab project={project} />,
    },
    {
      key: 'payments',
      label: 'Thanh toán',
      children: <PaymentsTab project={project} milestones={milestones ?? []} transactions={transactions ?? []} />,
    },
    {
      key: 'logs',
      label: 'Nhật ký',
      children: <LogsTab projectId={project.id} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title={
          <Space wrap size={8}>
            <span>{project.code}</span>
            <span style={{ fontWeight: 500 }}>{project.name}</span>
            <StatusTag kind="project" status={project.status} />
            <Tag color={PROJECT_CATEGORY_META[project.category].color}>{PROJECT_CATEGORY_META[project.category].label}</Tag>
          </Space>
        }
        subtitle={
          <Space wrap size={8}>
            <span>Chủ nhà: {customer?.name ?? '—'}</span>
            <span>· {customer?.phone}</span>
            <span>· {project.address}</span>
          </Space>
        }
        extra={[
          <Button key="back" onClick={() => navigate('/projects')}>
            Danh sách dự án
          </Button>,
          canChangeStatus ? (
            <Dropdown
              key="status"
              menu={{
                items: statusMenu,
                onClick: ({ key }) =>
                  void run(() => changeProjectStatus(actor, project.id, key as typeof project.status), {
                    successMessage: `Đã chuyển dự án sang trạng thái ${PROJECT_STATUS_META[key as typeof project.status].label}`,
                  }),
              }}
            >
              <Button icon={<SwapOutlined />} loading={loading}>
                Đổi trạng thái
              </Button>
            </Dropdown>
          ) : null,
        ]}
      />

      <Card size="small" style={{ marginBottom: 12 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
          <Descriptions.Item label="Giá trị hợp đồng">
            <strong>{formatMoney(project.contractValueVnd)}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="Tiến độ hạng mục">{progressPct}%</Descriptions.Item>
          <Descriptions.Item label="Đã thu">
            {row ? `${row.collectedPct}% (${formatMoney(row.paidVnd)})` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Chỉ huy trưởng">{manager?.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Khởi công">{formatDate(project.startDate)}</Descriptions.Item>
          <Descriptions.Item label="Bàn giao dự kiến">{formatDate(project.handoverDate)}</Descriptions.Item>
          <Descriptions.Item label="Dòng tiền dự án">
            <span style={{ color: cashFlow.netVnd >= 0 ? '#2f7d32' : '#c0392b' }}>{formatMoney(cashFlow.netVnd)}</span>
          </Descriptions.Item>
          <Descriptions.Item label="Vật tư đã xuất">
            {formatMoney((issues ?? []).reduce((sum, issue) => sum + issue.totalVnd, 0))}
          </Descriptions.Item>
        </Descriptions>
        <Progress percent={progressPct} strokeColor="#a16207" style={{ marginTop: 4 }} />
        {project.note ? (
          <Typography.Text type="secondary">
            <EditOutlined /> {project.note}
          </Typography.Text>
        ) : null}
      </Card>

      <Tabs activeKey={filters.tab ?? 'overview'} onChange={(key) => setFilters({ tab: key })} items={items} />
    </div>
  );
}
