// DES-012 空 / 加载 / 错误 / 冲突 / 权限不足 / 冻结统一状态块。
// 约束：错误码、用户说明、下一步动作都必须有文本。
// 视觉交给品牌空态（音量档 C：语法 + 标志徽章），本组件只做语义到品牌的映射，
// 因此不再自带图标圆圈；错误与冲突仍由品牌空态以 alert 播报。
import { MascotState, type MascotStateKind } from "@/components/brand"

type StateKind = MascotStateKind

export function StateBlock({
  kind,
  title,
  description,
  errorCode,
  action,
  className,
}: {
  kind: StateKind
  title: string
  description?: string
  errorCode?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <MascotState
      kind={kind}
      mascot="badge"
      title={title}
      description={description}
      errorCode={errorCode}
      action={action}
      className={className}
    />
  )
}
