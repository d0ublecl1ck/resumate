# Resumate UI

React + TypeScript + Vite 前端。

## 对接后端

已实现的核心实体端点通过 `src/lib/api-client.ts` 走真实 HTTP，默认基地址 `/api`：

```bash
# 1. 启动后端（另开终端，backend/ 目录）
uv run uvicorn app.main:app --reload   # http://localhost:8000

# 2. 启动前端，Vite 会把 /api 代理到后端
pnpm dev
```

可用 `VITE_API_BASE_URL` 覆盖基地址（见 `.env.example`）。`src/lib/api.ts` 中后端尚未实现的端点（Agent Run、自然语言解析、配置、PAT/访问日志、备份、工作台 mock 统计）仍读取 `src/lib/content.ts`。

测试通过 MSW（`src/test-server.ts`）以 fixtures 驱动真实 fetch 路径，不需要后端进程。

## 国际化（i18n）

界面文案由 i18next + react-i18next 管理，当前支持 `zh-CN` 与 `en`：

- 入口与语言检测：`src/i18n/index.ts`（本地持久化 `resumate.locale` → 浏览器语言 → `zh-CN` 兜底），切换时同步 `html[lang]` 与文档标题。
- 资源：`src/i18n/locales/<locale>/<namespace>.ts`，命名空间为 `common`、`nav`、`settings`、`workbench`、`resume`、`jd`、`profile`、`templates`、`api`；两种语言的键结构必须一致（`i18n.test.ts` 会校验）。
- 组件内使用 `useTranslation()` + `t("namespace.key")`；非 React 模块（`lib/api.ts`、`lib/api-client.ts`）直接使用 `@/i18n` 默认实例。
- 语言切换入口在设置页「个人偏好」。简历正文、JD 正文、事实内容与 Diff 原文属于用户内容，不随界面语言变化。

---


This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
