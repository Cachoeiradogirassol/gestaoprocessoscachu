
-- Add status column to events (projects) for Kanban
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'em_andamento';
