from sqlalchemy import Column, String, Float, Integer, ForeignKey, Text, DateTime, Date, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


# ── Category ──────────────────────────────────────────────
class Category(Base):
    __tablename__ = "categories"
    id         = Column(String, primary_key=True)
    name       = Column(String, nullable=False, unique=True)
    color      = Column(String, default="#c8922a")
    user_id    = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    ingredients = relationship("Ingredient", back_populates="category_rel")


# ── Ingredient ────────────────────────────────────────────
class Ingredient(Base):
    __tablename__ = "ingredients"
    id               = Column(String, primary_key=True)
    name             = Column(String, nullable=False)
    unit             = Column(String, nullable=False)
    cost             = Column(Float, nullable=False)
    category_id      = Column(String, ForeignKey("categories.id"), nullable=True)
    supplier         = Column(String, default="")
    threshold        = Column(Float, default=0)
    user_id          = Column(String, nullable=False)
    price_updated_at = Column(DateTime, server_default=func.now())
    created_at       = Column(DateTime, server_default=func.now())

    category_rel = relationship("Category", back_populates="ingredients")
    batches      = relationship("InventoryBatch", back_populates="ingredient",
                                cascade="all, delete-orphan",
                                order_by="InventoryBatch.expiry_date")
    recipe_ings  = relationship("RecipeIngredient", back_populates="ingredient_rel")

    @property
    def stock(self):
        return sum(b.quantity for b in self.batches if not b.is_depleted)

    @property
    def category_name(self):
        return self.category_rel.name if self.category_rel else "Uncategorised"


# ── Inventory Batch ───────────────────────────────────────
class InventoryBatch(Base):
    __tablename__ = "inventory_batches"
    id            = Column(String, primary_key=True)
    ingredient_id = Column(String, ForeignKey("ingredients.id"), nullable=False)
    quantity      = Column(Float, nullable=False, default=0)
    expiry_date   = Column(Date, nullable=True)
    cost_snapshot = Column(Float, nullable=True)
    notes         = Column(String, default="")
    is_depleted   = Column(Boolean, default=False)
    created_at    = Column(DateTime, server_default=func.now())

    ingredient = relationship("Ingredient", back_populates="batches")


# ── Recipe ────────────────────────────────────────────────
class Recipe(Base):
    __tablename__ = "recipes"
    id         = Column(String, primary_key=True)
    name       = Column(String, nullable=False)
    category   = Column(String, default="")
    base_yield = Column(Integer, nullable=False, default=4)
    yield_unit = Column(String, default="portions")
    notes      = Column(Text, default="")
    profit_margin = Column(Float, nullable=True)   # optional per-recipe target margin %
    user_id    = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    ingredients   = relationship("RecipeIngredient", back_populates="recipe",
                                 cascade="all, delete-orphan")
    event_recipes = relationship("EventRecipe", back_populates="recipe")


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"
    id            = Column(String, primary_key=True)
    recipe_id     = Column(String, ForeignKey("recipes.id"), nullable=False)
    ingredient_id = Column(String, ForeignKey("ingredients.id"), nullable=False)
    qty           = Column(Float, nullable=False)
    unit          = Column(String, nullable=False)

    recipe         = relationship("Recipe", back_populates="ingredients")
    ingredient_rel = relationship("Ingredient", back_populates="recipe_ings")


# ── Vendor ────────────────────────────────────────────────
class Vendor(Base):
    __tablename__ = "vendors"
    id           = Column(String, primary_key=True)
    name         = Column(String, nullable=False)
    contact_name = Column(String, default="")
    phone        = Column(String, default="")
    email        = Column(String, default="")
    notes        = Column(Text, default="")
    user_id      = Column(String, nullable=False)
    created_at   = Column(DateTime, server_default=func.now())

    setup_items = relationship("SetupItem", back_populates="vendor_rel")


# ── Setup Item ────────────────────────────────────────────
class SetupItem(Base):
    __tablename__ = "setup_items"
    id            = Column(String, primary_key=True)
    name          = Column(String, nullable=False)
    category      = Column(String, default="")
    cost_per_hour = Column(Float, nullable=False, default=0)
    qty_available = Column(Float, default=0)
    vendor_id     = Column(String, ForeignKey("vendors.id"), nullable=True)
    notes         = Column(Text, default="")
    user_id       = Column(String, nullable=False)
    created_at    = Column(DateTime, server_default=func.now())

    vendor_rel  = relationship("Vendor", back_populates="setup_items")
    event_items = relationship("EventSetupItem", back_populates="setup_item")


# ── Event ─────────────────────────────────────────────────
class Event(Base):
    __tablename__ = "events"
    id           = Column(String, primary_key=True)
    name         = Column(String, nullable=False)
    event_date   = Column(Date, nullable=True)
    duration_hrs = Column(Float, default=4)
    guest_count  = Column(Integer, default=0)
    notes        = Column(Text, default="")
    status       = Column(String, default="planned")
    user_id      = Column(String, nullable=False)
    created_at   = Column(DateTime, server_default=func.now())

    recipes     = relationship("EventRecipe", back_populates="event",
                               cascade="all, delete-orphan")
    setup_items = relationship("EventSetupItem", back_populates="event",
                               cascade="all, delete-orphan")
    items       = relationship("EventItem", back_populates="event",
                               cascade="all, delete-orphan")


class EventItem(Base):
    __tablename__ = "event_items"
    id        = Column(String, primary_key=True)
    event_id  = Column(String, ForeignKey("events.id"), nullable=False)
    item_id   = Column(String, ForeignKey("items.id"), nullable=False)
    quantity  = Column(Float, default=1)

    event = relationship("Event", back_populates="items")
    item  = relationship("Item")


class EventRecipe(Base):
    __tablename__ = "event_recipes"
    id        = Column(String, primary_key=True)
    event_id  = Column(String, ForeignKey("events.id"), nullable=False)
    recipe_id = Column(String, ForeignKey("recipes.id"), nullable=False)
    portions  = Column(Integer, default=1)

    event  = relationship("Event", back_populates="recipes")
    recipe = relationship("Recipe", back_populates="event_recipes")


class EventSetupItem(Base):
    __tablename__ = "event_setup_items"
    id            = Column(String, primary_key=True)
    event_id      = Column(String, ForeignKey("events.id"), nullable=False)
    setup_item_id = Column(String, ForeignKey("setup_items.id"), nullable=False)
    quantity      = Column(Float, default=1)
    hours         = Column(Float, default=4)

    event      = relationship("Event", back_populates="setup_items")
    setup_item = relationship("SetupItem", back_populates="event_items")


# ── Transaction Log ───────────────────────────────────────
class Transaction(Base):
    __tablename__ = "transactions"
    id            = Column(String, primary_key=True)
    type          = Column(String, nullable=False)
    recipe_id     = Column(String, nullable=True)
    ingredient_id = Column(String, nullable=True)
    qty_change    = Column(Float, default=0)
    cost_snapshot = Column(Float, default=0)
    scale_factor  = Column(Float, default=1)
    notes         = Column(Text, default="")
    user_id       = Column(String, nullable=False)
    created_at    = Column(DateTime, server_default=func.now())


# ── Cooked Stock ──────────────────────────────────────────
class CookedStock(Base):
    __tablename__ = "cooked_stock"
    id            = Column(String, primary_key=True)
    recipe_id     = Column(String, ForeignKey("recipes.id"), nullable=False)
    quantity      = Column(Float, nullable=False)
    unit          = Column(String, nullable=False)
    cost_snapshot = Column(Float, default=0)
    expiry_date   = Column(Date, nullable=True)
    notes         = Column(String, default="")
    is_depleted   = Column(Boolean, default=False)
    user_id       = Column(String, nullable=False)
    created_at    = Column(DateTime, server_default=func.now())
    recipe        = relationship("Recipe")


# ── Item ──────────────────────────────────────────────────
class Item(Base):
    __tablename__ = "items"
    id         = Column(String, primary_key=True)
    name       = Column(String, nullable=False)
    category   = Column(String, default="")
    base_yield = Column(Integer, nullable=False, default=1)
    yield_unit = Column(String, default="pieces")
    notes      = Column(Text, default="")
    user_id    = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    sub_recipes = relationship("ItemSubRecipe", back_populates="item", cascade="all, delete-orphan")
    sub_ings    = relationship("ItemIngredient", back_populates="item", cascade="all, delete-orphan")


class ItemSubRecipe(Base):
    __tablename__ = "item_sub_recipes"
    id        = Column(String, primary_key=True)
    item_id   = Column(String, ForeignKey("items.id"), nullable=False)
    recipe_id = Column(String, ForeignKey("recipes.id"), nullable=False)
    quantity  = Column(Float, nullable=False)
    unit      = Column(String, nullable=False)
    item      = relationship("Item", back_populates="sub_recipes")
    recipe    = relationship("Recipe")


class ItemIngredient(Base):
    __tablename__ = "item_ingredients"
    id            = Column(String, primary_key=True)
    item_id       = Column(String, ForeignKey("items.id"), nullable=False)
    ingredient_id = Column(String, ForeignKey("ingredients.id"), nullable=False)
    qty           = Column(Float, nullable=False)
    unit          = Column(String, nullable=False)
    item          = relationship("Item", back_populates="sub_ings")
    ingredient    = relationship("Ingredient")


# ── Waste Log ─────────────────────────────────────────────
class WasteLog(Base):
    __tablename__ = "waste_log"
    id            = Column(String, primary_key=True)
    source_type   = Column(String, nullable=False)
    source_id     = Column(String, nullable=True)
    recipe_id     = Column(String, ForeignKey("recipes.id"), nullable=True)
    ingredient_id = Column(String, ForeignKey("ingredients.id"), nullable=True)
    name_snapshot = Column(String, nullable=False)
    quantity      = Column(Float, nullable=False)
    unit          = Column(String, nullable=False)
    cost_lost     = Column(Float, default=0)
    reason        = Column(String, default="")
    user_id       = Column(String, nullable=False)
    created_at    = Column(DateTime, server_default=func.now())
