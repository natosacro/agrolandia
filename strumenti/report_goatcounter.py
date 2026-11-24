#!/usr/bin/env python3
"""Report settimanale GoatCounter di agrolandia (settimana lun-dom precedente).
La chiave API la inserisce il proxy dell'ambiente: nessuna variabile necessaria.
Uso: python3 report_goatcounter.py [AAAA-MM-GG lunedì della settimana]"""
import json, sys, subprocess, datetime as dt

B = "https://agrolandia.goatcounter.com/api/v0"

def get(path, **q):
    qs = "&".join(f"{k}={v}" for k, v in q.items())
    out = subprocess.run(["curl", "-s", "-H", "Content-Type: application/json", f"{B}{path}?{qs}"],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)

oggi = dt.date.today()
if len(sys.argv) > 1:
    lun = dt.date.fromisoformat(sys.argv[1])
else:
    lun = oggi - dt.timedelta(days=oggi.weekday() + 7)
dom = lun + dt.timedelta(days=6)
plun, pdom = lun - dt.timedelta(days=7), lun - dt.timedelta(days=1)
R = dict(start=f"{lun}T00:00:00Z", end=f"{dom}T23:59:59Z")
P = dict(start=f"{plun}T00:00:00Z", end=f"{pdom}T23:59:59Z")

tot = get("/stats/total", **R)
prev = get("/stats/total", **P)
hits = get("/stats/hits", limit=20, **R)
NOMI = {"phone": "Telefono", "largephone": "Telefono grande", "tablet": "Tablet", "desktop": "Computer", "desktophd": "Computer HD", "unknown": "Sconosciuto"}
giorni = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]

def lista(nome, **extra):
    try:
        return get(f"/stats/{nome}", limit=10, **R, **extra).get("stats", [])
    except Exception:
        return []

print(f"REPORT AGROLANDIA {lun:%d.%m} – {dom:%d.%m.%Y}")
diff = tot["total"] - prev["total"]
print(f"Visite: {tot['total']} (settimana prima: {prev['total']}, {'+' if diff >= 0 else ''}{diff})")
print("Per giorno: " + " · ".join(f"{giorni[i]} {s['daily']}" for i, s in enumerate(tot["stats"][:7])))
print("\nPagine:")
for h in hits.get("hits", []):
    print(f"  {h['count']:>4}  {h['path']}  {h.get('title') or ''}")
for nome, tit in [("toprefs", "Provenienza"), ("locations", "Paesi"),
                  ("systems", "Sistemi"), ("browsers", "Browser"), ("sizes", "Schermi"), ("campaigns", "Campagne")]:
    st = lista(nome)
    if not st:
        continue
    print(f"\n{tit}:")
    for s in st:
        print(f"  {s['count']:>4}  {s.get('name') or NOMI.get(s.get('id'), s.get('id')) or '(diretto / sconosciuto)'}")
