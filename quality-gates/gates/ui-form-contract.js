// 项目门禁：表单与错误契约。
//
// 判定 1（表单契约）：`ui/src/components`、`ui/src/pages` 中带命名字段（`name="..."`）的 `<form>`
//   必须接入 schema 驱动的客户端校验（`react-hook-form` 的 `useForm(` 或 `zodResolver(`）。
//   `noValidate` 只能与 `useForm` 搭配使用，不得用来代替校验。
//   全部判定依据来自一次真实缺陷：注册表单用手写 `<form noValidate>` + 裸 input，
//   唯一校验点落在后端 `EmailStr`，前端零拦截。
//
// 判定 2（错误契约）：引用 `ApiRequestError` 的文件不得把错误对象的 `message`
//   直接作为用户可见文案（`return cause.message` / JSX `{error.message}`）。
//   必须先把机器错误码映射到 i18n 文案；否则后端英文原文会直接落到界面。
//
// 豁免（进仓库、进 review，必须写明理由）：
//   - 文件内出现 `form-allow` 注释 -> 豁免该文件的表单契约判定。
//   - 违规行内出现 `error-message-allow` 注释 -> 豁免该行。

import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"

const SCAN_DIRS = [join("ui", "src", "components"), join("ui", "src", "pages")]
const SOURCE_FILE = /\.(ts|tsx)$/
const NON_SOURCE = /\.(test|stories)\./
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", "storybook-static"])

const FORM_TAG = /<form\b/
const FORM_WIRED = /\buseForm\s*\(|\bzodResolver\s*\(/
const NAMED_FIELD = /\bname=/
const FORM_ALLOW = /form-allow/
const ERROR_ALLOW = /error-message-allow/
const API_ERROR = /\bApiRequestError\b/
const MESSAGE_PASSTHROUGH = /return\b[^\n;]*\.message\b|\{[^\n}]*\.message\b/

async function listSourceFiles(dir) {
  const files = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      files.push(...(await listSourceFiles(full)))
    } else if (entry.isFile() && SOURCE_FILE.test(entry.name) && !NON_SOURCE.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

export async function check(projectRoot) {
  const roots = SCAN_DIRS.map((dir) => join(projectRoot, dir)).filter((dir) => existsSync(dir))
  if (roots.length === 0) return []

  const findings = []
  for (const root of roots) {
    for (const file of await listSourceFiles(root)) {
      const text = await readFile(file, "utf8")
      const rel = relative(projectRoot, file).split(sep).join("/")
      const lines = text.split("\n")

      if (FORM_TAG.test(text) && NAMED_FIELD.test(text) && !FORM_WIRED.test(text) && !FORM_ALLOW.test(text)) {
        const line = lines.findIndex((value) => FORM_TAG.test(value)) + 1
        findings.push(
          rel + ":" + line + " 表单未接入客户端校验（useForm/zodResolver），只能用后端校验兜底 → " +
            "用 zod schema + react-hook-form 在提交前拦截；遗留表单可加 form-allow 注释豁免并写明理由",
        )
      }

      if (API_ERROR.test(text)) {
        lines.forEach((value, index) => {
          if (!MESSAGE_PASSTHROUGH.test(value)) return
          if (ERROR_ALLOW.test(value)) return
          findings.push(
            rel + ":" + (index + 1) + " ApiRequestError 的 message 被直接作为用户可见文案 → " +
              "把机器错误码映射到 i18n 文案（t(...)）；确需原文时在该行加 error-message-allow 注释并写明理由",
          )
        })
      }
    }
  }
  return findings
}
