import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, addWeeks, subWeeks,
  isSameMonth, isSameDay, isToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ViewMode = 'month' | 'week' | 'day';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  responsible_id: string | null;
  setor: string | null;
}

interface Profile {
  user_id: string;
  full_name: string;
}

interface Event {
  id: string;
  name: string;
  event_date: string | null;
}

const priorityDot: Record<string, string> = {
  baixa: 'bg-muted-foreground',
  media: 'bg-primary',
  alta: 'bg-warning',
  urgente: 'bg-destructive',
};

export default function CalendarPage() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterSetor, setFilterSetor] = useState<string>('all');

  useEffect(() => {
    const fetch = async () => {
      const [{ data: t }, { data: e }, { data: p }] = await Promise.all([
        supabase.from('tasks').select('id, title, status, priority, due_date, responsible_id, setor'),
        supabase.from('events').select('id, name, event_date'),
        supabase.from('profiles').select('user_id, full_name'),
      ]);
      if (t) setTasks(t as Task[]);
      if (e) setEvents(e);
      if (p) setProfiles(p);
    };
    fetch();
  }, []);

  const filteredTasks = tasks.filter(t => {
    if (!t.due_date) return false;
    if (filterUser !== 'all' && t.responsible_id !== filterUser) return false;
    if (filterSetor !== 'all' && t.setor !== filterSetor) return false;
    return true;
  });

  const getTasksForDate = (date: Date) =>
    filteredTasks.filter(t => t.due_date && isSameDay(new Date(t.due_date), date));

  const getEventsForDate = (date: Date) =>
    events.filter(e => e.event_date && isSameDay(new Date(e.event_date), date));

  const setors = [...new Set(tasks.map(t => t.setor).filter(Boolean))] as string[];

  const navigate = (dir: 1 | -1) => {
    if (viewMode === 'month') setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, dir));
  };

  const title = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
    : viewMode === 'week'
      ? `Semana de ${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'dd/MM')} - ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), 'dd/MM')}`
      : format(currentDate, "EEEE, d 'de' MMMM", { locale: ptBR });

  // Month view
  const renderMonth = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let d = calStart;
    while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    return (
      <div>
        <div className="grid grid-cols-7 mb-1">
          {weekDays.map(wd => (
            <div key={wd} className="text-xs font-medium text-muted-foreground text-center py-2">{wd}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {days.map((day, i) => {
            const dayTasks = getTasksForDate(day);
            const dayEvents = getEventsForDate(day);
            const inMonth = isSameMonth(day, currentDate);
            return (
              <div
                key={i}
                className={`min-h-[80px] p-1 bg-card ${!inMonth ? 'opacity-40' : ''} ${isToday(day) ? 'ring-2 ring-primary ring-inset' : ''}`}
              >
                <span className={`text-xs font-medium ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </span>
                <div className="space-y-0.5 mt-0.5">
                  {dayEvents.slice(0, 1).map(ev => (
                    <div key={ev.id} className="text-[10px] bg-accent text-accent-foreground rounded px-1 truncate">
                      📅 {ev.name}
                    </div>
                  ))}
                  {dayTasks.slice(0, 2).map(t => (
                    <div key={t.id} className="flex items-center gap-0.5 text-[10px] text-foreground truncate">
                      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${priorityDot[t.priority]}`} />
                      <span className="truncate">{t.title}</span>
                    </div>
                  ))}
                  {dayTasks.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">+{dayTasks.length - 2}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Week view
  const renderWeek = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const dayTasks = getTasksForDate(day);
          const dayEvents = getEventsForDate(day);
          return (
            <div key={i} className={`rounded-lg border border-border p-2 min-h-[200px] ${isToday(day) ? 'ring-2 ring-primary' : ''}`}>
              <div className="text-center mb-2">
                <p className="text-xs text-muted-foreground">{format(day, 'EEE', { locale: ptBR })}</p>
                <p className={`text-lg font-bold ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>{format(day, 'd')}</p>
              </div>
              <div className="space-y-1">
                {dayEvents.map(ev => (
                  <div key={ev.id} className="text-xs bg-accent text-accent-foreground rounded px-1.5 py-0.5 truncate">
                    📅 {ev.name}
                  </div>
                ))}
                {dayTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-1 text-xs bg-muted rounded px-1.5 py-0.5">
                    <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${priorityDot[t.priority]}`} />
                    <span className="truncate text-foreground">{t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Day view
  const renderDay = () => {
    const dayTasks = getTasksForDate(currentDate);
    const dayEvents = getEventsForDate(currentDate);
    const getProfileName = (id: string | null) => profiles.find(p => p.user_id === id)?.full_name || '';

    return (
      <div className="space-y-3 max-w-lg mx-auto">
        {dayEvents.map(ev => (
          <Card key={ev.id} className="border-accent">
            <CardContent className="p-3">
              <p className="text-sm font-medium text-accent-foreground">📅 {ev.name}</p>
            </CardContent>
          </Card>
        ))}
        {dayTasks.length === 0 && dayEvents.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa ou evento para este dia</p>
        )}
        {dayTasks.map(t => (
          <Card key={t.id} className="border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${priorityDot[t.priority]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground">{getProfileName(t.responsible_id)}{t.setor ? ` • ${t.setor}` : ''}</p>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">{t.status.replace('_', ' ')}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold text-foreground capitalize min-w-[150px] text-center">{title}</h2>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCurrentDate(new Date())}>Hoje</Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex border border-border rounded-md overflow-hidden">
            {(['month', 'week', 'day'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {mode === 'month' ? 'Mês' : mode === 'week' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Usuário" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSetor} onValueChange={setFilterSetor}>
          <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Setor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {setors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* View */}
      {viewMode === 'month' && renderMonth()}
      {viewMode === 'week' && renderWeek()}
      {viewMode === 'day' && renderDay()}
    </div>
  );
}
