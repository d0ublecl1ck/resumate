from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import require_permission

from . import service
from .schemas import (
    InterviewAnswerCreate,
    InterviewAnswerResult,
    InterviewComparisonView,
    InterviewGrowthView,
    InterviewInsightsView,
    InterviewReportView,
    InterviewSessionCreate,
    InterviewSessionDetail,
    InterviewSessionRegenerate,
    InterviewSessionSummary,
    PracticeItemCreate,
    PracticeItemRetestResult,
    PracticeItemUpdate,
    PracticeItemView,
)

# 面试能力挂在岗位域权限下（jd:read / jd:write）：它消费的是 JD 与简历版本，
# 不新增权限码，避免改动 RBAC 目录。
router = APIRouter(tags=["interview"])


@router.get("/interview/sessions", response_model=list[InterviewSessionSummary])
def list_interview_sessions(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> list[InterviewSessionSummary]:
    return service.list_sessions(db, user.id)


@router.post("/interview/sessions", response_model=InterviewSessionDetail, status_code=status.HTTP_201_CREATED)
def create_interview_session(
    payload: InterviewSessionCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> InterviewSessionDetail:
    return service.create_session(db, user.id, payload)


@router.get("/interview/sessions/{session_id}", response_model=InterviewSessionDetail)
def get_interview_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> InterviewSessionDetail:
    return service.get_detail(db, user.id, session_id)


@router.post("/interview/sessions/{session_id}/answers", response_model=InterviewAnswerResult)
def submit_interview_answer(
    session_id: str,
    payload: InterviewAnswerCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> InterviewAnswerResult:
    return service.submit_answer(db, user.id, session_id, payload)


@router.post("/interview/sessions/{session_id}/finish", response_model=InterviewReportView)
def finish_interview_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> InterviewReportView:
    return service.finish_session(db, user.id, session_id)


@router.get("/interview/sessions/{session_id}/report", response_model=InterviewReportView)
def get_interview_report(
    session_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> InterviewReportView:
    return service.get_report(db, user.id, session_id)


def _attachment_disposition(title: str) -> str:
    """RFC 5987：ASCII 回退名 + UTF-8 文件名，中文岗位名也能安全下载。"""
    filename = f"{title or 'interview-report'}.md"
    ascii_title = "".join(
        char for char in title if char.isascii() and (char.isalnum() or char in "._- ")
    ).strip(" ._-") or "interview-report"
    return f"attachment; filename=\"{ascii_title}.md\"; filename*=UTF-8''{quote(filename, safe='')}"


@router.get("/interview/sessions/{session_id}/report/export")
def export_interview_report(
    session_id: str,
    format: Literal["markdown"] = Query("markdown"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> Response:
    """导出本场评估报告为 Markdown 附件（与简历导出同一范式，format=pdf 走 422）。"""
    markdown, title = service.export_report_markdown(db, user.id, session_id)
    return Response(
        content=markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": _attachment_disposition(title)},
    )

# --------------------------------------------------------------------------- #
# 数据聚合与准备辅助（成长曲线 / 口径比较 / 练习计划 / 重新生成 / 洞察）
# --------------------------------------------------------------------------- #


@router.get("/interview/growth", response_model=InterviewGrowthView)
def get_interview_growth(
    role: str | None = Query(default=None, max_length=200),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> InterviewGrowthView:
    """按 role + rubric_version 聚合真实场次的四维分数序列与平均值。"""
    return service.list_growth(db, user.id, role)


@router.get("/interview/comparison", response_model=InterviewComparisonView)
def compare_interview_sessions(
    a: str = Query(min_length=1, max_length=64),
    b: str = Query(min_length=1, max_length=64),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> InterviewComparisonView:
    """两次场次的口径校验；不同口径返回 connectable=false 与原因码。"""
    return service.compare_sessions(db, user.id, a, b)


@router.get("/interview/practice-items", response_model=list[PracticeItemView])
def list_interview_practice_items(
    role: str | None = Query(default=None, max_length=200),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> list[PracticeItemView]:
    return service.list_practice_items(db, user.id, role)


@router.post("/interview/practice-items", response_model=list[PracticeItemView], status_code=status.HTTP_201_CREATED)
def create_interview_practice_items(
    payload: PracticeItemCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> list[PracticeItemView]:
    """把评估报告的 suggestions 落成练习项。"""
    return service.materialise_practice_items(db, user.id, payload)


@router.patch("/interview/practice-items/{item_id}", response_model=PracticeItemView)
def update_interview_practice_item(
    item_id: str,
    payload: PracticeItemUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> PracticeItemView:
    return service.update_practice_item(db, user.id, item_id, payload)


@router.delete("/interview/practice-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interview_practice_item(
    item_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> Response:
    service.delete_practice_item(db, user.id, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/interview/practice-items/{item_id}/retest",
    response_model=PracticeItemRetestResult,
    status_code=status.HTTP_201_CREATED,
)
def start_interview_practice_retest(
    item_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> PracticeItemRetestResult:
    """为练习项发起复测：按源场次口径生成新一场面试。"""
    return service.start_retest(db, user.id, item_id)


@router.post("/interview/sessions/{session_id}/regenerate", response_model=InterviewSessionDetail)
def regenerate_interview_session(
    session_id: str,
    payload: InterviewSessionRegenerate | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> InterviewSessionDetail:
    """对未作答场次重新生成题目；已作答返回 409。

    可选 difficulty / kinds 覆盖筛选，不传则沿用建场时冻结的筛选。
    """
    return service.regenerate_session(db, user.id, session_id, payload)


@router.get("/interview/insights", response_model=InterviewInsightsView)
def get_interview_insights(
    resume_version_id: str = Query(alias="resumeVersionId", min_length=1, max_length=64),
    jd_id: str = Query(alias="jdId", min_length=1, max_length=64),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> InterviewInsightsView:
    """用真实简历与 JD 内容生成匹配点 / 风险点 / 岗位范围关键词。"""
    return service.get_insights(db, user.id, resume_version_id, jd_id)
