import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, GitBranch, Calendar, User, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Routine {
  id: string;
  name: string;
  description: string | null;
  setor: string | null;
  created_by: string | null;
  created_at: string;
}

interface Profile {
  user_id: string;
  full_name: string;
}

export default function ProcessesPage() {
  const { user, isAdmin, isGestor } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newRoutine, setNewRoutine] = useState({ name: '', description: '', setor: '' });

  const fetchRoutines = async () => {
    const { data } = await supabase.from('routines').select('*').order('created_at', { ascending: false });
    if (data) setRoutines(data as Routine[]);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name');
    if (data) setProfiles(data);
  };

  useEffect(() => { fetchRoutines(); fetchProfiles(); }, []);

  const createRoutine = async () => {
    if (!newRoutine.name.trim()) return;
    const { error } = await supabase.from('routines').insert({
      name: newRoutine.name,
      description: newRoutine.description || null,
      setor: newRoutine.setor || null,
      created_by: user?.id,
    });
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível criar a rotina.', variant: 'destructive' });
    } else {
      toast({ title: 'Rotina criada!' });
      setNewRoutine({ name: '', description: '', setor: '' });
      setIsDialogOpen(false);
      fetchRoutines();
    }
  };

  const deleteRoutine = async (id: string) => {
    if (!confirm('Excluir esta rotina e todos os seus dados?')) return;
    const { error } = await supabase.from('routines').delete().eq('id', id);
    if (!error) {
      toast({ title: 'Rotina excluída!' });
      fetchRoutines();
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
        <h2 className="text-lg font-semibold text-foreground">Processos & Rotinas</h2>
        {(isAdmin || isGestor) && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Rotina</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova Rotina</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Nome *</Label><Input value={newRoutine.name} onChange={e => setNewRoutine(p => ({ ...p, name: e.target.value }))} placeholder="Nome da rotina" /></div>
                <div><Label>Descrição</Label><Textarea value={newRoutine.description} onChange={e => setNewRoutine(p => ({ ...p, description: e.target.value }))} rows={3} /></div>
                <div><Label>Setor</Label><Input value={newRoutine.setor} onChange={e => setNewRoutine(p => ({ ...p, setor: e.target.value }))} placeholder="Ex: Operacional" /></div>
                <Button onClick={createRoutine} className="w-full">Criar Rotina</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {routines.length === 0 ? (
        <Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhuma rotina cadastrada</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {routines.map(r => (
            <Card key={r.id} className="border-border hover:shadow-md transition-shadow cursor-pointer group" onClick={() => navigate(`/processes/${r.id}`)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-primary" />
                    {r.name}
                  </CardTitle>
                  {isAdmin && (
                    <button onClick={(e) => { e.stopPropagation(); deleteRoutine(r.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded transition-opacity">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {r.description && <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {r.setor && <Badge variant="outline" className="text-[10px]">{r.setor}</Badge>}
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />{getProfileName(r.created_by)}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(r.created_at), 'dd/MM/yyyy')}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
