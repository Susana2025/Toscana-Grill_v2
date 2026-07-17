-- ============================================================
-- TOSCANA GRILL
-- Migración 007: delivery, confirmación y seguimiento
--
-- Reglas:
-- 1. Consumo en mesa:
--      - Sin desechables.
--      - Sin costo de delivery.
--
-- 2. Para llevar:
--      - Desechables: USD 0.50.
--      - Sin costo de delivery.
--
-- 3. Delivery dentro de zona urbana:
--      - Desechables: USD 0.50.
--      - Delivery: USD 2.00.
--      - Teléfono móvil ecuatoriano obligatorio.
--      - Confirmación del cliente obligatoria.
--
-- 4. Delivery fuera de zona urbana:
--      - Desechables: USD 0.50.
--      - Delivery pendiente de confirmación.
--      - El costo de delivery no se suma inicialmente.
--      - Teléfono móvil ecuatoriano obligatorio.
--      - Confirmación del cliente obligatoria.
-- ============================================================

begin;

-- ============================================================
-- 1. CAMPOS NUEVOS EN PEDIDOS
-- ============================================================

alter table public.pedidos
  add column if not exists zona_delivery text;

alter table public.pedidos
  add column if not exists costo_delivery numeric(10,2)
  not null default 0;

alter table public.pedidos
  add column if not exists delivery_por_confirmar boolean
  not null default false;

alter table public.pedidos
  add column if not exists acepta_confirmacion_delivery boolean
  not null default false;

alter table public.pedidos
  add column if not exists telefono_normalizado text;

alter table public.pedidos
  add column if not exists delivery_confirmado boolean
  not null default false;

alter table public.pedidos
  add column if not exists delivery_confirmado_por uuid;

alter table public.pedidos
  add column if not exists delivery_confirmado_en timestamptz;

alter table public.pedidos
  add column if not exists costo_delivery_confirmado numeric(10,2);

alter table public.pedidos
  add column if not exists total_preliminar boolean
  not null default false;

-- ============================================================
-- 2. RESTRICCIONES
-- ============================================================

alter table public.pedidos
  drop constraint if exists pedidos_zona_delivery_check;

alter table public.pedidos
  add constraint pedidos_zona_delivery_check
  check (
    zona_delivery is null
    or zona_delivery in ('urbana', 'fuera_urbana')
  );

alter table public.pedidos
  drop constraint if exists pedidos_costo_delivery_check;

alter table public.pedidos
  add constraint pedidos_costo_delivery_check
  check (costo_delivery >= 0);

alter table public.pedidos
  drop constraint if exists pedidos_costo_delivery_confirmado_check;

alter table public.pedidos
  add constraint pedidos_costo_delivery_confirmado_check
  check (
    costo_delivery_confirmado is null
    or costo_delivery_confirmado >= 0
  );

-- ============================================================
-- 3. ÍNDICES
-- ============================================================

create index if not exists idx_pedidos_delivery_por_confirmar
  on public.pedidos (delivery_por_confirmar)
  where delivery_por_confirmar = true;

create index if not exists idx_pedidos_telefono_normalizado
  on public.pedidos (telefono_normalizado);

create index if not exists idx_pedidos_token_consulta
  on public.pedidos (token_consulta);

-- ============================================================
-- 4. NORMALIZACIÓN DE TELÉFONO ECUATORIANO
-- ============================================================

create or replace function public.normalizar_telefono_ecuador(
  p_telefono text
)
returns text
language plpgsql
immutable
as $$
declare
  v_telefono text;
begin
  if p_telefono is null then
    return null;
  end if;

  -- Conserva únicamente números.
  v_telefono := regexp_replace(
    trim(p_telefono),
    '[^0-9]',
    '',
    'g'
  );

  -- +593 9XXXXXXXX
  if v_telefono ~ '^5939[0-9]{8}$' then
    return '0' || substring(v_telefono from 4);
  end if;

  -- 593 9XXXXXXXX
  if v_telefono ~ '^5939[0-9]{8}$' then
    return '0' || substring(v_telefono from 4);
  end if;

  -- 09XXXXXXXX
  if v_telefono ~ '^09[0-9]{8}$' then
    return v_telefono;
  end if;

  return null;
end;
$$;

comment on function public.normalizar_telefono_ecuador(text)
is 'Normaliza números móviles ecuatorianos a formato 09XXXXXXXX.';

-- ============================================================
-- 5. ELIMINAR VERSIONES ANTERIORES DE CREAR_PEDIDO
-- ============================================================

drop function if exists public.crear_pedido(
  text,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
);

drop function if exists public.crear_pedido(
  text,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  boolean
);

-- ============================================================
-- 6. CREAR PEDIDO
-- ============================================================

create function public.crear_pedido(
  p_tipo text,
  p_mesa_id uuid,
  p_cliente_nombre text,
  p_cliente_telefono text,
  p_direccion_entrega text,
  p_observaciones text,
  p_items jsonb,
  p_zona_delivery text default null,
  p_acepta_confirmacion_delivery boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_ticket text;
  v_token_consulta uuid;

  v_subtotal numeric(10,2) := 0;
  v_recargo numeric(10,2) := 0;
  v_costo_delivery numeric(10,2) := 0;
  v_total numeric(10,2) := 0;

  v_delivery_por_confirmar boolean := false;
  v_delivery_confirmado boolean := false;
  v_total_preliminar boolean := false;

  v_telefono_normalizado text;
  v_direccion text;
  v_cliente_nombre text;
  v_observaciones text;

  v_item jsonb;
  v_producto_id uuid;
  v_producto_nombre text;
  v_precio_unitario numeric(10,2);
  v_cantidad integer;
  v_observacion_item text;
  v_subtotal_item numeric(10,2);

  v_mesa_activa boolean;
begin
  -- ==========================================================
  -- VALIDACIÓN DEL TIPO DE PEDIDO
  -- ==========================================================

  p_tipo := lower(trim(coalesce(p_tipo, '')));

  if p_tipo not in ('mesa', 'para_llevar', 'delivery') then
    raise exception
      'El tipo de pedido no es válido.';
  end if;

  -- ==========================================================
  -- VALIDACIÓN DE PRODUCTOS
  -- ==========================================================

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception
      'El pedido debe contener al menos un producto.';
  end if;

  -- ==========================================================
  -- NORMALIZACIÓN DE DATOS GENERALES
  -- ==========================================================

  v_cliente_nombre :=
    nullif(trim(coalesce(p_cliente_nombre, '')), '');

  v_direccion :=
    nullif(trim(coalesce(p_direccion_entrega, '')), '');

  v_observaciones :=
    nullif(trim(coalesce(p_observaciones, '')), '');

  v_telefono_normalizado :=
    public.normalizar_telefono_ecuador(p_cliente_telefono);

  -- ==========================================================
  -- REGLAS PARA CONSUMO EN MESA
  -- ==========================================================

  if p_tipo = 'mesa' then
    if p_mesa_id is null then
      raise exception
        'Debe seleccionar una mesa.';
    end if;

    select m.activa
      into v_mesa_activa
    from public.mesas m
    where m.id = p_mesa_id;

    if not found then
      raise exception
        'La mesa seleccionada no existe.';
    end if;

    if coalesce(v_mesa_activa, false) = false then
      raise exception
        'La mesa seleccionada no está activa.';
    end if;

    p_zona_delivery := null;
    p_acepta_confirmacion_delivery := false;

    v_recargo := 0;
    v_costo_delivery := 0;
    v_delivery_por_confirmar := false;
    v_delivery_confirmado := false;
    v_total_preliminar := false;
  end if;

  -- ==========================================================
  -- REGLAS PARA LLEVAR
  -- ==========================================================

  if p_tipo = 'para_llevar' then
    p_mesa_id := null;
    p_zona_delivery := null;
    p_acepta_confirmacion_delivery := false;

    v_recargo := 0.50;
    v_costo_delivery := 0;
    v_delivery_por_confirmar := false;
    v_delivery_confirmado := false;
    v_total_preliminar := false;
  end if;

  -- ==========================================================
  -- REGLAS PARA DELIVERY
  -- ==========================================================

  if p_tipo = 'delivery' then
    p_mesa_id := null;

    if v_direccion is null then
      raise exception
        'Debe ingresar la dirección de entrega.';
    end if;

    if v_telefono_normalizado is null then
      raise exception
        'Debe ingresar un número móvil ecuatoriano válido.';
    end if;

    if p_zona_delivery is null
       or lower(trim(p_zona_delivery)) not in (
         'urbana',
         'fuera_urbana'
       ) then
      raise exception
        'Debe seleccionar la zona de entrega.';
    end if;

    p_zona_delivery :=
      lower(trim(p_zona_delivery));

    if coalesce(
      p_acepta_confirmacion_delivery,
      false
    ) = false then
      raise exception
        'Debe aceptar la confirmación y contacto del restaurante.';
    end if;

    v_recargo := 0.50;

    if p_zona_delivery = 'urbana' then
      v_costo_delivery := 2.00;
      v_delivery_por_confirmar := false;
      v_delivery_confirmado := true;
      v_total_preliminar := false;
    else
      v_costo_delivery := 0;
      v_delivery_por_confirmar := true;
      v_delivery_confirmado := false;
      v_total_preliminar := true;
    end if;
  end if;

  -- ==========================================================
  -- CÁLCULO DEL SUBTOTAL
  -- ==========================================================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_producto_id :=
        (v_item ->> 'producto_id')::uuid;
    exception
      when others then
        raise exception
          'Uno de los productos posee un identificador inválido.';
    end;

    begin
      v_cantidad :=
        (v_item ->> 'cantidad')::integer;
    exception
      when others then
        raise exception
          'Uno de los productos posee una cantidad inválida.';
    end;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception
        'La cantidad de cada producto debe ser mayor a cero.';
    end if;

    select
      p.nombre,
      p.precio
    into
      v_producto_nombre,
      v_precio_unitario
    from public.productos p
    where p.id = v_producto_id
      and p.activo = true
      and p.disponible = true;

    if not found then
      raise exception
        'Uno de los productos ya no se encuentra disponible.';
    end if;

    v_subtotal_item :=
      round(
        v_precio_unitario * v_cantidad,
        2
      );

    v_subtotal :=
      v_subtotal + v_subtotal_item;
  end loop;

  v_subtotal :=
    round(v_subtotal, 2);

  v_total :=
    round(
      v_subtotal
      + v_recargo
      + v_costo_delivery,
      2
    );

  -- ==========================================================
  -- GENERACIÓN DE TICKET Y TOKEN
  -- ==========================================================

  v_ticket :=
    'TG-'
    || to_char(
      timezone(
        'America/Guayaquil',
        now()
      ),
      'YYYYMMDD-HH24MISS'
    )
    || '-'
    || upper(
      substring(
        replace(
          gen_random_uuid()::text,
          '-',
          ''
        )
        from 1 for 4
      )
    );

  v_token_consulta :=
    gen_random_uuid();

  -- ==========================================================
  -- REGISTRO DEL PEDIDO
  -- ==========================================================

  insert into public.pedidos (
    ticket,
    token_consulta,
    tipo,
    mesa_id,
    cliente_nombre,
    cliente_telefono,
    telefono_normalizado,
    direccion_entrega,
    observaciones,
    estado,
    subtotal,
    recargo,
    costo_delivery,
    total,
    zona_delivery,
    delivery_por_confirmar,
    acepta_confirmacion_delivery,
    delivery_confirmado,
    costo_delivery_confirmado,
    total_preliminar,
    creado_en,
    actualizado_en
  )
  values (
    v_ticket,
    v_token_consulta,
    p_tipo,
    p_mesa_id,
    v_cliente_nombre,
    nullif(trim(coalesce(p_cliente_telefono, '')), ''),
    v_telefono_normalizado,
    case
      when p_tipo = 'delivery'
        then v_direccion
      else null
    end,
    v_observaciones,
    'pendiente',
    v_subtotal,
    v_recargo,
    v_costo_delivery,
    v_total,
    case
      when p_tipo = 'delivery'
        then p_zona_delivery
      else null
    end,
    v_delivery_por_confirmar,
    case
      when p_tipo = 'delivery'
        then p_acepta_confirmacion_delivery
      else false
    end,
    v_delivery_confirmado,
    case
      when p_tipo = 'delivery'
       and p_zona_delivery = 'urbana'
        then 2.00
      else null
    end,
    v_total_preliminar,
    now(),
    now()
  )
  returning id
  into v_pedido_id;

  -- ==========================================================
  -- REGISTRO DEL DETALLE
  -- ==========================================================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_producto_id :=
      (v_item ->> 'producto_id')::uuid;

    v_cantidad :=
      (v_item ->> 'cantidad')::integer;

    v_observacion_item :=
      nullif(
        trim(
          coalesce(
            v_item ->> 'observaciones',
            ''
          )
        ),
        ''
      );

    select
      p.nombre,
      p.precio
    into
      v_producto_nombre,
      v_precio_unitario
    from public.productos p
    where p.id = v_producto_id
      and p.activo = true
      and p.disponible = true;

    v_subtotal_item :=
      round(
        v_precio_unitario * v_cantidad,
        2
      );

    insert into public.pedido_detalles (
      pedido_id,
      producto_id,
      producto_nombre,
      cantidad,
      precio_unitario,
      subtotal,
      observaciones
    )
    values (
      v_pedido_id,
      v_producto_id,
      v_producto_nombre,
      v_cantidad,
      v_precio_unitario,
      v_subtotal_item,
      v_observacion_item
    );
  end loop;

  -- ==========================================================
  -- RESPUESTA
  -- ==========================================================

  return jsonb_build_object(
    'id',
    v_pedido_id,

    'ticket',
    v_ticket,

    'token_consulta',
    v_token_consulta,

    'estado',
    'pendiente',

    'tipo',
    p_tipo,

    'subtotal',
    v_subtotal,

    'recargo',
    v_recargo,

    'costo_delivery',
    v_costo_delivery,

    'total',
    v_total,

    'zona_delivery',
    case
      when p_tipo = 'delivery'
        then p_zona_delivery
      else null
    end,

    'delivery_por_confirmar',
    v_delivery_por_confirmar,

    'delivery_confirmado',
    v_delivery_confirmado,

    'total_preliminar',
    v_total_preliminar,

    'telefono',
    v_telefono_normalizado,

    'mensaje_delivery',
    case
      when p_tipo <> 'delivery'
        then null

      when p_zona_delivery = 'urbana'
        then
          'El costo de delivery dentro de la zona urbana es de $2,00.'

      else
        'El costo de delivery fuera de la zona urbana será confirmado por Toscana Grill.'
    end
  );
end;
$$;

comment on function public.crear_pedido(
  text,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  boolean
)
is 'Registra pedidos y aplica las reglas de mesa, para llevar y delivery de Toscana Grill.';

grant execute
on function public.crear_pedido(
  text,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  boolean
)
to anon, authenticated;

-- ============================================================
-- 7. CONSULTA PÚBLICA DEL PEDIDO MEDIANTE TOKEN
-- ============================================================

drop function if exists public.consultar_pedido(uuid);

create function public.consultar_pedido(
  p_token_consulta uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if p_token_consulta is null then
    raise exception
      'El token de consulta es obligatorio.';
  end if;

  select jsonb_build_object(
    'ticket',
    p.ticket,

    'estado',
    p.estado,

    'tipo',
    p.tipo,

    'cliente_nombre',
    p.cliente_nombre,

    'mesa',
    case
      when p.tipo = 'mesa'
        then coalesce(
          m.nombre,
          'Mesa ' || m.numero::text
        )
      else null
    end,

    'zona_delivery',
    p.zona_delivery,

    'direccion_entrega',
    case
      when p.tipo = 'delivery'
        then p.direccion_entrega
      else null
    end,

    'subtotal',
    p.subtotal,

    'recargo',
    p.recargo,

    'costo_delivery',
    p.costo_delivery,

    'costo_delivery_confirmado',
    p.costo_delivery_confirmado,

    'delivery_por_confirmar',
    p.delivery_por_confirmar,

    'delivery_confirmado',
    p.delivery_confirmado,

    'total_preliminar',
    p.total_preliminar,

    'total',
    p.total,

    'creado_en',
    p.creado_en,

    'actualizado_en',
    p.actualizado_en,

    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'producto_nombre',
            d.producto_nombre,
            'cantidad',
            d.cantidad,
            'precio_unitario',
            d.precio_unitario,
            'subtotal',
            d.subtotal,
            'observaciones',
            d.observaciones
          )
          order by d.id
        )
        from public.pedido_detalles d
        where d.pedido_id = p.id
      ),
      '[]'::jsonb
    )
  )
  into v_resultado
  from public.pedidos p
  left join public.mesas m
    on m.id = p.mesa_id
  where p.token_consulta = p_token_consulta;

  if v_resultado is null then
    raise exception
      'No se encontró un pedido con el código proporcionado.';
  end if;

  return v_resultado;
end;
$$;

grant execute
on function public.consultar_pedido(uuid)
to anon, authenticated;

-- ============================================================
-- 8. CONFIRMACIÓN DEL COSTO FUERA DE ZONA
-- Solo para usuarios autenticados.
-- ============================================================

drop function if exists public.confirmar_costo_delivery(
  uuid,
  numeric
);

create function public.confirmar_costo_delivery(
  p_pedido_id uuid,
  p_costo_delivery numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_zona text;
  v_subtotal numeric(10,2);
  v_recargo numeric(10,2);
  v_total numeric(10,2);
  v_ticket text;
begin
  if auth.uid() is null then
    raise exception
      'Debe iniciar sesión para confirmar el costo del delivery.';
  end if;

  if p_pedido_id is null then
    raise exception
      'El pedido es obligatorio.';
  end if;

  if p_costo_delivery is null
     or p_costo_delivery < 0 then
    raise exception
      'El costo de delivery no es válido.';
  end if;

  select
    p.tipo,
    p.zona_delivery,
    p.subtotal,
    p.recargo,
    p.ticket
  into
    v_tipo,
    v_zona,
    v_subtotal,
    v_recargo,
    v_ticket
  from public.pedidos p
  where p.id = p_pedido_id
  for update;

  if not found then
    raise exception
      'El pedido no existe.';
  end if;

  if v_tipo <> 'delivery'
     or v_zona <> 'fuera_urbana' then
    raise exception
      'El pedido no requiere confirmación de delivery fuera de zona.';
  end if;

  v_total :=
    round(
      v_subtotal
      + v_recargo
      + p_costo_delivery,
      2
    );

  update public.pedidos
  set
    costo_delivery =
      round(p_costo_delivery, 2),

    costo_delivery_confirmado =
      round(p_costo_delivery, 2),

    delivery_por_confirmar =
      false,

    delivery_confirmado =
      true,

    delivery_confirmado_por =
      auth.uid(),

    delivery_confirmado_en =
      now(),

    total_preliminar =
      false,

    total =
      v_total,

    actualizado_en =
      now()
  where id = p_pedido_id;

  return jsonb_build_object(
    'id',
    p_pedido_id,

    'ticket',
    v_ticket,

    'costo_delivery',
    round(
      p_costo_delivery,
      2
    ),

    'delivery_confirmado',
    true,

    'total_preliminar',
    false,

    'total',
    v_total
  );
end;
$$;

grant execute
on function public.confirmar_costo_delivery(
  uuid,
  numeric
)
to authenticated;

commit;
