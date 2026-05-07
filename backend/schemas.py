from pydantic import BaseModel
from typing import List, Optional
from datetime import date


# ── Category ──────────────────────────────────────────────
class CategoryCreate(BaseModel):
    name: str
    color: Optional[str] = "#c8922a"

class CategoryOut(CategoryCreate):
    id: str
    class Config:
        from_attributes = True


# ── Ingredient ────────────────────────────────────────────
class IngredientCreate(BaseModel):
    name: str
    unit: str
    cost: float
    category_id: Optional[str] = None
    supplier: Optional[str] = ""
    threshold: Optional[float] = 0

class IngredientOut(BaseModel):
    id: str
    name: str
    unit: str
    cost: float
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    supplier: Optional[str] = ""
    threshold: float
    stock: float
    class Config:
        from_attributes = True


# ── Inventory Batch ───────────────────────────────────────
class BatchCreate(BaseModel):
    ingredient_id: str
    quantity: float
    expiry_date: Optional[date] = None
    cost_snapshot: Optional[float] = None
    notes: Optional[str] = ""

class BatchOut(BaseModel):
    id: str
    ingredient_id: str
    quantity: float
    expiry_date: Optional[date] = None
    cost_snapshot: Optional[float] = None
    notes: Optional[str] = ""
    is_depleted: bool
    class Config:
        from_attributes = True


# ── Recipe ────────────────────────────────────────────────
class RecipeIngredientIn(BaseModel):
    id: str
    qty: float
    unit: str

class RecipeCreate(BaseModel):
    name: str
    category: Optional[str] = ""
    base_yield: Optional[int] = 4
    yield_unit: Optional[str] = "portions"
    notes: Optional[str] = ""
    ings: List[RecipeIngredientIn] = []

class RecipeOut(BaseModel):
    id: str
    name: str
    category: str
    base_yield: int
    yield_unit: str
    notes: str
    ings: List[RecipeIngredientIn] = []
    class Config:
        from_attributes = True


# ── Cook ──────────────────────────────────────────────────
class CookRequest(BaseModel):
    recipe_id: str
    scale_factor: float
    portions: int

class CookToStockRequest(BaseModel):
    recipe_id: str
    scale_factor: float
    portions: int
    expiry_date: Optional[date] = None
    notes: Optional[str] = None


# ── Vendor ────────────────────────────────────────────────
class VendorCreate(BaseModel):
    name: str
    contact_name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    notes: Optional[str] = ""

class VendorOut(VendorCreate):
    id: str
    class Config:
        from_attributes = True


# ── Setup Item ────────────────────────────────────────────
class SetupItemCreate(BaseModel):
    name: str
    category: Optional[str] = ""
    cost_per_hour: float
    qty_available: Optional[float] = 0
    vendor_id: Optional[str] = None
    notes: Optional[str] = ""

class SetupItemOut(SetupItemCreate):
    id: str
    vendor_name: Optional[str] = None
    class Config:
        from_attributes = True


# ── Event ─────────────────────────────────────────────────
class EventRecipeIn(BaseModel):
    recipe_id: str
    portions: int

class EventSetupItemIn(BaseModel):
    setup_item_id: str
    quantity: float
    hours: float

class EventCreate(BaseModel):
    name: str
    event_date: Optional[date] = None
    duration_hrs: Optional[float] = 4
    guest_count: Optional[int] = 0
    notes: Optional[str] = ""
    recipes: List[EventRecipeIn] = []
    setup_items: List[EventSetupItemIn] = []

class EventOut(BaseModel):
    id: str
    name: str
    event_date: Optional[date] = None
    duration_hrs: float
    guest_count: int
    notes: str
    status: str
    recipes: List[EventRecipeIn] = []
    setup_items: List[EventSetupItemIn] = []
    class Config:
        from_attributes = True


# ── Inventory edit ────────────────────────────────────────
class InventoryUpdate(BaseModel):
    stock: float
    threshold: Optional[float] = None


# ── Cooked Stock ──────────────────────────────────────────
class CookedStockCreate(BaseModel):
    recipe_id: str
    quantity: float
    unit: str
    cost_snapshot: Optional[float] = 0
    expiry_date: Optional[date] = None
    notes: Optional[str] = ""

class CookedStockOut(BaseModel):
    id: str
    recipe_id: str
    recipe_name: Optional[str] = None
    quantity: float
    unit: str
    cost_snapshot: float
    expiry_date: Optional[date] = None
    notes: str
    is_depleted: bool
    created_at: Optional[str] = None
    class Config:
        from_attributes = True


# ── Item ──────────────────────────────────────────────────
class ItemSubRecipeIn(BaseModel):
    recipe_id: str
    quantity: float
    unit: str

class ItemIngredientIn(BaseModel):
    ingredient_id: str
    qty: float
    unit: str

class ItemCreate(BaseModel):
    name: str
    category: Optional[str] = ""
    base_yield: Optional[int] = 1
    yield_unit: Optional[str] = "pieces"
    notes: Optional[str] = ""
    sub_recipes: List[ItemSubRecipeIn] = []
    sub_ings: List[ItemIngredientIn] = []

class ItemOut(BaseModel):
    id: str
    name: str
    category: str
    base_yield: int
    yield_unit: str
    notes: str
    sub_recipes: List[ItemSubRecipeIn] = []
    sub_ings: List[ItemIngredientIn] = []
    class Config:
        from_attributes = True


# ── Assemble Item ─────────────────────────────────────────
class AssembleRequest(BaseModel):
    item_id: str
    scale_factor: float = 1.0
    portions: int = 1


# ── Waste Log ─────────────────────────────────────────────
class WasteCreate(BaseModel):
    source_type: str          # cooked_stock | ingredient_batch
    source_id: str
    reason: Optional[str] = "other"
    notes: Optional[str] = ""

class WasteOut(BaseModel):
    id: str
    source_type: str
    name_snapshot: str
    quantity: float
    unit: str
    cost_lost: float
    reason: str
    created_at: Optional[str] = None
    class Config:
        from_attributes = True
