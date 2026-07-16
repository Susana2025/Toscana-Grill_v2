-- Toscana Grill POS
-- Migración 002: consulta simplificada del histórico de pedidos.
--
-- Permisos:
-- - administrador: consulta todos los pedidos finalizados;
-- - caja: consulta todos los pedidos finalizados;
-- - mesero: consulta únicamente los pedidos creados por su usuario.
--
-- Estados incluidos:
-- - cerrado;
-- - cancelado.

begin;

create or replace function public.listar_historial_pedidos(
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_estado text default null,
  p_busqueda text default null,
  p_limite integer default 100
)
returns table (
  pedido_id uuid,
  ticket text,
  tipo public.tipo_pedido,
  mesa_numero integer,
  mesa_nombre text,
  cliente_nombre text,
  cliente_telefono text,
  estado public.estado_pedido,
  estado_pago public.estado_pago,
  forma_pago public.forma_pago,
  total numeric,
  cantidad_items bigint,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz,
  cerrado_en timestamptz,
  actualizado_en timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_rol public.rol_usuario;
  v_fecha_desde date;
  v_fecha_hasta date;
  v_estado public.estado_pedido;
  v_busqueda text;
  v_limite integer;
begin
  -- ==========================================================
  -- 1. VALIDAR USUARIO
  -- ==========================================================

  select
    perfil.id,
    perfil.rol
  into
    v_usuario_id,
    v_rol
  from public.perfiles perfil
  where perfil.id = auth.uid()
    and perfil.activo = true;

  if v_usuario_id is null then
    raise exception
      'Usuario no autenticado o inactivo.';
  end if;

  if v_rol not in (
    'administrador',
    'caja',
    'mesero'
  ) then
    raise exception
      'Tu rol no está autorizado para consultar el histórico.';
  end if;

  -- ==========================================================
  -- 2. NORMALIZAR FILTROS
  -- ==========================================================

  v_fecha_hasta :=
    coalesce(
      p_fecha_hasta,
      timezone(
        'America/Guayaquil',
        now()
      )::date
    );

  v_fecha_desde :=
    coalesce(
      p_fecha_desde,
      v_fecha_hasta - 30
    );

  if v_fecha_desde > v_fecha_hasta then
    raise exception
      'La fecha inicial no puede ser mayor que la fecha final.';
  end if;

  v_busqueda :=
    nullif(
      trim(
        coalesce(
          p_busqueda,
          ''
        )
      ),
      ''
    );

  v_limite :=
    least(
      greatest(
        coalesce(
          p_limite,
          100
        ),
        1
      ),
      500
    );

  -- Solo se admiten los estados propios del histórico.

  if nullif(
    trim(
      coalesce(
        p_estado,
        ''
      )
    ),
    ''
  ) is not null then

    if p_estado not in (
      'cerrado',
      'cancelado'
    ) then
      raise exception
        'El estado debe ser cerrado o cancelado.';
    end if;

    v_estado :=
      p_estado::public.estado_pedido;
  else
    v_estado := null;
  end if;

  -- ==========================================================
  -- 3. CONSULTAR PEDIDOS FINALIZADOS
  -- ==========================================================

  return query
  select
    pedido.id as pedido_id,
    pedido.ticket,
    pedido.tipo,
    mesa.numero as mesa_numero,
    mesa.nombre as mesa_nombre,
    pedido.cliente_nombre,
    pedido.cliente_telefono,
    pedido.estado,
    pedido.estado_pago,
    pedido.forma_pago,
    pedido.total,
    coalesce(
      sum(detalle.cantidad),
      0
    )::bigint as cantidad_items,
    pedido.creado_por,
    creador.nombre_completo as creado_por_nombre,
    pedido.creado_en,
    pedido.cerrado_en,
    pedido.actualizado_en

  from public.pedidos pedido

  left join public.mesas mesa
    on mesa.id = pedido.mesa_id

  left join public.detalle_pedido detalle
    on detalle.pedido_id = pedido.id

  left join public.perfiles creador
    on creador.id = pedido.creado_por

  where pedido.estado in (
      'cerrado',
      'cancelado'
    )

    and timezone(
      'America/Guayaquil',
      coalesce(
        pedido.cerrado_en,
        pedido.actualizado_en
      )
    )::date
      between v_fecha_desde
      and v_fecha_hasta

    and (
      v_estado is null
      or pedido.estado = v_estado
    )

    and (
      v_busqueda is null

      or pedido.ticket ilike
        '%' || v_busqueda || '%'

      or coalesce(
        pedido.cliente_nombre,
        ''
      ) ilike
        '%' || v_busqueda || '%'

      or coalesce(
        pedido.cliente_telefono,
        ''
      ) ilike
        '%' || v_busqueda || '%'

      or coalesce(
        mesa.nombre,
        ''
      ) ilike
        '%' || v_busqueda || '%'

      or cast(
        mesa.numero as text
      ) ilike
        '%' || v_busqueda || '%'
    )

    and (
      v_rol in (
        'administrador',
        'caja'
      )

      or (
        v_rol = 'mesero'
        and pedido.creado_por = v_usuario_id
      )
    )

  group by
    pedido.id,
    mesa.numero,
    mesa.nombre,
    creador.nombre_completo

  order by
    coalesce(
      pedido.cerrado_en,
      pedido.actualizado_en
    ) desc

  limit v_limite;
end;
$$;

-- ============================================================
-- 4. PERMISOS
-- ============================================================

revoke all
on function public.listar_historial_pedidos(
  date,
  date,
  text,
  text,
  integer
)
from public;

grant execute
on function public.listar_historial_pedidos(
  date,
  date,
  text,
  text,
  integer
)
to authenticated;

commit;
