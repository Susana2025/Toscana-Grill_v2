-- Toscana Grill POS
-- Migración 003: activar Supabase Realtime para pedidos.
--
-- Objetivo:
-- Permitir que Dashboard, Pedidos, Cocina y Caja detecten
-- automáticamente:
--
-- - nuevos pedidos;
-- - cambios de estado;
-- - cierre o cancelación;
-- - modificaciones generales del pedido.
--
-- Para el flujo actual solo se requiere publicar la tabla pedidos.

begin;

-- ============================================================
-- 1. CONFIGURAR IDENTIDAD DE RÉPLICA
-- ============================================================
-- FULL permite que Supabase Realtime entregue información
-- suficiente sobre el registro anterior cuando exista un UPDATE
-- o DELETE.
--
-- Aunque actualmente no eliminamos pedidos, esta configuración
-- deja preparada la tabla para identificar correctamente cambios.

alter table public.pedidos
replica identity full;

-- ============================================================
-- 2. AGREGAR PEDIDOS A LA PUBLICACIÓN DE SUPABASE REALTIME
-- ============================================================
-- La comprobación evita errores si la migración se ejecuta
-- nuevamente o si la tabla ya fue activada desde el Dashboard.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pedidos'
  ) then

    alter publication supabase_realtime
    add table public.pedidos;

  end if;
end;
$$;

commit;
