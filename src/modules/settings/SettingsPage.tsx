import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Col, Descriptions, Form, Input, InputNumber, Progress, Row, Space, Table, Typography, Upload } from 'antd';
import { CloudDownloadOutlined, CloudUploadOutlined, DeleteOutlined, SaveOutlined, SafetyOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '../../components/PageHeader';
import { useRole } from '../../app/RoleContext';
import { useAction } from '../../hooks/useAction';
import { db } from '../../db/database';
import {
  DEFAULT_COMPANY_INFO,
  DEFAULT_PRINT_CONFIG,
  DEFAULT_QUOTE_CONFIG,
  getSetting,
  SETTING_KEYS,
  upsertSetting,
  type CompanyInfo,
  type PrintConfig,
  type QuoteConfig,
} from '../../services/settings';
import {
  APP_VERSION,
  currentDbInfo,
  downloadBackup,
  getStorageEstimate,
  importBackup,
  readBackupFile,
  requestPersistentStorage,
  resetInitialData,
  validateBackupShape,
} from '../../services/backup';
import { ROLE_LABEL } from '../../utils/status';
import { formatBytes, formatDateTime } from '../../utils/format';

export function SettingsPage() {
  const { actor, options, setRole, role } = useRole();
  const { message, modal } = App.useApp();
  const { loading, run } = useAction();
  const [companyForm] = Form.useForm<CompanyInfo>();
  const [quoteForm] = Form.useForm<QuoteConfig & { milestonePctsText?: string }>();
  const [printForm] = Form.useForm<PrintConfig>();
  const [busy, setBusy] = useState(false);

  const company = useLiveQuery(() => getSetting<CompanyInfo>(SETTING_KEYS.COMPANY_INFO, DEFAULT_COMPANY_INFO), [], DEFAULT_COMPANY_INFO);
  const quoteConfig = useLiveQuery(() => getSetting<QuoteConfig>(SETTING_KEYS.QUOTE_CONFIG, DEFAULT_QUOTE_CONFIG), [], DEFAULT_QUOTE_CONFIG);
  const printConfig = useLiveQuery(() => getSetting<PrintConfig>(SETTING_KEYS.PRINT_CONFIG, DEFAULT_PRINT_CONFIG), [], DEFAULT_PRINT_CONFIG);
  const dbInfo = useLiveQuery(() => currentDbInfo(), []);
  const storage = useLiveQuery(() => getStorageEstimate(), []);
  const sequences = useLiveQuery(() => db.documentSequences.toArray(), [], []);
  const counts = useLiveQuery(async () => {
    const tables = [
      'customers',
      'projects',
      'workItems',
      'milestones',
      'quotes',
      'quoteItems',
      'materials',
      'stockMovements',
      'purchaseOrders',
      'materialIssues',
      'suppliers',
      'workers',
      'timesheets',
      'transactions',
      'handovers',
      'tickets',
    ] as const;
    const rows: Array<{ name: string; count: number }> = [];
    for (const name of tables) {
      rows.push({ name, count: await db.table(name).count() });
    }
    return rows;
  }, []);

  useEffect(() => {
    companyForm.setFieldsValue(company);
  }, [company, companyForm]);
  useEffect(() => {
    quoteForm.setFieldsValue({ ...quoteConfig, milestonePctsText: quoteConfig.defaultMilestonePcts.join('/') });
  }, [quoteConfig, quoteForm]);
  useEffect(() => {
    printForm.setFieldsValue(printConfig);
  }, [printConfig, printForm]);

  const handleImport = async (file: File) => {
    try {
      setBusy(true);
      const raw = await readBackupFile(file);
      const validation = validateBackupShape(raw);
      if (!validation.ok) {
        modal.error({
          title: 'Không thể nhập bản sao lưu',
          content: (
            <ul style={{ paddingInlineStart: 18 }}>
              {validation.errors.slice(0, 6).map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          ),
        });
        return;
      }
      modal.confirm({
        title: 'Thay thế toàn bộ dữ liệu hiện tại?',
        content: `Tệp chứa ${validation.summary?.records.toLocaleString('vi-VN')} bản ghi (${validation.summary?.tables} bảng), xuất lúc ${
          validation.summary?.exportedAt ? formatDateTime(validation.summary.exportedAt) : '—'
        }. Toàn bộ dữ liệu đang có trong trình duyệt này sẽ bị thay thế, không hỗ trợ trộn hai bộ dữ liệu.`,
        okText: 'Thay toàn bộ',
        okButtonProps: { danger: true },
        onOk: async () => {
          const result = await run(() => importBackup(actor, raw), { successMessage: 'Đã khôi phục bản sao lưu' });
          if (result) message.info(`Đã nhập ${result.importedRecords.toLocaleString('vi-VN')} bản ghi từ ${result.importedTables} bảng.`);
        },
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không đọc được tệp sao lưu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Thiết lập"
        subtitle="Thông tin công ty, cấu hình báo giá – đợt thanh toán, mẫu in, sao lưu/khôi phục và thông tin hệ thống."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title="Thông tin công ty (dùng cho mẫu in)"
            extra={
              <Button
                size="small"
                icon={<SaveOutlined />}
                loading={loading}
                onClick={async () => {
                  const values = await companyForm.validateFields();
                  await run(() => upsertSetting(actor, SETTING_KEYS.COMPANY_INFO, values), { successMessage: 'Đã lưu thông tin công ty' });
                }}
              >
                Lưu
              </Button>
            }
          >
            <Form form={companyForm} layout="vertical" initialValues={company}>
              <Form.Item name="name" label="Tên công ty" rules={[{ required: true, min: 2 }]}>
                <Input />
              </Form.Item>
              <Form.Item name="address" label="Địa chỉ">
                <Input />
              </Form.Item>
              <Space size={12} style={{ width: '100%' }}>
                <Form.Item name="phone" label="Hotline" style={{ flex: 1 }}>
                  <Input />
                </Form.Item>
                <Form.Item name="taxCode" label="Mã số thuế" style={{ flex: 1 }}>
                  <Input />
                </Form.Item>
              </Space>
              <Space size={12} style={{ width: '100%' }}>
                <Form.Item name="email" label="Email" style={{ flex: 1 }}>
                  <Input />
                </Form.Item>
                <Form.Item name="website" label="Website" style={{ flex: 1 }}>
                  <Input placeholder="khoadev.vn" />
                </Form.Item>
              </Space>
              <Form.Item name="representative" label="Người đại diện pháp luật">
                <Input placeholder="Họ tên — chức danh" />
              </Form.Item>
              <Form.Item name="slogan" label="Slogan">
                <Input />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            size="small"
            title="Cấu hình báo giá & đợt thanh toán"
            extra={
              <Button
                size="small"
                icon={<SaveOutlined />}
                loading={loading}
                onClick={async () => {
                  const values = await quoteForm.validateFields();
                  const pcts = (values.milestonePctsText ?? '')
                    .split('/')
                    .map((part) => Number(part.trim()))
                    .filter((value) => !Number.isNaN(value) && value > 0);
                  const payload: QuoteConfig = {
                    defaultVatPct: values.defaultVatPct,
                    defaultDiscountPct: values.defaultDiscountPct,
                    defaultMilestonePcts: pcts.length > 0 ? pcts : DEFAULT_QUOTE_CONFIG.defaultMilestonePcts,
                  };
                  await run(() => upsertSetting(actor, SETTING_KEYS.QUOTE_CONFIG, payload), { successMessage: 'Đã lưu cấu hình báo giá' });
                }}
              >
                Lưu
              </Button>
            }
          >
            <Form form={quoteForm} layout="vertical" initialValues={quoteConfig}>
              <Space size={12} style={{ width: '100%' }}>
                <Form.Item name="defaultVatPct" label="VAT mặc định (%)" style={{ flex: 1 }}>
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="defaultDiscountPct" label="Chiết khấu mặc định (%)" style={{ flex: 1 }}>
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="milestonePctsText" label="Tỷ lệ đợt mặc định" style={{ flex: 1.4 }}>
                  <Input placeholder="30/30/30/10" />
                </Form.Item>
              </Space>
              <Alert
                type="info"
                showIcon
                title="Tỷ lệ đợt mặc định dùng khi bật tuỳ chọn tạo 4 đợt thanh toán lúc tạo dự án mới (tổng nên bằng 100%)."
              />
            </Form>
          </Card>

          <Card
            size="small"
            title="Mẫu in chứng từ"
            style={{ marginTop: 12 }}
            extra={
              <Button
                size="small"
                icon={<SaveOutlined />}
                loading={loading}
                onClick={async () => {
                  const values = await printForm.validateFields();
                  await run(() => upsertSetting(actor, SETTING_KEYS.PRINT_CONFIG, values), { successMessage: 'Đã lưu mẫu in' });
                }}
              >
                Lưu
              </Button>
            }
          >
            <Form form={printForm} layout="vertical" initialValues={printConfig}>
              <Form.Item name="quotationValidityDays" label="Số ngày hiệu lực báo giá">
                <InputNumber min={1} max={90} style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="quoteFooterNote" label="Ghi chú cuối báo giá">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Form.Item name="handoverFooterNote" label="Ghi chú cuối biên bản nghiệm thu/bàn giao">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title="Vai trò trải nghiệm" style={{ marginBottom: 12 }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              Chuyển vai trò chỉ mô phỏng trải nghiệm; dữ liệu trình duyệt không tạo ranh giới bảo mật. Khi có máy chủ, quyền sẽ được kiểm tra lại phía
              máy chủ.
            </Typography.Paragraph>
            <Space wrap>
              {options.map((option) => (
                <Button key={option.value} type={role === option.value ? 'primary' : 'default'} onClick={() => setRole(option.value)}>
                  {ROLE_LABEL[option.value]} {option.employeeName ? `— ${option.employeeName}` : ''}
                </Button>
              ))}
            </Space>
          </Card>

          <Card size="small" title="Định dạng chứng từ" style={{ marginBottom: 12 }}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="Dự án">DA-{new Date().getFullYear()}-xx</Descriptions.Item>
              <Descriptions.Item label="Báo giá">BG-{new Date().getFullYear()}-xx</Descriptions.Item>
              <Descriptions.Item label="Phiếu mua/xuất">PN/PX-{new Date().getFullYear()}-xx</Descriptions.Item>
              <Descriptions.Item label="Phiếu thu/chi">PT/PC-{new Date().getFullYear()}-xx</Descriptions.Item>
              <Descriptions.Item label="Nghiệm thu/bàn giao">NT-{new Date().getFullYear()}-xx</Descriptions.Item>
              <Descriptions.Item label="Bảo hành">BH-{new Date().getFullYear()}-xx</Descriptions.Item>
            </Descriptions>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={[...(sequences ?? [])].sort((a, b) => a.id.localeCompare(b.id))}
              scroll={{ y: 220 }}
              columns={[
                { title: 'Loại chứng từ', key: 'type', render: (_, s) => s.documentType },
                { title: 'Kỳ', dataIndex: 'period', key: 'period', width: 90, render: (v) => (v ? v : '—') },
                { title: 'Số kế tiếp', dataIndex: 'nextValue', key: 'next', width: 110, align: 'right' },
              ]}
            />
          </Card>

          <Card
            size="small"
            title="Dung lượng và sao lưu"
            extra={
              <Button
                size="small"
                icon={<SafetyOutlined />}
                onClick={async () => {
                  const granted = await requestPersistentStorage();
                  message.info(
                    granted
                      ? 'Trình duyệt đã cho phép lưu trữ bền vững.'
                      : 'Trình duyệt chưa cấp lưu trữ bền vững — dữ liệu có thể bị xoá khi bộ nhớ thiếu.',
                  );
                }}
              >
                Xin lưu trữ bền vững
              </Button>
            }
          >
            {storage ? (
              <>
                <Progress percent={Math.min(100, Number(storage.percentage.toFixed(2)))} status="normal" />
                <Typography.Text type="secondary">
                  Đang dùng {formatBytes(storage.usage)} / hạn mức khoảng {formatBytes(storage.quota)}. Dữ liệu lưu theo tên miền và cổng truy cập của trình
                  duyệt.
                </Typography.Text>
              </>
            ) : (
              <Typography.Text type="secondary">Trình duyệt không hỗ trợ đọc ước lượng dung lượng.</Typography.Text>
            )}
            <Space style={{ marginTop: 12 }} wrap>
              <Button
                icon={<CloudDownloadOutlined />}
                loading={busy}
                onClick={() => void run(() => downloadBackup(actor), { successMessage: 'Đã tạo tệp sao lưu JSON' })}
              >
                Xuất bản sao lưu
              </Button>
              <Upload accept="application/json" showUploadList={false} beforeUpload={(file) => { void handleImport(file as unknown as File); return false; }}>
                <Button icon={<CloudUploadOutlined />}>Nhập bản sao lưu (thay toàn bộ)</Button>
              </Upload>
            </Space>
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              title="Tệp sao lưu chứa phiên bản lược đồ, thời điểm xuất và toàn bộ bảng dữ liệu. Khi nhập, hệ thống kiểm tra lược đồ, ID trùng và liên kết thiếu trước khi thay dữ liệu."
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title="Thông tin phiên bản và liên hệ">
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Phiên bản ứng dụng">{APP_VERSION}</Descriptions.Item>
              <Descriptions.Item label="Phiên bản lược đồ dữ liệu">v{dbInfo?.schemaVersion}</Descriptions.Item>
              <Descriptions.Item label="Phiên bản dữ liệu mẫu">v{dbInfo?.seedVersion ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Khởi tạo lúc">{dbInfo?.seededAt ? formatDateTime(dbInfo.seededAt) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Tên vùng dữ liệu">{dbInfo?.dbName}</Descriptions.Item>
              <Descriptions.Item label="Phát triển bởi">KhoaDev</Descriptions.Item>
              <Descriptions.Item label="Website">khoadev.vn</Descriptions.Item>
              <Descriptions.Item label="Email liên hệ">khoadev.company@gmail.com</Descriptions.Item>
            </Descriptions>
            <Table
              size="small"
              rowKey="name"
              pagination={false}
              dataSource={counts ?? []}
              columns={[
                { title: 'Bảng dữ liệu', dataIndex: 'name', key: 'name' },
                { title: 'Số bản ghi', dataIndex: 'count', key: 'count', align: 'right', width: 120 },
              ]}
            />
          </Card>

          <Card size="small" title="Khôi phục dữ liệu mẫu (chỉ giám đốc)" style={{ marginTop: 12 }}>
            <Typography.Paragraph type="secondary">
              Xoá toàn bộ dữ liệu đang lưu trong trình duyệt và tạo lại bộ dữ liệu mẫu (7 dự án, báo giá, vật tư, ngày công, thu chi theo ngày tương đối).
              Thao tác không thể hoàn tác — hãy xuất bản sao lưu trước nếu cần giữ dữ liệu đã thao tác.
            </Typography.Paragraph>
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={busy || loading}
              onClick={() =>
                modal.confirm({
                  title: 'Khôi phục dữ liệu mẫu?',
                  content: 'Toàn bộ dự án, chứng từ, vật tư, nhân công và giao dịch hiện có sẽ bị thay thế bằng dữ liệu mẫu. Bạn có chắc chắn?',
                  okText: 'Xoá và tạo lại dữ liệu mẫu',
                  okButtonProps: { danger: true },
                  onOk: async () => {
                    setBusy(true);
                    try {
                      await resetInitialData(actor);
                      message.success('Đã tạo lại dữ liệu mẫu. Ứng dụng sẽ tải lại.');
                      window.setTimeout(() => window.location.reload(), 600);
                    } finally {
                      setBusy(false);
                    }
                  },
                })
              }
            >
              Khôi phục dữ liệu mẫu
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
