DROP FUNCTION IF EXISTS public.produce_batch(uuid, integer);

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC NOT NULL DEFAULT 0 CHECK (unit_cost >= 0);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  ADD COLUMN IF NOT EXISTS estimated_unit_cost NUMERIC NOT NULL DEFAULT 0 CHECK (estimated_unit_cost >= 0);

CREATE TABLE IF NOT EXISTS public.ingredient_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  lot_number TEXT,
  invoice_number TEXT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC CHECK (unit_cost IS NULL OR unit_cost >= 0),
  total_cost NUMERIC GENERATED ALWAYS AS (quantity * COALESCE(unit_cost, 0)) STORED,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date DATE,
  notes TEXT,
  received_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredient_receipts TO authenticated;
GRANT ALL ON public.ingredient_receipts TO service_role;
ALTER TABLE public.ingredient_receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.product_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  dispatch_type TEXT NOT NULL DEFAULT 'sale'
    CHECK (dispatch_type IN ('sale', 'delivery', 'transfer', 'sample', 'return', 'other')),
  destination TEXT,
  reference_number TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC CHECK (unit_price IS NULL OR unit_price >= 0),
  total_value NUMERIC GENERATED ALWAYS AS (quantity * COALESCE(unit_price, 0)) STORED,
  dispatched_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  dispatched_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_dispatches TO authenticated;
GRANT ALL ON public.product_dispatches TO service_role;
ALTER TABLE public.product_dispatches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.inventory_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type public.movement_item_type NOT NULL,
  item_id UUID NOT NULL,
  item_name TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  quantity NUMERIC,
  reference_table TEXT,
  reference_id UUID,
  details TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_activity TO authenticated;
GRANT ALL ON public.inventory_activity TO service_role;
ALTER TABLE public.inventory_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read ingredient receipts" ON public.ingredient_receipts;
DROP POLICY IF EXISTS "Admins can manage ingredient receipts" ON public.ingredient_receipts;
DROP POLICY IF EXISTS "Authenticated users can read product dispatches" ON public.product_dispatches;
DROP POLICY IF EXISTS "Admins can manage product dispatches" ON public.product_dispatches;
DROP POLICY IF EXISTS "Authenticated users can read inventory activity" ON public.inventory_activity;
DROP POLICY IF EXISTS "Admins can manage inventory activity" ON public.inventory_activity;

CREATE POLICY "Authenticated users can read ingredient receipts"
ON public.ingredient_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage ingredient receipts"
ON public.ingredient_receipts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read product dispatches"
ON public.product_dispatches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage product dispatches"
ON public.product_dispatches FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read inventory activity"
ON public.inventory_activity FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage inventory activity"
ON public.inventory_activity FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_ingredient_receipts_ingredient_date ON public.ingredient_receipts (ingredient_id, received_date DESC);
CREATE INDEX IF NOT EXISTS idx_ingredient_receipts_supplier ON public.ingredient_receipts (supplier_id);
CREATE INDEX IF NOT EXISTS idx_product_dispatches_product_date ON public.product_dispatches (product_id, dispatched_date DESC);
CREATE INDEX IF NOT EXISTS idx_product_dispatches_batch ON public.product_dispatches (batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_activity_item ON public.inventory_activity (item_type, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_activity_created_at ON public.inventory_activity (created_at DESC);

CREATE OR REPLACE FUNCTION public.record_stock_movement_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE activity_type_value text;
BEGIN
  IF NEW.remarks LIKE 'Received ingredient%' OR NEW.remarks LIKE 'Dispatched product%' THEN RETURN NEW; END IF;
  activity_type_value := CASE
    WHEN NEW.type = 'ADJUSTMENT' THEN 'ADJUSTMENT'
    WHEN NEW.remarks LIKE 'Used in batch%' OR NEW.remarks LIKE 'Batch produced%' THEN 'PRODUCTION'
    WHEN NEW.remarks LIKE 'Defect logged%' THEN 'DEFECT'
    WHEN NEW.type = 'IN' THEN 'STOCK_IN'
    WHEN NEW.type = 'OUT' THEN 'STOCK_OUT'
    ELSE 'STOCK_MOVEMENT' END;
  INSERT INTO public.inventory_activity (item_type, item_id, item_name, activity_type, quantity, reference_table, reference_id, details, user_id, created_at)
  VALUES (NEW.item_type, NEW.item_id, NEW.item_name, activity_type_value, NEW.quantity, 'stock_movements', NEW.id, NEW.remarks, NEW.user_id, NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_stock_movement_activity ON public.stock_movements;
CREATE TRIGGER record_stock_movement_activity AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.record_stock_movement_activity();

CREATE OR REPLACE FUNCTION public.receive_ingredient(
  ingredient_id_value uuid, quantity_value numeric, supplier_id_value uuid DEFAULT NULL,
  unit_cost_value numeric DEFAULT NULL, lot_number_value text DEFAULT NULL,
  invoice_number_value text DEFAULT NULL, received_date_value date DEFAULT NULL,
  expiration_date_value date DEFAULT NULL, notes_value text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ingredient_row public.ingredients%ROWTYPE; receipt_id_value uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can receive inventory'; END IF;
  IF quantity_value IS NULL OR quantity_value <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF unit_cost_value IS NOT NULL AND unit_cost_value < 0 THEN RAISE EXCEPTION 'Unit cost cannot be negative'; END IF;
  SELECT * INTO ingredient_row FROM public.ingredients WHERE id = ingredient_id_value FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingredient not found'; END IF;
  INSERT INTO public.ingredient_receipts (ingredient_id, supplier_id, lot_number, invoice_number, quantity, unit_cost, received_date, expiration_date, notes, received_by)
  VALUES (ingredient_id_value, COALESCE(supplier_id_value, ingredient_row.supplier_id),
    nullif(trim(lot_number_value), ''), nullif(trim(invoice_number_value), ''),
    quantity_value, unit_cost_value, COALESCE(received_date_value, CURRENT_DATE),
    expiration_date_value, nullif(trim(notes_value), ''), auth.uid())
  RETURNING id INTO receipt_id_value;
  UPDATE public.ingredients SET current_stock = current_stock + quantity_value,
    unit_cost = COALESCE(unit_cost_value, unit_cost),
    expiration_date = COALESCE(expiration_date_value, expiration_date),
    updated_at = now() WHERE id = ingredient_id_value;
  INSERT INTO public.stock_movements (type, item_type, item_id, item_name, quantity, remarks, user_id)
  VALUES ('IN', 'ingredient', ingredient_id_value, ingredient_row.name, quantity_value,
    'Received ingredient' ||
      CASE WHEN nullif(trim(invoice_number_value), '') IS NULL THEN '' ELSE ' / invoice ' || trim(invoice_number_value) END ||
      CASE WHEN nullif(trim(lot_number_value), '') IS NULL THEN '' ELSE ' / lot ' || trim(lot_number_value) END,
    auth.uid());
  INSERT INTO public.inventory_activity (item_type, item_id, item_name, activity_type, quantity, reference_table, reference_id, details, user_id)
  VALUES ('ingredient', ingredient_id_value, ingredient_row.name, 'RECEIPT', quantity_value,
    'ingredient_receipts', receipt_id_value, 'Received ' || quantity_value || ' ' || ingredient_row.unit, auth.uid());
  INSERT INTO public.audit_logs (user_id, action, module, details)
  VALUES (auth.uid(), 'RECEIVE', 'Ingredient Receiving', 'Received ' || quantity_value || ' ' || ingredient_row.unit || ' of ' || ingredient_row.name);
  RETURN receipt_id_value;
END; $$;

REVOKE ALL ON FUNCTION public.receive_ingredient(uuid, numeric, uuid, numeric, text, text, date, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.receive_ingredient(uuid, numeric, uuid, numeric, text, text, date, date, text) TO authenticated;

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS batch_code TEXT,
  ADD COLUMN IF NOT EXISTS barcode_token TEXT,
  ADD COLUMN IF NOT EXISTS barcode_value TEXT,
  ADD COLUMN IF NOT EXISTS manufactured_date DATE,
  ADD COLUMN IF NOT EXISTS price NUMERIC NOT NULL DEFAULT 0 CHECK (price >= 0);

UPDATE public.batches SET manufactured_date = COALESCE(manufactured_date, production_date);

UPDATE public.batches b
SET batch_code = COALESCE(NULLIF(batch_code, ''),
      'CB-BTCH-' || to_char(COALESCE(b.production_date, CURRENT_DATE), 'YYYYMMDD') || '-' ||
      regexp_replace(upper(left(coalesce(p.name, 'ITEM'), 8)), '[^A-Z0-9]+', '', 'g') || '-' ||
      upper(substr(replace(b.id::text, '-', ''), 1, 6))),
    barcode_token = COALESCE(NULLIF(barcode_token, ''),
      'CB-BTCH-' || to_char(COALESCE(b.production_date, CURRENT_DATE), 'YYYYMMDD') || '-' ||
      regexp_replace(upper(left(coalesce(p.name, 'ITEM'), 8)), '[^A-Z0-9]+', '', 'g') || '-' ||
      upper(substr(replace(b.id::text, '-', ''), 1, 6))),
    barcode_value = COALESCE(NULLIF(barcode_value, ''),
      'CB-BTCH-' || to_char(COALESCE(b.production_date, CURRENT_DATE), 'YYYYMMDD') || '-' ||
      regexp_replace(upper(left(coalesce(p.name, 'ITEM'), 8)), '[^A-Z0-9]+', '', 'g') || '-' ||
      upper(substr(replace(b.id::text, '-', ''), 1, 6))),
    price = COALESCE(NULLIF(b.price, 0), p.unit_price, 0)
FROM public.products p WHERE p.id = b.product_id;

ALTER TABLE public.batches
  ALTER COLUMN batch_code SET NOT NULL,
  ALTER COLUMN barcode_token SET NOT NULL,
  ALTER COLUMN barcode_value SET NOT NULL,
  ALTER COLUMN manufactured_date SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_batch_code_unique ON public.batches (batch_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_barcode_token_unique ON public.batches (barcode_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_barcode_value_unique ON public.batches (barcode_value);
CREATE INDEX IF NOT EXISTS idx_batches_batch_code_search ON public.batches USING btree (batch_code text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_date ON public.stock_movements (item_type, item_id, created_at DESC);

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_code TEXT;

CREATE OR REPLACE FUNCTION public.normalize_batch_token(value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(regexp_replace(coalesce(trim(value), ''), '\s+', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.product_code(value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT left(coalesce(nullif(regexp_replace(upper(coalesce(value, 'ITEM')), '[^A-Z0-9]+', '', 'g'), ''), 'ITEM'), 10);
$$;

CREATE OR REPLACE FUNCTION public.generate_batch_token(product_name_value text, production_date_value date)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE candidate text;
BEGIN
  LOOP
    candidate := 'CB-BTCH-' || to_char(COALESCE(production_date_value, CURRENT_DATE), 'YYYYMMDD') || '-' ||
      public.product_code(product_name_value) || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.batches
      WHERE batch_code = candidate OR barcode_token = candidate OR barcode_value = candidate);
  END LOOP;
  RETURN candidate;
END; $$;

CREATE OR REPLACE FUNCTION public.produce_batch(
  product_id_value uuid, quantity_value integer, expiration_date_value date,
  batch_code_value text DEFAULT NULL, production_date_value date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  product_row public.products%ROWTYPE; recipe_id_value uuid; batch_id_value uuid;
  batch_code_normalized text; ingredient_row record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can produce batches'; END IF;
  IF quantity_value IS NULL OR quantity_value <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF expiration_date_value IS NULL THEN RAISE EXCEPTION 'Expiration date is required'; END IF;
  IF expiration_date_value <= COALESCE(production_date_value, CURRENT_DATE) THEN
    RAISE EXCEPTION 'Expiration date must be after production date'; END IF;
  SELECT * INTO product_row FROM public.products WHERE id = product_id_value FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  batch_code_normalized := public.normalize_batch_token(batch_code_value);
  IF batch_code_normalized = '' THEN
    batch_code_normalized := public.generate_batch_token(product_row.name, COALESCE(production_date_value, CURRENT_DATE));
  END IF;
  IF EXISTS (SELECT 1 FROM public.batches WHERE batch_code = batch_code_normalized
     OR barcode_token = batch_code_normalized OR barcode_value = batch_code_normalized) THEN
    RAISE EXCEPTION 'Batch barcode already exists'; END IF;
  SELECT id INTO recipe_id_value FROM public.recipes WHERE product_id = product_id_value ORDER BY created_at DESC LIMIT 1;
  IF recipe_id_value IS NULL THEN RAISE EXCEPTION 'No recipe found for this product'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = recipe_id_value) THEN
    RAISE EXCEPTION 'Recipe has no ingredients'; END IF;
  FOR ingredient_row IN
    SELECT ri.ingredient_id, ri.quantity * quantity_value AS required_quantity,
      i.name, i.current_stock, i.min_stock, i.unit
    FROM public.recipe_ingredients ri JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = recipe_id_value ORDER BY i.id FOR UPDATE OF i
  LOOP
    IF ingredient_row.current_stock < ingredient_row.required_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for %: need %, have %',
        ingredient_row.name, ingredient_row.required_quantity, ingredient_row.current_stock;
    END IF;
  END LOOP;
  INSERT INTO public.batches (product_id, batch_code, barcode_token, barcode_value,
    quantity_planned, quantity_produced, production_date, manufactured_date,
    expiration_date, price, status, created_by)
  VALUES (product_id_value, batch_code_normalized, batch_code_normalized, batch_code_normalized,
    quantity_value, quantity_value, COALESCE(production_date_value, CURRENT_DATE),
    COALESCE(production_date_value, CURRENT_DATE), expiration_date_value,
    COALESCE(product_row.unit_price, 0), 'completed', auth.uid())
  RETURNING id INTO batch_id_value;
  FOR ingredient_row IN
    SELECT ri.ingredient_id, ri.quantity * quantity_value AS required_quantity,
      i.name, i.current_stock, i.min_stock, i.unit
    FROM public.recipe_ingredients ri JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = recipe_id_value ORDER BY i.id
  LOOP
    UPDATE public.ingredients SET current_stock = current_stock - ingredient_row.required_quantity
      WHERE id = ingredient_row.ingredient_id;
    INSERT INTO public.stock_movements (type, item_type, item_id, item_name, quantity, remarks, user_id, batch_id, batch_code)
    VALUES ('OUT', 'ingredient', ingredient_row.ingredient_id, ingredient_row.name,
      -ingredient_row.required_quantity,
      'Used in batch ' || batch_code_normalized || ' for ' || product_row.name,
      auth.uid(), batch_id_value, batch_code_normalized);
    IF (ingredient_row.current_stock - ingredient_row.required_quantity) <= ingredient_row.min_stock THEN
      PERFORM public.create_inventory_alert('low-stock',
        ingredient_row.name || ' is at or below minimum stock.', ingredient_row.name,
        (ingredient_row.current_stock - ingredient_row.required_quantity) <= 0);
    END IF;
  END LOOP;
  UPDATE public.products SET quantity = quantity + quantity_value,
    expiration_date = expiration_date_value WHERE id = product_id_value;
  INSERT INTO public.stock_movements (type, item_type, item_id, item_name, quantity, remarks, user_id, batch_id, batch_code)
  VALUES ('IN', 'product', product_id_value, product_row.name, quantity_value,
    'Batch production completed: ' || batch_code_normalized,
    auth.uid(), batch_id_value, batch_code_normalized);
  INSERT INTO public.audit_logs (user_id, action, module, details)
  VALUES (auth.uid(), 'PRODUCE', 'Batch Production',
    'Produced batch ' || batch_code_normalized || ' for ' || product_row.name || ': ' || quantity_value);
  RETURN batch_id_value;
END; $$;

REVOKE ALL ON FUNCTION public.produce_batch(uuid, integer, date, text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.produce_batch(uuid, integer, date, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_batch_by_barcode(barcode_value_value text)
RETURNS TABLE (batch_id uuid, batch_code text, barcode_token text, product_id uuid,
  product_name text, category text, variant text, manufactured_date date,
  expiration_date date, shelf_life integer, price numeric, quantity_produced integer,
  remaining_quantity integer, status public.batch_status, defect_quantity integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.batch_code, b.barcode_token, p.id, p.name, p.category, p.variant,
    b.manufactured_date, b.expiration_date, p.shelf_life, b.price,
    b.quantity_planned, b.quantity_produced, b.status,
    COALESCE(SUM(d.quantity), 0)::integer
  FROM public.batches b JOIN public.products p ON p.id = b.product_id
  LEFT JOIN public.defects d ON d.batch_id = b.id
  WHERE b.batch_code = public.normalize_batch_token(barcode_value_value)
     OR b.barcode_token = public.normalize_batch_token(barcode_value_value)
     OR b.barcode_value = public.normalize_batch_token(barcode_value_value)
  GROUP BY b.id, p.id;
$$;

GRANT EXECUTE ON FUNCTION public.find_batch_by_barcode(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_defect(
  batch_id_value uuid, quantity_value integer, reason_value text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE batch_row public.batches%ROWTYPE; product_row public.products%ROWTYPE; defect_id_value uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can log defects'; END IF;
  IF quantity_value IS NULL OR quantity_value <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  SELECT * INTO batch_row FROM public.batches WHERE id = batch_id_value FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF quantity_value > batch_row.quantity_produced THEN
    RAISE EXCEPTION 'Defect quantity cannot exceed remaining batch quantity'; END IF;
  SELECT * INTO product_row FROM public.products WHERE id = batch_row.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF quantity_value > product_row.quantity THEN
    RAISE EXCEPTION 'Defect quantity cannot exceed product stock'; END IF;
  INSERT INTO public.defects (batch_id, quantity, reason)
  VALUES (batch_id_value, quantity_value, nullif(trim(reason_value), ''))
  RETURNING id INTO defect_id_value;
  UPDATE public.batches SET quantity_produced = quantity_produced - quantity_value,
    updated_at = now() WHERE id = batch_id_value;
  UPDATE public.products SET quantity = quantity - quantity_value, updated_at = now()
    WHERE id = product_row.id;
  INSERT INTO public.stock_movements (type, item_type, item_id, item_name, quantity, remarks, user_id, batch_id, batch_code)
  VALUES ('OUT', 'product', product_row.id, product_row.name, -quantity_value,
    'Defect logged for batch ' || batch_row.batch_code || ': ' ||
      coalesce(nullif(trim(reason_value), ''), 'No reason'),
    auth.uid(), batch_id_value, batch_row.batch_code);
  IF product_row.quantity - quantity_value <= product_row.min_stock THEN
    PERFORM public.create_inventory_alert(
      CASE WHEN product_row.quantity - quantity_value <= 0 THEN 'critical' ELSE 'low-stock' END,
      product_row.name || ' is at or below minimum stock.',
      product_row.name, product_row.quantity - quantity_value <= 0);
  END IF;
  INSERT INTO public.audit_logs (user_id, action, module, details)
  VALUES (auth.uid(), 'DEFECT', 'Defects',
    'Logged ' || quantity_value || ' defective units for batch ' || batch_row.batch_code);
  RETURN defect_id_value;
END; $$;

REVOKE ALL ON FUNCTION public.log_defect(uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_defect(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_product(
  product_id_value uuid, quantity_value integer, batch_id_value uuid DEFAULT NULL,
  dispatch_type_value text DEFAULT 'sale', destination_value text DEFAULT NULL,
  reference_number_value text DEFAULT NULL, unit_price_value numeric DEFAULT NULL,
  dispatched_date_value date DEFAULT NULL, notes_value text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  product_row public.products%ROWTYPE; batch_row public.batches%ROWTYPE;
  dispatch_id_value uuid; movement_batch_code text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can dispatch products'; END IF;
  IF quantity_value IS NULL OR quantity_value <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF dispatch_type_value NOT IN ('sale', 'delivery', 'transfer', 'sample', 'return', 'other') THEN
    RAISE EXCEPTION 'Invalid dispatch type'; END IF;
  IF unit_price_value IS NOT NULL AND unit_price_value < 0 THEN
    RAISE EXCEPTION 'Unit price cannot be negative'; END IF;
  SELECT * INTO product_row FROM public.products WHERE id = product_id_value FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF product_row.quantity < quantity_value THEN RAISE EXCEPTION 'Insufficient product stock'; END IF;
  IF batch_id_value IS NOT NULL THEN
    SELECT * INTO batch_row FROM public.batches
      WHERE id = batch_id_value AND product_id = product_id_value FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found for this product'; END IF;
    IF batch_row.quantity_produced < quantity_value THEN
      RAISE EXCEPTION 'Insufficient batch stock'; END IF;
    UPDATE public.batches SET quantity_produced = quantity_produced - quantity_value,
      updated_at = now() WHERE id = batch_id_value;
    movement_batch_code := batch_row.batch_code;
  END IF;
  INSERT INTO public.product_dispatches (product_id, batch_id, dispatch_type, destination,
    reference_number, quantity, unit_price, dispatched_date, notes, dispatched_by)
  VALUES (product_id_value, batch_id_value, dispatch_type_value,
    nullif(trim(destination_value), ''), nullif(trim(reference_number_value), ''),
    quantity_value, unit_price_value, COALESCE(dispatched_date_value, CURRENT_DATE),
    nullif(trim(notes_value), ''), auth.uid())
  RETURNING id INTO dispatch_id_value;
  UPDATE public.products SET quantity = quantity - quantity_value,
    unit_price = COALESCE(unit_price_value, unit_price), updated_at = now()
    WHERE id = product_id_value;
  INSERT INTO public.stock_movements (type, item_type, item_id, item_name, quantity, remarks, user_id, batch_id, batch_code)
  VALUES ('OUT', 'product', product_id_value, product_row.name, -quantity_value,
    'Dispatched product' ||
      CASE WHEN movement_batch_code IS NULL THEN '' ELSE ' / batch ' || movement_batch_code END ||
      CASE WHEN nullif(trim(reference_number_value), '') IS NULL THEN '' ELSE ' / ref ' || trim(reference_number_value) END ||
      CASE WHEN nullif(trim(destination_value), '') IS NULL THEN '' ELSE ' / to ' || trim(destination_value) END,
    auth.uid(), batch_id_value, movement_batch_code);
  INSERT INTO public.inventory_activity (item_type, item_id, item_name, activity_type,
    quantity, reference_table, reference_id, details, user_id)
  VALUES ('product', product_id_value, product_row.name, 'DISPATCH', -quantity_value,
    'product_dispatches', dispatch_id_value,
    'Dispatched ' || quantity_value || ' units' ||
      CASE WHEN movement_batch_code IS NULL THEN '' ELSE ' from batch ' || movement_batch_code END,
    auth.uid());
  IF product_row.quantity - quantity_value <= product_row.min_stock THEN
    PERFORM public.create_inventory_alert(
      CASE WHEN product_row.quantity - quantity_value <= 0 THEN 'critical' ELSE 'low-stock' END,
      product_row.name || ' is at or below minimum stock after dispatch.',
      product_row.name, product_row.quantity - quantity_value <= 0);
  END IF;
  INSERT INTO public.audit_logs (user_id, action, module, details)
  VALUES (auth.uid(), 'DISPATCH', 'Product Dispatch',
    'Dispatched ' || quantity_value || ' units of ' || product_row.name ||
    CASE WHEN movement_batch_code IS NULL THEN '' ELSE ' from batch ' || movement_batch_code END);
  RETURN dispatch_id_value;
END; $$;

REVOKE ALL ON FUNCTION public.dispatch_product(uuid, integer, uuid, text, text, text, numeric, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.dispatch_product(uuid, integer, uuid, text, text, text, numeric, date, text) TO authenticated;

INSERT INTO public.products (name, category, variant, shelf_life, quantity, min_stock, unit_price, estimated_unit_cost)
SELECT name, category, variant, shelf_life, quantity, min_stock, unit_price, estimated_unit_cost
FROM (VALUES
  ('Banana Ketchup', 'Condiments', 'Bottle', 210, 0, 10, 0, 0),
  ('Sweet Sauce', 'Condiments', 'Bottle', 210, 0, 10, 0, 0),
  ('Soy Sauce', 'Condiments', 'Bottle', 240, 0, 10, 0, 0),
  ('Vinegar', 'Condiments', 'Bottle', 240, 0, 10, 0, 0),
  ('Fish Sauce', 'Condiments', 'Bottle', 240, 0, 10, 0, 0),
  ('Tomato Sauce', 'Condiments - estimated placeholder', 'Bottle', 210, 0, 10, 0, 0),
  ('Spaghetti Sauce', 'Condiments - estimated placeholder', 'Bottle', 210, 0, 10, 0, 0),
  ('Hot Sauce', 'Condiments - estimated placeholder', 'Bottle', 210, 0, 10, 0, 0),
  ('Oyster Sauce', 'Condiments - estimated placeholder', 'Bottle', 240, 0, 10, 0, 0)
) AS seed(name, category, variant, shelf_life, quantity, min_stock, unit_price, estimated_unit_cost)
WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE lower(p.name) = lower(seed.name));

UPDATE public.products SET shelf_life = CASE
  WHEN name ILIKE '%banana ketchup%' THEN 210
  WHEN name ILIKE '%sweet sauce%' THEN 210
  WHEN name ILIKE '%soy sauce%' THEN 240
  WHEN name ILIKE '%vinegar%' THEN 240
  WHEN name ILIKE '%fish sauce%' THEN 240
  ELSE shelf_life END;

INSERT INTO public.ingredients (name, unit, current_stock, min_stock, expiration_date)
SELECT name, unit, current_stock, min_stock, NULL
FROM (VALUES
  ('Water', 'liters', 0, 20), ('Fish Extract', 'liters', 0, 10),
  ('Iodized Salt', 'kg', 0, 10), ('Sodium Benzoate', 'kg', 0, 2),
  ('Sodium Metabisulfite', 'kg', 0, 2), ('Flavor Enhancer', 'kg', 0, 2),
  ('Caramel Color', 'liters', 0, 2), ('Caramel as Color', 'liters', 0, 2),
  ('Caramel as Colorant', 'liters', 0, 2), ('Hydrolyzed Soybean Protein', 'kg', 0, 10),
  ('Citric Acid as Acidulant', 'kg', 0, 2), ('Cane Vinegar', 'liters', 0, 20),
  ('Sugar', 'kg', 0, 20), ('Spices', 'kg', 0, 5),
  ('Modified Starch', 'kg', 0, 5), ('Garlic', 'kg', 0, 5),
  ('Acidulant', 'kg', 0, 2), ('Artificial Food Colors with Tartrazine', 'kg', 0, 1),
  ('Banana', 'kg', 0, 20), ('Onion', 'kg', 0, 5),
  ('Vinegar', 'liters', 0, 10), ('FD&C Red No. 40', 'kg', 0, 1),
  ('FD&C Yellow No. 5', 'kg', 0, 1), ('Tomato Base - estimated placeholder', 'kg', 0, 10),
  ('Oyster Extract - estimated placeholder', 'liters', 0, 5),
  ('Chili Pepper - estimated placeholder', 'kg', 0, 5)
) AS seed(name, unit, current_stock, min_stock)
WHERE NOT EXISTS (SELECT 1 FROM public.ingredients i WHERE lower(i.name) = lower(seed.name));

INSERT INTO public.recipes (product_id, name)
SELECT p.id, p.name || ' label ingredients - demo quantities editable'
FROM public.products p
WHERE p.name IN ('Fish Sauce', 'Soy Sauce', 'Vinegar', 'Sweet Sauce', 'Banana Ketchup', 'Tomato Sauce', 'Spaghetti Sauce', 'Hot Sauce', 'Oyster Sauce')
  AND NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.product_id = p.id);

INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity)
SELECT r.id, i.id, seed.quantity
FROM (VALUES
  ('Fish Sauce', 'Water', 0.6), ('Fish Sauce', 'Fish Extract', 0.25), ('Fish Sauce', 'Iodized Salt', 0.08), ('Fish Sauce', 'Sodium Benzoate', 0.002), ('Fish Sauce', 'Sodium Metabisulfite', 0.001), ('Fish Sauce', 'Flavor Enhancer', 0.002), ('Fish Sauce', 'Caramel Color', 0.002),
  ('Soy Sauce', 'Iodized Salt', 0.08), ('Soy Sauce', 'Water', 0.55), ('Soy Sauce', 'Hydrolyzed Soybean Protein', 0.25), ('Soy Sauce', 'Caramel as Color', 0.002), ('Soy Sauce', 'Citric Acid as Acidulant', 0.001), ('Soy Sauce', 'Sodium Benzoate', 0.002),
  ('Vinegar', 'Water', 0.55), ('Vinegar', 'Cane Vinegar', 0.45), ('Vinegar', 'Caramel as Colorant', 0.001),
  ('Sweet Sauce', 'Sugar', 0.25), ('Sweet Sauce', 'Water', 0.45), ('Sweet Sauce', 'Spices', 0.02), ('Sweet Sauce', 'Modified Starch', 0.04), ('Sweet Sauce', 'Iodized Salt', 0.02), ('Sweet Sauce', 'Garlic', 0.01), ('Sweet Sauce', 'Acidulant', 0.002), ('Sweet Sauce', 'Sodium Benzoate', 0.002), ('Sweet Sauce', 'Artificial Food Colors with Tartrazine', 0.001),
  ('Banana Ketchup', 'Banana', 0.25), ('Banana Ketchup', 'Water', 0.35), ('Banana Ketchup', 'Sugar', 0.16), ('Banana Ketchup', 'Modified Starch', 0.04), ('Banana Ketchup', 'Iodized Salt', 0.02), ('Banana Ketchup', 'Onion', 0.01), ('Banana Ketchup', 'Garlic', 0.01), ('Banana Ketchup', 'Spices', 0.01), ('Banana Ketchup', 'Vinegar', 0.05), ('Banana Ketchup', 'FD&C Red No. 40', 0.001), ('Banana Ketchup', 'FD&C Yellow No. 5', 0.001), ('Banana Ketchup', 'Sodium Benzoate', 0.002),
  ('Tomato Sauce', 'Tomato Base - estimated placeholder', 0.55), ('Tomato Sauce', 'Water', 0.3), ('Tomato Sauce', 'Iodized Salt', 0.02), ('Tomato Sauce', 'Sugar', 0.05),
  ('Spaghetti Sauce', 'Tomato Base - estimated placeholder', 0.5), ('Spaghetti Sauce', 'Sugar', 0.08), ('Spaghetti Sauce', 'Spices', 0.02), ('Spaghetti Sauce', 'Modified Starch', 0.03),
  ('Hot Sauce', 'Chili Pepper - estimated placeholder', 0.25), ('Hot Sauce', 'Vinegar', 0.3), ('Hot Sauce', 'Water', 0.25), ('Hot Sauce', 'Iodized Salt', 0.02),
  ('Oyster Sauce', 'Oyster Extract - estimated placeholder', 0.25), ('Oyster Sauce', 'Sugar', 0.16), ('Oyster Sauce', 'Water', 0.35), ('Oyster Sauce', 'Modified Starch', 0.04)
) AS seed(product_name, ingredient_name, quantity)
JOIN public.products p ON lower(p.name) = lower(seed.product_name)
JOIN public.recipes r ON r.product_id = p.id
JOIN public.ingredients i ON lower(i.name) = lower(seed.ingredient_name)
WHERE NOT EXISTS (SELECT 1 FROM public.recipe_ingredients ri
  WHERE ri.recipe_id = r.id AND ri.ingredient_id = i.id);