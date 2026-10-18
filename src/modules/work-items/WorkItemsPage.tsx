import { useMemo } from 'react';
import { Card, Empty, Input, Progress, Select, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
import { useRole } from '../../app/RoleContext';
import { useUrlState } from '../../hooks/useUrlState';
import { db } from '../../db/database';
import { updateWorkItemProgress } from '../../services/workItems';
import { can } from '../../services/permissions';
import { formatDate, toDateKey } from '../../utils/format';
import { formatQuantity } from '../../utils/money';
import { WORK_ITEM_STATUS_META } from '../../utils/status';
import { matchesSearch } from '../../utils/text';
import type { Project, WorkItem, WorkItemStatus } from '../../types';

const PROGRESS_STEPS = [0, 25, 50, 75, 100];

interface WorkItemRow {
  item: WorkItem;
  project: Project;
}

export function WorkItemsPage() {
  const { actor, role } = useRole();
  const { run } = useAction();
  const [filters, setFilters] = useUrlState<{ projectId?: string; status?: string; q?: string }>({
    projectId: undefined,
    status: undefined,
    q: undefined,
  });

  const rows = useLiveQuery(async () => {
    const [items, projects] = await Promise.all([db.workItems.toArray(), db.projects.toArray()]);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    return items
      .map((item) => ({ item, project: projectById.get(item.projectId) }))
      .filter((row): row is WorkItemRow => !!row.project)
      .sort((a, b) => (a.item.endDate ?? '9999').localeCompare(b.item.endDate ?? '9999'));
  }, []);

  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const canManage = can(role, 'workItem.manage');
  const todayKey = toDateKey(new Date());
  const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');

  const filtered = useMemo(
    () =>
      (rows ?? []).filter((row) => {
        if (filters.projectId && row.project.id !== filters.projectId) return false;
        if (filters.status && row.item.status !== filters.status) return false;
        if (filters.q && !matchesSearch([row.item.name, row.item.zone, row.item.assignedTo, row.project.code, row.project.name], filters.q)) return false;
        return true;
      }),
    [rows, filters.projectId, filters.status, filters.q],
  );

  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      doing: list.filter((r) => r.item.status === 'DOING').length,
      overdue: list.filter((r) => r.item.endDate && r.item.endDate < todayKey && r.item.status !== 'DONE' && r.item.status !== 'ACCEPTED').length,
      doneThisWeek: list.filter((r) => (r.item.status === 'DONE' || r.item.status === 'ACCEPTED') && r.item.updatedAt && r.item.updatedAt.slice(0, 10) >= weekAgo).length,
    };
  }, [rows, todayKey, weekAgo]);

  const columns: TableColumnsType<WorkItemRow> = [
    { title: 'Dự án', key: 'project', width: 210, render: (_, row) => (
      <div>
        <div className="text-strong">{row.project.code}</div>
        <div className="text-muted">{row.project.name}</div>
      </div>
    ) },
    { title: 'Khu vực', key: 'zone', width: 130, render: (_, row) => <Tag color="default">{row.item.zone}</Tag> },
    { title: 'Hạng mục', key: 'name', width: 320, render: (_, row) => <span className="text-strong">{row.item.name}</span> },
    {
      title: 'ĐVT + KL',
      key: 'qty',
      width: 120,
      render: (_, row) => `${formatQuantity(row.item.quantity)} ${row.item.unit}`,
    },
    { title: 'Tổ phụ trách', key: 'crew', width: 160, render: (_, row) => row.item.assignedTo ?? <span className="text-muted">Chưa gán</span> },
    {
      title: 'Tiến độ',
      key: 'progress',
      width: 220,
      render: (_, row) =>
        canManage ? (
          <Select
            size="small"
            value={row.item.progressPct}
            style={{ width: 90 }}
            options={PROGRESS_STEPS.map((step) => ({ value: step, label: `${step}%` }))}
            onChange={(value) =>
              void run(() => updateWorkItemProgress(actor, row.item.id, value), {
                successMessage: `Đã cập nhật "${row.item.name}" → ${value}%`,
              })
            }
          />
        ) : (
          <Progress percent={row.item.progressPct} size="small" strokeColor="#a16207" />
        ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, row) => <Tag color={WORK_ITEM_STATUS_META[row.item.status].color}>{WORK_ITEM_STATUS_META[row.item.status].label}</Tag>,
    },
    {
      title: 'Kết thúc dự kiến',
      key: 'end',
      width: 130,
      render: (_, row) => {
        const overdue = row.item.endDate && row.item.endDate < todayKey && row.item.status !== 'DONE' && row.item.status !== 'ACCEPTED';
        return (
          <Tooltip title={overdue ? 'Hạng mục đã quá hạn, cần bổ sung nhân lực hoặc điều chỉnh kế hoạch' : undefined}>
            <span style={overdue ? { color: '#c0392b', fontWeight: 600 } : undefined}>{formatDate(row.item.endDate)}</span>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Hạng mục & tiến độ toàn công ty"
        subtitle="Cập nhật nhanh % hoàn thành ngay trên bảng; trạng thái hạng mục được suy ra theo tiến độ."
      />

      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 180 }}>
          <Statistic title="Đang thi công" value={stats.doing} suffix="hạng mục" />
        </Card>
        <Card size="small" style={{ minWidth: 180 }}>
          <Statistic title="Quá hạn chưa xong" value={stats.overdue} suffix="hạng mục" styles={{ content: { color: stats.overdue > 0 ? '#c0392b' : undefined } }} />
        </Card>
        <Card size="small" style={{ minWidth: 180 }}>
          <Statistic title="Hoàn thành 7 ngày qua" value={stats.doneThisWeek} suffix="hạng mục" />
        </Card>
      </Space>

      <div className="page-toolbar">
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Lọc theo dự án"
          style={{ width: 280 }}
          value={filters.projectId}
          onChange={(value) => setFilters({ projectId: value })}
          options={(projects ?? []).map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
        />
        <Select
          allowClear
          placeholder="Trạng thái hạng mục"
          style={{ width: 180 }}
          value={filters.status}
          onChange={(value) => setFilters({ status: value })}
          options={(Object.keys(WORK_ITEM_STATUS_META) as WorkItemStatus[]).map((status) => ({
            value: status,
            label: WORK_ITEM_STATUS_META[status].label,
          }))}
        />
        <Input
          allowClear
          style={{ width: 260 }}
          placeholder="Tìm hạng mục, khu vực, tổ..."
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })}
        />
        <span className="text-muted">Hiển thị {filtered.length} hạng mục</span>
      </div>

      <Table<WorkItemRow>
        rowKey={(row) => row.item.id}
        columns={columns}
        dataSource={filtered}
        size="small"
        loading={rows === undefined}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: 1400 }}
        locale={{ emptyText: <Empty description="Không có hạng mục phù hợp bộ lọc." /> }}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        Mẹo: hạng mục đạt 100% sẽ tự chuyển sang "Xong"; khi nghiệm thu đạt, biên bản sẽ đánh dấu "Đã nghiệm thu" cho toàn bộ hạng mục đã xong của dự án.
      </Typography.Paragraph>
    </div>
  );
}
