-- Toscana Grill POS
-- Migración 001: actualización controlada del estado de pedidos.
--
-- Flujo operativo simplificado:
-- pendiente -> confirmado -> en_preparacion -> listo -> entregado -> cerrado
--
-- Vía rápida para un restaurante con poco personal:
-- pendiente -> en_preparacion
--
-- Cancelación:
-- pendiente, confirmado o en_preparacion -> cancelado

begin;

-- ============================================================
-- 1. ACTUALIZAR EL TRIGGER DEL HISTORIAL
-- ============================================================
-- Se conserva el registro automático de cambios, pero ahora
-- también se almacena la observación enviada por la RPC.

create or replace function public.registrar_historial_estado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observacion text;
begin
  v_observacion :=
    nullif(
      trim(
        coalesce(
          current_setting(
            'app.observacion_estado_pedido',
            true
          ),
          ''
        )
      ),
      ''
    );

  if tg_op = 'INSERT' then
    insert into public.historial_estado_pedido (
      pedido_id,
      estado_anterior,
      estado_nuevo,
      cambiado_por,
      observacion
    )
    values (
      new.id,
      null,
      new.estado,
      auth.uid(),
      v_observacion
    );

  elsif old.estado is distinct from new.estado then
    insert into public.historial_estado_pedido (
      pedido_id,
      estado_anterior,
      estado_nuevo,
      cambiado_por,
      observacion
    )
    values (
      new.id,
      old.estado,
      new.estado,
      auth.uid(),
      v_observacion
    );
  end if;

  return new;
end;
$$;

-- ============================================================
-- 2. FUNCIÓN PRINCIPAL PARA CAMBIAR EL ESTADO
-- ============================================================

create or replace function public.actualizar_estado_pedido(
  p_pedido_id uuid,
  p_estado_nuevo public.estado_pedido,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_rol public.rol_usuario;
  v_estado_actual public.estado_pedido;
  v_creado_por uuid;
  v_ticket text;
  v_estado_valido boolean := false;
  v_observacion text;
begin
  -- ----------------------------------------------------------
  -- Validar usuario autenticado y activo
  -- ----------------------------------------------------------

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
    raise exception 'Usuario no autenticado o inactivo.';
  end if;

  -- ----------------------------------------------------------
  -- Bloquear el pedido durante la operación
  -- ----------------------------------------------------------

  select
    pedido.estado,
    pedido.creado_por,
    pedido.ticket
  into
    v_estado_actual,
    v_creado_por,
    v_ticket
  from public.pedidos pedido
  where pedido.id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  -- ----------------------------------------------------------
  -- Evitar actualizaciones innecesarias
  -- ----------------------------------------------------------

  if v_estado_actual = p_estado_nuevo then
    return jsonb_build_object(
      'pedido_id',
      p_pedido_id,
      'ticket',
      v_ticket,
      'estado_anterior',
      v_estado_actual,
      'estado_nuevo',
      p_estado_nuevo,
      'actualizado',
      false,
      'mensaje',
      'El pedido ya se encuentra en ese estado.'
    );
  end if;

  -- ----------------------------------------------------------
  -- Estados finales: no pueden reabrirse
  -- ----------------------------------------------------------

  if v_estado_actual in ('cerrado', 'cancelado') then
    raise exception
      'El pedido está finalizado y no puede cambiar de estado.';
  end if;

  -- ----------------------------------------------------------
  -- Validar transición operativa
  -- ----------------------------------------------------------

  v_estado_valido :=
    case v_estado_actual

      when 'pendiente' then
        p_estado_nuevo in (
          'confirmado',
          'en_preparacion',
          'cancelado'
        )

      when 'confirmado' then
        p_estado_nuevo in (
          'en_preparacion',
          'cancelado'
        )

      when 'en_preparacion' then
        p_estado_nuevo in (
          'listo',
          'cancelado'
        )

      when 'listo' then
        p_estado_nuevo = 'entregado'

      when 'entregado' then
        p_estado_nuevo = 'cerrado'

      else
        false
    end;

  if not v_estado_valido then
    raise exception
      'Transición no permitida: % -> %.',
      v_estado_actual,
      p_estado_nuevo;
  end if;

  -- ----------------------------------------------------------
  -- Permisos simples según rol
  -- ----------------------------------------------------------

  case v_rol

    when 'administrador' then
      -- El administrador puede ejecutar cualquier transición
      -- válida del flujo.
      null;

    when 'cocina' then
      if not (
        (
          v_estado_actual in (
            'pendiente',
            'confirmado'
          )
          and p_estado_nuevo = 'en_preparacion'
        )
        or
        (
          v_estado_actual = 'en_preparacion'
          and p_estado_nuevo = 'listo'
        )
      ) then
        raise exception
          'Cocina no está autorizada para realizar este cambio.';
      end if;

    when 'caja' then
      if not (
        (
          v_estado_actual = 'pendiente'
          and p_estado_nuevo in (
            'confirmado',
            'en_preparacion',
            'cancelado'
          )
        )
        or
        (
          v_estado_actual = 'confirmado'
          and p_estado_nuevo in (
            'en_preparacion',
            'cancelado'
          )
        )
        or
        (
          v_estado_actual = 'en_preparacion'
          and p_estado_nuevo = 'cancelado'
        )
        or
        (
          v_estado_actual = 'listo'
          and p_estado_nuevo = 'entregado'
        )
        or
        (
          v_estado_actual = 'entregado'
          and p_estado_nuevo = 'cerrado'
        )
      ) then
        raise exception
          'Caja no está autorizada para realizar este cambio.';
      end if;

    when 'mesero' then
      if not (
        (
          v_estado_actual = 'pendiente'
          and p_estado_nuevo = 'confirmado'
        )
        or
        (
          v_estado_actual = 'listo'
          and p_estado_nuevo = 'entregado'
        )
        or
        (
          v_estado_actual = 'entregado'
          and p_estado_nuevo = 'cerrado'
        )
      ) then
        raise exception
          'Mesero no está autorizado para realizar este cambio.';
      end if;

    else
      raise exception
        'El rol del usuario no está autorizado.';
  end case;

  -- ----------------------------------------------------------
  -- Cancelación con motivo obligatorio
  -- ----------------------------------------------------------

  v_observacion :=
    nullif(
      trim(
        coalesce(
          p_observacion,
          ''
        )
      ),
      ''
    );

  if p_estado_nuevo = 'cancelado'
     and v_observacion is null then
    raise exception
      'Debe ingresar el motivo de cancelación.';
  end if;

  -- La observación queda disponible para el trigger
  -- de historial únicamente durante esta transacción.

  perform set_config(
    'app.observacion_estado_pedido',
    coalesce(v_observacion, ''),
    true
  );

  -- ----------------------------------------------------------
  -- Actualizar pedido
  -- ----------------------------------------------------------

  update public.pedidos
  set
    estado = p_estado_nuevo,

    cerrado_en =
      case
        when p_estado_nuevo in (
          'cerrado',
          'cancelado'
        )
        then now()

        else cerrado_en
      end

  where id = p_pedido_id;

  -- ----------------------------------------------------------
  -- Respuesta para el frontend
  -- ----------------------------------------------------------

  return jsonb_build_object(
    'pedido_id',
    p_pedido_id,
    'ticket',
    v_ticket,
    'estado_anterior',
    v_estado_actual,
    'estado_nuevo',
    p_estado_nuevo,
    'actualizado',
    true,
    'actualizado_por',
    v_usuario_id,
    'rol',
    v_rol,
    'observacion',
    v_observacion
  );
end;
$$;

-- ============================================================
-- 3. PERMISOS DE EJECUCIÓN
-- ============================================================

revoke all on function public.actualizar_estado_pedido(
  uuid,
  public.estado_pedido,
  text
) from public;

grant execute on function public.actualizar_estado_pedido(
  uuid,
  public.estado_pedido,
  text
) to authenticated;

commit;
