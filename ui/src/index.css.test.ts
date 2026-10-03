/// <reference types="node" />
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// Vitest 以 ui/ 为工作目录运行（见 vitest.config.ts），因此这里读的是本包自己的样式表。
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8")

// 全局滚动条契约：原型 ui/prototypes/index.html#scrollbar 定稿的细滑块 + 透明轨道，
// 必须由 index.css 全局提供，且颜色只能派生自主题 token（禁止裸色值）。
// jsdom 不计算滚动条样式，因此用文本契约守住这条视觉基线；真实渲染由 Storybook 确认件
// （Design/Scrollbar 与 Components/CreateResumeModal）覆盖。

describe("全局滚动条契约", () => {
  it("声明标准属性：细滚动条 + 26% 前景色滑块 + 透明轨道", () => {
    expect(css).toMatch(/scrollbar-width:\s*thin/)
    expect(css).toMatch(
      /scrollbar-color:\s*color-mix\(in oklab, var\(--foreground\) 26%, transparent\) transparent/,
    )
  })

  it("提供 WebKit 回落：10px 轨道 + 圆角内缩滑块", () => {
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*width:\s*10px/)
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:\s*999px/)
    expect(css).toMatch(
      /::-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*color-mix\(in oklab, var\(--foreground\) 26%, transparent\)/,
    )
  })

  it("滑块与轨道不出现裸色值", () => {
    const scrollbarBlock = css.slice(css.indexOf("::-webkit-scrollbar"), css.length)
    expect(scrollbarBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/)
  })
})
