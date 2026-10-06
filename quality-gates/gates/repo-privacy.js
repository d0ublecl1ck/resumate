// 项目自定义门禁：公开仓库的隐私红线。
// 仓库自 2026-09-29 起为公开仓库，Git 跟踪的文本文件不得出现本机路径、个人邮箱与内网地址。
// 只扫描 Git 跟踪的文本文件；未跟踪文件属于本地私有面。
// 规则说明本身要引用这些模式时，在该行加 privacy-allow 标记（与 i18n-allow / form-allow 同一约定）。

import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

const run = promisify(execFile)

// 每条：label 说明命中了什么，pattern 是检测式，fix 是该行给出的正确做法。
const PATTERNS = [
  {
    label: "macOS 家目录绝对路径",
    pattern: /\/Users\/[A-Za-z0-9_.-]+\//g,
    fix: "改成描述性写法或占位符（如 <本机用户名>）",
  },
  {
    label: "Windows 家目录绝对路径",
    pattern: /[A-Za-z]:\\Users\\[A-Za-z0-9_.-]+\\/g,
    fix: "改成描述性写法或占位符（如 <本机用户名>）",
  },
  {
    label: "Homebrew 安装前缀",
    pattern: /\/opt\/homebrew\//g,
    fix: "改成「Homebrew 前缀」这类描述",
  },
  {
    label: "个人邮箱地址",
    pattern:
      /[A-Za-z0-9._%+-]+@(?:gmail|googlemail|163|126|qq|foxmail|outlook|hotmail|live|yahoo|icloud|me|protonmail|proton|sina|sohu|139|189)\.[A-Za-z]{2,}/g,
    fix: "改用 <接收方邮箱> 这类占位符，或项目自己的域名邮箱",
  },
  {
    label: "内网 IP 地址",
    pattern:
      /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
    fix: "改用 <内网地址> 这类占位符",
  },
]

const ALLOW_MARKER = "privacy-allow"
// 本门禁的正则字面量不参与扫描，避免自命中。
const SELF = "quality-gates/gates/repo-privacy.js"
const MAX_BYTES = 2 * 1024 * 1024

export async function check(projectRoot) {
  let tracked
  try {
    const { stdout } = await run("git", ["ls-files", "-z"], { cwd: projectRoot, maxBuffer: 64 * 1024 * 1024 })
    tracked = stdout.split("\0").filter(Boolean)
  } catch (error) {
    return ["[repo-privacy] 无法读取 Git 跟踪文件列表：" + (error instanceof Error ? error.message : String(error))]
  }

  const failures = []
  for (const file of tracked) {
    if (file === SELF) continue
    let text
    try {
      const raw = await readFile(join(projectRoot, file))
      if (raw.byteLength > MAX_BYTES || raw.includes(0)) continue
      text = raw.toString("utf8")
    } catch {
      continue
    }
    const lines = text.split("\n")
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (line.includes(ALLOW_MARKER)) continue
      for (const { label, pattern, fix } of PATTERNS) {
        pattern.lastIndex = 0
        const match = pattern.exec(line)
        if (!match) continue
        failures.push(
          "[repo-privacy] " + file + ":" + (i + 1) + " 含" + label + " " + match[0] +
            "；公开仓库不得写入，" + fix + "；确属规则说明可加 " + ALLOW_MARKER + " 标记。",
        )
      }
    }
  }
  return failures
}
