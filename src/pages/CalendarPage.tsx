import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

const statusLabels: Record<string, string> = {
  backlog: 'Backlog', a_fazer: 'A Fazer', em_andamento: 'Em Andamento',
  em_validacao: 'Validação', concluido: 'Concluído',
};

export default function CalendarPage() {
  const { user, role } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterSetor, setFilterSetor] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: t }, { data: e }, { data: p }] = await Promise.all([
        supabase.from('tasks').select('id, title, status, priority, due_date, responsible_id, setor'),
        supabase.from('events').select('id, name, event_date'),
        supabase.from('profiles').select('user_id, full_name'),
      ]);
      if (t) setTasks(t as Task[]);
      if (e) setEvents(e);
      if (p) setProfiles(p);
    };
    fetchData();
  }, []);

  const isAdminOrGestor = role === 'admin' || role === 'gestor';

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

  // Day detail: role-based filtering
  const getDayDetailTasks = (date: Date) => {
    const dayTasks = tasks.filter(t => t.due_date && isSameDay(new Date(t.due_date), date));
    if (isAdminOrGestor) return dayTasks;
    return dayTasks.filter(t => t.responsible_id === user?.id);
  };

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

  const getProfileName = (id: string | null) => profiles.find(p => p.user_id === id)?.full_name || '';

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
  };

  const renderMonth = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let d = calStart;
    while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    return (
      <div>
        <div className="grid grid-cols-7 mb-1">
          {weekDays.map((wd, i) => (
            <div key={i} className="text-xs font-medium text-muted-foreground text-center py-1 sm:py-2">
              <span className="hidden sm:inline">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][i]}</span>
              <span className="sm:hidden">{wd}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {days.map((day, i) => {
            const dayTasks = getTasksForDate(day);
            const dayEvents = getEventsForDate(day);
            const inMonth = isSameMonth(day, currentDate);
            const hasItems = dayTasks.length > 0 || dayEvents.length > 0;
            return (
              <button
                key={i}
                onClick={() => handleDayClick(day)}
                className={`min-h-[48px] sm:min-h-[80px] p-0.5 sm:p-1 bg-card text-left transition-colors hover:bg-accent/30 ${!inMonth ? 'opacity-40' : ''} ${isToday(day) ? 'ring-2 ring-primary ring-inset' : ''}`}
              >
                <span className={`text-[10px] sm:text-xs font-medium ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </span>
                {/* Mobile: dots only */}
                <div className="sm:hidden flex gap-0.5 mt-0.5 flex-wrap">
                  {dayEvents.length > 0 && <div className="h-1.5 w-1.5 rounded-full bg-accent-foreground" />}
                  {dayTasks.slice(0, 3).map((t, j) => (
                    <div key={j} className={`h-1.5 w-1.5 rounded-full ${priorityDot[t.priority]}`} />
                  ))}
                </div>
                {/* Desktop: text */}
                <div className="hidden sm:block space-y-0.5 mt-0.5">
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
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeek = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day, i) => {
          const dayTasks = getTasksForDate(day);
          const dayEvents = getEventsForDate(day);
          return (
            <button
              key={i}
              onClick={() => handleDayClick(day)}
              className={`rounded-lg border border-border p-1 sm:p-2 min-h-[120px] sm:min-h-[200px] text-left hover:bg-accent/30 transition-colors ${isToday(day) ? 'ring-2 ring-primary' : ''}`}
            >
              <div className="text-center mb-1 sm:mb-2">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{format(day, 'EEE', { locale: ptBR })}</p>
                <p className={`text-sm sm:text-lg font-bold ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>{format(day, 'd')}</p>
              </div>
              <div className="space-y-0.5 sm:space-y-1">
                {dayEvents.map(ev => (
                  <div key={ev.id} className="text-[9px] sm:text-xs bg-accent text-accent-foreground rounded px-1 py-0.5 truncate">
                    📅 {ev.name}
                  </div>
                ))}
                {dayTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-xs bg-muted rounded px-1 py-0.5">
                    <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${priorityDot[t.priority]}`} />
                    <span className="truncate text-foreground">{t.title}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderDay = () => {
    const dayTasks = getDayDetailTasks(currentDate);
    const dayEvents = getEventsForDate(currentDate);

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
              <Badge variant="outline" className="text-xs shrink-0">{statusLabels[t.status] || t.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const dayDetailTasks = selectedDay ? getDayDetailTasks(selectedDay) : [];
  const dayDetailEvents = selectedDay ? getEventsForDate(selectedDay) : [];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xs sm:text-sm font-semibold text-foreground capitalize min-w-[100px] sm:min-w-[150px] text-center">{title}</h2>
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
                className={`px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium transition-colors ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {mode === 'month' ? 'Mês' : mode === 'week' ? 'Sem' : 'Dia'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="w-[120px] sm:w-[150px] h-8 text-xs"><SelectValue placeholder="Usuário" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSetor} onValueChange={setFilterSetor}>
          <SelectTrigger className="w-[120px] sm:w-[150px] h-8 text-xs"><SelectValue placeholder="Setor" /></SelectTrigger>
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

      {/* Day Detail Modal */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {selectedDay && format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {dayDetailEvents.map(ev => (
              <div key={ev.id} className="bg-accent rounded-lg p-3">
                <p className="text-sm font-medium text-accent-foreground">📅 {ev.name}</p>
              </div>
            ))}
            {dayDetailTasks.length === 0 && dayDetailEvents.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum item para este dia</p>
            )}
            {dayDetailTasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${priorityDot[t.priority]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {getProfileName(t.responsible_id)}{t.setor ? ` • ${t.setor}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{statusLabels[t.status] || t.status}</Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
