CREATE OR REPLACE FUNCTION public.dispatch_product(
  product_id_value uuid,
  quantity_value integer,
  batch_id_value uuid DEFAULT NULL::uuid,
  dispatch_type_value text DEFAULT 'sale'::text,
  destination_value text DEFAULT NULL::text,
  reference_number_value text DEFAULT NULL::text,
  unit_price_value numeric DEFAULT NULL::numeric,
  dispatched_date_value date DEFAULT NULL::date,
  notes_value text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  product_row public.products%ROWTYPE;
  batch_row public.batches%ROWTYPE;
  dispatch_id_value uuid;
  movement_batch_code text;
  remaining_quantity integer;
  alert_type_value public.alert_type;
  alert_message_value text;
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

  remaining_quantity := product_row.quantity - quantity_value;
  IF remaining_quantity <= product_row.min_stock THEN
    alert_type_value := CASE WHEN remaining_quantity <= 0 THEN 'critical'::public.alert_type ELSE 'low-stock'::public.alert_type END;
    alert_message_value := product_row.name || ' is at or below minimum stock after dispatch.';

    INSERT INTO public.alerts (type, message, item_name, urgent, resolved)
    SELECT alert_type_value, alert_message_value, product_row.name, remaining_quantity <= 0, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.alerts
      WHERE resolved = false
        AND message = alert_message_value
        AND coalesce(item_name, '') = coalesce(product_row.name, '')
    );
  END IF;

  INSERT INTO public.audit_logs (user_id, action, module, details)
  VALUES (auth.uid(), 'DISPATCH', 'Product Dispatch',
    'Dispatched ' || quantity_value || ' units of ' || product_row.name ||
    CASE WHEN movement_batch_code IS NULL THEN '' ELSE ' from batch ' || movement_batch_code END);

  RETURN dispatch_id_value;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_product(uuid, integer, uuid, text, text, text, numeric, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.dispatch_product(uuid, integer, uuid, text, text, text, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_product(uuid, integer, uuid, text, text, text, numeric, date, text) TO service_role;

CREATE OR REPLACE FUNCTION public.produce_batch(
  product_id_value uuid,
  quantity_value integer,
  expiration_date_value date,
  batch_code_value text DEFAULT NULL::text,
  production_date_value date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  product_row public.products%ROWTYPE;
  recipe_id_value uuid;
  batch_id_value uuid;
  batch_code_normalized text;
  ingredient_row record;
  remaining_stock numeric;
  alert_message_value text;
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
    remaining_stock := ingredient_row.current_stock - ingredient_row.required_quantity;

    UPDATE public.ingredients SET current_stock = current_stock - ingredient_row.required_quantity
      WHERE id = ingredient_row.ingredient_id;

    INSERT INTO public.stock_movements (type, item_type, item_id, item_name, quantity, remarks, user_id, batch_id, batch_code)
    VALUES ('OUT', 'ingredient', ingredient_row.ingredient_id, ingredient_row.name,
      -ingredient_row.required_quantity,
      'Used in batch ' || batch_code_normalized || ' for ' || product_row.name,
      auth.uid(), batch_id_value, batch_code_normalized);

    IF remaining_stock <= ingredient_row.min_stock THEN
      alert_message_value := ingredient_row.name || ' is at or below minimum stock.';
      INSERT INTO public.alerts (type, message, item_name, urgent, resolved)
      SELECT CASE WHEN remaining_stock <= 0 THEN 'critical'::public.alert_type ELSE 'low-stock'::public.alert_type END,
        alert_message_value, ingredient_row.name, remaining_stock <= 0, false
      WHERE NOT EXISTS (
        SELECT 1 FROM public.alerts
        WHERE resolved = false
          AND message = alert_message_value
          AND coalesce(item_name, '') = coalesce(ingredient_row.name, '')
      );
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
END;
$function$;

REVOKE ALL ON FUNCTION public.produce_batch(uuid, integer, date, text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.produce_batch(uuid, integer, date, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.produce_batch(uuid, integer, date, text, date) TO service_role;

NOTIFY pgrst, 'reload schema';