// Epic 14 · SCR-140 岗位题库与知识库（Storybook 先行屏幕）。
// 三层信息架构：四类题概览 → 题目列表（含依据标识）→ 知识库检索（含「依据不足」反例）。
// 岗位切换、题型筛选与知识库联动全部由本地 state 驱动；数据为文件内 mock，不发网络请求。

import { useState, type ComponentType } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, BookOpenCheck, Braces, CircleCheck, FileSearch, Target, Users } from "lucide-react"
import { Panel, SectionHeader } from "./section-header"

type PositionId = "java" | "web"
type CategoryId = "technical" | "deepDive" | "scenario" | "behavioral"
type DifficultyId = "easy" | "medium" | "hard"

type Question = { id: string; category: CategoryId; difficulty: DifficultyId }
type KnowledgeEntry = { id: string; hit: boolean }
type PositionBank = {
  counts: Record<CategoryId, number>
  questions: Question[]
  knowledge: KnowledgeEntry[]
}

const CATEGORY_ORDER: { id: CategoryId; icon: ComponentType<{ className?: string }> }[] = [
  { id: "technical", icon: Braces },
  { id: "deepDive", icon: FileSearch },
  { id: "scenario", icon: Target },
  { id: "behavioral", icon: Users },
]

// 两个岗位维护各自独立的题量、题目与知识条目；切换岗位会整体替换这三份数据。
const BANKS: Record<PositionId, PositionBank> = {
  java: {
    counts: { technical: 128, deepDive: 64, scenario: 48, behavioral: 36 },
    questions: [
      { id: "q1", category: "technical", difficulty: "medium" },
      { id: "q2", category: "deepDive", difficulty: "hard" },
      { id: "q3", category: "scenario", difficulty: "medium" },
      { id: "q4", category: "behavioral", difficulty: "easy" },
      { id: "q5", category: "technical", difficulty: "easy" },
    ],
    knowledge: [
      { id: "e1", hit: true },
      { id: "e2", hit: true },
      { id: "e4", hit: false },
    ],
  },
  web: {
    counts: { technical: 96, deepDive: 52, scenario: 41, behavioral: 28 },
    questions: [
      { id: "w1", category: "technical", difficulty: "medium" },
      { id: "w2", category: "deepDive", difficulty: "hard" },
      { id: "w3", category: "scenario", difficulty: "hard" },
      { id: "w4", category: "behavioral", difficulty: "easy" },
      { id: "w5", category: "technical", difficulty: "medium" },
    ],
    knowledge: [
      { id: "we1", hit: true },
      { id: "we2", hit: true },
      { id: "we4", hit: false },
    ],
  },
}

const DIFFICULTY_TONE: Record<DifficultyId, string> = {
  easy: "border-border bg-muted text-muted-foreground",
  medium: "border-cobalt/40 bg-cobalt/5 text-cobalt",
  hard: "border-coral/40 bg-coral/5 text-coral",
}

export function BankScreen() {
  const { t } = useTranslation()
  const [position, setPosition] = useState<PositionId>("java")
  const [category, setCategory] = useState<CategoryId | null>(null)
  const bank = BANKS[position]
  const questions = category ? bank.questions.filter((question) => question.category === category) : bank.questions

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

      {/* 四类题概览：一行四卡，点击卡片筛选左侧题目列表，再点一次取消筛选。 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CATEGORY_ORDER.map(({ id, icon: Icon }) => {
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
                {t("interviewBank.categories.count", { n: bank.counts[id] })}
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
        {/* 题目列表：每行给出题型、题干、难度与评价依据；列表随岗位与题型筛选变化。 */}
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
          <ul className={category ? "mt-3 divide-y divide-border" : "mt-4 divide-y divide-border"}>
            {questions.map(({ id, category: questionCategory, difficulty }) => (
              <li key={id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 inline-flex w-[5.5rem] shrink-0 justify-center rounded-md border border-border bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                  {t("interviewBank.categories." + questionCategory + ".label")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-6 text-foreground">
                    {t("interviewBank.list.questions." + id + ".text")}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BookOpenCheck className="size-3.5 shrink-0 text-cobalt" aria-hidden />
                    <span className="shrink-0">{t("interviewBank.list.sourceLabel")}</span>
                    <span className="font-medium text-foreground">
                      {t("interviewBank.list.questions." + id + ".source")}
                    </span>
                  </p>
                </div>
                <span className={"mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium " + DIFFICULTY_TONE[difficulty]}>
                  {t("interviewBank.list.difficulty." + difficulty)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* 知识库检索：条目随岗位切换；命中条目给出处与摘要，未命中显式标注不生成引用。 */}
        <Panel title={t("interviewBank.knowledge.title")} caption={t("interviewBank.knowledge.caption")}>
          <ul className="mt-4 space-y-3">
            {bank.knowledge.map(({ id, hit }) => (
              <li
                key={id}
                className={
                  "rounded-lg border p-3 " + (hit ? "border-border bg-background" : "border-coral/50 bg-coral/5")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {hit ? t("interviewBank.knowledge.sourceLabel") : t("interviewBank.knowledge.queryLabel")}
                  </span>
                  <span
                    className={
                      "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium " +
                      (hit ? "border-cobalt/40 bg-cobalt/5 text-cobalt" : "border-coral bg-coral/10 text-coral")
                    }
                  >
                    {hit ? (
                      <CircleCheck className="size-3.5" aria-hidden />
                    ) : (
                      <AlertTriangle className="size-3.5" aria-hidden />
                    )}
                    {hit ? t("interviewBank.knowledge.status.matched") : t("interviewBank.knowledge.status.insufficient")}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-foreground">
                  {t("interviewBank.knowledge.entries." + id + ".name")}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  <span className="font-medium">
                    {hit ? t("interviewBank.knowledge.summaryLabel") : t("interviewBank.knowledge.noSummaryLabel")}
                  </span>
                  <span className="mx-1">·</span>
                  {t("interviewBank.knowledge.entries." + id + ".summary")}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
