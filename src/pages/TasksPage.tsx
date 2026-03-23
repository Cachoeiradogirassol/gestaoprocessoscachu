import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Calendar, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type TaskStatus = 'backlog' | 'a_fazer' | 'em_andamento' | 'em_validacao' | 'concluido';
type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente';
type RecurrenceType = 'diario' | 'semanal' | 'mensal';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  responsible_id: string | null;
  setor: string | null;
  created_at: string;
  is_recurring: boolean | null;
  recurrence_type: RecurrenceType | null;
  recurrence_config: any;
}

interface Profile {
  user_id: string;
  full_name: string;
}

const columns: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'backlog', label: 'Backlog', color: 'bg-status-backlog' },
  { key: 'a_fazer', label: 'A Fazer', color: 'bg-status-todo' },
  { key: 'em_andamento', label: 'Em Andamento', color: 'bg-status-progress' },
  { key: 'em_validacao', label: 'Validação', color: 'bg-status-review' },
  { key: 'concluido', label: 'Concluído', color: 'bg-status-done' },
];

const priorityColors: Record<string, string> = {
  baixa: 'bg-priority-low/15 text-priority-low border-priority-low/20',
  media: 'bg-priority-medium/15 text-priority-medium border-priority-medium/20',
  alta: 'bg-priority-high/15 text-priority-high border-priority-high/20',
  urgente: 'bg-priority-urgent/15 text-priority-urgent border-priority-urgent/20',
};

const WEEK_DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    title: '', description: '', priority: 'media' as TaskPriority,
    status: 'a_fazer' as TaskStatus, due_date: '', responsible_id: '', setor: '',
    is_recurring: false, recurrence_type: 'diario' as RecurrenceType,
    recurrence_weekday: '1',
  });

  const fetchTasks = async () => {
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
    if (data) setTasks(data as Task[]);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name');
    if (data) setProfiles(data);
  };

  useEffect(() => { fetchTasks(); fetchProfiles(); }, []);

  const createTask = async () => {
    if (!newTask.title.trim()) return;
    
    const recurrenceConfig = newTask.is_recurring && newTask.recurrence_type === 'semanal'
      ? { weekday: parseInt(newTask.recurrence_weekday) }
      : null;

    const { error } = await supabase.from('tasks').insert({
      title: newTask.title,
      description: newTask.description || null,
      priority: newTask.priority,
      status: newTask.status,
      due_date: newTask.due_date || null,
      responsible_id: newTask.responsible_id || user?.id || null,
      setor: newTask.setor || null,
      created_by: user?.id,
      is_recurring: newTask.is_recurring,
      recurrence_type: newTask.is_recurring ? newTask.recurrence_type : null,
      recurrence_config: recurrenceConfig,
    });

    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível criar a tarefa.', variant: 'destructive' });
    } else {
      toast({ title: 'Tarefa criada!' });
      setNewTask({ title: '', description: '', priority: 'media', status: 'a_fazer', due_date: '', responsible_id: '', setor: '', is_recurring: false, recurrence_type: 'diario', recurrence_weekday: '1' });
      setIsDialogOpen(false);
      fetchTasks();
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    const { error } = await supabase.from('tasks').update({ 
      status: newStatus,
      completed_at: newStatus === 'concluido' ? new Date().toISOString() : null,
    }).eq('id', taskId);

    if (!error) {
      await supabase.from('task_logs').insert({ task_id: taskId, user_id: user?.id, status: newStatus });
      fetchTasks();
    }
  };

  const getProfileName = (userId: string | null) => {
    if (!userId) return 'Sem responsável';
    return profiles.find(p => p.user_id === userId)?.full_name || 'Usuário';
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(colKey);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = (e: React.DragEvent, colKey: TaskStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    if (draggedTask) {
      updateTaskStatus(draggedTask, colKey);
      setDraggedTask(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant={viewMode === 'kanban' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('kanban')}>Kanban</Button>
          <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('list')}>Lista</Button>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Tarefa</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Título *</Label>
                <Input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Nome da tarefa" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} placeholder="Detalhes..." rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prioridade</Label>
                  <Select value={newTask.priority} onValueChange={v => setNewTask(p => ({ ...p, priority: v as TaskPriority }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={newTask.status} onValueChange={v => setNewTask(p => ({ ...p, status: v as TaskStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prazo</Label>
                  <Input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} />
                </div>
                <div>
                  <Label>Setor</Label>
                  <Input value={newTask.setor} onChange={e => setNewTask(p => ({ ...p, setor: e.target.value }))} placeholder="Ex: TI" />
                </div>
              </div>
              <div>
                <Label>Responsável</Label>
                <Select value={newTask.responsible_id} onValueChange={v => setNewTask(p => ({ ...p, responsible_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Recurring task */}
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm">Tarefa Recorrente</Label>
                  <p className="text-xs text-muted-foreground">Repete automaticamente</p>
                </div>
                <Switch checked={newTask.is_recurring} onCheckedChange={v => setNewTask(p => ({ ...p, is_recurring: v }))} />
              </div>
              {newTask.is_recurring && (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div>
                    <Label>Frequência</Label>
                    <Select value={newTask.recurrence_type} onValueChange={v => setNewTask(p => ({ ...p, recurrence_type: v as RecurrenceType }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="diario">Diário</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newTask.recurrence_type === 'semanal' && (
                    <div>
                      <Label>Dia da Semana</Label>
                      <Select value={newTask.recurrence_weekday} onValueChange={v => setNewTask(p => ({ ...p, recurrence_weekday: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WEEK_DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <Button onClick={createTask} className="w-full">Criar Tarefa</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban View with Drag & Drop */}
      {viewMode === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin">
          {columns.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key);
            return (
              <div
                key={col.key}
                className={`min-w-[260px] flex-shrink-0 rounded-lg transition-colors ${dragOverCol === col.key ? 'bg-accent/30' : ''}`}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                  <span className="text-sm font-semibold text-foreground">{col.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{colTasks.length}</span>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {colTasks.map(task => (
                    <Card
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      className={`border-border hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${draggedTask === task.id ? 'opacity-50' : ''}`}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground flex-1">{task.title}</p>
                          {task.is_recurring && <Badge variant="outline" className="text-[10px] shrink-0">🔁</Badge>}
                        </div>
                        {task.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <Badge className={priorityColors[task.priority]} variant="outline">{task.priority}</Badge>
                          {task.due_date && (
                            <span className={`flex items-center gap-1 text-xs ${new Date(task.due_date) < new Date() && task.status !== 'concluido' ? 'text-destructive' : 'text-muted-foreground'}`}>
                              <Calendar className="h-3 w-3" />
                              {format(new Date(task.due_date), 'dd/MM')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {getProfileName(task.responsible_id)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <Card className="border-border">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground p-8 text-center">Nenhuma tarefa encontrada</p>
              ) : (
                tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-3 hover:bg-accent/30 transition-colors">
                    <div className={`h-2 w-2 rounded-full ${columns.find(c => c.key === task.status)?.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                        {task.is_recurring && <Badge variant="outline" className="text-[10px]">🔁</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{getProfileName(task.responsible_id)}</p>
                    </div>
                    <Badge className={priorityColors[task.priority]} variant="outline">{task.priority}</Badge>
                    {task.due_date && (
                      <span className={`text-xs ${new Date(task.due_date) < new Date() && task.status !== 'concluido' ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {format(new Date(task.due_date), 'dd/MM')}
                      </span>
                    )}
                    <Select value={task.status} onValueChange={v => updateTaskStatus(task.id, v as TaskStatus)}>
                      <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
