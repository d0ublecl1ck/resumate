import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import en from "@/i18n/locales/en/settings"
import zhCN from "@/i18n/locales/zh-CN/settings"

// vitest 由 pnpm -C ui 启动，cwd 是 ui/；兼容从仓库根启动的情况。
const ROOT =
  [resolve(process.cwd(), ".."), process.cwd()].find((dir) => existsSync(resolve(dir, "backend/app/modules/auth/deps.py"))) ??
  process.cwd()

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}
/** 后端 auth deps 的 *_PURPOSE 常量 + access service 里的字面量 purpose。 */
function backendPurposes(): string[] {
  const found = new Set<string>()
  for (const match of read("backend/app/modules/auth/deps.py").matchAll(/^\w*_PURPOSE\s*=\s*"([^"]+)"/gm)) {
    found.add(match[1])
  }
  for (const match of read("backend/app/modules/access/service.py").matchAll(/purpose\s*=\s*"([^"]+)"/g)) {
    found.add(match[1])
  }
  return [...found].sort()
}

describe("访问日志用途本地化", () => {
  it("后端源码确实解析出全部已知 purpose 常量", () => {
    expect(backendPurposes()).toEqual([
      "pat_auth",
      "pat_human_session",
      "pat_scope",
      "run_human_session",
      "run_token_auth",
      "run_token_scope",
      "token_create",
      "token_revoke",
    ])
  })

  it("每个后端 purpose 都有 zh-CN 与 en 词条", () => {
    const missing: string[] = []
    for (const purpose of backendPurposes()) {
      if (!(purpose in zhCN.accessLog.purposeValue)) missing.push("zh-CN:" + purpose)
      if (!(purpose in en.accessLog.purposeValue)) missing.push("en:" + purpose)
    }
    expect(missing).toEqual([])
  })
})
