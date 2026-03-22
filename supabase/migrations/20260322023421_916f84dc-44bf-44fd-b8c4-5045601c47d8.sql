
-- Add 'mensal' to recurrence_type enum
ALTER TYPE public.recurrence_type ADD VALUE IF NOT EXISTS 'mensal';

-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
