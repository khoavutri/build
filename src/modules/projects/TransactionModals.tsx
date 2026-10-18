import { useEffect } from 'react';
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Space, Typography } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db } from '../../db/database';
import { useAction } from '../../hooks/useAction';
import { useRole } from '../../app/RoleContext';
import { createPayment, createReceipt } from '../../services/finance';
import { formatMoney, parseMoneyInput } from '../../utils/money';
import type { PaymentMethod, Milestone, Project, Transaction } from '../../types';

/** Modal thu tiền nhanh theo đợt thanh toán của dự án */
export function ReceiptModal({
  open,
  onClose,
  project,
  milestones,
  defaultMilestoneId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  milestones: Milestone[];
  defaultMilestoneId?: string;
  onSaved?: () => void;
}) {
  const { actor } = useRole();
  const { loading, run } = useAction();
  const [form] = Form.useForm<{ milestoneId?: string; amountVnd: number; method: PaymentMethod; at: dayjs.Dayjs; payerName?: string; note?: string }>();
  const customer = useLiveQuery(() => db.customers.get(project.customerId), [project.customerId]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      milestoneId: defaultMilestoneId,
      amountVnd: 0,
      method: 'TRANSFER',
      at: dayjs(),
      payerName: customer?.name,
    });
  }, [open, defaultMilestoneId, form, customer?.name]);

  const submit = async () => {
    const values = await form.validateFields();
    await run(
      (op) =>
        createReceipt(
          actor,
          {
            projectId: project.id,
            milestoneId: values.milestoneId,
            amountVnd: values.amountVnd,
            method: values.method,
            at: values.at.toDate().toISOString(),
            payerName: values.payerName,
            note: values.note,
          },
          { operationId: op },
        ),
      {
        successMessage: 'Đã lập phiếu thu cho dự án',
        onSuccess: () => {
          onClose();
          onSaved?.();
        },
      },
    );
  };

  return (
    <Modal
      title={`Thu tiền — ${project.code}`}
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="Lập phiếu thu"
      cancelText="Huỷ"
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="milestoneId" label="Đợt thanh toán">
          <Select
            allowClear
            placeholder="Không gắn đợt (thu khác)"
            options={milestones.map((m) => ({
              value: m.id,
              label: `${m.name} — còn ${formatMoney(Math.max(0, m.amountVnd - m.paidVnd))} / ${formatMoney(m.amountVnd)}`,
            }))}
          />
        </Form.Item>
        <Form.Item name="amountVnd" label="Số tiền thu (₫)" rules={[{ required: true }]}>
          <InputNumber<number>
            min={0}
            step={1000000}
            style={{ width: '100%' }}
            formatter={(value) => (value == null ? '' : Number(value).toLocaleString('vi-VN'))}
            parser={(value) => parseMoneyInput(value) ?? 0}
          />
        </Form.Item>
        <Space size={12} style={{ width: '100%' }} align="start">
          <Form.Item name="method" label="Phương thức" style={{ flex: 1 }}>
            <Radio.Group
              options={[
                { value: 'TRANSFER', label: 'Chuyển khoản' },
                { value: 'CASH', label: 'Tiền mặt' },
              ]}
              optionType="button"
            />
          </Form.Item>
          <Form.Item name="at" label="Ngày thu" style={{ flex: 1 }} rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
        </Space>
        <Form.Item name="payerName" label="Người nộp">
          <Input placeholder="Tên người nộp tiền" />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** Modal chi tiền: NCC vật tư / thầu phụ / nhân công / khác */
export function PaymentModal({
  open,
  onClose,
  projects,
  defaultProjectId,
  defaultSupplierId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  defaultProjectId?: string;
  defaultSupplierId?: string;
  onSaved?: () => void;
}) {
  const { actor } = useRole();
  const { message } = App.useApp();
  const { loading, run } = useAction();
  const [form] = Form.useForm<{
    category: Transaction['category'];
    partyId?: string;
    projectId?: string;
    amountVnd: number;
    method: PaymentMethod;
    at: dayjs.Dayjs;
    receiverName: string;
    note?: string;
  }>();
  const suppliers = useLiveQuery(() => db.suppliers.orderBy('name').toArray(), [], []);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      category: defaultSupplierId ? 'SUPPLIER' : 'SUPPLIER',
      partyId: defaultSupplierId,
      projectId: defaultProjectId,
      amountVnd: 0,
      method: 'TRANSFER',
      at: dayjs(),
      receiverName: defaultSupplierId ? suppliers.find((s) => s.id === defaultSupplierId)?.name : '',
    });
  }, [open, defaultProjectId, defaultSupplierId, form, suppliers]);

  const category = Form.useWatch('category', form);

  const submit = async () => {
    const values = await form.validateFields();
    if ((values.category === 'SUPPLIER' || values.category === 'SUBCONTRACTOR') && !values.partyId) {
      message.warning('Vui lòng chọn nhà cung cấp hoặc thầu phụ nhận tiền.');
      return;
    }
    await run(
      (op) =>
        createPayment(
          actor,
          {
            projectId: values.projectId,
            category: values.category as 'SUPPLIER' | 'SUBCONTRACTOR' | 'LABOR' | 'OTHER_OUT',
            partyId: values.partyId,
            amountVnd: values.amountVnd,
            method: values.method,
            at: values.at.toDate().toISOString(),
            receiverName: values.receiverName,
            note: values.note,
          },
          { operationId: op },
        ),
      {
        successMessage: 'Đã lập phiếu chi',
        onSuccess: () => {
          onClose();
          onSaved?.();
        },
      },
    );
  };

  const partnerLabel = category === 'SUBCONTRACTOR' ? 'Thầu phụ nhận tiền' : 'Nhà cung cấp nhận tiền';

  return (
    <Modal
      title="Lập phiếu chi"
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="Lập phiếu chi"
      cancelText="Huỷ"
      confirmLoading={loading}
      destroyOnHidden
      width={620}
    >
      <Form form={form} layout="vertical">
        <Space size={12} style={{ width: '100%' }} align="start">
          <Form.Item name="category" label="Loại chi" style={{ flex: 1 }} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'SUPPLIER', label: 'NCC vật tư' },
                { value: 'SUBCONTRACTOR', label: 'Thầu phụ' },
                { value: 'LABOR', label: 'Nhân công' },
                { value: 'OTHER_OUT', label: 'Chi khác' },
              ]}
              onChange={(value) => {
                if (value === 'LABOR' || value === 'OTHER_OUT') form.setFieldValue('partyId', undefined);
              }}
            />
          </Form.Item>
          <Form.Item name="projectId" label="Dự án (tuỳ chọn)" style={{ flex: 1 }}>
            <Select
              allowClear
              placeholder="Không gắn dự án"
              options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            />
          </Form.Item>
        </Space>

        {category === 'SUPPLIER' || category === 'SUBCONTRACTOR' ? (
          <Form.Item name="partyId" label={partnerLabel} rules={[{ required: true, message: 'Vui lòng chọn đối tượng nhận tiền' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Chọn đối tượng"
              options={suppliers
                .filter((s) => (category === 'SUPPLIER' ? s.type === 'MATERIAL' : s.type === 'SUBCONTRACTOR'))
                .map((s) => ({ value: s.id, label: `${s.name} — ${s.phone}` }))}
              onChange={(value) => {
                const supplier = suppliers.find((s) => s.id === value);
                if (supplier) form.setFieldValue('receiverName', supplier.name);
              }}
            />
          </Form.Item>
        ) : null}

        <Space size={12} style={{ width: '100%' }} align="start">
          <Form.Item name="amountVnd" label="Số tiền chi (₫)" style={{ flex: 1 }} rules={[{ required: true }]}>
            <InputNumber<number>
              min={0}
              step={1000000}
              style={{ width: '100%' }}
              formatter={(value) => (value == null ? '' : Number(value).toLocaleString('vi-VN'))}
              parser={(value) => parseMoneyInput(value) ?? 0}
            />
          </Form.Item>
          <Form.Item name="at" label="Ngày chi" style={{ flex: 1 }} rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        <Space size={12} style={{ width: '100%' }} align="start">
          <Form.Item name="receiverName" label="Người/đơn vị nhận tiền" style={{ flex: 2 }} rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Ví dụ: Tổ thợ công trình, Cty VLXD..." />
          </Form.Item>
          <Form.Item name="method" label="Phương thức" style={{ flex: 1 }}>
            <Radio.Group
              options={[
                { value: 'TRANSFER', label: 'CK' },
                { value: 'CASH', label: 'TM' },
              ]}
              optionType="button"
            />
          </Form.Item>
        </Space>

        <Form.Item name="note" label="Diễn giải">
          <Input.TextArea rows={2} placeholder="Nội dung thanh toán, giai đoạn, khối lượng..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** Xem trước & in phiếu thu/phiếu chi khổ A4 */
export function TransactionPrintModal({
  transaction,
  project,
  open,
  onClose,
}: {
  transaction?: Transaction;
  project?: Project;
  open: boolean;
  onClose: () => void;
}) {
  const customer = useLiveQuery(async () => (project ? db.customers.get(project.customerId) : undefined), [project?.id]);
  if (!transaction) return null;
  const isReceipt = transaction.type === 'IN';
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={isReceipt ? 'Xem trước phiếu thu' : 'Xem trước phiếu chi'}
      width={860}
      destroyOnHidden
      footer={[
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>,
        <Button key="print" type="primary" onClick={() => window.print()}>
          In chứng từ
        </Button>,
      ]}
    >
      <div className="print-root">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>CÔNG TY THIẾT KẾ – THI CÔNG NỘI THẤT KHOADEV</div>
          <div>Số 18 ngõ 12 phố Trần Duy Hưng, Cầu Giấy, Hà Nội · Hotline 0968 123 456</div>
        </div>
        <h2 style={{ marginTop: 12 }}>{isReceipt ? 'Phiếu thu tiền' : 'Phiếu chi tiền'}</h2>
        <Typography.Paragraph>
          Mã phiếu: <strong>{transaction.code}</strong> — Ngày {dayjs(transaction.at).format('DD/MM/YYYY')}
        </Typography.Paragraph>
        <table>
          <tbody>
            <tr>
              <th style={{ width: 160 }}>Dự án</th>
              <td>{project ? `${project.code} — ${project.name}` : 'Không gắn dự án'}</td>
            </tr>
            <tr>
              <th>{isReceipt ? 'Người nộp' : 'Người nhận'}</th>
              <td>{(isReceipt ? transaction.payerName : transaction.receiverName) ?? customer?.name ?? '—'}</td>
            </tr>
            <tr>
              <th>Phương thức</th>
              <td>{transaction.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}</td>
            </tr>
            <tr>
              <th>Số tiền</th>
              <td className="amount">
                <strong>{formatMoney(transaction.amountVnd)}</strong>
              </td>
            </tr>
            <tr>
              <th>Diễn giải</th>
              <td>{transaction.note ?? '—'}</td>
            </tr>
          </tbody>
        </table>
        <div className="print-signatures">
          <div>
            Người lập phiếu
            <br />
            <span style={{ fontSize: 11 }}>(Ký, họ tên)</span>
            <div style={{ marginTop: 34 }}>{transaction.createdByName ?? ''}</div>
          </div>
          <div>
            {isReceipt ? 'Người nộp tiền' : 'Người nhận tiền'}
            <br />
            <span style={{ fontSize: 11 }}>(Ký, họ tên)</span>
          </div>
          <div>
            Thủ quỹ / Kế toán
            <br />
            <span style={{ fontSize: 11 }}>(Ký, họ tên)</span>
          </div>
        </div>
        {project ? null : <Alert style={{ marginTop: 12 }} type="info" showIcon title="Phiếu không gắn dự án — thuộc nhóm thu/chi chung." />}
      </div>
    </Modal>
  );
}
