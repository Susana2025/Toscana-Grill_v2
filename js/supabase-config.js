"use strict";

/*
  Reemplaza únicamente estos dos valores con los datos públicos
  del proyecto Supabase destinado al nuevo repositorio.

  No coloques aquí service_role, secret key ni contraseña de PostgreSQL.
*/
const TOSCANA_SUPABASE_CONFIG = Object.freeze({
 url: "https://kxqpxmzjtxukszjwmbxv.supabase.co",
  publishableKey: "sb_publishable_X-BblX3Y2hCxsIecbHbwAw_ns1Ksjq6"
});

function validarConfiguracionSupabase() {
  const { url, publishableKey } = TOSCANA_SUPABASE_CONFIG;
  if (!url || !publishableKey || url.includes("REEMPLAZAR") || publishableKey.includes("REEMPLAZAR")) {
    throw new Error("Configura la URL y la Publishable Key de Supabase en js/supabase-config.js.");
  }
  if (!url.startsWith("https://") || url.includes("/rest/v1")) {
    throw new Error("La URL debe tener el formato https://PROJECT_ID.supabase.co, sin /rest/v1/.");
  }
}