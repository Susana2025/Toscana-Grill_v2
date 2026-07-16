"use strict";
document.addEventListener("DOMContentLoaded", init);
async function init() {
  const form = document.querySelector("#login-form");
  const email = document.querySelector("#email");
  const password = document.querySelector("#password");
  const submit = document.querySelector("#login-submit");
  const message = document.querySelector("#login-message");
  document.querySelector("#toggle-password").addEventListener("click", e => {
    const visible = password.type === "text";
    password.type = visible ? "password" : "text";
    e.currentTarget.textContent = visible ? "Mostrar" : "Ocultar";
  });
  if (!window.toscanaSupabase) {
    show("No se pudo inicializar Supabase. Revisa js/supabase-config.js.", "error");
    submit.disabled = true;
    return;
  }
  const { data: current } = await window.toscanaSupabase.auth.getSession();
  if (current.session) await route(current.session.user.id);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = "Validando…";
    message.hidden = true;
    try {
      const { data, error } = await window.toscanaSupabase.auth.signInWithPassword({
        email: email.value.trim().toLowerCase(),
        password: password.value
      });
      if (error) throw error;
      show("Acceso correcto. Redirigiendo…", "success");
      await route(data.user.id);
    } catch (error) {
      console.error(error);
      const text = String(error.message || "").toLowerCase().includes("invalid login")
        ? "Correo o contraseña incorrectos."
        : error.message || "No fue posible iniciar sesión.";
      show(text, "error");
      submit.disabled = false;
      submit.textContent = "Iniciar sesión";
    }
  });
  function show(text, type) {
    message.textContent = text;
    message.className = `login-message ${type}`;
    message.hidden = false;
  }
}
async function route(userId) {
  const { data, error } = await window.toscanaSupabase
    .from("perfiles").select("rol,activo").eq("id", userId).single();
  if (error || !data?.activo) {
    await window.toscanaSupabase.auth.signOut();
    throw new Error("La cuenta no tiene un perfil activo.");
  }
  window.location.replace("./panel.html");
}