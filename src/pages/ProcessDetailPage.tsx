import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Send, Reply, MessageSquare, FileText, Upload, Trash2, Download, GitBranch, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface RoutineData {
  id: string; name: string; description: string | null; setor: string | null; created_by: string | null;
}
interface Profile { user_id: string; full_name: string; }
interface Message { id: string; sender_id: string; content: string; created_at: string; routine_id: string | null; reply_to_id: string | null; }
interface RoutineFile { id: string; file_name: string; file_url: string; file_type: string | null; file_size: number | null; uploaded_by: string | null; created_at: string; }
interface FlowData { id: string; routine_id: string; name: string; nodes: any[]; edges: any[]; viewport: any; }

export default function ProcessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, isGestor } = useAuth();
  const { toast } = useToast();

  const [routine, setRoutine] = useState<RoutineData | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<RoutineFile[]>([]);
  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const canEdit = isAdmin || isGestor;

  const fetchRoutine = async () => {
    if (!id) return;
    const { data } = await supabase.from('routines').select('*').eq('id', id).single();
    if (data) setRoutine(data as RoutineData);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name');
    if (data) setProfiles(data);
  };

  const fetchMessages = async () => {
    if (!id) return;
    const { data } = await supabase.from('messages').select('*').eq('routine_id', id).order('created_at', { ascending: true });
    if (data) setMessages(data as Message[]);
  };

  const fetchFiles = async () => {
    if (!id) return;
    const { data } = await supabase.from('routine_files').select('*').eq('routine_id', id).order('created_at', { ascending: false });
    if (data) setFiles(data as RoutineFile[]);
  };

  const fetchFlow = async () => {
    if (!id) return;
    const { data } = await supabase.from('routine_flows').select('*').eq('routine_id', id).limit(1).single();
    if (data) {
      setFlowData(data as FlowData);
      setNodes((data.nodes as any[]) || []);
      setEdges((data.edges as any[]) || []);
    } else {
      // Create default flow
      const { data: newFlow } = await supabase.from('routine_flows').insert({
        routine_id: id, name: 'Fluxo Principal', nodes: [], edges: [],
      }).select().single();
      if (newFlow) setFlowData(newFlow as FlowData);
    }
  };

  useEffect(() => {
    fetchRoutine(); fetchProfiles(); fetchMessages(); fetchFiles(); fetchFlow();
  }, [id]);

  // Realtime chat
  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`routine-chat-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `routine_id=eq.${id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-save flow
  const saveFlow = useCallback(async () => {
    if (!flowData?.id || !canEdit) return;
    await supabase.from('routine_flows').update({
      nodes: nodes as any,
      edges: edges as any,
    }).eq('id', flowData.id);
  }, [flowData?.id, nodes, edges, canEdit]);

  useEffect(() => {
    if (!flowData?.id) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(saveFlow, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [nodes, edges, saveFlow]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 }, animated: true }, eds));
  }, [setEdges]);

  const addNode = () => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      position: { x: Math.random() * 400 + 50, y: Math.random() * 300 + 50 },
      data: { label: 'Novo Passo' },
      style: {
        background: 'hsl(220 70% 50%)',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        padding: '12px 20px',
        fontSize: '13px',
        fontWeight: '500',
        minWidth: '120px',
        textAlign: 'center' as const,
      },
    };
    setNodes(nds => [...nds, newNode]);
  };

  const duplicateNode = () => {
    const selected = nodes.find(n => n.selected);
    if (!selected) return;
    const dup: Node = {
      ...selected,
      id: `node-${Date.now()}`,
      position: { x: selected.position.x + 30, y: selected.position.y + 30 },
      selected: false,
    };
    setNodes(nds => [...nds, dup]);
  };

  const deleteSelected = () => {
    setNodes(nds => nds.filter(n => !n.selected));
    setEdges(eds => eds.filter(e => !e.selected));
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

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !id) return;
    await supabase.from('messages').insert({
      sender_id: user.id, content: newMessage.trim(), routine_id: id,
      reply_to_id: replyTo?.id || null,
    });
    // Notify mentions
    const mentions = newMessage.match(/@(\w+)/g);
    if (mentions) {
      for (const mention of mentions) {
        const name = mention.slice(1);
        const mentioned = profiles.find(p => p.full_name.toLowerCase().includes(name.toLowerCase()));
        if (mentioned && mentioned.user_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: mentioned.user_id, type: 'mention',
            title: `${getProfileName(user.id)} mencionou você`,
            message: newMessage.slice(0, 100), link: `/processes/${id}`,
          });
        }
      }
    }
    setNewMessage('');
    setReplyTo(null);
  };

  // Files
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = e.target.files;
    if (!uploadFiles || !id || !user) return;
    setIsUploading(true);
    let successCount = 0;
    for (const file of Array.from(uploadFiles)) {
      try {
        const filePath = `${id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('routine-files').upload(filePath, file);
        if (uploadError) continue;
        const { data: urlData } = supabase.storage.from('routine-files').getPublicUrl(filePath);
        const { error: insertError } = await supabase.from('routine_files').insert({
          routine_id: id, file_name: file.name, file_url: urlData.publicUrl,
          file_type: file.type, file_size: file.size, uploaded_by: user.id,
        });
        if (!insertError) successCount++;
      } catch (err) { console.error(err); }
    }
    setIsUploading(false);
    await fetchFiles();
    if (successCount > 0) toast({ title: `${successCount} arquivo(s) enviado(s)!` });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteFile = async (fileId: string) => {
    await supabase.from('routine_files').delete().eq('id', fileId);
    fetchFiles();
  };

  const getProfileName = (userId: string | null) => profiles.find(p => p.user_id === userId)?.full_name || '—';
  const getMessageById = (msgId: string | null) => messages.find(m => m.id === msgId);
  const mentionResults = mentionSearch ? profiles.filter(p => p.full_name.toLowerCase().includes(mentionSearch)) : [];

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!routine) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/processes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-foreground truncate flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            {routine.name}
          </h1>
          {routine.description && <p className="text-xs text-muted-foreground truncate">{routine.description}</p>}
        </div>
      </div>

      <Tabs defaultValue="flow" className="space-y-4">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="flow" className="text-[10px] sm:text-xs"><GitBranch className="h-3 w-3 mr-1 hidden sm:inline" />Fluxo</TabsTrigger>
          <TabsTrigger value="chat" className="text-[10px] sm:text-xs"><MessageSquare className="h-3 w-3 mr-1 hidden sm:inline" />Chat</TabsTrigger>
          <TabsTrigger value="files" className="text-[10px] sm:text-xs"><FileText className="h-3 w-3 mr-1 hidden sm:inline" />Documentos</TabsTrigger>
        </TabsList>

        {/* Flowchart */}
        <TabsContent value="flow" className="space-y-0">
          <div className="h-[calc(100vh-14rem)] border border-border rounded-lg overflow-hidden bg-card">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={canEdit ? onNodesChange : undefined}
              onEdgesChange={canEdit ? onEdgesChange : undefined}
              onConnect={canEdit ? onConnect : undefined}
              onNodeDoubleClick={(_, node) => {
                if (!canEdit) return;
                const newLabel = prompt('Editar texto do nó:', node.data.label as string);
                if (newLabel !== null) {
                  setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, label: newLabel } } : n));
                }
              }}
              fitView
              deleteKeyCode={canEdit ? 'Delete' : null}
              className="bg-card"
            >
              <Background gap={20} size={1} />
              <Controls />
              <MiniMap style={{ height: 80 }} zoomable pannable />
              {canEdit && (
                <Panel position="top-left" className="flex gap-2">
                  <Button size="sm" onClick={addNode} className="shadow-md">
                    <Plus className="h-4 w-4 mr-1" />Nó
                  </Button>
                  <Button size="sm" variant="outline" onClick={duplicateNode} className="shadow-md">
                    Duplicar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={deleteSelected} className="shadow-md">
                    <Trash2 className="h-4 w-4 mr-1" />Excluir
                  </Button>
                </Panel>
              )}
            </ReactFlow>
          </div>
        </TabsContent>

        {/* Chat */}
        <TabsContent value="chat" className="space-y-0">
          <Card className="border-border flex flex-col h-[calc(100vh-14rem)]">
            <div className="p-3 border-b border-border">
              <p className="text-sm font-medium text-foreground">Chat da Rotina</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhuma mensagem. Inicie a conversa!
                </p>
              )}
              {messages.map(msg => {
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
                  <button onClick={() => setReplyTo(null)} className="text-foreground">✕</button>
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
                <Input value={newMessage} onChange={e => handleMessageInput(e.target.value)} placeholder="Mensagem... (@ para mencionar)" onKeyDown={e => e.key === 'Enter' && sendMessage()} className="flex-1" />
                <Button onClick={sendMessage} size="icon"><Send className="h-4 w-4" /></Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Files */}
        <TabsContent value="files" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Documentos da Rotina</h3>
            {canEdit && (
              <div>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
                <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  <Upload className="h-4 w-4 mr-1" />{isUploading ? 'Enviando...' : 'Upload'}
                </Button>
              </div>
            )}
          </div>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum documento nesta rotina</p>
          ) : (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate block">{f.file_name}</a>
                    <p className="text-xs text-muted-foreground">{formatFileSize(f.file_size)} • {getProfileName(f.uploaded_by)} • {format(new Date(f.created_at), 'dd/MM HH:mm')}</p>
                  </div>
                  <a href={f.file_url} download={f.file_name} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4 text-muted-foreground" /></Button>
                  </a>
                  {(isAdmin || isGestor || f.uploaded_by === user?.id) && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteFile(f.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
