-- ============================================================
--  ChefOS – Supabase Schema
--  Paste this entire file into: Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1. TABLES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT DEFAULT '#c8922a',
    user_id    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingredients (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    unit             TEXT NOT NULL,
    cost             FLOAT NOT NULL,
    category_id      TEXT REFERENCES categories(id) ON DELETE SET NULL,
    supplier         TEXT DEFAULT '',
    threshold        FLOAT DEFAULT 0,
    user_id          TEXT NOT NULL,
    price_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_batches (
    id            TEXT PRIMARY KEY,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity      FLOAT NOT NULL DEFAULT 0,
    expiry_date   DATE,
    cost_snapshot FLOAT,
    notes         TEXT DEFAULT '',
    is_depleted   BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipes (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    category   TEXT DEFAULT '',
    base_yield INTEGER NOT NULL DEFAULT 4,
    yield_unit TEXT DEFAULT 'portions',
    notes      TEXT DEFAULT '',
    user_id    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id            TEXT PRIMARY KEY,
    recipe_id     TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    qty           FLOAT NOT NULL,
    unit          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    contact_name TEXT DEFAULT '',
    phone        TEXT DEFAULT '',
    email        TEXT DEFAULT '',
    notes        TEXT DEFAULT '',
    user_id      TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS setup_items (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    category      TEXT DEFAULT '',
    cost_per_hour FLOAT NOT NULL DEFAULT 0,
    qty_available FLOAT DEFAULT 0,
    vendor_id     TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    notes         TEXT DEFAULT '',
    user_id       TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    event_date   DATE,
    duration_hrs FLOAT DEFAULT 4,
    guest_count  INTEGER DEFAULT 0,
    notes        TEXT DEFAULT '',
    status       TEXT DEFAULT 'planned',
    user_id      TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_recipes (
    id        TEXT PRIMARY KEY,
    event_id  TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    portions  INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS event_setup_items (
    id            TEXT PRIMARY KEY,
    event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    setup_item_id TEXT NOT NULL REFERENCES setup_items(id) ON DELETE CASCADE,
    quantity      FLOAT DEFAULT 1,
    hours         FLOAT DEFAULT 4
);

CREATE TABLE IF NOT EXISTS transactions (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL,
    recipe_id     TEXT,
    ingredient_id TEXT,
    qty_change    FLOAT DEFAULT 0,
    cost_snapshot FLOAT DEFAULT 0,
    scale_factor  FLOAT DEFAULT 1,
    notes         TEXT DEFAULT '',
    user_id       TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cooked_stock (
    id            TEXT PRIMARY KEY,
    recipe_id     TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    quantity      FLOAT NOT NULL,
    unit          TEXT NOT NULL,
    cost_snapshot FLOAT DEFAULT 0,
    expiry_date   DATE,
    notes         TEXT DEFAULT '',
    is_depleted   BOOLEAN DEFAULT FALSE,
    user_id       TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    category   TEXT DEFAULT '',
    base_yield INTEGER NOT NULL DEFAULT 1,
    yield_unit TEXT DEFAULT 'pieces',
    notes      TEXT DEFAULT '',
    user_id    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS item_sub_recipes (
    id        TEXT PRIMARY KEY,
    item_id   TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    quantity  FLOAT NOT NULL,
    unit      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_ingredients (
    id            TEXT PRIMARY KEY,
    item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    qty           FLOAT NOT NULL,
    unit          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS waste_log (
    id            TEXT PRIMARY KEY,
    source_type   TEXT NOT NULL,
    source_id     TEXT,
    recipe_id     TEXT REFERENCES recipes(id) ON DELETE SET NULL,
    ingredient_id TEXT REFERENCES ingredients(id) ON DELETE SET NULL,
    name_snapshot TEXT NOT NULL,
    quantity      FLOAT NOT NULL,
    unit          TEXT NOT NULL,
    cost_lost     FLOAT DEFAULT 0,
    reason        TEXT DEFAULT '',
    user_id       TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- 2. ROW LEVEL SECURITY ──────────────────────────────────────
--    Protects data at the database level (defence-in-depth).
--    The backend already filters by user_id; RLS is a safety net.

ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE setup_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_recipes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_setup_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cooked_stock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_sub_recipes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_ingredients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_log         ENABLE ROW LEVEL SECURITY;

-- Parent tables: direct user_id check
CREATE POLICY "own rows" ON categories        FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "own rows" ON ingredients       FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "own rows" ON recipes           FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "own rows" ON vendors           FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "own rows" ON setup_items       FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "own rows" ON events            FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "own rows" ON transactions      FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "own rows" ON cooked_stock      FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "own rows" ON items             FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "own rows" ON waste_log         FOR ALL USING (user_id = auth.uid()::text);

-- Child tables: access via parent ownership
CREATE POLICY "own rows" ON inventory_batches
    FOR ALL USING (
        EXISTS (SELECT 1 FROM ingredients i
                WHERE i.id = ingredient_id AND i.user_id = auth.uid()::text)
    );

CREATE POLICY "own rows" ON recipe_ingredients
    FOR ALL USING (
        EXISTS (SELECT 1 FROM recipes r
                WHERE r.id = recipe_id AND r.user_id = auth.uid()::text)
    );

CREATE POLICY "own rows" ON event_recipes
    FOR ALL USING (
        EXISTS (SELECT 1 FROM events e
                WHERE e.id = event_id AND e.user_id = auth.uid()::text)
    );

CREATE POLICY "own rows" ON event_setup_items
    FOR ALL USING (
        EXISTS (SELECT 1 FROM events e
                WHERE e.id = event_id AND e.user_id = auth.uid()::text)
    );

CREATE POLICY "own rows" ON item_sub_recipes
    FOR ALL USING (
        EXISTS (SELECT 1 FROM items it
                WHERE it.id = item_id AND it.user_id = auth.uid()::text)
    );

CREATE POLICY "own rows" ON item_ingredients
    FOR ALL USING (
        EXISTS (SELECT 1 FROM items it
                WHERE it.id = item_id AND it.user_id = auth.uid()::text)
    );


-- 3. DONE ────────────────────────────────────────────────────
--    All 16 tables created with RLS enabled.
