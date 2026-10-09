#!/usr/bin/env python3
"""开放接入（PAT/审计）+ 备份导入导出 浏览器 E2E（无头）。

账号：state.json 里的 e2e-bak-<ts>（REST 注册 + 邮件验邮），绝不用 admin 做导入。
每步都真点浏览器 + 截图；REST 仅用于准备数据与交叉验证。最后 rec.write() 生成 REPORT.md。
"""
import http.cookiejar
import json
import re
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import API, WEB, E2E_DIR, Recorder, browser_page

AREA = E2E_DIR / "areas" / "access-backup"
RAW = AREA / "raw"
RAW.mkdir(parents=True, exist_ok=True)
STATE = json.loads((AREA / "state.json").read_text(encoding="utf-8"))

EMAIL = STATE["email"]
PASSWORD = STATE["password"]
PREFIX = STATE["prefix"]
USER_ID = STATE["userId"]
TOKEN_NAME = PREFIX + " 只读Token-" + time.strftime("%H%M%S")
SESSION = {"cookie": STATE["cookie"]}

rec = Recorder("access-backup")
rec.step("准备：注册并验邮的隔离账号", "账号为 e2e-bak-<ts>，非 admin", "email=%s userId=%s" % (EMAIL, USER_ID), True, "state.json")
rec.step("准备：账号内数据", "2 份简历 + 1 JD + 1 事实",
         "prefix=%s resumes=%s jd=%s" % (PREFIX, STATE["resumeCountAfterSeed"], STATE["jd"]["body"]["id"]), True,
         str(AREA / "state.json"))
seed_resume_ids = {r["id"] for r in STATE["resumes"]}


def dump(name, obj):
    path = RAW / name
    text = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False, indent=2)
    path.write_text(text, encoding="utf-8")
    return str(path)


def _once(method, path, *, body=None, cookie=None, headers=None):
    hdrs = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    if cookie:
        hdrs["Cookie"] = cookie
    req = urllib.request.Request(API + path, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8", "replace"), {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace"), {k.lower(): v for k, v in exc.headers.items()}


def call(method, path, *, body=None, cookie=None, headers=None, raw=False, retries=4):
    """带重试的 REST 调用，返回 (status, parsed_or_text, headers)。"""
    last = None
    result = None
    for _ in range(retries):
        try:
            result = _once(method, path, body=body, cookie=cookie, headers=headers)
            break
        except Exception as exc:
            last = exc
            time.sleep(1.5)
    if result is None:
        raise last
    status, text, hdrs = result
    if raw:
        return status, text, hdrs
    try:
        return status, json.loads(text), hdrs
    except Exception:
        return status, text, hdrs


def login_cookie(email, password):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(API + "/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with opener.open(req, timeout=30) as resp:
        resp.read()
    return "; ".join("%s=%s" % (c.name, c.value) for c in jar)


def pat_call(method, path, pat, body=None):
    status, text, _ = call(method, path, body=body, headers={"Authorization": "Bearer " + pat}, raw=True)
    return status, text


def table_rows(page):
    rows = page.locator("table tbody tr")
    data = []
    for i in range(rows.count()):
        cells = rows.nth(i).locator("td")
        data.append([cells.nth(j).inner_text().strip() for j in range(cells.count())])
    return data


def run(page):
    global COOKIE
    page.goto(WEB + "/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill(EMAIL)
    page.get_by_label("密码").fill(PASSWORD)
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.wait_for_timeout(1200)
    # 用浏览器刚建立的会话覆盖 REST cookie，避免 seed 会话过期。
    SESSION["cookie"] = "; ".join("%s=%s" % (c["name"], c["value"]) for c in page.context.cookies())
    shot = rec.shot(page, "01-login-user")
    rec.step("浏览器登录隔离账号", "进入工作台（非 admin）", "url=%s title=%s" % (page.url, page.title()), "/login" not in page.url, shot)

    # 清掉本前缀的历史 PAT，保证 UI 只有本次新建的一枚
    status, tokens, _ = call("GET", "/access/tokens", cookie=SESSION["cookie"])
    old = [t for t in tokens if str(t.get("name", "")).startswith(PREFIX)] if isinstance(tokens, list) else []
    for t in old:
        if t.get("status") != "revoked":
            call("POST", "/access/tokens/%s/revoke" % t["id"], cookie=SESSION["cookie"])
    rec.step("清理历史同名 PAT", "运行前仅保留本次新建", "cleaned=%d" % len(old), True, "")

    # ================= A. 开放接入 / PAT =================
    page.goto(WEB + "/settings/access", wait_until="networkidle")
    page.get_by_role("heading", name="个人访问令牌（PAT）").wait_for(timeout=15000)
    page.wait_for_timeout(1000)
    body_text = page.inner_text("body")
    shot = rec.shot(page, "02-access-page")
    rec.step("打开 /settings/access", "渲染 PAT 区、审计日志区、公共接入能力区",
             "含标题=%s/%s/%s" % ("个人访问令牌（PAT）" in body_text, "访问审计日志" in body_text, "公共接入能力" in body_text),
             all(k in body_text for k in ("个人访问令牌（PAT）", "访问审计日志", "公共接入能力")), shot)

    page.get_by_role("button", name="创建最小权限 Token").click()
    dialog = page.get_by_role("dialog")
    dialog.wait_for(state="visible", timeout=8000)
    dialog.get_by_placeholder("例如：本地 MCP 客户端").fill(TOKEN_NAME)
    for scope, want in (("profile:read", False), ("resume:read", True)):
        cb = dialog.locator("label").filter(has_text=scope).locator("input[type=checkbox]")
        if cb.is_checked() != want:
            cb.click()
    shot = rec.shot(page, "03-pat-modal-scopes")
    checked = [s for s in ("profile:read", "resume:read", "resume:write", "jd:read", "jd:write")
               if dialog.locator("label").filter(has_text=s).locator("input[type=checkbox]").is_checked()]
    rec.step("PAT 创建弹窗只勾最小 scope", "仅 resume:read", "checked=%s" % checked, checked == ["resume:read"], shot)

    dialog.get_by_role("button", name="创建", exact=True).click()
    dialog.locator("code").wait_for(timeout=10000)
    secret = dialog.locator("code").inner_text().strip()
    secret_ok = bool(re.match(r"^rsm_pat_[A-Za-z0-9_\-]+$", secret))
    once_hint = "凭证只显示这一次" in dialog.inner_text()
    shot = rec.shot(page, "04-pat-secret-once")
    rec.step("签发后明文只显示一次", "code 形如 rsm_pat_* 且提示一次性",
             "secret前缀=%s 长度=%d 一次性提示=%s" % (secret[:16], len(secret), once_hint), secret_ok and once_hint, shot)
    (RAW / "pat-secret.txt").write_text(secret, encoding="utf-8")

    copy_ok = True
    try:
        dialog.get_by_role("button", name="复制").click()
        page.wait_for_timeout(300)
    except Exception:
        copy_ok = False
    dialog.get_by_role("button", name="完成").click()
    dialog.wait_for(state="hidden", timeout=8000)
    rec.step("点击复制并完成关闭弹窗", "复制成功、弹窗关闭", "copy_ok=%s dialogClosed=%s" % (copy_ok, dialog.is_hidden()), copy_ok and dialog.is_hidden(), "")

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1200)
    content = page.content()
    shot = rec.shot(page, "05-after-reload")
    after_text = page.inner_text("body")
    rec.step("刷新设置页后明文不再可见", "页面无明文 secret，列表仍显示 token 名称",
             "secretInDom=%s tokenNameVisible=%s" % (secret in content, TOKEN_NAME in after_text),
             (secret not in content) and (TOKEN_NAME in after_text), shot)

    status, raw_tokens, hdrs = call("GET", "/access/tokens", cookie=SESSION["cookie"], raw=True)
    dump("access-tokens.json", raw_tokens)
    parsed = json.loads(raw_tokens) if raw_tokens.strip() else []
    mine = [t for t in parsed if t.get("name") == TOKEN_NAME]
    dump("access-tokens-mine.json", mine)
    entry = mine[0] if mine else {}
    rec.step("REST GET /access/tokens 只见元数据、无明文", "响应不含 secretOnce 明文，secret 字符串不出现",
             "status=%s secretInBody=%s secretOnce=%s fields=%s" % (
                 status, secret in raw_tokens, entry.get("secretOnce"), sorted(entry.keys())),
             status == 200 and (secret not in raw_tokens) and (not entry.get("secretOnce")), str(RAW / "access-tokens-mine.json"))

    _, my_rest_view, _ = call("GET", "/resumes", cookie=SESSION["cookie"])
    my_rest_ids = {r["id"] for r in my_rest_view} if isinstance(my_rest_view, list) else set()
    status, body = pat_call("GET", "/resumes", secret)
    dump("pat-get-resumes.json", body)
    try:
        listing = json.loads(body)
        count = len(listing)
        ids = {r["id"] for r in listing}
    except Exception:
        count, ids = -1, set()
    rec.step("PAT 调用 GET /resumes", "200 且只返回本账号全部简历（PAT 与会话视角一致）",
             "status=%s patCount=%s sessionCount=%d ids==sessionIds:%s bodyHead=%s" % (
                 status, count, len(my_rest_ids), ids == my_rest_ids, body[:100]),
             status == 200 and ids == my_rest_ids and count == len(my_rest_ids), str(RAW / "pat-get-resumes.json"))

    status, body = pat_call("POST", "/resumes", secret, body={"title": PREFIX + " 越权新建", "templateId": "tpl_classic"})
    dump("pat-scope-denied.json", body)
    rec.step("只读 PAT 调写接口 POST /resumes", "403 SCOPE_INSUFFICIENT，原始 body 留证",
             "status=%s body=%s" % (status, body), status == 403 and "SCOPE_INSUFFICIENT" in body, str(RAW / "pat-scope-denied.json"))

    for _ in range(22):
        pat_call("GET", "/resumes", secret)
    rec.step("生成足量审计日志", "PAT 认证 allowed 记录足够触发第二页", "额外 22 次 GET /resumes", True, "")

    page.goto(WEB + "/settings/access", wait_until="networkidle")
    page.get_by_role("heading", name="访问审计日志").wait_for(timeout=15000)
    page.wait_for_timeout(1500)
    page_text = page.inner_text("body")
    total_match = re.search(r"共 (\d+) 条", page_text)
    ui_total = int(total_match.group(1)) if total_match else None
    status, rest_rows_body, rest_hdrs = call("GET", "/access/logs?page=1&size=20", cookie=SESSION["cookie"])
    rest_total = int(rest_hdrs.get("x-total-count", "-1"))
    rows = table_rows(page)
    times = [r[0] for r in rows]
    descending = all(times[i] >= times[i + 1] for i in range(len(times) - 1))
    shot = rec.shot(page, "06-logs-list")
    rec.step("审计日志列表与 REST 一致 + 时间倒序", "UI 共 N 条 == X-Total-Count；时间列降序",
             "ui_total=%s rest_total=%s ui_rows=%d descending=%s first=%s last=%s" % (
                 ui_total, rest_total, len(rows), descending, times[0] if times else None, times[-1] if times else None),
             ui_total == rest_total and len(rows) == 20 and descending, shot)

    page.get_by_label("用途").select_option("token_create")
    page.wait_for_timeout(1200)
    rows = table_rows(page)
    purposes = [r[4] for r in rows]
    status, rest_rows, _ = call("GET", "/access/logs?purpose=token_create&page=1&size=20", cookie=SESSION["cookie"])
    shot = rec.shot(page, "07-logs-filter-purpose")
    rec.step("审计筛选：用途=创建访问令牌", "UI 行全部为该用途，且与 REST 同筛选一致",
             "ui_purposes=%s rest_count=%d" % (set(purposes), len(rest_rows) if isinstance(rest_rows, list) else -1),
             bool(rows) and set(purposes) == {"创建访问令牌"} and len(rows) == len(rest_rows), shot)

    page.get_by_label("用途").select_option("")
    page.wait_for_timeout(600)
    page.get_by_label("结果").select_option("denied")
    page.wait_for_timeout(1200)
    rows = table_rows(page)
    results = [r[5] for r in rows]
    status, rest_rows, _ = call("GET", "/access/logs?result=denied&page=1&size=20", cookie=SESSION["cookie"])
    shot = rec.shot(page, "08-logs-filter-result")
    rec.step("审计筛选：结果=拒绝", "UI 行全部为拒绝（拒绝 + 错误码），且与 REST 同筛选一致",
             "ui_results=%s ui_rows=%d rest_count=%d" % (results, len(rows), len(rest_rows) if isinstance(rest_rows, list) else -1),
             bool(rows) and all(x.startswith("拒绝") for x in results) and len(rows) == len(rest_rows), shot)

    page.get_by_label("结果").select_option("")
    page.wait_for_timeout(600)
    page.get_by_label("搜索客户端 / Scope / 资源").fill(TOKEN_NAME)
    page.wait_for_timeout(1400)
    rows = table_rows(page)
    clients = {r[1] for r in rows}
    status, rest_rows, _ = call("GET", "/access/logs?q=" + urllib.parse.quote(TOKEN_NAME) + "&page=1&size=20", cookie=SESSION["cookie"])
    shot = rec.shot(page, "09-logs-filter-keyword")
    rec.step("审计筛选：关键字", "UI 命中该 client 的记录，且与 REST 同筛选一致",
             "ui_clients=%s ui_rows=%d rest_count=%d" % (clients, len(rows), len(rest_rows) if isinstance(rest_rows, list) else -1),
             bool(rows) and clients == {TOKEN_NAME} and len(rows) == len(rest_rows), shot)

    page.get_by_label("搜索客户端 / Scope / 资源").fill("")
    page.wait_for_timeout(1400)
    page_text = page.inner_text("body")
    page1_match = re.search(r"第 (\d+) / (\d+) 页", page_text)
    next_button = page.get_by_role("button", name="下一页")
    can_next = next_button.is_enabled()
    shot = rec.shot(page, "10-logs-page1")
    next_button.click()
    page.wait_for_timeout(1200)
    page2_text = page.inner_text("body")
    page2_match = re.search(r"第 (\d+) / (\d+) 页", page2_text)
    prev_enabled = page.get_by_role("button", name="上一页").is_enabled()
    shot = rec.shot(page, "11-logs-page2")
    page1_ok = bool(page1_match) and page1_match.group(1) == "1" and int(page1_match.group(2)) >= 2 and can_next
    page2_ok = bool(page2_match) and page2_match.group(1) == "2" and page2_match.group(2) == (page1_match.group(2) if page1_match else "") and prev_enabled
    rec.step("审计日志分页", "第 1/N 页可下一页，第 2/N 页可上一页（N>=2）",
             "page1=%s nextEnabled=%s page2=%s prevEnabled=%s" % (
                 page1_match.group(0) if page1_match else None, can_next,
                 page2_match.group(0) if page2_match else None, prev_enabled),
             page1_ok and page2_ok, shot)
    rec.step("审计日志无时间范围筛选参数", "接口仅 purpose/result/q/page/size（记 FAIL 缺口）",
             "OpenAPI /access/logs 参数 = purpose,result,q,page,size", False, "openapi.json")

    page.goto(WEB + "/settings/access", wait_until="networkidle")
    page.wait_for_timeout(1200)
    card = page.locator("li").filter(has_text=TOKEN_NAME).first
    card.get_by_role("button", name="撤销").click()
    page.wait_for_timeout(1500)
    card_text = card.inner_text()
    shot = rec.shot(page, "12-pat-revoked")
    rec.step("UI 撤销 PAT", "状态变已撤销，撤销按钮消失",
             "cardText=%s revokedButton=%d" % (card_text.replace("\n", " / "), card.get_by_role("button", name="撤销").count()),
             "已撤销" in card_text and card.get_by_role("button", name="撤销").count() == 0, shot)

    status, body = pat_call("GET", "/resumes", secret)
    dump("pat-after-revoke.json", body)
    rec.step("撤销后再用同一 PAT 调用", "401 TOKEN_REVOKED，原始 body 留证",
             "status=%s body=%s" % (status, body), status in (401, 403) and "TOKEN_REVOKED" in body, str(RAW / "pat-after-revoke.json"))

    page.goto(WEB + "/settings/access", wait_until="networkidle")
    page.wait_for_timeout(1200)
    page.get_by_label("用途").select_option("token_revoke")
    page.wait_for_timeout(1200)
    rows = table_rows(page)
    shot = rec.shot(page, "13-logs-after-revoke")
    rec.step("撤销后审计出现撤销记录", "用途=撤销访问令牌 至少 1 行", "rows=%d purposes=%s" % (len(rows), {r[4] for r in rows}),
             bool(rows) and {r[4] for r in rows} == {"撤销访问令牌"}, shot)
    page.get_by_label("用途").select_option("")
    page.wait_for_timeout(1000)

    # ================= B. 备份导出 / 导入 =================
    page.goto(WEB + "/settings/backup", wait_until="networkidle")
    page.get_by_role("heading", name="导出完整备份").wait_for(timeout=15000)
    page.wait_for_timeout(800)
    body_text = page.inner_text("body")
    shot = rec.shot(page, "20-backup-page")
    rec.step("打开 /settings/backup", "渲染导出区与导入区",
             "exportTitle=%s importTitle=%s" % ("导出完整备份" in body_text, "导入结构化备份" in body_text),
             "导出完整备份" in body_text and "导入结构化备份" in body_text, shot)

    _, my_resumes_before_export, _ = call("GET", "/resumes", cookie=SESSION["cookie"])
    my_ids = {r["id"] for r in my_resumes_before_export} if isinstance(my_resumes_before_export, list) else set()
    json_path = AREA / "exported-backup.json"
    download_ok, download_err = False, ""
    try:
        with page.expect_download(timeout=15000) as dl_info:
            page.get_by_role("button", name="导出 JSON（权威）").click()
        dl_info.value.save_as(str(json_path))
        download_ok = True
    except Exception as exc:
        download_err = str(exc)
    exported = json.loads(json_path.read_text(encoding="utf-8")) if download_ok and json_path.exists() else None
    if exported:
        res_ids = {r["id"] for r in exported["resources"]["resumes"]}
        isolated = res_ids == my_ids
        owner_ok = exported.get("ownerId") == USER_ID
        detail = "format=%s ownerOk=%s resumes=%d sessionResumes=%d ids==myRest:%s jdTitles=%s" % (
            exported.get("formatVersion"), owner_ok, len(res_ids), len(my_ids), isolated,
            [j.get("role") for j in exported["resources"]["jobDescriptions"]])
        ok = download_ok and owner_ok and isolated and len(res_ids) == len(my_ids)
    else:
        detail, ok = "downloadErr=%s" % download_err, False
    shot = rec.shot(page, "21-export-json")
    rec.step("UI 导出 JSON（权威）", "下载成功，ownerId=本人，简历集合与本人一致（不含他人）", detail, ok, str(json_path))
    exp_r = len(exported["resources"]["resumes"]) if exported else 0
    exp_j = len(exported["resources"]["jobDescriptions"]) if exported else 0

    page.wait_for_timeout(700)
    md_path = AREA / "exported-backup.md"
    md_ok, md_err = False, ""
    try:
        with page.expect_download(timeout=15000) as dl_info:
            page.get_by_role("button", name="导出 Markdown 索引").click()
        dl_info.value.save_as(str(md_path))
        md_ok = True
    except Exception as exc:
        md_err = str(exc)
    md_text = md_path.read_text(encoding="utf-8") if md_ok and md_path.exists() else ""
    structure_ok = all(k in md_text for k in ("# Resumate 备份索引", "## Profile", "## 简历", "## 岗位", "版本总数："))
    shot = rec.shot(page, "22-export-markdown")
    rec.step("UI 导出 Markdown 索引", "结构可读：标题/Profile/简历/岗位/版本总数",
             "mdOk=%s hasSections=%s head=%s" % (md_ok, structure_ok, md_text[:60].replace("\n", " / ")),
             md_ok and structure_ok, str(md_path))

    corrupt = AREA / "corrupt.json"
    corrupt.write_text("{ this is not json", encoding="utf-8")
    page.locator("input[type=file]").set_input_files(str(corrupt))
    page.wait_for_timeout(1000)
    parse_err_visible = page.get_by_text("无法解析备份文件，请选择有效的 JSON 导出。").count() > 0
    shot = rec.shot(page, "23-import-corrupt")
    rec.step("导入损坏 JSON", "提示无法解析备份文件", "提示可见=%s" % parse_err_visible, parse_err_visible, str(corrupt))

    bad = AREA / "bad-version.json"
    bad.write_text(json.dumps({"formatVersion": "nope", "resources": {}}), encoding="utf-8")
    # 重置页面状态，避免与上一步「损坏 JSON」的本地提示相互干扰；并轮询等待异步报错渲染。
    page.goto(WEB + "/settings/backup", wait_until="networkidle")
    page.get_by_role("heading", name="导出完整备份").wait_for(timeout=15000)
    page.wait_for_timeout(400)
    page.locator("input[type=file]").set_input_files(str(bad))
    biz_ok = False
    for _ in range(20):
        if "不支持的备份格式版本" in page.inner_text("body"):
            biz_ok = True
            break
        page.wait_for_timeout(300)
    status, raw_body, _ = call("POST", "/backup/import:preview", cookie=SESSION["cookie"],
                               body={"formatVersion": "nope", "resources": {}}, raw=True)
    dump("import-preview-bad-version.json", raw_body)
    shot = rec.shot(page, "24-import-bad-version")
    rec.step("导入结构非法 JSON（版本错）", "UI 展示后端业务校验原文且 REST 一致",
             "uiMsg=%s restStatus=%s restBody=%s" % (biz_ok, status, raw_body), biz_ok and status == 422, str(RAW / "import-preview-bad-version.json"))

    page.locator("input[type=file]").set_input_files(str(json_path))
    dialog = page.get_by_role("dialog")
    dialog.wait_for(state="visible", timeout=10000)
    page.wait_for_timeout(600)
    dlg_text = dialog.inner_text()
    preview_ok = (("导入预览" in dlg_text) and ("将新增的资源" in dlg_text) and (PREFIX + " 简历A" in dlg_text)
                  and ("不会覆盖的现有资源" in dlg_text) and (("简历 %d / 版本" % exp_r) in dlg_text))
    shot = rec.shot(page, "25-import-preview")
    rec.step("导入预览（合法备份）", "展示新增/不覆盖统计与资源清单",
             "dlgHead=%s" % dlg_text[:160].replace("\n", " / "), preview_ok, str(json_path))

    status, preview_body, _ = call("POST", "/backup/import:preview", cookie=SESSION["cookie"], body=exported)
    dump("import-preview.json", preview_body)
    rec.step("REST 交叉验证 import:preview", "status=valid，resumes/jds 计数与导出文件一致",
             "manifest=%s newResources=%d bindings=%d" % (
                 preview_body.get("manifest", {}).get("resourceCounts"),
                 len(preview_body.get("newResources", [])), len(preview_body.get("bindingRestores", []))),
             preview_body.get("status") == "valid"
             and preview_body.get("manifest", {}).get("resourceCounts", {}).get("resumes") == exp_r
             and preview_body.get("manifest", {}).get("resourceCounts", {}).get("jds") == exp_j,
             str(RAW / "import-preview.json"))

    status, before_resumes, _ = call("GET", "/resumes", cookie=SESSION["cookie"])
    status, before_jds, _ = call("GET", "/jds", cookie=SESSION["cookie"])
    before_r = len(before_resumes) if isinstance(before_resumes, list) else -1
    before_j = len(before_jds) if isinstance(before_jds, list) else -1
    dialog.get_by_role("button", name="确认导入为新资源").click()
    page.wait_for_timeout(2500)
    page_text = page.inner_text("body")
    done_ok = (("已导入 %d 份简历、%d 个岗位。" % (exp_r, exp_j)) in page_text)
    shot = rec.shot(page, "26-import-done")
    status, after_resumes, _ = call("GET", "/resumes", cookie=SESSION["cookie"])
    status, after_jds, _ = call("GET", "/jds", cookie=SESSION["cookie"])
    after_r = len(after_resumes) if isinstance(after_resumes, list) else -1
    after_j = len(after_jds) if isinstance(after_jds, list) else -1
    before_titles = {x["title"] for x in before_resumes}
    imported_titles = [r["title"] for r in after_resumes if r["title"] not in before_titles]
    rec.step("确认导入并 REST 交叉验证落库", "简历 %d->%d、岗位 %d->%d，落库数量 + 导出数量" % (before_r, before_r + exp_r, before_j, before_j + exp_j),
             "uiDone=%s resumes %d->%d jds %d->%d newTitles=%s" % (
                 done_ok, before_r, after_r, before_j, after_j, imported_titles),
             done_ok and after_r == before_r + exp_r and after_j == before_j + exp_j, shot)

    status, final_export, _ = call("GET", "/backup/export", cookie=SESSION["cookie"])
    dump("final-export.json", final_export)
    counts = {k: len(v) for k, v in final_export["resources"].items()}
    rec.step("导入后再导出（REST）", "resumes=%d,jobDescriptions=%d,且每份简历 1 个版本,profiles=1" % (before_r + exp_r, before_j + exp_j),
             "counts=%s" % counts,
             counts.get("resumes") == before_r + exp_r and counts.get("resumeVersions") == counts.get("resumes")
             and counts.get("jobDescriptions") == before_j + exp_j and counts.get("profiles") == 1,
             str(RAW / "final-export.json"))

    admin_cookie = login_cookie("admin@resumate.dev", "resumate-admin")
    status, admin_resumes, _ = call("GET", "/resumes", cookie=admin_cookie)
    admin_ids = {r["id"] for r in admin_resumes} if isinstance(admin_resumes, list) else set()
    mine_ids = {r["id"] for r in final_export["resources"]["resumes"]}
    rec.step("跨账号隔离（只读对照 admin）", "本账号导出的简历 id 与 admin 的零交集",
             "adminResumes=%d overlap=%d" % (len(admin_ids), len(admin_ids & mine_ids)),
             len(admin_ids & mine_ids) == 0, "")

    errs = [c for c in getattr(page, "console_log", []) if c.startswith("error") or c.startswith("pageerror")]
    (RAW / "console.log").write_text("\n".join(errs), encoding="utf-8")
    font_noise = [e for e in errs if "geist" in e or "403" in e or "Failed to load resource" in e]
    clipboard_noise = [e for e in errs if "Clipboard" in e and "permission denied" in e]
    dupkey = [e for e in errs if "Encountered two children with the same key" in e]
    rec.step("缺陷复现：导入预览重复标题触发 React duplicate key",
             "不应出现 duplicate key 警告（导入允许同名资源，key 必须含 id）",
             "dupKeyWarnings=%d 示例=%s" % (len(dupkey), dupkey[0][:160] if dupkey else None),
             len(dupkey) == 0, str(RAW / "console.log"))
    real_errs = [e for e in errs if e not in font_noise and e not in clipboard_noise and e not in dupkey]
    rec.step("控制台错误盘点", "除字体 403、无头剪贴板权限拒绝、已知 duplicate key 外无其它错误",
             "errors=%d fontNoise=%d clipboardDenied=%d dupKey=%d other=%s" % (
                 len(errs), len(font_noise), len(clipboard_noise), len(dupkey), real_errs[:3]),
             len(real_errs) == 0, str(RAW / "console.log"))


EXTRA = """## 缺陷 / 观察

### D1 共享脚手架 e2e_lib.api_login 指向错误路由（工具缺陷，非产品缺陷）
- 现象：e2e_lib.api_login() 与 _login_cookie() 都 POST http://127.0.0.1:8000/login，本实例实际路由是 /auth/login。
- 最小复现：
  1. curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8000/login -H 'Content-Type: application/json' -d '{"email":"admin@resumate.dev","password":"resumate-admin"}' -> 404
  2. 同参数打 http://127.0.0.1:8000/auth/login -> 200
- 影响：任何直接调用 api_login 的子代理都会失败。我已在 access_backup_seed.py 内自带 login_cookie 绕开，未改共享文件。

### D2 审计日志无「时间范围」筛选（需求/实现差异，记 FAIL 缺口）
- 需求要求审计按「动作/结果/时间」筛选；实际 /access/logs 只接受 purpose / result / q / page / size，没有起止时间参数。
- 证据：backend/app/modules/access/api.py:46；OpenAPI /access/logs 参数列表。
- 现状：仅能按时间倒序浏览，无法按时间区间过滤。非崩溃缺陷。

### D3 PAT 列表不返回 token_prefix（低风险观察）
- PersonalAccessToken 存了 token_prefix（backend/app/modules/access/service.py:117），但 PersonalAccessTokenResponse 未暴露该字段。
- 影响：列表只能看到 name/id/scope/时间，无法区分同名 token 的前缀；安全上不泄露明文，属暴露不足而非泄露。

### D4 复制按钮未处理剪贴板拒绝（低severity健壮性观察）
- access-panel.tsx 复制按钮写作 void navigator.clipboard?.writeText(secret)，没有 catch；无头环境剪贴板权限被拒时浏览器报 pageerror: Failed to execute 'writeText' on 'Clipboard': Write permission denied.
- 影响：真实浏览器用户若拒绝剪贴板权限，点击「复制」无任何反馈且控制台抛未处理 rejection；明文仍只在弹窗内一次可见。
- 复现：无头 Playwright 打开签发弹窗点「复制」，采集 pageerror（本报告控制台步骤的 clipboardDenied 计数）。

### D5 导入预览列表 React key 冲突（真实前端缺陷，已最小化复现）
- 现象：备份里存在两份同名资源时，导入预览「将新增的资源」列表触发 React 控制台 error：Encountered two children with the same key ...。
- 根因：ui/src/components/backup-panel.tsx:219 用 key={resource.type + resource.title}；导入设计明确允许同名资源（界面原文「同名资源不会被合并或覆盖，导入始终创建新资源并重新映射 ID」），所以 type+title 不唯一。
- 最小复现：见 areas/access-backup/minimal-repro-dupkey.md；上传仅含两份同标题 Resume 的合法备份即可稳定复现。
- 证据：raw/console.log、minimal-repro-dupkey.md、minimal-repro-dupkey-*.png。
- 影响：列表项身份不稳定，React 可能重复或漏渲染；不影响导入落库（REST 计数正确）。

### 环境噪声
- 期间后端进程被并发工作流重启过一次（uvicorn PID 75376 -> 85266），脚本内 REST 调用已加重试；不影响结论。
- 本 area 账号在修复脚本后的重跑中发生过一次真实导入，final-export 计数断言已改为相对值；证据以最终这次运行为准。
"""


def main():
    try:
        with browser_page() as page:
            run(page)
    except Exception:
        rec.step("E2E 执行中断", "无异常", traceback.format_exc().splitlines()[-1][:300], False, "")
    print(rec.write(EXTRA))


if __name__ == "__main__":
    main()
