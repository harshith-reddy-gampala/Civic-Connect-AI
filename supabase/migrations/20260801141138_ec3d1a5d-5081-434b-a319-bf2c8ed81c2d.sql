
DROP POLICY "history insert" ON public.status_history;
CREATE POLICY "history insert own" ON public.status_history FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());

DROP POLICY "officers self claim" ON public.officers;
CREATE POLICY "officers managed" ON public.officers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'department_admin') OR profile_id = auth.uid());

REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_support_count() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;

CREATE POLICY "complaint images upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'complaint-images');
CREATE POLICY "complaint images read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'complaint-images');
