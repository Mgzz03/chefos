"""
ChefOS QA — Phase 2 backend integration tests.
Runs against a live backend (BASE), exercising every endpoint group with
assertions. Stdlib only. Usage:  python qa_test.py [BASE_URL]
"""
import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8090").rstrip("/")
PASS = 0
FAIL = 0
FAILED = []


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data,
                               headers={"Content-Type": "application/json", "User-Agent": "qa"},
                               method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        FAILED.append(name + (f"  [{extra}]" if extra else ""))
        print(f"  FAIL  {name}   {extra}")


print(f"=== ChefOS QA backend tests @ {BASE} ===\n")

# ── CATEGORIES & INGREDIENTS ──────────────────────────────
print("[Categories & Ingredients]")
s, cat = req("POST", "/categories", {"name": "QA Veg", "color": "#123456"})
check("create category", s == 200 and cat.get("id"), f"{s} {cat}")
cat_id = cat["id"] if isinstance(cat, dict) else None

s, dup = req("POST", "/categories", {"name": "QA Veg"})
check("duplicate category rejected (400)", s == 400, str(s))

s, ing = req("POST", "/ingredients", {"name": "QA Tomato", "unit": "g", "cost": 0.01,
                                       "category_id": cat_id, "supplier": "ACME", "threshold": 100})
check("create ingredient in category", s == 200 and ing.get("id"), f"{s}")
ing_id = ing["id"] if isinstance(ing, dict) else None
check("ingredient shows category name", isinstance(ing, dict) and ing.get("category_name") == "QA Veg")

# edit price
s, up = req("PATCH", f"/ingredients/{ing_id}", {"name": "QA Tomato", "unit": "g", "cost": 0.05,
                                                "category_id": cat_id, "supplier": "ACME", "threshold": 100})
check("edit ingredient price", s == 200 and abs(up.get("cost", 0) - 0.05) < 1e-9, f"{s} {up.get('cost')}")
s, glist = req("GET", "/ingredients")
found = next((x for x in glist if x["id"] == ing_id), None)
check("price persisted on GET", found and abs(found["cost"] - 0.05) < 1e-9)

# delete category with ingredient attached → graceful 400
s, _ = req("DELETE", f"/categories/{cat_id}")
check("delete category w/ ingredients blocked (400)", s == 400, str(s))

# ── INVENTORY & FIFO ──────────────────────────────────────
print("\n[Inventory & FIFO]")
today = date.today()
s, r1 = req("POST", "/inventory/restock", {"ingredient_id": ing_id, "quantity": 100,
                                           "expiry_date": (today + timedelta(days=3)).isoformat()})
check("restock batch A (earlier expiry)", s == 200, str(s))
s, r2 = req("POST", "/inventory/restock", {"ingredient_id": ing_id, "quantity": 100,
                                           "expiry_date": (today + timedelta(days=300)).isoformat()})
check("restock batch B (later expiry)", s == 200, str(s))
s, inv = req("GET", "/inventory")
me = next((x for x in inv if x["id"] == ing_id), None)
check("stock totals 200 after 2 restocks", me and abs(me["stock"] - 200) < 1e-6, str(me["stock"] if me else None))
check("two active batches present", me and len(me["batches"]) == 2)

# edit threshold via inventory patch (also collapses to one batch)
s, _ = req("PATCH", f"/inventory/{ing_id}", {"stock": 200, "threshold": 150})
check("edit threshold", s == 200, str(s))
s, inv = req("GET", "/inventory")
me = next((x for x in inv if x["id"] == ing_id), None)
check("threshold updated to 150", me and me["threshold"] == 150)

# rebuild two batches for a clean FIFO test
req("PATCH", f"/inventory/{ing_id}", {"stock": 0, "threshold": 150})
req("POST", "/inventory/restock", {"ingredient_id": ing_id, "quantity": 100, "expiry_date": (today + timedelta(days=3)).isoformat()})
req("POST", "/inventory/restock", {"ingredient_id": ing_id, "quantity": 100, "expiry_date": (today + timedelta(days=300)).isoformat()})

# recipe that uses 50 of the ingredient
s, rec = req("POST", "/recipes", {"name": "QA Soup", "category": "QA", "base_yield": 4,
                                  "yield_unit": "portions", "notes": "qa",
                                  "ings": [{"id": ing_id, "qty": 50, "unit": "g"}]})
check("create recipe with ingredient", s == 200 and rec.get("id"), str(s))
rec_id = rec["id"] if isinstance(rec, dict) else None

# cook scale 1 → deduct 50 from the EARLIER-expiry batch (FIFO)
s, _ = req("POST", "/cook", {"recipe_id": rec_id, "scale_factor": 1, "portions": 4})
check("cook recipe (stock sufficient)", s == 200, str(s))
s, inv = req("GET", "/inventory")
me = next((x for x in inv if x["id"] == ing_id), None)
batches = sorted(me["batches"], key=lambda b: b["expiry_date"])
check("FIFO: earliest-expiry batch deducted first (50 left)", batches[0]["quantity"] == 50, str(batches[0]["quantity"]))
check("FIFO: later batch untouched (100)", batches[1]["quantity"] == 100, str(batches[1]["quantity"]))

# transaction log created
s, tx = req("GET", "/transactions")
check("cook created a transaction log entry", any(t for t in tx if t.get("type") == "cook"))

# ── BATCH EDIT/DELETE & RESTOCK-FROM-COOK ─────────────────
print("\n[Batch ops & restock-from-cook]")
s, bing = req("POST", "/ingredients", {"name": "QA Batchy", "unit": "g", "cost": 0.1, "threshold": 0})
bing_id = bing["id"]
req("POST", "/inventory/restock", {"ingredient_id": bing_id, "quantity": 30})
s, inv = req("GET", "/inventory")
b = next(x for x in inv if x["id"] == bing_id)
bid = b["batches"][0]["id"]
s, _ = req("PATCH", f"/inventory/batch/{bid}", {"expiry_date": (today + timedelta(days=10)).isoformat(), "notes": "edited"})
check("edit batch expiry date", s == 200, str(s))
s, inv = req("GET", "/inventory")
b = next(x for x in inv if x["id"] == bing_id)
check("batch expiry persisted", b["batches"][0]["expiry_date"] == (today + timedelta(days=10)).isoformat())
s, _ = req("DELETE", f"/inventory/batch/{bid}")
check("delete (deplete) a batch", s == 200, str(s))
s, inv = req("GET", "/inventory")
b = next(x for x in inv if x["id"] == bing_id)
check("stock 0 after batch deleted", b["stock"] == 0, str(b["stock"]))
# restock-from-cook (used by Cook History 'cancel' → restock)
s, rfc = req("POST", "/restock-from-cook", {"recipe_id": rec_id, "scale_factor": 1})
check("restock-from-cook returns restocked list", s == 200 and rfc.get("ok") and len(rfc.get("restocked", [])) > 0, str(s))

# ── ALERTS ────────────────────────────────────────────────
print("\n[Alerts]")
# out-of-stock ingredient
s, oing = req("POST", "/ingredients", {"name": "QA OutItem", "unit": "g", "cost": 1, "threshold": 10})
oid = oing["id"]
# low-stock ingredient
s, ling = req("POST", "/ingredients", {"name": "QA LowItem", "unit": "g", "cost": 1, "threshold": 100})
lid = ling["id"]
req("POST", "/inventory/restock", {"ingredient_id": lid, "quantity": 50})
# expired + warning batches
s, eing = req("POST", "/ingredients", {"name": "QA ExpItem", "unit": "g", "cost": 1, "threshold": 0})
eid = eing["id"]
req("POST", "/inventory/restock", {"ingredient_id": eid, "quantity": 10, "expiry_date": (today - timedelta(days=2)).isoformat()})
req("POST", "/inventory/restock", {"ingredient_id": eid, "quantity": 10, "expiry_date": (today + timedelta(days=5)).isoformat()})
req("POST", "/inventory/restock", {"ingredient_id": eid, "quantity": 10, "expiry_date": (today + timedelta(days=2)).isoformat()})
s, alerts = req("GET", "/inventory/alerts")
types = {(a["ingredient"], a["type"]) for a in alerts}
check("out-of-stock alert", ("QA OutItem", "out") in types, str([a for a in alerts if a['ingredient']=='QA OutItem']))
check("low-stock alert", ("QA LowItem", "low") in types)
check("expired alert", ("QA ExpItem", "expired") in types)
check("expiry-warning alert", ("QA ExpItem", "warning") in types)
check("critical-expiry alert", ("QA ExpItem", "critical") in types)
# clear: restock the out item, confirm 'out' alert gone
req("POST", "/inventory/restock", {"ingredient_id": oid, "quantity": 500})
s, alerts2 = req("GET", "/inventory/alerts")
check("alert clears after restock", not any(a["ingredient"] == "QA OutItem" and a["type"] == "out" for a in alerts2))

# ── RECIPE COST / SIMULATE ────────────────────────────────
print("\n[Recipe cost & simulate]")
s, c1 = req("GET", f"/recipes/{rec_id}/cost?scale=1")
s, c2 = req("GET", f"/recipes/{rec_id}/cost?scale=2")
check("cost scales linearly (2x)", abs(c2["total"] - 2 * c1["total"]) < 1e-6, f"{c1['total']} {c2['total']}")
s, sim = req("GET", f"/recipes/{rec_id}/simulate?scale=1")
check("simulate feasible (stock ok)", sim.get("all_ok") is True)
s, sim2 = req("GET", f"/recipes/{rec_id}/simulate?scale=100")
check("simulate infeasible at huge scale", sim2.get("all_ok") is False and len(sim2.get("issues", [])) > 0)
# cook insufficient → 422
s, ins = req("POST", "/cook", {"recipe_id": rec_id, "scale_factor": 100, "portions": 4})
check("cook insufficient stock → 422", s == 422, str(s))

# ── COOK TO STOCK + COOKED STOCK + WASTE ──────────────────
print("\n[Cook to stock, cooked stock, waste]")
s, cts = req("POST", "/cook-to-stock", {"recipe_id": rec_id, "scale_factor": 1, "portions": 4,
                                        "expiry_date": (today + timedelta(days=5)).isoformat()})
check("cook-to-stock creates cooked stock", s == 200 and cts.get("cooked_stock_id"), str(s))
cs_id = cts.get("cooked_stock_id")
s, cstock = req("GET", "/cooked-stock")
check("cooked stock listed", any(c["id"] == cs_id for c in cstock))
s, w = req("DELETE", f"/cooked-stock/{cs_id}/waste", {"reason": "spoiled"})
check("waste cooked stock", s == 200, str(s))
s, waste = req("GET", "/waste")
check("waste log entry created (cooked_stock)", any(x["source_type"] == "cooked_stock" for x in waste))

# ── ITEMS ─────────────────────────────────────────────────
print("\n[Items]")
# need cooked stock for the sub-recipe + an ingredient
req("POST", "/cook-to-stock", {"recipe_id": rec_id, "scale_factor": 1, "portions": 4})
s, item = req("POST", "/items", {"name": "QA Platter", "category": "QA", "base_yield": 1,
                                 "yield_unit": "pieces", "notes": "",
                                 "sub_recipes": [{"recipe_id": rec_id, "quantity": 2, "unit": "portions"}],
                                 "sub_ings": [{"ingredient_id": ing_id, "qty": 10, "unit": "g"}]})
check("create item w/ sub-recipe + ingredient", s == 200 and item.get("id"), str(s))
item_id = item["id"] if isinstance(item, dict) else None
check("item cost computed", isinstance(item, dict) and item.get("total_cost", 0) > 0)
s, isim = req("GET", f"/items/{item_id}/simulate")
check("item simulate returns feasibility", isim and "all_stock_ok" in isim)
s, asm = req("POST", f"/items/{item_id}/assemble", {"item_id": item_id, "scale_factor": 1, "portions": 1})
check("assemble item (deducts stock)", s == 200, str(asm))
s, upi = req("PATCH", f"/items/{item_id}", {"name": "QA Platter v2", "category": "QA", "base_yield": 1,
                                            "yield_unit": "pieces", "notes": "", "sub_recipes": [], "sub_ings": []})
check("edit item", s == 200 and upi.get("name") == "QA Platter v2", str(s))
s, _ = req("DELETE", f"/items/{item_id}")
check("delete item", s == 200, str(s))

# ── WASTE: ingredient batch + summary + delete ────────────
print("\n[Waste log]")
s, inv = req("GET", "/inventory")
me = next((x for x in inv if x["id"] == eid), None)
batch_id = me["batches"][0]["id"] if me and me["batches"] else None
s, wb = req("POST", f"/waste/ingredient-batch/{batch_id}", {"reason": "expired"})
check("waste an ingredient batch", s == 200 and wb.get("ok"), str(s))
s, summ = req("GET", "/waste/summary")
check("waste summary has totals", summ and summ.get("total_entries", 0) >= 1 and "by_reason" in summ)
s, waste = req("GET", "/waste")
if waste:
    wid = waste[0]["id"]
    s, _ = req("DELETE", f"/waste/{wid}")
    check("delete a waste entry", s == 200, str(s))

# ── VENDORS & SETUP ITEMS (CRUD) ──────────────────────────
print("\n[Vendors & Setup items]")
s, v = req("POST", "/vendors", {"name": "QA Vendor", "phone": "123"})
check("create vendor", s == 200 and v.get("id"), str(s))
vid = v["id"]
s, v2 = req("PATCH", f"/vendors/{vid}", {"name": "QA Vendor 2", "phone": "999"})
check("edit vendor", s == 200 and v2.get("name") == "QA Vendor 2")
s, su = req("POST", "/setup-items", {"name": "QA Oven", "cost_per_hour": 25, "vendor_id": vid})
check("create setup item", s == 200 and su.get("id"), str(s))
sid = su["id"]
s, su2 = req("PATCH", f"/setup-items/{sid}", {"name": "QA Oven 2", "cost_per_hour": 30})
check("edit setup item", s == 200 and su2.get("name") == "QA Oven 2")

# ── EVENTS ────────────────────────────────────────────────
print("\n[Events]")
s, ev = req("POST", "/events", {"name": "QA Wedding", "event_date": today.isoformat(),
                                "duration_hrs": 4, "guest_count": 20, "notes": "",
                                "recipes": [{"recipe_id": rec_id, "portions": 8}],
                                "setup_items": [{"setup_item_id": sid, "quantity": 1, "hours": 4}]})
check("create event w/ recipe + setup", s == 200 and ev.get("id"), str(s))
eid_ev = ev["id"] if isinstance(ev, dict) else None
# expected cost: recipe 8 portions of base_yield 4 → scale 2 → 50g*2*0.05 = 5.0 food; setup 1*4*30 = 120
check("event food cost correct", abs(ev.get("food_cost", -1) - 5.0) < 1e-6, str(ev.get("food_cost")))
check("event setup cost correct", abs(ev.get("setup_cost", -1) - 120.0) < 1e-6, str(ev.get("setup_cost")))
check("event total = food + setup", abs(ev.get("total", -1) - 125.0) < 1e-6, str(ev.get("total")))
s, st = req("PATCH", f"/events/{eid_ev}/status", {"status": "confirmed"})
check("change event status", s == 200 and st.get("status") == "confirmed")
s, _ = req("DELETE", f"/events/{eid_ev}")
check("delete event", s == 200, str(s))

# ── CLEANUP-ish CRUD deletes ──────────────────────────────
print("\n[Delete guards]")
s, _ = req("DELETE", f"/ingredients/{ing_id}")
check("delete ingredient used in recipe blocked (400)", s == 400, str(s))
s, _ = req("DELETE", f"/recipes/{rec_id}")
check("delete recipe", s == 200, str(s))
s, _ = req("DELETE", f"/vendors/{vid}")
check("delete vendor", s == 200, str(s))
s, _ = req("DELETE", f"/setup-items/{sid}")
check("delete setup item", s == 200, str(s))

# ── License / mobile / branding (local-mode sanity) ───────
print("\n[License / Mobile / Branding]")
s, lic = req("GET", "/license/status")
check("license status endpoint", s == 200 and "activated" in lic)
s, mob = req("GET", "/mobile/status")
check("mobile status returns ip+url", s == 200 and mob.get("url", "").startswith("http"))
s, br = req("GET", "/settings/branding")
check("branding defaults present", s == 200 and "margin" in br and "assistant_name" in br)

print(f"\n=== RESULT: {PASS} passed, {FAIL} failed ===")
if FAILED:
    print("FAILED:")
    for f in FAILED:
        print("  -", f)
sys.exit(1 if FAIL else 0)
