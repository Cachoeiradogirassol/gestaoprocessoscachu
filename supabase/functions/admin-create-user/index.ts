import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callingUser } } = await supabaseAdmin.auth.getUser(token);
    
    if (!callingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUser.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // UPDATE USER (email/password)
    if (action === "update_user") {
      const { user_id, email, password, full_name, cargo, setor, role } = body;
      
      // Update auth user (email/password) if provided
      const authUpdates: any = {};
      if (email) authUpdates.email = email;
      if (password) authUpdates.password = password;
      
      if (Object.keys(authUpdates).length > 0) {
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, authUpdates);
        if (authError) {
          return new Response(JSON.stringify({ error: authError.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Update profile
      const profileUpdates: any = {};
      if (full_name !== undefined) profileUpdates.full_name = full_name;
      if (cargo !== undefined) profileUpdates.cargo = cargo;
      if (setor !== undefined) profileUpdates.setor = setor;
      
      if (Object.keys(profileUpdates).length > 0) {
        await supabaseAdmin.from("profiles").update(profileUpdates).eq("user_id", user_id);
      }

      // Update role
      if (role) {
        await supabaseAdmin.from("user_roles").update({ role }).eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE USER
    if (action === "delete_user") {
      const { user_id } = body;
      
      // Clean up related data
      await supabaseAdmin.from("tasks").update({ responsible_id: null }).eq("responsible_id", user_id);
      await supabaseAdmin.from("task_participants").delete().eq("user_id", user_id);
      await supabaseAdmin.from("event_participants").delete().eq("user_id", user_id);
      await supabaseAdmin.from("notifications").delete().eq("user_id", user_id);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
      
      // Delete auth user
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE USER (default action for backwards compatibility)
    const { email, password, full_name, cargo, setor, role } = body;

    const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = newUserData.user.id;

    if (cargo || setor) {
      await supabaseAdmin.from("profiles").update({ cargo, setor }).eq("user_id", newUserId);
    }

    if (role && role !== "operacional") {
      await supabaseAdmin.from("user_roles").update({ role }).eq("user_id", newUserId);
    }

    return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
