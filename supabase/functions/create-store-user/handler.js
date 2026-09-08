const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export function createHandler(getClient) {
  return async request => {
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") return reply(405, { error: "Método não permitido." });
    try {
      const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return reply(401, { error: "Entre na sua conta para cadastrar usuários." });
      const client = getClient();
      const { data: identity, error: authError } = await client.auth.getUser(token);
      if (authError || !identity?.user) return reply(401, { error: "Sua sessão expirou. Entre novamente." });
      const { data: member, error: memberError } = await client.from("store_admins")
        .select("user_id").eq("user_id", identity.user.id).maybeSingle();
      if (memberError) return reply(500, { error: "Não foi possível verificar sua permissão." });
      if (!member) return reply(403, { error: "Sua conta não tem acesso à loja." });
      let body;
      try { body = await request.json(); } catch (_) { return reply(400, { error: "Cadastro inválido." }); }
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = body?.password;
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          typeof password !== "string" || password.length < 8 || password.length > 72) {
        return reply(400, { error: "Informe um e-mail válido e uma senha entre 8 e 72 caracteres." });
      }
      const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return reply(400, { error: error.code === "email_exists" || error.code === "email_already_exists"
        ? "Este e-mail já está cadastrado. Use outro e-mail."
        : "Não foi possível criar a conta. Confira o e-mail e os requisitos de senha do projeto." });
      const { error: grantError } = await client.from("store_admins").insert({ user_id: data.user.id });
      if (grantError) {
        const { error: cleanupError } = await client.auth.admin.deleteUser(data.user.id);
        return reply(500, { error: cleanupError
          ? "A conta foi criada, mas ficou sem acesso. Autorize esse e-mail no Supabase antes de usá-lo."
          : "Não foi possível conceder acesso. O cadastro foi desfeito; tente novamente." });
      }
      return reply(201, { user: { id: data.user.id, email: data.user.email } });
    } catch (_) {
      return reply(500, { error: "Não foi possível confirmar o cadastro. Confira no Supabase antes de tentar novamente." });
    }
  };
}
