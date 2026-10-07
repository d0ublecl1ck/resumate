import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import en from "@/i18n/locales/en/settings"
import zhCN from "@/i18n/locales/zh-CN/settings"

// vitest 由 pnpm -C ui 启动，cwd 是 ui/；兼容从仓库根启动的情况。
const ROOT =
  [resolve(process.cwd(), ".."), process.cwd()].find((dir) => existsSync(resolve(dir, "backend/app/modules/backup/service.py"))) ??
  process.cwd()

/** 后端备份 service 里 BackupNewResource(type=...) 与 BackupIdMapping(..., type=...) 的资源类型。 */
function backendResourceTypes(): string[] {
  const source = readFileSync(resolve(ROOT, "backend/app/modules/backup/service.py"), "utf8")
  const found = new Set<string>()
  for (const line of source.split("\n")) {
    if (!line.includes("BackupNewResource") && !line.includes("BackupIdMapping")) continue
    for (const match of line.matchAll(/type="([^"]+)"/g)) found.add(match[1])
  }
  return [...found].sort()
}

describe("备份导入资源类型本地化", () => {
  it("后端源码确实解析出全部资源类型", () => {
    expect(backendResourceTypes()).toEqual(["JD", "Profile", "ProfileFact", "Resume", "ResumeVersion"])
  })

  it("每个后端资源类型都有 zh-CN 与 en 词条", () => {
    const missing: string[] = []
    for (const type of backendResourceTypes()) {
      if (!(type in zhCN.importModal.resourceType)) missing.push("zh-CN:" + type)
      if (!(type in en.importModal.resourceType)) missing.push("en:" + type)
    }
    expect(missing).toEqual([])
  })
})
