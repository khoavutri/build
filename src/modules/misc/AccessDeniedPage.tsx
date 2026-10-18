import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../../app/RoleContext';
import { DEFAULT_PAGE_BY_ROLE } from '../../app/RoleContext';
import { ROLE_LABEL } from '../../utils/status';

export function AccessDeniedPage() {
  const navigate = useNavigate();
  const { role } = useRole();
  return (
    <Result
      status="403"
      title="Không có quyền truy cập"
      subTitle={`Vai trò hiện tại (${ROLE_LABEL[role]}) không được phép mở màn hình này. Hãy chuyển vai trò ở góc phải trên nếu cần.`}
      extra={
        <Button type="primary" onClick={() => navigate(DEFAULT_PAGE_BY_ROLE[role])}>
          Về trang mặc định của vai trò
        </Button>
      }
    />
  );
}
