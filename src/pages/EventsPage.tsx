import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Users, BarChart } from 'lucide-react';
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
  const { toast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
            <Card key={ev.id} className="border-border hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{ev.name}</CardTitle>
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
    </div>
  );
}
