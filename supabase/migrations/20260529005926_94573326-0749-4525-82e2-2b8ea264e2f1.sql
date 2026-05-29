CREATE OR REPLACE FUNCTION public.delete_recipe(recipe_id_value uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipe_row public.recipes%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete recipes';
  END IF;

  SELECT * INTO recipe_row
  FROM public.recipes
  WHERE id = recipe_id_value
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe not found';
  END IF;

  DELETE FROM public.recipe_ingredients
  WHERE recipe_id = recipe_id_value;

  DELETE FROM public.recipes
  WHERE id = recipe_id_value;

  INSERT INTO public.audit_logs (user_id, action, module, details)
  VALUES (
    auth.uid(),
    'DELETE',
    'Recipes',
    'Deleted recipe ' || coalesce(recipe_row.name, recipe_row.id::text)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_recipe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_recipe(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';