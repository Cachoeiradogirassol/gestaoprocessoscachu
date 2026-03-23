import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BarChart3, CheckCircle, AlertTriangle, Trophy } from 'lucide-react';

interface ReportData {
  totalTasks: number;
  completed: number;
  overdue: number;
  completionRate: number;
  bySetor: Record<string, { total: number; done: number }>;
  ranking: Array<{ name: string; userId: string; total: number; done: number; setor: string | null }>;
}

export default function ReportsPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [filterSetor, setFilterSetor] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');

  useEffect(() => {
    const fetchReport = async () => {
      const { data: tasks } = await supabase.from('tasks').select('*');
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, setor');

      if (!tasks || !profiles) return;

      const now = new Date();
      let filteredTasks = [...tasks];

      // Period filter
      if (filterPeriod !== 'all') {
        const days = filterPeriod === '7' ? 7 : filterPeriod === '30' ? 30 : 90;
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        filteredTasks = filteredTasks.filter(t => new Date(t.created_at) >= cutoff);
      }

      // Sector filter
      if (filterSetor !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.setor === filterSetor);
      }

      const completed = filteredTasks.filter(t => t.status === 'concluido').length;
      const overdue = filteredTasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'concluido').length;

      const bySetor: Record<string, { total: number; done: number }> = {};
      filteredTasks.forEach(t => {
        const s = t.setor || 'Sem setor';
        if (!bySetor[s]) bySetor[s] = { total: 0, done: 0 };
        bySetor[s].total++;
        if (t.status === 'concluido') bySetor[s].done++;
      });

      const userMap: Record<string, { total: number; done: number }> = {};
      filteredTasks.forEach(t => {
        if (!t.responsible_id) return;
        if (!userMap[t.responsible_id]) userMap[t.responsible_id] = { total: 0, done: 0 };
        userMap[t.responsible_id].total++;
        if (t.status === 'concluido') userMap[t.responsible_id].done++;
      });

      const ranking = Object.entries(userMap).map(([uid, data]) => {
        const profile = profiles.find(p => p.user_id === uid);
        return {
          name: profile?.full_name || 'Desconhecido',
          userId: uid,
          setor: profile?.setor || null,
          ...data,
        };
      }).sort((a, b) => b.done - a.done);

      setReport({
        totalTasks: filteredTasks.length,
        completed,
        overdue,
        completionRate: filteredTasks.length > 0 ? Math.round((completed / filteredTasks.length) * 100) : 0,
        bySetor,
        ranking,
      });
    };

    fetchReport();
  }, [filterSetor, filterPeriod]);

  const setors = report ? Object.keys(report.bySetor) : [];

  if (!report) return <div className="text-center text-muted-foreground py-8">Carregando relatórios...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo período</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSetor} onValueChange={setFilterSetor}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Setor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos setores</SelectItem>
            {setors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

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
        {/* Ranking */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-5 w-5 text-warning" />Ranking de Produtividade</CardTitle>
          </CardHeader>
          <CardContent>
            {report.ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados</p>
            ) : (
              <div className="space-y-3">
                {report.ranking.map((u, i) => {
                  const pct = u.total > 0 ? Math.round((u.done / u.total) * 100) : 0;
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
                  return (
                    <div key={u.userId} className="flex items-center gap-3">
                      <span className="text-lg w-8 text-center">{medal}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-foreground font-medium truncate">{u.name}</span>
                          <span className="text-muted-foreground shrink-0">{u.done}/{u.total} ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

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
      </div>
    </div>
  );
}
