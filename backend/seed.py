"""Run: python seed.py   (with backend running on :8000)"""
import requests

BASE = "http://localhost:8000"

# ── Categories ────────────────────────────────────────────
categories = [
    {"name": "Dairy",       "color": "#3b82f6"},
    {"name": "Dry Goods",   "color": "#c8922a"},
    {"name": "Meat",        "color": "#ef4444"},
    {"name": "Vegetables",  "color": "#22c55e"},
    {"name": "Fruits",      "color": "#f97316"},
    {"name": "Spices",      "color": "#a855f7"},
    {"name": "Beverages",   "color": "#06b6d4"},
    {"name": "Bakery",      "color": "#eab308"},
]
cat_ids = {}
for c in categories:
    r = requests.post(f"{BASE}/categories", json=c)
    if r.status_code == 200:
        cat_ids[c["name"]] = r.json()["id"]
        print(f"  Category: {c['name']}")
    else:
        # already exists — fetch
        r2 = requests.get(f"{BASE}/categories")
        for ex in r2.json():
            if ex["name"] == c["name"]:
                cat_ids[c["name"]] = ex["id"]

print("Categories seeded.")

# ── Ingredients ───────────────────────────────────────────
ings = [
    {"name":"00 Flour","unit":"g","cost":0.0012,"category_id":cat_ids["Dry Goods"],"threshold":500},
    {"name":"Eggs","unit":"piece","cost":0.35,"category_id":cat_ids["Dairy"],"threshold":6},
    {"name":"Guanciale","unit":"g","cost":0.022,"category_id":cat_ids["Meat"],"threshold":100},
    {"name":"Pecorino Romano","unit":"g","cost":0.028,"category_id":cat_ids["Dairy"],"threshold":50},
    {"name":"Black Pepper","unit":"g","cost":0.014,"category_id":cat_ids["Spices"],"threshold":20},
    {"name":"Heavy Cream","unit":"ml","cost":0.004,"category_id":cat_ids["Dairy"],"threshold":200},
    {"name":"Unsalted Butter","unit":"g","cost":0.009,"category_id":cat_ids["Dairy"],"threshold":200},
    {"name":"Sugar","unit":"g","cost":0.0008,"category_id":cat_ids["Dry Goods"],"threshold":200},
    {"name":"Vanilla Extract","unit":"ml","cost":0.05,"category_id":cat_ids["Spices"],"threshold":10},
    {"name":"Bread Flour","unit":"g","cost":0.0015,"category_id":cat_ids["Bakery"],"threshold":500},
    {"name":"Sourdough Starter","unit":"g","cost":0.001,"category_id":cat_ids["Bakery"],"threshold":50},
    {"name":"Sea Salt","unit":"g","cost":0.002,"category_id":cat_ids["Spices"],"threshold":50},
    {"name":"Olive Oil","unit":"ml","cost":0.012,"category_id":cat_ids["Dry Goods"],"threshold":100},
    {"name":"Garlic","unit":"piece","cost":0.15,"category_id":cat_ids["Vegetables"],"threshold":4},
]

ing_ids = {}
for i in ings:
    r = requests.post(f"{BASE}/ingredients", json=i)
    ing_ids[i["name"]] = r.json()["id"]
    print(f"  Ingredient: {i['name']}")

# ── Initial stock batches ─────────────────────────────────
from datetime import date, timedelta
today = date.today()

batches = [
    {"ingredient_id": ing_ids["00 Flour"],        "quantity": 3000, "expiry_date": str(today + timedelta(days=60))},
    {"ingredient_id": ing_ids["Eggs"],             "quantity": 24,   "expiry_date": str(today + timedelta(days=5))},
    {"ingredient_id": ing_ids["Guanciale"],        "quantity": 600,  "expiry_date": str(today + timedelta(days=14))},
    {"ingredient_id": ing_ids["Pecorino Romano"],  "quantity": 420,  "expiry_date": str(today + timedelta(days=30))},
    {"ingredient_id": ing_ids["Black Pepper"],     "quantity": 80},
    {"ingredient_id": ing_ids["Heavy Cream"],      "quantity": 0},    # out of stock
    {"ingredient_id": ing_ids["Unsalted Butter"],  "quantity": 85,   "expiry_date": str(today + timedelta(days=2))},  # near expiry!
    {"ingredient_id": ing_ids["Sugar"],            "quantity": 1200},
    {"ingredient_id": ing_ids["Vanilla Extract"],  "quantity": 30},
    {"ingredient_id": ing_ids["Bread Flour"],      "quantity": 3000},
    {"ingredient_id": ing_ids["Sourdough Starter"],"quantity": 400},
    {"ingredient_id": ing_ids["Sea Salt"],         "quantity": 500},
    {"ingredient_id": ing_ids["Olive Oil"],        "quantity": 500},
    {"ingredient_id": ing_ids["Garlic"],           "quantity": 12,   "expiry_date": str(today + timedelta(days=3))},  # critical
]
for b in batches:
    if b.get("quantity", 0) > 0:
        requests.post(f"{BASE}/inventory/restock", json=b)
print("Stock batches seeded.")

# ── Recipes ───────────────────────────────────────────────
recipes = [
    {
        "name": "Pasta Carbonara", "category": "Italian",
        "base_yield": 4, "yield_unit": "portions",
        "notes": "Classic Roman carbonara — no cream",
        "ings": [
            {"id": ing_ids["00 Flour"], "qty": 250, "unit": "g"},
            {"id": ing_ids["Eggs"], "qty": 4, "unit": "piece"},
            {"id": ing_ids["Guanciale"], "qty": 150, "unit": "g"},
            {"id": ing_ids["Pecorino Romano"], "qty": 80, "unit": "g"},
            {"id": ing_ids["Black Pepper"], "qty": 5, "unit": "g"},
        ]
    },
    {
        "name": "Sourdough Loaf", "category": "Bakery",
        "base_yield": 1, "yield_unit": "loaf",
        "notes": "72h cold fermentation",
        "ings": [
            {"id": ing_ids["Bread Flour"], "qty": 500, "unit": "g"},
            {"id": ing_ids["Sourdough Starter"], "qty": 100, "unit": "g"},
            {"id": ing_ids["Sea Salt"], "qty": 10, "unit": "g"},
        ]
    },
    {
        "name": "Crème Brûlée", "category": "Dessert",
        "base_yield": 6, "yield_unit": "portions",
        "notes": "Requires heavy cream — check stock",
        "ings": [
            {"id": ing_ids["Heavy Cream"], "qty": 500, "unit": "ml"},
            {"id": ing_ids["Eggs"], "qty": 6, "unit": "piece"},
            {"id": ing_ids["Sugar"], "qty": 120, "unit": "g"},
            {"id": ing_ids["Vanilla Extract"], "qty": 10, "unit": "ml"},
        ]
    },
    {
        "name": "Aglio e Olio", "category": "Italian",
        "base_yield": 2, "yield_unit": "portions",
        "notes": "Quick garlic pasta",
        "ings": [
            {"id": ing_ids["00 Flour"], "qty": 200, "unit": "g"},
            {"id": ing_ids["Garlic"], "qty": 4, "unit": "piece"},
            {"id": ing_ids["Olive Oil"], "qty": 60, "unit": "ml"},
            {"id": ing_ids["Sea Salt"], "qty": 5, "unit": "g"},
            {"id": ing_ids["Black Pepper"], "qty": 3, "unit": "g"},
        ]
    },
]
rec_ids = {}
for rec in recipes:
    r = requests.post(f"{BASE}/recipes", json=rec)
    rec_ids[rec["name"]] = r.json()["id"]
    print(f"  Recipe: {rec['name']}")

# ── Vendors ───────────────────────────────────────────────
vendors = [
    {"name": "Event Pro Rentals", "contact_name": "Ahmed Hassan",
     "phone": "+20-100-123-4567", "email": "ahmed@eventpro.eg", "notes": "Best for large events"},
    {"name": "Cairo Flowers Co.", "contact_name": "Sara Nabil",
     "phone": "+20-100-987-6543", "email": "sara@cairoflowers.eg"},
]
vendor_ids = {}
for v in vendors:
    r = requests.post(f"{BASE}/vendors", json=v)
    vendor_ids[v["name"]] = r.json()["id"]
    print(f"  Vendor: {v['name']}")

# ── Setup Items ───────────────────────────────────────────
setup_items = [
    {"name": "Round Table (10 seats)", "category": "Furniture",
     "cost_per_hour": 5.0, "qty_available": 20, "vendor_id": vendor_ids["Event Pro Rentals"]},
    {"name": "Folding Chair", "category": "Furniture",
     "cost_per_hour": 0.5, "qty_available": 200, "vendor_id": vendor_ids["Event Pro Rentals"]},
    {"name": "Dinner Plate Set (12)", "category": "Tableware",
     "cost_per_hour": 2.0, "qty_available": 50, "vendor_id": vendor_ids["Event Pro Rentals"]},
    {"name": "Centerpiece Flowers", "category": "Decoration",
     "cost_per_hour": 8.0, "qty_available": 30, "vendor_id": vendor_ids["Cairo Flowers Co."]},
    {"name": "LED Uplighting (per unit)", "category": "Lighting",
     "cost_per_hour": 3.5, "qty_available": 40, "vendor_id": vendor_ids["Event Pro Rentals"]},
    {"name": "Outdoor Tent (5×10m)", "category": "Structure",
     "cost_per_hour": 25.0, "qty_available": 5, "vendor_id": vendor_ids["Event Pro Rentals"]},
    {"name": "Sound System", "category": "AV",
     "cost_per_hour": 15.0, "qty_available": 3, "vendor_id": vendor_ids["Event Pro Rentals"]},
]
setup_ids = {}
for s in setup_items:
    r = requests.post(f"{BASE}/setup-items", json=s)
    setup_ids[s["name"]] = r.json()["id"]
    print(f"  Setup Item: {s['name']}")

# ── Sample Event ──────────────────────────────────────────
event = {
    "name": "Al-Rashid Wedding Reception",
    "event_date": str(today + timedelta(days=14)),
    "duration_hrs": 6,
    "guest_count": 80,
    "notes": "80 guests, outdoor garden setup",
    "recipes": [
        {"recipe_id": rec_ids["Pasta Carbonara"], "portions": 80},
        {"recipe_id": rec_ids["Sourdough Loaf"], "portions": 10},
    ],
    "setup_items": [
        {"setup_item_id": setup_ids["Round Table (10 seats)"], "quantity": 8, "hours": 6},
        {"setup_item_id": setup_ids["Folding Chair"], "quantity": 80, "hours": 6},
        {"setup_item_id": setup_ids["Dinner Plate Set (12)"], "quantity": 8, "hours": 6},
        {"setup_item_id": setup_ids["Centerpiece Flowers"], "quantity": 8, "hours": 6},
        {"setup_item_id": setup_ids["LED Uplighting (per unit)"], "quantity": 12, "hours": 6},
        {"setup_item_id": setup_ids["Outdoor Tent (5×10m)"], "quantity": 2, "hours": 6},
        {"setup_item_id": setup_ids["Sound System"], "quantity": 1, "hours": 6},
    ]
}
r = requests.post(f"{BASE}/events", json=event)
print(f"  Event: {r.json()['name']} — total cost ${r.json()['total']}")

print("\n✅ Seed complete! Open http://localhost:5173")
