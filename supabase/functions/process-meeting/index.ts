import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { meeting_id, event_name } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get meeting
    const { data: meeting, error: meetErr } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetErr || !meeting) throw new Error("Meeting not found");

    // Get profiles for task assignment
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, setor");
    const profileList = (profiles || []).map(p => `${p.full_name} (setor: ${p.setor || 'N/A'})`).join(", ");

    // Build prompt
    const systemPrompt = `Você é um assistente de reuniões do TaskFlow. Analise a reunião e gere um documento estruturado.

USUÁRIOS DISPONÍVEIS: ${profileList}

Você DEVE retornar EXATAMENTE neste formato JSON (sem markdown, sem texto extra):
{
  "summary": "Resumo executivo da reunião em 2-3 parágrafos",
  "decisions": ["Decisão 1", "Decisão 2"],
  "tasks": [
    {
      "title": "Nome da tarefa",
      "responsible_name": "Nome do responsável (da lista de usuários)",
      "due_date": "YYYY-MM-DD",
      "priority": "media",
      "is_recurring": false,
      "recurrence_type": null
    }
  ]
}

REGRAS:
- Use nomes reais dos usuários disponíveis
- Prioridades: baixa, media, alta, urgente
- Prazos realistas (próximos 7-14 dias)
- Se não souber detalhes, crie tarefas genéricas baseadas no título da reunião
- Sempre gere pelo menos 2-3 tarefas relevantes`;

    const userContent = `Reunião: "${meeting.title}"
Data: ${meeting.meeting_date || meeting.created_at}
${meeting.transcript ? `Transcrição: ${meeting.transcript}` : 'Sem transcrição disponível - gere tarefas baseadas no título da reunião.'}
${event_name ? `Evento relacionado: ${event_name}` : ''}

Gere o documento da reunião com resumo, decisões e tarefas.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    let parsed: any;
    try {
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawContent];
      parsed = JSON.parse(jsonMatch[1].trim());
    } catch {
      // Fallback
      parsed = {
        summary: `Reunião "${meeting.title}" processada. O conteúdo não pôde ser estruturado automaticamente.`,
        decisions: [],
        tasks: [{ title: `Acompanhar reunião: ${meeting.title}`, responsible_name: "", due_date: null, priority: "media" }],
      };
    }

    // Update meeting
    await supabase.from("meetings").update({
      summary: parsed.summary || null,
      decisions: parsed.decisions || [],
      suggested_tasks: parsed.tasks || [],
      status: "processed",
    }).eq("id", meeting_id);

    return new Response(JSON.stringify({ success: true, ...parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-meeting error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
