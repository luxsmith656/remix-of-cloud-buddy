-- Harden Elline's Food Product inventory consistency, storage access, and computed stock status.

-- Keep product status derived from stock and expiration so the UI cannot drift.
CREATE OR REPLACE FUNCTION public.compute_product_status(
  quantity_value integer,
  min_stock_value integer,
  expiration_value date
)
RETURNS public.product_status
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF quantity_value <= 0 THEN
    RETURN 'out-of-stock';
  END IF;

  IF expiration_value IS NOT NULL AND expiration_value <= CURRENT_DATE + 7 THEN
    RETURN 'expiring';
  END IF;

  IF quantity_value <= min_stock_value THEN
    RETURN 'low-stock';
  END IF;

  RETURN 'in-stock';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.status := public.compute_product_status(NEW.quantity, NEW.min_stock, NEW.expiration_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_products_status ON public.products;
CREATE TRIGGER set_products_status
  BEFORE INSERT OR UPDATE OF quantity, min_stock, expiration_date, status
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_product_status();

-- Add defensive constraints for inventory values.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_quantity_nonnegative') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_quantity_nonnegative CHECK (quantity >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_min_stock_nonnegative') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_min_stock_nonnegative CHECK (min_stock >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ingredients_current_stock_nonnegative') THEN
    ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_current_stock_nonnegative CHECK (current_stock >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ingredients_min_stock_nonnegative') THEN
    ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_min_stock_nonnegative CHECK (min_stock >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_ingredients_quantity_positive') THEN
    ALTER TABLE public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_quantity_positive CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_quantities_nonnegative') THEN
    ALTER TABLE public.batches ADD CONSTRAINT batches_quantities_nonnegative CHECK (quantity_planned >= 0 AND quantity_produced >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'defects_quantity_positive') THEN
    ALTER TABLE public.defects ADD CONSTRAINT defects_quantity_positive CHECK (quantity > 0) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ingredients_supplier_id ON public.ingredients (supplier_id);
CREATE INDEX IF NOT EXISTS idx_recipes_product_id ON public.recipes (product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient_id ON public.recipe_ingredients (ingredient_id);
CREATE INDEX IF NOT EXISTS idx_batches_product_id ON public.batches (product_id);
CREATE INDEX IF NOT EXISTS idx_defects_batch_id ON public.defects (batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON public.alerts (resolved, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_inventory_alert(
  alert_type_value public.alert_type,
  message_value text,
  item_name_value text,
  urgent_value boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alerts (type, message, item_name, urgent, resolved)
  SELECT alert_type_value, message_value, item_name_value, urgent_value, false
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.alerts
    WHERE resolved = false
      AND message = message_value
      AND coalesce(item_name, '') = coalesce(item_name_value, '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_inventory_alert(public.alert_type, text, text, boolean) FROM public;

CREATE OR REPLACE FUNCTION public.produce_batch(
  product_id_value uuid,
  quantity_value integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.products%ROWTYPE;
  recipe_id_value uuid;
  batch_id_value uuid;
  expiration_value date;
  ingredient_row record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can produce batches';
  END IF;

  IF quantity_value IS NULL OR quantity_value <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT *
  INTO product_row
  FROM public.products
  WHERE id = product_id_value
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  SELECT id
  INTO recipe_id_value
  FROM public.recipes
  WHERE product_id = product_id_value
  ORDER BY created_at DESC
  LIMIT 1;

  IF recipe_id_value IS NULL THEN
    RAISE EXCEPTION 'No recipe found for this product';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = recipe_id_value) THEN
    RAISE EXCEPTION 'Recipe has no ingredients';
  END IF;

  FOR ingredient_row IN
    SELECT
      ri.ingredient_id,
      ri.quantity * quantity_value AS required_quantity,
      i.name,
      i.current_stock,
      i.min_stock,
      i.unit
    FROM public.recipe_ingredients ri
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = recipe_id_value
    ORDER BY i.id
    FOR UPDATE OF i
  LOOP
    IF ingredient_row.current_stock < ingredient_row.required_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for %: need %, have %',
        ingredient_row.name,
        ingredient_row.required_quantity,
        ingredient_row.current_stock;
    END IF;
  END LOOP;

  expiration_value := CURRENT_DATE + coalesce(product_row.shelf_life, 365);

  INSERT INTO public.batches (
    product_id,
    quantity_planned,
    quantity_produced,
    production_date,
    expiration_date,
    status,
    created_by
  )
  VALUES (
    product_id_value,
    quantity_value,
    quantity_value,
    CURRENT_DATE,
    expiration_value,
    'completed',
    auth.uid()
  )
  RETURNING id INTO batch_id_value;

  FOR ingredient_row IN
    SELECT
      ri.ingredient_id,
      ri.quantity * quantity_value AS required_quantity,
      i.name,
      i.current_stock,
      i.min_stock,
      i.unit
    FROM public.recipe_ingredients ri
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = recipe_id_value
    ORDER BY i.id
  LOOP
    UPDATE public.ingredients
    SET current_stock = current_stock - ingredient_row.required_quantity
    WHERE id = ingredient_row.ingredient_id;

    INSERT INTO public.stock_movements (
      type,
      item_type,
      item_id,
      item_name,
      quantity,
      remarks,
      user_id
    )
    VALUES (
      'OUT',
      'ingredient',
      ingredient_row.ingredient_id,
      ingredient_row.name,
      -ingredient_row.required_quantity,
      'Used in batch for ' || product_row.name,
      auth.uid()
    );

    IF (ingredient_row.current_stock - ingredient_row.required_quantity) <= ingredient_row.min_stock THEN
      PERFORM public.create_inventory_alert(
        'low-stock',
        ingredient_row.name || ' is at or below minimum stock.',
        ingredient_row.name,
        (ingredient_row.current_stock - ingredient_row.required_quantity) <= 0
      );
    END IF;
  END LOOP;

  UPDATE public.products
  SET quantity = quantity + quantity_value,
      expiration_date = expiration_value
  WHERE id = product_id_value;

  INSERT INTO public.stock_movements (
    type,
    item_type,
    item_id,
    item_name,
    quantity,
    remarks,
    user_id
  )
  VALUES (
    'IN',
    'product',
    product_id_value,
    product_row.name,
    quantity_value,
    'Batch production completed',
    auth.uid()
  );

  RETURN batch_id_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_defect(
  batch_id_value uuid,
  quantity_value integer,
  reason_value text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch_row public.batches%ROWTYPE;
  product_row public.products%ROWTYPE;
  defect_id_value uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can log defects';
  END IF;

  IF quantity_value IS NULL OR quantity_value <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT *
  INTO batch_row
  FROM public.batches
  WHERE id = batch_id_value
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF quantity_value > batch_row.quantity_produced THEN
    RAISE EXCEPTION 'Defect quantity cannot exceed produced quantity';
  END IF;

  SELECT *
  INTO product_row
  FROM public.products
  WHERE id = batch_row.product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF quantity_value > product_row.quantity THEN
    RAISE EXCEPTION 'Defect quantity cannot exceed product stock';
  END IF;

  INSERT INTO public.defects (batch_id, quantity, reason)
  VALUES (batch_id_value, quantity_value, nullif(trim(reason_value), ''))
  RETURNING id INTO defect_id_value;

  UPDATE public.batches
  SET quantity_produced = quantity_produced - quantity_value
  WHERE id = batch_id_value;

  UPDATE public.products
  SET quantity = quantity - quantity_value
  WHERE id = product_row.id;

  INSERT INTO public.stock_movements (
    type,
    item_type,
    item_id,
    item_name,
    quantity,
    remarks,
    user_id
  )
  VALUES (
    'OUT',
    'product',
    product_row.id,
    product_row.name,
    -quantity_value,
    'Defect logged: ' || coalesce(nullif(trim(reason_value), ''), 'No reason'),
    auth.uid()
  );

  IF product_row.quantity - quantity_value <= product_row.min_stock THEN
    PERFORM public.create_inventory_alert(
      CASE WHEN product_row.quantity - quantity_value <= 0 THEN 'critical' ELSE 'low-stock' END,
      product_row.name || ' is at or below minimum stock.',
      product_row.name,
      product_row.quantity - quantity_value <= 0
    );
  END IF;

  RETURN defect_id_value;
END;
$$;

REVOKE ALL ON FUNCTION public.produce_batch(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.produce_batch(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.log_defect(uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_defect(uuid, integer, text) TO authenticated;

-- Harden image storage: product/recipe images are public to read, but only admins may mutate.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('images', 'images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

DROP POLICY IF EXISTS "Public can view images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;

CREATE POLICY "Anyone can view images"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');

CREATE POLICY "Admins can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND public.has_role(auth.uid(), 'admin')
  AND (storage.foldername(name))[1] IN ('products', 'recipes')
);

CREATE POLICY "Admins can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND public.has_role(auth.uid(), 'admin')
  AND (storage.foldername(name))[1] IN ('products', 'recipes')
);

CREATE POLICY "Admins can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND public.has_role(auth.uid(), 'admin')
  AND (storage.foldername(name))[1] IN ('products', 'recipes')
);
