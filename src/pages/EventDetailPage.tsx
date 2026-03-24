import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Plus, Send, BarChart3, Users, Calendar, MessageSquare, FileText, Upload, Trash2, Reply } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type TaskStatus = 'backlog' | 'a_fazer' | 'em_andamento' | 'em_validacao' | 'concluido';
type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente';

interface EventData { id: string; name: string; description: string | null; event_date: string | null; responsible_id: string | null; created_by: string | null; }
interface Task { id: string; title: string; status: TaskStatus; priority: TaskPriority; due_date: string | null; responsible_id: string | null; setor: string | null; description: string | null; }
interface Profile { user_id: string; full_name: string; }
interface Message { id: string; sender_id: string; content: string; created_at: string; event_id: string | null; reply_to_id: string | null; }
interface EventFile { id: string; file_name: string; file_url: string; file_type: string | null; file_size: number | null; uploaded_by: string | null; created_at: string; }

const EVENT_SECTORS = ['Estratégico', 'Financeiro', 'Logística', 'Operacional'];
const statusLabels: Record<string, string> = { backlog: 'Backlog', a_fazer: 'A Fazer', em_andamento: 'Em Andamento', em_validacao: 'Validação', concluido: 'Concluído' };
const priorityColors: Record<string, string> = { baixa: 'bg-muted-foreground/15 text-muted-foreground', media: 'bg-primary/15 text-primary', alta: 'bg-warning/15 text-warning', urgente: 'bg-destructive/15 text-destructive' };

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, isGestor } = useAuth();
  const { toast } = useToast();

  const [event, setEvent] = useState<EventData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<EventFile[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'media' as TaskPriority, due_date: '', responsible_id: '', setor: EVENT_SECTORS[0] });
  const [filterSetor, setFilterSetor] = useState<string>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEvent = async () => { if (!id) return; const { data } = await supabase.from('events').select('*').eq('id', id).single(); if (data) setEvent(data as EventData); };
  const fetchTasks = async () => {
    if (!id) return;
    const { data: etData } = await supabase.from('event_tasks').select('task_id').eq('event_id', id);
    if (!etData || etData.length === 0) { setTasks([]); return; }
    const { data } = await supabase.from('tasks').select('*').in('id', etData.map(et => et.task_id));
    if (data) setTasks(data as Task[]);
  };
  const fetchMessages = async () => {
    if (!id) return;
    const { data } = await supabase.from('messages').select('*').eq('event_id', id).order('created_at', { ascending: true });
    if (data) setMessages(data as Message[]);
  };
  const fetchProfiles = async () => { const { data } = await supabase.from('profiles').select('user_id, full_name'); if (data) setProfiles(data); };
  const fetchFiles = async () => {
    if (!id) return;
    const { data } = await supabase.from('event_files').select('*').eq('event_id', id).order('created_at', { ascending: false });
    if (data) setFiles(data as EventFile[]);
  };

  useEffect(() => { fetchEvent(); fetchTasks(); fetchMessages(); fetchProfiles(); fetchFiles(); }, [id]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`event-chat-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `event_id=eq.${id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const createTask = async () => {
    if (!newTask.title.trim() || !id) return;
    const { data, error } = await supabase.from('tasks').insert({
      title: newTask.title, description: newTask.description || null, priority: newTask.priority,
      status: 'a_fazer' as TaskStatus, due_date: newTask.due_date || null,
      responsible_id: newTask.responsible_id || user?.id || null, setor: newTask.setor || null, created_by: user?.id,
    }).select('id').single();
    if (data && !error) {
      await supabase.from('event_tasks').insert({ event_id: id, task_id: data.id });
      toast({ title: 'Tarefa criada no evento!' });
      setNewTask({ title: '', description: '', priority: 'media', due_date: '', responsible_id: '', setor: EVENT_SECTORS[0] });
      setIsTaskDialogOpen(false);
      fetchTasks();
    } else {
      toast({ title: 'Erro', description: 'Não foi possível criar.', variant: 'destructive' });
    }
  };

  const handleMessageInput = (value: string) => {
    setNewMessage(value);
    const lastAt = value.lastIndexOf('@');
    if (lastAt >= 0) {
      const afterAt = value.slice(lastAt + 1);
      if (!afterAt.includes(' ') && afterAt.length > 0) {
        setMentionSearch(afterAt.toLowerCase());
      } else {
        setMentionSearch(null);
      }
    } else {
      setMentionSearch(null);
    }
  };

  const insertMention = (name: string) => {
    const lastAt = newMessage.lastIndexOf('@');
    if (lastAt >= 0) {
      setNewMessage(newMessage.slice(0, lastAt) + `@${name} `);
    }
    setMentionSearch(null);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !id) return;
    await supabase.from('messages').insert({
      sender_id: user.id, content: newMessage.trim(), event_id: id,
      reply_to_id: replyTo?.id || null,
    });
    setNewMessage('');
    setReplyTo(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = e.target.files;
    if (!uploadFiles || !id || !user) return;
    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;
    for (const file of Array.from(uploadFiles)) {
      try {
        const filePath = `${id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('event-files').upload(filePath, file);
        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          failCount++;
          continue;
        }
        const { data: urlData } = supabase.storage.from('event-files').getPublicUrl(filePath);
        const { error: insertError } = await supabase.from('event_files').insert({
          event_id: id, file_name: file.name, file_url: urlData.publicUrl,
          file_type: file.type, file_size: file.size, uploaded_by: user.id,
        });
        if (insertError) {
          console.error('DB insert error:', insertError);
          failCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error('File upload error:', err);
        failCount++;
      }
    }
    setIsUploading(false);
    await fetchFiles();
    if (successCount > 0) toast({ title: `${successCount} arquivo(s) enviado(s)!` });
    if (failCount > 0) toast({ title: `${failCount} arquivo(s) falharam`, variant: 'destructive' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteFile = async (fileId: string) => {
    await supabase.from('event_files').delete().eq('id', fileId);
    fetchFiles();
  };

  const getProfileName = (userId: string | null) => profiles.find(p => p.user_id === userId)?.full_name || '—';
  const getMessageById = (msgId: string | null) => messages.find(m => m.id === msgId);

  if (!event) return (<div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'concluido').length;
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'concluido').length;
  const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const filteredTasks = filterSetor === 'all' ? tasks : tasks.filter(t => t.setor === filterSetor);
  const sectorProgress = EVENT_SECTORS.map(sector => {
    const st = tasks.filter(t => t.setor === sector);
    const done = st.filter(t => t.status === 'concluido').length;
    return { sector, total: st.length, done, pct: st.length > 0 ? Math.round((done / st.length) * 100) : 0 };
  }).filter(s => s.total > 0);

  const mentionResults = mentionSearch ? profiles.filter(p => p.full_name.toLowerCase().includes(mentionSearch)) : [];

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/events')}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-foreground truncate">{event.name}</h1>
          {event.event_date && (<p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(event.event_date), 'dd/MM/yyyy')}</p>)}
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="dashboard" className="text-[10px] sm:text-xs"><BarChart3 className="h-3 w-3 mr-1 hidden sm:inline" />Painel</TabsTrigger>
          <TabsTrigger value="tasks" className="text-[10px] sm:text-xs">Tarefas ({totalTasks})</TabsTrigger>
          <TabsTrigger value="chat" className="text-[10px] sm:text-xs"><MessageSquare className="h-3 w-3 mr-1 hidden sm:inline" />Chat</TabsTrigger>
          <TabsTrigger value="files" className="text-[10px] sm:text-xs"><FileText className="h-3 w-3 mr-1 hidden sm:inline" />Arquivos</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-border"><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-primary">{completionPct}%</p><p className="text-xs text-muted-foreground">Conclusão</p></CardContent></Card>
            <Card className="border-border"><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-foreground">{completedTasks}/{totalTasks}</p><p className="text-xs text-muted-foreground">Concluídas</p></CardContent></Card>
            <Card className="border-border"><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-destructive">{overdueTasks}</p><p className="text-xs text-muted-foreground">Atrasadas</p></CardContent></Card>
          </div>
          <Card className="border-border"><CardHeader className="pb-2"><CardTitle className="text-sm">Progresso Total</CardTitle></CardHeader><CardContent><Progress value={completionPct} className="h-3" /></CardContent></Card>
          {sectorProgress.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Por Setor</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {sectorProgress.map(sp => (
                  <div key={sp.sector}>
                    <div className="flex justify-between text-xs mb-1"><span className="text-foreground font-medium">{sp.sector}</span><span className="text-muted-foreground">{sp.done}/{sp.total}</span></div>
                    <Progress value={sp.pct} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tasks */}
        <TabsContent value="tasks" className="space-y-3">
          <div className="flex items-center justify-between">
            <Select value={filterSetor} onValueChange={setFilterSetor}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Setor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos setores</SelectItem>
                {EVENT_SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {(isAdmin || isGestor) && (
              <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova Tarefa</Button></DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Nova Tarefa do Evento</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Título *</Label><Input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} /></div>
                    <div><Label>Descrição</Label><Textarea value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} rows={2} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Setor</Label><Select value={newTask.setor} onValueChange={v => setNewTask(p => ({ ...p, setor: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENT_SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label>Prioridade</Label><Select value={newTask.priority} onValueChange={v => setNewTask(p => ({ ...p, priority: v as TaskPriority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent></Select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Prazo</Label><Input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} /></div>
                      <div><Label>Responsável</Label><Select value={newTask.responsible_id} onValueChange={v => setNewTask(p => ({ ...p, responsible_id: v }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                    <Button onClick={createTask} className="w-full">Criar Tarefa</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
          {filteredTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa neste evento</p>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map(t => (
                <Card key={t.id} className="border-border">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{getProfileName(t.responsible_id)}</span>
                        {t.setor && <Badge variant="outline" className="text-[10px] py-0">{t.setor}</Badge>}
                      </div>
                    </div>
                    <Badge className={priorityColors[t.priority]} variant="outline">{t.priority}</Badge>
                    <Badge variant="secondary" className="text-xs">{statusLabels[t.status]}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Chat with @mentions and reply */}
        <TabsContent value="chat" className="space-y-0">
          <Card className="border-border flex flex-col h-[calc(100vh-16rem)]">
            <div className="p-3 border-b border-border">
              <p className="text-sm font-medium text-foreground flex items-center gap-2"><Users className="h-4 w-4" />Chat do Evento</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              {messages.map(msg => {
                const repliedMsg = msg.reply_to_id ? getMessageById(msg.reply_to_id) : null;
                return (
                  <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.sender_id === user?.id ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'}`}>
                      {msg.sender_id !== user?.id && (<p className="text-[10px] font-medium mb-0.5 opacity-70">{getProfileName(msg.sender_id)}</p>)}
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
                  <Reply className="h-3 w-3" />
                  <span className="truncate flex-1">Respondendo a <strong>{getProfileName(replyTo.sender_id)}</strong>: {replyTo.content}</span>
                  <button onClick={() => setReplyTo(null)} className="text-foreground">✕</button>
                </div>
              )}
              {mentionResults.length > 0 && (
                <div className="px-3 pt-2 flex gap-1 flex-wrap">
                  {mentionResults.slice(0, 5).map(p => (
                    <button key={p.user_id} onClick={() => insertMention(p.full_name)} className="text-xs bg-accent text-accent-foreground rounded px-2 py-1 hover:bg-accent/80">
                      @{p.full_name}
                    </button>
                  ))}
                </div>
              )}
              <div className="p-3 flex gap-2">
                <Input value={newMessage} onChange={e => handleMessageInput(e.target.value)} placeholder="Mensagem... (use @ para mencionar)" onKeyDown={e => e.key === 'Enter' && sendMessage()} className="flex-1" />
                <Button onClick={sendMessage} size="icon"><Send className="h-4 w-4" /></Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Files */}
        <TabsContent value="files" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Arquivos do Evento</h3>
            <div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
              <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                <Upload className="h-4 w-4 mr-1" />{isUploading ? 'Enviando...' : 'Upload'}
              </Button>
            </div>
          </div>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum arquivo neste evento</p>
          ) : (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate block">{f.file_name}</a>
                    <p className="text-xs text-muted-foreground">{formatFileSize(f.file_size)} • {getProfileName(f.uploaded_by)} • {format(new Date(f.created_at), 'dd/MM HH:mm')}</p>
                  </div>
                  {(isAdmin || isGestor || f.uploaded_by === user?.id) && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteFile(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
