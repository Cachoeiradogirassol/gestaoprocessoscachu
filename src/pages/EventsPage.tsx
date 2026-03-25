import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Users, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Event {
  id: string;
  name: string;
  description: string | null;
  event_date: string | null;
  responsible_id: string | null;
  created_at: string;
}

interface Profile {
  user_id: string;
  full_name: string;
}

export default function EventsPage() {
  const { user, isAdmin, isGestor } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [newEvent, setNewEvent] = useState({ name: '', description: '', event_date: '', responsible_id: '' });

  const fetchEvents = async () => {
    const { data } = await supabase.from('events').select('*').order('event_date', { ascending: true });
    if (data) setEvents(data as Event[]);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name');
    if (data) setProfiles(data);
  };

  useEffect(() => { fetchEvents(); fetchProfiles(); }, []);

  const createEvent = async () => {
    if (!newEvent.name.trim()) return;
    const { error } = await supabase.from('events').insert({
      name: newEvent.name,
      description: newEvent.description || null,
      event_date: newEvent.event_date || null,
      responsible_id: newEvent.responsible_id || user?.id,
      created_by: user?.id,
    });
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível criar o evento.', variant: 'destructive' });
    } else {
      toast({ title: 'Evento criado!' });
      setNewEvent({ name: '', description: '', event_date: '', responsible_id: '' });
      setIsDialogOpen(false);
      fetchEvents();
    }
  };

  const updateEvent = async () => {
    if (!editingEvent) return;
    const { error } = await supabase.from('events').update({
      name: editingEvent.name,
      description: editingEvent.description,
      event_date: editingEvent.event_date,
      responsible_id: editingEvent.responsible_id,
    }).eq('id', editingEvent.id);
    if (!error) {
      toast({ title: 'Evento atualizado!' });
      setIsEditDialogOpen(false);
      setEditingEvent(null);
      fetchEvents();
      // Notify participants
      const { data: participants } = await supabase.from('event_participants').select('user_id').eq('event_id', editingEvent.id);
      if (participants) {
        for (const p of participants) {
          if (p.user_id !== user?.id) {
            await supabase.from('notifications').insert({
              user_id: p.user_id, type: 'event_updated',
              title: 'Evento atualizado', message: editingEvent.name, link: `/events/${editingEvent.id}`,
            });
          }
        }
      }
    } else {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    }
  };

  const deleteEvent = async (ev: Event) => {
    if (!confirm(`Excluir o evento "${ev.name}"? As tarefas vinculadas serão desvinculadas.`)) return;
    // Notify participants before deletion
    const { data: participants } = await supabase.from('event_participants').select('user_id').eq('event_id', ev.id);
    if (participants) {
      for (const p of participants) {
        if (p.user_id !== user?.id) {
          await supabase.from('notifications').insert({
            user_id: p.user_id, type: 'event_deleted',
            title: 'Evento excluído', message: ev.name, link: '/events',
          });
        }
      }
    }
    // Unlink tasks
    await supabase.from('event_tasks').delete().eq('event_id', ev.id);
    await supabase.from('event_participants').delete().eq('event_id', ev.id);
    await supabase.from('event_files').delete().eq('event_id', ev.id);
    // Delete event
    const { error } = await supabase.from('events').delete().eq('id', ev.id);
    if (!error) {
      toast({ title: 'Evento excluído!' });
      fetchEvents();
    } else {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
  };

  const getProfileName = (userId: string | null) => {
    if (!userId) return '—';
    return profiles.find(p => p.user_id === userId)?.full_name || 'Usuário';
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Eventos & Projetos</h2>
        {(isAdmin || isGestor) && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Evento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Evento</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Nome *</Label><Input value={newEvent.name} onChange={e => setNewEvent(p => ({ ...p, name: e.target.value }))} /></div>
                <div><Label>Descrição</Label><Textarea value={newEvent.description} onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))} rows={3} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Data</Label><Input type="date" value={newEvent.event_date} onChange={e => setNewEvent(p => ({ ...p, event_date: e.target.value }))} /></div>
                  <div>
                    <Label>Responsável</Label>
                    <Select value={newEvent.responsible_id} onValueChange={v => setNewEvent(p => ({ ...p, responsible_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={createEvent} className="w-full">Criar Evento</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {events.length === 0 ? (
        <Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum evento cadastrado</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map(ev => (
            <Card key={ev.id} className="border-border hover:shadow-md transition-shadow cursor-pointer group" onClick={() => navigate(`/events/${ev.id}`)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{ev.name}</CardTitle>
                  {(isAdmin || isGestor) && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setEditingEvent({ ...ev }); setIsEditDialogOpen(true); }} className="p-1 hover:bg-accent rounded">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteEvent(ev); }} className="p-1 hover:bg-accent rounded">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {ev.description && <p className="text-sm text-muted-foreground line-clamp-2">{ev.description}</p>}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {ev.event_date && (
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(ev.event_date), 'dd/MM/yyyy')}</span>
                  )}
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{getProfileName(ev.responsible_id)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Event Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(v) => { setIsEditDialogOpen(v); if (!v) setEditingEvent(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Evento</DialogTitle></DialogHeader>
          {editingEvent && (
            <div className="space-y-4">
              <div><Label>Nome *</Label><Input value={editingEvent.name} onChange={e => setEditingEvent(p => p ? { ...p, name: e.target.value } : null)} /></div>
              <div><Label>Descrição</Label><Textarea value={editingEvent.description || ''} onChange={e => setEditingEvent(p => p ? { ...p, description: e.target.value } : null)} rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data</Label><Input type="date" value={editingEvent.event_date?.split('T')[0] || ''} onChange={e => setEditingEvent(p => p ? { ...p, event_date: e.target.value } : null)} /></div>
                <div>
                  <Label>Responsável</Label>
                  <Select value={editingEvent.responsible_id || ''} onValueChange={v => setEditingEvent(p => p ? { ...p, responsible_id: v } : null)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={updateEvent} className="w-full">Salvar Alterações</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
