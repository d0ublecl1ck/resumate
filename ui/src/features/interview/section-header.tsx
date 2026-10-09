// 面试能力界面的统一页头：供 Storybook 先行的四个屏幕共用，保证页头层级一致。
import type { ReactNode } from "react"

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium tracking-[0.18em] text-cobalt uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** 内容卡片：统一圆角、描边与内边距，避免各屏幕各写一套样式。 */
export function Panel({
  title,
  caption,
  children,
  className,
}: {
  title?: string
  caption?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={"rounded-xl border border-border bg-card p-5 " + (className ?? "")}>
      {title ? <h2 className="text-sm font-semibold text-card-foreground">{title}</h2> : null}
      {caption ? <p className="mt-1 text-xs text-muted-foreground">{caption}</p> : null}
      {children}
    </section>
  )
}
