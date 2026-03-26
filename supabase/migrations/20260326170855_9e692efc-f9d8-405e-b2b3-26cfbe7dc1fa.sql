
CREATE POLICY "profiles_admin_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS start_date timestamp with time zone;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.task_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tf_select" ON public.task_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "tf_insert" ON public.task_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tf_delete" ON public.task_files FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR uploaded_by = auth.uid());

INSERT INTO storage.buckets (id, name, public) VALUES ('task-files', 'task-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tasks_gestor_delete" ON public.tasks FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role));
