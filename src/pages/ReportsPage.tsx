import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Users, CheckCircle, AlertTriangle } from 'lucide-react';

interface ReportData {
  totalTasks: number;
  completed: number;
  overdue: number;
  completionRate: number;
  bySetor: Record<string, { total: number; done: number }>;
  byUser: Array<{ name: string; total: number; done: number }>;
}

export default function ReportsPage() {
  const [report, setReport] = useState<ReportData | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      const { data: tasks } = await supabase.from('tasks').select('*');
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name');

      if (!tasks || !profiles) return;

      const now = new Date();
      const completed = tasks.filter(t => t.status === 'concluido').length;
      const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'concluido').length;

      // By setor
      const bySetor: Record<string, { total: number; done: number }> = {};
      tasks.forEach(t => {
        const s = t.setor || 'Sem setor';
        if (!bySetor[s]) bySetor[s] = { total: 0, done: 0 };
        bySetor[s].total++;
        if (t.status === 'concluido') bySetor[s].done++;
      });

      // By user
      const userMap: Record<string, { total: number; done: number }> = {};
      tasks.forEach(t => {
        if (!t.responsible_id) return;
        if (!userMap[t.responsible_id]) userMap[t.responsible_id] = { total: 0, done: 0 };
        userMap[t.responsible_id].total++;
        if (t.status === 'concluido') userMap[t.responsible_id].done++;
      });

      const byUser = Object.entries(userMap).map(([uid, data]) => ({
        name: profiles.find(p => p.user_id === uid)?.full_name || 'Desconhecido',
        ...data,
      })).sort((a, b) => b.total - a.total);

      setReport({
        totalTasks: tasks.length,
        completed,
        overdue,
        completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
        bySetor,
        byUser,
      });
    };

    fetchReport();
  }, []);

  if (!report) return <div className="text-center text-muted-foreground py-8">Carregando relatórios...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold text-foreground">{report.totalTasks}</p>
            <p className="text-xs text-muted-foreground">Total de Tarefas</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-6 w-6 mx-auto mb-2 text-success" />
            <p className="text-2xl font-bold text-foreground">{report.completionRate}%</p>
            <p className="text-xs text-muted-foreground">Taxa de Conclusão</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-6 w-6 mx-auto mb-2 text-success" />
            <p className="text-2xl font-bold text-foreground">{report.completed}</p>
            <p className="text-xs text-muted-foreground">Concluídas</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-destructive" />
            <p className="text-2xl font-bold text-foreground">{report.overdue}</p>
            <p className="text-xs text-muted-foreground">Atrasadas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* By sector */}
        <Card className="border-border">
          <CardHeader><CardTitle className="text-base">Por Setor</CardTitle></CardHeader>
          <CardContent>
            {Object.entries(report.bySetor).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(report.bySetor).map(([setor, data]) => {
                  const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
                  return (
                    <div key={setor}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-foreground font-medium">{setor}</span>
                        <span className="text-muted-foreground">{data.done}/{data.total} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By user */}
        <Card className="border-border">
          <CardHeader><CardTitle className="text-base">Por Usuário</CardTitle></CardHeader>
          <CardContent>
            {report.byUser.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados</p>
            ) : (
              <div className="space-y-3">
                {report.byUser.map(u => {
                  const pct = u.total > 0 ? Math.round((u.done / u.total) * 100) : 0;
                  return (
                    <div key={u.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-foreground font-medium">{u.name}</span>
                        <span className="text-muted-foreground">{u.done}/{u.total} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
