import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Layout, Menu, Select, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  BarChartOutlined,
  BuildOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileDoneOutlined,
  ProjectOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { canViewRoute, useRole } from '../../app/RoleContext';
import { GlobalSearch } from '../../components/GlobalSearch';
import { ROLE_LABEL } from '../../utils/status';
import { DEFAULT_COMPANY_INFO, getSetting, SETTING_KEYS, type CompanyInfo } from '../../services/settings';
import type { RoleId } from '../../types';
import styles from './MainLayout.module.scss';

interface MenuEntry {
  key: string;
  icon?: ReactNode;
  label: ReactNode;
}

export function MainLayout() {
  const { role, actor, options, setRole } = useRole();
  const navigate = useNavigate();
  const location = useLocation();
  const company = useLiveQuery(() => getSetting<CompanyInfo>(SETTING_KEYS.COMPANY_INFO, DEFAULT_COMPANY_INFO), [], DEFAULT_COMPANY_INFO);
  const companyName = company?.name ?? DEFAULT_COMPANY_INFO.name;

  const items = useMemo(() => {
    const groups: Array<{ key: string; label: string; children: MenuEntry[] }> = [
      {
        key: 'g-dashboard',
        label: 'Tổng quan',
        children: [{ key: '/dashboard', icon: <DashboardOutlined />, label: 'Tổng quan' }],
      },
      {
        key: 'g-projects',
        label: 'Dự án',
        children: [{ key: '/projects', icon: <ProjectOutlined />, label: 'Danh sách dự án' }],
      },
      {
        key: 'g-site',
        label: 'Thi công',
        children: [
          { key: '/work-items', icon: <ToolOutlined />, label: 'Hạng mục & tiến độ' },
          { key: '/handovers', icon: <FileDoneOutlined />, label: 'Nghiệm thu & bảo hành' },
        ],
      },
      {
        key: 'g-materials',
        label: 'Vật tư & NCC',
        children: [
          { key: '/materials', icon: <BuildOutlined />, label: 'Vật tư' },
          { key: '/suppliers', icon: <ShopOutlined />, label: 'NCC & thầu phụ' },
        ],
      },
      {
        key: 'g-labor',
        label: 'Nhân công',
        children: [{ key: '/workers', icon: <TeamOutlined />, label: 'Nhân công & ngày công' }],
      },
      {
        key: 'g-finance',
        label: 'Tài chính',
        children: [{ key: '/finance', icon: <DollarOutlined />, label: 'Thu chi & công nợ' }],
      },
      {
        key: 'g-admin',
        label: 'Quản trị',
        children: [
          { key: '/reports', icon: <BarChartOutlined />, label: 'Báo cáo' },
          { key: '/settings', icon: <SettingOutlined />, label: 'Thiết lập' },
        ],
      },
    ];
    return groups
      .map((group) => ({
        ...group,
        children: group.children.filter((c) => canViewRoute(role, c.key)),
      }))
      .filter((group) => group.children.length > 0);
  }, [role]);

  const selectedKeys = useMemo(() => {
    const path = location.pathname;
    const flat = items.flatMap((g) => g.children.map((c) => c.key));
    const match = flat.filter((k) => path.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    return match ? [match] : [];
  }, [items, location.pathname]);

  const openKeys = useMemo(() => items.filter((g) => g.children.some((c) => selectedKeys.includes(c.key))).map((g) => g.key), [items, selectedKeys]);

  const contentRef = useRef<HTMLElement>(null);

  // Đổi trang thì đưa vùng nội dung về đầu, không ảnh hưởng sider/header
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <Layout className="build-layout">
      <Layout.Sider width={236} className={styles.sider} breakpoint="lg" collapsedWidth={64}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>{companyName.trim().charAt(0).toUpperCase() || 'B'}</div>
          <div className={styles.brandText}>
            <div className={styles.brandName}>BuildOne</div>
            <div className={styles.brandSub}>{companyName}</div>
          </div>
        </div>
        <div className={styles.menuWrap}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={selectedKeys}
            defaultOpenKeys={openKeys}
            items={items.map((g) => ({
              key: g.key,
              icon: <AppstoreOutlined />,
              label: g.label,
              children: g.children.map((c) => ({ key: c.key, icon: c.icon, label: c.label })),
            }))}
            onClick={({ key }) => navigate(key)}
          />
        </div>
        <div className={styles.siderFooter}>
          <div>
            <strong>KhoaDev</strong> · khoadev.vn
          </div>
          <div>khoadev.company@gmail.com</div>
        </div>
      </Layout.Sider>
      <Layout className={styles.main}>
        <Layout.Header className={styles.header}>
          <GlobalSearch />
          <div className={styles.headerSpacer} />
          <div className={styles.roleBox}>
            <Tooltip title="Chuyển vai trò sử dụng. Dữ liệu không tách theo người dùng; khi có máy chủ, quyền sẽ được kiểm tra lại.">
              <Select
                value={role}
                style={{ width: 226 }}
                options={options.map((o) => ({
                  value: o.value,
                  label: (
                    <span>
                      {ROLE_LABEL[o.value as RoleId]}
                      {o.employeeName ? <span className="text-muted"> — {o.employeeName}</span> : null}
                    </span>
                  ),
                }))}
                onChange={(value) => setRole(value as RoleId)}
              />
            </Tooltip>
            <div className={styles.roleHint}>
              <div>
                <UserOutlined /> {actor.name}
              </div>
              <div>{ROLE_LABEL[role]}</div>
            </div>
          </div>
        </Layout.Header>
        <Layout.Content ref={contentRef} className={styles.content}>
          <div className="page-content">
            <Outlet />
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
