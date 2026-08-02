-- 1. Move has_role out of the exposed API schema
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_complaint_party(_complaint_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.complaints c
    WHERE c.id = _complaint_id
      AND (
        c.citizen_id = auth.uid()
        OR c.officer_id IN (SELECT o.id FROM public.officers o WHERE o.profile_id = auth.uid())
      )
  ) OR private.has_role(auth.uid(), 'department_admin');
$$;
REVOKE ALL ON FUNCTION private.is_complaint_party(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_complaint_party(uuid) TO authenticated, service_role;

-- 2. Complaints: restrict full-row reads
DROP POLICY IF EXISTS "complaints readable" ON public.complaints;
DROP POLICY IF EXISTS "complaint updates" ON public.complaints;

CREATE POLICY "complaints readable by parties" ON public.complaints
FOR SELECT TO authenticated
USING (
  citizen_id = auth.uid()
  OR private.has_role(auth.uid(), 'department_admin')
  OR (officer_id IN (SELECT o.id FROM public.officers o WHERE o.profile_id = auth.uid()))
);

CREATE POLICY "complaint updates" ON public.complaints
FOR UPDATE TO authenticated
USING (
  citizen_id = auth.uid()
  OR private.has_role(auth.uid(), 'department_admin')
  OR (
    private.has_role(auth.uid(), 'field_officer')
    AND officer_id IN (SELECT o.id FROM public.officers o WHERE o.profile_id = auth.uid())
  )
);

-- 3. Profiles: owner only
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "own profile readable" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid());

-- 4. Officers: self or admin
DROP POLICY IF EXISTS "officers readable" ON public.officers;
DROP POLICY IF EXISTS "officers managed" ON public.officers;
CREATE POLICY "officers readable by self or admin" ON public.officers
FOR SELECT TO authenticated
USING (profile_id = auth.uid() OR private.has_role(auth.uid(), 'department_admin'));
CREATE POLICY "officers managed" ON public.officers
FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'department_admin') OR profile_id = auth.uid());

-- 5. Complaint supports: own rows only
DROP POLICY IF EXISTS "supports readable" ON public.complaint_supports;
CREATE POLICY "own supports readable" ON public.complaint_supports
FOR SELECT TO authenticated
USING (citizen_id = auth.uid());

-- 6. Complaint images: related parties or uploader
DROP POLICY IF EXISTS "images readable" ON public.complaint_images;
CREATE POLICY "images readable by parties" ON public.complaint_images
FOR SELECT TO authenticated
USING (uploaded_by = auth.uid() OR private.is_complaint_party(complaint_id));

-- 7. Status history: related parties
DROP POLICY IF EXISTS "history readable" ON public.status_history;
CREATE POLICY "history readable by parties" ON public.status_history
FOR SELECT TO authenticated
USING (changed_by = auth.uid() OR private.is_complaint_party(complaint_id));

-- 8. Privacy-safe listings for city-wide screens (no phone numbers, no user ids)
CREATE OR REPLACE VIEW public.complaint_feed AS
SELECT id, reference, title, description, category, status, priority, address,
       lat, lng, district_id, department_id, officer_id, citizen_id, support_count,
       remarks, ai_priority_score, ai_category_suggestion, ai_assignment_reason,
       resolved_at, created_at, updated_at
FROM public.complaints;
GRANT SELECT ON public.complaint_feed TO authenticated;

CREATE OR REPLACE VIEW public.complaint_image_feed AS
SELECT id, complaint_id, image_url, kind, created_at
FROM public.complaint_images;
GRANT SELECT ON public.complaint_image_feed TO authenticated;

CREATE OR REPLACE VIEW public.status_history_feed AS
SELECT h.id, h.complaint_id, h.status, h.remarks, h.changed_by_name, h.created_at,
       c.title AS complaint_title, c.reference AS complaint_reference
FROM public.status_history h
LEFT JOIN public.complaints c ON c.id = h.complaint_id;
GRANT SELECT ON public.status_history_feed TO authenticated;

CREATE OR REPLACE VIEW public.officer_directory AS
SELECT id, profile_id, full_name, employee_code, department_id, district_id,
       resolved_count, active_count, avg_resolution_hours, rating, created_at
FROM public.officers;
GRANT SELECT ON public.officer_directory TO authenticated;

-- 9. Storage: ownership-scoped access to complaint images
DROP POLICY IF EXISTS "complaint images upload" ON storage.objects;
DROP POLICY IF EXISTS "complaint images read" ON storage.objects;

CREATE POLICY "complaint images upload own folder" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'complaint-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "complaint images read scoped" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'complaint-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR private.has_role(auth.uid(), 'department_admin')
    OR private.has_role(auth.uid(), 'field_officer')
  )
);

-- 10. Drop the publicly callable helper
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);