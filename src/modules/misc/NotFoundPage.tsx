import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage({ path }: { path: string }) {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="Không tìm thấy trang"
      subTitle={`Đường dẫn "${path}" không tồn tại trong hệ thống.`}
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          Về trang tổng quan
        </Button>
      }
    />
  );
}
