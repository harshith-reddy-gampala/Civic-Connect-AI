-- Realtime: stream notification + complaint changes to connected clients
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.complaints REPLICA IDENTITY FULL;
ALTER TABLE public.status_history REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.status_history;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Query performance for the list/feed views
CREATE INDEX IF NOT EXISTS complaints_citizen_created_idx ON public.complaints (citizen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_officer_created_idx ON public.complaints (officer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_status_created_idx ON public.complaints (status, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_district_idx ON public.complaints (district_id);
CREATE INDEX IF NOT EXISTS complaints_department_idx ON public.complaints (department_id);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS status_history_complaint_idx ON public.status_history (complaint_id, created_at);
CREATE INDEX IF NOT EXISTS complaint_images_complaint_idx ON public.complaint_images (complaint_id);
CREATE INDEX IF NOT EXISTS complaint_supports_citizen_idx ON public.complaint_supports (citizen_id);