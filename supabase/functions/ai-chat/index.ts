import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, projectId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    const queries: any[] = [
      supabase.from("tasks").select("id, title, status, priority, due_date, responsible_id, setor, completed_at, description").limit(500),
      supabase.from("events").select("id, name, event_date, description, start_date, end_date").limit(100),
      supabase.from("profiles").select("user_id, full_name, setor, cargo").limit(100),
      supabase.from("task_dependencies").select("id, task_id, depends_on_task_id").limit(500),
    ];

    if (projectId) {
      queries.push(supabase.from("event_tasks").select("task_id").eq("event_id", projectId));
    }

    const results = await Promise.all(queries);
    const [{ data: tasks }, { data: events }, { data: profiles }, { data: deps }] = results;
    const projectTaskIds = projectId && results[4]?.data ? results[4].data.map((et: any) => et.task_id) : null;

    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p.full_name; });

    const filteredTasks = projectTaskIds
      ? (tasks || []).filter((t: any) => projectTaskIds.includes(t.id))
      : (tasks || []);

    const tasksSummary = filteredTasks.map((t: any) => ({
      id: t.id, titulo: t.title, status: t.status, prioridade: t.priority,
      prazo: t.due_date, responsavel: profileMap[t.responsible_id] || "Sem responsável",
      setor: t.setor, descricao: t.description?.slice(0, 100),
    }));

    const depsSummary = (deps || []).map((d: any) => {
      const task = (tasks || []).find((t: any) => t.id === d.task_id);
      const dep = (tasks || []).find((t: any) => t.id === d.depends_on_task_id);
      return {
        tarefa: task?.title || d.task_id,
        depende_de: dep?.title || d.depends_on_task_id,
        dep_status: dep?.status,
      };
    });

    const eventsSummary = (events || []).map((e: any) => ({
      id: e.id, nome: e.name, data: e.event_date, inicio: e.start_date, fim: e.end_date,
    }));

    const profileList = (profiles || []).map((p: any) => `${p.full_name} (id: ${p.user_id}, setor: ${p.setor || 'N/A'})`).join(", ");

    const projectContext = projectId
      ? `\nCONTEXTO DO PROJETO: Você está no projeto ID ${projectId}. Tarefas deste projeto: ${JSON.stringify(tasksSummary)}`
      : "";

    const systemPrompt = `Você é o assistente IA avançado do TaskFlow. Data atual: ${now}

DADOS DO SISTEMA:
- ${tasksSummary.length} tarefas: ${JSON.stringify(tasksSummary)}
- ${depsSummary.length} dependências: ${JSON.stringify(depsSummary)}
- ${eventsSummary.length} projetos: ${JSON.stringify(eventsSummary)}
- Usuários: ${profileList}
${projectContext}

CAPACIDADES AVANÇADAS:
1. Criar tarefas com dependências
2. Analisar bloqueios e gargalos
3. Identificar caminho crítico
4. Sugerir otimizações de fluxo
5. Resumir status do projeto

PARA CRIAR TAREFAS COM DEPENDÊNCIAS, use este formato EXATO:
\`\`\`taskflow-action
{"action":"create_tasks","tasks":[{"title":"Nome","responsible_name":"Nome","due_date":"YYYY-MM-DD","priority":"media","setor":"setor","project_id":"id_projeto_ou_null","dependencies":["titulo_da_tarefa_que_depende"]}]}
\`\`\`

PARA ANALISAR BLOQUEIOS:
\`\`\`taskflow-action
{"action":"analyze_blockers","project_id":"id_do_projeto"}
\`\`\`

REGRAS:
- Sempre em português do Brasil, conciso e direto
- Quando o usuário pedir para criar tarefa que depende de outra, SEMPRE crie a dependência
- Ao criar dependências, a tarefa dependente deve iniciar com status bloqueado (a_fazer até que dependências sejam concluídas)
- Use IDs reais quando possível, ou títulos exatos para matching
- Explique o fluxo de dependências ao criar tarefas
- Se pedirem análise de bloqueios, identifique tarefas bloqueadas e quem está travando
- Prioridades: baixa, media, alta, urgente
- Se não souber o responsável, use o nome mais próximo da lista`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
