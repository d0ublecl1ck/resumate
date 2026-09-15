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
archkit inspect .
```

配置与接口行为见 [后端说明](backend/README.md)，架构见 [项目蓝图](docs/design.md)。
