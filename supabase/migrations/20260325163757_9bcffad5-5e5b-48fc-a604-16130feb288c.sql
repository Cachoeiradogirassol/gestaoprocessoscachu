
-- Create routines table for Processos module
CREATE TABLE public.routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  setor text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routines_select" ON public.routines FOR SELECT TO authenticated USING (true);
CREATE POLICY "routines_insert" ON public.routines FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gestor')
);
CREATE POLICY "routines_update" ON public.routines FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR (has_role(auth.uid(), 'gestor') AND created_by = auth.uid())
);
CREATE POLICY "routines_delete" ON public.routines FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin')
);

-- Create routine_flows table to store flowchart data
CREATE TABLE public.routine_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Fluxo Principal',
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  viewport jsonb DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.routine_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rf_select" ON public.routine_flows FOR SELECT TO authenticated USING (true);
CREATE POLICY "rf_insert" ON public.routine_flows FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gestor')
);
CREATE POLICY "rf_update" ON public.routine_flows FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gestor')
);
CREATE POLICY "rf_delete" ON public.routine_flows FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin')
);

-- Create routine_files table
CREATE TABLE public.routine_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.routine_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfi_select" ON public.routine_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "rfi_insert" ON public.routine_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rfi_delete" ON public.routine_files FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gestor') OR uploaded_by = auth.uid()
);

-- Add routine_id to messages for routine chat
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS routine_id uuid REFERENCES public.routines(id) ON DELETE CASCADE;

-- Update messages RLS to include routine messages
DROP POLICY IF EXISTS "msg_select" ON public.messages;
CREATE POLICY "msg_select" ON public.messages FOR SELECT TO authenticated USING (
  sender_id = auth.uid() OR receiver_id = auth.uid() OR event_id IS NOT NULL OR task_id IS NOT NULL OR routine_id IS NOT NULL OR is_announcement = true
);

-- Create storage bucket for routine files
INSERT INTO storage.buckets (id, name, public) VALUES ('routine-files', 'routine-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "routine_files_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'routine-files');
CREATE POLICY "routine_files_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'routine-files');
CREATE POLICY "routine_files_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'routine-files');

-- Enable realtime for routine messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.routines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.routine_flows;
