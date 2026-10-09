#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""E2E: 注册 / 登录 / 邮箱验证 / 忘记密码重置（auth 领域）。

只写 docs/e2e/2026-10-09/areas/auth/ 与 scripts/auth_*.py；不读主工作区；不改源码。
所有浏览器交互均为 Playwright 无头，locale=zh-CN。
"""
import email as emaillib
import glob
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from email import policy
from pathlib import Path

sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from e2e_lib import Recorder  # noqa: E402

WORKTREE = Path("<本机用户名>/resumate-worktrees/zj-fwwb-2026")
MAIL_DIR = "/tmp/resumate-e2e-mail"
WEB = "http://127.0.0.1:5173"
BACKEND = "http://127.0.0.1:8000"

TS = time.strftime("%Y%m%d-%H%M%S")
EMAIL = "e2e-auth-%s@example.com" % TS
PASSWORD = "E2eAuth!2026"
NEW_PASSWORD = "E2eReset!2026"
CHANGED_PASSWORD = "E2eChanged!2026"
DISPLAY_NAME = "E2E Auth"

rec = Recorder("auth")
EVID = rec.dir

START = time.time()


def log(msg):
    print("[%6.1fs] %s" % (time.time() - START, msg), flush=True)


def note_file(name, text):
    p = EVID / name
    p.write_text(text, encoding="utf-8")
    return str(p)


class Harness:
    def __init__(self, browser):
        self.browser = browser
        self.created = []

    def new_page(self):
        ctx = self.browser.new_context(locale="zh-CN", viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        log = []

        def on_console(m, L=log):
            L.append("%s: %s" % (m.type, m.text))

        def on_error(e, L=log):
            L.append("pageerror: %s" % e)

        page.on("console", on_console)
        page.on("pageerror", on_error)
        page.console_log = log  # type: ignore[attr-defined]
        self.created.append((ctx, page))
        return page

    def close(self):
        for ctx, _ in self.created:
            try:
                ctx.close()
            except Exception:
                pass


@contextmanager
def browser_session():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        h = Harness(browser)
        try:
            yield h
        finally:
            h.close()
            browser.close()


def capture_response(page, url_substr, action, timeout=20000):
    with page.expect_response(lambda r: url_substr in r.url, timeout=timeout) as info:
        action()
    resp = info.value
    status = resp.status
    try:
        body = resp.text()
    except Exception as exc:  # noqa: BLE001
        body = "<unreadable: %s>" % exc
    return status, body


def click_login(page):
    page.get_by_role("button", name="登录", exact=True).click()


def login_ui(page, email, password):
    page.goto(WEB + "/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill(email)
    page.get_by_label("密码").fill(password)


def wait_workbench(page, timeout=20000):
    page.wait_for_url(lambda u: "/login" not in u and u.startswith(WEB), timeout=timeout)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1200)


def wait_for_text(page, text, timeout=20000):
    page.wait_for_selector("text=%s" % text, timeout=timeout)


def parse_eml(path):
    raw = Path(path).read_bytes()
    msg = emaillib.message_from_bytes(raw, policy=policy.default)
    env = str(msg.get("X-Envelope-To", "") or "")
    subject = str(msg.get("Subject", "") or "")
    body = ""
    try:
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    body += part.get_content()
        else:
            body = msg.get_content()
    except Exception:
        payload = msg.get_payload(decode=True)
        if payload:
            body = payload.decode("utf-8", "replace")
    return env, subject, body


def mail_snapshot():
    return set(glob.glob(MAIL_DIR + "/*.eml"))


def wait_for_mail(recipient, marker, before, timeout=25):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for path in sorted(glob.glob(MAIL_DIR + "/*.eml")):
            if path in before:
                continue
            env, subject, body = parse_eml(path)
            if recipient.lower() in env.lower() and marker in body:
                return path, subject, body
        time.sleep(1)
    return None, None, None


def extract_token(body, marker):
    m = re.search(re.escape(marker) + r"\?token=([^\s\"'<>)]+)", body)
    return m.group(1) if m else None


class Rest:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def req(self, method, path, body=None):
        data = None
        headers = {}
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(BACKEND + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=30) as resp:
                return resp.status, resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", "replace")


def code_of(body):
    try:
        return json.loads(body).get("code")
    except Exception:
        return None


def main():
    log("EMAIL=%s" % EMAIL)
    with browser_session() as h:
        page = h.new_page()

        # ============ 1. 注册 ============
        before_register = mail_snapshot()
        try:
            page.goto(WEB + "/login", wait_until="networkidle")
            page.get_by_role("button", name="去注册", exact=True).click()
            page.get_by_label("昵称").fill(DISPLAY_NAME)
            page.get_by_label("邮箱").fill(EMAIL)
            page.get_by_label("密码").fill(PASSWORD)
            reg_status, reg_body = capture_response(
                page, "/api/auth/register",
                lambda: page.get_by_role("button", name="注册", exact=True).click(),
            )
            wait_for_text(page, "去邮箱查收验证链接", timeout=15000)
            shot = rec.shot(page, "01-register-verification-sent")
            rec.step("1 注册新账号", "202 verification_sent 且进入查收验证链接态",
                     "HTTP %s body=%s" % (reg_status, reg_body.strip()),
                     reg_status == 202 and "verification_sent" in reg_body, shot)
            note_file("raw-01-register.txt", "status=%s\nbody=%s\n" % (reg_status, reg_body))
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "01-register-error")
            rec.step("1 注册新账号", "202 且进入查收态", "异常: %s" % exc, False, shot)

        reg_mail, reg_subject, reg_body_mail = wait_for_mail(EMAIL, "/verify-email", before_register)
        old_token = extract_token(reg_body_mail or "", "/verify-email")
        note_file("raw-01-register-mail.txt",
                  "path=%s\nsubject=%s\ntoken=%s\nbody:\n%s" % (reg_mail, reg_subject, old_token, reg_body_mail))
        log("register mail=%s token=%s" % (reg_mail, old_token))

        # ============ 2. 未验证登录被拒 ============
        try:
            page.get_by_role("button", name="返回登录", exact=True).click()
            page.get_by_label("密码").fill(PASSWORD)
            login_status, login_body = capture_response(page, "/api/auth/login", lambda: click_login(page))
            wait_for_text(page, "邮箱还未验证", timeout=10000)
            inline = page.get_by_role("button", name="重新发送验证邮件", exact=True).count()
            shot = rec.shot(page, "02-login-unverified")
            rec.step("2 未验证登录被拒", "403 EMAIL_NOT_VERIFIED + 文案 + 内联重发入口",
                     "HTTP %s code=%s 内联按钮=%d" % (login_status, code_of(login_body), inline),
                     login_status == 403 and code_of(login_body) == "EMAIL_NOT_VERIFIED" and inline == 1, shot)
            note_file("raw-02-login-unverified.txt", "status=%s\nbody=%s\n" % (login_status, login_body))
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "02-login-unverified-error")
            rec.step("2 未验证登录被拒", "403 EMAIL_NOT_VERIFIED", "异常: %s" % exc, False, shot)

        # ============ 6a. 重发冷却 60s ============
        try:
            before_resend1 = mail_snapshot()
            resend_status, resend_body = capture_response(
                page, "/api/auth/verification/resend",
                lambda: page.get_by_role("button", name="重新发送验证邮件", exact=True).click(),
            )
            time.sleep(1.0)
            body_text = page.inner_text("body")
            has_too_soon = "重发过于频繁" in body_text
            mails_after = mail_snapshot() - before_resend1
            shot = rec.shot(page, "03-resend-cooldown")
            rec.step("6a 重发冷却(60s)", "429 RESEND_TOO_SOON + 冷却提示 + 不再发信",
                     "HTTP %s code=%s UI含重发过于频繁=%s 新增邮件=%d" % (
                         resend_status, code_of(resend_body), has_too_soon, len(mails_after)),
                     resend_status == 429 and code_of(resend_body) == "RESEND_TOO_SOON" and has_too_soon and not mails_after, shot)
            note_file("raw-03-resend-cooldown.txt", "status=%s\nbody=%s\n" % (resend_status, resend_body))
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "03-resend-cooldown-error")
            rec.step("6a 重发冷却(60s)", "429 RESEND_TOO_SOON", "异常: %s" % exc, False, shot)

        # ============ 6b. 冷却结束后重发成功 ============
        new_token = None
        try:
            log("等待 62s 让重发冷却过期...")
            time.sleep(62)
            before_resend2 = mail_snapshot()
            resend2_status, resend2_body = capture_response(
                page, "/api/auth/verification/resend",
                lambda: page.get_by_role("button", name="重新发送验证邮件", exact=True).click(),
            )
            time.sleep(1.0)
            body_text = page.inner_text("body")
            shot = rec.shot(page, "04-resend-after-cooldown")
            mail2, subj2, body2 = wait_for_mail(EMAIL, "/verify-email", before_resend2)
            new_token = extract_token(body2 or "", "/verify-email")
            note_file("raw-04-resend-success.txt",
                      "status=%s\nbody=%s\nmail=%s\ntoken=%s" % (resend2_status, resend2_body, mail2, new_token))
            rec.step("6b 冷却后重发成功", "202 + 冷却态 + 收到新验证邮件",
                     "HTTP %s 页面含冷却=%s 新邮件=%s token=%s" % (
                         resend2_status, ("秒后可重发" in body_text), mail2, new_token),
                     resend2_status == 202 and mail2 is not None and new_token is not None, shot)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "04-resend-after-cooldown-error")
            rec.step("6b 冷却后重发成功", "202 + 新验证邮件", "异常: %s" % exc, False, shot)

        # ============ 6c. 无效 token 失效提示 ============
        try:
            page.goto(WEB + "/verify-email?token=invalid-token-e2e-123", wait_until="networkidle")
            wait_for_text(page, "验证链接已失效", timeout=15000)
            page.wait_for_timeout(500)
            body_text = page.inner_text("body")
            shot = rec.shot(page, "05-verify-invalid-token")
            rec.step("6c 无效 token 失效提示", "显示验证链接已失效 + 原因",
                     "含已失效=%s 含已过期=%s" % ("验证链接已失效" in body_text, "链接已过期" in body_text),
                     "验证链接已失效" in body_text and "链接已过期" in body_text, shot)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "05-verify-invalid-token-error")
            rec.step("6c 无效 token 失效提示", "失效页", "异常: %s" % exc, False, shot)

        # ============ 3. 打开验证链接 -> 进入工作台 ============
        verify_ok = False
        try:
            assert new_token, "没有可用的验证 token"
            ver_status, ver_body = capture_response(
                page, "/api/auth/verification/verify",
                lambda: page.goto(WEB + "/verify-email?token=" + new_token, wait_until="networkidle"),
            )
            wait_for_text(page, "邮箱验证成功", timeout=15000)
            verify_ok = True
            shot = rec.shot(page, "06-verify-success")
            page.get_by_role("button", name="进入工作台", exact=True).click()
            wait_workbench(page)
            body_text = page.inner_text("body")
            shot2 = rec.shot(page, "07-workbench-after-verify")
            rec.step("3 验证链接完成验证并进入工作台", "200 验证成功 -> 工作台",
                     "verify HTTP %s 工作台=%s url=%s" % (ver_status, "工作台" in body_text, page.url),
                     ver_status == 200 and "工作台" in body_text, shot + " ; " + shot2)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "06-verify-success-error")
            rec.step("3 验证链接完成验证并进入工作台", "验证成功 -> 工作台", "异常: %s" % exc, False, shot)

        # ============ 5. token 复用失效 ============
        try:
            page.goto(WEB + "/verify-email?token=" + new_token, wait_until="networkidle")
            wait_for_text(page, "验证链接已失效", timeout=15000)
            page.wait_for_timeout(500)
            body_text = page.inner_text("body")
            shot = rec.shot(page, "08-verify-token-reuse")
            rec.step("5 验证 token 复用", "已使用链接再次打开显示失效页",
                     "含已失效=%s" % ("验证链接已失效" in body_text),
                     "验证链接已失效" in body_text, shot)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "08-verify-token-reuse-error")
            rec.step("5 验证 token 复用", "失效页", "异常: %s" % exc, False, shot)

        # ============ 4. 验证后登录 / 退出 ============
        try:
            page.goto(WEB + "/", wait_until="networkidle")
            page.wait_for_timeout(1200)
            page.get_by_role("button", name="退出登录", exact=True).click()
            page.wait_for_url("**/login", timeout=15000)
            page.wait_for_timeout(800)
            shot = rec.shot(page, "09-logout")
            logged_out = "/login" in page.url
            login_ui(page, EMAIL, PASSWORD)
            login2_status, login2_body = capture_response(page, "/api/auth/login", lambda: click_login(page))
            wait_workbench(page)
            body_text = page.inner_text("body")
            shot2 = rec.shot(page, "10-login-verified")
            rec.step("4 验证后登录/退出", "退出回登录页，再登录进工作台",
                     "退出=%s 再登录 HTTP %s 工作台=%s" % (logged_out, login2_status, "工作台" in body_text),
                     logged_out and login2_status == 200 and "工作台" in body_text, shot + " ; " + shot2)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "10-login-verified-error")
            rec.step("4 验证后登录/退出", "退出+登录成功", "异常: %s" % exc, False, shot)

        # ============ 8 前置：另开一个已登录会话 ============
        old_page = h.new_page()
        try:
            login_ui(old_page, EMAIL, PASSWORD)
            click_login(old_page)
            wait_workbench(old_page)
            shot = rec.shot(old_page, "11-old-session-logged-in")
            rec.step("8 前置 另开已登录会话", "第二个 context 用旧密码登录成功",
                     "url=%s" % old_page.url, "/login" not in old_page.url, shot)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(old_page, "11-old-session-login-error")
            rec.step("8 前置 另开已登录会话", "旧会话登录成功", "异常: %s" % exc, False, shot)

        # ============ 7. 忘记密码 -> 重置 ============
        reset_token = None
        try:
            before_forgot = mail_snapshot()
            page.goto(WEB + "/forgot-password", wait_until="networkidle")
            page.get_by_label("邮箱").fill(EMAIL)
            forgot_status, forgot_body = capture_response(
                page, "/api/auth/password/forgot",
                lambda: page.get_by_role("button", name="发送重置邮件", exact=True).click(),
            )
            wait_for_text(page, "去邮箱查收重置链接", timeout=15000)
            shot = rec.shot(page, "12-forgot-sent")
            reset_mail, reset_subject, reset_mail_body = wait_for_mail(EMAIL, "/reset-password", before_forgot)
            reset_token = extract_token(reset_mail_body or "", "/reset-password")
            note_file("raw-07-forgot.txt",
                      "status=%s\nbody=%s\nmail=%s\nsubject=%s\ntoken=%s" % (
                          forgot_status, forgot_body, reset_mail, reset_subject, reset_token))
            rec.step("7 忘记密码提交", "202 reset_sent + 收到重置邮件",
                     "HTTP %s 邮件=%s token=%s" % (forgot_status, reset_mail, reset_token),
                     forgot_status == 202 and reset_token is not None, shot)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "12-forgot-sent-error")
            rec.step("7 忘记密码提交", "202 + 重置邮件", "异常: %s" % exc, False, shot)

        try:
            assert reset_token, "没有重置 token"
            page.goto(WEB + "/reset-password?token=" + reset_token, wait_until="networkidle")
            page.get_by_label("新密码", exact=True).fill(NEW_PASSWORD)
            page.get_by_label("确认新密码", exact=True).fill(NEW_PASSWORD)
            reset_status, reset_body = capture_response(
                page, "/api/auth/password/reset",
                lambda: page.get_by_role("button", name="保存新密码", exact=True).click(),
            )
            wait_for_text(page, "密码已重置", timeout=15000)
            shot = rec.shot(page, "13-reset-success")
            note_file("raw-07-reset.txt", "status=%s\nbody=%s\n" % (reset_status, reset_body))
            rec.step("7 重置新密码", "204 + 密码已重置页",
                     "HTTP %s body=%s" % (reset_status, reset_body.strip()), reset_status == 204, shot)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "13-reset-success-error")
            rec.step("7 重置新密码", "204 + 成功页", "异常: %s" % exc, False, shot)

        # ============ 8. 重置后旧会话失效 ============
        try:
            old_page.reload(wait_until="networkidle")
            try:
                old_page.wait_for_url("**/login", timeout=15000)
            except Exception:
                pass
            old_page.wait_for_timeout(1000)
            shot = rec.shot(old_page, "14-old-session-kicked")
            body_text = old_page.inner_text("body")
            rec.step("8 重置后旧会话失效", "旧 context 刷新后被踢回登录页",
                     "url=%s 登录页=%s" % (old_page.url, "登录 Resumate" in body_text),
                     "/login" in old_page.url and "登录 Resumate" in body_text, shot)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(old_page, "14-old-session-kicked-error")
            rec.step("8 重置后旧会话失效", "被踢回登录页", "异常: %s" % exc, False, shot)

        # ============ 7b. 旧密码失败 / 新密码成功 ============
        try:
            page.goto(WEB + "/login", wait_until="networkidle")
            page.get_by_label("邮箱").fill(EMAIL)
            page.get_by_label("密码").fill(PASSWORD)
            oldpw_status, oldpw_body = capture_response(page, "/api/auth/login", lambda: click_login(page))
            wait_for_text(page, "邮箱或密码不正确", timeout=10000)
            shot = rec.shot(page, "15-old-password-fails")
            rec.step("7b 旧密码登录失败", "401 INVALID_CREDENTIALS + 文案",
                     "HTTP %s code=%s" % (oldpw_status, code_of(oldpw_body)),
                     oldpw_status == 401 and code_of(oldpw_body) == "INVALID_CREDENTIALS", shot)

            page.get_by_label("密码").fill(NEW_PASSWORD)
            newpw_status, newpw_body = capture_response(page, "/api/auth/login", lambda: click_login(page))
            wait_workbench(page)
            shot2 = rec.shot(page, "16-new-password-login")
            body_text = page.inner_text("body")
            rec.step("7b 新密码登录成功", "200 + 工作台",
                     "HTTP %s 工作台=%s" % (newpw_status, "工作台" in body_text),
                     newpw_status == 200 and "工作台" in body_text, shot + " ; " + shot2)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(page, "15-16-password-login-error")
            rec.step("7b 旧/新密码登录", "旧失败 新成功", "异常: %s" % exc, False, shot)

        # ============ 9. 改密（无 UI，走 /api/auth/password；浏览器验证旧会话失效） ============
        try:
            page.goto(WEB + "/settings", wait_until="networkidle")
            page.wait_for_timeout(1200)
            settings_text = page.inner_text("body")
            pw_buttons = page.get_by_role("button", name=re.compile("密码")).count()
            shot = rec.shot(page, "17-settings-no-password-entry")
            rec.step("9 设置页改密入口", "记录是否存在改密 UI",
                     "设置页含密码按钮=%d" % pw_buttons, True, shot)
            note_file("settings-page.txt", settings_text)
        except Exception as exc:  # noqa: BLE001
            rec.step("9 设置页改密入口", "枚举 UI", "异常: %s" % exc, True, "")

        cp_page = h.new_page()
        try:
            login_ui(cp_page, EMAIL, NEW_PASSWORD)
            click_login(cp_page)
            wait_workbench(cp_page)
            shot = rec.shot(cp_page, "18-change-password-old-session")
            rec.step("9 前置 改密前已登录会话", "新密码登录成功", "url=%s" % cp_page.url, "/login" not in cp_page.url, shot)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(cp_page, "18-change-password-session-error")
            rec.step("9 前置 改密前已登录会话", "登录成功", "异常: %s" % exc, False, shot)

        rest = Rest()
        try:
            s_login, s_body = rest.req("POST", "/auth/login", {"email": EMAIL, "password": NEW_PASSWORD})
            wrong_status, wrong_body = rest.req(
                "POST", "/auth/password",
                {"current_password": "WrongPass!999", "new_password": CHANGED_PASSWORD})
            same_status, same_body = rest.req(
                "POST", "/auth/password",
                {"current_password": NEW_PASSWORD, "new_password": NEW_PASSWORD})
            ok_status, ok_body = rest.req(
                "POST", "/auth/password",
                {"current_password": NEW_PASSWORD, "new_password": CHANGED_PASSWORD})
            me_status, me_body = rest.req("GET", "/auth/me")
            note_file("raw-09-change-password.txt",
                      "login=%s %s\nwrong=%s %s\nsame=%s %s\nsuccess=%s %s\nme_after=%s %s\n" % (
                          s_login, s_body, wrong_status, wrong_body, same_status, same_body,
                          ok_status, ok_body, me_status, me_body))
            rec.step("9 改密失败路径(当前密码错误)", "401 INVALID_CREDENTIALS",
                     "HTTP %s code=%s" % (wrong_status, code_of(wrong_body)),
                     wrong_status == 401 and code_of(wrong_body) == "INVALID_CREDENTIALS", "")
            rec.step("9 改密失败路径(新密码=旧密码)", "422 VALIDATION_FAILED",
                     "HTTP %s code=%s" % (same_status, code_of(same_body)),
                     same_status == 422 and code_of(same_body) == "VALIDATION_FAILED", "")
            rec.step("9 改密成功路径", "204",
                     "HTTP %s body=%s" % (ok_status, ok_body.strip()), ok_status == 204, "")
            rec.step("9 改密后 API 会话失效", "GET /auth/me 401",
                     "HTTP %s code=%s" % (me_status, code_of(me_body)),
                     me_status == 401, "")
        except Exception as exc:  # noqa: BLE001
            rec.step("9 改密 API", "失败/成功路径", "异常: %s" % exc, False, "")

        try:
            cp_page.reload(wait_until="networkidle")
            try:
                cp_page.wait_for_url("**/login", timeout=15000)
            except Exception:
                pass
            cp_page.wait_for_timeout(1000)
            shot = rec.shot(cp_page, "19-change-password-session-kicked")
            body_text = cp_page.inner_text("body")
            rec.step("9 改密后旧会话失效(浏览器)", "刷新后被踢回登录页",
                     "url=%s 登录页=%s" % (cp_page.url, "登录 Resumate" in body_text),
                     "/login" in cp_page.url and "登录 Resumate" in body_text, shot)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(cp_page, "19-change-password-session-kicked-error")
            rec.step("9 改密后旧会话失效(浏览器)", "被踢回登录页", "异常: %s" % exc, False, shot)

        try:
            login_ui(cp_page, EMAIL, CHANGED_PASSWORD)
            click_login(cp_page)
            wait_workbench(cp_page)
            body_text = cp_page.inner_text("body")
            shot = rec.shot(cp_page, "20-changed-password-login")
            rec.step("9 改密后新密码可登录", "200 + 工作台",
                     "url=%s 工作台=%s" % (cp_page.url, "工作台" in body_text), "工作台" in body_text, shot)
        except Exception as exc:  # noqa: BLE001
            shot = rec.shot(cp_page, "20-changed-password-login-error")
            rec.step("9 改密后新密码可登录", "工作台", "异常: %s" % exc, False, shot)

    out = rec.write(build_extra())
    log("REPORT=%s" % out)
    print(out)


def build_extra():
    return """## 账号与凭据
- 测试账号：%s （昵称 %s ）
- 初始密码：%s -> 重置后：%s -> 改密后：%s
- 管理员 admin@resumate.dev 未做任何改动。

## 备注
- 前端不存在改密入口：ui/src/lib/api.ts 未声明 POST /auth/password，设置页 /settings（含 access/backup）无密码表单。
  因此第 9 项改密的调用走 REST POST /auth/password，其旧会话失效在浏览器中验证。
- 邮箱验证/重置邮件的链接域名由后端 public_web_base_url（默认 http://localhost:5173）生成；
  报告中的验证/重置均在浏览器打开等价的 http://127.0.0.1:5173/... 链接，token 取自 .eml 原文。
- 环境噪声（非产品缺陷）：vite 对 /@fs/.../geist-*.woff2 返回 403；未登录时 /api/auth/me 401。
""" % (EMAIL, DISPLAY_NAME, PASSWORD, NEW_PASSWORD, CHANGED_PASSWORD)


if __name__ == "__main__":
    main()
