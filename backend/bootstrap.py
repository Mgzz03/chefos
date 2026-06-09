"""
Lightweight startup migration for the LOCAL (SQLite) build.

`Base.metadata.create_all` creates any fully-missing tables, but it will NOT
alter a table that already exists. An older chefos.db (created before the
multi-user migration) has the core tables WITHOUT a `user_id` column, which
would make every query fail with "no such column: user_id".

This patches that gap safely and idempotently: for each table that should have
a `user_id`, if the column is missing we add it with a default of 'local' and
backfill existing rows. No-op on Postgres / fresh databases.
"""
from sqlalchemy import inspect, text

# Tables that carry a user_id in models.py
USER_ID_TABLES = [
    "categories", "ingredients", "recipes", "vendors", "setup_items",
    "events", "transactions", "cooked_stock", "items", "waste_log",
]


def ensure_local_schema(engine) -> None:
    if engine.dialect.name != "sqlite":
        return  # cloud Postgres already has the correct schema

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table in USER_ID_TABLES:
            if table not in existing_tables:
                continue  # create_all will build it fresh with the right columns
            cols = {c["name"] for c in inspector.get_columns(table)}
            if "user_id" not in cols:
                conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN user_id TEXT DEFAULT 'local'"
                ))
                conn.execute(text(
                    f"UPDATE {table} SET user_id = 'local' WHERE user_id IS NULL"
                ))

        # Per-recipe optional profit margin (added after initial release)
        if "recipes" in existing_tables:
            rcols = {c["name"] for c in inspector.get_columns("recipes")}
            if "profit_margin" not in rcols:
                conn.execute(text("ALTER TABLE recipes ADD COLUMN profit_margin REAL"))

        # Derived ingredients (e.g. Egg yolk → Egg) added after initial release
        if "ingredients" in existing_tables:
            icols = {c["name"] for c in inspector.get_columns("ingredients")}
            if "parent_ingredient_id" not in icols:
                conn.execute(text("ALTER TABLE ingredients ADD COLUMN parent_ingredient_id TEXT"))
            if "units_per_parent" not in icols:
                conn.execute(text("ALTER TABLE ingredients ADD COLUMN units_per_parent REAL DEFAULT 1"))
