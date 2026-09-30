# Repository Guidelines

Ứng dụng web tĩnh cho trẻ xếp mẫu **hạt nhựa ủi** (perler/Hama beads). Vue 3 + TypeScript + Vite, một trang duy nhất, không backend. Tài liệu người dùng đầy đủ ở `README.md` (tiếng Việt) — đọc trước khi sửa hành vi.

## Rule bắt buộc: commit sau mỗi lần hoàn thành công việc

Agent **MUST** commit code ngay khi hoàn thành mỗi task/đợt thay đổi — không để lại working tree bẩn rồi yield.

1. Xong việc → chạy `npm run test` (bắt buộc), và `npm run build` nếu đụng `.vue`/`.ts` trong `src/`.
2. `git add -A` các file thuộc phạm vi thay đổi (không add `dist/`, `node_modules/` — đã gitignore).
3. Commit theo Conventional Commits, một dòng mô tả, ví dụ:
   - `feat: thêm nút đặt lại khung`
   - `fix: giữ hạt cuối khi tọa độ trùng`
   - `refactor: tách render preview khỏi App`
   - `test: bổ sung case quota localStorage`
   - `docs: cập nhật AGENTS.md`
4. Không `--amend` commit đã push, không force-push `main`. Nhiều việc rời rạc → nhiều commit nhỏ.
5. Chỉ commit khi test/build xanh. Nếu không chạy được kiểm tra, ghi rõ lý do trong message/body commit và trong phản hồi.

## Project Overview

- Mục tiêu: vẽ hạt trên lưới số nguyên vô hạn (kể cả tọa độ âm), xem trước mô phỏng hạt chảy sau khi ủi, lưu thiết kế, nhập/xuất JSON, xuất PNG.
- Toàn bộ dữ liệu nằm trong `localStorage` của trình duyệt. Không tài khoản, không API, không đồng bộ.
- Cài đặt offline/PWA qua service worker (`vite-plugin-pwa`).
- Giao diện và toàn bộ chuỗi hiển thị, thông báo lỗi, README đều bằng **tiếng Việt**. Giữ nguyên tiếng Việt khi thêm UI/error message; code comment hiện có cũng tiếng Việt-comment kiểu ngắn.

## Architecture & Data Flow

Luồng một chiều, state tập trung, props xuống / emits lên:

```
index.html → src/main.ts (registerSW + createApp(App).mount('#app'), import './styles.css')
                ↓
            src/App.vue  ← nơi DUY NHẤT giữ state và là nơi DUY NHẤT chạm persistence
             ├─ refs: library, currentDesign, palette, tool, history, toast, saveStatus, activeTab…
             ├─ BoardCanvas.vue  : props (design, selectedColor, tool) → emits update:design / update:viewport / hover:cell
             ├─ PreviewCanvas.vue: prop  (design) → vẽ lại khi design đổi (watch deep)
             └─ Icon.vue         : presentational, ICONS map 19 path
                ↓ domain (hàm thuần)
            src/domain/design.ts   (model + validate + serialize)
            src/domain/storage.ts  → localStorage key 'perler-bead-designer:library:v1'
            src/domain/palette.ts  → localStorage key 'perler-bead-designer:palette:v1'
            src/domain/board.ts    (geometry: cell ↔ screen, cellsAlongSegment)
                ↓ render (thuần, không phụ thuộc Vue)
            src/render/ironPreview.ts → dùng CHUNG cho preview và xuất PNG
```

Điểm cốt lõi:

- `App.vue` là tầng stateful duy nhất. `BoardCanvas`, `PreviewCanvas`, `Icon` là dumb component: không tự đọc localStorage, không import store.
- Mọi thao tác vẽ đổi `Design` **bất biến**: `BoardCanvas` emit `update:design` với object `Design` mới → `App.vue` gọi `libraryWithCurrent`, đẩy snapshot undo, debounce ghi localStorage.
- `PreviewCanvas.vue` và `exportPng` phải đi qua cùng `src/render/ironPreview.ts` — không viết renderer thứ hai.
- `PreviewCanvas` **không** tự quan sát resize của chính nó; chỉ vẽ lại khi prop `design` đổi. `BoardCanvas` ngược lại: sở hữu `ResizeObserver` + viewport nội bộ (offset/zoom), bitmap absolute không quyết định kích thước khung.
- Không có router, không Pinia/Vuex, không provide/inject, không UI/canvas/gesture library. Đây là ràng buộc có chủ đích (README nêu rõ) — không thêm dependency cho việc vài dòng tự làm được.

## Key Directories

| Path | Nội dung |
|---|---|
| `src/domain/` | Hàm thuần: model `Design`/`Bead`/`DesignLibrary`, validate/serialize JSON, hình học lưới, palette, persistence. Kèm `*.test.ts` cạnh mỗi file. |
| `src/render/` | `ironPreview.ts` — renderer Canvas 2D mô phỏng hạt ủi (`previewDimensions`, `cornerFills`, `renderIronedPreview`, `renderPreviewToPng`). |
| `src/components/` | SFC trình bày: `BoardCanvas.vue`, `PreviewCanvas.vue`, `Icon.vue`. |
| `src/` (root) | `main.ts`, `App.vue`, `styles.css` (một stylesheet toàn cục, chia section có comment). |
| `public/` | 4 icon PWA: `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — thêm icon phải khai báo trong `manifest`/`includeAssets` của `vite.config.ts`. |
| `.github/workflows/deploy.yml` | CI: `npm ci` → `npm run test` → `npm run build` → GitHub Pages. |

## Development Commands

```sh
npm install
npm run dev -- --host 127.0.0.1     # dev server
npm run test                        # vitest run (một lần, không watch)
npm run build                       # vue-tsc -b && vite build → dist/
npm run preview -- --host 127.0.0.1 # thử bản production + PWA
```

- Không có script `lint`. Kiểm tra type duy nhất là `vue-tsc -b` (chạy trong `npm run build`). Chạy `npx vue-tsc -b` khi chỉ muốn typecheck nhanh.
- Không có `vitest.config`/`test` key: vitest dùng mặc định (environment `node`, glob `**/*.test.ts`).
- PWA/offline chỉ hoạt động trên localhost hoặc HTTPS — khi test qua IP LAN cần HTTPS.

## Code Conventions & Common Patterns

### TypeScript

Hai project reference: `tsconfig.app.json` (cho `src/**/*.{ts,tsx,vue}`, DOM lib, `vite/client`) và `tsconfig.node.json` (chỉ `vite.config.ts`, node types, `nodenext`). Cả hai bật `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly`.

Hệ quả bắt buộc:

- **Không dùng `enum`, `namespace`, parameter properties** — bị `erasableSyntaxOnly` chặn. Dùng union/`as const`.
- `verbatimModuleSyntax`: import chỉ dùng cho type phải viết `import type { Design } from './design'`.
- **Không có path alias** — dùng import tương đối (`../domain/design`). Đừng thêm alias khi chưa thống nhất.
- Không để biến/tham số thừa (sẽ fail build).

### Domain

- Hàm mutate trả về **object mới**, không sửa tại chỗ (`normalizeDesign`, `upsertBead`, `removeBead`).
- Chuẩn hóa dữ liệu là bất biến quy tắc: màu **uppercase** `#RRGGBB`; tọa độ phải là `Number.isSafeInteger`; hạt trùng tọa độ → **hạt sau thắng**; sắp xếp `y` rồi `x`. JSON sai/`version !== 1` bị từ chối **trước khi** đụng thư viện.
- Lỗi ném ra là `Error` với **message tiếng Việt** (ví dụ `'Tọa độ hạt phải là số nguyên'`, `'Thời gian thiết kế không hợp lệ'`, `'Không đọc được dữ liệu cũ'`); UI hiển thị trực tiếp. Giữ văn phong này.
- Chỉ `src/domain/storage.ts` và `src/domain/palette.ts` được chạm `localStorage`. Không gọi `localStorage` từ component.
- Key có version: `perler-bead-designer:library:v1`, `perler-bead-designer:palette:v1`. Đổi schema ⇒ bump `v1` và viết đường migrate/fallback.
- Lỗi quota/`setItem` throw phải **propagate** và không được làm hỏng giá trị đã lưu trước đó (đã có test cho việc này).

### Vue / UI

- SFC dùng `<script setup lang="ts">`; component trình bày nhận props và emit, không tự giữ state nghiệp vụ.
- Thông báo/toast, nhãn nút, tên tab đều tiếng Việt có dấu.
- Style: một file `src/styles.css` toàn cục, dark theme qua CSS custom property ở `:root`, chia section có comment (`/* Topbar */`…). Icon dùng `Icon.vue` + `ICONS` map, không thêm icon library.
- Accessibility: tôn trọng `prefers-reduced-motion` và trạng thái focus (phần "Toast & Accessibility" trong styles.css).

### Hành vi cần giữ ổn định khi sửa

- Autosave debounce **300 ms**, nút Lưu ghi ngay; flush khi `visibilitychange`/`beforeunload`.
- Phím tắt `B`/`E`/`H` (bút/tẩy/di chuyển) — **không** kích hoạt khi focus đang ở input.
- Nhập JSON tạo **thiết kế mới với ID mới**, không ghi đè thiết kế đang mở.
- Xuất PNG: nền trắng, không lưới, 32 px/hạt, padding 16, cạnh lớn nhất 4096.

## Important Files

| File | Vai trò |
|---|---|
| `index.html` | Shell Vite, `lang="vi"`, mount `#app`, meta PWA. |
| `src/main.ts` | Điểm vào: đăng ký service worker (`virtual:pwa-register`), bridge sự kiện `pwa:offline-ready`/`pwa:update-ready`, mount `App`. |
| `src/App.vue` | Component stateful duy nhất: bộ sưu tập, autosave, undo/redo, import/export, phím tắt, toàn bộ layout. |
| `src/domain/design.ts` | `Bead`, `Design`, `DesignLibrary`, `createEmptyDesign`, `beadKey`, `normalizeDesign`, `upsertBead`, `removeBead`, `parseDesignJson`, `serializeDesignJson`. |
| `src/domain/storage.ts` | `LIBRARY_STORAGE_KEY`, `normalizeLibrary`, `loadLibraryWithStatus`, `loadLibrary`, `saveLibrary`, `designById`. |
| `src/domain/palette.ts` | `PaletteColor`, `PALETTE` (16 màu mặc định), `PALETTE_STORAGE_KEY`, `contrastTextColor` (WCAG), `loadPalette`, `savePalette`. |
| `src/domain/board.ts` | `Viewport`/`Point`/`Cell`, `BASE_CELL_PX=24`, `MIN_ZOOM=0.4`, `MAX_ZOOM=6`, `clampZoom`, `worldToScreen`, `screenToWorld`, `cellsAlongSegment`. |
| `src/render/ironPreview.ts` | `DEFAULT_PREVIEW_OPTIONS`, `previewDimensions`, `cornerFills`, `renderIronedPreview`, `renderPreviewToPng`. |
| `vite.config.ts` | `@vitejs/plugin-vue` + `VitePWA({ registerType: 'autoUpdate', manifest tiếng Việt, includeAssets })`. **Không set `base`** (deploy ở gốc domain). |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | Project references và cờ strict. |
| `.github/workflows/deploy.yml` | CI Node 22 + `npm ci` → test → build → Pages. |

## Runtime/Tooling Preferences

- **Node 22** (CI pin), **npm** là package manager duy nhất — lockfile `package-lock.json` (v3), CI dùng `npm ci`. Không dùng pnpm/yarn/bun, không thêm lockfile khác.
- Runtime app: trình duyệt hiện đại; dùng `crypto.randomUUID` khi có, có fallback.
- Vite 8, TypeScript ~6.0 (bản 6.x của `typescript`), vue-tsc 3.
- Không có ESLint/Prettier/stylelint. Giữ style hiện tại: 2 space, **không** dấu `;`, single quote, trailing comma `multiline`. Không thêm formatter mà không được yêu cầu.
- `dist/` và `node_modules/` bị gitignore; `dist/` chỉ dùng cho artifact CI.

## Testing & QA

- Framework: **Vitest 4** (`npm run test` = `vitest run`). Không có config, không `setupFiles`, không `globals`, **không có jsdom** → mặc định environment `node`.
- Đặt test **cạnh module**: `src/domain/<module>.test.ts`, `src/render/ironPreview.test.ts`. Không có thư mục `tests/` riêng, không có helper test dùng chung.
- `localStorage` không tồn tại trong `node` env: giả lập bằng `vi.stubGlobal` + `Map` trong bộ nhớ (xem `palette.test.ts`, `storage.test.ts`). Lỗi quota giả lập bằng cách cho `setItem` throw.
- Phong cách: `describe` cho nhóm logic, `it` cho case; factory cục bộ (`fixture()`, `designOf()`); assertion mô tả hành vi. Không snapshot, không mock component.
- Đã phủ: chuẩn hóa/validate design, round-trip JSON, dedupe/tọa độ âm, palette round-trip + hex chuẩn hóa + `contrastTextColor` WCAG, persistence + lỗi quota, `worldToScreen`/`screenToWorld` round-trip, `cellsAlongSegment` (không hở pixel), `previewDimensions`, `cornerFills` (fillet/bridge). `clampZoom` và hằng số zoom chưa assert trực tiếp.
- **Chưa phủ**: mọi component Vue/`App.vue`, vẽ canvas thật, import/export thật, touch đa điểm, offline. Những phần này lần trước được smoke test thủ công bằng Chromium; chưa xác minh trên iPad/Safari/Firefox thật.
- Kỳ vọng coverage: không có ngưỡng số. Thay vào đó, **mọi logic thuần mới** (`src/domain`, `src/render`) phải có test hành vi; sửa bug phải kèm case tái hiện lỗi cũ. Thay đổi UI/hành vi thì chạy `npm run dev` và kiểm tra thật trên trình duyệt, không chỉ dựa vào test.
- Trước khi commit/PR: `npm run test` **và** `npm run build` phải xanh (build bao gồm typecheck `vue-tsc -b`). Nếu đổi dữ liệu người dùng, cập nhật `README.md` (định dạng JSON, key localStorage, mô tả hành vi).