// 设置页用户可见文案不得暴露内部组件名或开发术语；zh/en 键结构必须一致。

import { describe, expect, it } from "vitest"
import en from "@/i18n/locales/en/settings"
import zhCN from "@/i18n/locales/zh-CN/settings"

function paths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix]
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return [prefix]
  return entries.flatMap(([key, child]) => paths(child, prefix ? prefix + "." + key : key))
}

describe("settings 用户文案", () => {
  it("不再出现内部组件名 ThemeSync", () => {
    expect(zhCN.preferences.themeHint).not.toContain("ThemeSync")
    expect(en.preferences.themeHint).not.toContain("ThemeSync")
  })

  it("快捷键保存动作不再出现开发术语 flush", () => {
    expect(zhCN.preferences.shortcutAction.save_flush).not.toMatch(/flush/i)
    expect(en.preferences.shortcutAction.save_flush).not.toMatch(/flush/i)
  })

  it("zh/en 键结构一致", () => {
    expect(paths(zhCN).sort()).toEqual(paths(en).sort())
  })
})
