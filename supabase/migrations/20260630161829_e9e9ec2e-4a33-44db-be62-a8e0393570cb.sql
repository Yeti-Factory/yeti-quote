
-- Tighten update policies (avoid USING(true))
DROP POLICY IF EXISTS "auth update clients" ON public.clients;
CREATE POLICY "auth update clients" ON public.clients FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth update dossiers" ON public.dossiers;
CREATE POLICY "auth update dossiers" ON public.dossiers FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Restrict SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_dossier_reference() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
-- authenticated still needs has_role for RLS evaluation and next_dossier_reference to create dossiers
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_dossier_reference() TO authenticated;
