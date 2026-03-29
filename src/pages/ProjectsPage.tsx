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
import { Plus, Calendar, Users, Pencil, Trash2, FolderKanban } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Project {
  id: string;
  name: string;
  description: string | null;
  event_date: string | null;
  start_date: string | null;
  end_date: string | null;
  responsible_id: string | null;
  created_at: string;
  status: string;
}

interface Profile {
  user_id: string;
  full_name: string;
}

const PROJECT_STATUSES = [
  { key: 'em_andamento', label: 'Em Andamento', color: 'bg-primary/15 text-primary border-primary/20' },
  { key: 'aguardando', label: 'Aguardando', color: 'bg-warning/15 text-warning border-warning/20' },
  { key: 'concluido', label: 'Concluído', color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20' },
];

export default function ProjectsPage() {
  const { user, isAdmin, isGestor } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [newProject, setNewProject] = useState({ name: '', description: '', start_date: '', end_date: '', responsible_id: '', status: 'em_andamento' });
  const [kanbanView, setKanbanView] = useState(true);

  const fetchProjects = async () => {
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data.map((d: any) => ({ ...d, status: d.status || 'em_andamento' })) as Project[]);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name');
    if (data) setProfiles(data);
  };

  useEffect(() => { fetchProjects(); fetchProfiles(); }, []);

  const createProject = async () => {
    if (!newProject.name.trim()) return;
    const { error } = await supabase.from('events').insert({
      name: newProject.name,
      description: newProject.description || null,
      start_date: newProject.start_date || null,
      end_date: newProject.end_date || null,
      event_date: newProject.start_date || null,
      responsible_id: newProject.responsible_id || user?.id,
      created_by: user?.id,
      status: newProject.status,
    });
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível criar o projeto.', variant: 'destructive' });
    } else {
      toast({ title: 'Projeto criado!' });
      setNewProject({ name: '', description: '', start_date: '', end_date: '', responsible_id: '', status: 'em_andamento' });
      setIsDialogOpen(false);
      fetchProjects();
    }
  };

  const updateProject = async () => {
    if (!editingProject) return;
    const { error } = await supabase.from('events').update({
      name: editingProject.name,
      description: editingProject.description,
      start_date: editingProject.start_date,
      end_date: editingProject.end_date,
      event_date: editingProject.start_date || editingProject.event_date,
      responsible_id: editingProject.responsible_id,
      status: editingProject.status,
    }).eq('id', editingProject.id);
    if (!error) {
      toast({ title: 'Projeto atualizado!' });
      setIsEditDialogOpen(false);
      setEditingProject(null);
      fetchProjects();
    } else {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    }
  };

  const updateProjectStatus = async (projectId: string, newStatus: string) => {
    await supabase.from('events').update({ status: newStatus }).eq('id', projectId);
    fetchProjects();
  };

  const deleteProject = async (proj: Project) => {
    if (!confirm(`Excluir o projeto "${proj.name}"?`)) return;
    await supabase.from('event_tasks').delete().eq('event_id', proj.id);
    await supabase.from('event_participants').delete().eq('event_id', proj.id);
    await supabase.from('event_files').delete().eq('event_id', proj.id);
    const { error } = await supabase.from('events').delete().eq('id', proj.id);
    if (!error) {
      toast({ title: 'Projeto excluído!' });
      fetchProjects();
    } else {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
  };

  const getProfileName = (userId: string | null) => {
    if (!userId) return '—';
    return profiles.find(p => p.user_id === userId)?.full_name || 'Usuário';
  };

  const formatDateRange = (proj: Project) => {
    const start = proj.start_date || proj.event_date;
    const end = proj.end_date;
    if (!start && !end) return null;
    const startStr = start ? format(new Date(start), 'dd/MM/yyyy') : '';
    const endStr = end ? format(new Date(end), 'dd/MM/yyyy') : '';
    if (startStr && endStr && startStr !== endStr) return `${startStr} → ${endStr}`;
    return startStr || endStr;
  };

  const getStatusInfo = (status: string) => PROJECT_STATUSES.find(s => s.key === status) || PROJECT_STATUSES[0];

  const renderProjectCard = (proj: Project) => {
    const statusInfo = getStatusInfo(proj.status);
    return (
      <Card key={proj.id} className="border-border hover:shadow-md transition-shadow cursor-pointer group" onClick={() => navigate(`/projects/${proj.id}`)}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-primary" />
              {proj.name}
            </CardTitle>
            {(isAdmin || isGestor) && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); setEditingProject({ ...proj }); setIsEditDialogOpen(true); }} className="p-1 hover:bg-accent rounded">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteProject(proj); }} className="p-1 hover:bg-accent rounded">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {proj.description && <p className="text-sm text-muted-foreground line-clamp-2">{proj.description}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={statusInfo.color} variant="outline">{statusInfo.label}</Badge>
            {formatDateRange(proj) && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" />{formatDateRange(proj)}</span>
            )}
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />{getProfileName(proj.responsible_id)}</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 items-center">
          <h2 className="text-lg font-semibold text-foreground">Projetos</h2>
          <Button variant={kanbanView ? 'default' : 'outline'} size="sm" onClick={() => setKanbanView(true)}>Kanban</Button>
          <Button variant={!kanbanView ? 'default' : 'outline'} size="sm" onClick={() => setKanbanView(false)}>Cartões</Button>
        </div>
        {(isAdmin || isGestor) && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Projeto</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Projeto</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Nome *</Label><Input value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Wine Tour Sunset" /></div>
                <div><Label>Descrição</Label><Textarea value={newProject.description} onChange={e => setNewProject(p => ({ ...p, description: e.target.value }))} rows={3} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Data Início</Label><Input type="date" value={newProject.start_date} onChange={e => setNewProject(p => ({ ...p, start_date: e.target.value }))} /></div>
                  <div><Label>Data Fim</Label><Input type="date" value={newProject.end_date} onChange={e => setNewProject(p => ({ ...p, end_date: e.target.value }))} /></div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={newProject.status} onValueChange={v => setNewProject(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PROJECT_STATUSES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Responsável</Label>
                  <Select value={newProject.responsible_id} onValueChange={v => setNewProject(p => ({ ...p, responsible_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={createProject} className="w-full">Criar Projeto</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {projects.length === 0 ? (
        <Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum projeto cadastrado</CardContent></Card>
      ) : kanbanView ? (
        /* Kanban View */
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {PROJECT_STATUSES.map(status => {
            const statusProjects = projects.filter(p => (p.status || 'em_andamento') === status.key);
            return (
              <div key={status.key} className="min-w-[280px] flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className={status.color} variant="outline">{status.label}</Badge>
                  <span className="text-xs text-muted-foreground">{statusProjects.length}</span>
                </div>
                <div className="space-y-3">
                  {statusProjects.map(renderProjectCard)}
                  {statusProjects.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">Nenhum projeto</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Card Grid View */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(renderProjectCard)}
        </div>
      )}

      {/* Edit Project Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(v) => { setIsEditDialogOpen(v); if (!v) setEditingProject(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Projeto</DialogTitle></DialogHeader>
          {editingProject && (
            <div className="space-y-4">
              <div><Label>Nome *</Label><Input value={editingProject.name} onChange={e => setEditingProject(p => p ? { ...p, name: e.target.value } : null)} /></div>
              <div><Label>Descrição</Label><Textarea value={editingProject.description || ''} onChange={e => setEditingProject(p => p ? { ...p, description: e.target.value } : null)} rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data Início</Label><Input type="date" value={editingProject.start_date?.split('T')[0] || editingProject.event_date?.split('T')[0] || ''} onChange={e => setEditingProject(p => p ? { ...p, start_date: e.target.value } : null)} /></div>
                <div><Label>Data Fim</Label><Input type="date" value={editingProject.end_date?.split('T')[0] || ''} onChange={e => setEditingProject(p => p ? { ...p, end_date: e.target.value } : null)} /></div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editingProject.status || 'em_andamento'} onValueChange={v => setEditingProject(p => p ? { ...p, status: v } : null)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_STATUSES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Responsável</Label>
                <Select value={editingProject.responsible_id || ''} onValueChange={v => setEditingProject(p => p ? { ...p, responsible_id: v } : null)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={updateProject} className="w-full">Salvar Alterações</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
