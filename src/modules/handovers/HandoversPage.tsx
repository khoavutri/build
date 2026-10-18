import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { FileDoneOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { PrintPreview } from '../../components/PrintPreview';
import { PrintLetterhead } from '../../components/PrintLetterhead';
import { useAction } from '../../hooks/useAction';
import { useRole } from '../../app/RoleContext';
import { useUrlState } from '../../hooks/useUrlState';
import { db } from '../../db/database';
import { buildHandoverChecklist, createHandover, createTicket, updateTicket } from '../../services/handovers';
import { can } from '../../services/permissions';
import { DEFAULT_PRINT_CONFIG, getSetting, SETTING_KEYS, type PrintConfig } from '../../services/settings';
import { formatDate, toDateKey } from '../../utils/format';
import { TICKET_SEVERITY_META, TICKET_STATUS_META, HANDOVER_RESULT_META, HANDOVER_TYPE_LABEL } from '../../utils/status';
import type { Handover, HandoverResult, HandoverType, Ticket, TicketSeverity, TicketStatus } from '../../types';

interface ChecklistDraft {
  key: string;
  description: string;
  ok: boolean;
  note?: string;
}

export function HandoversPage() {
  const { actor, role } = useRole();
  const { message } = App.useApp();
  const { loading, run } = useAction();
  const [filters, setFilters] = useUrlState<{ tab?: string }>({ tab: 'handovers' });
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [printHandover, setPrintHandover] = useState<Handover>();
  const [editTicket, setEditTicket] = useState<Ticket>();
  const [handoverForm] = Form.useForm<{ projectId: string; type: HandoverType; date: dayjs.Dayjs; receiverName: string; result: HandoverResult; note?: string }>();
  const [ticketForm] = Form.useForm<{ projectId: string; severity: TicketSeverity; description: string }>();
  const [checklist, setChecklist] = useState<ChecklistDraft[]>([]);
  const [loadingChecklist, setLoadingChecklist] = useState(false);

  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const handovers = useLiveQuery(
    async () => (await db.handovers.toArray()).sort((a, b) => b.date.localeCompare(a.date)),
    [],
    [],
  );
  const tickets = useLiveQuery(async () => (await db.tickets.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [], []);
  const printConfig = useLiveQuery(() => getSetting<PrintConfig>(SETTING_KEYS.PRINT_CONFIG, DEFAULT_PRINT_CONFIG), [], DEFAULT_PRINT_CONFIG);
  const printItems = useLiveQuery(
    async () => (printHandover ? (await db.handoverItems.where('handoverId').equals(printHandover.id).toArray()).sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [printHandover?.id],
    [],
  );
  const canManage = can(role, 'handover.manage');

  const openHandover = async () => {
    handoverForm.resetFields();
    handoverForm.setFieldsValue({ type: 'ACCEPTANCE', date: dayjs(), result: 'PASS' });
    setChecklist([]);
    setHandoverOpen(true);
  };

  const prefillChecklist = async (projectId: string) => {
    setLoadingChecklist(true);
    try {
      const rows = await buildHandoverChecklist(projectId);
      if (rows.length === 0) {
        message.info('Dự án chưa có hạng mục nào ở trạng thái Xong/Đã nghiệm thu để đưa vào checklist.');
      }
      setChecklist(rows.map((row) => ({ key: `${row.description}-${Math.random().toString(36).slice(2, 8)}`, description: row.description, ok: row.ok })));
    } finally {
      setLoadingChecklist(false);
    }
  };

  const submitHandover = async () => {
    const values = await handoverForm.validateFields();
    if (checklist.length === 0) {
      message.warning('Checklist đang trống. Bấm "Lấy hạng mục đã xong" hoặc thêm dòng kiểm tra.');
      return;
    }
    await run(
      (op) =>
        createHandover(
          actor,
          {
            projectId: values.projectId,
            type: values.type,
            date: toDateKey(values.date),
            receiverName: values.receiverName,
            result: values.result,
            note: values.note,
            items: checklist.map((row) => ({ description: row.description, ok: row.ok, note: row.note })),
          },
          { operationId: op },
        ),
      { successMessage: 'Đã lập biên bản', onSuccess: () => setHandoverOpen(false) },
    );
  };

  const submitTicket = async () => {
    const values = await ticketForm.validateFields();
    await run((op) => createTicket(actor, values, { operationId: op }), {
      successMessage: 'Đã mở ticket bảo hành',
      onSuccess: () => setTicketOpen(false),
    });
  };

  const handoverColumns: TableColumnsType<Handover> = [
    { title: 'Mã biên bản', key: 'code', width: 140, render: (_, row) => <span className="text-strong">{row.code}</span> },
    {
      title: 'Dự án',
      key: 'project',
      width: 240,
      render: (_, row) => {
        const project = projectById.get(row.projectId);
        return project ? (
          <div>
            <div className="text-strong">{project.code}</div>
            <div className="text-muted">{project.name}</div>
          </div>
        ) : (
          '—'
        );
      },
    },
    { title: 'Loại', key: 'type', width: 120, render: (_, row) => <Tag color={row.type === 'HANDOVER' ? 'green' : 'cyan'}>{HANDOVER_TYPE_LABEL[row.type]}</Tag> },
    { title: 'Ngày', key: 'date', width: 110, render: (_, row) => formatDate(row.date) },
    { title: 'Người nhận', key: 'receiver', width: 170, render: (_, row) => row.receiverName },
    { title: 'Số mục', key: 'items', width: 90, align: 'right', render: (_, row) => row.itemCount },
    { title: 'Kết quả', key: 'result', width: 120, render: (_, row) => <Tag color={HANDOVER_RESULT_META[row.result].color}>{HANDOVER_RESULT_META[row.result].label}</Tag> },
    { title: 'Ghi chú', key: 'note', render: (_, row) => row.note ?? '—' },
    {
      title: '',
      key: 'print',
      width: 90,
      render: (_, row) => (
        <Button size="small" icon={<PrinterOutlined />} onClick={() => setPrintHandover(row)}>
          In
        </Button>
      ),
    },
  ];

  const ticketColumns: TableColumnsType<Ticket> = [
    { title: 'Mã ticket', key: 'code', width: 130, render: (_, row) => <span className="text-strong">{row.code}</span> },
    {
      title: 'Dự án',
      key: 'project',
      width: 230,
      render: (_, row) => {
        const project = projectById.get(row.projectId);
        return project ? (
          <div>
            <div className="text-strong">{project.code}</div>
            <div className="text-muted">{project.name}</div>
          </div>
        ) : (
          '—'
        );
      },
    },
    { title: 'Nội dung', key: 'description', render: (_, row) => row.description },
    { title: 'Mức độ', key: 'severity', width: 100, render: (_, row) => <Tag color={TICKET_SEVERITY_META[row.severity].color}>{TICKET_SEVERITY_META[row.severity].label}</Tag> },
    { title: 'Trạng thái', key: 'status', width: 120, render: (_, row) => <Tag color={TICKET_STATUS_META[row.status].color}>{TICKET_STATUS_META[row.status].label}</Tag> },
    { title: 'Ngày mở', key: 'created', width: 110, render: (_, row) => formatDate(row.createdAt) },
    { title: 'Ngày xong', key: 'resolved', width: 110, render: (_, row) => formatDate(row.resolvedAt) },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, row) =>
        canManage ? (
          <Space size={4}>
            <Button size="small" onClick={() => setEditTicket(row)}>
              Xử lý
            </Button>
            {row.status !== 'DONE' ? (
              <Button
                size="small"
                type="primary"
                onClick={() =>
                  void run(() => updateTicket(actor, row.id, { status: 'DONE', note: row.note }), { successMessage: `Đã đóng ticket ${row.code}` })
                }
              >
                Đóng
              </Button>
            ) : null}
          </Space>
        ) : null,
    },
  ];

  const items = [
    {
      key: 'handovers',
      label: `Biên bản nghiệm thu / bàn giao (${(handovers ?? []).length})`,
      children: (
        <Card
          size="small"
          extra={
            canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => void openHandover()}>
                Lập biên bản
              </Button>
            ) : null
          }
        >
          <Table<Handover>
            rowKey="id"
            columns={handoverColumns}
            dataSource={handovers ?? []}
            size="small"
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 1250 }}
            locale={{ emptyText: <Empty description="Chưa có biên bản nghiệm thu/bàn giao nào." /> }}
          />
        </Card>
      ),
    },
    {
      key: 'tickets',
      label: `Bảo hành / khiếu nại (${(tickets ?? []).filter((t) => t.status !== 'DONE').length} đang mở)`,
      children: (
        <Card
          size="small"
          extra={
            canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { ticketForm.resetFields(); ticketForm.setFieldsValue({ severity: 'MEDIUM' }); setTicketOpen(true); }}>
                Mở ticket bảo hành
              </Button>
            ) : null
          }
        >
          <Table<Ticket>
            rowKey="id"
            columns={ticketColumns}
            dataSource={tickets ?? []}
            size="small"
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 1200 }}
            locale={{ emptyText: <Empty description="Chưa có ticket bảo hành nào." /> }}
          />
        </Card>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Nghiệm thu & bảo hành"
        subtitle="Biên bản nghiệm thu/bàn giao theo checklist hạng mục và theo dõi ticket bảo hành, khiếu nại của chủ nhà."
      />

      <Tabs activeKey={filters.tab ?? 'handovers'} onChange={(key) => setFilters({ tab: key })} items={items} />

      <Modal
        title="Lập biên bản nghiệm thu / bàn giao"
        open={handoverOpen}
        onCancel={() => setHandoverOpen(false)}
        onOk={() => void submitHandover()}
        okText="Lưu biên bản"
        cancelText="Huỷ"
        confirmLoading={loading}
        width={800}
        destroyOnHidden
      >
        <Form form={handoverForm} layout="vertical">
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="projectId" label="Dự án" style={{ flex: 2 }} rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Chọn dự án"
                options={(projects ?? []).map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
                onChange={(value) => void prefillChecklist(value)}
              />
            </Form.Item>
            <Form.Item name="type" label="Loại biên bản" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'ACCEPTANCE', label: 'Nghiệm thu' },
                  { value: 'HANDOVER', label: 'Bàn giao' },
                ]}
              />
            </Form.Item>
          </Space>
          <Space size={12} style={{ width: '100%' }} align="start">
            <Form.Item name="date" label="Ngày lập" style={{ flex: 1 }} rules={[{ required: true }]}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="receiverName" label="Người nhận bàn giao" style={{ flex: 1.5 }} rules={[{ required: true, min: 2 }]}>
              <Input placeholder="Tên người nhận phía chủ nhà" />
            </Form.Item>
            <Form.Item name="result" label="Kết quả" style={{ flex: 1 }}>
              <Radio.Group
                options={[
                  { value: 'PASS', label: 'Đạt' },
                  { value: 'PENDING', label: 'Chờ xử lý' },
                ]}
                optionType="button"
              />
            </Form.Item>
          </Space>
          <Form.Item name="note" label="Ghi chú chung">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>

        <Space style={{ marginBottom: 8 }} wrap>
          <Button icon={<FileDoneOutlined />} loading={loadingChecklist} onClick={() => {
            const projectId = handoverForm.getFieldValue('projectId') as string | undefined;
            if (!projectId) {
              message.warning('Chọn dự án trước khi lấy checklist.');
              return;
            }
            void prefillChecklist(projectId);
          }}>
            Lấy hạng mục đã xong
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => setChecklist((prev) => [...prev, { key: `row-${Date.now()}`, description: '', ok: true }])}
          >
            Thêm dòng kiểm tra
          </Button>
          <Typography.Text type="secondary">Checklist tự điền từ hạng mục đã Xong/Đã nghiệm thu của dự án.</Typography.Text>
        </Space>

        <Space orientation="vertical" style={{ width: '100%' }} size={6}>
          {checklist.map((row, index) => (
            <Space key={row.key} align="start" style={{ width: '100%' }}>
              <span style={{ lineHeight: '34px', width: 24 }}>{index + 1}.</span>
              <Input
                style={{ width: 420 }}
                value={row.description}
                placeholder="Nội dung mục kiểm tra"
                onChange={(e) => setChecklist((prev) => prev.map((r) => (r.key === row.key ? { ...r, description: e.target.value } : r)))}
              />
              <Checkbox
                checked={row.ok}
                onChange={(e) => setChecklist((prev) => prev.map((r) => (r.key === row.key ? { ...r, ok: e.target.checked } : r)))}
              >
                Đạt
              </Checkbox>
              <Input
                style={{ width: 200 }}
                placeholder="Ghi chú"
                value={row.note}
                onChange={(e) => setChecklist((prev) => prev.map((r) => (r.key === row.key ? { ...r, note: e.target.value } : r)))}
              />
              <Button type="text" danger onClick={() => setChecklist((prev) => prev.filter((r) => r.key !== row.key))}>
                Xoá
              </Button>
            </Space>
          ))}
        </Space>
      </Modal>

      <Modal
        title="Mở ticket bảo hành"
        open={ticketOpen}
        onCancel={() => setTicketOpen(false)}
        onOk={() => void submitTicket()}
        okText="Mở ticket"
        cancelText="Huỷ"
        confirmLoading={loading}
        destroyOnHidden
      >
        <Form form={ticketForm} layout="vertical">
          <Form.Item name="projectId" label="Dự án" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={(projects ?? []).map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
            />
          </Form.Item>
          <Form.Item name="severity" label="Mức độ" rules={[{ required: true }]}>
            <Radio.Group
              options={(Object.keys(TICKET_SEVERITY_META) as TicketSeverity[]).map((severity) => ({
                value: severity,
                label: TICKET_SEVERITY_META[severity].label,
              }))}
              optionType="button"
            />
          </Form.Item>
          <Form.Item name="description" label="Mô tả sự việc" rules={[{ required: true, min: 5 }]}>
            <Input.TextArea rows={3} placeholder="Ví dụ: Trần thạch cao phòng khách nứt mối nối cạnh đèn..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Xử lý ticket ${editTicket?.code ?? ''}`}
        open={!!editTicket}
        onCancel={() => setEditTicket(undefined)}
        onOk={async () => {
          if (!editTicket) return;
          const note = editTicket.note;
          const status = editTicket.status;
          const severity = editTicket.severity;
          const ok = await run(() => updateTicket(actor, editTicket.id, { status, note, severity }), { successMessage: 'Đã cập nhật ticket' });
          if (ok) setEditTicket(undefined);
        }}
        okText="Lưu cập nhật"
        cancelText="Huỷ"
        confirmLoading={loading}
        destroyOnHidden
      >
        {editTicket ? (
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary">{editTicket.description}</Typography.Text>
            <Space size={12}>
              <span>Trạng thái</span>
              <Select
                style={{ width: 180 }}
                value={editTicket.status}
                onChange={(value) => setEditTicket({ ...editTicket, status: value })}
                options={(Object.keys(TICKET_STATUS_META) as TicketStatus[]).map((status) => ({ value: status, label: TICKET_STATUS_META[status].label }))}
              />
              <span>Mức độ</span>
              <Select
                style={{ width: 140 }}
                value={editTicket.severity}
                onChange={(value) => setEditTicket({ ...editTicket, severity: value })}
                options={(Object.keys(TICKET_SEVERITY_META) as TicketSeverity[]).map((severity) => ({
                  value: severity,
                  label: TICKET_SEVERITY_META[severity].label,
                }))}
              />
            </Space>
            <Input.TextArea
              rows={3}
              value={editTicket.note}
              placeholder="Ghi chú xử lý (đã thay gì, hẹn ngày nào...)"
              onChange={(e) => setEditTicket({ ...editTicket, note: e.target.value })}
            />
          </Space>
        ) : null}
      </Modal>

      <PrintPreview        open={!!printHandover}
        onClose={() => setPrintHandover(undefined)}
        title={`Xem trước biên bản ${printHandover?.code ?? ''}`}
        printLabel="In biên bản A4"
      >
        {printHandover ? (
          <div>
            <PrintLetterhead right={<span>Mã biên bản: {printHandover.code}</span>} />
            <h2>{HANDOVER_TYPE_LABEL[printHandover.type] === 'Bàn giao' ? 'Biên bản bàn giao công trình' : 'Biên bản nghiệm thu công trình'}</h2>
            <Typography.Paragraph>
              Hôm nay, ngày {dayjs(printHandover.date).format('DD/MM/YYYY')}, tại công trình{' '}
              <strong>{projectById.get(printHandover.projectId)?.name ?? ''}</strong> — {projectById.get(printHandover.projectId)?.address ?? ''}
              <br />
              Bên A (đơn vị thi công): Nội thất KhoaDev — {printHandover.createdBy ? 'đại diện chỉ huy trưởng công trình' : 'đại diện công ty'}
              <br />
              Bên B (chủ đầu tư / người nhận): <strong>{printHandover.receiverName}</strong>
            </Typography.Paragraph>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }}>TT</th>
                  <th>Nội dung kiểm tra</th>
                  <th style={{ width: 90 }}>Đạt</th>
                  <th style={{ width: 180 }}>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {(printItems ?? []).map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.description}</td>
                    <td>{item.ok ? 'x' : ''}</td>
                    <td>{item.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Typography.Paragraph>
              Kết luận: {printHandover.result === 'PASS' ? 'Các hạng mục đạt yêu cầu nghiệm thu, hai bên thống nhất ký biên bản.' : 'Còn hạng mục cần xử lý, hai bên thống nhất tiếp tục hoàn thiện theo danh sách ghi chú.'}
              {printHandover.note ? ` ${printHandover.note}` : ''}
            </Typography.Paragraph>
            {printConfig.handoverFooterNote ? (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                {printConfig.handoverFooterNote}
              </Typography.Paragraph>
            ) : null}
            <div className="print-signatures">
              <div>
                Đại diện đơn vị thi công
                <br />
                <span style={{ fontSize: 11 }}>(Ký, họ tên)</span>
              </div>
              <div>
                Chỉ huy trưởng
                <br />
                <span style={{ fontSize: 11 }}>(Ký, họ tên)</span>
              </div>
              <div>
                Chủ đầu tư / người nhận
                <br />
                <span style={{ fontSize: 11 }}>(Ký, họ tên)</span>
              </div>
            </div>
          </div>
        ) : null}
      </PrintPreview>
    </div>
  );
}
