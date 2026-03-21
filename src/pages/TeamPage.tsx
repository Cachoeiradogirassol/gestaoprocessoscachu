import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Shield, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TeamMember {
  user_id: string;
  full_name: string;
  cargo: string | null;
  setor: string | null;
  role: string;
}

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  operacional: 'Operacional',
};

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-destructive/10 text-destructive',
  gestor: 'bg-warning/10 text-warning',
  operacional: 'bg-primary/10 text-primary',
};

export default function TeamPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', cargo: '', setor: '', role: 'operacional' });

  const fetchMembers = async () => {
    const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, cargo, setor');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    
    if (profiles && roles) {
      const combined = profiles.map(p => ({
        ...p,
        role: roles.find(r => r.user_id === p.user_id)?.role || 'operacional',
      }));
      setMembers(combined);
    }
  };

  useEffect(() => { fetchMembers(); }, []);

  const createUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) return;
    
    // Use edge function to create user (admin only)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: newUser,
    });

    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível criar o usuário.', variant: 'destructive' });
    } else {
      toast({ title: 'Usuário criado!' });
      setNewUser({ email: '', password: '', full_name: '', cargo: '', setor: '', role: 'operacional' });
      setIsDialogOpen(false);
      fetchMembers();
    }
  };

  const updateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole as any })
      .eq('user_id', userId);
    
    if (!error) {
      toast({ title: 'Permissão atualizada!' });
      fetchMembers();
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
                <div><Label>Senha *</Label><Input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} /></div>
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
                <Button onClick={createUser} className="w-full">Criar Usuário</Button>
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
                <Badge className={roleBadgeColors[m.role]} variant="secondary">
                  {roleLabels[m.role]}
                </Badge>
              </div>
              {isAdmin && (
                <div className="mt-3 pt-3 border-t border-border">
                  <Select value={m.role} onValueChange={v => updateRole(m.user_id, v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operacional">Operacional</SelectItem>
                      <SelectItem value="gestor">Gestor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
