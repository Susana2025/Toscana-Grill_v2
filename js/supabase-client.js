"use strict";
(function () {
  try {
    validarConfiguracionSupabase();
    if (!window.supabase?.createClient) throw new Error("No se cargó la librería de Supabase.");
    window.toscanaSupabase = window.supabase.createClient(
      TOSCANA_SUPABASE_CONFIG.url,
      TOSCANA_SUPABASE_CONFIG.publishableKey,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
    console.info("Cliente Supabase inicializado correctamente.");
  } catch (error) {
    console.error("Error al inicializar Supabase:", error);
    window.toscanaSupabase = null;
  }
})();