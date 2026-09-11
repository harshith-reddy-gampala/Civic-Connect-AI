-- Supported operating districts. Population remains zero until authoritative data is supplied.
INSERT INTO public.districts (name, code, city, center_lat, center_lng, population) VALUES
  ('Hyderabad', 'HYD', 'Hyderabad', 17.3850, 78.4867, 0),
  ('Rangareddy', 'RRD', 'Rangareddy', 17.2403, 78.4294, 0),
  ('Medchal-Malkajgiri', 'MDM', 'Medchal-Malkajgiri', 17.6292, 78.4814, 0);

-- An Auth profile can represent at most one officer record.
CREATE UNIQUE INDEX IF NOT EXISTS officers_profile_id_unique
  ON public.officers (profile_id)
  WHERE profile_id IS NOT NULL;

-- Keep the existing role model while allowing at most one provisioned admin account.
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_single_department_admin
  ON public.user_roles (role)
  WHERE role = 'department_admin';
