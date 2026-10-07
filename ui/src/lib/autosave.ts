// 空闲自动保存（C-05）：设置项边界 + 静默计时。
// 计时归零后由调用方 flush 成一个 source=manual 版本；计时期间服务端只持有草稿缓冲。
import { useEffect, useRef, useState } from "react"

export const DEFAULT_AUTOSAVE_SECONDS = 10
export const MIN_AUTOSAVE_SECONDS = 3
export const MAX_AUTOSAVE_SECONDS = 120

/** 把任意输入收进合法区间；非数字回落到默认 10 秒。设置页、前端与后端校验共用同一套边界。 */
export function clampAutosaveSeconds(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_AUTOSAVE_SECONDS
  return Math.min(MAX_AUTOSAVE_SECONDS, Math.max(MIN_AUTOSAVE_SECONDS, Math.trunc(parsed)))
}

/** 合法区间判定：设置页据此做提交前拦截，避免 clamp 静默改写用户输入；后端 Field(ge/le) 继续兜底。 */
export function isValidAutosaveSeconds(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_AUTOSAVE_SECONDS && value <= MAX_AUTOSAVE_SECONDS
}

/**
 * 静默计时器：active 为真时按 seconds 倒计时，归零调用 onIdle；
 * revision 每次变化（有效输入）就重置计时。返回剩余秒数供 UI 展示。
 */
export function useIdleAutosave({
  active,
  seconds,
  revision,
  onIdle,
}: {
  active: boolean
  seconds: number
  revision: number
  onIdle: () => void
}): number {
  const [remaining, setRemaining] = useState(seconds)
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!active) {
      setRemaining(seconds)
      return
    }
    const startedAt = Date.now()
    setRemaining(seconds)
    const timer = window.setInterval(() => {
      const left = seconds - Math.floor((Date.now() - startedAt) / 1000)
      if (left <= 0) {
        window.clearInterval(timer)
        setRemaining(0)
        onIdleRef.current()
        return
      }
      setRemaining(left)
    }, 250)
    return () => window.clearInterval(timer)
  }, [active, seconds, revision])

  return remaining
}
