import { describe, expect, it } from "vitest"
import { MAX_AUTOSAVE_SECONDS, MIN_AUTOSAVE_SECONDS, isValidAutosaveSeconds } from "@/lib/autosave"

describe("isValidAutosaveSeconds", () => {
  it("接受范围内的整数（含边界）", () => {
    expect(isValidAutosaveSeconds(MIN_AUTOSAVE_SECONDS)).toBe(true)
    expect(isValidAutosaveSeconds(MAX_AUTOSAVE_SECONDS)).toBe(true)
    expect(isValidAutosaveSeconds(10)).toBe(true)
  })

  it("拒绝越界、非整数与非数字", () => {
    expect(isValidAutosaveSeconds(2)).toBe(false)
    expect(isValidAutosaveSeconds(121)).toBe(false)
    expect(isValidAutosaveSeconds(3.5)).toBe(false)
    expect(isValidAutosaveSeconds(Number.NaN)).toBe(false)
  })
})
