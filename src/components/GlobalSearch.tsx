import { useEffect, useRef, useState } from 'react';
import { Input, Popover, Tag, Typography } from 'antd';
import { DropboxOutlined, HomeOutlined, SearchOutlined, ShopOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { searchCustomers } from '../services/customers';
import { normalizeText } from '../utils/text';
import type { Customer, Material, Project, Supplier } from '../types';

interface SearchResults {
  projects: Project[];
  customers: Customer[];
  materials: Material[];
  suppliers: Supplier[];
}

const EMPTY: SearchResults = { projects: [], customers: [], materials: [], suppliers: [] };

/** Tìm nhanh toàn cục: dự án, chủ nhà, vật tư, nhà cung cấp/thầu phụ */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const kw = keyword.trim();
    if (kw.length < 2) return;
    timer.current = window.setTimeout(async () => {
      const normalized = normalizeText(kw);
      const upper = kw.toUpperCase();
      const [customers, projects, materials, suppliers] = await Promise.all([
        searchCustomers(kw, 4),
        db.projects
          .filter(
            (p) =>
              p.code.toUpperCase().includes(upper) ||
              normalizeText(p.name).includes(normalized) ||
              normalizeText(p.address).includes(normalized),
          )
          .limit(5)
          .toArray(),
        db.materials
          .filter((m) => m.code.toUpperCase().includes(upper) || m.searchName.includes(normalized))
          .limit(4)
          .toArray(),
        db.suppliers
          .filter((s) => normalizeText(s.name).includes(normalized) || s.code.toUpperCase().includes(upper))
          .limit(4)
          .toArray(),
      ]);
      setResults({ projects, customers, materials, suppliers });
      setOpen(true);
    }, 250);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [keyword]);

  const hasResults = results.projects.length + results.customers.length + results.materials.length + results.suppliers.length > 0;

  const go = (path: string) => {
    setOpen(false);
    setKeyword('');
    navigate(path);
  };

  const content = (
    <div style={{ width: 400, maxHeight: 420, overflowY: 'auto' }}>
      {!hasResults ? (
        <Typography.Text type="secondary">Không tìm thấy kết quả phù hợp.</Typography.Text>
      ) : (
        <div>
          {results.projects.map((p) => (
            <div key={`p-${p.id}`} className="search-row" onClick={() => go(`/projects/${p.id}`)}>
              <Tag icon={<HomeOutlined />} color="gold">
                Dự án
              </Tag>
              <span className="text-strong" style={{ marginInlineEnd: 8 }}>
                {p.code}
              </span>
              <span className="text-muted">{p.name}</span>
            </div>
          ))}
          {results.customers.map((c) => (
            <div key={`c-${c.id}`} className="search-row" onClick={() => go(`/projects?q=${encodeURIComponent(c.name)}`)}>
              <Tag icon={<UserOutlined />} color="geekblue">
                Chủ nhà
              </Tag>
              <span className="text-strong" style={{ marginInlineEnd: 8 }}>
                {c.name}
              </span>
              <span className="text-muted">{c.phone}</span>
            </div>
          ))}
          {results.materials.map((m) => (
            <div key={`m-${m.id}`} className="search-row" onClick={() => go(`/materials?tab=catalog&q=${encodeURIComponent(m.code)}`)}>
              <Tag icon={<DropboxOutlined />} color="orange">
                Vật tư
              </Tag>
              <span className="text-strong" style={{ marginInlineEnd: 8 }}>
                {m.code}
              </span>
              <span className="text-muted">{m.name}</span>
            </div>
          ))}
          {results.suppliers.map((s) => (
            <div key={`s-${s.id}`} className="search-row" onClick={() => go(`/suppliers?q=${encodeURIComponent(s.name)}`)}>
              <Tag icon={<ShopOutlined />} color="purple">
                {s.type === 'MATERIAL' ? 'NCC' : 'Thầu phụ'}
              </Tag>
              <span className="text-strong" style={{ marginInlineEnd: 8 }}>
                {s.name}
              </span>
              <span className="text-muted">{s.phone}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Popover
      open={open && keyword.trim().length >= 2}
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
      content={content}
      placement="bottomLeft"
      trigger="click"
      styles={{ content: { padding: 8 } }}
    >
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Tìm dự án, chủ nhà, vật tư, NCC..."
        style={{ width: 340 }}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
    </Popover>
  );
}
