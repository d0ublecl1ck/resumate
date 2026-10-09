// Epic 14 · SCR-140 岗位题库与知识库。
// 真实数据：GET /bank/stats 提供岗位/题型计数，GET /bank/questions 提供分页题目；
// 岗位切换与题型卡片筛选都会带上 role / kind 重新请求，页面不再内置任何 mock 数据。

import { useState, type ComponentType } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { AlertTriangle, BookOpenCheck, Braces, CircleCheck, FileSearch, Target, Users } from "lucide-react"
import { getBankStats, listBankQuestions, type BankDifficulty, type BankKind } from "@/lib/bank-api"
import { searchKnowledgeBase } from "@/lib/kb-api"
import { Panel, SectionHeader } from "./section-header"

type PositionId = "java" | "web"
type CategoryId = "technical" | "deepDive" | "scenario" | "behavioral"

// 后端岗位名属于数据、不参与翻译（i18n-allow 岗位名）；界面标签仍取自 position.*。
const ROLE_VALUES: Record<PositionId, string> = { java: "Java 后端", web: "Web 前端" }

const CATEGORY_ORDER: { id: CategoryId; kind: BankKind; icon: ComponentType<{ className?: string }> }[] = [
  { id: "technical", kind: "technical", icon: Braces },
  { id: "deepDive", kind: "deep_dive", icon: FileSearch },
  { id: "scenario", kind: "scenario", icon: Target },
  { id: "behavioral", kind: "behavioral", icon: Users },
]

const CATEGORY_OF_KIND: Record<BankKind, CategoryId> = {
  technical: "technical",
  deep_dive: "deepDive",
  scenario: "scenario",
  behavioral: "behavioral",
}

const PAGE_SIZE = 20
// 检索面板按题干实时检索，最多展示当前列表前几道题的检索结果。
const KNOWLEDGE_PANEL_LIMIT = 3

const DIFFICULTY_TONE: Record<BankDifficulty, string> = {
  easy: "border-border bg-muted text-muted-foreground",
  medium: "border-cobalt/40 bg-cobalt/5 text-cobalt",
  hard: "border-coral/40 bg-coral/5 text-coral",
}

export function BankScreen() {
  const { t } = useTranslation()
  const [position, setPosition] = useState<PositionId>("java")
  const [category, setCategory] = useState<CategoryId | null>(null)
  const role = ROLE_VALUES[position]
  const activeKind = CATEGORY_ORDER.find((entry) => entry.id === category)?.kind

  const stats = useQuery({ queryKey: ["bank-stats"], queryFn: () => getBankStats() })
  const questions = useQuery({
    queryKey: ["bank-questions", role, activeKind ?? "all"],
    queryFn: () => listBankQuestions({ role, kind: activeKind, size: PAGE_SIZE }),
  })

  const roleStats = stats.data?.roles.find((entry) => entry.role === role)
  const items = questions.data?.items ?? []
  const filteredTotal = questions.data?.total ?? 0

  // 检索面板按题干实时检索：拿当前列表的题目逐条查真实 /kb/search，命中给出处与
  // 摘要，未命中显式标注「依据不足 · 不生成引用」。题目已回填的 knowledgeRefs 只在
  // 列表行静态展示，不作为检索输入——否则回填结果会「自己命中自己」，证明不了什么。
  const knowledgeItems = items.slice(0, KNOWLEDGE_PANEL_LIMIT)
  const knowledgeQueries = useQueries({
    queries: knowledgeItems.map((item) => ({
      queryKey: ["kb-search", role, item.id],
      queryFn: () => searchKnowledgeBase({ q: item.prompt, role, limit: 1 }),
    })),
  })
  const knowledgeRows = knowledgeItems.map((item, index) => ({
    item,
    result: knowledgeQueries[index]?.data,
  }))

  function switchPosition(next: PositionId) {
    if (next === position) return
    setPosition(next)
    setCategory(null)
  }

  function toggleCategory(next: CategoryId) {
    setCategory((prev) => (prev === next ? null : next))
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow={t("interviewBank.eyebrow")}
        title={t("interviewBank.title")}
        description={t("interviewBank.description")}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">{t("interviewBank.position.label")}</span>
            <div
              role="group"
              aria-label={t("interviewBank.position.label")}
              className="inline-flex rounded-lg border border-border bg-muted p-1"
            >
              {(["java", "web"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={position === id}
                  onClick={() => switchPosition(id)}
                  className={
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                    (position === id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {t("interviewBank.position." + id)}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        <span>{t("interviewBank.total", { n: stats.data?.total ?? 0 })}</span>
        <span>{t("interviewBank.roleTotal", { role: t("interviewBank.position." + position), n: roleStats?.total ?? 0 })}</span>
        <span>{t("interviewBank.filteredTotal", { n: filteredTotal })}</span>
      </div>

      {/* 四类题概览：一行四卡，计数来自 /bank/stats，点击卡片按 kind 重新请求列表。 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CATEGORY_ORDER.map(({ id, kind, icon: Icon }) => {
          const active = category === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => toggleCategory(id)}
              className={
                "block w-full rounded-xl border p-5 text-left transition-colors " +
                (active ? "border-cobalt bg-cobalt/5" : "border-border bg-card hover:bg-accent")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-semibold text-card-foreground">{t("interviewBank.categories." + id + ".label")}</p>
                <span
                  className={
                    "flex size-9 shrink-0 items-center justify-center rounded-lg " +
                    (active ? "bg-cobalt/15 text-cobalt" : "bg-secondary text-cobalt")
                  }
                >
                  <Icon className="size-5" aria-hidden />
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold leading-none text-cobalt">
                {t("interviewBank.categories.count", { n: roleStats?.kinds[kind] ?? 0 })}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {active
                  ? t("interviewBank.categories.filtered")
                  : t("interviewBank.categories." + id + ".description")}
              </p>
            </button>
          )
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel title={t("interviewBank.list.title")} caption={t("interviewBank.list.caption")}>
          {category ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-cobalt/40 bg-cobalt/5 px-3 py-1.5 text-xs">
              <span className="text-cobalt">
                {t("interviewBank.list.filteredBy", {
                  category: t("interviewBank.categories." + category + ".label"),
                })}
              </span>
              <button
                type="button"
                onClick={() => setCategory(null)}
                className="shrink-0 font-medium text-cobalt underline-offset-2 hover:underline"
              >
                {t("interviewBank.list.clearFilter")}
              </button>
            </div>
          ) : null}

          {questions.isPending ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("interviewBank.list.loading")}</p>
          ) : null}
          {questions.isError ? (
            <p role="alert" className="mt-4 text-sm text-coral">
              {t("interviewBank.list.error")}
            </p>
          ) : null}
          {!questions.isPending && !questions.isError && items.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("interviewBank.list.empty")}</p>
          ) : null}

          <ul className={category ? "mt-3 divide-y divide-border" : "mt-4 divide-y divide-border"}>
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 inline-flex w-[5.5rem] shrink-0 justify-center rounded-md border border-border bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                  {t("interviewBank.categories." + CATEGORY_OF_KIND[item.kind] + ".label")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-6 text-foreground">{item.prompt}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BookOpenCheck className="size-3.5 shrink-0 text-cobalt" aria-hidden />
                    <span className="shrink-0">{t("interviewBank.list.sourceLabel")}</span>
                    <span className="truncate font-medium text-foreground">
                      {item.knowledgeRefs[0] ?? item.referencePoints[0] ?? t("interviewBank.list.basisUnavailable")}
                    </span>
                  </p>
                </div>
                <span className={"mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium " + DIFFICULTY_TONE[item.difficulty]}>
                  {t("interviewBank.list.difficulty." + item.difficulty)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t("interviewBank.knowledge.title")} caption={t("interviewBank.knowledge.caption")}>
          {knowledgeRows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("interviewBank.knowledge.empty")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {knowledgeRows.map(({ item, result }) => {
                const hit = result?.results[0]
                if (hit) {
                  return (
                    <li key={item.id} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{t("interviewBank.knowledge.questionLabel")}</span>
                        <span className="inline-flex items-center gap-1 rounded-md border border-cobalt/40 bg-cobalt/5 px-2 py-0.5 text-xs font-medium text-cobalt">
                          <CircleCheck className="size-3.5" aria-hidden />
                          {t("interviewBank.knowledge.status.matched")}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium leading-6 text-foreground">{item.prompt}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        <span className="font-medium">{t("interviewBank.knowledge.sourceLabel")}</span>
                        <span className="mx-1">·</span>
                        {hit.source}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        <span className="font-medium">{t("interviewBank.knowledge.summaryLabel")}</span>
                        <span className="mx-1">·</span>
                        {hit.summary}
                      </p>
                    </li>
                  )
                }
                if (result === undefined) return null
                return (
                  <li key={item.id} className="rounded-lg border border-coral/50 bg-coral/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{t("interviewBank.knowledge.questionLabel")}</span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-coral bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral">
                        <AlertTriangle className="size-3.5" aria-hidden />
                        {t("interviewBank.knowledge.status.insufficient")}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium leading-6 text-foreground">{item.prompt}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      <span className="font-medium">{t("interviewBank.knowledge.noSummaryLabel")}</span>
                      <span className="mx-1">·</span>
                      {t("interviewBank.knowledge.noMatchDescription")}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
