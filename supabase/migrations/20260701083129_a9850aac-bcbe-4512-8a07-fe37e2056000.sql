
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.next_dossier_reference()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ DECLARE n BIGINT; BEGIN
  n := nextval('public.dossier_ref_seq');
  RETURN 'YETI-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
END; $$;
REVOKE ALL ON FUNCTION private.next_dossier_reference() FROM PUBLIC, anon, authenticated;

-- Drop all policies depending on public.has_role, then drop the function, then recreate policies against private.has_role
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tbl, p.polname AS name
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (pg_get_expr(p.polqual, p.polrelid) LIKE '%has_role%'
        OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%has_role%')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.name, r.sch, r.tbl);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.next_dossier_reference();

-- Recreate admin policies
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete clients" ON public.clients
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete dossiers" ON public.dossiers
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage app_defaults" ON public.app_defaults
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- Also allow all authenticated users to read app_defaults (needed by calculators)
CREATE POLICY "read app_defaults" ON public.app_defaults
  FOR SELECT TO authenticated USING (true);

-- Trigger to auto-fill dossier reference
CREATE OR REPLACE FUNCTION public.set_dossier_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN
  IF NEW.reference IS NULL OR btrim(NEW.reference) = '' THEN
    NEW.reference := private.next_dossier_reference();
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.set_dossier_reference() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_dossier_reference ON public.dossiers;
CREATE TRIGGER trg_set_dossier_reference
  BEFORE INSERT ON public.dossiers
  FOR EACH ROW EXECUTE FUNCTION public.set_dossier_reference();
