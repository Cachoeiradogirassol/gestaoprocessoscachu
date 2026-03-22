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

    // Get auth user for context
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch contextual data for the AI
    const now = new Date().toISOString();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [{ data: tasks }, { data: events }, { data: profiles }] = await Promise.all([
      supabase.from("tasks").select("id, title, status, priority, due_date, responsible_id, setor, completed_at").limit(200),
      supabase.from("events").select("id, name, event_date, description").limit(50),
      supabase.from("profiles").select("user_id, full_name, setor, cargo").limit(100),
    ]);

    const profileMap = (profiles || []).reduce((acc: Record<string, string>, p: any) => {
      acc[p.user_id] = p.full_name; return acc;
    }, {});

    const tasksSummary = (tasks || []).map((t: any) => ({
      id: t.id,
      titulo: t.title,
      status: t.status,
      prioridade: t.priority,
      prazo: t.due_date,
      responsavel: profileMap[t.responsible_id] || "Sem responsável",
      setor: t.setor,
      concluido_em: t.completed_at,
    }));

    const eventsSummary = (events || []).map((e: any) => ({
      id: e.id,
      nome: e.name,
      data: e.event_date,
      descricao: e.description,
    }));

    const systemPrompt = `Você é o assistente IA do TaskFlow, um sistema de gestão de tarefas. Você tem acesso aos dados atuais do sistema.

DADOS ATUAIS (${now}):

TAREFAS (${tasksSummary.length} total):
${JSON.stringify(tasksSummary, null, 0)}

EVENTOS (${eventsSummary.length} total):
${JSON.stringify(eventsSummary, null, 0)}

USUÁRIOS:
${JSON.stringify(profiles, null, 0)}

SUAS CAPACIDADES:
1. Responder perguntas sobre tarefas, eventos e equipe
2. Gerar resumos diários/semanais
3. Identificar atrasos e problemas
4. Quando o usuário pedir para CRIAR tarefas, retorne um JSON especial no formato:
   \`\`\`taskflow-action
   {"action":"create_tasks","tasks":[{"title":"...","responsible_name":"...","due_date":"YYYY-MM-DD","priority":"media","setor":"...","event_name":"..."}]}
   \`\`\`
   Após o bloco de ação, explique o que foi feito.

REGRAS:
- Responda sempre em português do Brasil
- Seja conciso e direto
- Use markdown para formatação
- Quando mostrar dados, use tabelas ou listas
- Para criar tarefas, use o formato especial acima`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
