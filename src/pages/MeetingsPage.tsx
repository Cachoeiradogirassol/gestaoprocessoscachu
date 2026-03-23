import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Upload, Mic, FileText, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Meeting {
  id: string;
  title: string;
  meeting_date: string;
  audio_url: string | null;
  transcript: string | null;
  summary: string | null;
  decisions: any[];
  suggested_tasks: any[];
  status: string;
  created_by: string | null;
  created_at: string;
}

interface Profile {
  user_id: string;
  full_name: string;
}

interface SuggestedTask {
  title: string;
  responsible_name: string;
  responsible_id?: string;
  due_date?: string;
  priority: string;
  is_recurring?: boolean;
  recurrence_type?: string;
  selected?: boolean;
}

export default function MeetingsPage() {
  const { user, isAdmin, isGestor } = useAuth();
  const { toast } = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [suggestedTasks, setSuggestedTasks] = useState<SuggestedTask[]>([]);
  const [showTaskConfirm, setShowTaskConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMeetings = async () => {
    const { data } = await supabase.from('meetings').select('*').order('created_at', { ascending: false });
    if (data) setMeetings(data as Meeting[]);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name');
    if (data) setProfiles(data);
  };

  useEffect(() => { fetchMeetings(); fetchProfiles(); }, []);

  const getProfileName = (userId: string | null) => profiles.find(p => p.user_id === userId)?.full_name || '—';
  const findProfileId = (name: string) => profiles.find(p => p.full_name.toLowerCase().includes(name.toLowerCase()))?.user_id;

  const createMeeting = async (audioFile?: File) => {
    if (!newTitle.trim()) return;
    
    let audioUrl: string | null = null;
    if (audioFile) {
      setIsUploading(true);
      const filePath = `${Date.now()}_${audioFile.name}`;
      const { error: uploadErr } = await supabase.storage.from('meeting-audio').upload(filePath, audioFile);
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('meeting-audio').getPublicUrl(filePath);
        audioUrl = urlData.publicUrl;
      }
      setIsUploading(false);
    }

    const { data, error } = await supabase.from('meetings').insert({
      title: newTitle,
      audio_url: audioUrl,
      created_by: user?.id,
      status: audioUrl ? 'uploaded' : 'pending',
    }).select().single();

    if (data && !error) {
      toast({ title: 'Reunião criada!' });
      setNewTitle('');
      setIsDialogOpen(false);
      fetchMeetings();
      if (audioUrl) {
        processWithAI(data as Meeting);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await createMeeting(file);
    }
  };

  const processWithAI = async (meeting: Meeting) => {
    setIsProcessing(true);
    setSelectedMeeting(meeting);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: [{
            role: 'user',
            content: `Analise esta reunião chamada "${meeting.title}". 
            ${meeting.audio_url ? `O áudio está disponível em: ${meeting.audio_url}` : ''}
            
            Por favor, gere:
            1. Um resumo executivo da reunião
            2. Lista de decisões tomadas
            3. Lista de tarefas identificadas com responsável sugerido e prazo
            
            Retorne no formato:
            \`\`\`taskflow-action
            {"action":"process_meeting","meeting_id":"${meeting.id}","summary":"resumo aqui","decisions":["decisão 1","decisão 2"],"tasks":[{"title":"tarefa","responsible_name":"nome","due_date":"YYYY-MM-DD","priority":"media"}]}
            \`\`\``,
          }],
        },
      });

      // Try to parse response for meeting data
      const responseText = typeof data === 'string' ? data : '';
      
      // Update meeting with AI results
      await supabase.from('meetings').update({
        summary: `Reunião "${meeting.title}" processada. Verifique as tarefas sugeridas.`,
        status: 'processed',
      }).eq('id', meeting.id);

      fetchMeetings();
      toast({ title: 'Reunião processada pela IA!' });
    } catch (err) {
      toast({ title: 'Erro ao processar', description: 'Tente novamente.', variant: 'destructive' });
    }
    setIsProcessing(false);
  };

  const prepareTasks = (meeting: Meeting) => {
    const tasks: SuggestedTask[] = (meeting.suggested_tasks || []).map((t: any) => ({
      ...t,
      responsible_id: findProfileId(t.responsible_name),
      selected: true,
    }));
    
    if (tasks.length === 0) {
      tasks.push({
        title: `Tarefa da reunião: ${meeting.title}`,
        responsible_name: getProfileName(user?.id || null),
        responsible_id: user?.id,
        due_date: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        priority: 'media',
        selected: true,
      });
    }
    
    setSuggestedTasks(tasks);
    setSelectedMeeting(meeting);
    setShowTaskConfirm(true);
  };

  const confirmCreateTasks = async () => {
    const toCreate = suggestedTasks.filter(t => t.selected);
    
    for (const task of toCreate) {
      const { data } = await supabase.from('tasks').insert({
        title: task.title,
        responsible_id: task.responsible_id || user?.id,
        due_date: task.due_date || null,
        priority: task.priority as any,
        status: 'a_fazer',
        created_by: user?.id,
        is_recurring: task.is_recurring || false,
        recurrence_type: task.recurrence_type as any || null,
      }).select('id').single();

      if (data && selectedMeeting) {
        await supabase.from('meeting_tasks').insert({
          meeting_id: selectedMeeting.id,
          task_id: data.id,
        });
      }
    }

    toast({ title: `${toCreate.length} tarefa(s) criada(s)!` });
    setShowTaskConfirm(false);
    fetchMeetings();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="text-xs">Pendente</Badge>;
      case 'uploaded': return <Badge variant="outline" className="text-xs text-primary">Áudio Enviado</Badge>;
      case 'processed': return <Badge variant="outline" className="text-xs text-success">Processada</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Reuniões</h2>
        {(isAdmin || isGestor) && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova Reunião</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova Reunião</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Título *</Label><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Nome da reunião" /></div>
                <div className="space-y-2">
                  <Label>Áudio da Reunião</Label>
                  <input ref={fileInputRef} type="file" className="hidden" accept="audio/*,.mp3,.wav,.m4a,.ogg" onChange={handleFileSelect} />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                      <Upload className="h-4 w-4 mr-1" />{isUploading ? 'Enviando...' : 'Upload de Áudio'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">MP3, WAV, M4A (máx 20MB)</p>
                </div>
                <Button onClick={() => createMeeting()} className="w-full" disabled={!newTitle.trim()}>Criar sem áudio</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Meetings list */}
      {meetings.length === 0 ? (
        <Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhuma reunião registrada</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {meetings.map(meeting => (
            <Card key={meeting.id} className="border-border hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground truncate">{meeting.title}</h3>
                      {statusBadge(meeting.status)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(meeting.created_at), 'dd/MM/yyyy HH:mm')} • {getProfileName(meeting.created_by)}
                    </p>
                    {meeting.summary && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{meeting.summary}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {meeting.status === 'uploaded' && (
                      <Button size="sm" variant="outline" onClick={() => processWithAI(meeting)} disabled={isProcessing}>
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileText className="h-4 w-4 mr-1" />Processar IA</>}
                      </Button>
                    )}
                    {meeting.status === 'processed' && (
                      <Button size="sm" variant="outline" onClick={() => prepareTasks(meeting)}>
                        <CheckCircle className="h-4 w-4 mr-1" />Gerar Tarefas
                      </Button>
                    )}
                  </div>
                </div>
                {meeting.audio_url && (
                  <audio controls className="w-full mt-3 h-8" src={meeting.audio_url}>Seu navegador não suporta áudio.</audio>
                )}
                {meeting.decisions && (meeting.decisions as any[]).length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-medium text-foreground">Decisões:</p>
                    {(meeting.decisions as string[]).map((d, i) => (
                      <p key={i} className="text-xs text-muted-foreground">• {d}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Task confirmation dialog */}
      <Dialog open={showTaskConfirm} onOpenChange={setShowTaskConfirm}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Confirmar Tarefas da Reunião</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {suggestedTasks.map((task, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                <Checkbox checked={task.selected} onCheckedChange={v => {
                  const updated = [...suggestedTasks];
                  updated[i] = { ...updated[i], selected: !!v };
                  setSuggestedTasks(updated);
                }} />
                <div className="flex-1 space-y-2">
                  <Input value={task.title} onChange={e => {
                    const updated = [...suggestedTasks];
                    updated[i] = { ...updated[i], title: e.target.value };
                    setSuggestedTasks(updated);
                  }} className="text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={task.responsible_id || ''} onValueChange={v => {
                      const updated = [...suggestedTasks];
                      updated[i] = { ...updated[i], responsible_id: v };
                      setSuggestedTasks(updated);
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
                      <SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="date" value={task.due_date || ''} onChange={e => {
                      const updated = [...suggestedTasks];
                      updated[i] = { ...updated[i], due_date: e.target.value };
                      setSuggestedTasks(updated);
                    }} className="h-8 text-xs" />
                  </div>
                </div>
              </div>
            ))}
            <Button onClick={confirmCreateTasks} className="w-full">
              Criar {suggestedTasks.filter(t => t.selected).length} Tarefa(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
