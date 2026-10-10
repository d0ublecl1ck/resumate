"""GET /interview/sessions/{id}/report/export：真实报告导出为 Markdown 附件。

覆盖：Markdown 内容（岗位 / 量表版本 / 四维分数与证据 / 亮点、不足、建议 / 表达维度）、
RFC5987 中文文件名、无报告 404、format=pdf 422。模型侧一律 monkeypatch，不访问外网。
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.modules.interview import llm as interview_llm
from app.modules.interview import service as interview_service
from app.modules.jd.models import JobDescription
from app.modules.resume.models import Resume, ResumeVersion

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
OWNER = "user_test"

QUESTION_PAYLOAD = {
    "questions": [
        {"kind": "technical", "prompt": "React 并发渲染解决了什么问题？", "referencePoints": ["可中断渲染", "优先级调度"]},
        {"kind": "behavioral", "prompt": "讲一次你推动性能优化的经历。", "referencePoints": ["背景", "指标", "结果"]},
        {"kind": "situational", "prompt": "线上首屏突然变慢，你怎么排查？", "referencePoints": ["定位", "回滚", "复盘"]},
    ]
}

REPORT_PAYLOAD = {
    "contentScores": [
        {"dimension": "correctness", "score": 86, "evidence": ["我把低优先级更新让出去了"]},
        {"dimension": "depth", "score": 72, "evidence": ["时间切片把长任务拆成 5ms 的小块"]},
        {"dimension": "rigor", "score": 30, "evidence": []},
        {"dimension": "fit", "score": 90, "evidence": ["LCP 降了 40%"]},
    ],
    "summary": "基础扎实，深度待补。",
    "highlights": ["有真实性能数据"],
    "gaps": ["原理深度不足"],
    "suggestions": ["补充并发渲染原理"],
}


def seed_context(db: Session) -> None:
    db.add(
        Resume(
            id="res_test",
            owner_id=OWNER,
            profile_id=None,
            title="前端工程师简历",
            target_role="高级前端工程师",
            tags=["前端"],
            template_id="tpl_modern",
            template_version=1,
            current_version_id="ver_test",
            lifecycle="active",
            save_state="committed",
            document={},
            created_at=NOW,
            updated_at=NOW,
        )
    )
    db.add(
        ResumeVersion(
            id="ver_test",
            resume_id="res_test",
            source="manual",
            actor_id=OWNER,
            message="",
            change_count=0,
            affected_sections=[],
            snapshot={"basics": {"name": "示例同学", "title": "高级前端工程师"}},
            started_at=NOW,
            committed_at=NOW,
        )
    )
    db.add(
        JobDescription(
            id="jd_test",
            owner_id=OWNER,
            role="高级前端工程师",
            company="某科技",
            body="负责 C 端核心页面开发；要求精通 React 与 TypeScript。",
            source_url=None,
            tags=["前端"],
            revision=1,
            bound_resume_id=None,
            created_at=NOW,
            updated_at=NOW,
        )
    )
    db.commit()


def patch_llm(monkeypatch) -> None:
    def fake(db, owner_id, *, system_prompt, user_prompt, max_tokens=None, client=None):
        if "评估" in system_prompt:
            return REPORT_PAYLOAD
        if "追问" in system_prompt:
            return {"followUp": "", "missingPoints": []}
        return QUESTION_PAYLOAD

    monkeypatch.setattr(interview_llm, "chat_json", fake)


def finished_session(client, monkeypatch) -> str:
    patch_llm(monkeypatch)
    created = client.post(
        "/interview/sessions",
        json={"resumeVersionId": "ver_test", "jdId": "jd_test", "role": "高级前端工程师", "questionCount": 3},
    )
    assert created.status_code == 201, created.text
    session = created.json()
    for question in session["questions"]:
        answered = client.post(
            f"/interview/sessions/{session['id']}/answers",
            json={
                "questionId": question["id"],
                "content": f"针对「{question['prompt']}」的回答：我把低优先级更新让出去了。",
                "idempotencyKey": f"k-{question['id']}",
            },
        )
        assert answered.status_code == 200, answered.text
    finished = client.post(f"/interview/sessions/{session['id']}/finish")
    assert finished.status_code == 200, finished.text
    return session["id"]


def test_export_report_markdown_contains_real_report_and_expression(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    session_id = finished_session(client, monkeypatch)
    segment = client.post(
        "/speech/segments",
        json={"durationSeconds": 60, "transcript": "一二三四五六七八九十", "sessionId": session_id},
    )
    assert segment.status_code == 201, segment.text

    response = client.get(f"/interview/sessions/{session_id}/report/export?format=markdown")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/markdown")
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert "filename*=UTF-8''" in disposition

    markdown = response.text
    assert "# 面试评估报告 · 高级前端工程师" in markdown
    assert f"- 量表版本：{interview_service.RUBRIC_VERSION}（已冻结）" in markdown
    # 四维分数与证据：无证据的 rigor 记为证据不足，不写 0。
    assert "| 技术正确性 | 86 |" in markdown
    assert "我把低优先级更新让出去了" in markdown
    assert "| 逻辑严谨性 | 证据不足 |" in markdown
    # 亮点 / 不足 / 改进建议。
    assert "有真实性能数据" in markdown
    assert "原理深度不足" in markdown
    assert "补充并发渲染原理" in markdown
    # 表达维度来自真实录音：10 字 / 60 秒 = 10 字/分。
    assert "## 表达维度" in markdown
    assert "10 字/分（真实录音实测）" in markdown
    # 只有 correctness 的证据在作答里逐字出现，其余维度被判定为非原话 -> 不计入依据数。
    assert "自信度：有依据的估计（依据 1 处作答措辞" in markdown


def test_export_report_without_audio_marks_expression_not_applicable(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    session_id = finished_session(client, monkeypatch)

    response = client.get(f"/interview/sessions/{session_id}/report/export")

    assert response.status_code == 200, response.text
    markdown = response.text
    assert "语速：不适用（本场没有音频轨" in markdown
    assert "清晰度：不适用（本场没有音频轨" in markdown


def test_export_report_without_report_returns_not_found(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    created = client.post(
        "/interview/sessions",
        json={"resumeVersionId": "ver_test", "jdId": "jd_test", "role": "高级前端工程师", "questionCount": 3},
    )
    assert created.status_code == 201, created.text

    response = client.get(f"/interview/sessions/{created.json()['id']}/report/export")

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_export_report_rejects_non_markdown_format(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    session_id = finished_session(client, monkeypatch)

    response = client.get(f"/interview/sessions/{session_id}/report/export?format=pdf")

    assert response.status_code == 422
