import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    const [{ data: tasks }, { data: events }, { data: profiles }] = await Promise.all([
      supabase.from("tasks").select("id, title, status, priority, due_date, responsible_id, setor, completed_at").limit(200),
      supabase.from("events").select("id, name, event_date, description").limit(50),
      supabase.from("profiles").select("user_id, full_name, setor, cargo").limit(100),
    ]);

    const profileMap = (profiles || []).reduce((acc: Record<string, string>, p: any) => {
      acc[p.user_id] = p.full_name; return acc;
    }, {});

    const tasksSummary = (tasks || []).map((t: any) => ({
      titulo: t.title, status: t.status, prioridade: t.priority, prazo: t.due_date,
      responsavel: profileMap[t.responsible_id] || "Sem responsável", setor: t.setor,
    }));

    const eventsSummary = (events || []).map((e: any) => ({
      id: e.id, nome: e.name, data: e.event_date,
    }));

    const profileList = (profiles || []).map((p: any) => `${p.full_name} (setor: ${p.setor || 'N/A'})`).join(", ");

    const systemPrompt = `Você é o assistente IA do TaskFlow, um sistema de gestão de tarefas. Data atual: ${now}

DADOS DO SISTEMA:
- ${tasksSummary.length} tarefas: ${JSON.stringify(tasksSummary)}
- ${eventsSummary.length} eventos: ${JSON.stringify(eventsSummary)}
- Usuários: ${profileList}

CAPACIDADES:
1. Responder perguntas sobre tarefas, eventos, equipe, produtividade
2. Criar tarefas quando solicitado

PARA CRIAR TAREFAS, use este formato EXATO:
\`\`\`taskflow-action
{"action":"create_tasks","tasks":[{"title":"Nome da tarefa","responsible_name":"Nome do responsável","due_date":"YYYY-MM-DD","priority":"media","setor":"setor","event_name":"nome do evento ou null"}]}
\`\`\`

EXEMPLOS:
- "Criar 4 tarefas para o Betinho com vencimento hoje" → Crie 4 tarefas com responsible_name="Betinho" e due_date de hoje
- "Criar tarefas de logística para Semana Santa" → Crie tarefas com setor="Logística" e event_name="Semana Santa"
- "Criar tarefa de relatório para Maria" → Crie 1 tarefa com responsible_name="Maria"

REGRAS:
- Sempre em português do Brasil, conciso e direto
- Quando criar tarefas, SEMPRE inclua o bloco taskflow-action
- Após o bloco de ação, explique brevemente o que foi criado
- Use nomes reais dos usuários do sistema
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
