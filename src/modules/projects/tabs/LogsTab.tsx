import { Card, Empty, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/database';
import { formatDateTime } from '../../../utils/format';
import type { ActivityLog } from '../../../types';

export function LogsTab({ projectId }: { projectId: string }) {
  const logs = useLiveQuery(
    async () => (await db.activityLogs.where('projectId').equals(projectId).toArray()).sort((a, b) => b.at.localeCompare(a.at)),
    [projectId],
    [],
  );

  const columns: TableColumnsType<ActivityLog> = [
    { title: 'Thời điểm', key: 'at', width: 160, render: (_, log) => formatDateTime(log.at) },
    { title: 'Người thực hiện', key: 'actor', width: 180, render: (_, log) => log.actorName ?? '—' },
    { title: 'Hành động', key: 'action', width: 200, render: (_, log) => <Tag color="gold">{log.action}</Tag> },
    { title: 'Nội dung', key: 'summary', render: (_, log) => log.summary },
  ];

  return (
    <Card size="small" title={`Nhật ký dự án (${(logs ?? []).length})`}>
      <Table<ActivityLog>
        rowKey="id"
        columns={columns}
        dataSource={logs ?? []}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{ emptyText: <Empty description="Chưa có nhật ký cho dự án này." /> }}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        Nhật ký ghi lại mọi thao tác tạo – sửa – duyệt – thu chi – xuất kho gắn dự án, phục vụ tra soát khi có tranh chấp.
      </Typography.Paragraph>
    </Card>
  );
}
