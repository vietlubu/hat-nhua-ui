# Hạt nhựa ủi

Ứng dụng Vue 3 + TypeScript + Vite cho trẻ thiết kế mẫu hạt nhựa ủi. Toàn bộ dữ liệu nằm trong trình duyệt; không cần tài khoản, API hoặc backend.

## Chạy ứng dụng

```sh
npm install
npm run dev -- --host 127.0.0.1
```

Vite in địa chỉ truy cập trong terminal. Để kiểm tra bản production và PWA:

```sh
npm run test
npm run build
npm run preview -- --host 127.0.0.1
```

Triển khai thư mục `dist/` ở gốc một static host có HTTPS. Localhost được phép dùng service worker qua HTTP; khi mở từ máy tính bảng qua địa chỉ IP trong LAN, cần HTTPS để có offline và cài PWA.

## Sử dụng

- **Bút**: chạm một ô hoặc kéo để đặt hạt; **Tẩy**: xóa hạt; **Di chuyển**: kéo khung, không đổi mẫu. Phím tắt trên máy tính: `B` bút, `E` tẩy, `H` di chuyển (không áp dụng khi con trỏ đang ở ô nhập tên).
- Hai ngón tay để thu/phóng và di chuyển; trên máy tính dùng wheel hoặc các nút `+`, `−`. Nút đặt lại khung đưa `(0, 0)` về giữa ở zoom ban đầu.
- Bảng màu bắt đầu với 16 màu. Mỗi ô màu hiển thị số hạt đang dùng màu đó trong thiết kế hiện tại; chữ dùng màu đen hoặc trắng theo độ tương phản (WCAG) với ô màu. Chọn **Màu mới → Thêm màu** để thêm màu tùy ý; chọn một màu rồi **Xóa màu đang chọn** để bỏ khỏi bảng. Màu trùng không được thêm lần nữa. Bảng màu tự lưu trên trình duyệt; xóa màu không đổi các hạt đã vẽ. Có thể xóa hết màu rồi thêm lại; Bút tạm tắt khi chưa có màu.
- Khung không có kích thước cố định; mỗi tọa độ nguyên, kể cả âm, tương ứng một hạt.
- Preview cập nhật cùng mẫu: hạt kề cạnh dính liền thành mảng, chỉ bo tròn đường viền ngoài, có ánh bóng nhẹ và lỗ nhỏ sau khi ủi. Hạt cách nhau hoặc chỉ chạm chéo không được nối. Đây là hình minh họa gần đúng, không mô phỏng vật lý hoặc bảo đảm màu vật liệu ngoài đời.
- Thiết kế tự lưu sau 300 ms; nút **Lưu** ghi ngay. Thay đổi đang chờ cũng được lưu khi đóng/reload trang hoặc chuyển ứng dụng sang nền.
- Có thể tạo, đổi tên, mở và xóa các thiết kế trong bộ sưu tập.
- **Xuất JSON** giữ nguồn chỉnh sửa. **Nhập JSON** tạo một thiết kế mới với ID mới, không ghi đè thiết kế đang mở.
- **Xuất PNG** dùng cùng renderer hạt dính liền như preview, trên nền trắng, không kèm lưới. Ảnh có 32 px/hạt và padding; chiều lớn nhất được giới hạn 4096 px.

## Offline và cài lên màn hình chính

Mở ứng dụng online ít nhất một lần để service worker tải tài nguyên. Sau khi có thông báo sẵn sàng offline, ứng dụng có thể mở, vẽ và lưu local không cần mạng.

- Chrome/Edge: dùng mục cài ứng dụng trong menu trình duyệt nếu thiết bị hỗ trợ.
- Safari trên iPad/iPhone: **Chia sẻ → Thêm vào Màn hình chính**.

Mẫu chỉ thuộc browser và thiết bị đang dùng. Xóa dữ liệu website, đổi browser hoặc đổi thiết bị sẽ không tự khôi phục mẫu; nên xuất JSON để sao lưu. Khi hết quota hoặc browser chặn lưu, ứng dụng báo lỗi và giữ mẫu trong phiên hiện tại để xuất JSON hoặc thử lưu lại. Không tự đồng bộ và không có server dự phòng.

## Định dạng JSON

```json
{
  "version": 1,
  "id": "example-id",
  "name": "Mẫu của con",
  "beads": [
    { "x": -1, "y": 0, "color": "#E53935" },
    { "x": 0, "y": 0, "color": "#1E88E5" }
  ],
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

Tọa độ phải là số nguyên an toàn của JavaScript; màu phải có dạng `#RRGGBB`. Nếu một tọa độ lặp lại, hạt cuối cùng được giữ. Màu được chuẩn hóa thành chữ hoa; hạt được sắp xếp theo `y`, rồi `x`. JSON lỗi hoặc version không hỗ trợ bị từ chối trước khi sửa thư viện.

Thư viện được lưu bằng `localStorage` ở key `perler-bead-designer:library:v1` với `version`, `currentId` và `designs`.
Bảng màu được lưu riêng ở key `perler-bead-designer:palette:v1` dưới dạng mảng mã màu `#RRGGBB` (mảng rỗng được giữ nguyên). JSON thiết kế vẫn chứa màu từng hạt, không phụ thuộc bảng màu hiện có.

## Cấu trúc chính

- `src/domain/`: dữ liệu thiết kế, hình học lưới, palette, lưu local và regression tests.
- `src/components/BoardCanvas.vue`: Canvas 2D, Pointer Events và viewport. `ResizeObserver` theo dõi khung CSS; bitmap nằm absolute bên trong, không quyết định kích thước khung.
- `src/components/PreviewCanvas.vue`, `src/render/ironPreview.ts`: preview và renderer PNG dùng chung; vẽ lại khi dữ liệu/viewport đổi, không tự quan sát resize của canvas.
- `src/App.vue`: bộ sưu tập, autosave, import/export và giao diện tiếng Việt.
- `vite.config.ts`: manifest và precache PWA bằng `vite-plugin-pwa`.

Không dùng UI framework, canvas/gesture library hoặc state framework. Unit tests kiểm tra dữ liệu, tọa độ, bounding box và lỗi lưu; thao tác thật, import/export, touch đa điểm và offline đã được smoke-test bằng Chromium. Chưa xác minh trên thiết bị iPad thật hoặc Safari/Firefox thật.
