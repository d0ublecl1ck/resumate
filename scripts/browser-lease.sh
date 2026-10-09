#!/usr/bin/env bash
# 无头浏览器租约：全局同一时刻只允许一个任务占用浏览器。
#
# 目的：并行工作流各自起 Playwright 时，实例数会按「工作流数 x 每脚本实例数」放大。
# 用一个跨进程租约把浏览器使用串行化，是防止实例无限增长最直接的一道闸门。
#
# 用法：
#   scripts/browser-lease.sh acquire <任务名>   # 拿租约；已被占用则退出码 2
#   scripts/browser-lease.sh release            # 释放
#   scripts/browser-lease.sh status             # 查看当前租约
#
# 失效规则：超过 MAX_AGE_MIN 分钟（默认 20）视为失效，下次 acquire 会接管。
set -uo pipefail

LEASE="${TMPDIR:-/tmp}/resumate-browser-lease"
MAX_AGE_MIN="${MAX_AGE_MIN:-20}"
cmd="${1:-status}"
label="${2:-unknown-task}"
now=$(date +%s)

load_lease() {
  LEASE_STARTED=""
  LEASE_LABEL=""
  [ -f "${LEASE}" ] || return 1
  while IFS='=' read -r k v; do
    case "${k}" in
      started) LEASE_STARTED="${v}" ;;
      label) LEASE_LABEL="${v}" ;;
    esac
  done < "${LEASE}"
  [ -n "${LEASE_STARTED}" ] || return 1
  return 0
}

case "${cmd}" in
  acquire)
    if load_lease; then
      age_min=$(( (now - LEASE_STARTED) / 60 ))
      if [ "${age_min}" -lt "${MAX_AGE_MIN}" ]; then
        echo "拒绝：浏览器租约已被 [${LEASE_LABEL}] 占用（${age_min} 分钟前获取，上限 ${MAX_AGE_MIN} 分钟）" >&2
        echo "等它释放；确认它已死可用 scripts/browser-lease.sh release 接管。" >&2
        exit 2
      fi
      echo "警告：接管失效租约（原持有者 [${LEASE_LABEL}]，${age_min} 分钟前获取）" >&2
    fi
    printf 'started=%s\nlabel=%s\n' "${now}" "${label}" > "${LEASE}"
    echo "已获取浏览器租约：[${label}]"
    ;;
  release)
    rm -f "${LEASE}"
    echo "已释放浏览器租约"
    ;;
  status)
    if load_lease; then
      echo "当前租约：[${LEASE_LABEL}]（$(( (now - LEASE_STARTED) / 60 )) 分钟前获取）"
    else
      echo "无租约"
    fi
    ;;
  *)
    echo "用法：$0 {acquire <任务名>|release|status}" >&2
    exit 64
    ;;
esac
