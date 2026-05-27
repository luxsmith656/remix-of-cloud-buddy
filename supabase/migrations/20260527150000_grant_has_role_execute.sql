-- Allow signed-in clients to evaluate their role through the existing
-- SECURITY DEFINER helper used by the app and RLS/storage policies.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
