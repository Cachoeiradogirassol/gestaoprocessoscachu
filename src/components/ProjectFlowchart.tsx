import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle, Clock, Lock } from 'lucide-react';

interface Task {
  id: string; title: string; status: string; priority: string;
  due_date: string | null; responsible_id: string | null; description: string | null;
}
interface Dep { id: string; task_id: string; depends_on_task_id: string; }
interface Profile { user_id: string; full_name: string; }

const statusConfig: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  backlog: { color: '#6b7280', bg: '#f3f4f6', icon: Clock, label: 'Backlog' },
  a_fazer: { color: '#3b82f6', bg: '#eff6ff', icon: Clock, label: 'A Fazer' },
  em_andamento: { color: '#f59e0b', bg: '#fffbeb', icon: Clock, label: 'Em Andamento' },
  em_validacao: { color: '#8b5cf6', bg: '#f5f3ff', icon: Clock, label: 'Validação' },
  concluido: { color: '#22c55e', bg: '#f0fdf4', icon: CheckCircle, label: 'Concluído' },
};

function TaskNode({ data }: { data: any }) {
  const config = statusConfig[data.status] || statusConfig.backlog;
  const isBlocked = data.isBlocked;
  const isOverdue = data.due_date && new Date(data.due_date) < new Date() && data.status !== 'concluido';
  const borderColor = isBlocked ? '#ef4444' : isOverdue ? '#f97316' : config.color;

  return (
    <div
      onClick={() => data.onSelect?.(data.task)}
      className="cursor-pointer rounded-lg border-2 px-4 py-3 min-w-[180px] max-w-[240px] shadow-sm transition-all hover:shadow-md"
      style={{ borderColor, backgroundColor: isBlocked ? '#fef2f2' : config.bg }}
    >
      <div className="flex items-center gap-2 mb-1">
        {isBlocked && <Lock className="h-3.5 w-3.5 text-destructive shrink-0" />}
        {isOverdue && !isBlocked && <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
        {data.status === 'concluido' && <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />}
        <span className="text-xs font-semibold truncate" style={{ color: borderColor }}>{config.label}</span>
      </div>
      <p className="text-sm font-medium text-foreground truncate">{data.label}</p>
      {data.responsible && (
        <p className="text-[11px] text-muted-foreground mt-1 truncate">{data.responsible}</p>
      )}
      {data.due_date && (
        <p className={`text-[10px] mt-0.5 ${isOverdue ? 'text-orange-500 font-medium' : 'text-muted-foreground'}`}>
          Prazo: {format(new Date(data.due_date), 'dd/MM/yyyy')}
        </p>
      )}
    </div>
  );
}

const nodeTypes = { taskNode: TaskNode };

interface Props {
  projectId: string;
  tasks: Task[];
  profiles: Profile[];
}

export default function ProjectFlowchart({ projectId, tasks, profiles }: Props) {
  const [deps, setDeps] = useState<Dep[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const profileMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach(p => { map[p.user_id] = p.full_name; });
    return map;
  }, [profiles]);

  const fetchDeps = useCallback(async () => {
    if (tasks.length === 0) { setDeps([]); return; }
    const taskIds = tasks.map(t => t.id);
    const { data } = await supabase.from('task_dependencies').select('*')
      .or(`task_id.in.(${taskIds.join(',')}),depends_on_task_id.in.(${taskIds.join(',')})`);
    if (data) setDeps(data as Dep[]);
  }, [tasks]);

  useEffect(() => { fetchDeps(); }, [fetchDeps]);

  // Realtime for dependencies
  useEffect(() => {
    const channel = supabase.channel('flow-deps')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_dependencies' }, () => fetchDeps())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {})
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchDeps]);

  // Build graph
  useEffect(() => {
    if (tasks.length === 0) { setNodes([]); setEdges([]); return; }

    const blockedTaskIds = new Set<string>();
    deps.forEach(d => {
      const depTask = tasks.find(t => t.id === d.depends_on_task_id);
      if (depTask && depTask.status !== 'concluido') {
        blockedTaskIds.add(d.task_id);
      }
    });

    // Simple layout: arrange in layers based on dependencies
    const taskDepCount: Record<string, number> = {};
    tasks.forEach(t => { taskDepCount[t.id] = 0; });
    deps.forEach(d => { if (taskDepCount[d.task_id] !== undefined) taskDepCount[d.task_id]++; });

    // Topological-ish layering
    const layers: string[][] = [];
    const placed = new Set<string>();
    const remaining = new Set(tasks.map(t => t.id));

    while (remaining.size > 0) {
      const layer: string[] = [];
      for (const id of remaining) {
        const unmetDeps = deps.filter(d => d.task_id === id && !placed.has(d.depends_on_task_id) && remaining.has(d.depends_on_task_id));
        if (unmetDeps.length === 0) layer.push(id);
      }
      if (layer.length === 0) {
        // Circular deps or remaining - just place them
        layer.push(...remaining);
      }
      layer.forEach(id => { placed.add(id); remaining.delete(id); });
      layers.push(layer);
    }

    const newNodes: Node[] = [];
    layers.forEach((layer, layerIdx) => {
      layer.forEach((taskId, idx) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        newNodes.push({
          id: task.id,
          type: 'taskNode',
          position: { x: layerIdx * 300 + 50, y: idx * 120 + 50 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label: task.title,
            status: task.status,
            priority: task.priority,
            due_date: task.due_date,
            responsible: profileMap[task.responsible_id || ''] || null,
            isBlocked: blockedTaskIds.has(task.id),
            task,
            onSelect: setSelectedTask,
          },
        });
      });
    });

    const newEdges: Edge[] = deps
      .filter(d => tasks.some(t => t.id === d.task_id) && tasks.some(t => t.id === d.depends_on_task_id))
      .map(d => {
        const depTask = tasks.find(t => t.id === d.depends_on_task_id);
        const isResolved = depTask?.status === 'concluido';
        return {
          id: d.id,
          source: d.depends_on_task_id,
          target: d.task_id,
          animated: !isResolved,
          style: { stroke: isResolved ? '#22c55e' : '#ef4444', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: isResolved ? '#22c55e' : '#ef4444' },
          label: isResolved ? '✓' : '🔒',
        };
      });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [tasks, deps, profileMap]);

  const blockedTasks = useMemo(() => {
    const blockedIds = new Set<string>();
    deps.forEach(d => {
      const depTask = tasks.find(t => t.id === d.depends_on_task_id);
      if (depTask && depTask.status !== 'concluido') blockedIds.add(d.task_id);
    });
    return tasks.filter(t => blockedIds.has(t.id));
  }, [tasks, deps]);

  const blockers = useMemo(() => {
    const blockerMap: Record<string, string[]> = {};
    deps.forEach(d => {
      const depTask = tasks.find(t => t.id === d.depends_on_task_id);
      if (depTask && depTask.status !== 'concluido') {
        const key = depTask.id;
        if (!blockerMap[key]) blockerMap[key] = [];
        const blocked = tasks.find(t => t.id === d.task_id);
        if (blocked) blockerMap[key].push(blocked.title);
      }
    });
    return Object.entries(blockerMap).map(([taskId, blocking]) => ({
      task: tasks.find(t => t.id === taskId)!,
      blocking,
    })).filter(b => b.task);
  }, [tasks, deps]);

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhuma tarefa neste projeto para exibir no fluxograma
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {blockers.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3">
            <p className="text-sm font-semibold text-destructive flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" /> Gargalos Identificados
            </p>
            <div className="space-y-1">
              {blockers.map(b => (
                <div key={b.task.id} className="text-xs text-foreground">
                  <span className="font-medium">{b.task.title}</span>
                  <span className="text-muted-foreground"> ({profileMap[b.task.responsible_id || ''] || 'Sem resp.'}) está travando: </span>
                  <span className="text-destructive">{b.blocking.join(', ')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="h-[500px] rounded-lg border border-border overflow-hidden bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const s = node.data?.status as string;
              return statusConfig[s]?.color || '#6b7280';
            }}
            className="!bg-card"
          />
        </ReactFlow>
      </div>

      <div className="flex gap-3 flex-wrap text-xs">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-red-500" />Bloqueada</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-blue-500" />A Fazer</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-yellow-500" />Em Andamento</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-purple-500" />Validação</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-green-500" />Concluído</span>
      </div>

      <Dialog open={!!selectedTask} onOpenChange={v => { if (!v) setSelectedTask(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedTask?.title}</DialogTitle></DialogHeader>
          {selectedTask && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">{selectedTask.status}</Badge>
                <Badge variant="outline">{selectedTask.priority}</Badge>
              </div>
              {selectedTask.description && <p className="text-sm text-muted-foreground">{selectedTask.description}</p>}
              <p className="text-sm"><strong>Responsável:</strong> {profileMap[selectedTask.responsible_id || ''] || 'Sem responsável'}</p>
              {selectedTask.due_date && <p className="text-sm"><strong>Prazo:</strong> {format(new Date(selectedTask.due_date), 'dd/MM/yyyy')}</p>}
              {deps.filter(d => d.task_id === selectedTask.id).length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-1">Depende de:</p>
                  {deps.filter(d => d.task_id === selectedTask.id).map(d => {
                    const depTask = tasks.find(t => t.id === d.depends_on_task_id);
                    return (
                      <div key={d.id} className="text-xs flex items-center gap-2">
                        {depTask?.status === 'concluido'
                          ? <CheckCircle className="h-3 w-3 text-green-500" />
                          : <Lock className="h-3 w-3 text-destructive" />}
                        <span>{depTask?.title || d.depends_on_task_id}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {deps.filter(d => d.depends_on_task_id === selectedTask.id).length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-1">Bloqueia:</p>
                  {deps.filter(d => d.depends_on_task_id === selectedTask.id).map(d => {
                    const blockedTask = tasks.find(t => t.id === d.task_id);
                    return <p key={d.id} className="text-xs text-muted-foreground">→ {blockedTask?.title || d.task_id}</p>;
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
