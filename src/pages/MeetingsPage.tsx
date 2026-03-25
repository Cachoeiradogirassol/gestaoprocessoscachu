import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Upload, Mic, MicOff, FileText, CheckCircle, Loader2, Trash2, Users, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Meeting {
  id: string;
  title: string;
  meeting_date: string | null;
  audio_url: string | null;
  transcript: string | null;
  summary: string | null;
  decisions: any;
  suggested_tasks: any;
  status: string;
  created_by: string | null;
  created_at: string;
}

interface Profile {
  user_id: string;
  full_name: string;
  setor: string | null;
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
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newEventId, setNewEventId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [suggestedTasks, setSuggestedTasks] = useState<SuggestedTask[]>([]);
  const [showTaskConfirm, setShowTaskConfirm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    const [{ data: m }, { data: p }, { data: e }] = await Promise.all([
      supabase.from('meetings').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('user_id, full_name, setor'),
      supabase.from('events').select('id, name'),
    ]);
    if (m) setMeetings(m as Meeting[]);
    if (p) setProfiles(p);
    if (e) setEvents(e);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getProfileName = (userId: string | null) => profiles.find(p => p.user_id === userId)?.full_name || '—';

  // ===== RECORDING =====
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
        await createMeeting(file);
      };
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast({ title: 'Erro ao acessar microfone', description: 'Verifique as permissões do navegador.', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ===== UPLOAD & CREATE =====
  const uploadAudio = async (file: File): Promise<string | null> => {
    setIsUploading(true);
    const filePath = `${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('meeting-audio').upload(filePath, file);
    setIsUploading(false);
    if (error) { toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' }); return null; }
    const { data } = supabase.storage.from('meeting-audio').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const createMeeting = async (audioFile?: File) => {
    if (!newTitle.trim() && !audioFile) return;
    const title = newTitle.trim() || `Gravação ${format(new Date(), 'dd/MM/yyyy HH:mm')}`;

    let audioUrl: string | null = null;
    if (audioFile) {
      audioUrl = await uploadAudio(audioFile);
      if (!audioUrl) return;
    }

    const { data, error } = await supabase.from('meetings').insert({
      title, audio_url: audioUrl, created_by: user?.id,
      meeting_date: new Date().toISOString(),
      status: audioUrl ? 'uploaded' : 'pending',
    }).select().single();

    if (data && !error) {
      toast({ title: 'Reunião criada!' });
      setNewTitle('');
      setIsDialogOpen(false);
      fetchData();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 300MB.', variant: 'destructive' });
      return;
    }
    await createMeeting(file);
  };

  // ===== AI PROCESSING =====
  const processWithAI = async (meeting: Meeting) => {
    setIsProcessing(meeting.id);
    try {
      const eventName = newEventId ? events.find(e => e.id === newEventId)?.name : undefined;
      const { data, error } = await supabase.functions.invoke('process-meeting', {
        body: { meeting_id: meeting.id, event_name: eventName },
      });

      if (error) throw error;
      toast({ title: 'Reunião processada pela IA!' });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Erro ao processar', description: err.message || 'Tente novamente.', variant: 'destructive' });
    }
    setIsProcessing(null);
  };

  // ===== TASK GENERATION =====
  const prepareTasks = (meeting: Meeting) => {
    const rawTasks = Array.isArray(meeting.suggested_tasks) ? meeting.suggested_tasks : [];
    const tasks: SuggestedTask[] = rawTasks.length > 0
      ? rawTasks.map((t: any) => ({
        ...t,
        responsible_id: profiles.find(p => p.full_name.toLowerCase().includes((t.responsible_name || '').toLowerCase()))?.user_id,
        selected: true,
      }))
      : [{
        title: `Tarefa da reunião: ${meeting.title}`,
        responsible_name: getProfileName(user?.id || null),
        responsible_id: user?.id,
        due_date: format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd'),
        priority: 'media',
        selected: true,
      }];
    setSuggestedTasks(tasks);
    setSelectedMeeting(meeting);
    setShowTaskConfirm(true);
  };

  const confirmCreateTasks = async () => {
    const toCreate = suggestedTasks.filter(t => t.selected);
    let created = 0;
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
        await supabase.from('meeting_tasks').insert({ meeting_id: selectedMeeting.id, task_id: data.id });
        created++;
      }
    }
    toast({ title: `${created} tarefa(s) criada(s)!` });
    setShowTaskConfirm(false);
    fetchData();
  };

  const openDetail = (meeting: Meeting) => { setSelectedMeeting(meeting); setShowDetail(true); };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      pending: { label: 'Pendente', cls: 'text-muted-foreground' },
      uploaded: { label: 'Áudio Enviado', cls: 'text-primary' },
      processed: { label: 'Processada', cls: 'text-green-600' },
    };
    const s = map[status] || { label: status, cls: '' };
    return <Badge variant="outline" className={`text-xs ${s.cls}`}>{s.label}</Badge>;
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
                
                <div>
                  <Label>Evento relacionado (opcional)</Label>
                  <Select value={newEventId} onValueChange={setNewEventId}>
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {events.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Áudio da Reunião</Label>
                  <input ref={fileInputRef} type="file" className="hidden" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm" onChange={handleFileSelect} />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isRecording}>
                      <Upload className="h-4 w-4 mr-1" />{isUploading ? 'Enviando...' : 'Upload'}
                    </Button>
                    <Button
                      variant={isRecording ? 'destructive' : 'outline'}
                      className="flex-1"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isUploading}
                    >
                      {isRecording ? <><MicOff className="h-4 w-4 mr-1" />{formatTime(recordingTime)}</> : <><Mic className="h-4 w-4 mr-1" />Gravar</>}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">MP3, WAV, M4A, WebM (máx 300MB)</p>
                </div>
                <Button onClick={() => createMeeting()} className="w-full" disabled={!newTitle.trim() || isUploading}>
                  Criar sem áudio
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {meetings.length === 0 ? (
        <Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhuma reunião registrada</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {meetings.map(meeting => (
            <Card key={meeting.id} className="border-border hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(meeting)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground truncate">{meeting.title}</h3>
                      {statusBadge(meeting.status)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <Calendar className="inline h-3 w-3 mr-1" />
                      {format(new Date(meeting.created_at), 'dd/MM/yyyy HH:mm')} • {getProfileName(meeting.created_by)}
                    </p>
                    {meeting.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{meeting.summary}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {meeting.status === 'uploaded' && (
                      <Button size="sm" variant="outline" onClick={() => processWithAI(meeting)} disabled={!!isProcessing}>
                        {isProcessing === meeting.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileText className="h-3 w-3 mr-1" />IA</>}
                      </Button>
                    )}
                    {meeting.status === 'processed' && (
                      <Button size="sm" variant="outline" onClick={() => prepareTasks(meeting)}>
                        <CheckCircle className="h-3 w-3 mr-1" />Tarefas
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Meeting Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedMeeting && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{selectedMeeting.title}</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(selectedMeeting.created_at), 'dd/MM/yyyy HH:mm')} • {getProfileName(selectedMeeting.created_by)}
                </p>
              </DialogHeader>
              <div className="space-y-4">
                {selectedMeeting.audio_url && (
                  <div>
                    <Label className="text-xs font-medium">Áudio</Label>
                    <audio controls className="w-full mt-1 h-10" src={selectedMeeting.audio_url} />
                  </div>
                )}

                {selectedMeeting.summary && (
                  <div>
                    <Label className="text-xs font-medium">Resumo Executivo</Label>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{selectedMeeting.summary}</p>
                  </div>
                )}

                {selectedMeeting.transcript && (
                  <div>
                    <Label className="text-xs font-medium">Transcrição</Label>
                    <Textarea value={selectedMeeting.transcript} readOnly className="mt-1 text-xs min-h-[100px]" />
                  </div>
                )}

                {selectedMeeting.decisions && Array.isArray(selectedMeeting.decisions) && (selectedMeeting.decisions as string[]).length > 0 && (
                  <div>
                    <Label className="text-xs font-medium">Decisões</Label>
                    <ul className="mt-1 space-y-1">
                      {(selectedMeeting.decisions as string[]).map((d, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2">
                  {selectedMeeting.status === 'uploaded' && (
                    <Button size="sm" onClick={() => { setShowDetail(false); processWithAI(selectedMeeting); }} disabled={!!isProcessing} className="flex-1">
                      {isProcessing === selectedMeeting.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                      Processar com IA
                    </Button>
                  )}
                  {selectedMeeting.status === 'processed' && (
                    <Button size="sm" onClick={() => { setShowDetail(false); prepareTasks(selectedMeeting); }} className="flex-1">
                      <CheckCircle className="h-4 w-4 mr-1" />Gerar Tarefas
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Task Confirmation Dialog */}
      <Dialog open={showTaskConfirm} onOpenChange={setShowTaskConfirm}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">Confirmar Tarefas</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Revise e confirme as tarefas sugeridas pela IA:</p>
          <div className="space-y-3 mt-2">
            {suggestedTasks.map((task, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                <Checkbox checked={task.selected} onCheckedChange={v => {
                  const u = [...suggestedTasks]; u[i] = { ...u[i], selected: !!v }; setSuggestedTasks(u);
                }} className="mt-1" />
                <div className="flex-1 space-y-2">
                  <Input value={task.title} onChange={e => {
                    const u = [...suggestedTasks]; u[i] = { ...u[i], title: e.target.value }; setSuggestedTasks(u);
                  }} className="text-sm h-8" />
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={task.responsible_id || ''} onValueChange={v => {
                      const u = [...suggestedTasks]; u[i] = { ...u[i], responsible_id: v }; setSuggestedTasks(u);
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
                      <SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="date" value={task.due_date || ''} onChange={e => {
                      const u = [...suggestedTasks]; u[i] = { ...u[i], due_date: e.target.value }; setSuggestedTasks(u);
                    }} className="h-8 text-xs" />
                  </div>
                  <Select value={task.priority} onValueChange={v => {
                    const u = [...suggestedTasks]; u[i] = { ...u[i], priority: v }; setSuggestedTasks(u);
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
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
