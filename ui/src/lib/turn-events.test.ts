import { describe, expect, it, vi } from "vitest"

import type { TurnEventHandlers, TurnEventSource, TurnStreamState } from "@/lib/turn-events"
import { parseTurnEvent, subscribeTurnEvents, turnEventsUrl } from "@/lib/turn-events"

class FakeEventSource implements TurnEventSource {
  readonly url: string
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const bucket = this.listeners.get(type) ?? new Set()
    bucket.add(listener)
    this.listeners.set(type, bucket)
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  close(): void {
    this.closed = true
  }

  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }))
    }
  }

  fireOpen(): void {
    this.onopen?.(new Event("open"))
  }

  fireError(): void {
    this.onerror?.(new Event("error"))
  }
}

const TURN: TurnStreamState = { id: "turn_1", resumeId: "res_1", state: "open", pendingActions: [] }

function subscription(handlers: TurnEventHandlers = {}) {
  const sources: FakeEventSource[] = []
  const unsubscribe = subscribeTurnEvents("turn_1", handlers, {
    eventSourceFactory: (url) => {
      const source = new FakeEventSource(url)
      sources.push(source)
      return source
    },
  })
  return { source: sources[0]!, unsubscribe }
}

describe("turnEventsUrl", () => {
  it("encodes the turn id and uses the given base", () => {
    expect(turnEventsUrl("turn_a/b", "/api")).toBe("/api/turns/turn_a%2Fb/events")
  })
})

describe("parseTurnEvent", () => {
  it("returns the parsed turn for valid JSON and null otherwise", () => {
    expect(parseTurnEvent(JSON.stringify(TURN))).toEqual(TURN)
    expect(parseTurnEvent("not json")).toBeNull()
    expect(parseTurnEvent(JSON.stringify({ state: "open" }))).toBeNull()
    expect(parseTurnEvent(undefined)).toBeNull()
  })
})

describe("subscribeTurnEvents", () => {
  it("connects to the turn events endpoint and dispatches parsed frames", () => {
    const onSnapshot = vi.fn()
    const onUpdate = vi.fn()
    const { source } = subscription({ onSnapshot, onUpdate })

    expect(source.url).toBe("/api/turns/turn_1/events")

    source.emit("snapshot", JSON.stringify(TURN))
    source.emit("turn.updated", JSON.stringify({ ...TURN, state: "finalized" }))

    expect(onSnapshot).toHaveBeenCalledWith(TURN)
    expect(onUpdate).toHaveBeenCalledWith({ ...TURN, state: "finalized" })
  })

  it("returns a no-op subscription when EventSource is unavailable", () => {
    vi.stubGlobal("EventSource", undefined)
    const onUpdate = vi.fn()

    const unsubscribe = subscribeTurnEvents("turn_1", { onUpdate })

    expect(() => unsubscribe()).not.toThrow()
    vi.unstubAllGlobals()
  })

  it("ignores malformed frames instead of throwing", () => {
    const onSnapshot = vi.fn()
    const { source } = subscription({ onSnapshot })

    expect(() => source.emit("snapshot", "<html>boom</html>")).not.toThrow()
    expect(onSnapshot).not.toHaveBeenCalled()
  })

  it("forwards open and error signals for reconnect handling", () => {
    const onOpen = vi.fn()
    const onError = vi.fn()
    const { source } = subscription({ onOpen, onError })

    source.fireOpen()
    source.fireError()

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("detaches listeners and closes the source on unsubscribe", () => {
    const onSnapshot = vi.fn()
    const { source, unsubscribe } = subscription({ onSnapshot })

    unsubscribe()

    expect(source.closed).toBe(true)
    expect(source.listeners.get("snapshot")?.size ?? 0).toBe(0)
    expect(source.listeners.get("turn.updated")?.size ?? 0).toBe(0)
    expect(source.onopen).toBeNull()
    expect(source.onerror).toBeNull()

    source.emit("snapshot", JSON.stringify(TURN))
    expect(onSnapshot).not.toHaveBeenCalled()
  })
})
