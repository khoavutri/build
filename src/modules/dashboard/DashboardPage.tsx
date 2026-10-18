import { useMemo, useState } from 'react';
import { Alert, Badge, Card, Progress, Segmented, Space, Tag, Tooltip, Typography } from 'antd';
import {
  AlertOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileProtectOutlined,
  HomeOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDashboardData } from '../../repositories/reports';
import { formatDate, formatDateTime } from '../../utils/format';
import { formatMoney, formatMoneyShort } from '../../utils/money';
import { StatusTag } from '../../components/StatusTag';
import { useRole } from '../../app/RoleContext';
import styles from './Dashboard.module.scss';

type PeriodKey = 'week' | 'month' | 'all';

export function DashboardPage() {
  const navigate = useNavigate();
  const { role } = useRole();
  const [period, setPeriod] = useState<PeriodKey>('month');

  const data = useLiveQuery(() => getDashboardData(), []);

  const showFinancial = role === 'MANAGER' || role === 'ACCOUNTANT';

  const weeklyMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.weeklyFlow.map((row) => Math.max(row.inVnd, row.outVnd)));
  }, [data]);

  if (!data) {
    return <Card loading />;
  }

  const periodLabel = period === 'week' ? 'tuần này' : period === 'month' ? 'tháng này' : 'toàn kỳ';
  const kpis = [
    {
      key: 'active-projects',
      label: 'Dự án đang thi công',
      icon: <HomeOutlined />,
      value: String(data.activeProjects),
      hint: 'Gồm dự án Đang thi công và Nghiệm thu',
      onClick: () => navigate('/projects?status=CONSTRUCTION'),
    },
    {
      key: 'contract-value',
      label: 'Giá trị HĐ đang chạy',
      icon: <RiseOutlined />,
      value: formatMoneyShort(data.runningContractValueVnd),
      hint: 'Σ giá trị hợp đồng các dự án đang thi công',
      onClick: () => navigate('/reports?tab=projects'),
    },
    {
      key: 'collected',
      label: 'Đã thu tháng này',
      icon: <DollarOutlined />,
      value: formatMoneyShort(data.collectedThisMonthVnd),
      hint: 'Phiếu thu gắn dự án và thu khác trong tháng',
      onClick: () => navigate('/finance?tab=receipts'),
    },
    {
      key: 'receivable',
      label: 'Phải thu còn lại',
      icon: <ClockCircleOutlined />,
      value: formatMoneyShort(data.receivableVnd),
      hint: 'Σ các đợt thanh toán chưa thu xong',
      danger: data.receivableVnd > 0,
      onClick: () => navigate('/finance?tab=debt'),
    },
    {
      key: 'progress',
      label: 'Tiến độ trung bình',
      icon: <SafetyCertificateOutlined />,
      value: `${data.avgProgressPct}%`,
      hint: 'Bình quân tiến độ hạng mục dự án đang thi công',
      onClick: () => navigate('/work-items'),
    },
    {
      key: 'supplier-debt',
      label: 'Công nợ NCC/thầu phụ',
      icon: <TeamOutlined />,
      value: formatMoneyShort(data.supplierDebtVnd),
      hint: 'Σ phiếu mua đã nhận − Σ phiếu chi cho đối tượng',
      danger: data.supplierDebtVnd > 0,
      onClick: () => navigate('/finance?tab=debt'),
    },
  ];

  const moneyCards = [
    {
      key: 'flow',
      label: `Dòng tiền ${periodLabel}`,
      value: formatMoney(period === 'all' ? data.cashRevenueVnd : data.monthInVnd - data.monthOutVnd),
      hint: `Thu ${formatMoneyShort(data.monthInVnd)} · Chi ${formatMoneyShort(data.monthOutVnd)}`,
      onClick: () => navigate('/finance?tab=cashbook'),
      tone: (period === 'all' ? data.cashRevenueVnd : data.monthInVnd - data.monthOutVnd) >= 0 ? 'positive' : 'negative',
    },
    {
      key: 'material',
      label: 'Chi phí vật tư 30 ngày',
      value: formatMoney(data.materialCost30dVnd),
      hint: 'Tổng giá trị các phiếu xuất công trình trong 30 ngày',
      onClick: () => navigate('/materials?tab=issues'),
    },
    {
      key: 'payroll',
      label: 'Lương nhân công tháng',
      value: formatMoney(data.payrollThisMonthVnd),
      hint: 'Σ ngày công × đơn giá ngày công của thợ',
      onClick: () => navigate('/workers?tab=timesheets'),
    },
    {
      key: 'cumulative',
      label: 'Doanh thu lũy kế (sổ quỹ thu)',
      value: formatMoney(data.cashRevenueVnd),
      hint: 'Σ toàn bộ phiếu thu đã ghi nhận',
      onClick: () => navigate('/finance?tab=cashbook'),
    },
  ];

  const alertCount =
    data.overdueMilestones.length + data.overdueItems.length + data.openTickets.length + data.upcomingHandovers.filter((h) => h.daysLeft < 0).length;

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Space>
          <Segmented<PeriodKey>
            value={period}
            onChange={(value) => setPeriod(value)}
            options={[
              { value: 'week', label: 'Tuần' },
              { value: 'month', label: 'Tháng' },
              { value: 'all', label: 'Toàn kỳ' },
            ]}
          />
          <Typography.Text type="secondary">Số liệu cập nhật theo thời điểm thao tác gần nhất, không cần tải lại trang.</Typography.Text>
        </Space>
        <Space>
          <Badge count={alertCount} size="small">
            <Tag color={alertCount > 0 ? 'red' : 'default'} icon={<WarningOutlined />}>
              Cảnh báo cần xử lý
            </Tag>
          </Badge>
        </Space>
      </div>

      <div className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <div
            key={kpi.key}
            className={styles.kpiCard}
            onClick={kpi.onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && kpi.onClick()}
          >
            <div className={styles.kpiLabel}>
              {kpi.icon} {kpi.label}
            </div>
            <div className={styles.kpiValue} style={kpi.danger ? { color: '#c0392b' } : undefined}>
              {kpi.value}
            </div>
            <div className={styles.kpiHint}>{kpi.hint}</div>
          </div>
        ))}
      </div>

      {showFinancial ? (
        <div className={styles.moneyRow}>
          {moneyCards.map((card) => (
            <div key={card.key} className={styles.moneyCard} onClick={card.onClick} role="button" tabIndex={0}>
              <div className={styles.moneyLabel}>{card.label}</div>
              <div className={styles.moneyValue} style={card.tone === 'negative' ? { color: '#c0392b' } : card.tone === 'positive' ? { color: '#2f7d32' } : undefined}>
                {card.value}
              </div>
              <div className={styles.kpiHint}>{card.hint}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.columns}>
        <div>
          <Card title="Thu – chi 6 tuần gần nhất" size="small" style={{ marginBottom: 14 }}>
            <div className={styles.chart}>
              {data.weeklyFlow.map((row) => (
                <div key={row.fromKey} className={styles.chartGroup}>
                  <div className={styles.chartBars}>
                    <Tooltip title={`Thu ${formatMoney(row.inVnd)}`}>
                      <div className={styles.barIn} style={{ height: `${Math.max(2, (row.inVnd / weeklyMax) * 120)}px` }} />
                    </Tooltip>
                    <Tooltip title={`Chi ${formatMoney(row.outVnd)}`}>
                      <div className={styles.barOut} style={{ height: `${Math.max(2, (row.outVnd / weeklyMax) * 120)}px` }} />
                    </Tooltip>
                  </div>
                  <div className={styles.chartLabel}>{row.label}</div>
                  <div className={styles.chartValue}>{formatMoneyShort(row.inVnd - row.outVnd)}</div>
                </div>
              ))}
            </div>
            <Space size={16} style={{ marginTop: 8 }}>
              <span className={styles.legend}>
                <i className={styles.legendIn} /> Thu
              </span>
              <span className={styles.legend}>
                <i className={styles.legendOut} /> Chi
              </span>
              <Typography.Text type="secondary">Số dưới mỗi tuần là chênh lệch thu − chi.</Typography.Text>
            </Space>
          </Card>

          <Card title="Tiến độ dự án đang thi công" size="small" style={{ marginBottom: 14 }}>
            {data.projectProgress.length === 0 ? (
              <Typography.Text type="secondary">Không có dự án nào đang thi công.</Typography.Text>
            ) : (
              data.projectProgress.map((row) => (
                <div key={row.project.id} className={styles.progressRow} onClick={() => navigate(`/projects/${row.project.id}`)}>
                  <div className={styles.progressHead}>
                    <span className="text-strong">{row.project.code}</span>
                    <span className="text-muted">
                      {row.project.name} · {row.customerName}
                    </span>
                    <span className="text-strong">{row.progressPct}%</span>
                  </div>
                  <Progress percent={row.progressPct} showInfo={false} strokeColor="#a16207" />
                </div>
              ))
            )}
          </Card>

          <Card title="Cảnh báo cần xử lý" size="small">
            {data.overdueMilestones.length === 0 && data.overdueItems.length === 0 && data.openTickets.length === 0 && data.upcomingHandovers.length === 0 ? (
              <Alert type="success" showIcon title="Không có cảnh báo nào. Mọi công trình đang đúng tiến độ." />
            ) : (
              <Space orientation="vertical" style={{ width: '100%' }} size={4}>
                {data.overdueMilestones.map((row) => (
                  <div key={row.milestone.id} className={styles.alertItem}>
                    <AlertOutlined style={{ color: '#d64545', marginTop: 3 }} />
                    <div>
                      <a onClick={() => navigate(`/projects/${row.project.id}?tab=overview`)}>
                        <strong>{row.project.code}</strong> — đợt thu "{row.milestone.name}" quá hạn {formatDate(row.milestone.dueDate)}, còn{' '}
                        {formatMoney(row.row.remainingVnd)}
                      </a>
                      <div className="text-muted">{row.project.name}</div>
                    </div>
                  </div>
                ))}
                {data.overdueItems.map((row) => (
                  <div key={row.item.id} className={styles.alertItem}>
                    <ClockCircleOutlined style={{ color: '#e8930c', marginTop: 3 }} />
                    <div>
                      <a onClick={() => navigate(`/projects/${row.project.id}?tab=work-items`)}>
                        Hạng mục quá hạn: <strong>{row.item.name}</strong> ({row.item.zone}) — hạn {formatDate(row.item.endDate)}
                      </a>
                      <div className="text-muted">
                        {row.project.code} · {row.item.assignedTo ?? 'Chưa gán tổ'}
                      </div>
                    </div>
                  </div>
                ))}
                {data.upcomingHandovers.map((row) => (
                  <div key={row.project.id} className={styles.alertItem}>
                    <FileProtectOutlined style={{ color: row.daysLeft < 0 ? '#d64545' : '#a16207', marginTop: 3 }} />
                    <div>
                      <a onClick={() => navigate(`/projects/${row.project.id}`)}>
                        Dự án <strong>{row.project.code}</strong>{' '}
                        {row.daysLeft < 0 ? `quá hạn bàn giao ${Math.abs(row.daysLeft)} ngày` : `sắp bàn giao sau ${row.daysLeft} ngày`}
                      </a>
                      <div className="text-muted">Ngày bàn giao dự kiến {formatDate(row.project.handoverDate)}</div>
                    </div>
                  </div>
                ))}
                {data.openTickets.map((row) => (
                  <div key={row.ticket.id} className={styles.alertItem}>
                    <TeamOutlined style={{ color: '#a16207', marginTop: 3 }} />
                    <div>
                      <a onClick={() => navigate('/handovers?tab=tickets')}>
                        Ticket bảo hành <strong>{row.ticket.code}</strong> đang mở — {row.ticket.description.slice(0, 60)}
                      </a>
                      <div className="text-muted">
                        {row.project.code} · mở ngày {formatDate(row.ticket.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </div>

        <div>
          <Card title="Đợt thanh toán tới hạn" size="small" style={{ marginBottom: 14 }}>
            {data.upcomingMilestones.length === 0 ? (
              <Typography.Text type="secondary">Không có đợt nào tới hạn trong thời gian tới.</Typography.Text>
            ) : (
              <Space orientation="vertical" style={{ width: '100%' }} size={4}>
                {data.upcomingMilestones.map((row) => (
                  <div key={row.milestone.id} className={styles.alertItem}>
                    <DollarOutlined style={{ color: '#a16207', marginTop: 3 }} />
                    <div style={{ flex: 1 }}>
                      <a onClick={() => navigate(`/projects/${row.project.id}?tab=overview`)}>
                        <strong>{row.project.code}</strong> — {row.milestone.name}
                      </a>
                      <div className="text-muted">
                        Hạn {formatDate(row.milestone.dueDate)} · {row.milestone.pct}% = {formatMoney(row.milestone.amountVnd)} · còn{' '}
                        {formatMoney(row.milestone.amountVnd - row.milestone.paidVnd)}
                      </div>
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>

          <Card title="Hoạt động gần đây" size="small" style={{ marginBottom: 14 }}>
            <div>
              {data.recentActivities.map((item) => (
                <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px dashed #f0e9dc' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Tooltip title={item.summary}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.summary}</span>
                    </Tooltip>
                    <span className="text-muted">
                      {formatDateTime(item.at)}
                      {item.actorName ? ` · ${item.actorName}` : ''}
                    </span>
                  </div>
                  {item.projectId ? <a onClick={() => navigate(`/projects/${item.projectId}`)}>Mở</a> : null}
                </div>
              ))}
            </div>
          </Card>

          {showFinancial ? (
            <Card title="Cơ cấu dòng tiền" size="small">
              <Space orientation="vertical" style={{ width: '100%' }} size={6}>
                <div>
                  <div className="text-muted">Tổng thu toàn kỳ</div>
                  <div className={styles.moneyValue}>{formatMoney(data.cashRevenueVnd)}</div>
                </div>
                <div>
                  <div className="text-muted">Thu tháng này</div>
                  <div>{formatMoney(data.monthInVnd)}</div>
                </div>
                <div>
                  <div className="text-muted">Chi tháng này</div>
                  <div>{formatMoney(data.monthOutVnd)}</div>
                </div>
                <div>
                  <div className="text-muted">Chênh lệch tháng</div>
                  <div className="text-strong" style={{ color: data.monthNetVnd >= 0 ? '#2f7d32' : '#c0392b' }}>
                    {formatMoney(data.monthNetVnd)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <StatusTag kind="project" status="CONSTRUCTION" />
                  <StatusTag kind="project" status="WARRANTY" />
                </div>
              </Space>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
