# Resumate

`ui/`：React 前端。`backend/`：FastAPI 后端。`agent-core/`：只走公共 API 的 Agent 底座（Python, uv），接口契约见 [Agent 操作 API 契约](docs/agent/agent-operation-api.md)。

## 启动后端

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

健康检查：`http://localhost:8000/health/`；接口文档：`http://localhost:8000/docs`。

## 验证

在仓库根目录执行：

```bash
uv run --directory backend pytest
DATABASE_URL=sqlite:// uv run --directory backend alembic upgrade head
archkit inspect .
```

迁移验证使用内存 SQLite。配置与接口行为见 [后端说明](backend/README.md)，架构见 [项目蓝图](docs/design.md)。

首页视觉规范以 [定稿原型](ui/prototypes/index.html) 为准。

待实现的业务范围见 [用户故事](docs/user-stories/README.md)，授权、版本与失败处理见 [公共契约](docs/user-stories/contracts.md)，需求覆盖与原编号映射见 [覆盖表](docs/user-stories/coverage.md)。

## Git hooks

克隆后执行一次 `git config core.hooksPath .githooks` 启用 pre-commit：提交前自动删除目录中已有其他被跟踪文件的 `.gitkeep`（仅 `.gitkeep` 或仅有未跟踪文件时保留）。
