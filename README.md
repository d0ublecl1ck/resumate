# Resumate

`ui/`：React 前端。`backend/`：FastAPI 后端。

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

## Git hooks

克隆后执行一次 `git config core.hooksPath .githooks` 启用 pre-commit：提交前自动删除目录中已有其他被跟踪文件的 `.gitkeep`（仅 `.gitkeep` 或仅有未跟踪文件时保留）。
