// 项目自定义门禁：公开仓库里的本机绝对路径。
// 仓库自 2026-09-29 起为公开仓库，新增文档、工单与示例都不得写入本机绝对路径。
// 只扫描 Git 跟踪的文本文件：未跟踪文件属于本地私有面，不参与公开面校验。
// 规则说明类引用（反引号只包住 /Users/ 这类写法）不含用户名，不会被命中。

import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

const run = promisify(execFile)

// 带用户名的家目录绝对路径：/Users/ 或 C:\Users\ 之后必须紧跟用户名与分隔符。
const PATTERNS = [
  { label: "macOS 家目录", pattern: /\/Users\/[A-Za-z0-9_.-]+\//g },
  { label: "Windows 家目录", pattern: /[A-Za-z]:\\Users\\[A-Za-z0-9_.-]+\\/g },
]

// 本门禁的正则字面量不参与扫描，避免自命中。
const SELF = "quality-gates/gates/repo-private-paths.js"
const MAX_BYTES = 2 * 1024 * 1024

export async function check(projectRoot) {
  let tracked
  try {
    const { stdout } = await run("git", ["ls-files", "-z"], { cwd: projectRoot, maxBuffer: 64 * 1024 * 1024 })
    tracked = stdout.split("\0").filter(Boolean)
  } catch (error) {
    return ["[repo-private-paths] 无法读取 Git 跟踪文件列表：" + (error instanceof Error ? error.message : String(error))]
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
      for (const { label, pattern } of PATTERNS) {
        pattern.lastIndex = 0
        const match = pattern.exec(lines[i])
        if (!match) continue
        failures.push(
          "[repo-private-paths] " + file + ":" + (i + 1) + " 含" + label + "绝对路径 " + match[0] +
            "；公开仓库不得写入本机路径，改成描述性写法或占位符（如 <本机用户名>）。",
        )
      }
    }
  }
  return failures
}
