---
id: e13aa
status: closed
created_at: 2026-10-03T07:05:50.083Z
updated_at: 2026-10-09T17:05:57.289Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 品牌资产
started_at: 2026-10-09T17:05:57.048Z
closed_at: 2026-10-09T17:05:57.289Z
---

# 网站图标改为品牌标志并补齐 PWA 图标

## Background

`ui/index.html` 的 `<link rel="icon">` 指向 `ui/public/favicon.svg`，而该文件是脚手架自带的 Vite 紫色图标：浏览器标签、书签、iOS 主屏、Android 主屏全都显示这个与产品无关的标志。品牌资产 `ui/public/brand/mark.png` 已就位，品牌 README 也写明它就是 favicon / 应用图标的指定素材，只是从未接线。

## Scope

- 从 `brand/mark.png` 生成网页图标产物：`favicon-16/32/48.png`（透明底）、`apple-touch-icon.png` 180、`android-chrome-192x192.png` / `android-chrome-512x512.png`。
- iOS 与 Android 图标垫 `#f7f5f0` 底：系统对透明图标会压成黑底，垫底后与 `theme-color` 一致。
- `ui/index.html` 换成三个 PNG favicon + apple-touch-icon + manifest 引用；删除脚手架遗留的 `favicon.svg`。
- 新增 `ui/public/site.webmanifest`（名称、192/512 图标、theme_color/background_color）。
- `ui/public/brand/README.md` 补「网站图标」一节，记录产物清单与可复现的 `sips` 生成命令。

## Non-goals

- 不改 `brand/mark.png` 等品牌源图，也不重画标志。
- 不加 `favicon.ico` 兼容包：现代浏览器与 iOS/Android 均由 PNG + manifest 覆盖。
- 不顺手改 `ui/public/icons.svg`（那是页面内联用的社交图标 sprite，与站点图标无关）。
- 不改 `theme-color` 的取值。

## Acceptance Criteria

- [x] `ui/index.html` 的图标引用全部指向品牌标志产物，且不再引用 `favicon.svg`。
- [x] `ui/public/favicon.svg`（脚手架 Vite 图标）已删除。
- [x] `favicon-16/32/48.png` 为透明底正方形；`apple-touch-icon.png`、`android-chrome-*.png` 不带透明像素、底色为 `#f7f5f0`。
- [x] `site.webmanifest` 是合法 JSON，图标路径均可解析。
- [x] `pnpm -C ui build` 产物 `ui/dist` 内含全部图标与 manifest。
- [x] `pnpm -C ui test` 通过，`archkit inspect .` 通过。

## Implementation

- `ui/public/` 新增 `favicon-16.png`、`favicon-32.png`、`favicon-48.png`（`sips -Z <size> -p <size> <size>` 居中补成正方形，保持透明）、`apple-touch-icon.png`(180)、`android-chrome-192x192.png`、`android-chrome-512x512.png`（后三者 `--padColor F7F5F0`）。
- `ui/index.html`：`<link rel="icon">` 由单个 SVG 改为 16/32/48 三个 PNG，补 `apple-touch-icon` 与 `manifest`，并加一行注释指向品牌生成说明。
- `ui/public/site.webmanifest`：新增，`name`/`short_name`/`icons`/`theme_color: #f7f5f0`/`background_color`/`display: standalone`。
- `ui/public/favicon.svg`：删除（脚手架 Vite 图标，已无引用）。
- `ui/public/brand/README.md`：新增「网站图标」一节，登记六个产物、垫底原因与 `sips` 生成命令；同时记录 16px 下角色细节不可读这一已知取舍。

## Verification

```console
$ python3 -c "import json; json.load(open('ui/public/site.webmanifest'))"   # 合法 JSON
$ pnpm -C ui test
Test Files  30 passed (30)
     Tests  232 passed (232)
$ pnpm -C ui build           # 成功，dist 内含 6 个图标 + site.webmanifest + icons.svg
$ archkit inspect .
Quality gates passed.
```

静态服务 `ui/dist`（`python3 -m http.server 6008`）实测：`/favicon-32.png` 200 image/png 1900B、`/favicon-16.png` 200、`/apple-touch-icon.png` 200、`/site.webmanifest` 200 application/manifest+json、`/android-chrome-512x512.png` 200，旧 `/favicon.svg` 404。

PNG 像素校验（zlib 解码 IHDR/IDAT）：`favicon-32.png` 32x32 RGBA `min_alpha=0`（保留透明）；`apple-touch-icon.png` 180x180 与 `android-chrome-192x192.png` 192x192 均 `min_alpha=255`、角像素 `(247,245,240,255)`（`#f7f5f0` 实心垫底）。

- 归档核对（只读，本次审计复跑）：`ui/index.html` 6-10 行确为 3 个 PNG favicon + apple-touch-icon + manifest；`ui/public/favicon.svg` 不存在；6 个 PNG 实测尺寸 16/32/48/180/192/512；`site.webmanifest` 解析出 `name=Resumate · 对话式简历工作台`、`icons[0].sizes=192x192`、`theme_color=#f7f5f0`；`ui/public/brand/README.md` 有「网站图标」一节。实现提交 `aafdc42`。

## Related ADRs

- None.
