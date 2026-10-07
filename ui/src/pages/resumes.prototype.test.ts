/// <reference types="node" />
// AC：ui/prototypes/index.html 与 ui/src 实现保持一致。
// 原型是 ui/src 的镜像，实现改动后必须同步原型；这里用文本契约守住简历库这一屏的关键状态，
// 真实渲染由 Storybook 确认件（Pages/Resumes）覆盖。
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const prototype = readFileSync(resolve(process.cwd(), "prototypes/index.html"), "utf8")

describe("简历库原型与实现一致", () => {
  it("登记筛选状态入 URL：tab / q / tag，关闭创建弹窗移除 create=1", () => {
    expect(prototype).toContain('id="screen-resumes"')
    expect(prototype).toContain("/resumes?tab=&q=&tag=")
    expect(prototype).toContain("create=1")
    expect(prototype).toContain("大小写不敏感")
  })

  it("归档 Tab 有卡：已归档徽标不折行 + 恢复按钮 + chips 只统计归档标签", () => {
    expect(prototype).toContain('id="screen-resumes-archived"')
    expect(prototype).toContain("white-space:nowrap")
    expect(prototype).toContain("已归档")
    expect(prototype).toContain("POST /resumes/{id}/archive")
  })

  it("归档空态与筛选空态各自成屏", () => {
    expect(prototype).toContain('id="screen-resumes-archived-empty"')
    expect(prototype).toContain("归档的简历会保留在这里，恢复后可继续编辑。")
    expect(prototype).toContain('id="screen-resumes-filtered-empty"')
    expect(prototype).toContain("已保留当前筛选条件，可清除后查看全部。")
  })
})
