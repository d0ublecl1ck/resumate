from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.modules.access.api import router as access_router
from app.modules.agent.api import router as agent_router
from app.modules.auth.api import router as auth_router
from app.modules.backup.api import router as backup_router
from app.modules.health.api import router as health_router
from app.modules.jd.api import router as jd_router
from app.modules.profile.api import router as profile_router
from app.modules.resume.api import router as resume_router
from app.modules.settings.api import router as settings_router
from app.modules.templates.api import router as templates_router
from app.shared.errors import ApiError, ApiException, ErrorCode

app = FastAPI(title=get_settings().app_name)


@app.exception_handler(ApiException)
async def handle_api_exception(request: Request, exc: ApiException) -> JSONResponse:
    """Render domain failures with the shared machine error contract."""
    body = ApiError(code=exc.code, message=str(exc), latest_version_id=exc.latest_version_id)
    return JSONResponse(status_code=exc.status_code, content=body.model_dump(by_alias=True, exclude_none=True))


@app.exception_handler(RequestValidationError)
async def handle_request_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Map schema validation failures onto the shared machine error contract."""
    details = "; ".join(str(error.get("msg", "请求校验失败")) for error in exc.errors())
    body = ApiError(code=ErrorCode.VALIDATION_FAILED, message=details or "请求校验失败")
    return JSONResponse(status_code=422, content=body.model_dump(by_alias=True, exclude_none=True))


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(templates_router)
app.include_router(resume_router)
app.include_router(jd_router)
app.include_router(profile_router)
app.include_router(settings_router)
app.include_router(access_router)
app.include_router(backup_router)
app.include_router(agent_router)
