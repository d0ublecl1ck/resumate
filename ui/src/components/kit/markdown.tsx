// 最小安全 Markdown 渲染：只处理标题 / 无序与有序列表 / 加粗 / 行内 code / 引用。
// 仓库没有可用的 Markdown 依赖，对话气泡又需要基本富文本；这里全程拼接 React 元素，
// 绝不使用 dangerouslySetInnerHTML，未支持的语法（表格、图片、链接、代码块、斜体）
// 原样当纯文本渲染，原始 HTML 也被 React 自动转义，不会注入 DOM。

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^\s*[-*]\s+(.*)$/
const ORDERED = /^\s*\d+\.\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/

function isBlockStart(line: string): boolean {
  return HEADING.test(line) || BULLET.test(line) || ORDERED.test(line) || QUOTE.test(line)
}

/** 行内语法：先取 code span，再取加粗，其余为纯文本。 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g
  let last = 0
  let index = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = keyPrefix + ":i" + index
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em] text-foreground">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      )
    }
    last = match.index + token.length
    index += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function blocks(text: string): ReactNode[] {
  const lines = text.split(/\r?\n/)
  const out: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (line.trim() === "") {
      i += 1
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      const depth = heading[1]!.length
      const Tag = (depth === 1 ? "h3" : depth === 2 ? "h4" : "h5") as "h3" | "h4" | "h5"
      out.push(
        <Tag key={"b" + key} className="font-semibold text-foreground">
          {inline(heading[2]!, "h" + key)}
        </Tag>,
      )
      key += 1
      i += 1
      continue
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line)
      const items: ReactNode[] = []
      while (i < lines.length) {
        const item = (ordered ? ORDERED : BULLET).exec(lines[i] ?? "")
        if (!item) break
        items.push(<li key={"li" + i}>{inline(item[1]!, "l" + key + ":" + i)}</li>)
        i += 1
      }
      out.push(
        ordered ? (
          <ol key={"b" + key} className="list-decimal space-y-0.5 pl-5 marker:text-muted-foreground">
            {items}
          </ol>
        ) : (
          <ul key={"b" + key} className="list-disc space-y-0.5 pl-5 marker:text-muted-foreground">
            {items}
          </ul>
        ),
      )
      key += 1
      continue
    }
    if (QUOTE.test(line)) {
      const parts: string[] = []
      while (i < lines.length) {
        const quoted = QUOTE.exec(lines[i] ?? "")
        if (!quoted) break
        parts.push(quoted[1] ?? "")
        i += 1
      }
      out.push(
        <blockquote key={"b" + key} className="border-l-2 border-border pl-2.5 text-muted-foreground">
          {inline(parts.join(" "), "q" + key)}
        </blockquote>,
      )
      key += 1
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length) {
      const current = lines[i] ?? ""
      if (current.trim() === "" || isBlockStart(current)) break
      paragraph.push(current)
      i += 1
    }
    out.push(<p key={"b" + key}>{inline(paragraph.join(" "), "p" + key)}</p>)
    key += 1
  }
  return out
}

export function MarkdownMessage({ text, className }: { text: string; className?: string }) {
  return <div className={cn("space-y-1.5", className)}>{blocks(text)}</div>
}
