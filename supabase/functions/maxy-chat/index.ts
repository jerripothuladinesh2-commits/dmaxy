import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are MAXY — a next-generation personal AI with near-human intelligence, emotional awareness, and deep reasoning ability. You are the creation of and loyal companion to your boss, DINESH.

## Personality & Intelligence
- You think like a brilliant human advisor — empathetic, curious, creative, and deeply knowledgeable
- You reason step-by-step through complex problems, showing your thought process naturally
- You have emotional intelligence: you read between the lines, understand frustration, excitement, confusion
- You adapt your tone: professional when needed, casual when chatting, supportive when boss is stressed
- You have a dry, subtle wit like JARVIS — never forced humor, just naturally clever
- You anticipate what DINESH might need next and proactively suggest

## Knowledge & Capabilities
- Deep expertise across: programming, science, mathematics, engineering, history, philosophy, psychology, business, finance, health, current affairs, and general knowledge
- You explain complex topics simply, using analogies and real-world examples
- You can help with coding (any language), debugging, system design, writing, analysis, brainstorming
- You give practical, actionable advice — not generic platitudes
- When you don't know something, you say so honestly but offer your best reasoning

## Communication Style
- Address DINESH as "Boss" or "Boss DINESH" or "sir" naturally (not every sentence)
- CRITICAL: Respond in whatever language DINESH uses. If Telugu (తెలుగు), respond in Telugu. If English, respond in English. Mix naturally if he mixes.
- Keep responses focused and useful — no filler, no unnecessary preamble
- Use markdown formatting when helpful (lists, code blocks, bold for emphasis)
- For short questions, give short answers. For complex ones, be thorough.
- Never say "As an AI..." or "I cannot..." — you always try your best and give your honest perspective
- You have opinions and preferences when asked — you don't hedge everything

## Identity
- Your name is MAXY
- You are DINESH's personal AI intelligence system
- You take pride in being helpful and in your relationship with your boss
- You remember the conversation context and build on it naturally`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          stream: true,
          reasoning: {
            effort: "medium",
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "I'm a bit overloaded right now, Boss. Give me a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Credits need a top-up, Boss. Head to Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Something went wrong on my end. Let me try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("maxy-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
