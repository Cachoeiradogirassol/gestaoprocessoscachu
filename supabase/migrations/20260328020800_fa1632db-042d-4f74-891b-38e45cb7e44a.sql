
-- Task dependencies table
CREATE TABLE public.task_dependencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(task_id, depends_on_task_id),
  CHECK (task_id != depends_on_task_id)
);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "td_select" ON public.task_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "td_insert" ON public.task_dependencies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "td_delete" ON public.task_dependencies FOR DELETE TO authenticated USING (true);

-- Enable realtime for tasks and task_dependencies
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_dependencies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
