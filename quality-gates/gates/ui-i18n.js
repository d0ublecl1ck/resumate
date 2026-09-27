// 项目自定义门禁：界面国际化（i18n）。
// 1) zh-CN 与 en 资源键结构必须一致；
// 2) en 资源不得残留未翻译中文（语言名除外）；
// 3) 组件与页面不得硬编码中文界面文案，用户数据可用 \`i18n-allow\` 注释豁免。

import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"

const HAN = /\p{Script=Han}/u
const LOCALE_NAMES = ["zh-CN", "en"]
const ALLOWED_EN_HAN = new Set(["简体中文"])

async function listFiles(dir, filter) {
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(full, filter)))
    else if (filter(full)) files.push(full)
  }
  return files
}

function extractObject(source) {
  const marker = "export default"
  const index = source.indexOf(marker)
  if (index < 0) return null
  const body = source.slice(index + marker.length)
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start < 0 || end < start) return null
  try {
    return new Function("return (" + body.slice(start, end + 1) + ")")()
  } catch {
    return null
  }
}

function allPaths(value, prefix = "") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix]
  const entries = Object.entries(value)
  if (entries.length === 0) return [prefix]
  return entries.flatMap(([key, child]) => allPaths(child, prefix ? prefix + "." + key : key))
}

function collectHan(value, prefix = "", leaks = []) {
  if (typeof value === "string") {
    if (HAN.test(value) && !ALLOWED_EN_HAN.has(value)) leaks.push(prefix + " = " + value)
    return leaks
  }
  if (value === null || typeof value !== "object") return leaks
  for (const [key, child] of Object.entries(value)) collectHan(child, prefix ? prefix + "." + key : key, leaks)
  return leaks
}

function maskBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
}

function stripLineComments(text) {
  return text.replace(/(^|[^:])\/\/.*$/gm, "$1")
}

export async function check(projectRoot) {
  const uiSrc = join(projectRoot, "ui", "src")
  if (!existsSync(uiSrc)) return []

  const failures = []
  const localesDir = join(uiSrc, "i18n", "locales")
  if (!existsSync(localesDir)) {
    return ["[ui-i18n] 缺少 ui/src/i18n/locales/：界面文案必须走 i18n，且需同时提供 zh-CN 与 en。"]
  }

  const pathsByLocale = {}
  for (const locale of LOCALE_NAMES) {
    const dir = join(localesDir, locale)
    const files = await listFiles(dir, (file) => file.endsWith(".ts") && !file.endsWith("index.ts"))
    if (files.length === 0) failures.push("[ui-i18n] 语言 " + locale + " 没有任何命名空间资源文件。")
    const paths = new Set()
    for (const file of files) {
      const parsed = extractObject(await readFile(file, "utf8"))
      if (parsed === null) {
        failures.push("[ui-i18n] " + relative(projectRoot, file) + " 无法解析默认导出对象。")
        continue
      }
      for (const path of allPaths(parsed)) paths.add(path)
    }
    pathsByLocale[locale] = paths
  }

  const zh = pathsByLocale["zh-CN"] ?? new Set()
  const en = pathsByLocale.en ?? new Set()
  for (const key of zh) if (!en.has(key)) failures.push("[ui-i18n] en 缺少词条 " + key)
  for (const key of en) if (!zh.has(key)) failures.push("[ui-i18n] zh-CN 缺少词条 " + key)

  for (const file of await listFiles(join(localesDir, "en"), (f) => f.endsWith(".ts"))) {
    const parsed = extractObject(await readFile(file, "utf8"))
    if (parsed === null) continue
    for (const leak of collectHan(parsed)) {
      failures.push("[ui-i18n] " + relative(projectRoot, file) + " 存在未翻译中文：" + leak)
    }
  }

  const scanDirs = [join(uiSrc, "components"), join(uiSrc, "pages")]
  for (const dir of scanDirs) {
    const files = await listFiles(dir, (file) => /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file))
    for (const file of files) {
      const raw = await readFile(file, "utf8")
      const maskedLines = stripLineComments(maskBlockComments(raw)).split("\n")
      const rawLines = raw.split("\n")
      for (let i = 0; i < maskedLines.length; i += 1) {
        if (!HAN.test(maskedLines[i])) continue
        if ((rawLines[i] ?? "").includes("i18n-allow")) continue
        failures.push("[ui-i18n] " + relative(projectRoot, file) + ":" + (i + 1) + " 存在硬编码界面文案，请改用 t(...)（用户数据可加 i18n-allow 注释豁免）。")
      }
    }
  }

  return failures
}
