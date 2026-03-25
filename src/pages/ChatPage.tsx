import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

interface Profile {
  user_id: string;
  full_name: string;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  content: string;
  created_at: string;
}

export default function ChatPage() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('profiles').select('user_id, full_name').then(({ data }) => {
      if (data) setProfiles(data.filter(p => p.user_id !== user?.id));
    });
  }, [user]);

  useEffect(() => {
    if (!selectedUser || !user) return;
    
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser}),and(sender_id.eq.${selectedUser},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      if (data) setMessages(data as Message[]);
    };

    fetchMessages();

    const channel = supabase
      .channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        if ((msg.sender_id === user.id && msg.receiver_id === selectedUser) ||
            (msg.sender_id === selectedUser && msg.receiver_id === user.id)) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedUser, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedUser || !user) return;
    
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: selectedUser,
      content: newMessage.trim(),
    });
    // Notify receiver
    await supabase.from('notifications').insert({
      user_id: selectedUser, type: 'new_message',
      title: `Nova mensagem de ${profiles.find(p => p.user_id === user.id)?.full_name || 'alguém'}`,
      message: newMessage.trim().slice(0, 100), link: '/chat',
    });
    setNewMessage('');
  };

  const getProfileName = (userId: string) => profiles.find(p => p.user_id === userId)?.full_name || 'Usuário';

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)] animate-fade-in">
      {/* Users list */}
      <Card className="w-64 flex-shrink-0 border-border hidden sm:block">
        <CardContent className="p-0">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Conversas</h3>
          </div>
          <div className="overflow-y-auto scrollbar-thin">
            {profiles.map(p => (
              <button
                key={p.user_id}
                onClick={() => setSelectedUser(p.user_id)}
                className={`flex w-full items-center gap-3 p-3 text-left transition-colors ${
                  selectedUser === p.user_id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted text-foreground'
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {p.full_name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm truncate">{p.full_name}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Mobile user select */}
      <div className="sm:hidden w-full">
        {!selectedUser ? (
          <Card className="border-border">
            <CardContent className="p-0">
              {profiles.map(p => (
                <button
                  key={p.user_id}
                  onClick={() => setSelectedUser(p.user_id)}
                  className="flex w-full items-center gap-3 p-3 text-left border-b border-border hover:bg-muted"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {p.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm">{p.full_name}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Chat area */}
      {selectedUser && (
        <Card className="flex-1 border-border flex flex-col">
          <div className="p-3 border-b border-border flex items-center gap-3">
            <button className="sm:hidden text-primary text-sm" onClick={() => setSelectedUser(null)}>← Voltar</button>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {getProfileName(selectedUser).charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-foreground">{getProfileName(selectedUser)}</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                  msg.sender_id === user?.id
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}>
                  <p>{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${msg.sender_id === user?.id ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                    {format(new Date(msg.created_at), 'HH:mm')}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-border flex gap-2">
            <Input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Digite sua mensagem..."
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              className="flex-1"
            />
            <Button onClick={sendMessage} size="icon"><Send className="h-4 w-4" /></Button>
          </div>
        </Card>
      )}

      {!selectedUser && (
        <div className="flex-1 hidden sm:flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecione um contato para iniciar uma conversa</p>
          </div>
        </div>
      )}
    </div>
  );
}
