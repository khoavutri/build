import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  PrinterOutlined,
  SaveOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '../../components/PageHeader';
import { PrintPreview } from '../../components/PrintPreview';
import { StatusTag } from '../../components/StatusTag';
import { useAction } from '../../hooks/useAction';
import { useRole } from '../../app/RoleContext';
import { db } from '../../db/database';
import {
  createQuote,
  discardQuoteDraft,
  QUOTE_SECTION_TEMPLATES,
  recordQuoteApproval,
  rejectQuote,
  saveQuoteDraft,
  sendQuote,
  supersedeQuote,
  type SaveQuoteItemInput,
} from '../../services/quotations';
import { can } from '../../services/permissions';
import { QuotePrintDocument } from './QuotePrint';
import { newId } from '../../utils/ids';
import { formatMoney, lineTotalVnd, parseMoneyInput, quoteTotals } from '../../utils/money';
import type { QuoteItem, QuoteSection } from '../../types';

interface DraftSection {
  key: string;
  id?: string;
  name: string;
}

interface DraftLine {
  key: string;
  id?: string;
  sectionKey: string;
  description: string;
  unit: string;
  quantity: number;
  materialCostVnd: number;
  laborCostVnd: number;
}

export function QuoteEditorPage() {
  const { projectId, quoteId } = useParams<{ projectId: string; quoteId: string }>();
  const navigate = useNavigate();
  const { actor, role } = useRole();
  const { loading, run } = useAction();

  const isNew = quoteId === 'new';
  const project = useLiveQuery(async () => (projectId ? db.projects.get(projectId) : undefined), [projectId]);
  const customer = useLiveQuery(async () => (project ? db.customers.get(project.customerId) : undefined), [project?.customerId]);
  const quote = useLiveQuery(async () => (!isNew && quoteId ? db.quotes.get(quoteId) : undefined), [quoteId, isNew]);

  const [sections, setSections] = useState<DraftSection[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [applyContract, setApplyContract] = useState(true);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState(QUOTE_SECTION_TEMPLATES[0]);
  const loadedRef = useRef<string | null>(null);

  // Nạp dữ liệu báo giá từ Dexie vào trình soạn thảo một lần cho mỗi mã báo giá
  useEffect(() => {
    if (isNew) {
      if (loadedRef.current === 'new') return;
      loadedRef.current = 'new';
      const first = newId();
      setSections([
        { key: first, id: first, name: QUOTE_SECTION_TEMPLATES[0] },
        { key: newId(), id: undefined, name: QUOTE_SECTION_TEMPLATES[1] },
      ]);
      setLines([]);
      setDiscountPct(5);
      setNote('');
      setDirty(false);
      return;
    }
    if (!quoteId || !quote) return;
    if (loadedRef.current === quoteId) return;
    loadedRef.current = quoteId;
    void (async () => {
      const [sectionsRows, itemRows] = await Promise.all([
        db.quoteSections.where('quoteId').equals(quoteId).toArray(),
        db.quoteItems.where('quoteId').equals(quoteId).toArray(),
      ]);
      const sortedSections = sectionsRows.sort((a, b) => a.seq - b.seq);
      setSections(sortedSections.map((s) => ({ key: s.id, id: s.id, name: s.name })));
      setLines(
        itemRows
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => ({
            key: item.id,
            id: item.id,
            sectionKey: item.sectionId,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            materialCostVnd: item.materialCostVnd,
            laborCostVnd: item.laborCostVnd,
          })),
      );
      setDiscountPct(quote.discountPct);
      setNote(quote.note ?? '');
      setDirty(false);
    })();
  }, [quoteId, quote, isNew]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const totals = useMemo(() => quoteTotals(lines, discountPct), [lines, discountPct]);
  const editable = isNew || quote?.status === 'DRAFT';
  const canDraft = can(role, 'quote.draft');
  const canApprove = can(role, 'quote.approve');

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setDirty(true);
  };

  const addLine = (sectionKey: string) => {
    setLines((prev) => [
      ...prev,
      { key: newId(), sectionKey, description: '', unit: 'm²', quantity: 1, materialCostVnd: 0, laborCostVnd: 0 },
    ]);
    setDirty(true);
  };

  const moveLine = (key: string, direction: -1 | 1) => {
    setLines((prev) => {
      const index = prev.findIndex((line) => line.key === key);
      if (index < 0) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      if (prev[target].sectionKey !== prev[index].sectionKey) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const buildItems = (): SaveQuoteItemInput[] =>
    lines.map((line) => ({
      id: line.id,
      sectionId: line.sectionKey,
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
      materialCostVnd: line.materialCostVnd,
      laborCostVnd: line.laborCostVnd,
    }));

  const reloadFromDb = async (id: string) => {
    const [sectionRows, itemRows] = await Promise.all([
      db.quoteSections.where('quoteId').equals(id).toArray(),
      db.quoteItems.where('quoteId').equals(id).toArray(),
    ]);
    setSections(sectionRows.sort((a, b) => a.seq - b.seq).map((s) => ({ key: s.id, id: s.id, name: s.name })));
    setLines(
      itemRows
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          key: item.id,
          id: item.id,
          sectionKey: item.sectionId,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          materialCostVnd: item.materialCostVnd,
          laborCostVnd: item.laborCostVnd,
        })),
    );
  };

  /** Đảm bảo báo giá đã tồn tại trong dữ liệu, trả về id để lưu */
  const ensureQuoteId = async (): Promise<string | undefined> => {
    if (!isNew && quoteId) return quoteId;
    if (!projectId) return undefined;
    const created = await run((op) => createQuote(actor, projectId, { note }, { operationId: op }), {
      successMessage: 'Đã tạo báo giá nháp mới',
    });
    if (!created) return undefined;
    loadedRef.current = created.id;
    navigate(`/projects/${projectId}/quote/${created.id}`, { replace: true });
    return created.id;
  };

  const handleSave = async () => {
    const id = await ensureQuoteId();
    if (!id) return;
    const saved = await run(
      () =>
        saveQuoteDraft(actor, id, {
          sections: sections.map((s) => ({ id: s.id ?? s.key, name: s.name })),
          items: buildItems(),
          discountPct,
          note,
          expectedRevision: isNew ? undefined : quote?.revision,
        }),
      { successMessage: 'Đã lưu báo giá nháp' },
    );
    if (saved) {
      setDirty(false);
      await reloadFromDb(id);
    }
  };

  const handleSend = async () => {
    const id = await ensureQuoteId();
    if (!id) return;
    if (dirty) {
      const saved = await run(() =>
        saveQuoteDraft(actor, id, {
          sections: sections.map((s) => ({ id: s.id ?? s.key, name: s.name })),
          items: buildItems(),
          discountPct,
          note,
          expectedRevision: isNew ? undefined : quote?.revision,
        }),
      );
      if (!saved) return;
      setDirty(false);
      await reloadFromDb(id);
    }
    await run(() => sendQuote(actor, id), { successMessage: 'Đã gửi báo giá cho chủ nhà' });
  };

  const handleApprove = async () => {
    if (!quote) return;
    await run(() => recordQuoteApproval(actor, quote.id, { applyToContract: applyContract }), {
      successMessage: applyContract
        ? 'Đã ghi nhận khách duyệt và áp giá trị báo giá vào hợp đồng dự án'
        : 'Đã ghi nhận khách duyệt báo giá',
    });
  };

  const draftSections: QuoteSection[] = sections.map((section, index) => ({
    id: section.key,
    quoteId: quoteId ?? 'new',
    name: section.name,
    seq: index + 1,
  }));
  const draftItems: QuoteItem[] = lines.map((line, index) => ({
    id: line.key,
    quoteId: quoteId ?? 'new',
    sectionId: line.sectionKey,
    description: line.description,
    unit: line.unit,
    quantity: line.quantity,
    materialCostVnd: line.materialCostVnd,
    laborCostVnd: line.laborCostVnd,
    sortOrder: index + 1,
    revision: 1,
  }));

  if (!project) {
    return <Card loading />;
  }
  if (!isNew && !quote) {
    return <Card loading />;
  }

  const lineColumns: TableColumnsType<DraftLine> = [
    {
      title: 'Nội dung công việc',
      key: 'description',
      width: 300,
      render: (_, line) =>
        editable ? (
          <Input
            value={line.description}
            placeholder="Mô tả hạng mục thi công"
            onChange={(e) => updateLine(line.key, { description: e.target.value })}
          />
        ) : (
          line.description
        ),
    },
    {
      title: 'ĐVT',
      key: 'unit',
      width: 84,
      render: (_, line) =>
        editable ? <Input value={line.unit} onChange={(e) => updateLine(line.key, { unit: e.target.value })} /> : line.unit,
    },
    {
      title: 'Khối lượng',
      key: 'quantity',
      width: 110,
      render: (_, line) =>
        editable ? (
          <InputNumber
            min={0}
            step={0.5}
            value={line.quantity}
            style={{ width: '100%' }}
            onChange={(value) => updateLine(line.key, { quantity: Number(value ?? 0) })}
          />
        ) : (
          line.quantity.toLocaleString('vi-VN')
        ),
    },
    {
      title: 'Đơn giá vật tư',
      key: 'material',
      width: 150,
      render: (_, line) =>
        editable ? (
          <InputNumber
            min={0}
            step={10000}
            style={{ width: '100%' }}
            value={line.materialCostVnd}
            formatter={(value) => (value == null ? '' : Number(value).toLocaleString('vi-VN'))}
            parser={(value) => parseMoneyInput(value) ?? 0}
            onChange={(value) => updateLine(line.key, { materialCostVnd: Number(value ?? 0) })}
          />
        ) : (
          formatMoney(line.materialCostVnd)
        ),
    },
    {
      title: 'Đơn giá nhân công',
      key: 'labor',
      width: 150,
      render: (_, line) =>
        editable ? (
          <InputNumber
            min={0}
            step={10000}
            style={{ width: '100%' }}
            value={line.laborCostVnd}
            formatter={(value) => (value == null ? '' : Number(value).toLocaleString('vi-VN'))}
            parser={(value) => parseMoneyInput(value) ?? 0}
            onChange={(value) => updateLine(line.key, { laborCostVnd: Number(value ?? 0) })}
          />
        ) : (
          formatMoney(line.laborCostVnd)
        ),
    },
    {
      title: 'Thành tiền',
      key: 'total',
      width: 150,
      align: 'right',
      render: (_, line) => {
        const total = lineTotalVnd(line);
        return (
          <Space orientation="vertical" size={0} style={{ textAlign: 'right' }}>
            <span className="text-strong">{formatMoney(total)}</span>
            <span className="text-muted">
              VT {formatMoney(Math.round(line.quantity * line.materialCostVnd))} · NC {formatMoney(Math.round(line.quantity * line.laborCostVnd))}
            </span>
          </Space>
        );
      },
    },
    ...(editable
      ? [
          {
            title: '',
            key: 'actions',
            width: 110,
            render: (_: unknown, line: DraftLine) => (
              <Space size={2}>
                <Button size="small" type="text" icon={<ArrowUpOutlined />} onClick={() => moveLine(line.key, -1)} />
                <Button size="small" type="text" icon={<ArrowDownOutlined />} onClick={() => moveLine(line.key, 1)} />
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    setLines((prev) => prev.filter((l) => l.key !== line.key));
                    setDirty(true);
                  }}
                />
              </Space>
            ),
          } as TableColumnsType<DraftLine>[number],
        ]
      : []),
  ];

  return (
    <div style={{ paddingBottom: editable ? 76 : 16 }}>
      <PageHeader
        title={
          <Space wrap size={8}>
            <span>{quote ? `${quote.code} — phiên bản v${quote.version}` : 'Báo giá mới (nháp)'}</span>
            {quote ? <StatusTag kind="quote" status={quote.status} /> : <Tag>Chưa lưu</Tag>}
            {dirty ? <Tag color="orange">Có thay đổi chưa lưu</Tag> : null}
          </Space>
        }
        subtitle={
          <Space wrap size={8}>
            <span>
              Dự án {project.code} — {project.name}
            </span>
            <span>· Chủ nhà {customer?.name ?? '—'}</span>
            <span>· {project.address}</span>
          </Space>
        }
        extra={[
          <Button key="back" onClick={() => navigate(`/projects/${project.id}?tab=quotes`)}>
            Về danh sách báo giá
          </Button>,
          <Button key="print" icon={<PrinterOutlined />} onClick={() => setPrintOpen(true)}>
            Xem trước/in A4
          </Button>,
          quote && canSupersede(quote.status) && canDraft ? (
            <Button
              key="supersede"
              icon={<SwapOutlined />}
              loading={loading}
              onClick={() =>
                void run(() => supersedeQuote(actor, quote.id), {
                  successMessage: 'Đã tạo phiên bản mới kế thừa nội dung',
                  onSuccess: (created) => navigate(`/projects/${project.id}/quote/${created.id}`, { replace: true }),
                })
              }
            >
              Tạo phiên bản điều chỉnh
            </Button>
          ) : null,
          quote && quote.status === 'SENT' && canApprove ? (
            <Button key="approve" type="primary" icon={<CheckCircleOutlined />} loading={loading} onClick={() => void handleApprove()}>
              Khách duyệt
            </Button>
          ) : null,
          quote && quote.status === 'SENT' && canApprove ? (
            <Popconfirm title="Xác nhận khách từ chối báo giá này?" onConfirm={() => void run(() => rejectQuote(actor, quote.id), { successMessage: 'Đã ghi nhận từ chối' })}>
              <Button key="reject" danger icon={<CloseCircleOutlined />}>
                Từ chối
              </Button>
            </Popconfirm>
          ) : null,
        ]}
      />

      {!editable ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title="Báo giá đã phát hành được giữ nguyên theo phiên bản."
          description="Muốn thay đổi phạm vi, hạng mục hoặc đơn giá hãy tạo phiên bản điều chỉnh để vẫn tra cứu được bản cũ."
        />
      ) : null}

      {quote?.status === 'SENT' && canApprove ? (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space wrap>
            <Checkbox checked={applyContract} onChange={(e) => setApplyContract(e.target.checked)}>
              Áp tổng báo giá vào giá trị hợp đồng của dự án khi khách duyệt
            </Checkbox>
            <Typography.Text type="secondary">
              Các đợt thanh toán chưa thu sẽ được tính lại theo giá trị hợp đồng mới.
            </Typography.Text>
          </Space>
        </Card>
      ) : null}

      {editable ? (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space wrap>
            <Button icon={<PlusOutlined />} onClick={() => setAddSectionOpen(true)}>
              Thêm nhóm hạng mục
            </Button>
            <Typography.Text type="secondary">
              Nhóm gợi ý: {QUOTE_SECTION_TEMPLATES.slice(0, 4).join(', ')}...
            </Typography.Text>
          </Space>
        </Card>
      ) : null}

      {sections.length === 0 ? (
        <Card>
          <Empty description="Báo giá chưa có nhóm hạng mục nào. Thêm nhóm để bắt đầu lập dự toán." />
        </Card>
      ) : null}

      {sections.map((section, sectionIndex) => {
        const sectionLines = lines.filter((line) => line.sectionKey === section.key);
        const sectionTotal = sectionLines.reduce((sum, line) => sum + lineTotalVnd(line), 0);
        return (
          <Card
            key={section.key}
            size="small"
            style={{ marginBottom: 12 }}
            title={
              editable ? (
                <Space>
                  <Tag color="gold">Nhóm {sectionIndex + 1}</Tag>
                  <Input
                    value={section.name}
                    style={{ width: 320 }}
                    onChange={(e) => {
                      setSections((prev) => prev.map((s) => (s.key === section.key ? { ...s, name: e.target.value } : s)));
                      setDirty(true);
                    }}
                  />
                </Space>
              ) : (
                <Space>
                  <Tag color="gold">Nhóm {sectionIndex + 1}</Tag>
                  <span>{section.name}</span>
                </Space>
              )
            }
            extra={
              <Space>
                <Typography.Text type="secondary">Tạm tính nhóm: {formatMoney(sectionTotal)}</Typography.Text>
                {editable ? (
                  <>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => addLine(section.key)}>
                      Thêm dòng
                    </Button>
                    <Popconfirm
                      title="Xoá nhóm này cùng toàn bộ dòng bên trong?"
                      onConfirm={() => {
                        setSections((prev) => prev.filter((s) => s.key !== section.key));
                        setLines((prev) => prev.filter((line) => line.sectionKey !== section.key));
                        setDirty(true);
                      }}
                    >
                      <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </>
                ) : null}
              </Space>
            }
          >
            <Table<DraftLine>
              rowKey="key"
              columns={lineColumns}
              dataSource={sectionLines}
              size="small"
              pagination={false}
              scroll={{ x: 1100 }}
              locale={{ emptyText: <Empty description="Nhóm chưa có dòng hạng mục nào." /> }}
            />
          </Card>
        );
      })}

      <Card size="small" title="Tổng kết báo giá">
        <Space orientation="vertical" style={{ width: '100%' }} size={8}>
          <Space wrap size={24}>
            <span>
              Tạm tính vật tư: <strong>{formatMoney(totals.materialVnd)}</strong>
            </span>
            <span>
              Tạm tính nhân công: <strong>{formatMoney(totals.laborVnd)}</strong>
            </span>
            <span>
              Tổng trước chiết khấu: <strong>{formatMoney(totals.subtotalVnd)}</strong>
            </span>
          </Space>
          <Space wrap size={16} align="center">
            <span>Chiết khấu (%)</span>
            {editable ? (
              <InputNumber
                min={0}
                max={100}
                value={discountPct}
                style={{ width: 110 }}
                onChange={(value) => {
                  setDiscountPct(Number(value ?? 0));
                  setDirty(true);
                }}
              />
            ) : (
              <strong>{discountPct}%</strong>
            )}
            <span>
              Tiền chiết khấu: <strong>-{formatMoney(totals.discountVnd)}</strong>
            </span>
            <span style={{ fontSize: 16 }}>
              Tổng sau chiết khấu: <strong>{formatMoney(totals.totalVnd)}</strong>
            </span>
          </Space>
          <Input.TextArea
            rows={2}
            placeholder="Ghi chú báo giá (phạm vi, điều kiện áp dụng, thời gian thi công...)"
            value={note}
            disabled={!editable}
            onChange={(e) => {
              setNote(e.target.value);
              setDirty(true);
            }}
          />
        </Space>
      </Card>

      {editable ? (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 236,
            right: 0,
            background: '#fff',
            borderTop: '1px solid #eae2d4',
            padding: '10px 20px',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            alignItems: 'center',
            zIndex: 30,
          }}
        >
          <Typography.Text type="secondary" style={{ marginRight: 'auto' }}>
            Đơn giá nhập theo VND; thành tiền = khối lượng × (đơn giá vật tư + đơn giá nhân công).
          </Typography.Text>
          <Button icon={<SaveOutlined />} loading={loading} onClick={() => void handleSave()}>
            Lưu nháp
          </Button>
          <Button type="primary" icon={<SendOutlined />} loading={loading} disabled={!canDraft} onClick={() => void handleSend()}>
            Gửi khách (chờ phản hồi)
          </Button>
          {quote && quote.status === 'DRAFT' ? (
            <Popconfirm
              title="Xoá báo giá nháp này?"
              onConfirm={async () => {
                await run(() => discardQuoteDraft(actor, quote.id));
                navigate(`/projects/${project.id}?tab=quotes`);
              }}
            >
              <Button danger icon={<DeleteOutlined />}>
                Xoá nháp
              </Button>
            </Popconfirm>
          ) : null}
        </div>
      ) : null}

      <Modal
        title="Thêm nhóm hạng mục"
        open={addSectionOpen}
        onCancel={() => setAddSectionOpen(false)}
        onOk={() => {
          const id = newId();
          setSections((prev) => [...prev, { key: id, id, name: newSectionName }]);
          setDirty(true);
          setAddSectionOpen(false);
        }}
        okText="Thêm nhóm"
        cancelText="Huỷ"
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">Chọn tên nhóm theo mẫu hoặc tự nhập tên mới.</Typography.Text>
          <Select
            style={{ width: '100%' }}
            value={newSectionName}
            onChange={(value) => setNewSectionName(value)}
            options={QUOTE_SECTION_TEMPLATES.map((name) => ({ value: name, label: name }))}
          />
          <Input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder="Tên nhóm hạng mục" />
        </Space>
      </Modal>

      <PrintPreview
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title={quote ? `Xem trước báo giá ${quote.code} v${quote.version}` : 'Xem trước báo giá nháp'}
        printLabel="In báo giá A4"
      >
        <QuotePrintDocument
          quote={quote}
          project={project}
          customer={customer}
          sections={draftSections}
          items={draftItems}
          draft={!quote || quote.status === 'DRAFT'}
        />
      </PrintPreview>

      <Divider style={{ margin: '16px 0 8px' }} />
      <Typography.Paragraph type="secondary">
        Sau khi ghi nhận khách duyệt, bấm "Áp vào giá trị HĐ" ở tab Báo giá hoặc tick ô áp tự động để cập nhật giá trị hợp đồng và sinh lại các đợt thanh toán chưa thu.
      </Typography.Paragraph>
    </div>
  );
}

/** Báo giá đã gửi hoặc bị từ chối thì cho phép tạo phiên bản điều chỉnh */
function canSupersede(status: string): boolean {
  return status === 'SENT' || status === 'REJECTED';
}
