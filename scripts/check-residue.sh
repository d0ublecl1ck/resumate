#!/usr/bin/env bash
# 残留进程体检：区分「正在跑的验证」与「真的被遗弃的进程」。
#
# 判定规则（关键）：无头浏览器进程若仍有存活的驱动脚本（父链可达），视为正在运行的验证，
# 不报告也不清理；父进程已消失（被 launchd 收养，PPID=1）或驱动脚本已不在，才算残留。
#
# 用法：
#   scripts/check-residue.sh          # 只报告
#   scripts/check-residue.sh --kill   # 报告并终止残留（不动正在跑的验证）
#
# 退出码：0 干净；1 有残留。
set -uo pipefail

KILL=0
[ "${1:-}" = "--kill" ] && KILL=1
fail=0

echo "== 无头浏览器进程 =="
found=0
for pid in $(pgrep -f "headless_shell|Chrome for Testing|chrome-headless-shell" 2>/dev/null); do
  cur=$pid
  alive=0
  pcmd=""
  for _ in 1 2 3 4 5 6; do
    ppid=$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ')
    [ -z "$ppid" ] && break
    [ "$ppid" = "0" ] && break
    [ "$ppid" = "1" ] && break
    pcmd=$(ps -o command= -p "$ppid" 2>/dev/null | cut -c1-60)
    case "$pcmd" in
      *playwright*|*node*|*python*) alive=1; break ;;
    esac
    cur=$ppid
  done
  found=1
  if [ "$alive" = "1" ]; then
    echo "  [运行中] pid=$pid 由「$pcmd」驱动（不清理）"
  else
    echo "  [残留]   pid=$pid 驱动脚本已消失"
    fail=1
    [ "$KILL" = "1" ] && kill -TERM "$pid" 2>/dev/null || true
  fi
done
[ "$found" = "0" ] && echo "  none"

echo "== 本项目常用端口 =="
for port in 5173 6007 8000 2525; do
  holder=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $2" "$1}')
  if [ -n "$holder" ]; then
    echo "  :$port -> $holder"
    case "$port" in
      5173|6007|2525)
        echo "     （验证用的 dev server，用完应停止）"
        fail=1
        [ "$KILL" = "1" ] && kill -TERM "${holder%% *}" 2>/dev/null || true
        ;;
      *) echo "     （后端 :8000 属开发常用，保留）" ;;
    esac
  fi
done

echo "== 临时验证脚本（/tmp） =="
ls -1 /tmp/e2e-*.cjs /tmp/verify*.py /tmp/audit*.sh 2>/dev/null | head -8 | sed 's/^/  /' || echo "  none"

[ "$fail" = "0" ] && echo "结论：无残留" || echo "结论：发现残留（见上）"
exit $fail
