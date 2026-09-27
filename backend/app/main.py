from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.modules.health.api import router as health_router
from app.modules.resume.api import router as resume_router
from app.modules.templates.api import router as templates_router
from app.shared.errors import ApiError, ApiException

app = FastAPI(title=get_settings().app_name)


@app.exception_handler(ApiException)
async def handle_api_exception(request: Request, exc: ApiException) -> JSONResponse:
    """Render domain failures with the shared machine error contract."""
    body = ApiError(code=exc.code, message=str(exc), latest_version_id=exc.latest_version_id)
    return JSONResponse(status_code=exc.status_code, content=body.model_dump(by_alias=True, exclude_none=True))


app.include_router(health_router)
app.include_router(templates_router)
app.include_router(resume_router)
