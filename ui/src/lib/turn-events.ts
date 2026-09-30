// 轮次事件订阅：封装 EventSource 与 SSE 事件解析。
// 后端契约见 docs/agent/agent-operation-api.md 第 18 节：
// GET /turns/{turn_id}/events 推送 snapshot / turn.updated，空闲时发注释心跳。
import { API_BASE_URL } from "@/lib/api-client"
import type { PendingAction } from "@/lib/types"

/** 事件帧推送的轮次投影：与 GET /turns/{turn_id} 同构。 */
export interface TurnStreamState {
  id: string
  resumeId: string
  state: "open" | "finalized" | "cancelled"
  executionMode?: "approval" | "full_access"
  pendingActions?: PendingAction[]
  result?: unknown
  [key: string]: unknown
}

export interface TurnEventHandlers {
  /** 首帧：订阅时的轮次快照。 */
  onSnapshot?: (turn: TurnStreamState) => void
  /** 轮次或待办状态发生真实变化后的新投影。 */
  onUpdate?: (turn: TurnStreamState) => void
  /** 连接建立（含 EventSource 自动重连成功）。 */
  onOpen?: () => void
  /** 连接错误或断开；EventSource 会自动重连，调用方可据此提示状态。 */
  onError?: (event: Event) => void
}

/** EventSource 的最小子集，便于测试注入假实现。 */
export interface TurnEventSource {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void
  close(): void
  onopen: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
}

export interface SubscribeTurnEventsOptions {
  /** 覆盖基地址；默认复用 api-client 的 API_BASE_URL。 */
  baseUrl?: string
  /** 注入 EventSource 构造器（测试用）；默认使用浏览器全局 EventSource。 */
  eventSourceFactory?: (url: string) => TurnEventSource
}

/** 新端点的 URL，turn id 作为路径段需要编码。 */
export function turnEventsUrl(turnId: string, baseUrl: string = API_BASE_URL): string {
  return baseUrl + "/turns/" + encodeURIComponent(turnId) + "/events"
}

/** 解析一帧 data；非法或缺 id 的负载返回 null，绝不抛错。 */
export function parseTurnEvent(data: unknown): TurnStreamState | null {
  if (typeof data !== "string") return null
  try {
    const parsed: unknown = JSON.parse(data)
    if (parsed !== null && typeof parsed === "object" && typeof (parsed as { id?: unknown }).id === "string") {
      return parsed as TurnStreamState
    }
    return null
  } catch {
    return null
  }
}

/**
 * 订阅一个轮次的 SSE 事件，返回退订函数。
 *
 * 只消费后端真实推送的 snapshot / turn.updated；重连交给 EventSource 自身
 * （服务端首帧下发 retry）。注释心跳不会触发 EventSource 事件，因此没有
 * onHeartbeat：存活状态由 onOpen / onError 与数据帧到达体现。
 */
export function subscribeTurnEvents(
  turnId: string,
  handlers: TurnEventHandlers,
  options: SubscribeTurnEventsOptions = {},
): () => void {
  const factory =
    options.eventSourceFactory ??
    ((target: string) => new EventSource(target, { withCredentials: true }) as unknown as TurnEventSource)
  const source = factory(turnEventsUrl(turnId, options.baseUrl ?? API_BASE_URL))

  const onSnapshot = (event: MessageEvent) => {
    const turn = parseTurnEvent(event.data)
    if (turn) handlers.onSnapshot?.(turn)
  }
  const onUpdate = (event: MessageEvent) => {
    const turn = parseTurnEvent(event.data)
    if (turn) handlers.onUpdate?.(turn)
  }
  const onOpen = () => handlers.onOpen?.()
  const onError = (event: Event) => handlers.onError?.(event)

  source.addEventListener("snapshot", onSnapshot)
  source.addEventListener("turn.updated", onUpdate)
  source.onopen = onOpen
  source.onerror = onError

  return () => {
    source.removeEventListener("snapshot", onSnapshot)
    source.removeEventListener("turn.updated", onUpdate)
    source.onopen = null
    source.onerror = null
    source.close()
  }
}
