import { Empty } from 'antd';
import type { ReactNode } from 'react';

export function EmptyState({ description, action }: { description: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: '#8a7a5f' }}>{description}</span>}>
        {action}
      </Empty>
    </div>
  );
}
