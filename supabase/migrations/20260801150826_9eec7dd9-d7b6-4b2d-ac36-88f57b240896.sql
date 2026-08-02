DROP VIEW IF EXISTS public.complaint_feed;
DROP VIEW IF EXISTS public.complaint_image_feed;
DROP VIEW IF EXISTS public.status_history_feed;
DROP VIEW IF EXISTS public.officer_directory;

-- COMPLAINTS: browsable rows, PII columns withheld
DROP POLICY IF EXISTS "complaints readable by parties" ON public.complaints;
CREATE POLICY "complaints readable" ON public.complaints
FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.complaints FROM authenticated;
GRANT SELECT (
  id, reference, citizen_id, title, description, category, status, priority, address,
  lat, lng, district_id, department_id, officer_id, support_count, remarks,
  ai_priority_score, ai_category_suggestion, ai_assignment_reason,
  resolved_at, created_at, updated_at
) ON public.complaints TO authenticated;

-- STATUS HISTORY: actor uuid withheld
DROP POLICY IF EXISTS "history readable by parties" ON public.status_history;
CREATE POLICY "history readable" ON public.status_history
FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.status_history FROM authenticated;
GRANT SELECT (id, complaint_id, status, remarks, changed_by_name, created_at)
  ON public.status_history TO authenticated;

-- COMPLAINT IMAGES: uploader identity withheld
DROP POLICY IF EXISTS "images readable by parties" ON public.complaint_images;
CREATE POLICY "images readable" ON public.complaint_images
FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.complaint_images FROM authenticated;
GRANT SELECT (id, complaint_id, image_url, kind, created_at)
  ON public.complaint_images TO authenticated;

-- OFFICERS: phone withheld from directory reads
DROP POLICY IF EXISTS "officers readable by self or admin" ON public.officers;
CREATE POLICY "officers readable" ON public.officers
FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.officers FROM authenticated;
GRANT SELECT (
  id, profile_id, full_name, employee_code, department_id, district_id,
  resolved_count, active_count, avg_resolution_hours, rating, created_at
) ON public.officers TO authenticated;

GRANT ALL ON public.complaints, public.status_history, public.complaint_images, public.officers TO service_role;