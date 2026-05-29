CREATE OR REPLACE FUNCTION public.create_inventory_alert(
  alert_type_value text,
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
  PERFORM public.create_inventory_alert(
    alert_type_value::public.alert_type,
    message_value,
    item_name_value,
    urgent_value
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inventory_alert(text, text, text, boolean) TO authenticated;