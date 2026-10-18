# BuildOne — Xây dựng & Nội thất (thiết kế – thi công)

## 1. Định vị

- **Tên sản phẩm:** BuildOne
- **Mô tả ngắn:** Hệ thống quản lý công ty thiết kế – thi công nội thất & xây dựng: dự án, báo giá – dự toán, tiến độ hạng mục, vật tư công trình, nhân công, dòng tiền theo đợt và nghiệm thu – bảo hành.
- **Địa chỉ triển khai:** https://build.khoadev.vn
- **Màu chủ đạo:** `#a16207` (vàng đồng / gold). Sider tối `#29221a`, trigger `#1f1a13`, body `#f7f4ee`, table header `#f5efe5`.
- **Favicon:** SVG inline chữ **B** nền `#a16207`. Tiêu đề trang: `BuildOne — Quản lý xây dựng & nội thất`.
- **Ngôn ngữ:** tiếng Việt 100%.
- **Bối cảnh seed:** Công ty thiết kế – thi công nội thất nhà phố / căn hộ / văn phòng / shop (D&B) tại Hà Nội.

## 2. Nền tảng kỹ thuật (bắt buộc)

- React 19 + TypeScript + Vite 8 + Ant Design 6 + dayjs + Dexie 4 (IndexedDB) + SCSS Modules + react-router-dom 7 (**HashRouter**).
- **Dự án mẫu tham chiếu — đọc kỹ và bắt chước kiến trúc + phong cách:** `C:\Users\khoadev\Desktop\Code\Khoadev\gara`
  - `src/app/theme.ts`, `src/app/providers.tsx`, `src/app/RoleContext.tsx`, `src/app/router.tsx`
  - `src/layouts/MainLayout/` (sider tối + header trắng + tìm kiếm toàn cục + chuyển vai trò)
  - `src/components/` (PageHeader, StatusTag, GlobalSearch...)
  - `src/db/database.ts` + `src/db/seed.ts` (seed phong phú, **ngày tương đối so với hiện tại**)
  - `src/services/` (core: nextCode/logActivity/settings; errors: BusinessError; permissions; backup) và `src/repositories/`
  - `src/styles/global.scss` (page-content, page-toolbar, table-scroll-x, print-root A4)
  - `src/modules/quotations/` (**editor báo giá nhiều dòng + in A4 — tham chiếu chính**), `modules/dashboard/`, `modules/reports/`, `modules/settings/`
- **Copy nguyên từ gara (đổi tên):** `package.json` (đổi `name` thành `build`), `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `.gitignore`, `vite.config.ts`, `vercel.json` (`rewrites` về `/`). Viết mới `index.html` (title + favicon riêng, `lang="vi"`).
- **npm:** dùng `npm.cmd` (PowerShell chặn `npm.ps1`). **Bắt buộc build sạch:** `npm.cmd run build` (chạy `tsc -b && vite build`) không lỗi, không biến thừa (`noUnusedLocals`/`noUnusedParameters`).
- `verbatimModuleSyntax: true` → import type phải dùng `import type`.
- Tiền VND: `formatMoney` kiểu `12.345 ₫`; ngày `dd/MM/yyyy HH:mm`. Dùng `App.useApp()` cho message/modal. AntD 6: `<Alert title=...>`, `Space orientation="vertical"`, `Tabs items=[...]`, `Popover styles={{ content: ... }}`.
- Không gọi API ngoài, không backend — toàn bộ dữ liệu Dexie, seed tự sinh khi mở lần đầu (có `ensureSeed()` + Settings cho sao lưu/khôi phục/khôi phục dữ liệu mẫu).

## 3. Vai trò & phân quyền

| Vai trò | Mã | Trang mặc định |
|---|---|---|
| Giám đốc | MANAGER | /dashboard |
| Kinh doanh & thiết kế | SALES | /projects |
| Chỉ huy trưởng | SITE_MANAGER | /work-items |
| Kế toán | ACCOUNTANT | /finance |

- MANAGER: toàn quyền. SALES: dashboard, /projects (tạo/sửa dự án + báo giá), /materials (xem), /suppliers (xem). SITE_MANAGER: dashboard, /projects (xem), /work-items, /handovers, /workers, /materials, /reports (tiến độ). ACCOUNTANT: dashboard, /finance, /suppliers, /workers (tổng hợp lương), /reports, /projects (xem).
- Phân quyền ở tầng route (Guard như gara) + ẩn menu theo vai trò.

## 4. Menu & màn hình

```
Tổng quan    → /dashboard
Dự án        → /projects, /projects/:id  (+ báo giá trong tab, editor riêng /projects/:id/quote/:quoteId)
Thi công     → /work-items, /handovers
Vật tư & NCC → /materials, /suppliers
Nhân công    → /workers
Tài chính    → /finance
Quản trị     → /reports, /settings
```

### 4.1 /dashboard — Tổng quan
- KPI row: **Dự án đang thi công**, **Giá trị HĐ đang chạy** (Σ contractValue các dự án trạng thái Thi công/Nghiệm thu), **Đã thu tháng này**, **Phải thu còn lại** (Σ đợt chưa thu xong), **Tiến độ trung bình** các dự án đang thi công, **Công nợ NCC/thầu phụ**.
- Money row: Dòng tiền tháng (thu / chi / chênh lệch), Chi phí vật tư 30 ngày, Lương nhân công tháng, Doanh thu lũy kế (Sổ quỹ thu).
- Biểu đồ **thu – chi 6 tuần gần nhất** (bar 2 màu tự vẽ bằng div + Tooltip) và **tiến độ từng dự án đang thi công** (Progress bars click sang dự án).
- **Cảnh báo cần xử lý**: đợt thanh toán quá hạn (5), dự án sắp đến ngày bàn giao (5), hạng mục quá hạn chưa xong, ticket bảo hành mới.
- **Đợt thanh toán tới hạn** (5) + **Hoạt động gần đây** (8).

### 4.2 /projects — Danh sách dự án
- **Card grid** đẹp (không dùng table): mỗi card: mã DA, tên, chủ nhà + loại (Căn hộ / Nhà phố / Biệt thự / Văn phòng / Shop), giá trị HĐ, Progress tiến độ, đã thu % (mini bar), trạng thái (Thiết kế / Báo giá / Đang thi công / Nghiệm thu / Bàn giao / Bảo hành / Đã kết thúc), chỉ huy trưởng, ngày bàn giao dự kiến (đỏ nếu quá hạn).
- Filters: trạng thái, loại, search (tên/mã/chủ nhà). Nút **Tạo dự án** (Drawer: tên, chủ nhà (select + tạo nhanh), loại, địa chỉ, chỉ huy trưởng, ngày bắt đầu/bàn giao dự kiến, ghi chú; nếu chọn "Tạo luôn 4 đợt thanh toán mẫu 30/30/30/10" thì sinh milestones).

### 4.3 /projects/:id — Chi tiết dự án (6 tabs — trọng tâm)
- **Tổng quan:** thông tin DA (chủ nhà, loại, địa chỉ, chỉ huy, ngày), Progress tiến độ tổng (từ hạng mục), giá trị HĐ; **các đợt thanh toán** (list: tên đợt, %, số tiền, hạn, đã thu Progress, trạng thái Chờ thu / Đã thu / Quá hạn; nút **Thu tiền** nhanh — modal tạo phiếu thu gắn đợt); dòng tiền DA (tổng thu/chi, chênh lệch); tickets bảo hành đang mở; nút đổi trạng thái DA (Thi công → Nghiệm thu → Bàn giao → Bảo hành → Kết thúc).
- **Hạng mục:** nhóm theo **khu vực** (Ví dụ: Phòng khách, Bếp, Phòng ngủ 1, WC...); mỗi dòng: tên việc, ĐVT, khối lượng, tổ phụ trách, thời gian, **% hoàn thành** (slider/select nhanh 0/25/50/75/100), trạng thái (Chưa làm / Đang làm / Xong / Đã nghiệm thu). Thêm/sửa/xoá. Progress tổng DA hiển thị đầu tab.
- **Báo giá:** danh sách phiên bản (v1, v2... với trạng thái Nháp / Đã gửi / Khách duyệt / Từ chối / Thay thế; tổng tiền, ngày). Nút **Tạo báo giá** / **Chỉnh sửa** → mở editor full-page `#/projects/:id/quote/:quoteId`:
  - Bảng theo **nhóm hạng mục** (Tháo dỡ & vệ sinh, Điện nước, Trần & thạch cao, Sơn & hoàn thiện, Sàn & ốp lát, Nội thất gỗ, Đá & mặt bàn, Thiết bị & khác): mỗi dòng: mô tả, ĐVT, khối lượng, **đơn giá vật tư**, **đơn giá nhân công**, thành tiền = KL × (VT + NC), xoá/sắp xếp. Thêm nhóm/dòng nhanh.
  - Cuối: chiết khấu %, tổng trước – sau chiết khấu. Chọn trạng thái. Lưu nháp / **Gửi khách** / ghi nhận **Khách duyệt** (→ có thể "Áp vào giá trị HĐ": cập nhật `contractValueVnd` = tổng báo giá sau chiết khấu) / Từ chối.
  - **In báo giá A4** (mẫu như gara: header công ty, bảng theo nhóm, tổng, chiết khấu, ghi chú, chữ ký).
  - So sánh nhanh tổng tiền giữa các phiên bản.
- **Vật tư:** Σ vật tư đã xuất cho DA (bảng: mã, tên, ĐVT, SL, đơn giá, thành tiền, ngày, người xuất) + tổng chi phí vật tư; nút **Xuất vật tư cho DA** (modal: chọn dòng từ kho tổng, SL — chặn vượt tồn → POST: trừ kho tổng, ghi movement ISSUE gắn DA).
- **Thanh toán:** 2 bảng: Thu (phiếu thu của DA: mã, ngày, đợt, số tiền, phương thức, người nhận) và Chi (phiếu chi: NCC vật tư / thầu phụ / nhân công / khác); nút **Thu** / **Chi** nhanh; tổng thu – chi – chênh lệch.
- **Nhật ký:** activityLogs gắn DA.

### 4.4 /work-items — Hạng mục & tiến độ (theo dõi toàn công ty)
- Bảng xuyên dự án: dự án, khu vực, hạng mục, ĐVT + KL, tổ, tiến độ %, trạng thái, ngày kết thúc dự kiến (đỏ nếu quá hạn & chưa xong). Filters: dự án, trạng thái, search.
- **Cập nhật nhanh inline:** chọn % (0/25/50/75/100) ngay trên dòng → lưu + log; đổi trạng thái tương ứng tự động (100% + Xong → gợi ý Nghiệm thu).
- Header stats: đang làm, quá hạn, xong tuần này.

### 4.5 /handovers — Nghiệm thu & bảo hành (2 tabs)
- **Biên bản nghiệm thu / bàn giao:** bảng (mã `NT-...`, DA, loại Nghiệm thu / Bàn giao, ngày, người nhận, kết quả Đạt / Chờ xử lý, số mục). Tạo: chọn DA + loại + người nhận + **checklist các dòng** (mô tả + đạt / không đạt + ghi chú — prefill từ hạng mục đã Xong của DA). In biên bản A4.
- **Bảo hành / khiếu nại:** bảng ticket (mã `BH-...`, DA, mô tả, mức độ Thấp / Vừa / Cao, trạng thái Mới / Đang xử lý / Đã xong, ngày mở, ngày xong). Tạo + cập nhật trạng thái + ghi chú xử lý.

### 4.6 /materials — Vật tư (4 tabs)
- **Danh mục & tồn kho:** bảng (mã, tên, ĐVT, tồn kho tổng, giá bình quân, giá trị tồn). Thêm/sửa + **kiểm kê nhanh** (nhập tồn thực tế → điều chỉnh có lý do).
- **Nhập hàng:** phiếu mua NCC (mã `PN-...`, NCC, DA gắn kèm tuỳ chọn, số dòng, tổng tiền, trạng thái Nháp / Đã đặt / Đã nhận / Huỷ). Tạo: NCC + dòng vật tư × SL × đơn giá. **Nhận hàng** → cộng tồn kho tổng, cập nhật giá bình quân, ghi movement, tăng công nợ NCC.
- **Xuất công trình:** phiếu xuất (mã `PX-...`, DA, số dòng, giá trị, ngày). Tạo như 4.3 Vật tư. Xem chi tiết Drawer.
- **Phiếu kho:** movements tổng hợp (loại Nhập / Xuất DA / Điều chỉnh, diễn giải, SL ±, giá trị, ngày), filter theo loại + DA.

### 4.7 /suppliers — Nhà cung cấp & thầu phụ
- Bảng: mã, tên, **loại** (NCC vật tư / Thầu phụ — tag), chuyên môn (với thầu phụ: Điện / Nước / Sơn / Mộc / Đá / Thạch cao / Khác), ĐT, đánh giá (Rate sao, sửa được), tổng mua/dịch vụ, đã trả, **còn nợ** (đỏ nếu > 0). Filters loại + search. Thêm/sửa.
- Drawer chi tiết: thông tin + lịch sử giao dịch (nhập hàng + phiếu chi) + nút **Thanh toán** (tạo phiếu chi gắn NCC/thầu phụ, chọn DA tuỳ chọn).

### 4.8 /workers — Nhân công & ngày công (2 tabs)
- **Nhân công:** bảng thợ (mã `T-...`, tên, nghề (Mộc / Điện / Nước / Sơn / Thạch cao / Phụ hồ), loại Cơ hữu / Khoán, đơn giá ngày công, ĐT, trạng thái). Thêm/sửa.
- **Ngày công:** filters tháng + dự án + thợ; bảng timesheet (ngày, thợ, DA, số công 0.5/1/1.5, ghi chú). Nút **Nhập ngày công** (modal: ngày + DA + nhiều dòng thợ × số công). Khối **Tổng hợp tháng**: bảng theo thợ: tổng công, đơn giá, thành tiền (expand xem theo DA); tổng cộng; nút **Xuất CSV**.

### 4.9 /finance — Tài chính (4 tabs)
- **Phiếu thu:** bảng (mã `PT-...`, ngày, DA, đợt, người nộp, số tiền, phương thức, người nhận). Tạo phiếu thu — bắt buộc chọn DA hoặc loại "Thu khác"; nếu chọn đợt → cập nhật đã thu của đợt (chặn thu vượt số tiền đợt).
- **Phiếu chi:** bảng (mã `PC-...`, ngày, DA, loại (NCC vật tư / Thầu phụ / Nhân công / Khác), người nhận, số tiền, phương thức). Tạo.
- **Sổ quỹ:** bảng theo ngày: tống thu, tổng chi, chênh lệch ngày, tồn lũy kế; filter khoảng ngày; 3 Statistic đầu trang (tổng thu – tổng chi – số dư).
- **Công nợ:** 2 khối: **Khách phải thu** (theo DA: Σ đợt còn lại, tô đậm quá hạn) và **Phải trả NCC/thầu phụ** (Σ mua − Σ chi theo từng đối tượng, đỏ nếu > 0).

### 4.10 /reports — Báo cáo (3 tabs)
- **Dự án:** bảng theo DA: giá trị HĐ, đã thu, doanh thu ghi nhận (Σ phiếu thu), chi phí (vật tư xuất + nhân công + chi khác), **lợi nhuận tạm tính** (màu đỏ/xanh), tiến độ %. Bar doanh thu-thu theo tháng.
- **Vật tư & nhân công:** chi phí vật tư theo DA/tháng + top vật tư theo giá trị xuất; công & tiền lương theo thợ/nghề/tháng.
- **Tiến độ:** dự án trễ bàn giao, hạng mục quá hạn, số ngày trung bình từ bắt đầu → bàn giao (lead time). Filter khoảng ngày + **Xuất CSV** từng bảng.

### 4.11 /settings — Thiết lập
- Thông tin công ty (tên "Nội thất KhoaDev", địa chỉ, MST, hotline, người đại diện), cấu hình (VAT mặc định, chiết khấu mặc định, tỷ lệ đợt mặc định 30/30/30/10), mẫu in (ghi chú cuối báo giá/biên bản), sao lưu / khôi phục JSON / khôi phục dữ liệu mẫu, thông tin KhoaDev (khoadev.vn — khoadev.company@gmail.com).

## 5. Mô hình dữ liệu (Dexie — gợi ý, có thể điều chỉnh nhẹ)

```
customers(id, &code, name, phone, address?, note?)                       // chủ nhà
projects(id, &code, name, customerId, category, status, address, contractValueVnd, startDate?, handoverDate?, managerId?, designerId?, note?)
workItems(id, projectId, zone, name, unit, quantity, assignedTo?, startDate?, endDate?, status, progressPct, note?)
milestones(id, projectId, name, pct, amountVnd, dueDate?, paidVnd)
quotes(id, &code, projectId, version, status, discountPct, totalVnd, createdAt, approvedAt?, note?)
quoteSections(id, quoteId, name, seq)
quoteItems(id, quoteId, sectionId, description, unit, quantity, materialCostVnd, laborCostVnd)
materials(id, &code, name, unit, avgCostVnd, active, searchName)
stocks(id, [warehouseId+materialId], warehouseId, materialId, quantity)   // warehouseId: 'kho-tong' hoặc 'da-<projectId>'
purchaseOrders(id, &code, supplierId, projectId?, status, totalVnd, createdAt, receivedAt?)
purchaseOrderItems(id, poId, materialId, quantity, unitCostVnd)
materialIssues(id, &code, projectId, totalVnd, createdAt, note?)
materialIssueItems(id, issueId, materialId, quantity, unitCostVnd)
stockMovements(id, materialId, type, quantity, unitCostVnd, warehouseId, projectId?, refType, refId, at, note?)
suppliers(id, &code, name, type, specialty?, phone, address?, rating, active)
workers(id, &code, name, trade, employmentType, dailyRateVnd, phone, active)
timesheets(id, workerId, projectId, date, days, note?)
transactions(id, &code, projectId?, type, category, partyId?, milestoneId?, amountVnd, method, at, note?, createdBy)
handovers(id, &code, projectId, type, date, receiverName, result, note?)
handoverItems(id, handoverId, description, ok, note?)
tickets(id, &code, projectId, description, severity, status, createdAt, resolvedAt?, note?)
settings(key, value)  // COMPANY_INFO, QUOTE_CONFIG, APP_META...
activityLogs(id, [entityType+entityId], at, actorName, summary, entityType, entityId)
documentSequences(id, [type+period], lastNumber)
```

- Chứng từ: `DA-` (dự án), `BG-` (báo giá), `PN-`, `PX-`, `PT-` (phiếu thu), `PC-` (phiếu chi), `NT-` (nghiệm thu), `BH-` (bảo hành).
- Thao tác nhiều bảng nằm trong `db.transaction` + log activity. `operationId` chống ghi trùng theo pattern gara (`services/errors.ts`, `hooks/useAction.ts`).
- Tổng báo giá: thành tiền từng dòng = KL × (đơn giá VT + đơn giá NC); tổng = Σ − chiết khấu %. Format/parse tiền như `utils/money` của gara.

## 6. Quy trình nghiệp vụ chính

```
Khách & nhu cầu → Tạo dự án → Thiết kế & Báo giá (VT + NC, duyệt phiên bản, in A4, áp vào HĐ)
→ Ký HĐ & 4 đợt thanh toán → Thi công: hạng mục theo khu vực → xuất vật tư + ngày công
→ Nghiệm thu từng hạng mục (biên bản) → Thu theo đợt / Chi NCC-thầu phụ-nhân công
→ Bàn giao → Bảo hành & khiếu nại → Báo cáo lợi nhuận dự án
```

## 7. Dữ liệu mẫu (seed) — yêu cầu chi tiết

- **~10 chủ nhà** (anh/chị VN: Anh Tuấn Anh — Vinhomes, Chị Thu Hà — Tây Hồ…, có cả 1 công ty).
- **7 dự án:**
  1. `DA-2026-01` — Căn hộ Vinhomes Green Bay – A1205 (Căn hộ, **Đang thi công**, HĐ 480tr, đã thu 60%, tiến độ ~65%).
  2. `DA-2026-02` — Nhà phố Tây Hồ 4 tầng (Nhà phố, **Đang thi công**, HĐ 1,85 tỷ, đã thu 40%, tiến độ ~35%).
  3. `DA-2026-03` — Biệt thự Vườn Đào (Biệt thự, **Đang thiết kế**, chưa có HĐ).
  4. `DA-2026-04` — Văn phòng startup Cầu Giấy (Văn phòng, **Báo giá** — có báo giá v2 Đã gửi).
  5. `DA-2026-05` — Shop thời trang Nguyễn Trãi (Shop, **Bàn giao**, HĐ 320tr, đã thu 90%, có ticket bảo hành đã xong).
  6. `DA-2026-06` — Nhà phố Ecopark — gói bảo hành (Nhà phố, **Bảo hành**, 2 ticket: 1 Mới, 1 Đang xử lý).
  7. `DA-2026-07` — Căn hộ Sunshine Riverside (Căn hộ, **Đang thi công** mới bắt đầu, HĐ 610tr, đã thu 30%, tiến độ ~15%).
- **Milestones:** mỗi dự án 4 đợt 30/30/30/10 (DA3/DA4 chưa có HĐ thì không có đợt); trong đó có 1 đợt **quá hạn** (DA2) và 1 đợt tới hạn tuần này.
- **Hạng mục (~90 dòng):** DA1 ~18, DA2 ~26, DA5 ~14 (chủ yếu Xong/Đã nghiệm thu), DA7 ~12, DA6 vài dòng. Zone chuẩn: Phòng khách, Bếp, Phòng ngủ 1/2, WC, Ban công, Sảnh… Hạng mục thực tế: "Làm trần thạch cao phẳng", "Sơn nước màu ghi sáng", "Đóng tủ bếp MDF An Cường", "Lát gạch 600×600", "Đi dây điện âm tường", "Đi ống nước PPR", "Vệ sinh công nghiệp bàn giao"... 3–4 dòng quá hạn.
- **Báo giá:** DA1 v1 **Đã duyệt** (~35 dòng/8 nhóm), DA2 v1 **Đã duyệt** + v2 Đã gửi (bổ sung), DA4 v1 Từ chối + v2 **Đã gửi** (~28 dòng), DA5 v1 Đã duyệt (~20 dòng), DA7 v1 Đã duyệt (~30 dòng). Đơn giá VT/NC thực tế (sơn Jotun ~ 45–60k/m² NC, thạch cao 160k/m², gỗ MDF 1.2–1.8tr/m² …).
- **~30 vật tư:** gạch Granite 80×80, gạch 600×600, sơn lót Jotun JN01, sơn phủ Dulux màu ghi, thạch cao Vĩnh Tường 9mm, khung xương, gỗ MDF An Cường phủ melamine, bản lề giảm chấn, ray hộp, đá granite đen Huế, inox 304 tay nắm dài, dây điện Cadivi 2.5, ống nước Bình Minh PPR, thiết bị WC TOTO, aptomat Panasonic… 4–5 vật tư tồn thấp.
- **12 nhà cung cấp/thầu phụ:** 6 NCC vật tư (Cty VLXD Hà Thành, Đại lý sơn Jotun Hà Nội, Cty Thạch cao Vĩnh Tường, Gỗ An Cường — miền Bắc, Đá Hoa Cương Việt, Thiết bị vệ sinh TOTO) + 6 thầu phụ (tổ điện anh Dũng, tổ nước anh Hoàn, thầu sơn chị Lan, thầu mộc anh Phú, đá anh Thắng, thạch cao anh Cường) kèm rating 3.5–5 sao.
- **14 thợ** (3 mộc, 2 điện, 2 nước, 3 sơn, 2 thạch cao, 2 phụ hồ) với đơn giá ngày công 350k–550k.
- **~180 dòng ngày công** tháng này, rải trên DA1/DA2/DA5/DA7.
- **6 phiếu mua NCC** (2 đã nhận đã cộng tồn, 2 đã đặt, 1 nháp, 1 huỷ) + **~10 phiếu xuất công trình** + movements điều chỉnh.
- **~35 giao dịch:** ~15 phiếu thu (gắn đợt) + ~20 phiếu chi (NCC/thầu phụ/nhân công), trải 2 tháng, có số dư sổ quỹ dương.
- **Handovers:** DA5 có 1 biên bản Nghiệm thu + 1 Bàn giao (checklist ~8 dòng); DA6 không có (đang bảo hành).
- **Tickets:** 3 (DA5 đã xong, DA6 đang xử lý, DA6 mới).
- **Activity logs ~15** mô tả tạo DA/duyệt báo giá/thu tiền/nghiệm thu.

## 8. In ấn

- **Báo giá A4** (`.print-root` như gara): header công ty (tên, MST, địa chỉ, hotline), tên DA + chủ nhà, ngày, bảng theo **nhóm hạng mục** (STT, mô tả, ĐVT, KL, đơn giá VT, đơn giá NC, thành tiền), tổng cộng, chiết khấu, tổng sau chiết khấu, ghi chú + điều khoản ngắn, chữ ký (Đại diện / Chủ đầu tư).
- **Biên bản nghiệm thu / bàn giao** A4: header, DA, ngày, checklist các dòng (mô tả, đạt/không đạt, ghi chú), kết luận, chữ ký 3 bên.
- **Phiếu thu / phiếu chi** A4 đơn giản (tuỳ chọn).

## 9. Nghiệm thu

- `npm.cmd install` + `npm.cmd run build` thành công (tsc + vite build).
- Chạy `npm.cmd run dev` mở được, đổi vai trò, seed hiển thị đủ đẹp: dashboard có số liệu, card dự án đẹp, chi tiết dự án thao tác được (sửa hạng mục, tạo báo giá + in, thu tiền theo đợt, nhập ngày công).
- README.md tiếng Việt theo cấu trúc README của gara (giới thiệu, chạy dự án, phạm vi đã triển khai, kiến trúc, quy trình, ghi chú vận hành).
- Toàn bộ file UTF-8, giao diện tiếng Việt, không lỗi TypeScript, không console error khi thao tác chính.
