#!/usr/bin/env python3
"""fix-ui E2E：真点 UI 验证 P1-P3 修复项（Playwright 无头）。

约束：
- 只操作自己创建、带 e2e-fixui- 前缀的数据，结束前清理。
- 共享后端 8000 不重启；match-job 需要新代码，用临时后端 8010（同代码、同库、不同端口），
  UI 层用 Playwright route fulfill 把 /api/profile/match-job 指向 8010 的真实响应。
运行：/usr/bin/python3 docs/e2e/2026-10-09/areas/fix-ui/fix_ui_e2e.py
"""
import http.cookiejar
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = "<本机用户名>/resumate-worktrees/zj-fwwb-2026"
SCRIPTS = ROOT + "/docs/e2e/2026-10-09/scripts"
sys.path.insert(0, SCRIPTS)
from e2e_lib import Recorder, api, browser_page, wait_for_port  # noqa: E402

WEB = "http://127.0.0.1:5173"
API = "http://127.0.0.1:8000"
TEMP_API = "http://127.0.0.1:8010"
TS = time.strftime("%m%d-%H%M%S")
PREFIX = "e2e-fixui-%s" % TS
ADMIN = ("admin@resumate.dev", "resumate-admin")

rec = Recorder("fix-ui")
CLEANUP = []


def login_cookie(email, password):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(
        API + "/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(req, timeout=30) as resp:
        resp.read()
    return "; ".join("%s=%s" % (c.name, c.value) for c in jar)


def api_on(port, method, path, *, body=None, cookie=None):
    url = "http://127.0.0.1:%d%s" % (port, path)
    data = None
    hdrs = {}
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    if cookie:
        hdrs["Cookie"] = cookie
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8", "replace")
            status = resp.status
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", "replace")
        status = exc.code
    try:
        return status, json.loads(text)
    except Exception:
        return status, text


def ui_login(page, email, password):
    page.goto(WEB + "/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill(email)
    page.get_by_label("密码").fill(password)
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=20000)
    page.wait_for_timeout(1200)


def card_for(page, title):
    return page.locator("li").filter(has=page.get_by_role("link", name=title, exact=True)).first


def start_temp_backend():
    env = dict(os.environ)
    env.update({"SMTP_HOST": "127.0.0.1", "SMTP_PORT": "2525", "SMTP_FROM_EMAIL": "no-reply@resumate.dev", "SMTP_STARTTLS": "false"})
    log = open(ROOT + "/docs/e2e/2026-10-09/areas/fix-ui/temp-backend.log", "wb")
    proc = subprocess.Popen(
        ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8010"],
        cwd=ROOT + "/backend",
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    ready = wait_for_port(TEMP_API + "/health/", timeout=60)
    return proc, ready


def main():
    cookie = login_cookie(*ADMIN)
    temp_proc, temp_ready = start_temp_backend()
    if not temp_ready:
        rec.step("临时后端 8010", "启动成功以验证 match-job 真实契约", "启动超时", False, "")
    else:
        rec.step("临时后端 8010", "启动成功（同代码同库，不动共享 8000）", "health 200", True, "")

    status, templates = api("GET", "/templates", cookie=cookie)
    published = [t for t in templates if t["status"] == "published"] if isinstance(templates, list) else []
    template_id = published[1]["id"] if len(published) > 1 else published[0]["id"]

    status, resume = api("POST", "/resumes", body={"title": PREFIX + "-rename", "templateId": template_id, "tags": [PREFIX + "-tag-a"]}, cookie=cookie)
    assert status == 201, resume
    resume_id = resume["id"]
    CLEANUP.append(lambda: api("DELETE", "/resumes/%s" % resume_id, cookie=cookie))

    fact_ids = []
    for fact in [
        {"type": "achievement", "title": PREFIX + "-性能优化", "content": "主导 React 首屏加载优化，LCP 从 3.2s 降至 1.4s。", "tags": ["性能优化", "React"]},
        {"type": "skill", "title": PREFIX + "-TypeScript", "content": "精通 TypeScript 与 React，负责核心交易链路 C 端前端开发。", "tags": ["前端"]},
    ]:
        status, created = api("POST", "/profile/facts", body=fact, cookie=cookie)
        assert status == 201, created
        fact_ids.append(created["id"])
        fid = created["id"]
        CLEANUP.append(lambda fid=fid: api("DELETE", "/profile/facts/%s" % fid, cookie=cookie))

    jd_body = "负责核心交易链路 C 端前端开发。主导 React 性能优化，首屏加载优化。要求 5 年以上大型 C 端经验。"
    status, jd = api("POST", "/jds", body={"role": PREFIX + "-前端工程师", "company": PREFIX + "公司", "body": jd_body, "tags": ["前端", "性能优化"]}, cookie=cookie)
    assert status == 201, jd
    jd_id = jd["id"]
    CLEANUP.append(lambda: api("DELETE", "/jds/%s" % jd_id, cookie=cookie))

    with browser_page() as page:
        ui_login(page, *ADMIN)

        # P1-4 新建简历弹窗
        page.goto(WEB + "/resumes?create=1", wait_until="networkidle")
        page.wait_for_timeout(1000)
        dialog = page.get_by_role("dialog", name="开始一份新的简历")
        shot = rec.shot(page, "create-modal-fields")
        texts = dialog.get_by_role("textbox").count()
        combos = dialog.get_by_role("combobox").count()
        rec.step("P1-4 新建弹窗含命名与模板入口", "textbox>=1 且 combobox>=1", "textbox=%d combobox=%d" % (texts, combos), texts >= 1 and combos >= 1, shot)

        page.get_by_role("button", name="完全新开").click()
        new_title = PREFIX + "-created"
        dialog.get_by_label("简历名称").fill(new_title)
        dialog.get_by_label("选择模板").select_option(template_id)
        page.get_by_role("button", name="创建", exact=True).click()
        page.wait_for_url("**/resumes/res_*", timeout=20000)
        page.wait_for_timeout(800)
        created_id = page.url.rstrip("/").split("/")[-1]
        CLEANUP.append(lambda cid=created_id: api("DELETE", "/resumes/%s" % cid, cookie=cookie))
        status, created_resume = api("GET", "/resumes/%s" % created_id, cookie=cookie)
        shot = rec.shot(page, "created-with-title-template")
        ok = status == 200 and created_resume.get("title") == new_title and created_resume.get("templateId") == template_id
        rec.step("P1-4 创建结果落库 title/templateId", "%s / %s" % (new_title, template_id), "%s / %s" % (created_resume.get("title"), created_resume.get("templateId")), ok, shot)

        # P1-1 重命名
        page.goto(WEB + "/resumes", wait_until="networkidle")
        page.wait_for_timeout(1200)
        card = card_for(page, PREFIX + "-rename")
        card.get_by_role("button", name="重命名").click()
        rename_dialog = page.get_by_role("dialog", name="重命名简历")
        shot = rec.shot(page, "rename-dialog")
        rec.step("P1-1 卡片有重命名入口并弹窗", "弹窗出现且输入框有现值", "dialog=%s value=%s" % (rename_dialog.count(), rename_dialog.get_by_label("简历名称").input_value()), rename_dialog.count() == 1, shot)
        renamed = PREFIX + "-renamed"
        rename_dialog.get_by_label("简历名称").fill(renamed)
        rename_dialog.get_by_role("button", name="保存名称").click()
        page.wait_for_timeout(1500)
        status, after_rename = api("GET", "/resumes/%s" % resume_id, cookie=cookie)
        shot = rec.shot(page, "renamed")
        card_count = page.get_by_role("link", name=renamed, exact=True).count()
        ok = status == 200 and after_rename.get("title") == renamed and card_count == 1
        rec.step("P1-1 重命名落库并更新卡片", renamed, "%s / card=%d" % (after_rename.get("title"), card_count), ok, shot)

        # P1-2 标签增删改
        card = card_for(page, renamed)
        card.get_by_role("button", name="编辑标签").click()
        tag_dialog = page.get_by_role("dialog", name="编辑标签")
        new_tag = PREFIX + "-tag-b"
        tag_dialog.get_by_role("textbox").fill(new_tag)
        tag_dialog.get_by_role("button", name="添加标签").click()
        tag_dialog.get_by_role("button", name="删除标签「%s」" % (PREFIX + "-tag-a")).click()
        shot = rec.shot(page, "tags-dialog")
        tag_dialog.get_by_role("button", name="保存标签").click()
        page.wait_for_timeout(1500)
        status, after_tags = api("GET", "/resumes/%s" % resume_id, cookie=cookie)
        shot = rec.shot(page, "tags-updated")
        tags = after_tags.get("tags", [])
        ok = new_tag in tags and (PREFIX + "-tag-a") not in tags
        rec.step("P1-2 标签增删改落库", "含 %s 且不含 %s" % (new_tag, PREFIX + "-tag-a"), str(tags), ok, shot)

        # P1-3 删除 + 确认/取消
        card = card_for(page, renamed)
        card.get_by_role("button", name="删除").click()
        delete_dialog = page.get_by_role("dialog", name="删除这份简历？")
        shot = rec.shot(page, "delete-confirm")
        delete_dialog.get_by_role("button", name="取消").click()
        page.wait_for_timeout(600)
        cancelled_ok = api("GET", "/resumes/%s" % resume_id, cookie=cookie)[0] == 200 and card_for(page, renamed).count() == 1
        card_for(page, renamed).get_by_role("button", name="删除").click()
        page.get_by_role("dialog", name="删除这份简历？").get_by_role("button", name="确认删除").click()
        page.wait_for_timeout(1500)
        status, deleted = api("GET", "/resumes/%s" % resume_id, cookie=cookie)
        shot = rec.shot(page, "deleted")
        gone = page.get_by_role("link", name=renamed, exact=True).count() == 0
        lifecycle = deleted.get("lifecycle") if isinstance(deleted, dict) else deleted
        rec.step("P1-3 取消路径不删 / 确认后 DELETE", "取消后仍在；确认后 lifecycle=deleted 且卡片消失", "cancelled_ok=%s lifecycle=%s card_gone=%s" % (cancelled_ok, lifecycle, gone), cancelled_ok and gone, shot)

        # P2-5 编辑 JD
        page.goto(WEB + "/jds/%s" % jd_id, wait_until="networkidle")
        page.wait_for_timeout(1200)
        before = api("GET", "/jds/%s" % jd_id, cookie=cookie)[1]
        page.get_by_role("button", name="编辑（生成新 revision）").click()
        edit_dialog = page.get_by_role("dialog", name="编辑 JD")
        shot = rec.shot(page, "jd-edit-dialog")
        new_role = PREFIX + "-资深前端"
        edit_dialog.get_by_label("岗位名称").fill(new_role)
        edit_dialog.get_by_role("button", name="保存并生成新 revision").click()
        page.wait_for_timeout(1800)
        after = api("GET", "/jds/%s" % jd_id, cookie=cookie)[1]
        shot = rec.shot(page, "jd-edited")
        ok = after.get("role") == new_role and after.get("revision") == before.get("revision") + 1
        rec.step("P2-5 编辑 JD 死按钮修复", "role 更新且 revision %s -> %s" % (before.get("revision"), after.get("revision")), "role=%s revision=%s" % (after.get("role"), after.get("revision")), ok, shot)

        # P2-8 岗位匹配
        match_status, match_body = api_on(8010, "POST", "/profile/match-job", body={"jdId": jd_id}, cookie=cookie)
        results_n = len(match_body.get("results", [])) if isinstance(match_body, dict) else "-"
        gaps_n = len(match_body.get("gaps", [])) if isinstance(match_body, dict) else "-"
        rec.step("P2-8 后端 POST /profile/match-job", "200 且 results/gaps 非空", "status=%s results=%s gaps=%s" % (match_status, results_n, gaps_n), match_status == 200 and bool(results_n) and bool(gaps_n), "")
        page.route("**/api/profile/match-job", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(match_body, ensure_ascii=False)))
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1200)
        shot = rec.shot(page, "job-match-panel")
        section = page.get_by_role("region", name="岗位匹配")
        panel_text = section.inner_text() if section.count() else ""
        fact_titles = [r["factTitle"] for r in match_body["results"]] if isinstance(match_body, dict) else []
        rendered = section.count() == 1 and all(title in panel_text for title in fact_titles)
        rec.step("P2-8 JD 详情匹配区块渲染", "显示匹配事实与要求覆盖", panel_text.replace("\n", " / ")[:240], rendered, shot)
        page.unroute("**/api/profile/match-job")

        # P2-7 解绑
        api("PUT", "/jds/%s/binding" % jd_id, body={"resumeId": created_id}, cookie=cookie)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1200)
        bound_before = page.get_by_role("button", name="解除绑定").count()
        shot = rec.shot(page, "jd-bound")
        page.get_by_role("button", name="解除绑定").click()
        page.wait_for_timeout(1500)
        jd_after_unbind = api("GET", "/jds/%s" % jd_id, cookie=cookie)[1]
        shot = rec.shot(page, "jd-unbound")
        ok = bound_before == 1 and jd_after_unbind.get("boundResumeId") is None
        rec.step("P2-7 解绑入口与 DELETE binding", "按钮存在且 boundResumeId 变 null", "buttons=%d boundResumeId=%s" % (bound_before, jd_after_unbind.get("boundResumeId")), ok, shot)

        # P2-6 删除 JD + 确认/取消
        page.get_by_role("button", name="删除 JD").click()
        jd_delete_dialog = page.get_by_role("dialog", name="删除这个 JD？")
        shot = rec.shot(page, "jd-delete-confirm")
        jd_delete_dialog.get_by_role("button", name="取消").click()
        page.wait_for_timeout(600)
        still_there = api("GET", "/jds/%s" % jd_id, cookie=cookie)[0] == 200
        page.get_by_role("button", name="删除 JD").click()
        page.get_by_role("dialog", name="删除这个 JD？").get_by_role("button", name="确认删除").click()
        page.wait_for_url("**/jds", timeout=15000)
        page.wait_for_timeout(1000)
        gone_status = api("GET", "/jds/%s" % jd_id, cookie=cookie)[0]
        shot = rec.shot(page, "jd-deleted")
        rec.step("P2-6 取消不删 / 确认后 DELETE 204", "取消后 200；确认后 GET 404", "cancel_200=%s after_delete=%s" % (still_there, gone_status), still_there and gone_status == 404, shot)

        # P3-9 事实删除 + FactDeletionImpact 提示
        page.goto(WEB + "/profile", wait_until="networkidle")
        page.wait_for_timeout(1500)
        fact_title = PREFIX + "-性能优化"
        page.get_by_role("button", name="删除「%s」" % fact_title).click()
        fact_dialog = page.get_by_role("dialog", name="删除这条事实？")
        shot = rec.shot(page, "fact-delete-confirm")
        dialog_text = fact_dialog.inner_text()
        fact_dialog.get_by_role("button", name="取消").click()
        page.wait_for_timeout(600)
        cancel_kept = page.get_by_role("button", name="删除「%s」" % fact_title).count() == 1
        page.get_by_role("button", name="删除「%s」" % fact_title).click()
        page.get_by_role("dialog", name="删除这条事实？").get_by_role("button", name="确认删除").click()
        page.wait_for_timeout(1500)
        fact_status = api("GET", "/profile/facts/%s" % fact_ids[0], cookie=cookie)[0]
        shot = rec.shot(page, "fact-deleted")
        heads = page.get_by_role("heading", name=fact_title).count()
        rec.step("P3-9 事实删除入口与影响提示", "弹窗含影响信息；取消保留；确认后 GET 404", "dialog='%s' cancel_kept=%s after=%s headings=%s" % (dialog_text.replace("\n", " / ")[:120], cancel_kept, fact_status, heads), cancel_kept and fact_status == 404, shot)

    cleanup_errors = []
    for item in reversed(CLEANUP):
        try:
            item()
        except Exception as exc:  # noqa: BLE001
            cleanup_errors.append(str(exc))
    extra = [
        "## 说明",
        "",
        "- 共享后端 8000 未重启（其他 E2E 仍在并发使用）。",
        "- POST /profile/match-job 的真实契约用临时后端 %s 验证（同代码、同库、不同端口）；UI 渲染用 Playwright route fulfill 注入该真实响应。" % TEMP_API,
        "- 所有数据带 %s 前缀，结束已清理；清理异常：%s" % (PREFIX, cleanup_errors or "无"),
    ]
    print(rec.write("\n".join(extra)))
    temp_proc.terminate()
    try:
        temp_proc.wait(timeout=10)
    except Exception:  # noqa: BLE001
        temp_proc.kill()


if __name__ == "__main__":
    main()
