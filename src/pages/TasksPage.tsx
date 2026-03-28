import { useEffect, useState, useRef } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Calendar, User, Pencil, Trash2, Send, Reply, MessageSquare, X, Upload, Download, FileText, Users, CheckSquare, Paperclip, Link, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type TaskStatus = 'backlog' | 'a_fazer' | 'em_andamento' | 'em_validacao' | 'concluido';
type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente';
type RecurrenceType = 'diario' | 'semanal' | 'mensal';

interface Task {
  id: string; title: string; description: string | null; status: TaskStatus; priority: TaskPriority;
  due_date: string | null; responsible_id: string | null; setor: string | null; created_at: string;
  created_by: string | null; is_recurring: boolean | null; recurrence_type: RecurrenceType | null;
  recurrence_config: any; checklist: any;
}

interface Profile { user_id: string; full_name: string; }
interface Message { id: string; sender_id: string; content: string; created_at: string; task_id: string | null; reply_to_id: string | null; }
interface TaskFile { id: string; file_name: string; file_url: string; file_type: string | null; file_size: number | null; uploaded_by: string | null; created_at: string; }

interface ChecklistItem { id: string; text: string; done: boolean; }

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

const emptyTask = {
  title: '', description: '', priority: 'media' as TaskPriority,
  status: 'a_fazer' as TaskStatus, due_date: '', responsible_id: '', setor: '',
  is_recurring: false, recurrence_type: 'diario' as RecurrenceType, recurrence_weekday: '1',
};

export default function TasksPage() {
  const { user, isAdmin, isGestor } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [taskDeps, setTaskDeps] = useState<{task_id: string; depends_on_task_id: string}[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({ ...emptyTask });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskMessages, setTaskMessages] = useState<Message[]>([]);
  const [taskFiles, setTaskFiles] = useState<TaskFile[]>([]);
  const [taskParticipants, setTaskParticipants] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [groupByUser, setGroupByUser] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [addParticipantId, setAddParticipantId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
      if (error) { console.error('Fetch tasks error:', error); return; }
      if (data) setTasks(data as Task[]);
    } catch (err) { console.error('Fetch tasks exception:', err); }
  };
  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name');
    if (data) setProfiles(data);
  };

  const fetchDeps = async () => {
    const { data } = await supabase.from('task_dependencies').select('task_id, depends_on_task_id');
    if (data) setTaskDeps(data);
  };

  useEffect(() => { fetchTasks(); fetchProfiles(); fetchDeps(); }, []);

  // Realtime for tasks
  useEffect(() => {
    const channel = supabase.channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchTasks())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_dependencies' }, () => fetchDeps())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Task detail data
  const fetchTaskMessages = async (taskId: string) => {
    const { data } = await supabase.from('messages').select('*').eq('task_id', taskId).order('created_at', { ascending: true });
    if (data) setTaskMessages(data as Message[]);
  };
  const fetchTaskFiles = async (taskId: string) => {
    const { data } = await supabase.from('task_files').select('*').eq('task_id', taskId).order('created_at', { ascending: false });
    if (data) setTaskFiles(data as TaskFile[]);
  };
  const fetchTaskParticipants = async (taskId: string) => {
    const { data } = await supabase.from('task_participants').select('user_id').eq('task_id', taskId);
    if (data) setTaskParticipants(data.map(p => p.user_id));
  };

  useEffect(() => {
    if (!selectedTask) return;
    fetchTaskMessages(selectedTask.id);
    fetchTaskFiles(selectedTask.id);
    fetchTaskParticipants(selectedTask.id);
    const channel = supabase.channel(`task-chat-${selectedTask.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `task_id=eq.${selectedTask.id}` }, (payload) => {
        setTaskMessages(prev => [...prev, payload.new as Message]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedTask?.id]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [taskMessages]);

  const createTask = async () => {
    if (!newTask.title.trim()) return;
    const recurrenceConfig = newTask.is_recurring && newTask.recurrence_type === 'semanal'
      ? { weekday: parseInt(newTask.recurrence_weekday) } : null;
    const { error } = await supabase.from('tasks').insert({
      title: newTask.title, description: newTask.description || null, priority: newTask.priority,
      status: newTask.status, due_date: newTask.due_date || null,
      responsible_id: newTask.responsible_id || user?.id || null, setor: newTask.setor || null,
      created_by: user?.id, is_recurring: newTask.is_recurring,
      recurrence_type: newTask.is_recurring ? newTask.recurrence_type : null, recurrence_config: recurrenceConfig,
    });
    if (error) {
      console.error('Create task error:', error);
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Tarefa criada!' });
      setNewTask({ ...emptyTask });
      setIsDialogOpen(false);
      fetchTasks();
      if (newTask.responsible_id && newTask.responsible_id !== user?.id) {
        await supabase.from('notifications').insert({
          user_id: newTask.responsible_id, type: 'task_assigned',
          title: 'Nova tarefa atribuída', message: newTask.title, link: '/tasks',
        });
      }
    }
  };

  const updateTask = async () => {
    if (!editingTask) return;
    const { error } = await supabase.from('tasks').update({
      title: editingTask.title, description: editingTask.description, priority: editingTask.priority,
      status: editingTask.status, due_date: editingTask.due_date, responsible_id: editingTask.responsible_id,
      setor: editingTask.setor, is_recurring: editingTask.is_recurring,
      recurrence_type: editingTask.recurrence_type, recurrence_config: editingTask.recurrence_config,
      completed_at: editingTask.status === 'concluido' ? new Date().toISOString() : null,
    }).eq('id', editingTask.id);
    if (!error) {
      toast({ title: 'Tarefa atualizada!' });
      setIsEditDialogOpen(false);
      if (editingTask.responsible_id && editingTask.responsible_id !== user?.id) {
        await supabase.from('notifications').insert({
          user_id: editingTask.responsible_id, type: 'task_updated',
          title: 'Tarefa atualizada', message: editingTask.title, link: '/tasks',
        });
      }
      setEditingTask(null);
      fetchTasks();
    } else {
      console.error('Update task error:', error);
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    }
  };

  const deleteTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      const { data: participants } = await supabase.from('task_participants').select('user_id').eq('task_id', taskId);
      const notifyUsers = new Set<string>();
      if (task.responsible_id && task.responsible_id !== user?.id) notifyUsers.add(task.responsible_id);
      participants?.forEach(p => { if (p.user_id !== user?.id) notifyUsers.add(p.user_id); });
      for (const uid of notifyUsers) {
        await supabase.from('notifications').insert({
          user_id: uid, type: 'task_deleted', title: 'Tarefa excluída', message: task.title, link: '/tasks',
        });
      }
    }
    await supabase.from('task_dependencies').delete().eq('task_id', taskId);
    await supabase.from('task_dependencies').delete().eq('depends_on_task_id', taskId);
    await supabase.from('event_tasks').delete().eq('task_id', taskId);
    await supabase.from('task_participants').delete().eq('task_id', taskId);
    await supabase.from('task_comments').delete().eq('task_id', taskId);
    await supabase.from('task_files').delete().eq('task_id', taskId);
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (!error) {
      toast({ title: 'Tarefa excluída!' });
      if (selectedTask?.id === taskId) setSelectedTask(null);
      fetchTasks();
    } else {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
  };

  const canEditTask = (task: Task) => isAdmin || isGestor || task.responsible_id === user?.id || task.created_by === user?.id;
  const canDeleteTask = (task: Task) => isAdmin || isGestor || task.created_by === user?.id;

  const updateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    const { error } = await supabase.from('tasks').update({
      status: newStatus, completed_at: newStatus === 'concluido' ? new Date().toISOString() : null,
    }).eq('id', taskId);
    if (!error) {
      await supabase.from('task_logs').insert({ task_id: taskId, user_id: user?.id, status: newStatus });
      // When completed, notify tasks that were waiting on this dependency
      if (newStatus === 'concluido') {
        const { data: dependents } = await supabase.from('task_dependencies').select('task_id').eq('depends_on_task_id', taskId);
        if (dependents) {
          for (const dep of dependents) {
            // Check if ALL deps of this task are now done
            const { data: allDeps } = await supabase.from('task_dependencies').select('depends_on_task_id').eq('task_id', dep.task_id);
            if (allDeps) {
              const depTaskIds = allDeps.map(d => d.depends_on_task_id).filter(id => id !== taskId);
              let allDone = true;
              if (depTaskIds.length > 0) {
                const { data: depTasks } = await supabase.from('tasks').select('id, status').in('id', depTaskIds);
                allDone = depTasks?.every(t => t.status === 'concluido') ?? true;
              }
              if (allDone) {
                // Get the task to notify its responsible
                const { data: unlockedTask } = await supabase.from('tasks').select('title, responsible_id').eq('id', dep.task_id).single();
                if (unlockedTask?.responsible_id) {
                  await supabase.from('notifications').insert({
                    user_id: unlockedTask.responsible_id, type: 'task_unblocked',
                    title: 'Tarefa liberada!', message: `"${unlockedTask.title}" foi desbloqueada e pode ser iniciada.`, link: '/tasks',
                  });
                }
              }
            }
          }
        }
      }
      fetchTasks();
    }
  };

  const getProfileName = (userId: string | null) => {
    if (!userId) return 'Sem responsável';
    return profiles.find(p => p.user_id === userId)?.full_name || 'Usuário';
  };

  // Checklist
  const getChecklist = (): ChecklistItem[] => {
    if (!selectedTask?.checklist) return [];
    try { return Array.isArray(selectedTask.checklist) ? selectedTask.checklist : []; }
    catch { return []; }
  };

  const updateChecklist = async (newChecklist: ChecklistItem[]) => {
    if (!selectedTask) return;
    await supabase.from('tasks').update({ checklist: newChecklist as any }).eq('id', selectedTask.id);
    setSelectedTask({ ...selectedTask, checklist: newChecklist });
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, checklist: newChecklist } : t));
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    const cl = getChecklist();
    cl.push({ id: `cl-${Date.now()}`, text: newChecklistItem.trim(), done: false });
    updateChecklist(cl);
    setNewChecklistItem('');
  };

  const toggleChecklistItem = (itemId: string) => {
    const cl = getChecklist().map(i => i.id === itemId ? { ...i, done: !i.done } : i);
    updateChecklist(cl);
  };

  const removeChecklistItem = (itemId: string) => {
    const cl = getChecklist().filter(i => i.id !== itemId);
    updateChecklist(cl);
  };

  // Participants
  const addTaskParticipant = async () => {
    if (!addParticipantId || !selectedTask) return;
    if (taskParticipants.includes(addParticipantId)) return;
    await supabase.from('task_participants').insert({ task_id: selectedTask.id, user_id: addParticipantId });
    await supabase.from('notifications').insert({
      user_id: addParticipantId, type: 'task_participant',
      title: 'Você foi adicionado a uma tarefa', message: selectedTask.title, link: '/tasks',
    });
    setAddParticipantId('');
    fetchTaskParticipants(selectedTask.id);
    toast({ title: 'Participante adicionado!' });
  };

  const removeTaskParticipant = async (userId: string) => {
    if (!selectedTask) return;
    await supabase.from('task_participants').delete().eq('task_id', selectedTask.id).eq('user_id', userId);
    fetchTaskParticipants(selectedTask.id);
  };

  // File upload
  const handleTaskFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = e.target.files;
    if (!uploadFiles || !selectedTask || !user) return;
    setIsUploading(true);
    let count = 0;
    for (const file of Array.from(uploadFiles)) {
      try {
        const filePath = `${selectedTask.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('task-files').upload(filePath, file);
        if (uploadError) continue;
        const { data: urlData } = supabase.storage.from('task-files').getPublicUrl(filePath);
        const { error: insertError } = await supabase.from('task_files').insert({
          task_id: selectedTask.id, file_name: file.name, file_url: urlData.publicUrl,
          file_type: file.type, file_size: file.size, uploaded_by: user.id,
        });
        if (!insertError) count++;
      } catch (err) { console.error(err); }
    }
    setIsUploading(false);
    if (count > 0) toast({ title: `${count} arquivo(s) enviado(s)!` });
    fetchTaskFiles(selectedTask.id);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteTaskFile = async (fileId: string) => {
    await supabase.from('task_files').delete().eq('id', fileId);
    if (selectedTask) fetchTaskFiles(selectedTask.id);
  };

  // Chat
  const handleMessageInput = (value: string) => {
    setNewMessage(value);
    const lastAt = value.lastIndexOf('@');
    if (lastAt >= 0) {
      const afterAt = value.slice(lastAt + 1);
      if (!afterAt.includes(' ') && afterAt.length > 0) setMentionSearch(afterAt.toLowerCase());
      else setMentionSearch(null);
    } else setMentionSearch(null);
  };

  const insertMention = (name: string) => {
    const lastAt = newMessage.lastIndexOf('@');
    if (lastAt >= 0) setNewMessage(newMessage.slice(0, lastAt) + `@${name} `);
    setMentionSearch(null);
  };

  const sendTaskMessage = async () => {
    if (!newMessage.trim() || !user || !selectedTask) return;
    await supabase.from('messages').insert({
      sender_id: user.id, content: newMessage.trim(), task_id: selectedTask.id,
      reply_to_id: replyTo?.id || null,
    });
    const mentions = newMessage.match(/@(\w+)/g);
    if (mentions) {
      for (const mention of mentions) {
        const name = mention.slice(1);
        const mentioned = profiles.find(p => p.full_name.toLowerCase().includes(name.toLowerCase()));
        if (mentioned && mentioned.user_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: mentioned.user_id, type: 'mention',
            title: `${getProfileName(user.id)} mencionou você`,
            message: newMessage.slice(0, 100), link: '/tasks',
          });
        }
      }
    }
    setNewMessage('');
    setReplyTo(null);
  };

  const mentionResults = mentionSearch ? profiles.filter(p => p.full_name.toLowerCase().includes(mentionSearch)) : [];
  const getMessageById = (msgId: string | null) => taskMessages.find(m => m.id === msgId);

  // Drag and drop
  const handleDragStart = (e: React.DragEvent, taskId: string) => { setDraggedTask(taskId); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e: React.DragEvent, colKey: string) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(colKey); };
  const handleDragLeave = () => setDragOverCol(null);
  const handleDrop = (e: React.DragEvent, colKey: TaskStatus) => { e.preventDefault(); setDragOverCol(null); if (draggedTask) { updateTaskStatus(draggedTask, colKey); setDraggedTask(null); } };

  const uniqueResponsibles = Array.from(new Set(tasks.map(t => t.responsible_id).filter(Boolean))) as string[];

  const openTaskDetail = (task: Task) => setSelectedTask(task);

  const checklist = selectedTask ? getChecklist() : [];
  const checklistProgress = checklist.length > 0 ? Math.round((checklist.filter(i => i.done).length / checklist.length) * 100) : 0;

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isTaskBlocked = (taskId: string) => {
    const deps = taskDeps.filter(d => d.task_id === taskId);
    if (deps.length === 0) return false;
    return deps.some(d => {
      const depTask = tasks.find(t => t.id === d.depends_on_task_id);
      return depTask && depTask.status !== 'concluido';
    });
  };

  const getTaskDepsCount = (taskId: string) => taskDeps.filter(d => d.task_id === taskId).length;

  const renderTaskCard = (task: Task) => {
    const blocked = isTaskBlocked(task.id);
    const depsCount = getTaskDepsCount(task.id);
    return (
    <Card
      key={task.id}
      draggable
      onDragStart={(e) => handleDragStart(e, task.id)}
      className={`border-border hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${draggedTask === task.id ? 'opacity-50' : ''}`}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <button onClick={() => openTaskDetail(task)} className="text-sm font-medium text-foreground flex-1 text-left hover:text-primary transition-colors">
            {blocked && <Lock className="h-3 w-3 inline text-destructive mr-1" />}
            {task.title}
          </button>
          <div className="flex items-center gap-0.5 shrink-0">
            {depsCount > 0 && <Badge variant="outline" className="text-[10px]"><Link className="h-2.5 w-2.5" /></Badge>}
            {task.is_recurring && <Badge variant="outline" className="text-[10px]">🔁</Badge>}
            {canEditTask(task) && (
              <button onClick={(e) => { e.stopPropagation(); setEditingTask({ ...task }); setIsEditDialogOpen(true); }} className="p-1 hover:bg-accent rounded">
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            {canDeleteTask(task) && (
              <button onClick={(e) => { e.stopPropagation(); if (confirm('Excluir esta tarefa?')) deleteTask(task.id); }} className="p-1 hover:bg-accent rounded">
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            )}
          </div>
        </div>
        {blocked && <p className="text-[10px] text-destructive font-medium">🔒 Bloqueada por dependência</p>}
        {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
        <div className="flex items-center justify-between">
          <Badge className={priorityColors[task.priority]} variant="outline">{task.priority}</Badge>
          {task.due_date && (
            <span className={`flex items-center gap-1 text-xs ${new Date(task.due_date) < new Date() && task.status !== 'concluido' ? 'text-destructive' : 'text-muted-foreground'}`}>
              <Calendar className="h-3 w-3" />{format(new Date(task.due_date), 'dd/MM')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <User className="h-3 w-3" />{getProfileName(task.responsible_id)}
        </div>
      </CardContent>
    </Card>
  );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <Button variant={viewMode === 'kanban' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('kanban')}>Kanban</Button>
          <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('list')}>Lista</Button>
          {isAdmin && viewMode === 'kanban' && (
            <Button variant={groupByUser ? 'secondary' : 'outline'} size="sm" onClick={() => setGroupByUser(!groupByUser)}>
              <User className="h-3 w-3 mr-1" />Por Pessoa
            </Button>
          )}
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Tarefa</Button></DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Título *</Label><Input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Nome da tarefa" /></div>
              <div><Label>Descrição</Label><Textarea value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Prioridade</Label><Select value={newTask.priority} onValueChange={v => setNewTask(p => ({ ...p, priority: v as TaskPriority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent></Select></div>
                <div><Label>Status</Label><Select value={newTask.status} onValueChange={v => setNewTask(p => ({ ...p, status: v as TaskStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Prazo</Label><Input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} /></div>
                <div><Label>Setor</Label><Input value={newTask.setor} onChange={e => setNewTask(p => ({ ...p, setor: e.target.value }))} placeholder="Ex: TI" /></div>
              </div>
              <div><Label>Responsável</Label><Select value={newTask.responsible_id} onValueChange={v => setNewTask(p => ({ ...p, responsible_id: v }))}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div><Label className="text-sm">Tarefa Recorrente</Label><p className="text-xs text-muted-foreground">Repete automaticamente</p></div>
                <Switch checked={newTask.is_recurring} onCheckedChange={v => setNewTask(p => ({ ...p, is_recurring: v }))} />
              </div>
              {newTask.is_recurring && (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div><Label>Frequência</Label><Select value={newTask.recurrence_type} onValueChange={v => setNewTask(p => ({ ...p, recurrence_type: v as RecurrenceType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="diario">Diário</SelectItem><SelectItem value="semanal">Semanal</SelectItem><SelectItem value="mensal">Mensal</SelectItem></SelectContent></Select></div>
                  {newTask.recurrence_type === 'semanal' && (
                    <div><Label>Dia da Semana</Label><Select value={newTask.recurrence_weekday} onValueChange={v => setNewTask(p => ({ ...p, recurrence_weekday: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WEEK_DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent></Select></div>
                  )}
                </div>
              )}
              <Button onClick={createTask} className="w-full">Criar Tarefa</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban */}
      {viewMode === 'kanban' && !groupByUser && (
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin">
          {columns.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key);
            return (
              <div key={col.key} className={`min-w-[260px] flex-shrink-0 rounded-lg transition-colors ${dragOverCol === col.key ? 'bg-accent/30' : ''}`}
                onDragOver={(e) => handleDragOver(e, col.key)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, col.key)}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                  <span className="text-sm font-semibold text-foreground">{col.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{colTasks.length}</span>
                </div>
                <div className="space-y-2 min-h-[100px]">{colTasks.map(renderTaskCard)}</div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'kanban' && groupByUser && (
        <div className="space-y-6 pb-4">
          {uniqueResponsibles.map(userId => {
            const userName = getProfileName(userId);
            const userTasks = tasks.filter(t => t.responsible_id === userId);
            return (
              <div key={userId}>
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{userName.charAt(0).toUpperCase()}</div>
                  {userName}
                  <span className="text-xs text-muted-foreground font-normal">({userTasks.length})</span>
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {columns.map(col => {
                    const colTasks = userTasks.filter(t => t.status === col.key);
                    return (
                      <div key={col.key} className={`min-w-[220px] flex-shrink-0 rounded-lg transition-colors ${dragOverCol === col.key ? 'bg-accent/30' : ''}`}
                        onDragOver={(e) => handleDragOver(e, col.key)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, col.key)}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`h-2 w-2 rounded-full ${col.color}`} />
                          <span className="text-xs font-medium text-foreground">{col.label}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">{colTasks.length}</span>
                        </div>
                        <div className="space-y-2 min-h-[60px]">{colTasks.map(renderTaskCard)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List */}
      {viewMode === 'list' && (
        <Card className="border-border">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground p-8 text-center">Nenhuma tarefa encontrada</p>
              ) : tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 p-3 hover:bg-accent/30 transition-colors">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${columns.find(c => c.key === task.status)?.color}`} />
                  <button onClick={() => openTaskDetail(task)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{getProfileName(task.responsible_id)}</p>
                  </button>
                  <Badge className={priorityColors[task.priority]} variant="outline">{task.priority}</Badge>
                  {task.due_date && (
                    <span className={`text-xs shrink-0 ${new Date(task.due_date) < new Date() && task.status !== 'concluido' ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {format(new Date(task.due_date), 'dd/MM')}
                    </span>
                  )}
                  <Select value={task.status} onValueChange={v => updateTaskStatus(task.id, v as TaskStatus)}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="flex gap-0.5 shrink-0">
                    {canEditTask(task) && (
                      <button onClick={() => { setEditingTask({ ...task }); setIsEditDialogOpen(true); }} className="p-1.5 hover:bg-accent rounded">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                    {canDeleteTask(task) && (
                      <button onClick={() => { if (confirm('Excluir?')) deleteTask(task.id); }} className="p-1.5 hover:bg-accent rounded">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Task Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(v) => { setIsEditDialogOpen(v); if (!v) setEditingTask(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Tarefa</DialogTitle></DialogHeader>
          {editingTask && (
            <div className="space-y-4">
              <div><Label>Título *</Label><Input value={editingTask.title} onChange={e => setEditingTask(p => p ? { ...p, title: e.target.value } : null)} /></div>
              <div><Label>Descrição</Label><Textarea value={editingTask.description || ''} onChange={e => setEditingTask(p => p ? { ...p, description: e.target.value } : null)} rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Prioridade</Label><Select value={editingTask.priority} onValueChange={v => setEditingTask(p => p ? { ...p, priority: v as TaskPriority } : null)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent></Select></div>
                <div><Label>Status</Label><Select value={editingTask.status} onValueChange={v => setEditingTask(p => p ? { ...p, status: v as TaskStatus } : null)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Prazo</Label><Input type="date" value={editingTask.due_date?.split('T')[0] || ''} onChange={e => setEditingTask(p => p ? { ...p, due_date: e.target.value } : null)} /></div>
                <div><Label>Setor</Label><Input value={editingTask.setor || ''} onChange={e => setEditingTask(p => p ? { ...p, setor: e.target.value } : null)} /></div>
              </div>
              <div><Label>Responsável</Label><Select value={editingTask.responsible_id || ''} onValueChange={v => setEditingTask(p => p ? { ...p, responsible_id: v } : null)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent></Select></div>
              <Button onClick={updateTask} className="w-full">Salvar Alterações</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(v) => { if (!v) { setSelectedTask(null); setTaskMessages([]); setTaskFiles([]); setTaskParticipants([]); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
          {selectedTask && (
            <>
              <div className="px-4 pt-4 pb-2 border-b border-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-foreground">{selectedTask.title}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={priorityColors[selectedTask.priority]} variant="outline">{selectedTask.priority}</Badge>
                      <Badge variant="secondary" className="text-xs">{columns.find(c => c.key === selectedTask.status)?.label}</Badge>
                      <span className="text-xs text-muted-foreground">{getProfileName(selectedTask.responsible_id)}</span>
                      {selectedTask.due_date && (
                        <span className={`text-xs ${new Date(selectedTask.due_date) < new Date() && selectedTask.status !== 'concluido' ? 'text-destructive' : 'text-muted-foreground'}`}>
                          <Calendar className="h-3 w-3 inline mr-0.5" />{format(new Date(selectedTask.due_date), 'dd/MM/yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {canEditTask(selectedTask) && (
                      <button onClick={() => { setEditingTask({ ...selectedTask }); setIsEditDialogOpen(true); setSelectedTask(null); }} className="p-1.5 hover:bg-accent rounded">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                    {canDeleteTask(selectedTask) && (
                      <button onClick={() => { if (confirm('Excluir?')) deleteTask(selectedTask.id); }} className="p-1.5 hover:bg-accent rounded">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
                {selectedTask.description && <p className="text-xs text-muted-foreground mt-2">{selectedTask.description}</p>}
              </div>

              <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="mx-4 mt-2 grid grid-cols-4">
                  <TabsTrigger value="chat" className="text-[10px]"><MessageSquare className="h-3 w-3 mr-1" />Chat</TabsTrigger>
                  <TabsTrigger value="checklist" className="text-[10px]"><CheckSquare className="h-3 w-3 mr-1" />Checklist</TabsTrigger>
                  <TabsTrigger value="files" className="text-[10px]"><Paperclip className="h-3 w-3 mr-1" />Arquivos</TabsTrigger>
                  <TabsTrigger value="participants" className="text-[10px]"><Users className="h-3 w-3 mr-1" />Equipe</TabsTrigger>
                </TabsList>

                {/* Chat Tab */}
                <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden m-0 p-0">
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin min-h-[200px]">
                    {taskMessages.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />Nenhuma mensagem
                      </p>
                    )}
                    {taskMessages.map(msg => {
                      const repliedMsg = msg.reply_to_id ? getMessageById(msg.reply_to_id) : null;
                      return (
                        <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.sender_id === user?.id ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'}`}>
                            {msg.sender_id !== user?.id && <p className="text-[10px] font-medium mb-0.5 opacity-70">{getProfileName(msg.sender_id)}</p>}
                            {repliedMsg && (
                              <div className={`text-[10px] border-l-2 pl-2 mb-1 ${msg.sender_id === user?.id ? 'border-primary-foreground/40 opacity-70' : 'border-primary/40 text-muted-foreground'}`}>
                                <span className="font-medium">{getProfileName(repliedMsg.sender_id)}</span>
                                <p className="truncate">{repliedMsg.content}</p>
                              </div>
                            )}
                            <p className="whitespace-pre-wrap">{msg.content.split(/(@\w+)/g).map((part, i) =>
                              part.startsWith('@') ? <span key={i} className="font-semibold">{part}</span> : part
                            )}</p>
                            <div className="flex items-center justify-between mt-1">
                              <p className={`text-[10px] ${msg.sender_id === user?.id ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{format(new Date(msg.created_at), 'HH:mm')}</p>
                              <button onClick={() => setReplyTo(msg)} className={`text-[10px] hover:underline ${msg.sender_id === user?.id ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                <Reply className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="border-t border-border">
                    {replyTo && (
                      <div className="px-3 pt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Reply className="h-3 w-3" /><span className="truncate flex-1">Respondendo a <strong>{getProfileName(replyTo.sender_id)}</strong></span>
                        <button onClick={() => setReplyTo(null)} className="text-foreground"><X className="h-3 w-3" /></button>
                      </div>
                    )}
                    {mentionResults.length > 0 && (
                      <div className="px-3 pt-2 flex gap-1 flex-wrap">
                        {mentionResults.slice(0, 5).map(p => (
                          <button key={p.user_id} onClick={() => insertMention(p.full_name)} className="text-xs bg-accent text-accent-foreground rounded px-2 py-1 hover:bg-accent/80">@{p.full_name}</button>
                        ))}
                      </div>
                    )}
                    <div className="p-3 flex gap-2">
                      <Input value={newMessage} onChange={e => handleMessageInput(e.target.value)} placeholder="Mensagem... (@ para mencionar)" onKeyDown={e => e.key === 'Enter' && sendTaskMessage()} className="flex-1" />
                      <Button onClick={sendTaskMessage} size="icon"><Send className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </TabsContent>

                {/* Checklist Tab */}
                <TabsContent value="checklist" className="flex-1 overflow-y-auto p-4 m-0 space-y-3">
                  {checklist.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${checklistProgress}%` }} />
                      </div>
                      <span>{checklistProgress}%</span>
                    </div>
                  )}
                  {checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-2">
                      <Checkbox checked={item.done} onCheckedChange={() => toggleChecklistItem(item.id)} />
                      <span className={`text-sm flex-1 ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{item.text}</span>
                      <button onClick={() => removeChecklistItem(item.id)} className="p-1 hover:bg-accent rounded">
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input value={newChecklistItem} onChange={e => setNewChecklistItem(e.target.value)} placeholder="Novo item..." onKeyDown={e => e.key === 'Enter' && addChecklistItem()} className="flex-1" />
                    <Button onClick={addChecklistItem} size="sm" variant="outline"><Plus className="h-4 w-4" /></Button>
                  </div>
                </TabsContent>

                {/* Files Tab */}
                <TabsContent value="files" className="flex-1 overflow-y-auto p-4 m-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{taskFiles.length} arquivo(s)</p>
                    <div>
                      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleTaskFileUpload} />
                      <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        <Upload className="h-4 w-4 mr-1" />{isUploading ? 'Enviando...' : 'Upload'}
                      </Button>
                    </div>
                  </div>
                  {taskFiles.map(f => {
                    const isImage = f.file_type?.startsWith('image/');
                    return (
                      <div key={f.id} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                        {isImage ? (
                          <img src={f.file_url} alt={f.file_name} className="h-10 w-10 rounded object-cover shrink-0" />
                        ) : (
                          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate block">{f.file_name}</a>
                          <p className="text-[10px] text-muted-foreground">{formatFileSize(f.file_size)}</p>
                        </div>
                        <a href={f.file_url} download target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 text-muted-foreground" /></a>
                        <button onClick={() => deleteTaskFile(f.id)} className="p-1 hover:bg-accent rounded"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                      </div>
                    );
                  })}
                </TabsContent>

                {/* Participants Tab */}
                <TabsContent value="participants" className="flex-1 overflow-y-auto p-4 m-0 space-y-3">
                  <div className="flex gap-2">
                    <Select value={addParticipantId} onValueChange={setAddParticipantId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Adicionar participante..." /></SelectTrigger>
                      <SelectContent>{profiles.filter(p => !taskParticipants.includes(p.user_id)).map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button onClick={addTaskParticipant} size="sm"><Plus className="h-4 w-4" /></Button>
                  </div>
                  {/* Show responsible */}
                  {selectedTask.responsible_id && (
                    <div className="flex items-center gap-2 p-2 rounded-lg border border-border">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {getProfileName(selectedTask.responsible_id).charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-foreground flex-1">{getProfileName(selectedTask.responsible_id)}</span>
                      <Badge variant="outline" className="text-[10px]">Responsável</Badge>
                    </div>
                  )}
                  {taskParticipants.map(uid => (
                    <div key={uid} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                        {getProfileName(uid).charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-foreground flex-1">{getProfileName(uid)}</span>
                      <button onClick={() => removeTaskParticipant(uid)} className="p-1 hover:bg-accent rounded">
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  {taskParticipants.length === 0 && !selectedTask.responsible_id && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum participante</p>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
