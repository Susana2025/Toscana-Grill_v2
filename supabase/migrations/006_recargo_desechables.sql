-- Toscana Grill POS
-- Migración 006: recargo fijo por materiales desechables.
--
-- Regla:
-- - Consumo en mesa: $0,00
-- - Para llevar: $0,50 por pedido
-- - Delivery: $0,50 por pedido
--
-- El cálculo se realiza en PostgreSQL para impedir que
-- el navegador altere el precio final.

begin;

-- ============================================================
-- 1. ACTUALIZAR LA FUNCIÓN DE CREACIÓN DE PEDIDOS
-- ============================================================

create or replace function public.crear_pedido(
  p_tipo text,
  p_mesa_id bigint,
  p_cliente_nombre text,
  p_cliente_telefono text,
  p_direccion_entrega text,
  p_observaciones text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ticket text;
  v_token text;

  v_tipo public.tipo_pedido;

  v_item jsonb;
  v_producto record;

  v_producto_id bigint;
  v_cantidad integer;

  v_subtotal_item numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_recargo numeric(10,2) := 0;
  v_total numeric(10,2) := 0;

  v_usuario_id uuid;
  v_origen text := 'menu_publico';
begin
  -- ----------------------------------------------------------
  -- Validar el tipo de pedido
  -- ----------------------------------------------------------

  begin
    v_tipo := p_tipo::public.tipo_pedido;
  exception
    when invalid_text_representation then
      raise exception
        'Tipo de pedido no válido.';
  end;

  -- ----------------------------------------------------------
  -- Validar productos
  -- ----------------------------------------------------------

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then

    raise exception
      'El pedido debe contener productos.';

  end if;

  -- ----------------------------------------------------------
  -- Validar mesa
  -- ----------------------------------------------------------

  if v_tipo = 'mesa'
     and not exists (
       select 1
       from public.mesas mesa
       where mesa.id = p_mesa_id
         and mesa.activa = true
     ) then

    raise exception
      'Mesa no válida.';

  end if;

  -- ----------------------------------------------------------
  -- Validar dirección de delivery
  -- ----------------------------------------------------------

  if v_tipo = 'delivery'
     and nullif(
       trim(
         coalesce(
           p_direccion_entrega,
           ''
         )
       ),
       ''
     ) is null then

    raise exception
      'Dirección requerida.';

  end if;

  -- ----------------------------------------------------------
  -- Identificar usuario autenticado, cuando exista
  -- ----------------------------------------------------------

  select perfil.id
  into v_usuario_id
  from public.perfiles perfil
  where perfil.id = auth.uid()
    and perfil.activo = true;

  if v_usuario_id is not null then

    select
      case perfil.rol
        when 'mesero'
          then 'mesero'

        when 'caja'
          then 'caja'

        when 'administrador'
          then 'administrador'

        else 'menu_publico'
      end
    into v_origen
    from public.perfiles perfil
    where perfil.id = v_usuario_id;

  end if;

  -- ----------------------------------------------------------
  -- Generar ticket único
  -- ----------------------------------------------------------

  loop
    v_ticket :=
      'TG-' ||
      to_char(
        timezone(
          'America/Guayaquil',
          now()
        ),
        'YYYYMMDD'
      ) ||
      '-' ||
      upper(
        substr(
          replace(
            gen_random_uuid()::text,
            '-',
            ''
          ),
          1,
          6
        )
      );

    exit when not exists (
      select 1
      from public.pedidos pedido
      where pedido.ticket = v_ticket
    );
  end loop;

  -- ----------------------------------------------------------
  -- Generar token de consulta
  -- ----------------------------------------------------------

  v_token :=
    replace(
      gen_random_uuid()::text,
      '-',
      ''
    ) ||
    replace(
      gen_random_uuid()::text,
      '-',
      ''
    );

  -- ----------------------------------------------------------
  -- Calcular recargo de desechables
  -- ----------------------------------------------------------

  v_recargo :=
    case
      when v_tipo in (
        'para_llevar',
        'delivery'
      )
      then 0.50::numeric(10,2)

      else 0.00::numeric(10,2)
    end;

  -- ----------------------------------------------------------
  -- Crear cabecera del pedido
  -- ----------------------------------------------------------

  insert into public.pedidos (
    ticket,
    token_consulta,
    tipo,
    mesa_id,
    cliente_nombre,
    cliente_telefono,
    direccion_entrega,
    subtotal,
    recargo,
    total,
    observaciones,
    creado_por,
    origen
  )
  values (
    v_ticket,
    v_token,
    v_tipo,

    case
      when v_tipo = 'mesa'
      then p_mesa_id

      else null
    end,

    nullif(
      trim(
        coalesce(
          p_cliente_nombre,
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          p_cliente_telefono,
          ''
        )
      ),
      ''
    ),

    case
      when v_tipo = 'delivery'
      then nullif(
        trim(
          coalesce(
            p_direccion_entrega,
            ''
          )
        ),
        ''
      )

      else null
    end,

    0,
    v_recargo,
    v_recargo,

    nullif(
      trim(
        coalesce(
          p_observaciones,
          ''
        )
      ),
      ''
    ),

    v_usuario_id,
    v_origen
  )
  returning id
  into v_id;

  -- ----------------------------------------------------------
  -- Crear detalle y calcular subtotal
  -- ----------------------------------------------------------

  for v_item in
    select value
    from jsonb_array_elements(
      p_items
    )
  loop
    begin
      v_producto_id :=
        (
          v_item ->> 'producto_id'
        )::bigint;

      v_cantidad :=
        (
          v_item ->> 'cantidad'
        )::integer;
    exception
      when others then
        raise exception
          'Existe un producto con datos no válidos.';
    end;

    if v_cantidad is null
       or v_cantidad <= 0
       or v_cantidad > 100 then

      raise exception
        'Cantidad no válida.';

    end if;

    select
      producto.id,
      producto.nombre,
      producto.precio
    into v_producto
    from public.productos producto
    where producto.id = v_producto_id
      and producto.activo = true
      and producto.disponible = true;

    if not found then
      raise exception
        'Producto no disponible: %',
        v_producto_id;
    end if;

    v_subtotal_item :=
      round(
        v_producto.precio *
        v_cantidad,
        2
      );

    insert into public.detalle_pedido (
      pedido_id,
      producto_id,
      producto_nombre,
      cantidad,
      precio_unitario,
      subtotal,
      observaciones
    )
    values (
      v_id,
      v_producto.id,
      v_producto.nombre,
      v_cantidad,
      v_producto.precio,
      v_subtotal_item,

      nullif(
        trim(
          coalesce(
            v_item ->> 'observaciones',
            ''
          )
        ),
        ''
      )
    );

    v_subtotal :=
      v_subtotal +
      v_subtotal_item;
  end loop;

  -- ----------------------------------------------------------
  -- Calcular total definitivo
  -- ----------------------------------------------------------

  v_subtotal :=
    round(
      v_subtotal,
      2
    );

  v_total :=
    round(
      v_subtotal +
      v_recargo,
      2
    );

  update public.pedidos
  set
    subtotal = v_subtotal,
    recargo = v_recargo,
    total = v_total
  where id = v_id;

  -- ----------------------------------------------------------
  -- Respuesta para la interfaz
  -- ----------------------------------------------------------

  return jsonb_build_object(
    'pedido_id',
    v_id,

    'ticket',
    v_ticket,

    'token_consulta',
    v_token,

    'estado',
    'pendiente',

    'tipo',
    v_tipo,

    'subtotal',
    v_subtotal,

    'recargo',
    v_recargo,

    'total',
    v_total
  );
end;
$$;

-- ============================================================
-- 2. RESTABLECER PERMISOS
-- ============================================================

revoke all
on function public.crear_pedido(
  text,
  bigint,
  text,
  text,
  text,
  text,
  jsonb
)
from public;

grant execute
on function public.crear_pedido(
  text,
  bigint,
  text,
  text,
  text,
  text,
  jsonb
)
to anon, authenticated;

-- ============================================================
-- 3. ACTUALIZAR EL DETALLE ADMINISTRATIVO DEL PEDIDO
-- ============================================================

create or replace function public.obtener_detalle_pedido(
  p_pedido_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_rol public.rol_usuario;

  v_pedido record;
  v_items jsonb;
begin
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
      'Usuario no autenticado.';
  end if;

  select
    pedido.*,
    mesa.numero as mesa_numero,
    mesa.nombre as mesa_nombre
  into v_pedido
  from public.pedidos pedido
  left join public.mesas mesa
    on mesa.id = pedido.mesa_id
  where pedido.id = p_pedido_id;

  if not found then
    raise exception
      'Pedido no encontrado.';
  end if;

  if v_rol = 'mesero'
     and v_pedido.creado_por is distinct from v_usuario_id then

    raise exception
      'Acceso denegado.';

  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'producto',
          detalle.producto_nombre,

          'cantidad',
          detalle.cantidad,

          'precio_unitario',
          detalle.precio_unitario,

          'subtotal',
          detalle.subtotal,

          'observaciones',
          detalle.observaciones
        )
        order by detalle.id
      ),
      '[]'::jsonb
    )
  into v_items
  from public.detalle_pedido detalle
  where detalle.pedido_id = p_pedido_id;

  return jsonb_build_object(
    'pedido_id',
    v_pedido.id,

    'ticket',
    v_pedido.ticket,

    'tipo',
    v_pedido.tipo,

    'mesa',
    case
      when v_pedido.tipo = 'mesa'
      then jsonb_build_object(
        'numero',
        v_pedido.mesa_numero,

        'nombre',
        v_pedido.mesa_nombre
      )

      else null
    end,

    'cliente_nombre',
    v_pedido.cliente_nombre,

    'cliente_telefono',
    v_pedido.cliente_telefono,

    'direccion_entrega',
    v_pedido.direccion_entrega,

    'estado',
    v_pedido.estado,

    'estado_pago',
    v_pedido.estado_pago,

    'subtotal',
    v_pedido.subtotal,

    'recargo',
    v_pedido.recargo,

    'descuento',
    v_pedido.descuento,

    'total',
    v_pedido.total,

    'observaciones',
    v_pedido.observaciones,

    'creado_en',
    v_pedido.creado_en,

    'detalle',
    v_items
  );
end;
$$;

revoke all
on function public.obtener_detalle_pedido(uuid)
from public;

grant execute
on function public.obtener_detalle_pedido(uuid)
to authenticated;

commit;
