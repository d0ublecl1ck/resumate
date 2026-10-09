import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.config import check_startup_config, get_settings
from app.modules.access.api import router as access_router
from app.modules.agent.api import router as agent_router
from app.modules.auth.api import router as auth_router
from app.modules.backup.api import router as backup_router
from app.modules.bank.api import router as bank_router
from app.modules.health.api import router as health_router
from app.modules.interview.api import router as interview_router
from app.modules.jd.api import router as jd_router
from app.modules.kb.api import router as kb_router
from app.modules.profile.api import router as profile_router
from app.modules.quiz.api import router as quiz_router
from app.modules.resume.api import router as resume_router
from app.modules.settings.api import router as settings_router
from app.modules.speech.api import router as speech_router
from app.modules.templates.api import router as templates_router
from app.shared.errors import ApiError, ApiException, ErrorCode

def _ensure_startup_logging() -> None:
    """让应用自身的启动日志在 uvicorn 默认日志配置下可见。

    uvicorn 只给 "uvicorn*" logger 挂了 handler，应用 logger 的 INFO 记录会静默
    消失。这里在启动时给根 logger 补一个 handler；basicConfig 在已经存在 handler
    （pytest 的 caplog、部署方的日志配置）时是空操作，不会抢走日志捕获。
    """
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """启动生命周期：先做配置自检，有效配置不齐备就直接中止启动。

    放在 lifespan 而不是模块导入期，是为了让「启动」这件事显式发生，也让
    TestClient 的上下文管理器与真实 uvicorn 走同一条路径。
    """
    _ensure_startup_logging()
    check_startup_config()
    yield


app = FastAPI(title=get_settings().app_name, lifespan=lifespan)


@app.exception_handler(ApiException)
async def handle_api_exception(request: Request, exc: ApiException) -> JSONResponse:
    """Render domain failures with the shared machine error contract."""
    body = ApiError(code=exc.code, message=str(exc), latest_version_id=exc.latest_version_id)
    return JSONResponse(status_code=exc.status_code, content=body.model_dump(by_alias=True, exclude_none=True))


@app.exception_handler(RequestValidationError)
async def handle_request_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Map schema validation failures onto the shared machine error contract.

    Pydantic messages are English and expose internal wording, so report a stable
    Chinese message naming the offending fields instead of the raw text.
    """
    fields = sorted({str(error["loc"][-1]) for error in exc.errors() if error.get("loc")})
    details = "请求参数校验失败"
    if fields:
        details = f"{details}：{'、'.join(fields)}"
    body = ApiError(code=ErrorCode.VALIDATION_FAILED, message=details)
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
app.include_router(interview_router)
app.include_router(bank_router)
app.include_router(kb_router)
app.include_router(speech_router)
app.include_router(quiz_router)
