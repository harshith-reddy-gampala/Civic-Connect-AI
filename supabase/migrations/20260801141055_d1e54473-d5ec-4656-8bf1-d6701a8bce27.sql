
CREATE TYPE public.app_role AS ENUM ('citizen','department_admin','field_officer');
CREATE TYPE public.complaint_status AS ENUM ('submitted','under_review','assigned','in_progress','completed');
CREATE TYPE public.complaint_priority AS ENUM ('low','medium','high','critical');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- districts
CREATE TABLE public.districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  city text NOT NULL DEFAULT '',
  center_lat double precision NOT NULL DEFAULT 0,
  center_lng double precision NOT NULL DEFAULT 0,
  population integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.districts TO authenticated, anon;
GRANT ALL ON public.districts TO service_role;
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "districts readable" ON public.districts FOR SELECT TO authenticated, anon USING (true);

-- departments
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'general',
  contact_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.departments TO authenticated, anon;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departments readable" ON public.departments FOR SELECT TO authenticated, anon USING (true);

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  avatar_url text,
  district_id uuid REFERENCES public.districts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- user roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'citizen',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own role insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- officers
CREATE TABLE public.officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  employee_code text NOT NULL UNIQUE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  district_id uuid REFERENCES public.districts(id) ON DELETE SET NULL,
  phone text,
  resolved_count integer NOT NULL DEFAULT 0,
  active_count integer NOT NULL DEFAULT 0,
  avg_resolution_hours numeric NOT NULL DEFAULT 0,
  rating numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.officers TO authenticated;
GRANT ALL ON public.officers TO service_role;
ALTER TABLE public.officers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers readable" ON public.officers FOR SELECT TO authenticated USING (true);
CREATE POLICY "officers self claim" ON public.officers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'department_admin') OR profile_id = auth.uid() OR profile_id IS NULL);

-- complaints
CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('CIV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  citizen_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_name text NOT NULL DEFAULT 'Citizen',
  reporter_phone text,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  status public.complaint_status NOT NULL DEFAULT 'submitted',
  priority public.complaint_priority NOT NULL DEFAULT 'medium',
  address text NOT NULL DEFAULT '',
  lat double precision,
  lng double precision,
  district_id uuid REFERENCES public.districts(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  officer_id uuid REFERENCES public.officers(id) ON DELETE SET NULL,
  support_count integer NOT NULL DEFAULT 0,
  remarks text,
  ai_priority_score numeric,
  ai_category_suggestion text,
  ai_assignment_reason text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "complaints readable" ON public.complaints FOR SELECT TO authenticated USING (true);
CREATE POLICY "citizens create complaints" ON public.complaints FOR INSERT TO authenticated WITH CHECK (citizen_id = auth.uid());
CREATE POLICY "complaint updates" ON public.complaints FOR UPDATE TO authenticated USING (
  citizen_id = auth.uid()
  OR public.has_role(auth.uid(), 'department_admin')
  OR (public.has_role(auth.uid(), 'field_officer') AND officer_id IN (SELECT id FROM public.officers WHERE profile_id = auth.uid()))
);
CREATE TRIGGER complaints_updated BEFORE UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- complaint images
CREATE TABLE public.complaint_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  kind text NOT NULL DEFAULT 'before',
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.complaint_images TO authenticated;
GRANT ALL ON public.complaint_images TO service_role;
ALTER TABLE public.complaint_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "images readable" ON public.complaint_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "images insert" ON public.complaint_images FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

-- supports
CREATE TABLE public.complaint_supports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  citizen_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (complaint_id, citizen_id)
);
GRANT SELECT, INSERT, DELETE ON public.complaint_supports TO authenticated;
GRANT ALL ON public.complaint_supports TO service_role;
ALTER TABLE public.complaint_supports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supports readable" ON public.complaint_supports FOR SELECT TO authenticated USING (true);
CREATE POLICY "supports insert own" ON public.complaint_supports FOR INSERT TO authenticated WITH CHECK (citizen_id = auth.uid());
CREATE POLICY "supports delete own" ON public.complaint_supports FOR DELETE TO authenticated USING (citizen_id = auth.uid());

CREATE OR REPLACE FUNCTION public.sync_support_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.complaints SET support_count = support_count + 1 WHERE id = NEW.complaint_id;
    RETURN NEW;
  ELSE
    UPDATE public.complaints SET support_count = greatest(support_count - 1, 0) WHERE id = OLD.complaint_id;
    RETURN OLD;
  END IF;
END; $$;
CREATE TRIGGER supports_count AFTER INSERT OR DELETE ON public.complaint_supports
FOR EACH ROW EXECUTE FUNCTION public.sync_support_count();

-- status history
CREATE TABLE public.status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  status public.complaint_status NOT NULL,
  remarks text,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.status_history TO authenticated;
GRANT ALL ON public.status_history TO service_role;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "history readable" ON public.status_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "history insert" ON public.status_history FOR INSERT TO authenticated WITH CHECK (true);

-- notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- new user bootstrap
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, coalesce((NEW.raw_user_meta_data->>'role')::public.app_role, 'citizen'))
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.departments (id, name, code, category, contact_email) VALUES
 ('22222222-2222-2222-2222-222222222201','Roads & Transport','ROAD','roads','roads@civic.gov'),
 ('22222222-2222-2222-2222-222222222202','Water Supply','WATER','water','water@civic.gov'),
 ('22222222-2222-2222-2222-222222222203','Electricity','ELEC','electricity','power@civic.gov'),
 ('22222222-2222-2222-2222-222222222204','Sanitation','SANI','sanitation','sanitation@civic.gov'),
 ('22222222-2222-2222-2222-222222222205','Public Safety','SAFE','safety','safety@civic.gov');
