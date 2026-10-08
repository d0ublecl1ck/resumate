/// <reference types="node" />
// AC：ui/prototypes/index.html 与 ui/src 的对话区实现保持一致（issue 3fdec）。
// 原型是 ui/src 的镜像：先补原型状态再改实现；本文件用文本契约守住新增的五个状态，
// 真实渲染由 Storybook 确认件（Components/RunPanel、Components/ResumeEditor）覆盖。
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const prototype = readFileSync(resolve(process.cwd(), "prototypes/index.html"), "utf8")

describe("对话区原型与实现一致", () => {
  it("登记 issue 3fdec 的五个对话区状态", () => {
    expect(prototype).toContain('id="screen-editor"')
    expect(prototype).toContain("发送会结算当前轮次并作废待审批的待办")
    expect(prototype).toContain("自动滚动")
    expect(prototype).toContain("Agent Markdown")
    expect(prototype).toContain("推理与工具活动")
    expect(prototype).toContain("载入服务端版本")
  })
})
