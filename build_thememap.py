#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_thememap.py — 고잉 채널 관련주 신경망 맵 데이터 빌드
입력: output/extract_result_*.json (MAP 종목 추출), output/sched_result_*.json (일정 이벤트),
      output/one_going_all_raw.json (메시지 원본)
출력: ../site/data/thememap.json
규칙: 같은 테마 = 최신판 채택 + 구버전 전용 종목 합집합(legacy 플래그) / DAILY 제외
신규 게시물 반영 절차:
  1) 채널 덤프 갱신 → one_going_all_raw.json
  2) 신규 후보 분류(MAP/DAILY/OTHER) + MAP 종목 추출 → extract_result_*.json에 추가
  3) 일정표 신규분 → sched_result_*.json에 추가
  4) 본 스크립트 실행 → site push
"""
import json, re, glob, os, sys
from collections import defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "output")
SITE = os.path.join(BASE, "..", "site", "data", "thememap.json")

def norm_theme(t):
    t = re.sub(r"[\u25a0\[\]()\u00b7,'\"]", " ", t)
    t = re.sub(r"관련주|관련종목|관련 종목|밸류체인|서플라이 ?체인|분류|요약|정리|원페이퍼|한장|모음|모아보기|핵심|참고|국내|간단히|다시보기|업데이트|저장", " ", t)
    return re.sub(r"\s+", "", t).strip()

ALIAS = json.load(open(os.path.join(BASE, "thememap_alias.json"), encoding="utf-8"))
GROUPS_FIX = ALIAS.pop("_group_fix", {})
GROUP_RULES = ALIAS.pop("_group_rules", [])

def theme_key(t):
    n = norm_theme(t); return ALIAS.get(n, n)
def norm_stock(s):
    return re.sub(r"\s+", "", s.replace("?", "").strip())
def group_of(name, key):
    k = re.sub(r"[\s\u00b7'\-]", "", key)
    for fk, g in GROUPS_FIX.items():
        if fk in k or k in fk: return g
    s = name + key
    for g, pat in GROUP_RULES:
        if re.search(pat, s, re.I): return g
    return "기타"

msgs = {m["id"]: m for m in json.load(open(os.path.join(OUT, "one_going_all_raw.json"), encoding="utf-8"))}
ex = []
for f in sorted(glob.glob(os.path.join(OUT, "extract_result_*.json"))):
    ex += json.load(open(f, encoding="utf-8"))
fam = defaultdict(list)
for e in ex: fam[theme_key(e["theme"])].append(e)

themes_out = []
for key, posts in fam.items():
    posts.sort(key=lambda e: msgs[e["id"]]["date"], reverse=True)
    latest = posts[0]; seen = {}; cats_out = []
    for c in latest["categories"]:
        st = [{"name": s["name"].replace("?",""), "note": s.get("note"), "legacy": False,
               "src": latest["id"], "src_date": msgs[latest["id"]]["date"][:10]}
              for s in c["stocks"] if norm_stock(s["name"]) and not seen.setdefault(norm_stock(s["name"]), False)]
        for s in c["stocks"]: seen[norm_stock(s["name"])] = True
        st = [s for s in st if s["name"].strip()]
        if st: cats_out.append({"name": c.get("name"), "stocks": st})
    extras = []
    for old in posts[1:]:
        for c in old["categories"]:
            for s in c["stocks"]:
                k = norm_stock(s["name"])
                if not k or seen.get(k): continue
                seen[k] = True
                extras.append({"name": s["name"].replace("?",""), "note": s.get("note"), "legacy": True,
                               "src": old["id"], "src_date": msgs[old["id"]]["date"][:10], "cat_hint": c.get("name")})
    if extras: cats_out.append({"name": "이전 버전 종목", "stocks": extras})
    name = latest["theme"].strip()
    themes_out.append({"key": key, "name": name, "group": group_of(name, key),
        "latest": {"id": latest["id"], "date": msgs[latest["id"]]["date"][:10]},
        "versions": [{"id": p["id"], "date": msgs[p["id"]]["date"][:10]} for p in posts],
        "n_stocks": sum(1 for v in seen.values() if v), "categories": cats_out})
themes_out.sort(key=lambda t: -t["n_stocks"])

ev = []
for f in sorted(glob.glob(os.path.join(OUT, "sched_result_*.json"))):
    for item in json.load(open(f, encoding="utf-8")):
        for e in item.get("events", []):
            if e.get("date") and re.match(r"\d{4}-\d{2}-\d{2}", e["date"]): ev.append({**e, "src": item["id"]})
def norm_title(t): return re.sub(r"[\s()\u00b7\-_,.'\"]", "", t)[:20]
seen_e = {}
for e in sorted(ev, key=lambda x: x["src"]):
    seen_e.setdefault((e["date"], norm_title(e["title"])), e)
events = [e for e in sorted(seen_e.values(), key=lambda x: x["date"]) if "2024-01" <= e["date"] <= "2031-12"]
for t in themes_out:
    for v in t["versions"]:
        events.append({"date": v["date"], "title": f"테마맵: {t['name']}", "category": "테마맵",
                       "precision": "day", "src": v["id"], "theme_key": t["key"]})
events.sort(key=lambda x: x["date"])

from datetime import date
out = {"updated": date.today().isoformat(),
       "source": "텔레그램 @one_going (요약하는 고잉)",
       "themes": themes_out, "events": events}
json.dump(out, open(SITE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"themes {len(themes_out)} / events {len(events)} -> {SITE}")
