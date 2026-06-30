
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.dossier_type AS ENUM ('standard', 'contra', 'kits', 'stands');
CREATE TYPE public.dossier_statut AS ENUM ('brouillon', 'valide', 'archive');

-- Utility trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Admin policies for user_roles
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Handle new user: create profile + first user is admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  telephone TEXT,
  adresse TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "auth update clients" ON public.clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin delete clients" ON public.clients FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX clients_entreprise_idx ON public.clients (lower(entreprise));

-- Reference sequence
CREATE SEQUENCE public.dossier_ref_seq START 1;

-- dossiers
CREATE TABLE public.dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  objet TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients ON DELETE RESTRICT,
  contact TEXT,
  email TEXT,
  type public.dossier_type NOT NULL,
  statut public.dossier_statut NOT NULL DEFAULT 'brouillon',
  onedrive_note TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossiers TO authenticated;
GRANT ALL ON public.dossiers TO service_role;
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dossiers" ON public.dossiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert dossiers" ON public.dossiers FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "auth update dossiers" ON public.dossiers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin delete dossiers" ON public.dossiers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER dossiers_updated BEFORE UPDATE ON public.dossiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX dossiers_client_idx ON public.dossiers (client_id);
CREATE INDEX dossiers_type_idx ON public.dossiers (type);
CREATE INDEX dossiers_statut_idx ON public.dossiers (statut);

-- Reference generator
CREATE OR REPLACE FUNCTION public.next_dossier_reference()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n BIGINT; BEGIN
  n := nextval('public.dossier_ref_seq');
  RETURN 'YETI-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
END; $$;

-- app_defaults
CREATE TABLE public.app_defaults (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_defaults TO authenticated;
GRANT ALL ON public.app_defaults TO service_role;
ALTER TABLE public.app_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read defaults" ON public.app_defaults FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write defaults" ON public.app_defaults FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_defaults (key, value) VALUES
  ('standard', '{"coef_marge_pct":33.33,"frais_fixes_pct":4,"commission_sourcing":true,"commission_sourcing_pct":5,"commission_sourcing_min_eur":200,"commission_rapporteur_pct":0,"seuil_alerte_marge_pct":20}'::jsonb),
  ('contra', '{"coef_contra_pct":25,"coef_autres_pct":33.33,"frais_fixes_pct":4,"commission_sourcing":false,"commission_sourcing_pct":5,"commission_sourcing_min_eur":200,"commission_rapporteur_pct":0}'::jsonb),
  ('kits', '{"marge_residuelle_cible_pct":35}'::jsonb),
  ('stands', '{"coef_marge_pct":33.33,"frais_fixes_pct":4,"marge_crea_pct":0,"commission_rapporteur_pct":10}'::jsonb);
