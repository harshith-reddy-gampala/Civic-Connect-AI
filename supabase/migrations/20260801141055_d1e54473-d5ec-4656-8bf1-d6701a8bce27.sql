
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

-- demo data
INSERT INTO public.districts (id, name, code, city, center_lat, center_lng, population) VALUES
 ('11111111-1111-1111-1111-111111111101','Central Ward','CEN','Pune',18.5204,73.8567,412000),
 ('11111111-1111-1111-1111-111111111102','Riverside','RIV','Pune',18.5310,73.8446,286000),
 ('11111111-1111-1111-1111-111111111103','North Gate','NOR','Pune',18.5679,73.9143,351000),
 ('11111111-1111-1111-1111-111111111104','Tech Corridor','TEC','Pune',18.5089,73.9260,198000),
 ('11111111-1111-1111-1111-111111111105','Old Town','OLD','Pune',18.4989,73.8677,240000);

INSERT INTO public.departments (id, name, code, category, contact_email) VALUES
 ('22222222-2222-2222-2222-222222222201','Roads & Transport','ROAD','roads','roads@civic.gov'),
 ('22222222-2222-2222-2222-222222222202','Water Supply','WATER','water','water@civic.gov'),
 ('22222222-2222-2222-2222-222222222203','Electricity','ELEC','electricity','power@civic.gov'),
 ('22222222-2222-2222-2222-222222222204','Sanitation','SANI','sanitation','sanitation@civic.gov'),
 ('22222222-2222-2222-2222-222222222205','Public Safety','SAFE','safety','safety@civic.gov');

INSERT INTO public.officers (id, full_name, employee_code, department_id, district_id, phone, resolved_count, active_count, avg_resolution_hours, rating) VALUES
 ('33333333-3333-3333-3333-333333333301','Anil Deshmukh','OFF-1041','22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111101','+91 98200 11041',148,6,31.5,4.7),
 ('33333333-3333-3333-3333-333333333302','Priya Nair','OFF-1042','22222222-2222-2222-2222-222222222202','11111111-1111-1111-1111-111111111102','+91 98200 11042',203,4,22.8,4.9),
 ('33333333-3333-3333-3333-333333333303','Rahul Mehta','OFF-1043','22222222-2222-2222-2222-222222222203','11111111-1111-1111-1111-111111111103','+91 98200 11043',96,9,44.2,4.2),
 ('33333333-3333-3333-3333-333333333304','Sneha Kulkarni','OFF-1044','22222222-2222-2222-2222-222222222204','11111111-1111-1111-1111-111111111104','+91 98200 11044',177,5,27.4,4.6),
 ('33333333-3333-3333-3333-333333333305','Imran Sheikh','OFF-1045','22222222-2222-2222-2222-222222222205','11111111-1111-1111-1111-111111111105','+91 98200 11045',121,7,38.9,4.4);

INSERT INTO public.complaints (id, reference, reporter_name, reporter_phone, title, description, category, status, priority, address, lat, lng, district_id, department_id, officer_id, support_count, created_at, resolved_at) VALUES
 ('44444444-4444-4444-4444-444444444401','CIV-2A41B7C0','Meera Joshi','+91 90000 10001','Deep pothole near Mahatma bridge','A large pothole is causing two-wheeler accidents every evening. Water collects inside after rain.','roads','in_progress','critical','Mahatma Bridge Rd, Central Ward',18.5211,73.8580,'11111111-1111-1111-1111-111111111101','22222222-2222-2222-2222-222222222201','33333333-3333-3333-3333-333333333301',34, now() - interval '9 days', NULL),
 ('44444444-4444-4444-4444-444444444402','CIV-8B12CD34','Vikram Rao','+91 90000 10002','Streetlights dead on entire lane','No street lighting for the last 12 nights across 400 metres. Unsafe for women returning from work.','electricity','assigned','high','Lane 4, North Gate',18.5688,73.9151,'11111111-1111-1111-1111-111111111103','22222222-2222-2222-2222-222222222203','33333333-3333-3333-3333-333333333303',21, now() - interval '6 days', NULL),
 ('44444444-4444-4444-4444-444444444403','CIV-55EE77AA','Fatima Khan','+91 90000 10003','Drinking water contaminated','Tap water is muddy and smells since Monday. Several families reported stomach illness.','water','under_review','critical','Riverside Colony Block B',18.5316,73.8452,'11111111-1111-1111-1111-111111111102','22222222-2222-2222-2222-222222222202',NULL,48, now() - interval '3 days', NULL),
 ('44444444-4444-4444-4444-444444444404','CIV-91AC22FE','Suresh Patil','+91 90000 10004','Garbage not collected for 8 days','Overflowing bins attracting stray animals near the school entrance.','sanitation','completed','medium','Old Town Market Rd',18.4995,73.8681,'11111111-1111-1111-1111-111111111105','22222222-2222-2222-2222-222222222204','33333333-3333-3333-3333-333333333304',12, now() - interval '18 days', now() - interval '15 days'),
 ('44444444-4444-4444-4444-444444444405','CIV-C7D80011','Ananya Sen','+91 90000 10005','Broken footpath slab','Slab collapsed exposing a drain shaft, dangerous for children.','roads','completed','high','Tech Corridor Phase 2',18.5094,73.9271,'11111111-1111-1111-1111-111111111104','22222222-2222-2222-2222-222222222201','33333333-3333-3333-3333-333333333301',9, now() - interval '25 days', now() - interval '21 days'),
 ('44444444-4444-4444-4444-444444444406','CIV-4400FFAB','Joseph Dsouza','+91 90000 10006','Open transformer box','Live wires exposed at pedestrian height next to a bus stop.','electricity','submitted','critical','Central Ward Bus Depot',18.5199,73.8552,'11111111-1111-1111-1111-111111111101','22222222-2222-2222-2222-222222222203',NULL,27, now() - interval '1 day', NULL),
 ('44444444-4444-4444-4444-444444444407','CIV-1298BBCD','Neha Verma','+91 90000 10007','Sewage overflow on main road','Sewage flooding the junction, traffic diverted by locals.','sanitation','in_progress','high','Riverside Junction',18.5322,73.8461,'11111111-1111-1111-1111-111111111102','22222222-2222-2222-2222-222222222204','33333333-3333-3333-3333-333333333304',31, now() - interval '4 days', NULL),
 ('44444444-4444-4444-4444-444444444408','CIV-7711DEAA','Arjun Iyer','+91 90000 10008','Unsafe pedestrian crossing','No signal or zebra crossing near the hospital gate.','safety','under_review','medium','Old Town Hospital Rd',18.4981,73.8669,'11111111-1111-1111-1111-111111111105','22222222-2222-2222-2222-222222222205',NULL,17, now() - interval '11 days', NULL),
 ('44444444-4444-4444-4444-444444444409','CIV-3355CC12','Kiran Shah','+91 90000 10009','Leaking water main wasting supply','Continuous leak for weeks, road is permanently wet.','water','assigned','medium','North Gate Sector 7',18.5671,73.9128,'11111111-1111-1111-1111-111111111103','22222222-2222-2222-2222-222222222202','33333333-3333-3333-3333-333333333302',14, now() - interval '7 days', NULL),
 ('44444444-4444-4444-4444-444444444410','CIV-6622AB90','Divya Menon','+91 90000 10010','Traffic signal stuck on red','Signal malfunction creating a 20 minute jam each morning.','safety','completed','high','Tech Corridor Circle',18.5081,73.9249,'11111111-1111-1111-1111-111111111104','22222222-2222-2222-2222-222222222205','33333333-3333-3333-3333-333333333305',22, now() - interval '30 days', now() - interval '28 days');

INSERT INTO public.complaint_images (complaint_id, image_url, kind) VALUES
 ('44444444-4444-4444-4444-444444444401','https://images.unsplash.com/photo-1516216628859-9bccecab13ca?w=1200&q=70','before'),
 ('44444444-4444-4444-4444-444444444404','https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=70','before'),
 ('44444444-4444-4444-4444-444444444407','https://images.unsplash.com/photo-1581093450021-4a7360e9a6b5?w=1200&q=70','before');

INSERT INTO public.status_history (complaint_id, status, remarks, changed_by_name, created_at) VALUES
 ('44444444-4444-4444-4444-444444444401','submitted','Complaint registered by citizen.','System', now() - interval '9 days'),
 ('44444444-4444-4444-4444-444444444401','under_review','Verified by ward inspection team.','Ward Desk', now() - interval '8 days'),
 ('44444444-4444-4444-4444-444444444401','assigned','Routed to Roads & Transport.','Auto Router', now() - interval '7 days'),
 ('44444444-4444-4444-4444-444444444401','in_progress','Patch work started, material requested.','Anil Deshmukh', now() - interval '2 days'),
 ('44444444-4444-4444-4444-444444444404','submitted','Complaint registered by citizen.','System', now() - interval '18 days'),
 ('44444444-4444-4444-4444-444444444404','completed','Bins cleared and collection schedule restored.','Sneha Kulkarni', now() - interval '15 days');
