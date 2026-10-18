import dayjs from 'dayjs';
import { db, SCHEMA_VERSION, WAREHOUSE_ID } from './database';
import { nowIso } from '../utils/format';
import { newId } from '../utils/ids';
import { buildSearchName } from '../utils/text';
import { quoteTotals } from '../utils/money';
import type {
  ActivityLog,
  Customer,
  Employee,
  Handover,
  HandoverItem,
  Material,
  MaterialIssue,
  MaterialIssueItem,
  Milestone,
  Project,
  ProjectCategory,
  PurchaseOrder,
  PurchaseOrderItem,
  Quote,
  QuoteItem,
  QuoteSection,
  QuoteStatus,
  Stock,
  StockMovement,
  Supplier,
  Ticket,
  Timesheet,
  Transaction,
  Worker,
  WorkItem,
  WorkItemStatus,
} from '../types';
import { DEFAULT_COMPANY_INFO, DEFAULT_PRINT_CONFIG, DEFAULT_QUOTE_CONFIG, SETTING_KEYS } from '../services/settings';

export const SEED_VERSION = '1';

// Ngày tương đối so với thời điểm chạy để dashboard luôn có số liệu sống
const at = (offsetDays: number, hour = 9, minute = 0): string =>
  dayjs().add(offsetDays, 'day').hour(hour).minute(minute).second(0).millisecond(0).toISOString();
const key = (offsetDays: number): string => dayjs().add(offsetDays, 'day').format('YYYY-MM-DD');
const year = () => String(new Date().getFullYear());

// ---------------- Nhân sự ----------------
const EMPLOYEES: Array<{ id: string; code: string; name: string; role: Employee['role']; phone: string; title: string }> = [
  { id: 'emp-manager', code: 'NV-001', name: 'Trần Văn Hùng', role: 'MANAGER', phone: '0901 112 233', title: 'Giám đốc' },
  { id: 'emp-sales', code: 'NV-002', name: 'Nguyễn Thị Mai', role: 'SALES', phone: '0902 223 344', title: 'Trưởng phòng kinh doanh & thiết kế' },
  { id: 'emp-sales-2', code: 'NV-003', name: 'Phạm Thu Trang', role: 'SALES', phone: '0903 334 455', title: 'Kiến trúc sư nội thất' },
  { id: 'emp-site', code: 'NV-004', name: 'Lê Quốc Bảo', role: 'SITE_MANAGER', phone: '0904 445 566', title: 'Chỉ huy trưởng' },
  { id: 'emp-site-2', code: 'NV-005', name: 'Đỗ Thanh Sơn', role: 'SITE_MANAGER', phone: '0905 556 677', title: 'Giám sát công trình' },
  { id: 'emp-accountant', code: 'NV-006', name: 'Bùi Thị Hồng', role: 'ACCOUNTANT', phone: '0906 667 788', title: 'Kế toán tổng hợp' },
];

// ---------------- Chủ nhà ----------------
const CUSTOMERS: Array<{ id: string; name: string; phone: string; address: string; note?: string; taxCode?: string }> = [
  { id: 'cus-01', name: 'Anh Tuấn Anh', phone: '0903 111 222', address: 'Vinhomes Green Bay, Mễ Trì, Nam Từ Liêm, Hà Nội', note: 'Chủ căn hộ A1205, thích tông gỗ sáng.' },
  { id: 'cus-02', name: 'Chị Thu Hà', phone: '0912 333 444', address: 'Ngõ 12 Đặng Thai Mai, Tây Hồ, Hà Nội', note: 'Nhà phố 4 tầng, ưu tiên tiến độ.' },
  { id: 'cus-03', name: 'Anh Minh Quân', phone: '0988 555 666', address: 'Vườn Đào, Phú Thượng, Tây Hồ, Hà Nội', note: 'Biệt thự, cần thiết kế trước khi thi công.' },
  { id: 'cus-04', name: 'Chị Lan Phương', phone: '0976 222 111', address: 'Trần Quý Kiên, Cầu Giấy, Hà Nội', note: 'Văn phòng startup, cần bàn giao nhanh.' },
  { id: 'cus-05', name: 'Anh Đức Thắng', phone: '0934 888 999', address: 'Nguyễn Trãi, Thanh Xuân, Hà Nội', note: 'Shop thời trang, mở khai trương cuối tháng.' },
  { id: 'cus-06', name: 'Chị Hồng Ngọc', phone: '0906 777 555', address: 'Khu đô thị Ecopark, Văn Giang, Hưng Yên' },
  { id: 'cus-07', name: 'Anh Hoàng Nam', phone: '0967 444 333', address: 'Sunshine Riverside, Phú Thượng, Tây Hồ, Hà Nội' },
  { id: 'cus-08', name: 'Chị Mai Anh', phone: '0919 123 456', address: 'Ciputra, Bắc Từ Liêm, Hà Nội' },
  { id: 'cus-09', name: 'Anh Trung Kiên', phone: '0983 456 789', address: 'Royal City, Thanh Xuân, Hà Nội' },
  { id: 'cus-10', name: 'Công ty TNHH Nội thất Sao Việt', phone: '024 3333 8888', address: 'Khuất Duy Tiến, Thanh Xuân, Hà Nội', taxCode: '0107778888', note: 'Đối tác văn phòng — anh Bình phụ trách.' },
];

// ---------------- Nhà cung cấp & thầu phụ ----------------
const SUPPLIERS: Array<{ id: string; name: string; type: Supplier['type']; specialty?: string; phone: string; address?: string; rating: number }> = [
  { id: 'sup-01', name: 'Cty VLXD Hà Thành', type: 'MATERIAL', phone: '024 3333 1111', address: 'Nguyễn Xiển, Thanh Xuân, Hà Nội', rating: 4.5 },
  { id: 'sup-02', name: 'Đại lý sơn Jotun Hà Nội', type: 'MATERIAL', phone: '024 3333 2222', address: 'Lê Trọng Tấn, Thanh Xuân, Hà Nội', rating: 4.8 },
  { id: 'sup-03', name: 'Cty Thạch cao Vĩnh Tường', type: 'MATERIAL', phone: '024 3333 3333', address: 'Long Biên, Hà Nội', rating: 4.5 },
  { id: 'sup-04', name: 'Gỗ An Cường — miền Bắc', type: 'MATERIAL', phone: '024 3333 4444', address: 'KCN Quang Minh, Mê Linh, Hà Nội', rating: 5 },
  { id: 'sup-05', name: 'Đá Hoa Cương Việt', type: 'MATERIAL', phone: '024 3333 5555', address: 'Hoàng Mai, Hà Nội', rating: 4 },
  { id: 'sup-06', name: 'Thiết bị vệ sinh TOTO', type: 'MATERIAL', phone: '024 3333 6666', address: 'Hai Bà Trưng, Hà Nội', rating: 4.5 },
  { id: 'sup-07', name: 'Tổ điện anh Dũng', type: 'SUBCONTRACTOR', specialty: 'DIEN', phone: '0911 222 333', rating: 4.5 },
  { id: 'sup-08', name: 'Tổ nước anh Hoàn', type: 'SUBCONTRACTOR', specialty: 'NUOC', phone: '0912 444 555', rating: 4 },
  { id: 'sup-09', name: 'Thầu sơn chị Lan', type: 'SUBCONTRACTOR', specialty: 'SON', phone: '0913 666 777', rating: 4.5 },
  { id: 'sup-10', name: 'Thầu mộc anh Phú', type: 'SUBCONTRACTOR', specialty: 'MOC', phone: '0914 888 999', rating: 5 },
  { id: 'sup-11', name: 'Đá anh Thắng', type: 'SUBCONTRACTOR', specialty: 'DA', phone: '0915 111 222', rating: 4 },
  { id: 'sup-12', name: 'Thạch cao anh Cường', type: 'SUBCONTRACTOR', specialty: 'THACH_CAO', phone: '0916 333 444', rating: 3.5 },
];

// ---------------- Thợ ----------------
const WORKERS: Array<{ id: string; name: string; trade: Worker['trade']; employmentType: Worker['employmentType']; dailyRateVnd: number; phone: string }> = [
  { id: 'w-01', name: 'Nguyễn Văn Phú', trade: 'MOC', employmentType: 'CONTRACT', dailyRateVnd: 550000, phone: '0981 111 001' },
  { id: 'w-02', name: 'Trần Đức Thịnh', trade: 'MOC', employmentType: 'CORE', dailyRateVnd: 520000, phone: '0981 111 002' },
  { id: 'w-03', name: 'Lê Văn Hải', trade: 'MOC', employmentType: 'CORE', dailyRateVnd: 480000, phone: '0981 111 003' },
  { id: 'w-04', name: 'Phạm Quốc Dũng', trade: 'DIEN', employmentType: 'CONTRACT', dailyRateVnd: 500000, phone: '0981 111 004' },
  { id: 'w-05', name: 'Hoàng Minh Tuấn', trade: 'DIEN', employmentType: 'CORE', dailyRateVnd: 450000, phone: '0981 111 005' },
  { id: 'w-06', name: 'Đặng Văn Hoàn', trade: 'NUOC', employmentType: 'CONTRACT', dailyRateVnd: 500000, phone: '0981 111 006' },
  { id: 'w-07', name: 'Vũ Đình Nam', trade: 'NUOC', employmentType: 'CORE', dailyRateVnd: 430000, phone: '0981 111 007' },
  { id: 'w-08', name: 'Nguyễn Thị Lan', trade: 'SON', employmentType: 'CONTRACT', dailyRateVnd: 470000, phone: '0981 111 008' },
  { id: 'w-09', name: 'Bùi Văn Kiên', trade: 'SON', employmentType: 'CORE', dailyRateVnd: 420000, phone: '0981 111 009' },
  { id: 'w-10', name: 'Trịnh Thị Hoa', trade: 'SON', employmentType: 'CORE', dailyRateVnd: 400000, phone: '0981 111 010' },
  { id: 'w-11', name: 'Ngô Văn Cường', trade: 'THACH_CAO', employmentType: 'CONTRACT', dailyRateVnd: 500000, phone: '0981 111 011' },
  { id: 'w-12', name: 'Đinh Xuân Trường', trade: 'THACH_CAO', employmentType: 'CORE', dailyRateVnd: 460000, phone: '0981 111 012' },
  { id: 'w-13', name: 'Phan Văn Lực', trade: 'PHU_HO', employmentType: 'CORE', dailyRateVnd: 350000, phone: '0981 111 013' },
  { id: 'w-14', name: 'Lý Văn Thành', trade: 'PHU_HO', employmentType: 'CORE', dailyRateVnd: 360000, phone: '0981 111 014' },
];

// ---------------- Vật tư ----------------
// [mã, tên, ĐVT, giá bình quân, tồn mở, tồn tối thiểu]
const MATERIALS: Array<[string, string, string, number, number, number]> = [
  ['VT-001', 'Gạch Granite 80×80 Đồng Tâm', 'm²', 520000, 120, 40],
  ['VT-002', 'Gạch Ceramic 600×600 Prime', 'm²', 320000, 180, 60],
  ['VT-003', 'Gạch ốp tường 300×600 Bạch Mã', 'm²', 280000, 90, 30],
  ['VT-004', 'Sơn lót kháng kiềm Jotun JN01', 'thùng', 1450000, 24, 8],
  ['VT-005', 'Sơn phủ Dulux màu ghi sáng (thùng 18L)', 'thùng', 1850000, 3, 5],
  ['VT-006', 'Bột bả Jotun nội thất (bao 40kg)', 'bao', 320000, 40, 15],
  ['VT-007', 'Thạch cao Vĩnh Tường 9mm', 'tấm', 145000, 220, 80],
  ['VT-008', 'Khung xương Vĩnh Tường (thanh 3m)', 'thanh', 65000, 160, 60],
  ['VT-009', 'Gỗ MDF An Cường phủ melamine', 'tấm', 780000, 85, 30],
  ['VT-010', 'Bản lề giảm chấn Hafele', 'cái', 85000, 400, 120],
  ['VT-011', 'Ray hộp giảm chấn Hafele 45cm', 'bộ', 320000, 60, 20],
  ['VT-012', 'Đá granite đen Huế (tấm 1.6×2.4m)', 'tấm', 2450000, 18, 6],
  ['VT-013', 'Inox 304 tay nắm dài 256mm', 'cái', 185000, 4, 40],
  ['VT-014', 'Dây điện Cadivi 2.5 (cuộn 100m)', 'cuộn', 780000, 22, 8],
  ['VT-015', 'Ống nước Bình Minh PPR Ø20 (cây 4m)', 'cây', 85000, 120, 40],
  ['VT-016', 'Thiết bị WC TOTO bồn cầu 2 khối', 'bộ', 4200000, 6, 2],
  ['VT-017', 'Aptomat Panasonic 32A', 'cái', 450000, 15, 5],
  ['VT-018', 'Đèn downlight LED 9W Panasonic', 'bộ', 85000, 210, 80],
  ['VT-019', 'Ổ cắm & công tắc Panasonic', 'bộ', 95000, 180, 60],
  ['VT-020', 'Sàn gỗ công nghiệp 8mm chống ẩm', 'm²', 380000, 150, 50],
  ['VT-021', 'Keo dán gạch & ron chống thấm (bao 20kg)', 'bao', 260000, 70, 25],
  ['VT-022', 'Chống thấm Sika 2 thành phần (bộ 25kg)', 'bộ', 950000, 12, 4],
  ['VT-023', 'Xi măng Hà Tiên PCB40 (bao 50kg)', 'bao', 92000, 140, 50],
  ['VT-024', 'Cát vàng sàng khô', 'm³', 420000, 12, 4],
  ['VT-025', 'Kính cường lực 8mm', 'm²', 850000, 26, 10],
  ['VT-026', 'Len chân tường gỗ công nghiệp (thanh 2.4m)', 'thanh', 85000, 90, 30],
  ['VT-027', 'Vòi sen & lavabo TOTO', 'bộ', 2800000, 5, 2],
  ['VT-028', 'Bình nóng lạnh Ariston 30L', 'bộ', 3100000, 4, 2],
  ['VT-029', 'Ống thoát nước PVC Ø90 (cây 4m)', 'cây', 55000, 80, 30],
  ['VT-030', 'Máy hút mùi Bosch + bếp từ đôi', 'bộ', 12500000, 3, 1],
];

// ---------------- Dự án ----------------
interface SeedProject {
  id: string;
  code: string;
  name: string;
  customerId: string;
  category: ProjectCategory;
  status: Project['status'];
  address: string;
  target: number;
  startOffset: number;
  handoverOffset: number;
  managerId: string;
  designerId: string;
  note?: string;
  paidRatio: number;
}

const PROJECTS: SeedProject[] = [
  {
    id: 'prj-01',
    code: `DA-${year()}-01`,
    name: 'Căn hộ Vinhomes Green Bay – A1205',
    customerId: 'cus-01',
    category: 'APARTMENT',
    status: 'CONSTRUCTION',
    address: 'A1205 Vinhomes Green Bay, Mễ Trì, Nam Từ Liêm, Hà Nội',
    target: 480000000,
    startOffset: -45,
    handoverOffset: 35,
    managerId: 'emp-site',
    designerId: 'emp-sales',
    note: 'Thi công trọn gói nội thất 2PN, tông gỗ sáng.',
    paidRatio: 60,
  },
  {
    id: 'prj-02',
    code: `DA-${year()}-02`,
    name: 'Nhà phố Tây Hồ 4 tầng',
    customerId: 'cus-02',
    category: 'TOWNHOUSE',
    status: 'CONSTRUCTION',
    address: 'Ngõ 12 Đặng Thai Mai, Tây Hồ, Hà Nội',
    target: 1850000000,
    startOffset: -60,
    handoverOffset: 75,
    managerId: 'emp-site',
    designerId: 'emp-sales-2',
    note: 'Cải tạo toàn bộ 4 tầng, thi công cuốn chiếu theo tầng.',
    paidRatio: 40,
  },
  {
    id: 'prj-03',
    code: `DA-${year()}-03`,
    name: 'Biệt thự Vườn Đào',
    customerId: 'cus-03',
    category: 'VILLA',
    status: 'DESIGN',
    address: 'Vườn Đào, Phú Thượng, Tây Hồ, Hà Nội',
    target: 0,
    startOffset: -12,
    handoverOffset: 150,
    managerId: 'emp-site-2',
    designerId: 'emp-sales',
    note: 'Đang hoàn thiện hồ sơ thiết kế 3D, chưa báo giá.',
    paidRatio: 0,
  },
  {
    id: 'prj-04',
    code: `DA-${year()}-04`,
    name: 'Văn phòng startup Cầu Giấy',
    customerId: 'cus-04',
    category: 'OFFICE',
    status: 'QUOTING',
    address: 'Tầng 5 Trần Quý Kiên, Cầu Giấy, Hà Nội',
    target: 0,
    startOffset: -20,
    handoverOffset: 90,
    managerId: 'emp-site-2',
    designerId: 'emp-sales-2',
    note: 'Khách đang cân nhắc báo giá v2 (bổ sung khu pantry).',
    paidRatio: 0,
  },
  {
    id: 'prj-05',
    code: `DA-${year()}-05`,
    name: 'Shop thời trang Nguyễn Trãi',
    customerId: 'cus-05',
    category: 'SHOP',
    status: 'HANDOVER',
    address: '154 Nguyễn Trãi, Thanh Xuân, Hà Nội',
    target: 320000000,
    startOffset: -150,
    handoverOffset: -12,
    managerId: 'emp-site',
    designerId: 'emp-sales',
    note: 'Đã bàn giao, đang theo dõi bảo hành 12 tháng.',
    paidRatio: 90,
  },
  {
    id: 'prj-06',
    code: `DA-${year()}-06`,
    name: 'Nhà phố Ecopark — gói bảo hành',
    customerId: 'cus-06',
    category: 'TOWNHOUSE',
    status: 'WARRANTY',
    address: 'Khu đô thị Ecopark, Văn Giang, Hưng Yên',
    target: 1050000000,
    startOffset: -240,
    handoverOffset: -70,
    managerId: 'emp-site-2',
    designerId: 'emp-sales',
    note: 'Bàn giao 2 tháng trước, đang xử lý 2 ticket bảo hành.',
    paidRatio: 100,
  },
  {
    id: 'prj-07',
    code: `DA-${year()}-07`,
    name: 'Căn hộ Sunshine Riverside',
    customerId: 'cus-07',
    category: 'APARTMENT',
    status: 'CONSTRUCTION',
    address: 'Sunshine Riverside, Phú Thượng, Tây Hồ, Hà Nội',
    target: 610000000,
    startOffset: -18,
    handoverOffset: 80,
    managerId: 'emp-site-2',
    designerId: 'emp-sales-2',
    note: 'Mới khởi công, đang thi công thô phần điện nước.',
    paidRatio: 30,
  },
];

// ---------------- Hạng mục thi công ----------------
// [khu vực, tên việc, ĐVT, khối lượng, trạng thái, tiến độ %, bắt đầu, kết thúc, tổ]
type ItemTuple = [string, string, string, number, WorkItemStatus, number, number, number, string];
const T_MOC = 'Tổ mộc anh Phú';
const T_DIEN = 'Tổ điện anh Dũng';
const T_NUOC = 'Tổ nước anh Hoàn';
const T_SON = 'Thầu sơn chị Lan';
const T_THACH_CAO = 'Thạch cao anh Cường';
const T_DA = 'Đá anh Thắng';

const PROJECT_ITEMS: Record<string, ItemTuple[]> = {
  'prj-01': [
    ['Phòng khách', 'Tháo dỡ nội thất cũ & vận chuyển xà bần', 'm²', 45, 'ACCEPTED', 100, -45, -40, T_THACH_CAO],
    ['Phòng khách', 'Đi dây điện âm tường & ổ cắm Panasonic', 'bộ', 18, 'ACCEPTED', 100, -42, -34, T_DIEN],
    ['Phòng khách', 'Làm trần thạch cao phẳng Vĩnh Tường', 'm²', 42, 'ACCEPTED', 100, -38, -30, T_THACH_CAO],
    ['Phòng khách', 'Trần giật cấp có hắt sáng LED', 'm²', 12, 'ACCEPTED', 100, -34, -28, T_THACH_CAO],
    ['Phòng khách', 'Sơn lót Jotun JN01 toàn bộ tường', 'm²', 130, 'DONE', 100, -30, -22, T_SON],
    ['Phòng khách', 'Sơn nước màu ghi sáng 2 lớp', 'm²', 130, 'DOING', 75, -24, -6, T_SON],
    ['Phòng khách', 'Lát gạch Granite 80×80', 'm²', 32, 'DONE', 100, -28, -20, T_THACH_CAO],
    ['Phòng khách', 'Kệ tivi & vách trang trí MDF', 'bộ', 1, 'DOING', 60, -18, 6, T_MOC],
    ['Bếp', 'Đi ống nước PPR & thoát nước bồn rửa', 'm', 24, 'ACCEPTED', 100, -40, -32, T_NUOC],
    ['Bếp', 'Ốp tường gạch 300×600 khu bếp', 'm²', 18, 'DONE', 100, -30, -24, T_THACH_CAO],
    ['Bếp', 'Đóng tủ bếp MDF An Cường (trên + dưới)', 'm', 4, 'DOING', 65, -16, 8, T_MOC],
    ['Bếp', 'Mặt bàn bếp đá granite đen Huế', 'm²', 3, 'TODO', 0, 2, 12, T_DA],
    ['Bếp', 'Lắp máy hút mùi & bếp từ', 'bộ', 1, 'TODO', 0, 10, 16, T_DIEN],
    ['Phòng ngủ 1', 'Đóng tủ quần áo âm tường MDF', 'm²', 7, 'DOING', 50, -12, 10, T_MOC],
    ['Phòng ngủ 1', 'Sàn gỗ công nghiệp 8mm chống ẩm', 'm²', 16, 'DOING', 40, -8, 6, T_MOC],
    ['Phòng ngủ 1', 'Giường ngủ & tủ đầu giường', 'bộ', 1, 'TODO', 0, 6, 18, T_MOC],
    ['WC', 'Chống thấm WC 2 lớp Sika', 'm²', 8, 'ACCEPTED', 100, -40, -36, T_NUOC],
    ['WC', 'Lắp thiết bị WC TOTO & bình nóng lạnh', 'bộ', 1, 'DONE', 100, -26, -18, T_NUOC],
    ['WC', 'Vệ sinh công nghiệp bàn giao', 'm²', 68, 'TODO', 0, 24, 32, T_SON],
  ],
  'prj-02': [
    ['Tầng 1', 'Tháo dỡ trần cũ & hệ khung tầng 1', 'm²', 62, 'ACCEPTED', 100, -60, -54, T_THACH_CAO],
    ['Tầng 1', 'Đục phá tường cũ, trát lại', 'm²', 34, 'ACCEPTED', 100, -58, -48, T_THACH_CAO],
    ['Tầng 1', 'Đi dây điện âm tường Cadivi 2.5', 'm', 320, 'ACCEPTED', 100, -56, -44, T_DIEN],
    ['Tầng 1', 'Aptomat tổng Panasonic 32A', 'bộ', 1, 'DONE', 100, -50, -44, T_DIEN],
    ['Tầng 1', 'Đi ống nước PPR toàn tầng', 'm', 90, 'DONE', 100, -54, -42, T_NUOC],
    ['Tầng 1', 'Đi ống thoát nước PVC Ø90', 'm', 45, 'DONE', 100, -52, -40, T_NUOC],
    ['Tầng 1', 'Trần thạch cao phẳng + len chân tường', 'm²', 62, 'DOING', 70, -34, -10, T_THACH_CAO],
    ['Tầng 1', 'Bả matit 2 lớp toàn bộ tường', 'm²', 240, 'DOING', 55, -26, 2, T_SON],
    ['Tầng 1', 'Sơn lót kháng kiềm Jotun', 'm²', 240, 'DOING', 35, -20, 6, T_SON],
    ['Tầng 1', 'Lát gạch Granite 80×80 sảnh & phòng khách', 'm²', 58, 'DOING', 80, -18, -2, T_THACH_CAO],
    ['Tầng 2', 'Đi dây điện & ổ cắm phòng ngủ', 'bộ', 26, 'DONE', 100, -48, -36, T_DIEN],
    ['Tầng 2', 'Trần thạch cao phòng ngủ 1 & 2', 'm²', 48, 'DOING', 45, -16, 8, T_THACH_CAO],
    ['Tầng 2', 'Sàn gỗ công nghiệp 2 phòng ngủ', 'm²', 42, 'TODO', 0, 8, 22, T_MOC],
    ['Tầng 2', 'Đóng tủ quần áo âm tường phòng ngủ 1', 'm²', 8, 'DOING', 30, -8, 16, T_MOC],
    ['Tầng 2', 'Vệ sinh hoàn thiện, chống thấm WC tầng 2', 'm²', 9, 'DOING', 60, -14, 4, T_NUOC],
    ['Tầng 3', 'Đi dây điện & chiếu sáng hành lang', 'm', 180, 'DOING', 65, -30, 0, T_DIEN],
    ['Tầng 3', 'Trần thạch cao giật cấp hành lang', 'm²', 26, 'TODO', 0, 10, 24, T_THACH_CAO],
    ['Tầng 3', 'Bả matit & sơn nước toàn tầng', 'm²', 210, 'TODO', 0, 12, 30, T_SON],
    ['Tầng 3', 'Đóng giường ngủ & tủ đầu giường', 'bộ', 2, 'TODO', 0, 20, 34, T_MOC],
    ['Tầng 3', 'Lát gạch 600×600 phòng ngủ 3', 'm²', 24, 'TODO', 0, 14, 26, T_THACH_CAO],
    ['Tầng 4', 'Sân thượng chống thấm 2 lớp', 'm²', 38, 'DOING', 50, -12, 6, T_NUOC],
    ['Tầng 4', 'Lan can & cửa nhôm kính', 'm²', 22, 'DOING', 40, -6, 12, T_MOC],
    ['Tầng 4', 'Phòng thờ: trần thạch cao & sơn hoàn thiện', 'm²', 18, 'TODO', 0, 12, 22, T_THACH_CAO],
    ['Sảnh', 'Đá bậc tam cấp & ngưỡng cửa', 'm', 14, 'DONE', 100, -42, -30, T_DA],
    ['Sảnh', 'Mặt bàn lavabo đá tự nhiên', 'm²', 2, 'TODO', 0, 8, 18, T_DA],
    ['Sảnh', 'Vệ sinh công nghiệp toàn nhà bàn giao', 'm²', 220, 'TODO', 0, 40, 50, T_SON],
  ],
  'prj-05': [
    ['Sảnh', 'Tháo dỡ mặt bằng cũ & vệ sinh', 'm²', 85, 'ACCEPTED', 100, -150, -144, T_THACH_CAO],
    ['Sảnh', 'Đi dây điện & hệ thống chiếu sáng shop', 'm', 240, 'ACCEPTED', 100, -146, -132, T_DIEN],
    ['Sảnh', 'Trần thạch cao giật cấp hắt sáng', 'm²', 85, 'ACCEPTED', 100, -138, -124, T_THACH_CAO],
    ['Sảnh', 'Sơn nước toàn bộ shop màu trắng ghi', 'm²', 210, 'ACCEPTED', 100, -128, -116, T_SON],
    ['Sảnh', 'Lát gạch Granite 80×80 toàn mặt bằng', 'm²', 85, 'ACCEPTED', 100, -126, -114, T_THACH_CAO],
    ['Khu trưng bày', 'Đóng kệ trưng bày MDF phủ melamine', 'm²', 26, 'ACCEPTED', 100, -118, -100, T_MOC],
    ['Khu trưng bày', 'Inox 304 tay nắm & phụ kiện kệ', 'bộ', 1, 'ACCEPTED', 100, -104, -98, T_MOC],
    ['Khu trưng bày', 'Lắp đèn rọi & đèn ray trưng bày', 'bộ', 24, 'ACCEPTED', 100, -102, -94, T_DIEN],
    ['Thu ngân', 'Đóng quầy thu ngân & tủ hồ sơ', 'bộ', 1, 'ACCEPTED', 100, -100, -88, T_MOC],
    ['WC', 'Cải tạo WC, lắp thiết bị TOTO', 'bộ', 1, 'ACCEPTED', 100, -96, -86, T_NUOC],
    ['Kho', 'Kệ kho & vách ngăn thạch cao', 'm²', 12, 'ACCEPTED', 100, -92, -82, T_THACH_CAO],
    ['Mặt tiền', 'Cửa nhôm kính & biển hiệu', 'm²', 18, 'ACCEPTED', 100, -90, -74, T_MOC],
    ['Toàn shop', 'Nghiệm thu hạng mục & sửa lỗi phát sinh', 'lần', 1, 'ACCEPTED', 100, -70, -60, T_MOC],
    ['Toàn shop', 'Vệ sinh công nghiệp bàn giao', 'm²', 85, 'ACCEPTED', 100, -58, -54, T_SON],
  ],
  'prj-07': [
    ['Sảnh', 'Che chắn bảo vệ & tập kết vật tư', 'm²', 68, 'ACCEPTED', 100, -18, -16, T_THACH_CAO],
    ['Sảnh', 'Đi dây điện âm tường Cadivi 2.5', 'm', 180, 'DOING', 60, -14, 4, T_DIEN],
    ['Sảnh', 'Đi ống nước PPR & thoát nước', 'm', 62, 'DOING', 55, -14, 4, T_NUOC],
    ['Phòng khách', 'Trần thạch cao phẳng Vĩnh Tường', 'm²', 38, 'DOING', 30, -8, 12, T_THACH_CAO],
    ['Phòng khách', 'Lát gạch Granite 80×80', 'm²', 30, 'TODO', 0, 10, 22, T_THACH_CAO],
    ['Phòng khách', 'Sơn lót & sơn phủ 2 lớp', 'm²', 118, 'TODO', 0, 16, 32, T_SON],
    ['Bếp', 'Ốp tường gạch 300×600', 'm²', 16, 'TODO', 0, 18, 28, T_THACH_CAO],
    ['Bếp', 'Đóng tủ bếp MDF An Cường', 'm', 3.5, 'TODO', 0, 24, 40, T_MOC],
    ['Phòng ngủ 1', 'Đóng tủ quần áo âm tường', 'm²', 6, 'TODO', 0, 26, 44, T_MOC],
    ['Phòng ngủ 1', 'Sàn gỗ công nghiệp 8mm', 'm²', 14, 'TODO', 0, 30, 44, T_MOC],
    ['WC', 'Chống thấm & ốp lát WC', 'm²', 7, 'DOING', 25, -6, 14, T_NUOC],
    ['WC', 'Lắp thiết bị vệ sinh TOTO', 'bộ', 1, 'TODO', 0, 14, 22, T_NUOC],
  ],
  'prj-06': [
    ['Phòng ngủ 1', 'Sơn lại mối nối trần thạch cao', 'm²', 6, 'ACCEPTED', 100, -60, -56, T_SON],
    ['Phòng khách', 'Cân chỉnh cửa nhôm kính ban công', 'bộ', 3, 'ACCEPTED', 100, -62, -58, T_MOC],
    ['Bếp', 'Vệ sinh máy hút mùi định kỳ', 'bộ', 1, 'ACCEPTED', 100, -58, -56, T_DIEN],
  ],
  'prj-03': [
    ['Toàn nhà', 'Khảo sát hiện trạng & đo đạc', 'lần', 1, 'DONE', 100, -12, -10, T_MOC],
    ['Toàn nhà', 'Dựng phối cảnh 3D phòng khách', 'lần', 1, 'DOING', 60, -8, 4, 'Kiến trúc sư Trang'],
    ['Toàn nhà', 'Triển khai bản vẽ kỹ thuật nội thất', 'lần', 1, 'TODO', 0, 5, 20, 'Kiến trúc sư Trang'],
  ],
  'prj-04': [
    ['Toàn nhà', 'Khảo sát mặt bằng tầng 5', 'lần', 1, 'DONE', 100, -20, -18, T_MOC],
    ['Toàn nhà', 'Bóc tách khối lượng & lập báo giá v2', 'lần', 1, 'DOING', 70, -10, 3, 'Kiến trúc sư Trang'],
    ['Toàn nhà', 'Chốt phương án thiết kế với khách', 'lần', 1, 'TODO', 0, 4, 10, 'Kinh doanh Mai'],
  ],
};

// ---------------- Thư viện hạng mục báo giá ----------------
// [mô tả, ĐVT, khối lượng chuẩn, đơn giá vật tư, đơn giá nhân công]
type LibItem = [string, string, number, number, number];
const QUOTE_LIBRARY: Array<{ section: string; items: LibItem[] }> = [
  {
    section: 'Tháo dỡ & vệ sinh',
    items: [
      ['Tháo dỡ nội thất cũ, vận chuyển xà bần', 'm²', 70, 45000, 60000],
      ['Che chắn bảo vệ khu vực thi công', 'm²', 70, 25000, 15000],
      ['Vệ sinh công nghiệp bàn giao', 'm²', 70, 20000, 35000],
      ['Đục phá tường cũ, trát lại', 'm²', 12, 120000, 180000],
    ],
  },
  {
    section: 'Điện nước',
    items: [
      ['Đi dây điện âm tường Cadivi 2.5', 'm', 220, 18000, 25000],
      ['Ổ cắm & công tắc Panasonic', 'bộ', 32, 95000, 40000],
      ['Aptomat tổng Panasonic 32A', 'bộ', 1, 450000, 150000],
      ['Đèn downlight LED 9W âm trần', 'bộ', 40, 85000, 45000],
      ['Đi ống nước PPR Bình Minh Ø20', 'm', 65, 45000, 40000],
      ['Đi ống thoát nước PVC Ø90', 'm', 35, 55000, 50000],
      ['Thiết bị WC TOTO (bồn cầu + lavabo)', 'bộ', 2, 4200000, 600000],
      ['Vòi sen & phụ kiện phòng tắm', 'bộ', 2, 2800000, 450000],
      ['Bình nóng lạnh Ariston 30L', 'bộ', 2, 3100000, 300000],
    ],
  },
  {
    section: 'Trần & thạch cao',
    items: [
      ['Làm trần thạch cao phẳng Vĩnh Tường 9mm', 'm²', 75, 160000, 90000],
      ['Trần giật cấp có hắt sáng LED', 'm²', 22, 240000, 160000],
      ['Vách thạch cao 2 mặt khung xương chịu lực', 'm²', 14, 210000, 130000],
      ['Khung xương chìm & phụ kiện', 'm²', 95, 65000, 45000],
      ['Len chân tường thạch cao', 'm', 45, 45000, 30000],
      ['Bả trần & xử lý mối nối', 'm²', 95, 35000, 55000],
    ],
  },
  {
    section: 'Sơn & hoàn thiện',
    items: [
      ['Cạo bỏ lớp sơn cũ, bả matit 2 lớp', 'm²', 250, 25000, 45000],
      ['Sơn lót kháng kiềm Jotun JN01', 'm²', 250, 35000, 30000],
      ['Sơn phủ Dulux màu ghi sáng (2 lớp)', 'm²', 250, 42000, 55000],
      ['Sơn dầm, cột & mảng trang trí điểm nhấn', 'm²', 30, 60000, 75000],
      ['Giấy dán tường mảng đầu giường', 'm²', 12, 180000, 90000],
      ['Chống thấm WC & ban công (2 lớp Sika)', 'm²', 20, 95000, 70000],
    ],
  },
  {
    section: 'Sàn & ốp lát',
    items: [
      ['Lát gạch Granite 80×80 phòng khách', 'm²', 34, 520000, 120000],
      ['Lát gạch 600×600 phòng ngủ', 'm²', 30, 320000, 110000],
      ['Ốp tường gạch 300×600 khu WC & bếp', 'm²', 28, 280000, 130000],
      ['Sàn gỗ công nghiệp 8mm chống ẩm', 'm²', 30, 380000, 95000],
      ['Len chân tường gỗ công nghiệp', 'm', 42, 85000, 45000],
      ['Đá bậc cầu thang granite', 'm', 12, 480000, 180000],
    ],
  },
  {
    section: 'Nội thất gỗ',
    items: [
      ['Tủ bếp trên MDF An Cường phủ melamine', 'm', 4, 1650000, 750000],
      ['Tủ bếp dưới chống ẩm An Cường', 'm', 4, 1450000, 650000],
      ['Tủ quần áo âm tường MDF', 'm²', 14, 1300000, 550000],
      ['Giường ngủ 1.6×2m gỗ MDF', 'bộ', 2, 3800000, 850000],
      ['Tủ đầu giường & bàn trang điểm', 'bộ', 2, 2200000, 600000],
      ['Bàn làm việc & kệ sách treo', 'bộ', 1, 2600000, 700000],
      ['Kệ tivi & vách trang trí phòng khách', 'bộ', 1, 3200000, 800000],
      ['Tủ giày & tủ trang trí sảnh', 'm²', 3, 1150000, 500000],
      ['Bản lề giảm chấn & ray hộp Hafele', 'bộ', 1, 650000, 200000],
    ],
  },
  {
    section: 'Đá & mặt bàn',
    items: [
      ['Mặt bàn bếp đá granite đen Huế', 'm²', 3, 1250000, 450000],
      ['Bàn đảo bếp đá granite', 'm²', 1.4, 1350000, 500000],
      ['Mặt bàn lavabo đá tự nhiên', 'm²', 1.6, 1100000, 420000],
      ['Bậc tam cấp & ngưỡng cửa đá', 'm', 12, 520000, 220000],
    ],
  },
  {
    section: 'Thiết bị & khác',
    items: [
      ['Inox 304 tay nắm dài & phụ kiện', 'bộ', 1, 850000, 250000],
      ['Khóa cửa chính & khóa phòng cao cấp', 'bộ', 3, 1650000, 350000],
      ['Gương soi & đèn gương WC', 'bộ', 2, 950000, 250000],
      ['Kính cường lực vách tắm 8mm', 'm²', 4, 850000, 350000],
      ['Cửa nhôm kính hệ 55', 'm²', 16, 1250000, 450000],
      ['Máy hút mùi & bếp từ Bosch', 'bộ', 1, 12500000, 900000],
      ['Rèm cửa & phụ kiện', 'm²', 14, 550000, 150000],
    ],
  },
];

interface QuotePlan {
  code: string;
  projectId: string;
  version: number;
  status: QuoteStatus;
  discountPct: number;
  target: number;
  scale: number;
  createdOffset: number;
  /** [chỉ số nhóm, danh sách item lấy vào] */
  plan: Array<[number, number[]]>;
  note?: string;
}

const QUOTE_PLANS: QuotePlan[] = [
  {
    code: `BG-${year()}-01`,
    projectId: 'prj-01',
    version: 1,
    status: 'APPROVED',
    discountPct: 5,
    target: 480000000,
    scale: 1,
    createdOffset: -50,
    plan: [
      [0, [0, 1, 2]],
      [1, [0, 1, 2, 3, 4, 5, 6]],
      [2, [0, 1, 3, 5]],
      [3, [0, 1, 2, 5]],
      [4, [0, 1, 3, 4]],
      [5, [0, 1, 2, 3, 4, 6]],
      [6, [0, 1, 2]],
      [7, [0, 1, 2, 3, 5, 6]],
    ],
    note: 'Báo giá trọn gói căn hộ 2PN, đã bao gồm nhân công và vật tư hoàn thiện.',
  },
  {
    code: `BG-${year()}-02`,
    projectId: 'prj-02',
    version: 1,
    status: 'APPROVED',
    discountPct: 6,
    target: 1850000000,
    scale: 3.4,
    createdOffset: -66,
    plan: [
      [0, [0, 1, 2, 3]],
      [1, [0, 1, 2, 3, 4, 5, 6, 7, 8]],
      [2, [0, 1, 2, 3, 4, 5]],
      [3, [0, 1, 2, 3, 5]],
      [4, [0, 1, 2, 3, 4, 5]],
      [5, [0, 1, 2, 3, 4, 5, 6, 7, 8]],
      [6, [0, 2, 3]],
      [7, [0, 1, 2, 3, 4, 6]],
    ],
    note: 'Báo giá cải tạo toàn bộ 4 tầng nhà phố.',
  },
  {
    code: `BG-${year()}-03`,
    projectId: 'prj-02',
    version: 2,
    status: 'SENT',
    discountPct: 6,
    target: 1960000000,
    scale: 3.6,
    createdOffset: -12,
    plan: [
      [0, [0, 1, 2, 3]],
      [1, [0, 1, 2, 3, 4, 5, 6, 7, 8]],
      [2, [0, 1, 2, 3, 4, 5]],
      [3, [0, 1, 2, 3, 4, 5]],
      [4, [0, 1, 2, 3, 4, 5]],
      [5, [0, 1, 2, 3, 4, 5, 6, 7, 8]],
      [6, [0, 1, 2, 3]],
      [7, [0, 1, 2, 3, 4, 5, 6]],
    ],
    note: 'Bổ sung phòng thờ tầng 4 và nâng cấp thiết bị bếp so với v1.',
  },
  {
    code: `BG-${year()}-04`,
    projectId: 'prj-04',
    version: 1,
    status: 'REJECTED',
    discountPct: 3,
    target: 720000000,
    scale: 1.9,
    createdOffset: -16,
    plan: [
      [1, [0, 1, 2, 3, 4, 5]],
      [2, [0, 1, 3, 5]],
      [3, [0, 1, 2]],
      [4, [3, 4]],
      [5, [0, 2, 6]],
      [7, [0, 3, 6]],
    ],
    note: 'Phương án 1: giữ nguyên hệ thống trần cũ.',
  },
  {
    code: `BG-${year()}-05`,
    projectId: 'prj-04',
    version: 2,
    status: 'SENT',
    discountPct: 5,
    target: 860000000,
    scale: 2,
    createdOffset: -6,
    plan: [
      [0, [0, 1, 2]],
      [1, [0, 1, 2, 3, 4, 5, 6]],
      [2, [0, 1, 3, 5]],
      [3, [0, 1, 2]],
      [4, [3, 4]],
      [5, [2, 6, 7]],
      [7, [0, 2, 3, 4, 5, 6]],
    ],
    note: 'Phương án 2: làm mới trần toàn bộ, bổ sung khu pantry và phòng họp.',
  },
  {
    code: `BG-${year()}-06`,
    projectId: 'prj-05',
    version: 1,
    status: 'APPROVED',
    discountPct: 4,
    target: 320000000,
    scale: 1.05,
    createdOffset: -152,
    plan: [
      [0, [0, 1, 2]],
      [1, [0, 1, 2, 3]],
      [2, [0, 1, 3]],
      [3, [0, 1]],
      [4, [0, 1]],
      [5, [2, 6, 7]],
      [7, [0, 1, 3]],
    ],
    note: 'Báo giá thi công shop thời trang, ưu tiên tiến độ khai trương.',
  },
  {
    code: `BG-${year()}-07`,
    projectId: 'prj-07',
    version: 1,
    status: 'APPROVED',
    discountPct: 5,
    target: 610000000,
    scale: 1.15,
    createdOffset: -22,
    plan: [
      [0, [1, 2]],
      [1, [0, 1, 3, 4, 5, 6]],
      [2, [0, 3, 5]],
      [3, [0, 1, 2]],
      [4, [0, 1, 3, 4]],
      [5, [0, 1, 2, 3, 6]],
      [6, [0, 2]],
      [7, [0, 1, 2, 3]],
    ],
    note: 'Thi công trọn gói căn hộ 2PN hướng sông, tông gỗ tự nhiên.',
  },
];

// ---------------- Phiếu mua / xuất vật tư ----------------
interface SeedPo {
  id: string;
  code: string;
  supplierId: string;
  projectId?: string;
  status: PurchaseOrder['status'];
  createdOffset: number;
  receivedOffset?: number;
  note?: string;
  // [mã vật tư, số lượng, đơn giá]
  items: Array<[string, number, number]>;
}

const PURCHASE_ORDERS: SeedPo[] = [
  {
    id: 'po-01',
    code: `PN-${year()}-01`,
    supplierId: 'sup-01',
    projectId: 'prj-01',
    status: 'RECEIVED',
    createdOffset: -40,
    receivedOffset: -38,
    note: 'Nhập gạch & xi măng cho căn hộ Green Bay.',
    items: [
      ['VT-001', 60, 505000],
      ['VT-002', 80, 305000],
      ['VT-023', 60, 89000],
    ],
  },
  {
    id: 'po-02',
    code: `PN-${year()}-02`,
    supplierId: 'sup-02',
    projectId: 'prj-02',
    status: 'RECEIVED',
    createdOffset: -30,
    receivedOffset: -27,
    note: 'Sơn lót & sơn phủ cho nhà phố Tây Hồ.',
    items: [
      ['VT-004', 14, 1420000],
      ['VT-005', 10, 1820000],
      ['VT-006', 25, 315000],
    ],
  },
  {
    id: 'po-03',
    code: `PN-${year()}-03`,
    supplierId: 'sup-04',
    projectId: 'prj-02',
    status: 'ORDERED',
    createdOffset: -9,
    note: 'Gỗ MDF An Cường cho tủ bếp & tủ quần áo tầng 2–3.',
    items: [
      ['VT-009', 40, 775000],
      ['VT-010', 200, 82000],
      ['VT-011', 30, 310000],
    ],
  },
  {
    id: 'po-04',
    code: `PN-${year()}-04`,
    supplierId: 'sup-05',
    projectId: 'prj-02',
    status: 'ORDERED',
    createdOffset: -5,
    note: 'Đá granite mặt bàn bếp & bậc tam cấp.',
    items: [
      ['VT-012', 10, 2420000],
    ],
  },
  {
    id: 'po-05',
    code: `PN-${year()}-05`,
    supplierId: 'sup-06',
    projectId: 'prj-07',
    status: 'DRAFT',
    createdOffset: -2,
    note: 'Dự kiến thiết bị vệ sinh căn hộ Sunshine (chờ chốt mẫu).',
    items: [
      ['VT-016', 2, 4150000],
      ['VT-027', 2, 2760000],
      ['VT-028', 2, 3050000],
    ],
  },
  {
    id: 'po-06',
    code: `PN-${year()}-06`,
    supplierId: 'sup-03',
    projectId: 'prj-01',
    status: 'CANCELLED',
    createdOffset: -20,
    note: 'Huỷ do đổi sang nhà cung cấp khác có giá tốt hơn.',
    items: [
      ['VT-007', 100, 142000],
      ['VT-008', 80, 63000],
    ],
  },
];

interface SeedIssue {
  id: string;
  code: string;
  projectId: string;
  createdOffset: number;
  note?: string;
  items: Array<[string, number]>;
}

const MATERIAL_ISSUES: SeedIssue[] = [
  {
    id: 'is-01',
    code: `PX-${year()}-01`,
    projectId: 'prj-01',
    createdOffset: -37,
    note: 'Xuất gạch & xi măng lát sàn phòng khách.',
    items: [
      ['VT-001', 34],
      ['VT-023', 30],
      ['VT-024', 3],
    ],
  },
  {
    id: 'is-02',
    code: `PX-${year()}-02`,
    projectId: 'prj-01',
    createdOffset: -28,
    note: 'Thạch cao & khung xương làm trần phòng khách, bếp.',
    items: [
      ['VT-007', 70],
      ['VT-008', 45],
    ],
  },
  {
    id: 'is-03',
    code: `PX-${year()}-03`,
    projectId: 'prj-01',
    createdOffset: -14,
    note: 'Thiết bị điện & nước cho căn hộ Green Bay.',
    items: [
      ['VT-014', 6],
      ['VT-015', 40],
      ['VT-018', 40],
      ['VT-029', 22],
    ],
  },
  {
    id: 'is-04',
    code: `PX-${year()}-04`,
    projectId: 'prj-02',
    createdOffset: -26,
    note: 'Vật tư thô tầng 1: xi măng, cát, gạch Granite.',
    items: [
      ['VT-001', 62],
      ['VT-023', 70],
      ['VT-024', 6],
    ],
  },
  {
    id: 'is-05',
    code: `PX-${year()}-05`,
    projectId: 'prj-02',
    createdOffset: -18,
    note: 'Điện nước toàn nhà: dây Cadivi, ống PPR, ống thoát.',
    items: [
      ['VT-014', 14],
      ['VT-015', 70],
      ['VT-029', 40],
    ],
  },
  {
    id: 'is-06',
    code: `PX-${year()}-06`,
    projectId: 'prj-02',
    createdOffset: -10,
    note: 'Thạch cao & khung xương trần tầng 1–2.',
    items: [
      ['VT-007', 120],
      ['VT-008', 90],
    ],
  },
  {
    id: 'is-07',
    code: `PX-${year()}-07`,
    projectId: 'prj-02',
    createdOffset: -4,
    note: 'Sơn lót & phụ kiện hoàn thiện tầng 1.',
    items: [
      ['VT-004', 9],
      ['VT-006', 18],
    ],
  },
  {
    id: 'is-08',
    code: `PX-${year()}-08`,
    projectId: 'prj-05',
    createdOffset: -120,
    note: 'Gạch, sơn & đèn cho shop thời trang Nguyễn Trãi.',
    items: [
      ['VT-001', 40],
      ['VT-002', 55],
      ['VT-018', 60],
    ],
  },
  {
    id: 'is-09',
    code: `PX-${year()}-09`,
    projectId: 'prj-05',
    createdOffset: -95,
    note: 'Thiết bị WC & kính cường lực shop.',
    items: [
      ['VT-016', 2],
      ['VT-025', 8],
    ],
  },
  {
    id: 'is-10',
    code: `PX-${year()}-10`,
    projectId: 'prj-07',
    createdOffset: -12,
    note: 'Vật tư khởi công: dây điện, ống nước, thạch cao.',
    items: [
      ['VT-014', 5],
      ['VT-015', 32],
      ['VT-007', 45],
      ['VT-008', 30],
    ],
  },
];

// ---------------- Giao dịch thu/chi ----------------
interface SeedReceipt {
  id: string;
  projectId?: string;
  milestoneId?: string;
  amountVnd: number;
  method: Transaction['method'];
  at: string;
  payerName?: string;
  note?: string;
}

interface SeedPayment {
  id: string;
  projectId?: string;
  category: Transaction['category'];
  partyId?: string;
  amountVnd: number;
  method: Transaction['method'];
  at: string;
  receiverName: string;
  note?: string;
}

function buildReceipts(milestones: Milestone[], projectsById: Map<string, SeedProject>): SeedReceipt[] {
  const receipts: SeedReceipt[] = [];
  let index = 1;
  for (const milestone of milestones) {
    if (milestone.paidVnd <= 0) continue;
    const project = projectsById.get(milestone.projectId);
    receipts.push({
      id: `pt-${String(index).padStart(2, '0')}`,
      projectId: milestone.projectId,
      milestoneId: milestone.id,
      amountVnd: milestone.paidVnd,
      method: index % 3 === 0 ? 'CASH' : 'TRANSFER',
      at: at(milestone.seq === 1 ? -Math.abs((project?.startOffset ?? -30) + 2) : -(28 - milestone.seq * 4), 10, 30),
      payerName: project ? CUSTOMERS.find((c) => c.id === project.customerId)?.name : undefined,
      note: `Thu theo ${milestone.name}`,
    });
    index += 1;
  }
  receipts.push(
    {
      id: `pt-${String(index).padStart(2, '0')}`,
      amountVnd: 45000000,
      method: 'TRANSFER',
      at: at(-21, 15, 10),
      payerName: 'Chị Mai Anh',
      note: 'Thu phí thiết kế 3D căn hộ Ciputra (chưa ký thi công)',
    },
    {
      id: `pt-${String(index + 1).padStart(2, '0')}`,
      amountVnd: 15000000,
      method: 'CASH',
      at: at(-7, 16, 0),
      payerName: 'Anh Đức Thắng',
      note: 'Thu phát sinh sửa biển hiệu shop',
    },
  );
  return receipts;
}

const PAYMENTS: SeedPayment[] = [
  { id: 'pc-01', projectId: 'prj-01', category: 'SUPPLIER', partyId: 'sup-01', amountVnd: 68000000, method: 'TRANSFER', at: at(-36, 9, 20), receiverName: 'Cty VLXD Hà Thành', note: 'Thanh toán PN vật tư thô căn hộ Green Bay' },
  { id: 'pc-02', projectId: 'prj-01', category: 'SUBCONTRACTOR', partyId: 'sup-10', amountVnd: 45000000, method: 'TRANSFER', at: at(-24, 10, 0), receiverName: 'Thầu mộc anh Phú', note: 'Tạm ứng thi công tủ bếp & kệ tivi' },
  { id: 'pc-03', projectId: 'prj-01', category: 'LABOR', amountVnd: 28000000, method: 'CASH', at: at(-8, 17, 30), receiverName: 'Tổ thợ công trình Green Bay', note: 'Thanh toán lương công nhật kỳ 1' },
  { id: 'pc-04', projectId: 'prj-02', category: 'SUPPLIER', partyId: 'sup-02', amountVnd: 52000000, method: 'TRANSFER', at: at(-26, 9, 45), receiverName: 'Đại lý sơn Jotun Hà Nội', note: 'Thanh toán sơn lót & sơn phủ' },
  { id: 'pc-05', projectId: 'prj-02', category: 'SUPPLIER', partyId: 'sup-01', amountVnd: 78000000, method: 'TRANSFER', at: at(-22, 14, 10), receiverName: 'Cty VLXD Hà Thành', note: 'Thanh toán gạch & xi măng tầng 1–2' },
  { id: 'pc-06', projectId: 'prj-02', category: 'SUBCONTRACTOR', partyId: 'sup-07', amountVnd: 42000000, method: 'TRANSFER', at: at(-18, 15, 0), receiverName: 'Tổ điện anh Dũng', note: 'Tạm ứng 50% khối lượng điện' },
  { id: 'pc-07', projectId: 'prj-02', category: 'SUBCONTRACTOR', partyId: 'sup-08', amountVnd: 35000000, method: 'TRANSFER', at: at(-15, 11, 20), receiverName: 'Tổ nước anh Hoàn', note: 'Tạm ứng thi công nước tầng 1–2' },
  { id: 'pc-08', projectId: 'prj-02', category: 'SUBCONTRACTOR', partyId: 'sup-12', amountVnd: 30000000, method: 'CASH', at: at(-9, 16, 45), receiverName: 'Thạch cao anh Cường', note: 'Thanh toán khối lượng trần tầng 1' },
  { id: 'pc-09', projectId: 'prj-02', category: 'LABOR', amountVnd: 62000000, method: 'CASH', at: at(-6, 17, 15), receiverName: 'Tổ thợ công trình Tây Hồ', note: 'Thanh toán lương công nhật tháng này' },
  { id: 'pc-10', projectId: 'prj-07', category: 'SUBCONTRACTOR', partyId: 'sup-07', amountVnd: 22000000, method: 'TRANSFER', at: at(-10, 10, 30), receiverName: 'Tổ điện anh Dũng', note: 'Tạm ứng thi công điện căn hộ Sunshine' },
  { id: 'pc-11', projectId: 'prj-07', category: 'SUPPLIER', partyId: 'sup-03', amountVnd: 26000000, method: 'TRANSFER', at: at(-8, 9, 15), receiverName: 'Cty Thạch cao Vĩnh Tường', note: 'Thanh toán thạch cao & khung xương' },
  { id: 'pc-12', projectId: 'prj-05', category: 'SUBCONTRACTOR', partyId: 'sup-10', amountVnd: 48000000, method: 'TRANSFER', at: at(-80, 14, 0), receiverName: 'Thầu mộc anh Phú', note: 'Quyết toán kệ trưng bày & quầy thu ngân' },
  { id: 'pc-13', projectId: 'prj-05', category: 'SUPPLIER', partyId: 'sup-06', amountVnd: 18500000, method: 'TRANSFER', at: at(-76, 15, 20), receiverName: 'Thiết bị vệ sinh TOTO', note: 'Thanh toán thiết bị WC shop' },
  { id: 'pc-14', projectId: 'prj-05', category: 'LABOR', amountVnd: 34000000, method: 'CASH', at: at(-58, 17, 0), receiverName: 'Tổ thợ shop Nguyễn Trãi', note: 'Chốt lương công nhật công trình shop' },
  { id: 'pc-15', projectId: 'prj-06', category: 'SUBCONTRACTOR', partyId: 'sup-09', amountVnd: 24000000, method: 'TRANSFER', at: at(-64, 10, 0), receiverName: 'Thầu sơn chị Lan', note: 'Bảo hành sơn lại mối nối trần' },
  { id: 'pc-16', projectId: 'prj-06', category: 'SUPPLIER', partyId: 'sup-04', amountVnd: 96000000, method: 'TRANSFER', at: at(-150, 9, 0), receiverName: 'Gỗ An Cường — miền Bắc', note: 'Thanh toán gỗ MDF đợt 2 nhà phố Ecopark' },
  { id: 'pc-17', projectId: 'prj-06', category: 'LABOR', amountVnd: 58000000, method: 'CASH', at: at(-100, 17, 30), receiverName: 'Tổ thợ Ecopark', note: 'Thanh toán lương hoàn thiện' },
  { id: 'pc-18', category: 'OTHER_OUT', amountVnd: 12000000, method: 'CASH', at: at(-19, 14, 0), receiverName: 'Văn phòng KhoaDev', note: 'Chi phí văn phòng & in ấn hồ sơ thiết kế' },
  { id: 'pc-19', category: 'OTHER_OUT', amountVnd: 8500000, method: 'TRANSFER', at: at(-11, 10, 45), receiverName: 'Taxi tải & vận chuyển', note: 'Chi phí vận chuyển vật tư liên công trình' },
  { id: 'pc-20', projectId: 'prj-02', category: 'SUPPLIER', partyId: 'sup-05', amountVnd: 40000000, method: 'TRANSFER', at: at(-3, 16, 0), receiverName: 'Đá Hoa Cương Việt', note: 'Tạm ứng đá mặt bàn bếp & bậc tam cấp' },
  { id: 'pc-21', projectId: 'prj-01', category: 'SUPPLIER', partyId: 'sup-06', amountVnd: 31000000, method: 'TRANSFER', at: at(-2, 15, 30), receiverName: 'Thiết bị vệ sinh TOTO', note: 'Tạm ứng thiết bị vệ sinh căn hộ' },
  { id: 'pc-22', projectId: 'prj-02', category: 'SUBCONTRACTOR', partyId: 'sup-11', amountVnd: 18000000, method: 'CASH', at: at(-1, 11, 0), receiverName: 'Đá anh Thắng', note: 'Tạm ứng thi công đá bậc tam cấp' },
];

// ---------------- Biên bản & bảo hành ----------------
const HANDOVER_CHECKLIST: string[] = [
  'Phòng khách — trần thạch cao giật cấp hắt sáng đạt yêu cầu',
  'Phòng khách — sơn nước màu trắng ghi đều màu, không lỗi bề mặt',
  'Khu trưng bày — kệ MDF phủ melamine chắc chắn, cánh đóng mở êm',
  'Khu trưng bày — hệ đèn rọi hoạt động đủ sáng',
  'Quầy thu ngân — khóa tủ & ngăn kéo hoạt động tốt',
  'WC — thiết bị TOTO lắp đặt đúng cao độ, không rò nước',
  'Mặt tiền — cửa nhôm kính, biển hiệu hoạt động tốt',
  'Toàn bộ — vệ sinh sạch sẽ, bàn giao chìa khóa & hồ sơ hoàn công',
];

export async function ensureSeed(): Promise<{ seeded: boolean }> {
  await db.open();
  const meta = await db.appMeta.get('seedVersion');
  if (meta?.value === SEED_VERSION) {
    return { seeded: false };
  }
  const seeded = await seedDatabase();
  return { seeded };
}

export async function seedDatabase(): Promise<boolean> {
  return db.transaction('rw', db.tables, async () => {
    const meta = await db.appMeta.get('seedVersion');
    if (meta?.value === SEED_VERSION) {
      return false;
    }
    for (const table of db.tables) {
      await table.clear();
    }
    await runSeed();
    await db.appMeta.put({ key: 'seedVersion', value: SEED_VERSION });
    await db.appMeta.put({ key: 'seededAt', value: nowIso() });
    await db.appMeta.put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    return true;
  });
}

async function runSeed(): Promise<void> {
  const now = nowIso();

  // ---------- Cấu hình ----------
  await db.settings.bulkPut([
    { key: SETTING_KEYS.COMPANY_INFO, value: DEFAULT_COMPANY_INFO, updatedAt: now },
    { key: SETTING_KEYS.QUOTE_CONFIG, value: DEFAULT_QUOTE_CONFIG, updatedAt: now },
    { key: SETTING_KEYS.PRINT_CONFIG, value: DEFAULT_PRINT_CONFIG, updatedAt: now },
  ]);

  // ---------- Nhân sự, chủ nhà, NCC, thợ ----------
  const employees: Employee[] = EMPLOYEES.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    role: e.role,
    phone: e.phone,
    title: e.title,
    active: true,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }));
  await db.employees.bulkAdd(employees);

  const customers: Customer[] = CUSTOMERS.map((c, index) => ({
    id: c.id,
    code: `KH-${year()}-${String(index + 1).padStart(2, '0')}`,
    name: c.name,
    searchName: buildSearchName(c.name),
    phone: c.phone,
    normalizedPhone: c.phone.replace(/\D/g, ''),
    address: c.address,
    taxCode: c.taxCode,
    note: c.note,
    active: true,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }));
  await db.customers.bulkAdd(customers);

  const suppliers: Supplier[] = SUPPLIERS.map((s, index) => ({
    id: s.id,
    code: `NCC-${String(index + 1).padStart(3, '0')}`,
    name: s.name,
    type: s.type,
    specialty: s.specialty,
    phone: s.phone,
    address: s.address,
    rating: s.rating,
    active: true,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }));
  await db.suppliers.bulkAdd(suppliers);

  const workers: Worker[] = WORKERS.map((w, index) => ({
    id: w.id,
    code: `T-${String(index + 1).padStart(3, '0')}`,
    name: w.name,
    trade: w.trade,
    employmentType: w.employmentType,
    dailyRateVnd: w.dailyRateVnd,
    phone: w.phone,
    active: true,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }));
  await db.workers.bulkAdd(workers);

  // ---------- Vật tư + tồn kho ----------
  const materials: Material[] = MATERIALS.map(([code, name, unit, avgCost, , minQty], index) => ({
    id: `mat-${String(index + 1).padStart(3, '0')}`,
    code,
    name,
    searchName: buildSearchName(`${code} ${name}`),
    unit,
    avgCostVnd: avgCost,
    minQuantity: minQty,
    active: true,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }));
  await db.materials.bulkAdd(materials);
  const materialByCode = new Map(materials.map((m) => [m.code, m]));

  const stockQty = new Map<string, number>();
  for (const [code, , , , opening] of MATERIALS) {
    const material = materialByCode.get(code);
    if (material) stockQty.set(material.id, opening);
  }

  const movements: StockMovement[] = [];

  // ---------- Phiếu mua NCC ----------
  const poItems: PurchaseOrderItem[] = [];
  for (const seedPo of PURCHASE_ORDERS) {
    const totalVnd = seedPo.items.reduce((sum, [, qty, cost]) => sum + Math.round(qty * cost), 0);
    const po: PurchaseOrder = {
      id: seedPo.id,
      code: seedPo.code,
      supplierId: seedPo.supplierId,
      projectId: seedPo.projectId,
      status: seedPo.status,
      totalVnd,
      itemCount: seedPo.items.length,
      createdAt: at(seedPo.createdOffset, 9, 30),
      receivedAt: seedPo.receivedOffset != null ? at(seedPo.receivedOffset, 15, 0) : undefined,
      note: seedPo.note,
      createdBy: 'emp-accountant',
      revision: 1,
    };
    await db.purchaseOrders.add(po);
    for (const [code, qty, cost] of seedPo.items) {
      const material = materialByCode.get(code);
      if (!material) continue;
      poItems.push({ id: newId(), poId: po.id, materialId: material.id, quantity: qty, unitCostVnd: cost });
      if (seedPo.status === 'RECEIVED') {
        const current = stockQty.get(material.id) ?? 0;
        const newQty = current + qty;
        const newAvg = Math.round((current * material.avgCostVnd + qty * cost) / newQty);
        stockQty.set(material.id, newQty);
        material.avgCostVnd = newAvg;
        movements.push({
          id: newId(),
          materialId: material.id,
          type: 'RECEIPT',
          quantity: qty,
          unitCostVnd: cost,
          warehouseId: WAREHOUSE_ID,
          refType: 'PURCHASE',
          refId: po.id,
          at: po.receivedAt ?? now,
          note: `Nhập theo phiếu ${po.code}`,
        });
      }
    }
  }
  await db.purchaseOrderItems.bulkAdd(poItems);
  await db.materials.bulkPut(materials);

  // ---------- Phiếu xuất công trình ----------
  const issueItems: MaterialIssueItem[] = [];
  for (const seedIssue of MATERIAL_ISSUES) {
    const issueId = seedIssue.id;
    let totalVnd = 0;
    const rows: MaterialIssueItem[] = [];
    for (const [code, qty] of seedIssue.items) {
      const material = materialByCode.get(code);
      if (!material) continue;
      const current = stockQty.get(material.id) ?? 0;
      const issued = Math.min(qty, current);
      stockQty.set(material.id, current - issued);
      const unitCost = material.avgCostVnd;
      totalVnd += Math.round(issued * unitCost);
      rows.push({ id: newId(), issueId, materialId: material.id, quantity: issued, unitCostVnd: unitCost });
      movements.push({
        id: newId(),
        materialId: material.id,
        type: 'ISSUE',
        quantity: -issued,
        unitCostVnd: unitCost,
        warehouseId: WAREHOUSE_ID,
        projectId: seedIssue.projectId,
        refType: 'ISSUE',
        refId: issueId,
        at: at(seedIssue.createdOffset, 8, 30),
        note: `Xuất cho công trình theo phiếu ${seedIssue.code}`,
      });
    }
    const issue: MaterialIssue = {
      id: issueId,
      code: seedIssue.code,
      projectId: seedIssue.projectId,
      totalVnd,
      itemCount: rows.length,
      createdAt: at(seedIssue.createdOffset, 8, 30),
      note: seedIssue.note,
      createdBy: 'emp-site',
      createdByName: 'Lê Quốc Bảo',
      revision: 1,
    };
    await db.materialIssues.add(issue);
    issueItems.push(...rows);
  }
  await db.materialIssueItems.bulkAdd(issueItems);

  // ---------- Kiểm kê điều chỉnh ----------
  const adjustments: Array<[string, number, string, number]> = [
    ['VT-005', -2, 'Kiểm kê thực tế thiếu 2 thùng do hao hụt khi pha màu', -3],
    ['VT-013', 40, 'Nhập bù tay nắm inox từ lô hàng trả về', -6],
    ['VT-021', -3, 'Kiểm kê keo dán gạch hết hạn sử dụng', -12],
  ];
  for (const [code, delta, reason, offset] of adjustments) {
    const material = materialByCode.get(code);
    if (!material) continue;
    const current = stockQty.get(material.id) ?? 0;
    const next = Math.max(0, current + delta);
    stockQty.set(material.id, next);
    movements.push({
      id: newId(),
      materialId: material.id,
      type: 'ADJUST',
      quantity: next - current,
      unitCostVnd: material.avgCostVnd,
      warehouseId: WAREHOUSE_ID,
      refType: 'ADJUST',
      refId: material.id,
      at: at(offset, 16, 0),
      note: reason,
    });
  }

  const stocks: Stock[] = materials.map((material) => ({
    id: `${WAREHOUSE_ID}::${material.id}`,
    warehouseId: WAREHOUSE_ID,
    materialId: material.id,
    quantity: stockQty.get(material.id) ?? 0,
  }));
  await db.stocks.bulkAdd(stocks);
  await db.stockMovements.bulkAdd(movements);

  // ---------- Dự án & đợt thanh toán ----------
  const projectSeedById = new Map(PROJECTS.map((p) => [p.id, p]));
  const milestones: Milestone[] = [];

  for (const seed of PROJECTS) {
    const project: Project = {
      id: seed.id,
      code: seed.code,
      name: seed.name,
      customerId: seed.customerId,
      category: seed.category,
      status: seed.status,
      address: seed.address,
      contractValueVnd: seed.target,
      startDate: key(seed.startOffset),
      handoverDate: key(seed.handoverOffset),
      managerId: seed.managerId,
      designerId: seed.designerId,
      note: seed.note,
      createdAt: at(seed.startOffset - 3, 10, 0),
      updatedAt: at(-1, 17, 0),
      createdBy: 'emp-sales',
      revision: 1,
    };
    await db.projects.add(project);

    if (seed.target > 0) {
      const pcts = [30, 30, 30, 10];
      const labels = ['Tạm ứng ký hợp đồng', 'Thanh toán theo tiến độ', 'Nghiệm thu hoàn thiện', 'Quyết toán & bảo hành'];
      for (const [index, pct] of pcts.entries()) {
        const amountVnd = Math.round((seed.target * pct) / 100);
        const paidVnd = paidForMilestone(seed.paidRatio, index, amountVnd);
        const dueOffset = seed.startOffset + (index + 1) * 32;
        milestones.push({
          id: `${seed.id}-m${index + 1}`,
          projectId: seed.id,
          name: `Đợt ${index + 1} — ${labels[index]}`,
          pct,
          amountVnd,
          dueDate: key(dueOffset),
          paidVnd,
          seq: index + 1,
        });
      }
    }
  }
  await db.milestones.bulkAdd(milestones);

  // ---------- Hạng mục thi công ----------
  const workItems: WorkItem[] = [];
  for (const [projectId, rows] of Object.entries(PROJECT_ITEMS)) {
    for (const [zone, name, unit, quantity, status, progressPct, startOffset, endOffset, assignedTo] of rows) {
      workItems.push({
        id: newId(),
        projectId,
        zone,
        name,
        unit,
        quantity,
        assignedTo,
        startDate: key(startOffset),
        endDate: key(endOffset),
        status,
        progressPct,
        createdAt: at(startOffset - 1, 8, 0),
        updatedAt: at(-1, 16, 0),
        revision: 1,
      });
    }
  }
  await db.workItems.bulkAdd(workItems);

  // ---------- Báo giá nhiều phiên bản ----------
  const quotes: Quote[] = [];
  const quoteSections: QuoteSection[] = [];
  const quoteItems: QuoteItem[] = [];

  for (const plan of QUOTE_PLANS) {
    const raw: Array<{ sectionName: string; description: string; unit: string; quantity: number; materialCostVnd: number; laborCostVnd: number }> = [];
    for (const [sectionIndex, itemIndexes] of plan.plan) {
      const section = QUOTE_LIBRARY[sectionIndex];
      for (const itemIndex of itemIndexes) {
        const [description, unit, baseQty, materialPrice, laborPrice] = section.items[itemIndex];
        raw.push({
          sectionName: section.section,
          description,
          unit,
          quantity: Math.round(baseQty * plan.scale * 10) / 10,
          materialCostVnd: materialPrice,
          laborCostVnd: laborPrice,
        });
      }
    }
    const rawTotals = quoteTotals(raw, plan.discountPct);
    const factor = rawTotals.totalVnd > 0 ? plan.target / rawTotals.totalVnd : 1;
    const round500 = (value: number) => Math.max(0, Math.round((value * factor) / 500) * 500);

    const quoteId = `q-${plan.projectId}-v${plan.version}`;
    const sectionIdByName = new Map<string, string>();
    let seq = 0;
    for (const item of raw) {
      if (!sectionIdByName.has(item.sectionName)) {
        seq += 1;
        const sectionId = `${quoteId}-s${seq}`;
        sectionIdByName.set(item.sectionName, sectionId);
        quoteSections.push({ id: sectionId, quoteId, name: item.sectionName, seq });
      }
    }
    let sortOrder = 0;
    let subtotalVnd = 0;
    for (const item of raw) {
      sortOrder += 1;
      const materialCostVnd = round500(item.materialCostVnd);
      const laborCostVnd = round500(item.laborCostVnd);
      subtotalVnd += Math.round(item.quantity * (materialCostVnd + laborCostVnd));
      quoteItems.push({
        id: `${quoteId}-i${sortOrder}`,
        quoteId,
        sectionId: sectionIdByName.get(item.sectionName) as string,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        materialCostVnd,
        laborCostVnd,
        sortOrder,
        revision: 1,
      });
    }
    const discountVnd = Math.round((subtotalVnd * plan.discountPct) / 100);
    const totalVnd = subtotalVnd - discountVnd;
    quotes.push({
      id: quoteId,
      code: plan.code,
      projectId: plan.projectId,
      version: plan.version,
      status: plan.status,
      discountPct: plan.discountPct,
      subtotalVnd,
      totalVnd,
      itemCount: raw.length,
      createdAt: at(plan.createdOffset, 10, 0),
      updatedAt: at(plan.createdOffset + 1, 15, 0),
      sentAt: plan.status === 'SENT' || plan.status === 'APPROVED' || plan.status === 'REJECTED' ? at(plan.createdOffset + 1, 15, 0) : undefined,
      approvedAt: plan.status === 'APPROVED' ? at(plan.createdOffset + 4, 11, 0) : undefined,
      note: plan.note,
      createdBy: 'emp-sales',
      revision: 1,
    });

    // Đồng bộ giá trị hợp đồng theo báo giá được duyệt
    if (plan.status === 'APPROVED' && plan.version === 1) {
      const project = await db.projects.get(plan.projectId);
      if (project) {
        await db.projects.put({ ...project, contractValueVnd: totalVnd, revision: project.revision + 1 });
      }
    }
  }
  await db.quotes.bulkAdd(quotes);
  await db.quoteSections.bulkAdd(quoteSections);
  await db.quoteItems.bulkAdd(quoteItems);

  // ---------- Ngày công ----------
  const timesheets: Timesheet[] = [];
  const activeProjects = ['prj-01', 'prj-02', 'prj-05', 'prj-07'];
  const workerPool = ['w-01', 'w-02', 'w-03', 'w-04', 'w-05', 'w-06', 'w-07', 'w-08', 'w-09', 'w-10', 'w-11', 'w-12', 'w-13', 'w-14'];
  const dayPattern = [1, 1, 1.5, 1, 0.5];
  for (let offset = -27; offset <= 0; offset += 1) {
    const date = dayjs().add(offset, 'day');
    if (date.day() === 0) continue; // nghỉ chủ nhật
    for (const [projectIndex, projectId] of activeProjects.entries()) {
      const crew = [workerPool[(projectIndex * 3 + Math.abs(offset)) % workerPool.length], workerPool[(projectIndex * 5 + Math.abs(offset) + 4) % workerPool.length]];
      for (const [crewIndex, workerId] of crew.entries()) {
        const days = dayPattern[(Math.abs(offset) + projectIndex + crewIndex) % dayPattern.length];
        timesheets.push({
          id: newId(),
          workerId,
          projectId,
          date: date.format('YYYY-MM-DD'),
          days,
          note: days === 0.5 ? 'Làm nửa ngày buổi sáng' : undefined,
          createdAt: date.hour(17).minute(30).second(0).millisecond(0).toISOString(),
          createdBy: 'emp-site',
        });
      }
    }
  }
  await db.timesheets.bulkAdd(timesheets);

  // ---------- Thu tiền theo đợt + chi phí ----------
  const receipts = buildReceipts(milestones, projectSeedById);
  const transactions: Transaction[] = [];
  for (const [index, receipt] of receipts.entries()) {
    transactions.push({
      id: receipt.id,
      code: `PT-${year()}-${String(index + 1).padStart(2, '0')}`,
      projectId: receipt.projectId,
      type: 'IN',
      category: receipt.milestoneId ? 'MILESTONE' : 'OTHER_IN',
      milestoneId: receipt.milestoneId,
      amountVnd: receipt.amountVnd,
      method: receipt.method,
      at: receipt.at,
      payerName: receipt.payerName,
      receiverName: 'Bùi Thị Hồng',
      note: receipt.note,
      createdBy: 'emp-accountant',
      createdByName: 'Bùi Thị Hồng',
      revision: 1,
    });
  }
  for (const [index, payment] of PAYMENTS.entries()) {
    transactions.push({
      id: payment.id,
      code: `PC-${year()}-${String(index + 1).padStart(2, '0')}`,
      projectId: payment.projectId,
      type: 'OUT',
      category: payment.category,
      partyId: payment.partyId,
      amountVnd: payment.amountVnd,
      method: payment.method,
      at: payment.at,
      receiverName: payment.receiverName,
      note: payment.note,
      createdBy: 'emp-accountant',
      createdByName: 'Bùi Thị Hồng',
      revision: 1,
    });
  }
  await db.transactions.bulkAdd(transactions);

  // ---------- Biên bản nghiệm thu / bàn giao ----------
  const handovers: Handover[] = [
    {
      id: 'ho-01',
      code: `NT-${year()}-01`,
      projectId: 'prj-05',
      type: 'ACCEPTANCE',
      date: key(-20),
      receiverName: 'Anh Đức Thắng',
      result: 'PASS',
      itemCount: HANDOVER_CHECKLIST.length,
      note: 'Nghiệm thu nội bộ trước bàn giao chính thức.',
      createdBy: 'emp-site',
      createdAt: at(-20, 16, 0),
      revision: 1,
    },
    {
      id: 'ho-02',
      code: `NT-${year()}-02`,
      projectId: 'prj-05',
      type: 'HANDOVER',
      date: key(-12),
      receiverName: 'Anh Đức Thắng',
      result: 'PASS',
      itemCount: HANDOVER_CHECKLIST.length,
      note: 'Bàn giao mặt bằng kinh doanh, bắt đầu bảo hành 12 tháng.',
      createdBy: 'emp-site',
      createdAt: at(-12, 10, 30),
      revision: 1,
    },
  ];
  await db.handovers.bulkAdd(handovers);
  const handoverItems: HandoverItem[] = [];
  for (const handover of handovers) {
    HANDOVER_CHECKLIST.forEach((description, index) => {
      handoverItems.push({
        id: `${handover.id}-i${index + 1}`,
        handoverId: handover.id,
        description,
        ok: true,
        sortOrder: index + 1,
      });
    });
  }
  await db.handoverItems.bulkAdd(handoverItems);

  // ---------- Ticket bảo hành ----------
  const tickets: Ticket[] = [
    {
      id: 'tk-01',
      code: `BH-${year()}-01`,
      projectId: 'prj-05',
      description: 'Bản lề cánh tủ kệ trưng bày bị xệ sau 2 tuần sử dụng',
      severity: 'MEDIUM',
      status: 'DONE',
      createdAt: at(-10, 9, 15),
      resolvedAt: key(-8),
      note: 'Đã thay 4 bản lề giảm chấn mới, cân chỉnh lại cánh tủ.',
      createdBy: 'emp-site',
      revision: 1,
    },
    {
      id: 'tk-02',
      code: `BH-${year()}-02`,
      projectId: 'prj-06',
      description: 'Trần thạch cao phòng khách bị nứt mối nối tại vị trí giáp tường',
      severity: 'HIGH',
      status: 'PROCESSING',
      createdAt: at(-5, 14, 0),
      note: 'Đã cử thầu thạch cao xuống kiểm tra, hẹn xử lý trong tuần.',
      createdBy: 'emp-site-2',
      revision: 1,
    },
    {
      id: 'tk-03',
      code: `BH-${year()}-03`,
      projectId: 'prj-06',
      description: 'Cửa nhôm kính ban công tầng 2 khó đóng, bánh xe trượt kêu to',
      severity: 'LOW',
      status: 'NEW',
      createdAt: at(-1, 8, 45),
      createdBy: 'emp-site-2',
      revision: 1,
    },
  ];
  await db.tickets.bulkAdd(tickets);

  // ---------- Nhật ký hoạt động ----------
  const actorByName: Record<string, Employee> = Object.fromEntries(employees.map((e) => [e.id, e]));
  const logRows: Array<[string, string, string, string, number, string]> = [
    ['PROJECT', 'prj-01', 'PROJECT_CREATED', 'Tạo dự án DA căn hộ Vinhomes Green Bay – A1205', -48, 'emp-sales'],
    ['PROJECT', 'prj-02', 'PROJECT_CREATED', 'Tạo dự án nhà phố Tây Hồ 4 tầng', -63, 'emp-sales'],
    ['PROJECT', 'prj-01', 'QUOTE_APPROVED', 'Khách duyệt báo giá v1 căn hộ Green Bay', -44, 'emp-sales'],
    ['PROJECT', 'prj-02', 'QUOTE_APPROVED', 'Khách duyệt báo giá v1 nhà phố Tây Hồ', -58, 'emp-sales'],
    ['PROJECT', 'prj-01', 'CONTRACT_VALUE_APPLIED', 'Áp giá trị hợp đồng theo báo giá được duyệt', -44, 'emp-manager'],
    ['PROJECT', 'prj-01', 'RECEIPT_CREATED', 'Lập phiếu thu đợt 1 — tạm ứng ký hợp đồng', -46, 'emp-accountant'],
    ['PROJECT', 'prj-02', 'RECEIPT_CREATED', 'Lập phiếu thu đợt 1 nhà phố Tây Hồ', -61, 'emp-accountant'],
    ['PROJECT', 'prj-01', 'MATERIAL_ISSUED', 'Xuất vật tư gạch & xi măng cho căn hộ Green Bay', -37, 'emp-site'],
    ['PROJECT', 'prj-02', 'MATERIAL_ISSUED', 'Xuất dây điện, ống nước cho nhà phố Tây Hồ', -18, 'emp-site'],
    ['PROJECT', 'prj-02', 'PAYMENT_CREATED', 'Chi tạm ứng tổ điện anh Dũng 42.000.000 ₫', -18, 'emp-accountant'],
    ['PROJECT', 'prj-01', 'TIMESHEETS_SAVED', 'Ghi ngày công tuần cho công trình Green Bay', -7, 'emp-site'],
    ['PROJECT', 'prj-05', 'HANDOVER_CREATED', 'Lập biên bản bàn giao shop Nguyễn Trãi', -12, 'emp-site'],
    ['PROJECT', 'prj-06', 'TICKET_CREATED', 'Mở ticket bảo hành trần nứt mối nối phòng khách', -5, 'emp-site-2'],
    ['PROJECT', 'prj-04', 'QUOTE_SENT', 'Gửi báo giá v2 văn phòng startup Cầu Giấy', -6, 'emp-sales'],
    ['PROJECT', 'prj-07', 'MATERIAL_ISSUED', 'Xuất vật tư khởi công căn hộ Sunshine Riverside', -12, 'emp-site-2'],
    ['PROJECT', 'prj-02', 'QUOTE_SENT', 'Gửi báo giá v2 (bổ sung phòng thờ & nâng cấp bếp)', -12, 'emp-sales-2'],
    ['PROJECT', 'prj-07', 'PROJECT_STATUS_CHANGED', 'Chuyển dự án Sunshine Riverside sang Đang thi công', -16, 'emp-manager'],
    ['PROJECT', 'prj-01', 'PAYMENT_CREATED', 'Chi thanh toán NCC thiết bị vệ sinh TOTO', -2, 'emp-accountant'],
  ];
  const logs: ActivityLog[] = logRows.map(([entityType, entityId, action, summary, offset, employeeId]) => ({
    id: newId(),
    entityType,
    entityId,
    projectId: entityId.startsWith('prj-') ? entityId : undefined,
    action,
    actorId: employeeId,
    actorName: actorByName[employeeId]?.name,
    at: at(offset, 10 + (Math.abs(offset) % 6), Math.abs((offset * 7) % 60)),
    summary,
  }));
  await db.activityLogs.bulkAdd(logs);

  // ---------- Số chứng từ kế tiếp ----------
  const quoteCount = QUOTE_PLANS.length;
  await db.documentSequences.bulkPut([
    { id: `CUSTOMER::${year()}`, documentType: 'CUSTOMER', period: year(), nextValue: CUSTOMERS.length + 1 },
    { id: `PROJECT::${year()}`, documentType: 'PROJECT', period: year(), nextValue: PROJECTS.length + 1 },
    { id: `QUOTE::${year()}`, documentType: 'QUOTE', period: year(), nextValue: quoteCount + 1 },
    { id: `PURCHASE::${year()}`, documentType: 'PURCHASE', period: year(), nextValue: PURCHASE_ORDERS.length + 1 },
    { id: `ISSUE::${year()}`, documentType: 'ISSUE', period: year(), nextValue: MATERIAL_ISSUES.length + 1 },
    { id: `RECEIPT::${year()}`, documentType: 'RECEIPT', period: year(), nextValue: receipts.length + 1 },
    { id: `PAYMENT::${year()}`, documentType: 'PAYMENT', period: year(), nextValue: PAYMENTS.length + 1 },
    { id: `HANDOVER::${year()}`, documentType: 'HANDOVER', period: year(), nextValue: handovers.length + 1 },
    { id: `TICKET::${year()}`, documentType: 'TICKET', period: year(), nextValue: tickets.length + 1 },
    { id: `MATERIAL::${year()}`, documentType: 'MATERIAL', period: '', nextValue: MATERIALS.length + 1 },
    { id: `SUPPLIER::${year()}`, documentType: 'SUPPLIER', period: '', nextValue: SUPPLIERS.length + 1 },
    { id: `WORKER::${year()}`, documentType: 'WORKER', period: '', nextValue: WORKERS.length + 1 },
  ]);
}

/** Tỷ lệ đã thu từng đợt theo tỷ lệ tổng đã thu của dự án */
function paidForMilestone(paidRatio: number, index: number, amountVnd: number): number {
  if (paidRatio >= 100) return amountVnd;
  if (paidRatio >= 90) return index <= 2 ? amountVnd : 0;
  if (paidRatio >= 60) return index <= 1 ? amountVnd : 0;
  if (paidRatio >= 40) {
    if (index === 0) return amountVnd;
    // Đợt 2 quá hạn và mới thu được 1/3
    if (index === 1) return Math.round(amountVnd / 3);
    return 0;
  }
  if (paidRatio >= 30) return index === 0 ? amountVnd : 0;
  return 0;
}
