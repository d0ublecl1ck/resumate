// 静态校验：源码中出现的每个字面量翻译键都必须在 zh-CN 与 en 两种语言里存在。
// 动态键（如 t("common.executionMode." + mode)）由前缀校验兜底。
// 用 Vite 的 import.meta.glob(?raw) 读取源码，避免依赖 node 类型。

import { describe, expect, it } from "vitest"
import en from "@/i18n/locales/en"
import zhCN from "@/i18n/locales/zh-CN"

const RAW = import.meta.glob("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>

const SOURCES = Object.entries(RAW)
  .filter(([path]) => !path.includes("/locales/") && !/\.test\.(ts|tsx)$/.test(path))
  .map(([, text]) => text)

function resolveKey(resources: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (node === null || typeof node !== "object") return undefined
    return (node as Record<string, unknown>)[part]
  }, resources)
}

const LITERAL_KEY = /\bt\(\s*"([A-Za-z][\w.]*)"/g
const DYNAMIC_PREFIX = /\bt\(\s*"([A-Za-z][\w.]*\.[\w.]*)\.\s*\+\s*/g

function collect(regex: RegExp): string[] {
  const found = new Set<string>()
  for (const text of SOURCES) {
    for (const match of text.matchAll(regex)) found.add(match[1])
  }
  return [...found]
}

describe("translation keys", () => {
  it("源码里的每个字面量键都能在两种语言中解析", () => {
    const missingZh: string[] = []
    const missingEn: string[] = []
    for (const key of collect(LITERAL_KEY)) {
      // 以 "." 结尾的是动态键前缀（t("a.b." + value)），由下一个用例校验。
      if (key.endsWith(".")) continue
      if (resolveKey(zhCN, key) === undefined) missingZh.push(key)
      if (resolveKey(en, key) === undefined) missingEn.push(key)
    }
    expect(missingZh).toEqual([])
    expect(missingEn).toEqual([])
  })

  it("源码里的每个动态键前缀都解析为至少一个词条", () => {
    const missing: string[] = []
    for (const prefix of collect(DYNAMIC_PREFIX)) {
      for (const [locale, resources] of [["zh-CN", zhCN], ["en", en]] as const) {
        const node = resolveKey(resources, prefix)
        if (node === null || typeof node !== "object" || Object.keys(node).length === 0) {
          missing.push(locale + ":" + prefix)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
