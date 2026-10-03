// 全局滚动条视觉确认件（设计补充，原型见 ui/prototypes/index.html#scrollbar）。
// 纯样式演示：细滑块 + 透明轨道，滑块派生自 --foreground，明暗主题各一份。
// 本目录不在 ui-i18n 门禁扫描范围内，演示文案只用于确认视觉。
function Pane() {
  return (
    <div
      className="card-frame"
      style={{ maxHeight: 220, overflow: "auto", padding: 16 }}
      tabIndex={0}
      role="group"
      aria-label="滚动容器示例"
    >
      <p style={{ margin: "0 0 12px", fontWeight: 700 }}>滚动容器示例</p>
      <p style={{ margin: "0 0 12px" }}>滑块默认 26% 前景色，轨道透明，不与内容争视线。</p>
      <p style={{ margin: "0 0 12px" }}>容器沿用 card-frame 的粗描边与圆角，与既有卡片语言一致。</p>
      <p style={{ margin: "0 0 12px" }}>以下段落仅用于制造溢出，演示滚动条与内容的间距。</p>
      <p style={{ margin: "0 0 12px" }}>滚动条贴容器右缘，不覆盖正文。</p>
      <p style={{ margin: 0 }}>滚动到底部。</p>
    </div>
  )
}

export default {
  title: "Design/Scrollbar",
  parameters: { layout: "fullscreen" },
}

export const Light = {
  render: () => (
    <div className="min-h-screen bg-background p-6">
      <div style={{ maxWidth: 420 }}>
        <Pane />
      </div>
    </div>
  ),
}

export const Dark = {
  render: () => (
    <div className="dark">
      <div className="min-h-screen bg-background p-6 text-foreground">
        <div style={{ maxWidth: 420 }}>
          <Pane />
        </div>
      </div>
    </div>
  ),
}
