// i18n 冒烟：键结构对齐、切换语言、持久化与文档同步。

import { afterEach, describe, expect, it } from "vitest"
import i18n, { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, changeLocale, currentLocale } from "@/i18n"
import en from "@/i18n/locales/en"
import zhCN from "@/i18n/locales/zh-CN"

function collectKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => collectKeys(child, prefix ? prefix + "." + key : key))
}

afterEach(() => {
  changeLocale(DEFAULT_LOCALE)
})

describe("i18n", () => {
  it("zh-CN 与 en 资源的键结构完全一致", () => {
    expect(collectKeys(en).sort()).toEqual(collectKeys(zhCN).sort())
  })

  it("切换语言会更新翻译、html lang、文档标题并持久化", async () => {
    changeLocale("en")
    await i18n.changeLanguage("en")

    expect(i18n.t("common.actions.accept")).toBe("Accept")
    expect(currentLocale()).toBe("en")
    expect(document.documentElement.lang).toBe("en")
    expect(document.title).toBe("Resumate · Conversational Resume Workspace")
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en")
  })

  it("支持 zh-CN 与 en 两种语言", () => {
    expect(SUPPORTED_LOCALES.map((locale) => locale.code)).toEqual(["zh-CN", "en"])
  })

  it("领域正文中的原始内容不由 i18n 改写", async () => {
    changeLocale("en")
    await i18n.changeLanguage("en")
    const { RESUMES } = await import("@/lib/content")
    expect(RESUMES[0].title).toBe("高级前端工程师简历")
  })
})
