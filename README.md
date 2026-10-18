# BuildOne — Quản lý xây dựng & nội thất

Ứng dụng quản lý công ty thiết kế – thi công nội thất & xây dựng (D&B) xây dựng theo tài liệu đặc tả `docs/PRD.md`: React + Vite + TypeScript, Ant Design, SCSS Modules và Dexie (lưu trữ cục bộ trên trình duyệt).

- **Website:** khoadev.vn
- **Email liên hệ:** khoadev.company@gmail.com
- **Địa chỉ triển khai dự kiến:** https://build.khoadev.vn

## Chạy dự án

```bash
npm install
npm run dev       # chạy môi trường phát triển
npm run build     # kiểm tra TypeScript và build sản phẩm (thư mục dist)
npm run lint      # kiểm tra ESLint
npm run preview   # xem bản build
```

Lần đầu mở ứng dụng, hệ thống tự khởi tạo bộ dữ liệu mẫu (10 chủ nhà, 7 dự án ở nhiều trạng thái, hạng mục theo khu vực, báo giá nhiều phiên bản, vật tư – tồn kho, nhà cung cấp/thầu phụ, thợ và ngày công, thu chi 2 tháng, biên bản nghiệm thu và ticket bảo hành) để sử dụng ngay. Dữ liệu lưu cục bộ trên trình duyệt nên tải lại trang vẫn giữ nguyên; có thể xuất/nhập bản sao lưu JSON hoặc khôi phục dữ liệu mẫu trong trang **Thiết lập**.

> Lưu ý: mọi mốc ngày trong dữ liệu mẫu là **tương đối so với thời điểm chạy** (ví dụ "5 ngày trước", "bàn giao sau 35 ngày") nên dashboard luôn có số liệu sống, có đợt thu quá hạn và đợt thu tới hạn.

## Phạm vi đã triển khai

| Nhóm | Nội dung |
|---|---|
| Tổng quan | 6 thẻ KPI (dự án đang thi công, giá trị HĐ đang chạy, đã thu tháng, phải thu còn lại, tiến độ trung bình, công nợ NCC/thầu phụ), 4 thẻ dòng tiền, biểu đồ thu–chi 6 tuần, tiến độ từng dự án, cảnh báo cần xử lý, đợt thanh toán tới hạn và hoạt động gần đây |
| Dự án | Danh sách dạng card grid có bộ lọc; tạo dự án kèm chủ nhà (tạo nhanh) và tuỳ chọn sinh 4 đợt thanh toán 30/30/30/10; trang chi tiết 6 tab |
| Chi tiết dự án | Tổng quan (đợt thanh toán + thu tiền nhanh + dòng tiền + ticket), Hạng mục theo khu vực (cập nhật % nhanh), Báo giá nhiều phiên bản, Vật tư đã xuất, Thanh toán thu–chi, Nhật ký |
| Báo giá | Editor full-page theo nhóm hạng mục (đơn giá vật tư + đơn giá nhân công, chiết khấu, tổng trước/sau chiết khấu), lưu nháp – gửi khách – khách duyệt (kèm áp vào giá trị HĐ) – từ chối – thay thế phiên bản – xoá nháp, so sánh nhanh tổng tiền, in A4 |
| Thi công | Bảng hạng mục xuyên dự án với cập nhật tiến độ inline, thống kê đang làm/quá hạn/xong tuần này |
| Nghiệm thu & bảo hành | Biên bản nghiệm thu/bàn giao có checklist prefill từ hạng mục đã xong + in A4; ticket bảo hành theo mức độ và trạng thái |
| Vật tư & kho | Danh mục & tồn kho (kiểm kê nhanh có lý do), phiếu mua NCC (nhận hàng cộng tồn + giá bình quân + công nợ), phiếu xuất công trình (chặn vượt tồn), phiếu kho tổng hợp có bộ lọc |
| NCC & thầu phụ | Bảng có loại, chuyên môn, đánh giá sao sửa được, tổng mua – đã trả – còn nợ; drawer chi tiết với lịch sử mua/thanh toán và nút thanh toán |
| Nhân công | Danh sách thợ theo nghề/loại/đơn giá ngày công; nhập ngày công theo ngày cho nhiều thợ; tổng hợp lương tháng (expand theo dự án) + xuất CSV |
| Tài chính | Phiếu thu (gắn đợt, chặn thu vượt), phiếu chi (NCC/thầu phụ/nhân công/khác), sổ quỹ theo ngày có tồn lũy kế, công nợ hai chiều |
| Báo cáo | Lợi nhuận tạm tính theo dự án, chi phí vật tư theo dự án/tháng, top vật tư, công & lương theo thợ/nghề, tiến độ (dự án trễ bàn giao, hạng mục quá hạn, lead time); xuất CSV từng bảng |
| Thiết lập | Thông tin công ty (dùng cho mẫu in), cấu hình VAT/chiết khấu/tỷ lệ đợt, mẫu in, sao lưu – khôi phục JSON, khôi phục dữ liệu mẫu, thông tin KhoaDev |

## Vai trò & phân quyền

| Vai trò | Mã | Trang mặc định | Phạm vi chính |
|---|---|---|---|
| Giám đốc | MANAGER | /dashboard | Toàn quyền |
| Kinh doanh & thiết kế | SALES | /projects | Dự án, chủ nhà, báo giá; xem vật tư & NCC |
| Chỉ huy trưởng | SITE_MANAGER | /work-items | Hạng mục, xuất vật tư, ngày công, nghiệm thu, bảo hành |
| Kế toán | ACCOUNTANT | /finance | Thu chi, công nợ, NCC, mua hàng, báo cáo |

Phân quyền được kiểm tra ở cả hai lớp: ẩn menu + `Guard` theo route và `assertPermission` trong tầng service (ví dụ chỉ chỉ huy trưởng/giám đốc cập nhật tiến độ hạng mục, chỉ kế toán lập phiếu thu/chi).

## Kiến trúc

```text
src/
  app/           # router (HashRouter + Guard), providers, theme AntD, ngữ cảnh vai trò
  layouts/       # khung giao diện chính (sider tối #29221a, header, tìm kiếm toàn cục, chuyển vai trò)
  modules/       # trang theo nghiệp vụ (dashboard, projects + tabs, quote editor, work-items, handovers, materials, suppliers, workers, finance, reports, settings)
  components/    # thành phần dùng chung (PageHeader, StatusTag, MoneyDisplay, PrintPreview, PrintLetterhead, GlobalSearch)
  db/            # kết nối Dexie, lược đồ bảng và dữ liệu mẫu (ngày tương đối)
  repositories/  # truy vấn tổng hợp phục vụ danh sách/dashboard/báo cáo + CSV
  services/      # nghiệp vụ: kiểm tra quyền, mã chứng từ, transaction, chống ghi trùng, sao lưu
  types/         # kiểu dữ liệu dùng chung
  utils/         # định dạng tiền/ngày, tính tiền báo giá, trạng thái, chuẩn hoá tìm kiếm
  styles/        # style toàn cục + mẫu in A4 (.print-root)
```

Luồng: **Trang/Form → Service nghiệp vụ → Repository → Dexie (IndexedDB)**. Các thao tác ghi nhiều bảng chạy trong một `db.transaction`, kèm `logActivity` và `operationId` chống ghi trùng khi bấm lặp; tồn kho và số tiền còn lại của đợt được kiểm tra lại ngay tại thời điểm ghi.

Chứng từ: `DA-` (dự án), `BG-` (báo giá), `PN-` (phiếu mua), `PX-` (phiếu xuất), `PT-` (phiếu thu), `PC-` (phiếu chi), `NT-` (nghiệm thu/bàn giao), `BH-` (bảo hành), cấp số tự động theo năm.

## Quy trình nghiệp vụ chính

```text
Khách & nhu cầu → Tạo dự án → Thiết kế & Báo giá (vật tư + nhân công, duyệt phiên bản, in A4, áp vào giá trị HĐ)
→ Ký hợp đồng & 4 đợt thanh toán 30/30/30/10 → Thi công: hạng mục theo khu vực → xuất vật tư + ghi ngày công
→ Nghiệm thu từng hạng mục (biên bản) → Thu theo đợt / Chi NCC – thầu phụ – nhân công
→ Bàn giao → Bảo hành & khiếu nại → Báo cáo lợi nhuận tạm tính theo dự án
```

## Ghi chú vận hành

- Dữ liệu thuộc vùng lưu trữ của tên miền/cổng truy cập hiện tại; đổi địa chỉ truy cập có thể tạo vùng dữ liệu khác.
- Nên xuất bản sao lưu trước khi khôi phục dữ liệu mẫu — thao tác này xoá toàn bộ dữ liệu đang lưu trong trình duyệt.
- Công thức dùng trong báo cáo: thành tiền dòng báo giá = khối lượng × (đơn giá vật tư + đơn giá nhân công); công nợ NCC = tổng phiếu mua **đã nhận** − tổng phiếu chi cho đối tượng; lợi nhuận tạm tính = tổng phiếu thu − (vật tư xuất công trình + nhân công theo ngày công + chi khác).
- Giá bình quân vật tư cập nhật theo từng lần nhận hàng để phản ánh sát giá thực tế; kiểm kê điều chỉnh luôn yêu cầu lý do.
- Mẫu in A4 (`.print-root`): báo giá theo nhóm hạng mục, biên bản nghiệm thu/bàn giao, phiếu thu/phiếu chi.
