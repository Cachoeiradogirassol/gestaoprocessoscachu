
-- Add reply_to_id to messages for reply feature
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id);

-- Create meetings table
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  meeting_date timestamp with time zone DEFAULT now(),
  audio_url text,
  transcript text,
  summary text,
  decisions jsonb DEFAULT '[]'::jsonb,
  suggested_tasks jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_select" ON public.meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gestor') OR created_by = auth.uid()
);
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin')
);

-- Meeting participants
CREATE TABLE public.meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_select" ON public.meeting_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "mp_insert" ON public.meeting_participants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mp_delete" ON public.meeting_participants FOR DELETE TO authenticated USING (true);

-- Meeting tasks link
CREATE TABLE public.meeting_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE CASCADE NOT NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL
);

ALTER TABLE public.meeting_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_select" ON public.meeting_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "mt_insert" ON public.meeting_tasks FOR INSERT TO authenticated WITH CHECK (true);

-- Storage buckets for event files and meeting audio
INSERT INTO storage.buckets (id, name, public) VALUES ('event-files', 'event-files', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('meeting-audio', 'meeting-audio', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "event_files_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'event-files');
CREATE POLICY "event_files_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'event-files');
CREATE POLICY "event_files_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'event-files');
CREATE POLICY "meeting_audio_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'meeting-audio');
CREATE POLICY "meeting_audio_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'meeting-audio');

-- Event files metadata table
CREATE TABLE public.event_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.event_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ef_select" ON public.event_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "ef_insert" ON public.event_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ef_delete" ON public.event_files FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gestor') OR uploaded_by = auth.uid()
);

-- Add trigger for meetings updated_at
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
