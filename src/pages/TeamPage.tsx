import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TeamMember {
  user_id: string;
  full_name: string;
  cargo: string | null;
  setor: string | null;
  role: string;
}

const roleLabels: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', operacional: 'Operacional' };
const roleBadgeColors: Record<string, string> = { admin: 'bg-destructive/10 text-destructive', gestor: 'bg-warning/10 text-warning', operacional: 'bg-primary/10 text-primary' };

export default function TeamPage() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', cargo: '', setor: '', role: 'operacional' });
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchMembers = async () => {
    try {
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, cargo, setor');
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');
      if (profiles && roles) {
        setMembers(profiles.map(p => ({ ...p, role: roles.find(r => r.user_id === p.user_id)?.role || 'operacional' })));
      }
    } catch (err) { console.error('Error fetching members:', err); }
  };

  useEffect(() => { fetchMembers(); }, []);

  const createUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) {
      toast({ title: 'Erro', description: 'Preencha todos os campos obrigatórios.', variant: 'destructive' });
      return;
    }
    if (newUser.password.length < 6) {
      toast({ title: 'Erro', description: 'A senha deve ter pelo menos 6 caracteres.', variant: 'destructive' });
      return;
    }
    setIsCreating(true);
    try {
      const { error } = await supabase.functions.invoke('admin-create-user', { body: newUser });
      if (error) {
        toast({ title: 'Erro', description: 'Não foi possível criar o usuário.', variant: 'destructive' });
      } else {
        toast({ title: 'Usuário criado com sucesso!' });
        setNewUser({ email: '', password: '', full_name: '', cargo: '', setor: '', role: 'operacional' });
        setIsDialogOpen(false);
        setTimeout(fetchMembers, 1000);
      }
    } catch (err) {
      toast({ title: 'Erro inesperado', variant: 'destructive' });
    }
    setIsCreating(false);
  };

  const updateMember = async () => {
    if (!editingMember) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          action: 'update_user',
          user_id: editingMember.user_id,
          full_name: editingMember.full_name,
          cargo: editingMember.cargo,
          setor: editingMember.setor,
          role: editingMember.role,
          email: editEmail || undefined,
          password: editPassword || undefined,
        },
      });
      if (error) {
        toast({ title: 'Erro ao atualizar', description: 'Verifique os dados.', variant: 'destructive' });
      } else {
        toast({ title: 'Membro atualizado!' });
        setIsEditDialogOpen(false);
        setEditingMember(null);
        setEditEmail('');
        setEditPassword('');
        fetchMembers();
      }
    } catch (err) {
      toast({ title: 'Erro inesperado', variant: 'destructive' });
    }
    setIsUpdating(false);
  };

  const deleteMember = async (userId: string) => {
    if (userId === user?.id) {
      toast({ title: 'Erro', description: 'Você não pode excluir a si mesmo.', variant: 'destructive' });
      return;
    }
    if (!confirm('Excluir este usuário? As tarefas atribuídas a ele ficarão sem responsável.')) return;
    try {
      const { error } = await supabase.functions.invoke('admin-create-user', {
        body: { action: 'delete_user', user_id: userId },
      });
      if (error) {
        toast({ title: 'Erro ao excluir', variant: 'destructive' });
      } else {
        toast({ title: 'Usuário removido!' });
        fetchMembers();
      }
    } catch (err) {
      toast({ title: 'Erro inesperado', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Equipe</h2>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Usuário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar Usuário</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Nome completo *</Label><Input value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} /></div>
                <div><Label>Email *</Label><Input type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} /></div>
                <div><Label>Senha * (mín. 6 caracteres)</Label><Input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Cargo</Label><Input value={newUser.cargo} onChange={e => setNewUser(p => ({ ...p, cargo: e.target.value }))} /></div>
                  <div><Label>Setor</Label><Input value={newUser.setor} onChange={e => setNewUser(p => ({ ...p, setor: e.target.value }))} /></div>
                </div>
                <div>
                  <Label>Nível de Acesso</Label>
                  <Select value={newUser.role} onValueChange={v => setNewUser(p => ({ ...p, role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operacional">Operacional</SelectItem>
                      <SelectItem value="gestor">Gestor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={createUser} className="w-full" disabled={isCreating}>
                  {isCreating ? 'Criando...' : 'Criar Usuário'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map(m => (
          <Card key={m.user_id} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {m.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground">{m.cargo || 'Sem cargo'} • {m.setor || 'Sem setor'}</p>
                  </div>
                </div>
                <Badge className={roleBadgeColors[m.role]} variant="secondary">{roleLabels[m.role]}</Badge>
              </div>
              {isAdmin && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingMember({ ...m }); setEditEmail(''); setEditPassword(''); setIsEditDialogOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMember(m.user_id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Member Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(v) => { setIsEditDialogOpen(v); if (!v) { setEditingMember(null); setEditEmail(''); setEditPassword(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Membro</DialogTitle></DialogHeader>
          {editingMember && (
            <div className="space-y-4">
              <div><Label>Nome completo</Label><Input value={editingMember.full_name} onChange={e => setEditingMember(p => p ? { ...p, full_name: e.target.value } : null)} /></div>
              <div><Label>Novo Email (deixe vazio para manter)</Label><Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="novo@email.com" /></div>
              <div><Label>Nova Senha (deixe vazio para manter)</Label><Input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="••••••" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cargo</Label><Input value={editingMember.cargo || ''} onChange={e => setEditingMember(p => p ? { ...p, cargo: e.target.value } : null)} /></div>
                <div><Label>Setor</Label><Input value={editingMember.setor || ''} onChange={e => setEditingMember(p => p ? { ...p, setor: e.target.value } : null)} /></div>
              </div>
              <div>
                <Label>Nível de Acesso</Label>
                <Select value={editingMember.role} onValueChange={v => setEditingMember(p => p ? { ...p, role: v } : null)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operacional">Operacional</SelectItem>
                    <SelectItem value="gestor">Gestor</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={updateMember} className="w-full" disabled={isUpdating}>
                {isUpdating ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
