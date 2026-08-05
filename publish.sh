#!/bin/bash
# ════════════════════════════════════════════════════════════
# Joy and July Research Hub — 일일 배포 스크립트 (publish.ps1 맥 포팅)
#   최신 대시보드 HTML을 site/ 로 복사하면서 공통 테마(hub-theme.css)를
#   주입하고 git push 한다.  사용:  bash publish.sh  [--no-push]
# ════════════════════════════════════════════════════════════
set -u
SITE="$HOME/수급html/site"
SRC="$HOME/수급html"
SECTOR="$HOME/sector-report"
NO_PUSH=0
[ "${1:-}" = "--no-push" ] && NO_PUSH=1

publish_one() {  # $1=원본경로 $2=타겟명 $3=주입클래스
    local src="$1" target="$2" cls="$3"
    if [ -z "$src" ] || [ ! -f "$src" ]; then
        echo "  skip  $target (원본 없음)"; return
    fi
    /usr/bin/python3 - "$src" "$SITE/$target" "$cls" <<'PYEOF'
import sys
src, dst, cls = sys.argv[1], sys.argv[2], sys.argv[3]
html = open(src, encoding="utf-8").read()
if "hub-theme.css" not in html:
    html = html.replace('<html lang="ko">', f'<html lang="ko" class="{cls}">', 1)
    html = html.replace('</head>', '<link rel="stylesheet" href="hub-theme.css"></head>', 1)
open(dst, "w", encoding="utf-8").write(html)
PYEOF
    echo "  done  $target  <-  $(basename "$src")"
}

newest() {  # $1=글롭 패턴 (SRC 기준) — 최신 수정본 1개
    ls -t "$SRC"/$1 2>/dev/null | head -1
}

echo "=== 최신 원본 탐색 ==="
EXPORT=$(newest "주요품목 수출 대시보드*.html")
SEMIETF=$(newest "반도체ETF_수혜_*.html")

echo "=== 배포 ==="
publish_one "$SRC/index.html"                  "supply.html"     "ht-supply"
publish_one "$SECTOR/sector-report.html"       "sector.html"     "ht-sector"
publish_one "$EXPORT"                          "export.html"     "ht-export"
publish_one "$SRC/이격도.html"                 "disparity.html"  "ht-disp"
publish_one "$SEMIETF"                         "semietf.html"    "ht-semietf"
publish_one "$SRC/trade_corp/기업수출.html"    "corpexport.html" "ht-corpexport"
publish_one "$SRC/trade10/수출입_잠정치.html"  "trade10.html"    "ht-trade10"

if [ "$NO_PUSH" -eq 0 ]; then
    if [ -n "$(git -C "$SITE" status --porcelain)" ]; then
        git -C "$SITE" add -A
        git -C "$SITE" commit -m "daily publish $(date '+%Y-%m-%d %H:%M')"
        git -C "$SITE" push
        echo "=== push 완료 ==="
    else
        echo "=== 변경 없음 — push 생략 ==="
    fi
fi
