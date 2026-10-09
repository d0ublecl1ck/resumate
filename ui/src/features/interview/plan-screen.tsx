// 练习计划与复测（US-14.9 · SCR-149）：左栏是本次评估的薄弱维度，右栏是可增删、可完成、
// 可发起复测的练习项；每个练习项与评估记录 #E-2026-1013 绑定，复测按同一量表对比。
// 数据全部为文件内 mock，交互用本地 useState，不发起任何网络请求。
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CheckCircle2, ClipboardList, ListPlus, RotateCcw, Trash2 } from "lucide-react"
import { Panel, SectionHeader } from "./section-header"

// 关联的原始评估记录：所有练习项都挂在这条记录上。
const EVALUATION_ID = "#E-2026-1013"

type DimensionId = "correctness" | "depth" | "logic" | "fit"
type RetestState = "idle" | "confirm" | "queued"

type Dimension = { id: DimensionId; score: number }
type PlanItem = { id: DimensionId; goal: string; done: boolean; retest: RetestState }

// 四个薄弱维度与本次评估得分（mock）：得分均低于达标线 80。
const DIMENSIONS: Dimension[] = [
  { id: "correctness", score: 62 },
  { id: "depth", score: 68 },
  { id: "logic", score: 71 },
  { id: "fit", score: 74 },
]

const RECORD_FIELDS: { labelKey: string; valueKey: string }[] = [
  { labelKey: "interviewPlan.record.scaleLabel", valueKey: "interviewPlan.record.scaleValue" },
  { labelKey: "interviewPlan.record.dateLabel", valueKey: "interviewPlan.record.dateValue" },
  { labelKey: "interviewPlan.record.roleLabel", valueKey: "interviewPlan.record.roleValue" },
]

const STATUS_BADGE =
  "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium"
const BUTTON_BASE = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium"

function RecordField({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </span>
  )
}

function PlanCard({
  item,
  onGoal,
  onRemove,
  onComplete,
  onRetest,
}: {
  item: PlanItem
  onGoal: (id: DimensionId, goal: string) => void
  onRemove: (id: DimensionId) => void
  onComplete: (id: DimensionId) => void
  onRetest: (id: DimensionId, state: RetestState) => void
}) {
  const { t } = useTranslation()
  const dimensionKey = "interviewPlan.dimensions." + item.id

  return (
    <li className="rounded-lg border border-border bg-secondary p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={"size-2 shrink-0 rounded-full " + (item.done ? "bg-cobalt" : "bg-coral")}
          />
          <h3 className="truncate text-sm font-semibold text-foreground">{t(dimensionKey + ".label")}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={
              STATUS_BADGE +
              " " +
              (item.done ? "border-cobalt/40 bg-cobalt/5 text-cobalt" : "border-border bg-muted text-muted-foreground")
            }
          >
            {item.done ? t("interviewPlan.plan.statusDone") : t("interviewPlan.plan.statusActive")}
          </span>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={t("interviewPlan.plan.remove") + " " + t(dimensionKey + ".label")}
            className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <label htmlFor={"plan-goal-" + item.id} className="w-10 shrink-0 text-xs text-muted-foreground">
          {t("interviewPlan.plan.goalLabel")}
        </label>
        <input
          id={"plan-goal-" + item.id}
          value={item.goal}
          placeholder={t("interviewPlan.plan.goalPlaceholder")}
          onChange={(event) => onGoal(item.id, event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring"
        />
      </div>

      <p className="mt-1 truncate text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("interviewPlan.plan.materialLabel")}</span>
        {" · "}
        {t(dimensionKey + ".material")}
      </p>

      {item.retest === "idle" ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={item.done}
            onClick={() => onComplete(item.id)}
            className={
              BUTTON_BASE +
              " " +
              (item.done
                ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                : "border-cobalt/40 bg-card text-cobalt")
            }
          >
            <CheckCircle2 className="size-3.5" aria-hidden />
            {item.done ? t("interviewPlan.plan.doneLabel") : t("interviewPlan.plan.markDone")}
          </button>
          <button
            type="button"
            onClick={() => onRetest(item.id, "confirm")}
            className={BUTTON_BASE + " border-border bg-card text-foreground"}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {t("interviewPlan.plan.retest")}
          </button>
        </div>
      ) : null}

      {item.retest === "confirm" ? (
        <div className="mt-1.5 rounded-lg border border-cobalt bg-cobalt/5 p-2">
          <p className="text-xs font-medium text-cobalt">
            {t("interviewPlan.plan.retestNote", { id: EVALUATION_ID })}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onRetest(item.id, "queued")}
              className={BUTTON_BASE + " border-cobalt bg-cobalt text-background"}
            >
              {t("interviewPlan.plan.retestConfirm")}
            </button>
            <button
              type="button"
              onClick={() => onRetest(item.id, "idle")}
              className={BUTTON_BASE + " border-border bg-card text-muted-foreground"}
            >
              {t("interviewPlan.plan.retestCancel")}
            </button>
          </div>
        </div>
      ) : null}

      {item.retest === "queued" ? (
        <p className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg border border-cobalt/40 bg-cobalt/5 px-2.5 py-1.5 text-xs text-foreground">
          <RotateCcw className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
          {t("interviewPlan.plan.retestQueued")}
        </p>
      ) : null}
    </li>
  )
}

export function PlanScreen() {
  const { t } = useTranslation()
  const [items, setItems] = useState<PlanItem[]>([])

  function add(id: DimensionId) {
    setItems((prev) =>
      prev.some((item) => item.id === id)
        ? prev
        : [
            ...prev,
            { id, goal: t("interviewPlan.dimensions." + id + ".goal"), done: false, retest: "idle" },
          ],
    )
  }

  function remove(id: DimensionId) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  function setGoal(id: DimensionId, goal: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, goal } : item)))
  }

  function complete(id: DimensionId) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: true, retest: "idle" } : item)),
    )
  }

  function retest(id: DimensionId, state: RetestState) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, retest: state } : item)))
  }

  return (
    <div className="flex flex-col">
      <SectionHeader
        eyebrow={t("interviewPlan.header.eyebrow")}
        title={t("interviewPlan.header.title")}
        description={t("interviewPlan.header.description")}
      />

      {/* 关联的原评估记录：练习与复测都以它为口径基准。 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-5 py-2.5">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ClipboardList className="size-4 text-cobalt" aria-hidden />
          {t("interviewPlan.record.label")}
        </span>
        <span className="text-base font-semibold text-foreground">{t("interviewPlan.record.id")}</span>
        {RECORD_FIELDS.map((field) => (
          <RecordField key={field.labelKey} label={t(field.labelKey)} value={t(field.valueKey)} />
        ))}
        <span className={STATUS_BADGE + " border-cobalt/40 bg-cobalt/5 text-cobalt"}>
          {t("interviewPlan.record.state")}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start gap-5">
        {/* 左栏：薄弱维度，逐项可加入或移出计划。 */}
        <Panel title={t("interviewPlan.weak.title")} caption={t("interviewPlan.weak.caption")}>
          <ul className="mt-3 flex flex-col gap-3">
            {DIMENSIONS.map((dimension) => {
              const added = items.some((item) => item.id === dimension.id)
              return (
                <li
                  key={dimension.id}
                  className={
                    "rounded-lg border p-3 " +
                    (added ? "border-cobalt bg-cobalt/5" : "border-border bg-secondary")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {t("interviewPlan.dimensions." + dimension.id + ".label")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("interviewPlan.weak.scoreLine", { n: dimension.score })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => (added ? remove(dimension.id) : add(dimension.id))}
                      className={
                        BUTTON_BASE +
                        " shrink-0 " +
                        (added
                          ? "border-cobalt/40 bg-card text-cobalt"
                          : "border-cobalt bg-cobalt text-background")
                      }
                    >
                      {added ? t("interviewPlan.weak.remove") : t("interviewPlan.weak.add")}
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-foreground">
                    <span className="text-muted-foreground">
                      {t("interviewPlan.weak.evidenceLabel")}
                    </span>
                    {" · "}
                    {t("interviewPlan.dimensions." + dimension.id + ".evidence")}
                  </p>
                </li>
              )
            })}
          </ul>
        </Panel>

        {/* 右栏：练习计划，空态引导从左侧选择。 */}
        <Panel title={t("interviewPlan.plan.title")} caption={t("interviewPlan.plan.caption")}>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("interviewPlan.plan.countValue", { n: items.length, total: DIMENSIONS.length })}
            </span>
          </div>

          {items.length === 0 ? (
            <div className="mt-2 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted px-6 py-8 text-center">
              <span className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-cobalt">
                <ClipboardList className="size-5" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {t("interviewPlan.plan.emptyTitle")}
              </p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                {t("interviewPlan.plan.emptyBody")}
              </p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cobalt">
                <ListPlus className="size-3.5" aria-hidden />
                {t("interviewPlan.plan.emptyHint")}
              </p>
            </div>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {items.map((item) => (
                <PlanCard
                  key={item.id}
                  item={item}
                  onGoal={setGoal}
                  onRemove={remove}
                  onComplete={complete}
                  onRetest={retest}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

export default PlanScreen
