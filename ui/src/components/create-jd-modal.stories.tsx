// Storybook 确认件：SCR-005「新增 JD」弹窗的 AI 整理链路。
// 用 CreateJdDialogView 逐态呈现（输入 / 整理中 / 成功草案 / 模型未配置 / 解析失败可重试），
// 不接端点、不动路由；界面文案由组件自身 i18n 提供，草案是演示数据。
import i18n from "@/i18n"
import { Screen } from "@/storybook/screen"
import { CreateJdDialogView, type CreateJdDialogViewProps } from "@/components/create-jd-modal"
import type { ProposedJd } from "@/lib/types"

const DRAFT: ProposedJd = {
  role: "高级前端工程师", // i18n-allow: Storybook 演示数据（用户内容不翻译）
  company: "美团", // i18n-allow: Storybook 演示数据
  tags: ["前端", "性能优化"], // i18n-allow: Storybook 演示数据
  body: "负责核心交易链路的前端架构与性能优化，推动组件库与工程化落地。", // i18n-allow: Storybook 演示数据
  sourceUrl: "https://example.com/jobs/123",
  extracted: [{ label: i18n.t("api.jd.extracted.role"), value: "高级前端工程师" }], // i18n-allow: Storybook 演示数据
  parseConfidence: 0.86,
  note: i18n.t("api.jd.note.text"),
  inputSource: "text",
}

function view(overrides: Partial<CreateJdDialogViewProps> = {}) {
  const props: CreateJdDialogViewProps = {
    mode: "text",
    onModeChange: () => {},
    text: "高级前端工程师 · 美团\n职责：负责核心交易链路的前端架构与性能优化。", // i18n-allow: Storybook 演示数据
    onTextChange: () => {},
    parsing: false,
    onTextParse: () => {},
    onImageParse: () => {},
    draft: null,
    onDraftChange: () => {},
    onResetDraft: () => {},
    error: null,
    onRetry: () => {},
    onClose: () => {},
    onCreate: () => {},
    creating: false,
    imageName: null,
    imagePreview: null,
    onPickImage: () => {},
    ...overrides,
  }
  return (
    <Screen path="/jds" chrome={false}>
      <CreateJdDialogView {...props} />
    </Screen>
  )
}

export default {
  title: "Components/CreateJdModal",
  parameters: { layout: "fullscreen" },
}

export const InputReady = { render: () => view() }
export const Parsing = { render: () => view({ parsing: true }) }
export const DraftResult = { render: () => view({ draft: DRAFT }) }
export const ModelNotConfigured = { render: () => view({ error: "MODEL_NOT_CONFIGURED", onOpenSettings: () => {} }) }
export const ParseRetryable = { render: () => view({ error: "UPSTREAM_TIMEOUT" }) }
