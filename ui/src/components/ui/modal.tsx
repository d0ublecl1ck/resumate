// 通用模态原语：封装 @base-ui/react 的 Dialog，集中承担模态交互契约，
// 避免每个弹窗各写一套焦点管理。
// 契约：打开时焦点进入弹窗、Tab/Shift+Tab 锁在弹窗内、Esc 关闭、
// 关闭后焦点归还触发元素、打开期间背景 inert 且对辅助技术隐藏。
// 用法：
//   <Modal open={open} onOpenChange={setOpen} title={t("...")} description={t("...")}>
//     ...表单正文与底部动作...
//   </Modal>
// 传入 initialFocus 可指定打开时聚焦的元素；不传则由 Base UI 聚焦第一个可聚焦元素。
// 传入 finalFocus 可指定关闭后的焦点落点；当触发元素在打开前会失焦（例如请求期间 disabled）时必须显式传入。
// placement="right" 渲染为右侧抽屉（表格类弹窗仍用默认居中）；
// closeLabel 覆盖关闭按钮的可访问名，方便与遮罩等「关闭」入口区分。

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { useEffect, useState, type ComponentProps, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

/** 弹窗所在的 portal 顶层元素：沿父链上溯到 body 的直接子节点。 */
function portalHost(popup: HTMLElement): Element {
  let node: Element = popup
  while (node.parentElement && node.parentElement !== node.ownerDocument.body) {
    node = node.parentElement
  }
  return node
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  initialFocus,
  finalFocus,
  placement = "center",
  closeLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
  initialFocus?: ComponentProps<typeof DialogPrimitive.Popup>["initialFocus"]
  /** 关闭后的焦点落点；不传则归还打开前的焦点元素（触发元素若在打开前失焦则需显式传入）。 */
  finalFocus?: ComponentProps<typeof DialogPrimitive.Popup>["finalFocus"]
  /** center：居中弹窗（默认）；right：贴右侧的抽屉。 */
  placement?: "center" | "right"
  /** 关闭按钮的可访问名；默认沿用通用「关闭」。 */
  closeLabel?: string
}) {
  const { t } = useTranslation()
  // portal 内容在挂载后才出现，用回调节点让 inert 标记在挂载后补跑一次。
  const [popupElement, setPopupElement] = useState<HTMLDivElement | null>(null)

  // Base UI 的 modal dialogs 负责焦点陷阱与 aria-hidden；inert 由本原语补齐，
  // 让背景在打开期间同时不可点击、不可聚焦。
  useEffect(() => {
    if (!open || !popupElement) return
    const host = portalHost(popupElement)
    const marked: HTMLElement[] = []
    for (const child of Array.from(popupElement.ownerDocument.body.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (child === host || child.contains(host)) continue
      if (child.hasAttribute("inert")) continue
      child.setAttribute("inert", "")
      marked.push(child)
    }
    return () => {
      for (const element of marked) element.removeAttribute("inert")
    }
  }, [open, popupElement])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/40" />
        <DialogPrimitive.Popup
          ref={setPopupElement}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          role="dialog"
          aria-modal="true"
          className={cn(
            placement === "right"
              ? "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col overflow-hidden border-l-2 border-foreground bg-card p-0 outline-none"
              : "fixed top-1/2 left-1/2 z-50 max-h-[88vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto card-frame p-6 outline-none",
            className,
          )}
        >
          <div className={cn("flex items-start justify-between gap-4", placement === "right" && "border-b border-border px-4 py-3")}>
            <DialogPrimitive.Title className="font-serif text-xl font-bold text-foreground">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label={closeLabel ?? t("common.actions.close")}>
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          {description ? (
            <DialogPrimitive.Description className={cn("mt-2 text-sm text-muted-foreground", placement === "right" && "mt-0 px-4 pb-2")}>
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
