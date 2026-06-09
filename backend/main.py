import os
import json
import urllib.request
import urllib.error
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import date, timedelta
import uuid

from database import engine, get_db, Base
from auth import get_current_user
from bootstrap import ensure_local_schema
import license_client
import backups
import gdrive
import threading
from models import (Category, Ingredient, InventoryBatch, Recipe, RecipeIngredient,
                    Vendor, SetupItem, Event, EventRecipe, EventSetupItem, EventItem, Transaction,
                    CookedStock, Item, ItemSubRecipe, ItemIngredient, WasteLog)
from schemas import (CategoryCreate, CategoryOut,
                     IngredientCreate, IngredientOut,
                     BatchCreate, BatchOut,
                     RecipeCreate, RecipeOut, CookRequest,
                     VendorCreate, VendorOut,
                     SetupItemCreate, SetupItemOut,
                     EventCreate, EventOut,
                     InventoryUpdate,
                     CookedStockCreate, CookedStockOut,
                     ItemCreate, ItemOut, AssembleRequest,
                     WasteCreate, WasteOut, CookToStockRequest)

ensure_local_schema(engine)        # patch older local DBs before create_all
Base.metadata.create_all(bind=engine)
backups.auto_backup()              # daily local snapshot on startup (keep last 30)
# Google Drive: upload in the background if >24h since the last cloud backup.
threading.Thread(target=gdrive.auto_backup_if_due, daemon=True).start()

app = FastAPI(title="ChefOS API v2")

# Local desktop build: the webview origin is tauri://localhost (and the phone
# uses the LAN IP), so allow all origins. The server only binds to the local
# machine, so this is safe. Cloud build keeps an explicit allow-list.
if os.environ.get("CHEFOS_LOCAL") == "1":
    CORS_ORIGINS = ["*"]
else:
    _raw_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    CORS_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check (no auth) — the desktop shell polls this to know the
#    bundled backend has finished booting before loading the UI ──────
@app.get("/health")
def health():
    return {"ok": True}


# ── License activation (no auth — these gate the app itself) ────────
@app.get("/license/status")
def license_status():
    return license_client.status()


@app.post("/license/activate")
def license_activate(body: dict):
    return license_client.activate(body.get("key", ""))


@app.post("/license/deactivate")
def license_deactivate():
    return license_client.deactivate()


# ── AI assistant (online) — routes the chef's question + a summary of THEIR
#    data through the license Worker to Cloudflare AI. License-gated server-side.
def _build_ai_context(db: Session, user_id: str) -> str:
    lines = []
    ings = {i.id: i for i in db.query(Ingredient).filter(Ingredient.user_id == user_id).all()}
    recipes = (db.query(Recipe).options(joinedload(Recipe.ingredients))
               .filter(Recipe.user_id == user_id).all())
    lines.append("RECIPES (name | yield | cost/portion | ingredients):")
    for r in recipes[:40]:
        cost, parts = 0.0, []
        for ri in r.ingredients:
            ing = ings.get(ri.ingredient_id)
            if ing:
                cost += ri.qty * (ing.cost or 0)
                parts.append(f"{ing.name} {ri.qty:g}{ri.unit}")
        pp = cost / r.base_yield if r.base_yield else cost
        marg = f" | target margin {r.profit_margin:g}%" if r.profit_margin else ""
        lines.append(f"- {r.name} | {r.base_yield:g} {r.yield_unit} | EGP {pp:.2f}/portion{marg} | "
                     + ", ".join(parts[:12]))
    low = []
    for ing in ings.values():
        stock = ing.stock
        if stock <= 0:
            low.append(f"{ing.name}: OUT")
        elif ing.threshold and stock < ing.threshold:
            low.append(f"{ing.name}: low ({stock:g}{ing.unit})")
    if low:
        lines.append("\nLOW / OUT OF STOCK: " + "; ".join(low[:30]))
    total_val = sum((ing.stock * (ing.cost or 0)) for ing in ings.values())
    lines.append(f"\nTOTAL INVENTORY VALUE: EGP {total_val:.2f}")
    return "\n".join(lines)


@app.post("/ai")
def ai_assistant(body: dict, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    question = (body.get("question") or "").strip()
    if not question:
        return {"ok": False, "error": "Empty question"}
    url = (getattr(license_client, "LICENSE_URL", "") or "").rstrip("/")
    if not url:
        return {"ok": False, "error": "The AI is not set up in this build."}
    key = license_client.get_license_key()
    if not key:
        return {"ok": False, "error": "Activate your license to use the online AI."}
    context = _build_ai_context(db, user_id)
    try:
        payload = json.dumps({"key": key, "question": question[:1500], "context": context}).encode()
        req = urllib.request.Request(url + "/ai", data=payload,
                                     headers={"content-type": "application/json",
                                              # Cloudflare blocks the default Python UA (error 1010)
                                              "User-Agent": "ChefOS/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        # The Worker replied with a real error (e.g. 403 inactive license) — surface it.
        try:
            return json.loads(e.read().decode())
        except Exception:
            return {"ok": False, "error": f"AI service error ({e.code})."}
    except Exception:
        return {"ok": False, "error": "Could not reach the AI service. Check your internet connection."}


# ── Backups (local) ────────────────────────────────────────
@app.get("/backup/list")
def backup_list():
    return {"backups": backups.list_backups()}


@app.post("/backup/export")
def backup_export():
    return backups.export_to_desktop()


@app.post("/backup/restore")
def backup_restore(body: dict):
    res = backups.restore_from_backup(body.get("name", ""))
    return res


@app.post("/backup/restore-upload")
def backup_restore_upload(body: dict):
    return backups.restore_from_zip_b64(body.get("zip_b64", ""))


# ── Google Drive cloud backup ──────────────────────────────
@app.get("/gdrive/status")
def gdrive_status():
    return gdrive.status()


@app.post("/gdrive/connect")
def gdrive_connect():
    return gdrive.connect()


@app.post("/gdrive/disconnect")
def gdrive_disconnect():
    return gdrive.disconnect()


@app.post("/gdrive/backup-now")
def gdrive_backup_now():
    return gdrive.backup_now()


@app.get("/gdrive/list")
def gdrive_list():
    return gdrive.list_drive()


@app.post("/gdrive/restore")
def gdrive_restore(body: dict):
    return gdrive.restore_drive(body.get("file_id", ""))


# ── Branding (restaurant name + logo) ──────────────────────
def _branding_file():
    db = os.environ.get("CHEFOS_DB_PATH")
    base = os.path.dirname(db) if db else os.path.dirname(__file__)
    return os.path.join(base, "branding.json")


_BRANDING_DEFAULTS = {"name": "", "logo": "", "margin": 70, "assistant_name": "Mgzz Assistant"}


def _read_branding():
    import json as _j
    data = dict(_BRANDING_DEFAULTS)
    try:
        with open(_branding_file()) as f:
            data.update(_j.load(f) or {})
    except Exception:
        pass
    return data


@app.get("/settings/branding")
def get_branding():
    return _read_branding()


@app.post("/settings/branding")
def set_branding(body: dict):
    import json as _j
    data = _read_branding()                       # merge — don't wipe other fields
    if "name" in body:           data["name"] = str(body.get("name") or "")[:60]
    if "logo" in body:           data["logo"] = body.get("logo") or ""
    if "assistant_name" in body: data["assistant_name"] = (str(body.get("assistant_name") or "").strip()[:40]) or "Mgzz Assistant"
    if "margin" in body:
        try:
            m = float(body.get("margin"))
            data["margin"] = max(0, min(95, round(m)))   # gross profit margin %, capped 0–95
        except Exception:
            pass
    try:
        with open(_branding_file(), "w") as f:
            _j.dump(data, f)
    except Exception:
        pass
    return data

# ─────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────

def new_id():
    return str(uuid.uuid4())

def ingredient_to_dict(ing: Ingredient) -> dict:
    return {
        "id": ing.id,
        "name": ing.name,
        "unit": ing.unit,
        "cost": ing.cost,
        "category_id": ing.category_id,
        "category_name": ing.category_rel.name if ing.category_rel else "Uncategorised",
        "category_color": ing.category_rel.color if ing.category_rel else "#888",
        "supplier": ing.supplier,
        "threshold": ing.threshold,
        "stock": ing.stock,
        "parent_ingredient_id": ing.parent_ingredient_id,
        "units_per_parent": ing.units_per_parent or 1,
        "parent_name": ing.parent_rel.name if ing.parent_ingredient_id and ing.parent_rel else None,
        "batches": [
            {
                "id": b.id,
                "quantity": b.quantity,
                "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
                "cost_snapshot": b.cost_snapshot,
                "notes": b.notes,
                "is_depleted": b.is_depleted,
                "expiry_status": expiry_status(b.expiry_date),
            }
            for b in ing.batches if not b.is_depleted
        ],
        "price_updated_at": ing.price_updated_at.isoformat() if ing.price_updated_at else None,
    }

def expiry_status(expiry_date) -> str:
    if expiry_date is None:
        return "none"
    today = date.today()
    if expiry_date < today:
        return "expired"
    if expiry_date <= today + timedelta(days=3):
        return "critical"
    if expiry_date <= today + timedelta(days=7):
        return "warning"
    return "ok"

def deduct_fifo(db: Session, ingredient_id: str, amount: float):
    # Derived ingredient (e.g. Egg yolk) → consume from its parent (Egg) instead,
    # converting units: `amount` derived units need amount / units_per_parent parents.
    ing = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ing and ing.parent_ingredient_id:
        factor = ing.units_per_parent or 1
        return deduct_fifo(db, ing.parent_ingredient_id, amount / factor)
    batches = (db.query(InventoryBatch)
               .filter(InventoryBatch.ingredient_id == ingredient_id,
                       InventoryBatch.is_depleted == False)
               .order_by(InventoryBatch.expiry_date.asc().nullslast(),
                         InventoryBatch.created_at.asc())
               .all())
    remaining = amount
    for batch in batches:
        if remaining <= 0:
            break
        if batch.quantity <= remaining:
            remaining -= batch.quantity
            batch.quantity = 0
            batch.is_depleted = True
        else:
            batch.quantity -= remaining
            remaining = 0
    if remaining > 0:
        raise HTTPException(422, f"Insufficient stock for ingredient {ingredient_id}")

# ─────────────────────────────────────────────────────────
# CATEGORIES
# ─────────────────────────────────────────────────────────

@app.get("/categories")
def list_categories(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    cats = db.query(Category).filter(Category.user_id == user_id).order_by(Category.name).all()
    result = []
    for c in cats:
        count = (db.query(func.count(Ingredient.id))
                 .filter(Ingredient.category_id == c.id, Ingredient.user_id == user_id)
                 .scalar())
        result.append({"id": c.id, "name": c.name, "color": c.color,
                        "ingredient_count": count,
                        "created_at": c.created_at.isoformat() if c.created_at else None})
    return result

@app.post("/categories")
def create_category(data: CategoryCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    existing = db.query(Category).filter(Category.name == data.name, Category.user_id == user_id).first()
    if existing:
        raise HTTPException(400, f"Category '{data.name}' already exists")
    cat = Category(id=new_id(), name=data.name, color=data.color or "#c8922a", user_id=user_id)
    db.add(cat); db.commit(); db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "color": cat.color, "ingredient_count": 0}

@app.patch("/categories/{cat_id}")
def update_category(cat_id: str, data: CategoryCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    cat = db.query(Category).filter(Category.id == cat_id, Category.user_id == user_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    cat.name = data.name
    if data.color:
        cat.color = data.color
    db.commit(); db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "color": cat.color}

@app.delete("/categories/{cat_id}")
def delete_category(cat_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    count = (db.query(func.count(Ingredient.id))
             .filter(Ingredient.category_id == cat_id, Ingredient.user_id == user_id)
             .scalar())
    if count > 0:
        raise HTTPException(400, f"Cannot delete: {count} ingredient(s) still use this category.")
    cat = db.query(Category).filter(Category.id == cat_id, Category.user_id == user_id).first()
    if not cat:
        raise HTTPException(404, "Not found")
    db.delete(cat); db.commit()
    return {"ok": True}

# ─────────────────────────────────────────────────────────
# INGREDIENTS
# ─────────────────────────────────────────────────────────

@app.get("/ingredients")
def list_ingredients(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ings = (db.query(Ingredient)
            .filter(Ingredient.user_id == user_id)
            .options(joinedload(Ingredient.category_rel),
                     joinedload(Ingredient.batches))
            .order_by(Ingredient.name)
            .all())
    return [ingredient_to_dict(i) for i in ings]

@app.post("/ingredients")
def create_ingredient(data: IngredientCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ing = Ingredient(id=new_id(), name=data.name, unit=data.unit,
                     cost=data.cost, category_id=data.category_id,
                     supplier=data.supplier, threshold=data.threshold,
                     parent_ingredient_id=data.parent_ingredient_id or None,
                     units_per_parent=data.units_per_parent or 1,
                     user_id=user_id)
    db.add(ing); db.commit()
    ing = (db.query(Ingredient)
           .options(joinedload(Ingredient.category_rel), joinedload(Ingredient.batches))
           .filter(Ingredient.id == ing.id).first())
    return ingredient_to_dict(ing)

@app.patch("/ingredients/{ing_id}")
def update_ingredient(ing_id: str, data: IngredientCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ing = db.query(Ingredient).filter(Ingredient.id == ing_id, Ingredient.user_id == user_id).first()
    if not ing:
        raise HTTPException(404, "Not found")
    price_changed = ing.cost != data.cost
    ing.name = data.name; ing.unit = data.unit; ing.cost = data.cost
    ing.category_id = data.category_id; ing.supplier = data.supplier
    ing.threshold = data.threshold
    ing.parent_ingredient_id = data.parent_ingredient_id or None
    ing.units_per_parent = data.units_per_parent or 1
    if price_changed:
        from sqlalchemy.sql import func as sqlfunc
        ing.price_updated_at = sqlfunc.now()
    db.commit()
    ing = (db.query(Ingredient)
           .options(joinedload(Ingredient.category_rel), joinedload(Ingredient.batches))
           .filter(Ingredient.id == ing_id).first())
    return ingredient_to_dict(ing)

@app.delete("/ingredients/{ing_id}")
def delete_ingredient(ing_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    used = db.query(RecipeIngredient).filter(RecipeIngredient.ingredient_id == ing_id).first()
    if used:
        raise HTTPException(400, "Ingredient is used in recipes. Remove from recipes first.")
    ing = db.query(Ingredient).filter(Ingredient.id == ing_id, Ingredient.user_id == user_id).first()
    if not ing:
        raise HTTPException(404, "Not found")
    db.delete(ing); db.commit()
    return {"ok": True}

# ─────────────────────────────────────────────────────────
# INVENTORY BATCHES
# ─────────────────────────────────────────────────────────

@app.get("/inventory")
def get_inventory(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ings = (db.query(Ingredient)
            .filter(Ingredient.user_id == user_id)
            .options(joinedload(Ingredient.category_rel),
                     joinedload(Ingredient.batches))
            .order_by(Ingredient.name)
            .all())
    return [ingredient_to_dict(i) for i in ings]

@app.post("/inventory/restock")
def restock(data: BatchCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ing = db.query(Ingredient).filter(Ingredient.id == data.ingredient_id, Ingredient.user_id == user_id).first()
    if not ing:
        raise HTTPException(404, "Ingredient not found")
    batch = InventoryBatch(
        id=new_id(),
        ingredient_id=data.ingredient_id,
        quantity=data.quantity,
        expiry_date=data.expiry_date,
        cost_snapshot=data.cost_snapshot or ing.cost,
        notes=data.notes or "",
    )
    if data.cost_snapshot and data.cost_snapshot != ing.cost:
        ing.cost = data.cost_snapshot
    db.add(batch)
    db.add(Transaction(id=new_id(), type="restock",
                       ingredient_id=ing.id, qty_change=data.quantity,
                       cost_snapshot=batch.cost_snapshot, user_id=user_id))
    db.commit()
    ing = (db.query(Ingredient)
           .options(joinedload(Ingredient.category_rel), joinedload(Ingredient.batches))
           .filter(Ingredient.id == ing.id).first())
    return ingredient_to_dict(ing)

@app.patch("/inventory/{ing_id}")
def set_inventory(ing_id: str, payload: InventoryUpdate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ing = (db.query(Ingredient)
           .options(joinedload(Ingredient.batches))
           .filter(Ingredient.id == ing_id, Ingredient.user_id == user_id).first())
    if not ing:
        raise HTTPException(404, "Not found")
    if payload.stock < 0:
        raise HTTPException(400, "Stock cannot be negative")
    if payload.threshold is not None:
        ing.threshold = payload.threshold
    old = sum(b.quantity for b in ing.batches if not b.is_depleted)
    for b in ing.batches:
        if not b.is_depleted:
            b.is_depleted = True
    if payload.stock > 0:
        batch = InventoryBatch(id=new_id(), ingredient_id=ing_id,
                               quantity=payload.stock, cost_snapshot=ing.cost)
        db.add(batch)
    db.add(Transaction(id=new_id(), type="manual_adjust",
                       ingredient_id=ing_id, qty_change=round(payload.stock - old, 4),
                       cost_snapshot=ing.cost, user_id=user_id))
    db.commit()
    ing = (db.query(Ingredient)
           .options(joinedload(Ingredient.category_rel), joinedload(Ingredient.batches))
           .filter(Ingredient.id == ing_id).first())
    return ingredient_to_dict(ing)

@app.patch("/inventory/batch/{batch_id}")
def update_batch(batch_id: str, payload: dict, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    batch = (db.query(InventoryBatch)
             .join(Ingredient)
             .filter(InventoryBatch.id == batch_id, Ingredient.user_id == user_id)
             .first())
    if not batch:
        raise HTTPException(404, "Batch not found")
    if "expiry_date" in payload:
        ed = payload["expiry_date"]
        if ed:
            from datetime import datetime
            batch.expiry_date = datetime.strptime(ed, "%Y-%m-%d").date()
        else:
            batch.expiry_date = None
    if "notes" in payload:
        batch.notes = payload["notes"]
    db.commit()
    return {"ok": True}

@app.delete("/inventory/batch/{batch_id}")
def delete_batch(batch_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    batch = (db.query(InventoryBatch)
             .join(Ingredient)
             .filter(InventoryBatch.id == batch_id, Ingredient.user_id == user_id)
             .first())
    if not batch:
        raise HTTPException(404, "Batch not found")
    batch.is_depleted = True
    batch.quantity = 0
    db.commit()
    return {"ok": True}

@app.get("/inventory/alerts")
def get_alerts(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ings = (db.query(Ingredient)
            .filter(Ingredient.user_id == user_id)
            .options(joinedload(Ingredient.category_rel), joinedload(Ingredient.batches))
            .all())
    alerts = []
    today = date.today()
    for ing in ings:
        if ing.parent_ingredient_id:
            continue  # derived ingredients (egg yolk/white) alert via their parent
        stock = sum(b.quantity for b in ing.batches if not b.is_depleted)
        if stock <= 0:
            alerts.append({"type": "out", "ingredient": ing.name, "stock": 0, "unit": ing.unit})
        elif stock <= ing.threshold:
            alerts.append({"type": "low", "ingredient": ing.name, "stock": stock, "unit": ing.unit, "threshold": ing.threshold})
        for b in ing.batches:
            if not b.is_depleted and b.expiry_date:
                es = expiry_status(b.expiry_date)
                if es in ("expired", "critical", "warning"):
                    alerts.append({"type": es, "ingredient": ing.name,
                                   "expiry": b.expiry_date.isoformat(), "qty": b.quantity, "unit": ing.unit})
    return alerts

# ─────────────────────────────────────────────────────────
# RECIPES
# ─────────────────────────────────────────────────────────

def recipe_to_dict(r: Recipe, db: Session) -> dict:
    ings = [{"id": ri.ingredient_id, "qty": ri.qty, "unit": ri.unit}
            for ri in r.ingredients]
    return {"id": r.id, "name": r.name, "category": r.category,
            "base_yield": r.base_yield, "yield_unit": r.yield_unit,
            "notes": r.notes, "profit_margin": r.profit_margin, "ings": ings}

@app.get("/recipes")
def list_recipes(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    recipes = (db.query(Recipe)
               .filter(Recipe.user_id == user_id)
               .options(joinedload(Recipe.ingredients))
               .all())
    return [recipe_to_dict(r, db) for r in recipes]

@app.post("/recipes")
def create_recipe(data: RecipeCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    r = Recipe(id=new_id(), name=data.name, category=data.category,
               base_yield=data.base_yield, yield_unit=data.yield_unit,
               notes=data.notes, profit_margin=data.profit_margin, user_id=user_id)
    db.add(r)
    for ri in data.ings:
        db.add(RecipeIngredient(id=new_id(), recipe_id=r.id,
                                ingredient_id=ri.id, qty=ri.qty, unit=ri.unit))
    db.commit()
    r = db.query(Recipe).options(joinedload(Recipe.ingredients)).filter(Recipe.id == r.id).first()
    return recipe_to_dict(r, db)

@app.patch("/recipes/{recipe_id}")
def update_recipe(recipe_id: str, data: RecipeCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    r = db.query(Recipe).filter(Recipe.id == recipe_id, Recipe.user_id == user_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    r.name = data.name; r.category = data.category
    r.base_yield = data.base_yield; r.yield_unit = data.yield_unit; r.notes = data.notes
    r.profit_margin = data.profit_margin
    db.query(RecipeIngredient).filter(RecipeIngredient.recipe_id == recipe_id).delete()
    for ri in data.ings:
        db.add(RecipeIngredient(id=new_id(), recipe_id=recipe_id,
                                ingredient_id=ri.id, qty=ri.qty, unit=ri.unit))
    db.commit()
    r = db.query(Recipe).options(joinedload(Recipe.ingredients)).filter(Recipe.id == recipe_id).first()
    return recipe_to_dict(r, db)

@app.delete("/recipes/{recipe_id}")
def delete_recipe(recipe_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    r = db.query(Recipe).filter(Recipe.id == recipe_id, Recipe.user_id == user_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    db.delete(r); db.commit()
    return {"ok": True}

@app.get("/recipes/{recipe_id}/cost")
def get_cost(recipe_id: str, scale: float = 1.0, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    r = db.query(Recipe).options(joinedload(Recipe.ingredients)).filter(Recipe.id == recipe_id, Recipe.user_id == user_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    total = 0; breakdown = []
    for ri in r.ingredients:
        ing = (db.query(Ingredient).options(joinedload(Ingredient.batches))
               .filter(Ingredient.id == ri.ingredient_id, Ingredient.user_id == user_id).first())
        if not ing:
            continue
        qty = ri.qty * scale
        cost = qty * ing.cost
        total += cost
        breakdown.append({"name": ing.name, "qty": round(qty, 3),
                           "unit": ri.unit, "cost": round(cost, 4)})
    portions = r.base_yield * scale
    return {"total": round(total, 4), "per_portion": round(total / portions, 4),
            "portions": portions, "breakdown": breakdown}

@app.get("/recipes/{recipe_id}/simulate")
def simulate(recipe_id: str, scale: float = 1.0, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    r = db.query(Recipe).options(joinedload(Recipe.ingredients)).filter(Recipe.id == recipe_id, Recipe.user_id == user_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    issues = []; all_ok = True
    for ri in r.ingredients:
        ing = (db.query(Ingredient).options(joinedload(Ingredient.batches))
               .filter(Ingredient.id == ri.ingredient_id, Ingredient.user_id == user_id).first())
        if not ing:
            continue
        needed = ri.qty * scale
        stock = ing.stock
        if stock < needed:
            all_ok = False
            issues.append({"name": ing.name, "needed": needed, "have": stock, "unit": ri.unit})
    cost_data = get_cost(recipe_id, scale, db, user_id)
    return {**cost_data, "all_ok": all_ok, "issues": issues}

@app.post("/cook")
def cook(req: CookRequest, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    r = db.query(Recipe).options(joinedload(Recipe.ingredients)).filter(Recipe.id == req.recipe_id, Recipe.user_id == user_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    for ri in r.ingredients:
        ing = (db.query(Ingredient).options(joinedload(Ingredient.batches))
               .filter(Ingredient.id == ri.ingredient_id, Ingredient.user_id == user_id).first())
        if ing:
            stock = ing.stock
            if stock < ri.qty * req.scale_factor:
                raise HTTPException(422, f"Insufficient stock: {ing.name}")
    for ri in r.ingredients:
        ing = db.query(Ingredient).filter(Ingredient.id == ri.ingredient_id, Ingredient.user_id == user_id).first()
        if ing:
            deduct_fifo(db, ing.id, ri.qty * req.scale_factor)
            db.add(Transaction(id=new_id(), type="cook", recipe_id=req.recipe_id,
                               ingredient_id=ing.id,
                               qty_change=-(ri.qty * req.scale_factor),
                               scale_factor=req.scale_factor, user_id=user_id))
    db.commit()
    return {"ok": True, "portions": req.portions}

# ─────────────────────────────────────────────────────────
# VENDORS
# ─────────────────────────────────────────────────────────

@app.get("/vendors")
def list_vendors(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    return db.query(Vendor).filter(Vendor.user_id == user_id).order_by(Vendor.name).all()

@app.post("/vendors")
def create_vendor(data: VendorCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    v = Vendor(id=new_id(), user_id=user_id, **data.dict())
    db.add(v); db.commit(); db.refresh(v)
    return v

@app.patch("/vendors/{vid}")
def update_vendor(vid: str, data: VendorCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    v = db.query(Vendor).filter(Vendor.id == vid, Vendor.user_id == user_id).first()
    if not v:
        raise HTTPException(404, "Not found")
    for k, val in data.dict().items():
        setattr(v, k, val)
    db.commit(); db.refresh(v)
    return v

@app.delete("/vendors/{vid}")
def delete_vendor(vid: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    v = db.query(Vendor).filter(Vendor.id == vid, Vendor.user_id == user_id).first()
    if not v:
        raise HTTPException(404, "Not found")
    db.delete(v); db.commit()
    return {"ok": True}

# ─────────────────────────────────────────────────────────
# SETUP ITEMS
# ─────────────────────────────────────────────────────────

def setup_to_dict(s: SetupItem) -> dict:
    return {
        "id": s.id, "name": s.name, "category": s.category,
        "cost_per_hour": s.cost_per_hour, "qty_available": s.qty_available,
        "vendor_id": s.vendor_id,
        "vendor_name": s.vendor_rel.name if s.vendor_rel else None,
        "notes": s.notes,
    }

@app.get("/setup-items")
def list_setup_items(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    items = (db.query(SetupItem)
             .filter(SetupItem.user_id == user_id)
             .options(joinedload(SetupItem.vendor_rel))
             .all())
    return [setup_to_dict(s) for s in items]

@app.post("/setup-items")
def create_setup_item(data: SetupItemCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    s = SetupItem(id=new_id(), user_id=user_id, **data.dict())
    db.add(s); db.commit()
    s = db.query(SetupItem).options(joinedload(SetupItem.vendor_rel)).filter(SetupItem.id == s.id).first()
    return setup_to_dict(s)

@app.patch("/setup-items/{sid}")
def update_setup_item(sid: str, data: SetupItemCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    s = db.query(SetupItem).filter(SetupItem.id == sid, SetupItem.user_id == user_id).first()
    if not s:
        raise HTTPException(404, "Not found")
    for k, val in data.dict().items():
        setattr(s, k, val)
    db.commit()
    s = db.query(SetupItem).options(joinedload(SetupItem.vendor_rel)).filter(SetupItem.id == sid).first()
    return setup_to_dict(s)

@app.delete("/setup-items/{sid}")
def delete_setup_item(sid: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    s = db.query(SetupItem).filter(SetupItem.id == sid, SetupItem.user_id == user_id).first()
    if not s:
        raise HTTPException(404, "Not found")
    db.delete(s); db.commit()
    return {"ok": True}

# ─────────────────────────────────────────────────────────
# EVENTS
# ─────────────────────────────────────────────────────────

def _item_unit_cost(item: Item, db: Session, user_id: str) -> float:
    """Cost of ONE finished unit of this item (its batch cost ÷ base yield)."""
    batch = 0.0
    for sr in item.sub_recipes:
        cs_rows = (db.query(CookedStock)
                   .filter(CookedStock.recipe_id == sr.recipe_id,
                           CookedStock.user_id == user_id,
                           CookedStock.is_depleted == False)
                   .all())
        total_q = sum(c.quantity for c in cs_rows)
        total_c = sum(c.cost_snapshot for c in cs_rows)
        if total_q > 0:
            batch += (total_c / total_q) * sr.quantity
    for si in item.sub_ings:
        ing = db.query(Ingredient).filter(Ingredient.id == si.ingredient_id, Ingredient.user_id == user_id).first()
        if ing:
            batch += si.qty * ing.cost
    return batch / item.base_yield if item.base_yield else batch

def event_cost(event: Event, db: Session, user_id: str) -> dict:
    food_cost = 0
    setup_cost = 0
    for er in event.recipes:
        r = db.query(Recipe).options(joinedload(Recipe.ingredients)).filter(Recipe.id == er.recipe_id, Recipe.user_id == user_id).first()
        if not r:
            continue
        scale = er.portions / r.base_yield
        for ri in r.ingredients:
            ing = db.query(Ingredient).filter(Ingredient.id == ri.ingredient_id, Ingredient.user_id == user_id).first()
            if ing:
                food_cost += ri.qty * scale * ing.cost
    for ei in event.items:
        it = (db.query(Item)
              .options(joinedload(Item.sub_recipes), joinedload(Item.sub_ings))
              .filter(Item.id == ei.item_id, Item.user_id == user_id).first())
        if it:
            food_cost += _item_unit_cost(it, db, user_id) * ei.quantity
    for esi in event.setup_items:
        s = db.query(SetupItem).filter(SetupItem.id == esi.setup_item_id, SetupItem.user_id == user_id).first()
        if s:
            setup_cost += esi.quantity * esi.hours * s.cost_per_hour
    return {"food_cost": round(food_cost, 2), "setup_cost": round(setup_cost, 2),
            "total": round(food_cost + setup_cost, 2)}

def event_to_dict(ev: Event, db: Session, user_id: str) -> dict:
    recipes = [{"recipe_id": er.recipe_id, "portions": er.portions} for er in ev.recipes]
    items   = [{"item_id": ei.item_id, "quantity": ei.quantity} for ei in ev.items]
    setup   = [{"setup_item_id": esi.setup_item_id, "quantity": esi.quantity, "hours": esi.hours} for esi in ev.setup_items]
    costs   = event_cost(ev, db, user_id)
    return {
        "id": ev.id, "name": ev.name,
        "event_date": ev.event_date.isoformat() if ev.event_date else None,
        "duration_hrs": ev.duration_hrs, "guest_count": ev.guest_count,
        "notes": ev.notes, "status": ev.status,
        "recipes": recipes, "items": items, "setup_items": setup,
        **costs,
    }

@app.get("/events")
def list_events(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    events = (db.query(Event)
              .filter(Event.user_id == user_id)
              .options(joinedload(Event.recipes), joinedload(Event.items), joinedload(Event.setup_items))
              .order_by(Event.event_date.desc().nullslast())
              .all())
    return [event_to_dict(ev, db, user_id) for ev in events]

@app.post("/events")
def create_event(data: EventCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ev = Event(id=new_id(), name=data.name, event_date=data.event_date,
               duration_hrs=data.duration_hrs, guest_count=data.guest_count,
               notes=data.notes, user_id=user_id)
    db.add(ev)
    for er in data.recipes:
        db.add(EventRecipe(id=new_id(), event_id=ev.id,
                           recipe_id=er.recipe_id, portions=er.portions))
    for ei in data.items:
        db.add(EventItem(id=new_id(), event_id=ev.id,
                         item_id=ei.item_id, quantity=ei.quantity))
    for esi in data.setup_items:
        db.add(EventSetupItem(id=new_id(), event_id=ev.id,
                              setup_item_id=esi.setup_item_id,
                              quantity=esi.quantity, hours=esi.hours))
    db.commit()
    ev = (db.query(Event)
          .options(joinedload(Event.recipes), joinedload(Event.items), joinedload(Event.setup_items))
          .filter(Event.id == ev.id).first())
    return event_to_dict(ev, db, user_id)

@app.patch("/events/{eid}")
def update_event(eid: str, data: EventCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ev = db.query(Event).filter(Event.id == eid, Event.user_id == user_id).first()
    if not ev:
        raise HTTPException(404, "Not found")
    ev.name = data.name; ev.event_date = data.event_date
    ev.duration_hrs = data.duration_hrs; ev.guest_count = data.guest_count
    ev.notes = data.notes
    db.query(EventRecipe).filter(EventRecipe.event_id == eid).delete()
    db.query(EventItem).filter(EventItem.event_id == eid).delete()
    db.query(EventSetupItem).filter(EventSetupItem.event_id == eid).delete()
    for er in data.recipes:
        db.add(EventRecipe(id=new_id(), event_id=eid, recipe_id=er.recipe_id, portions=er.portions))
    for ei in data.items:
        db.add(EventItem(id=new_id(), event_id=eid, item_id=ei.item_id, quantity=ei.quantity))
    for esi in data.setup_items:
        db.add(EventSetupItem(id=new_id(), event_id=eid,
                              setup_item_id=esi.setup_item_id,
                              quantity=esi.quantity, hours=esi.hours))
    db.commit()
    ev = (db.query(Event)
          .options(joinedload(Event.recipes), joinedload(Event.items), joinedload(Event.setup_items))
          .filter(Event.id == eid).first())
    return event_to_dict(ev, db, user_id)

@app.patch("/events/{eid}/status")
def update_event_status(eid: str, payload: dict, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ev = db.query(Event).filter(Event.id == eid, Event.user_id == user_id).first()
    if not ev:
        raise HTTPException(404, "Not found")
    ev.status = payload.get("status", ev.status)
    db.commit()
    return {"ok": True, "status": ev.status}

@app.delete("/events/{eid}")
def delete_event(eid: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    ev = db.query(Event).filter(Event.id == eid, Event.user_id == user_id).first()
    if not ev:
        raise HTTPException(404, "Not found")
    db.delete(ev); db.commit()
    return {"ok": True}

# ─────────────────────────────────────────────────────────
# TRANSACTIONS
# ─────────────────────────────────────────────────────────

@app.get("/transactions")
def get_transactions(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    return (db.query(Transaction)
            .filter(Transaction.user_id == user_id)
            .order_by(Transaction.created_at.desc())
            .limit(100)
            .all())

# ─────────────────────────────────────────────────────────
# COOKED STOCK
# ─────────────────────────────────────────────────────────

def cooked_stock_to_dict(cs: CookedStock, db: Session, user_id: str) -> dict:
    recipe = db.query(Recipe).filter(Recipe.id == cs.recipe_id, Recipe.user_id == user_id).first()
    from datetime import date as date_type
    exp = cs.expiry_date
    status = "none"
    if exp:
        today = date_type.today()
        delta = (exp - today).days
        if delta < 0:    status = "expired"
        elif delta <= 3: status = "critical"
        elif delta <= 7: status = "warning"
        else:            status = "ok"
    return {
        "id": cs.id,
        "recipe_id": cs.recipe_id,
        "recipe_name": recipe.name if recipe else "Unknown",
        "quantity": cs.quantity,
        "unit": cs.unit,
        "cost_snapshot": cs.cost_snapshot,
        "expiry_date": cs.expiry_date.isoformat() if cs.expiry_date else None,
        "expiry_status": status,
        "notes": cs.notes,
        "is_depleted": cs.is_depleted,
        "created_at": cs.created_at.isoformat() if cs.created_at else None,
    }

@app.get("/cooked-stock")
def list_cooked_stock(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    stocks = (db.query(CookedStock)
              .filter(CookedStock.user_id == user_id, CookedStock.is_depleted == False)
              .order_by(CookedStock.expiry_date.asc().nullslast(), CookedStock.created_at.asc())
              .all())
    return [cooked_stock_to_dict(cs, db, user_id) for cs in stocks]

@app.post("/cooked-stock")
def add_cooked_stock(data: CookedStockCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    cs = CookedStock(id=new_id(), recipe_id=data.recipe_id,
                     quantity=data.quantity, unit=data.unit,
                     cost_snapshot=data.cost_snapshot or 0,
                     expiry_date=data.expiry_date, notes=data.notes or "",
                     user_id=user_id)
    db.add(cs); db.commit()
    return cooked_stock_to_dict(cs, db, user_id)

@app.delete("/cooked-stock/{cs_id}/waste")
def waste_cooked_stock(cs_id: str, payload: dict, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    cs = db.query(CookedStock).filter(CookedStock.id == cs_id, CookedStock.user_id == user_id).first()
    if not cs:
        raise HTTPException(404, "Cooked stock not found")
    if cs.is_depleted:
        raise HTTPException(400, "Already depleted")
    recipe = db.query(Recipe).filter(Recipe.id == cs.recipe_id).first()
    waste = WasteLog(
        id=new_id(), source_type="cooked_stock", source_id=cs_id,
        recipe_id=cs.recipe_id, name_snapshot=recipe.name if recipe else "Unknown",
        quantity=cs.quantity, unit=cs.unit, cost_lost=cs.cost_snapshot,
        reason=payload.get("reason", "other"), user_id=user_id,
    )
    cs.is_depleted = True; cs.quantity = 0
    db.add(waste); db.commit()
    return {"ok": True, "cost_lost": waste.cost_lost}

# ─────────────────────────────────────────────────────────
# COOK TO STOCK
# ─────────────────────────────────────────────────────────

@app.post("/cook-to-stock")
def cook_to_stock(req: CookToStockRequest, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    r = db.query(Recipe).options(joinedload(Recipe.ingredients)).filter(Recipe.id == req.recipe_id, Recipe.user_id == user_id).first()
    if not r:
        raise HTTPException(404, "Recipe not found")
    for ri in r.ingredients:
        ing = (db.query(Ingredient).options(joinedload(Ingredient.batches))
               .filter(Ingredient.id == ri.ingredient_id, Ingredient.user_id == user_id).first())
        if ing:
            stock = ing.stock
            if stock < ri.qty * req.scale_factor:
                raise HTTPException(422, f"Insufficient stock: {ing.name}")
    total_cost = 0
    for ri in r.ingredients:
        ing = (db.query(Ingredient).options(joinedload(Ingredient.batches))
               .filter(Ingredient.id == ri.ingredient_id, Ingredient.user_id == user_id).first())
        if ing:
            deduct_fifo(db, ing.id, ri.qty * req.scale_factor)
            total_cost += ri.qty * req.scale_factor * ing.cost
            db.add(Transaction(id=new_id(), type="cook", recipe_id=req.recipe_id,
                               ingredient_id=ing.id, qty_change=-(ri.qty * req.scale_factor),
                               scale_factor=req.scale_factor, user_id=user_id))
    cs = CookedStock(
        id=new_id(), recipe_id=req.recipe_id,
        quantity=r.base_yield * req.scale_factor, unit=r.yield_unit,
        cost_snapshot=round(total_cost, 4), expiry_date=req.expiry_date,
        notes=req.notes or f"Cooked {req.portions} portions · scale {req.scale_factor}x",
        user_id=user_id,
    )
    db.add(cs); db.commit()
    return {
        "ok": True, "cooked_stock_id": cs.id,
        "quantity": cs.quantity, "unit": cs.unit,
        "total_cost": round(total_cost, 4),
        "expiry_date": cs.expiry_date.isoformat() if cs.expiry_date else None,
    }

# ─────────────────────────────────────────────────────────
# ITEMS
# ─────────────────────────────────────────────────────────

def item_to_dict(item: Item, db: Session, user_id: str) -> dict:
    sub_r = []
    for sr in item.sub_recipes:
        r = db.query(Recipe).filter(Recipe.id == sr.recipe_id, Recipe.user_id == user_id).first()
        cs_rows = (db.query(CookedStock)
                   .filter(CookedStock.recipe_id == sr.recipe_id,
                           CookedStock.user_id == user_id,
                           CookedStock.is_depleted == False)
                   .all())
        avail = sum(c.quantity for c in cs_rows)
        sub_r.append({
            "recipe_id": sr.recipe_id,
            "recipe_name": r.name if r else "Unknown",
            "recipe_yield_unit": r.yield_unit if r else "",
            "quantity": sr.quantity, "unit": sr.unit,
            "cooked_stock_available": avail,
            "stock_ok": avail >= sr.quantity,
        })
    sub_i = []
    for si in item.sub_ings:
        ing = (db.query(Ingredient)
               .options(joinedload(Ingredient.batches))
               .filter(Ingredient.id == si.ingredient_id, Ingredient.user_id == user_id).first())
        if ing:
            sub_i.append({
                "ingredient_id": si.ingredient_id,
                "ingredient_name": ing.name,
                "qty": si.qty, "unit": si.unit,
                "stock": ing.stock, "stock_ok": ing.stock >= si.qty,
            })
    total_cost = 0
    for sr in item.sub_recipes:
        cs_rows = (db.query(CookedStock)
                   .filter(CookedStock.recipe_id == sr.recipe_id,
                           CookedStock.user_id == user_id,
                           CookedStock.is_depleted == False)
                   .order_by(CookedStock.created_at).all())
        if cs_rows:
            total_q = sum(c.quantity for c in cs_rows)
            total_c = sum(c.cost_snapshot for c in cs_rows)
            if total_q > 0:
                total_cost += (total_c / total_q) * sr.quantity
    for si in item.sub_ings:
        ing = db.query(Ingredient).filter(Ingredient.id == si.ingredient_id, Ingredient.user_id == user_id).first()
        if ing:
            total_cost += si.qty * ing.cost
    all_ok = all(s["stock_ok"] for s in sub_r) and all(s["stock_ok"] for s in sub_i)
    return {
        "id": item.id, "name": item.name, "category": item.category,
        "base_yield": item.base_yield, "yield_unit": item.yield_unit,
        "notes": item.notes, "sub_recipes": sub_r, "sub_ings": sub_i,
        "total_cost": round(total_cost, 4),
        "cost_per_unit": round(total_cost / item.base_yield, 4) if item.base_yield else 0,
        "all_stock_ok": all_ok,
    }

@app.get("/items")
def list_items(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    items = (db.query(Item)
             .filter(Item.user_id == user_id)
             .options(joinedload(Item.sub_recipes), joinedload(Item.sub_ings))
             .all())
    return [item_to_dict(i, db, user_id) for i in items]

@app.post("/items")
def create_item(data: ItemCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    item = Item(id=new_id(), name=data.name, category=data.category,
                base_yield=data.base_yield, yield_unit=data.yield_unit,
                notes=data.notes, user_id=user_id)
    db.add(item)
    for sr in data.sub_recipes:
        db.add(ItemSubRecipe(id=new_id(), item_id=item.id,
                             recipe_id=sr.recipe_id, quantity=sr.quantity, unit=sr.unit))
    for si in data.sub_ings:
        db.add(ItemIngredient(id=new_id(), item_id=item.id,
                              ingredient_id=si.ingredient_id, qty=si.qty, unit=si.unit))
    db.commit()
    item = (db.query(Item)
            .options(joinedload(Item.sub_recipes), joinedload(Item.sub_ings))
            .filter(Item.id == item.id).first())
    return item_to_dict(item, db, user_id)

@app.patch("/items/{item_id}")
def update_item(item_id: str, data: ItemCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    item = db.query(Item).filter(Item.id == item_id, Item.user_id == user_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    item.name = data.name; item.category = data.category
    item.base_yield = data.base_yield; item.yield_unit = data.yield_unit; item.notes = data.notes
    db.query(ItemSubRecipe).filter(ItemSubRecipe.item_id == item_id).delete()
    db.query(ItemIngredient).filter(ItemIngredient.item_id == item_id).delete()
    for sr in data.sub_recipes:
        db.add(ItemSubRecipe(id=new_id(), item_id=item_id,
                             recipe_id=sr.recipe_id, quantity=sr.quantity, unit=sr.unit))
    for si in data.sub_ings:
        db.add(ItemIngredient(id=new_id(), item_id=item_id,
                              ingredient_id=si.ingredient_id, qty=si.qty, unit=si.unit))
    db.commit()
    item = (db.query(Item)
            .options(joinedload(Item.sub_recipes), joinedload(Item.sub_ings))
            .filter(Item.id == item_id).first())
    return item_to_dict(item, db, user_id)

@app.delete("/items/{item_id}")
def delete_item(item_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    item = db.query(Item).filter(Item.id == item_id, Item.user_id == user_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    db.delete(item); db.commit()
    return {"ok": True}

@app.get("/items/{item_id}/simulate")
def simulate_item(item_id: str, scale: float = 1.0, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    item = (db.query(Item)
            .options(joinedload(Item.sub_recipes), joinedload(Item.sub_ings))
            .filter(Item.id == item_id, Item.user_id == user_id).first())
    if not item:
        raise HTTPException(404, "Not found")
    return item_to_dict(item, db, user_id)

@app.post("/items/{item_id}/assemble")
def assemble_item(item_id: str, req: AssembleRequest, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    item = (db.query(Item)
            .options(joinedload(Item.sub_recipes), joinedload(Item.sub_ings))
            .filter(Item.id == item_id, Item.user_id == user_id).first())
    if not item:
        raise HTTPException(404, "Not found")
    scale = req.scale_factor
    for sr in item.sub_recipes:
        cs_rows = (db.query(CookedStock)
                   .filter(CookedStock.recipe_id == sr.recipe_id,
                           CookedStock.user_id == user_id,
                           CookedStock.is_depleted == False).all())
        avail = sum(c.quantity for c in cs_rows)
        needed = sr.quantity * scale
        if avail < needed:
            r = db.query(Recipe).filter(Recipe.id == sr.recipe_id).first()
            raise HTTPException(422, f"Insufficient cooked stock for {r.name if r else sr.recipe_id}: need {needed} {sr.unit}, have {avail}")
    for si in item.sub_ings:
        ing = (db.query(Ingredient)
               .options(joinedload(Ingredient.batches))
               .filter(Ingredient.id == si.ingredient_id, Ingredient.user_id == user_id).first())
        if ing and ing.stock < si.qty * scale:
            raise HTTPException(422, f"Insufficient stock: {ing.name}")
    for sr in item.sub_recipes:
        needed = sr.quantity * scale
        cs_rows = (db.query(CookedStock)
                   .filter(CookedStock.recipe_id == sr.recipe_id,
                           CookedStock.user_id == user_id,
                           CookedStock.is_depleted == False)
                   .order_by(CookedStock.expiry_date.asc().nullslast(), CookedStock.created_at.asc()).all())
        for cs in cs_rows:
            if needed <= 0: break
            take = min(cs.quantity, needed)
            cs.quantity -= take; needed -= take
            if cs.quantity <= 0: cs.is_depleted = True
    for si in item.sub_ings:
        ing = (db.query(Ingredient)
               .options(joinedload(Ingredient.batches))
               .filter(Ingredient.id == si.ingredient_id, Ingredient.user_id == user_id).first())
        if ing:
            deduct_fifo(db, ing.id, si.qty * scale)
    db.add(Transaction(id=new_id(), type="item_assembly",
                       notes=f"Assembled {item.name} x{req.portions} (scale {scale}x)",
                       scale_factor=scale, user_id=user_id))
    db.commit()
    return {"ok": True, "item": item.name, "portions": req.portions}

# ─────────────────────────────────────────────────────────
# WASTE LOG
# ─────────────────────────────────────────────────────────

@app.get("/waste")
def list_waste(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    rows = db.query(WasteLog).filter(WasteLog.user_id == user_id).order_by(WasteLog.created_at.desc()).all()
    return [
        {"id": w.id, "source_type": w.source_type, "name_snapshot": w.name_snapshot,
         "quantity": w.quantity, "unit": w.unit, "cost_lost": w.cost_lost,
         "reason": w.reason, "created_at": w.created_at.isoformat() if w.created_at else None}
        for w in rows
    ]

@app.post("/waste/ingredient-batch/{batch_id}")
def waste_ingredient_batch(batch_id: str, payload: dict, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    batch = (db.query(InventoryBatch)
             .join(Ingredient)
             .filter(InventoryBatch.id == batch_id, Ingredient.user_id == user_id).first())
    if not batch:
        raise HTTPException(404, "Batch not found")
    if batch.is_depleted:
        raise HTTPException(400, "Already depleted")
    ing = db.query(Ingredient).filter(Ingredient.id == batch.ingredient_id).first()
    cost = (batch.cost_snapshot or (ing.cost if ing else 0)) * batch.quantity
    waste = WasteLog(
        id=new_id(), source_type="ingredient_batch", source_id=batch_id,
        ingredient_id=batch.ingredient_id,
        name_snapshot=ing.name if ing else "Unknown",
        quantity=batch.quantity, unit=ing.unit if ing else "",
        cost_lost=round(cost, 4), reason=payload.get("reason", "expired"),
        user_id=user_id,
    )
    batch.is_depleted = True; batch.quantity = 0
    db.add(waste); db.commit()
    return {"ok": True, "cost_lost": waste.cost_lost}

@app.delete("/waste/{waste_id}")
def delete_waste_entry(waste_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    w = db.query(WasteLog).filter(WasteLog.id == waste_id, WasteLog.user_id == user_id).first()
    if not w:
        raise HTTPException(404, "Not found")
    db.delete(w); db.commit()
    return {"ok": True}

@app.get("/waste/summary")
def waste_summary(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    rows = db.query(WasteLog).filter(WasteLog.user_id == user_id).all()
    total_cost = sum(w.cost_lost for w in rows)
    by_reason = {}
    for w in rows:
        by_reason[w.reason] = by_reason.get(w.reason, 0) + w.cost_lost
    return {
        "total_entries": len(rows),
        "total_cost_lost": round(total_cost, 2),
        "by_reason": {k: round(v, 2) for k, v in sorted(by_reason.items(), key=lambda x: -x[1])},
    }

# ─────────────────────────────────────────────────────────
# RESTOCK FROM COOK
# ─────────────────────────────────────────────────────────

@app.post("/restock-from-cook")
def restock_from_cook(payload: dict, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    recipe_id    = payload.get("recipe_id")
    scale_factor = payload.get("scale_factor", 1.0)
    recipe = db.query(Recipe).options(joinedload(Recipe.ingredients)).filter(Recipe.id == recipe_id, Recipe.user_id == user_id).first()
    if not recipe:
        raise HTTPException(404, "Recipe not found")
    restocked = []
    for ri in recipe.ingredients:
        ing = db.query(Ingredient).filter(Ingredient.id == ri.ingredient_id, Ingredient.user_id == user_id).first()
        if not ing:
            continue
        qty = ri.qty * scale_factor
        batch = InventoryBatch(id=new_id(), ingredient_id=ing.id,
                               quantity=qty, cost_snapshot=ing.cost,
                               notes="Restocked from cancelled order")
        db.add(batch)
        db.add(Transaction(id=new_id(), type="restock", ingredient_id=ing.id,
                           qty_change=qty, cost_snapshot=ing.cost,
                           notes="Cancelled order restock", user_id=user_id))
        restocked.append({"name": ing.name, "qty": qty, "unit": ing.unit})
    db.commit()
    return {"ok": True, "restocked": restocked}


# ═════════════════════════════════════════════════════════
# MOBILE ACCESS (same-WiFi) — Step 3
# The backend can serve the built frontend over the local network so a phone
# on the same WiFi can use ChefOS. Access is OFF by default; when off, any
# non-local client is refused (the port stays bound but serves nothing).
# ═════════════════════════════════════════════════════════
import sys as _sys
import socket as _socket
import json as _json
from fastapi import Request as _Request
from fastapi.responses import JSONResponse as _JSONResponse


def _mobile_file_path() -> str:
    db = os.environ.get("CHEFOS_DB_PATH")
    base = os.path.dirname(db) if db else os.path.dirname(__file__)
    return os.path.join(base, "mobile_access.json")


def _mobile_enabled() -> bool:
    try:
        with open(_mobile_file_path()) as f:
            return bool(_json.load(f).get("enabled", False))
    except Exception:
        return False


def _set_mobile(enabled: bool) -> None:
    try:
        with open(_mobile_file_path(), "w") as f:
            _json.dump({"enabled": bool(enabled)}, f)
    except Exception:
        pass


def _local_ip() -> str:
    s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


@app.middleware("http")
async def _lan_guard(request: _Request, call_next):
    client = request.client.host if request.client else "127.0.0.1"
    is_local = client in ("127.0.0.1", "::1", "localhost")
    if not is_local and not _mobile_enabled():
        return _JSONResponse(
            {"error": "Mobile access is turned off on the host computer."},
            status_code=403,
        )
    return await call_next(request)


@app.get("/mobile/status")
def mobile_status():
    port = int(os.environ.get("CHEFOS_PORT", "8000"))
    return {"enabled": _mobile_enabled(), "ip": _local_ip(), "port": port,
            "url": f"http://{_local_ip()}:{port}"}


@app.post("/mobile/toggle")
def mobile_toggle(body: dict):
    _set_mobile(bool(body.get("enabled")))
    return mobile_status()


# ── Serve the built frontend so phones on the LAN can load the app ──
def _frontend_dir():
    if getattr(_sys, "frozen", False):
        cand = os.path.join(getattr(_sys, "_MEIPASS", ""), "frontend_dist")
    else:
        cand = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
    return cand if os.path.isdir(cand) else None


_fe = _frontend_dir()
if _fe:
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_fe, html=True), name="frontend")
