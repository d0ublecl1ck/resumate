"""端到端闭环：真实 HTTP 模型服务 + 真实接口调用。

不 monkeypatch 任何 llm 函数：起一个本地 OpenAI 兼容服务，跑通
建会话（模型生成题目）-> 作答 -> 追问 -> 结束（结构化评估）整条链路，
覆盖 httpx -> socket -> 模型 -> 解析 -> 落库 -> 响应 的真实代码路径。
"""

import json
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.modules.interview import service as interview_service
from app.modules.jd.models import JobDescription
from app.modules.resume.models import Resume, ResumeVersion
from app.modules.settings import service as settings_service
from app.modules.settings.schemas import ModelConfigUpdate

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
OWNER = "user_test"
USER = CurrentUser(id=OWNER, display_name="测试用户", role="super_admin", roles=("super_admin",))

QUESTIONS = {
    "questions": [
        {"kind": "technical", "prompt": "讲讲 React 并发渲染。", "referencePoints": ["可中断", "优先级"]},
        {"kind": "behavioral", "prompt": "讲一次性能优化。", "referencePoints": ["指标", "结果"]},
        {"kind": "situational", "prompt": "首屏变慢怎么排查？", "referencePoints": ["定位", "复盘"]},
    ]
}
FOLLOW_UP = {"followUp": "时间切片怎么实现？", "missingPoints": ["时间切片"]}
REPORT = {
    "contentScores": [
        {"dimension": "correctness", "score": 80, "evidence": ["可中断渲染让高优先级更新先跑"]},
        {"dimension": "depth", "score": 70, "evidence": ["时间切片把长任务拆开"]},
        {"dimension": "rigor", "score": 60, "evidence": ["我先看监控再定位"]},
        {"dimension": "fit", "score": 85, "evidence": ["我做过 C 端首屏优化"]},
    ],
    "summary": "整体达标。",
    "highlights": ["有数据支撑"],
    "gaps": ["原理深度不足"],
    "suggestions": ["补并发原理"],
}


class _FakeModelHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        system = body["messages"][0]["content"]
        if "评估" in system:
            payload = REPORT
        elif "追问" in system:
            payload = FOLLOW_UP
        else:
            payload = QUESTIONS
        data = json.dumps(
            {"choices": [{"message": {"content": json.dumps(payload, ensure_ascii=False)}}]},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args) -> None:  # 静默，避免污染测试输出
        return


@pytest.fixture
def fake_model_endpoint() -> str:
    server = HTTPServer(("127.0.0.1", 0), _FakeModelHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/v1"
    finally:
        server.shutdown()
        thread.join(timeout=5)


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
            snapshot={"basics": {"name": "示例同学"}},
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


def test_interview_loop_over_real_http(client, db_session: Session, fake_model_endpoint: str) -> None:
    seed_context(db_session)
    settings_service.update_model_config(
        db_session,
        USER,
        ModelConfigUpdate(provider="openai", endpoint=fake_model_endpoint, model="fake-model", api_key="sk-fake"),
    )

    created = client.post(
        "/interview/sessions",
        json={"resumeVersionId": "ver_test", "jdId": "jd_test", "role": "高级前端工程师", "questionCount": 3},
    )
    assert created.status_code == 201, created.text
    session = created.json()
    assert len(session["questions"]) == 3
    assert session["contextSnapshot"]["resumeTitle"] == "前端工程师简历"

    answer = client.post(
        f"/interview/sessions/{session['id']}/answers",
        json={"questionId": session["questions"][0]["id"], "content": "可中断渲染让高优先级更新先跑。"},
    )
    assert answer.status_code == 200, answer.text
    assert answer.json()["followUpQuestion"]["prompt"] == "时间切片怎么实现？"

    # 重放同一份作答：仍是一条记录（幂等）。
    replay = client.post(
        f"/interview/sessions/{session['id']}/answers",
        json={"questionId": session["questions"][0]["id"], "content": "可中断渲染让高优先级更新先跑。"},
    )
    assert replay.json()["answer"]["id"] == answer.json()["answer"]["id"]

    for question in session["questions"][1:]:
        posted = client.post(
            f"/interview/sessions/{session['id']}/answers",
            json={"questionId": question["id"], "content": f"关于 {question['prompt']} 的回答。"},
        )
        assert posted.status_code == 200, posted.text

    finished = client.post(f"/interview/sessions/{session['id']}/finish")
    assert finished.status_code == 200, finished.text
    report = finished.json()
    assert report["rubricVersion"] == interview_service.RUBRIC_VERSION
    assert [item["dimension"] for item in report["contentScores"]] == ["correctness", "depth", "rigor", "fit"]

    fetched = client.get(f"/interview/sessions/{session['id']}/report")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == report["id"]
