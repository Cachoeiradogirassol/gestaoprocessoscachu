import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertTriangle, ListTodo, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TaskSummary {
  completed: number;
  pending: number;
  overdue: number;
  inProgress: number;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
}

const priorityColors: Record<string, string> = {
  baixa: 'bg-priority-low/10 text-priority-low',
  media: 'bg-priority-medium/10 text-priority-medium',
  alta: 'bg-priority-high/10 text-priority-high',
  urgente: 'bg-priority-urgent/10 text-priority-urgent',
};

const statusLabels: Record<string, string> = {
  backlog: 'Backlog',
  a_fazer: 'A Fazer',
  em_andamento: 'Em Andamento',
  em_validacao: 'Em Validação',
  concluido: 'Concluído',
};

export default function DashboardPage() {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<TaskSummary>({ completed: 0, pending: 0, overdue: 0, inProgress: 0 });
  const [myTasks, setMyTasks] = useState<TaskRow[]>([]);
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; content: string; created_at: string }>>([]);

  useEffect(() => {
    if (!user) return;
    
    const fetchData = async () => {
      // Fetch tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, responsible_id')
        .eq('responsible_id', user.id);

      if (tasks) {
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');
        
        setSummary({
          completed: tasks.filter(t => t.status === 'concluido').length,
          pending: tasks.filter(t => t.status === 'a_fazer' || t.status === 'backlog').length,
          overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'concluido').length,
          inProgress: tasks.filter(t => t.status === 'em_andamento').length,
        });

        const activeTasks = tasks
          .filter(t => t.status !== 'concluido')
          .sort((a, b) => {
            const pOrder = { urgente: 0, alta: 1, media: 2, baixa: 3 };
            return (pOrder[a.priority as keyof typeof pOrder] ?? 2) - (pOrder[b.priority as keyof typeof pOrder] ?? 2);
          })
          .slice(0, 8);
        
        setMyTasks(activeTasks as TaskRow[]);
      }

      // Fetch announcements
      const { data: anns } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (anns) setAnnouncements(anns);
    };

    fetchData();
  }, [user]);

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Olá, {profile?.full_name?.split(' ')[0]} 👋
        </h1>
        <p className="text-muted-foreground capitalize">{today}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{summary.completed}</p>
                <p className="text-xs text-muted-foreground">Concluídas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ListTodo className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{summary.pending}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{summary.inProgress}</p>
                <p className="text-xs text-muted-foreground">Em Andamento</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{summary.overdue}</p>
                <p className="text-xs text-muted-foreground">Atrasadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* My tasks */}
        <div className="lg:col-span-2">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Minhas Tarefas</CardTitle>
                <button onClick={() => navigate('/tasks')} className="text-sm text-primary hover:underline flex items-center gap-1">
                  Ver todas <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {myTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma tarefa pendente 🎉</p>
              ) : (
                myTasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => navigate('/tasks')}
                    className="flex w-full items-center justify-between rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{statusLabels[task.status]}</span>
                        {task.due_date && (
                          <span className={`text-xs ${new Date(task.due_date) < new Date() ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {format(new Date(task.due_date), 'dd/MM')}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge className={priorityColors[task.priority]} variant="secondary">
                      {task.priority}
                    </Badge>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Announcements */}
        <div>
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Comunicados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {announcements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum comunicado</p>
              ) : (
                announcements.map(ann => (
                  <div key={ann.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium text-foreground">{ann.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ann.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">{format(new Date(ann.created_at), 'dd/MM HH:mm')}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
