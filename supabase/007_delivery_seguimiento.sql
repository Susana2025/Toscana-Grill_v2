-- ============================================================
-- TOSCANA GRILL
-- MIGRACIÓN 007
-- Delivery, tickets legibles y seguimiento público seguro
--
-- Formato del ticket:
-- TG-YYMMDD-NNNN
-- Ejemplo:
-- TG-250716-1042
--
-- Reglas comerciales:
--
-- MESA
-- - Desechables: $0.00
-- - Delivery: $0.00
--
-- PARA LLEVAR
-- - Desechables: $0.50
-- - Delivery: $0.00
--
-- DELIVERY DENTRO DE ZONA URBANA
-- - Desechables: $0.50
-- - Delivery: $2.00
-- - Teléfono móvil ecuatoriano obligatorio
-- - Dirección obligatoria
-- - Confirmación obligatoria
--
-- DELIVERY FUERA DE ZONA URBANA
-- - Desechables: $0.50
-- - Delivery pendiente de confirmación
-- - El total inicial es preliminar
-- - Teléfono móvil ecuatoriano obligatorio
-- - Dirección obligatoria
-- - Confirmación obligatoria
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- 1. CAMPOS ADICIONALES EN PEDIDOS
-- ============================================================

alter table public.pedidos
  add column if not exists telefono_normalizado text;

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
  add column if not exists delivery_confirmado boolean
  not null default false;

alter table public.pedidos
  add column if not exists costo_delivery_confirmado numeric(10,2);

alter table public.pedidos
  add column if not exists delivery_confirmado_por uuid
  references public.perfiles(id)
  on delete set null;

alter table public.pedidos
  add column if not exists delivery_confirmado_en timestamptz;

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
    or zona_delivery in (
      'urbana',
      'fuera_urbana'
    )
  );

alter table public.pedidos
  drop constraint if exists pedidos_costo_delivery_check;

alter table public.pedidos
  add constraint pedidos_costo_delivery_check
  check (
    costo_delivery >= 0
  );

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

create index if not exists idx_pedidos_ticket
  on public.pedidos(ticket);

create index if not exists idx_pedidos_token_consulta
  on public.pedidos(token_consulta);

create index if not exists idx_pedidos_telefono_normalizado
  on public.pedidos(telefono_normalizado);

create index if not exists idx_pedidos_delivery_pendiente
  on public.pedidos(delivery_por_confirmar)
  where delivery_por_confirmar = true;

create index if not exists idx_pedidos_zona_delivery
  on public.pedidos(zona_delivery)
  where zona_delivery is not null;

-- ============================================================
-- 4. TABLA DE CORRELATIVOS DIARIOS
--
-- Evita tickets duplicados cuando dos clientes confirman
-- pedidos al mismo tiempo.
-- ============================================================

create table if not exists public.correlativos_ticket (
  fecha date primary key,
  ultimo_numero integer not null default 0,
  actualizado_en timestamptz not null default now(),

  constraint correlativos_ticket_numero_check
    check (ultimo_numero >= 0)
);

alter table public.correlativos_ticket
  enable row level security;

revoke all
on table public.correlativos_ticket
from public, anon, authenticated;

-- ============================================================
-- 5. NORMALIZAR TELÉFONO ECUATORIANO
--
-- Formatos aceptados:
-- 0999999999
-- 593999999999
-- +593999999999
--
-- Resultado:
-- 0999999999
-- ============================================================

create or replace function public.normalizar_telefono_ecuador(
  p_telefono text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_telefono text;
begin
  if p_telefono is null then
    return null;
  end if;

  v_telefono :=
    regexp_replace(
      trim(p_telefono),
      '[^0-9]',
      '',
      'g'
    );

  if v_telefono ~ '^09[0-9]{8}$' then
    return v_telefono;
  end if;

  if v_telefono ~ '^5939[0-9]{8}$' then
    return
      '0'
      || substring(
        v_telefono
        from 4
      );
  end if;

  return null;
end;
$$;

comment on function public.normalizar_telefono_ecuador(text)
is
'Normaliza teléfonos móviles ecuatorianos al formato 09XXXXXXXX.';

revoke all
on function public.normalizar_telefono_ecuador(text)
from public;

grant execute
on function public.normalizar_telefono_ecuador(text)
to anon, authenticated;

-- ============================================================
-- 6. GENERAR TICKET DIARIO
--
-- Formato:
-- TG-YYMMDD-NNNN
-- ============================================================

create or replace function public.generar_ticket_pedido()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha_ecuador date;
  v_numero integer;
  v_ticket text;
begin
  v_fecha_ecuador :=
    timezone(
      'America/Guayaquil',
      now()
    )::date;

  insert into public.correlativos_ticket (
    fecha,
    ultimo_numero,
    actualizado_en
  )
  values (
    v_fecha_ecuador,
    1,
    now()
  )
  on conflict (fecha)
  do update
  set
    ultimo_numero =
      public.correlativos_ticket.ultimo_numero + 1,

    actualizado_en =
      now()
  returning ultimo_numero
  into v_numero;

  if v_numero > 9999 then
    raise exception
      'Se alcanzó el límite diario de tickets.';
  end if;

  v_ticket :=
    'TG-'
    || to_char(
      v_fecha_ecuador,
      'YYMMDD'
    )
    || '-'
    || lpad(
      v_numero::text,
      4,
      '0'
    );

  return v_ticket;
end;
$$;

comment on function public.generar_ticket_pedido()
is
'Genera tickets correlativos diarios con formato TG-YYMMDD-NNNN.';

revoke all
on function public.generar_ticket_pedido()
from public, anon, authenticated;

-- ============================================================
-- 7. ELIMINAR VERSIONES ANTERIORES DE CREAR_PEDIDO
-- ============================================================

drop function if exists public.crear_pedido(
  text,
  bigint,
  text,
  text,
  text,
  text,
  jsonb
);

drop function if exists public.crear_pedido(
  text,
  bigint,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  boolean
);

-- ============================================================
-- 8. CREAR PEDIDO
-- ============================================================

create function public.crear_pedido(
  p_tipo text,
  p_mesa_id bigint,
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
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_ticket text;
  v_token_consulta text;

  v_tipo public.tipo_pedido;

  v_cliente_nombre text;
  v_cliente_telefono text;
  v_telefono_normalizado text;
  v_direccion_entrega text;
  v_observaciones text;
  v_zona_delivery text;

  v_usuario_id uuid;
  v_origen text := 'menu_publico';

  v_item jsonb;
  v_producto record;
  v_producto_id bigint;
  v_cantidad integer;
  v_observacion_item text;
  v_subtotal_item numeric(10,2);

  v_subtotal numeric(10,2) := 0;
  v_recargo numeric(10,2) := 0;
  v_costo_delivery numeric(10,2) := 0;
  v_total numeric(10,2) := 0;

  v_delivery_por_confirmar boolean := false;
  v_delivery_confirmado boolean := false;
  v_total_preliminar boolean := false;

  v_mesa_valida boolean := false;
begin
  -- ==========================================================
  -- VALIDAR TIPO DE PEDIDO
  -- ==========================================================

  begin
    v_tipo :=
      lower(
        trim(
          coalesce(
            p_tipo,
            ''
          )
        )
      )::public.tipo_pedido;
  exception
    when invalid_text_representation then
      raise exception
        'El tipo de pedido no es válido.';
  end;

  -- ==========================================================
  -- VALIDAR PRODUCTOS
  -- ==========================================================

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception
      'El pedido debe contener al menos un producto.';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception
      'El pedido supera el número máximo de productos.';
  end if;

  -- ==========================================================
  -- NORMALIZAR DATOS
  -- ==========================================================

  v_cliente_nombre :=
    nullif(
      trim(
        coalesce(
          p_cliente_nombre,
          ''
        )
      ),
      ''
    );

  v_cliente_telefono :=
    nullif(
      trim(
        coalesce(
          p_cliente_telefono,
          ''
        )
      ),
      ''
    );

  v_telefono_normalizado :=
    public.normalizar_telefono_ecuador(
      v_cliente_telefono
    );

  v_direccion_entrega :=
    nullif(
      trim(
        coalesce(
          p_direccion_entrega,
          ''
        )
      ),
      ''
    );

  v_observaciones :=
    nullif(
      trim(
        coalesce(
          p_observaciones,
          ''
        )
      ),
      ''
    );

  v_zona_delivery :=
    nullif(
      lower(
        trim(
          coalesce(
            p_zona_delivery,
            ''
          )
        )
      ),
      ''
    );

  -- ==========================================================
  -- IDENTIFICAR PERSONAL AUTENTICADO
  -- ==========================================================

  select p.id
  into v_usuario_id
  from public.perfiles p
  where p.id = auth.uid()
    and p.activo = true;

  if v_usuario_id is not null then
    select
      case p.rol
        when 'mesero'
          then 'mesero'

        when 'caja'
          then 'caja'

        when 'administrador'
          then 'administrador'

        else 'menu_publico'
      end
    into v_origen
    from public.perfiles p
    where p.id = v_usuario_id;
  end if;

  -- ==========================================================
  -- REGLAS: CONSUMO EN MESA
  -- ==========================================================

  if v_tipo = 'mesa' then
    if p_mesa_id is null then
      raise exception
        'Debe seleccionar una mesa.';
    end if;

    select exists(
      select 1
      from public.mesas m
      where m.id = p_mesa_id
        and m.activa = true
    )
    into v_mesa_valida;

    if v_mesa_valida = false then
      raise exception
        'La mesa seleccionada no existe o está inactiva.';
    end if;

    v_recargo := 0;
    v_costo_delivery := 0;
    v_delivery_por_confirmar := false;
    v_delivery_confirmado := false;
    v_total_preliminar := false;
    v_zona_delivery := null;
    v_direccion_entrega := null;
  end if;

  -- ==========================================================
  -- REGLAS: PARA LLEVAR
  -- ==========================================================

  if v_tipo = 'para_llevar' then
    p_mesa_id := null;

    v_recargo := 0.50;
    v_costo_delivery := 0;
    v_delivery_por_confirmar := false;
    v_delivery_confirmado := false;
    v_total_preliminar := false;
    v_zona_delivery := null;
    v_direccion_entrega := null;
  end if;

  -- ==========================================================
  -- REGLAS: DELIVERY
  -- ==========================================================

  if v_tipo = 'delivery' then
    p_mesa_id := null;

    if v_telefono_normalizado is null then
      raise exception
        'Debe ingresar un número móvil ecuatoriano válido.';
    end if;

    if v_direccion_entrega is null then
      raise exception
        'Debe ingresar la dirección de entrega.';
    end if;

    if v_zona_delivery is null
      or v_zona_delivery not in (
        'urbana',
        'fuera_urbana'
      )
    then
      raise exception
        'Debe seleccionar una zona de entrega válida.';
    end if;

    if coalesce(
      p_acepta_confirmacion_delivery,
      false
    ) = false
    then
      raise exception
        'Debe aceptar la confirmación del pedido y del delivery.';
    end if;

    v_recargo := 0.50;

    if v_zona_delivery = 'urbana' then
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
  -- VALIDAR Y CALCULAR PRODUCTOS
  -- ==========================================================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_producto_id :=
        (v_item ->> 'producto_id')::bigint;
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

    if v_producto_id is null then
      raise exception
        'Uno de los productos no posee identificador.';
    end if;

    if v_cantidad is null
      or v_cantidad <= 0
      or v_cantidad > 100
    then
      raise exception
        'La cantidad de cada producto debe estar entre 1 y 100.';
    end if;

    select
      p.id,
      p.nombre,
      p.precio
    into v_producto
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
        v_producto.precio * v_cantidad,
        2
      );

    v_subtotal :=
      v_subtotal + v_subtotal_item;
  end loop;

  v_subtotal :=
    round(
      v_subtotal,
      2
    );

  v_total :=
    round(
      v_subtotal
      + v_recargo
      + v_costo_delivery,
      2
    );

  -- ==========================================================
  -- GENERAR TICKET Y TOKEN PRIVADO
  -- ==========================================================

  v_ticket :=
    public.generar_ticket_pedido();

  v_token_consulta :=
    replace(
      gen_random_uuid()::text,
      '-',
      ''
    )
    ||
    replace(
      gen_random_uuid()::text,
      '-',
      ''
    );

  -- ==========================================================
  -- REGISTRAR CABECERA DEL PEDIDO
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
    estado,
    estado_pago,
    subtotal,
    recargo,
    descuento,
    costo_delivery,
    total,
    observaciones,
    creado_por,
    origen,
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
    v_tipo,

    case
      when v_tipo = 'mesa'
        then p_mesa_id
      else null
    end,

    v_cliente_nombre,
    v_cliente_telefono,
    v_telefono_normalizado,

    case
      when v_tipo = 'delivery'
        then v_direccion_entrega
      else null
    end,

    'pendiente',
    'pendiente',
    v_subtotal,
    v_recargo,
    0,
    v_costo_delivery,
    v_total,
    v_observaciones,
    v_usuario_id,
    v_origen,

    case
      when v_tipo = 'delivery'
        then v_zona_delivery
      else null
    end,

    v_delivery_por_confirmar,

    case
      when v_tipo = 'delivery'
        then coalesce(
          p_acepta_confirmacion_delivery,
          false
        )
      else false
    end,

    v_delivery_confirmado,

    case
      when v_tipo = 'delivery'
        and v_zona_delivery = 'urbana'
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
  -- REGISTRAR DETALLE DEL PEDIDO
  -- ==========================================================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_producto_id :=
      (v_item ->> 'producto_id')::bigint;

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
      p.id,
      p.nombre,
      p.precio
    into v_producto
    from public.productos p
    where p.id = v_producto_id
      and p.activo = true
      and p.disponible = true;

    if not found then
      raise exception
        'Uno de los productos dejó de estar disponible.';
    end if;

    v_subtotal_item :=
      round(
        v_producto.precio * v_cantidad,
        2
      );

    insert into public.detalle_pedido (
      pedido_id,
      producto_id,
      producto_nombre,
      cantidad,
      precio_unitario,
      subtotal,
      observaciones,
      creado_en
    )
    values (
      v_pedido_id,
      v_producto.id,
      v_producto.nombre,
      v_cantidad,
      v_producto.precio,
      v_subtotal_item,
      v_observacion_item,
      now()
    );
  end loop;

  -- ==========================================================
  -- RESPUESTA AL FRONTEND
  -- ==========================================================

  return jsonb_build_object(
    'pedido_id',
    v_pedido_id,

    'ticket',
    v_ticket,

    'token_consulta',
    v_token_consulta,

    'estado',
    'pendiente',

    'tipo',
    v_tipo,

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
      when v_tipo = 'delivery'
        then v_zona_delivery
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
      when v_tipo <> 'delivery'
        then null

      when v_zona_delivery = 'urbana'
        then
          'El costo de delivery dentro de la zona urbana es de $2,00.'

      else
        'El costo del delivery fuera de la zona urbana será confirmado por Toscana Grill.'
    end
  );
end;
$$;

comment on function public.crear_pedido(
  text,
  bigint,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  boolean
)
is
'Crea pedidos de mesa, para llevar o delivery y genera tickets TG-YYMMDD-NNNN.';

revoke all
on function public.crear_pedido(
  text,
  bigint,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  boolean
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
  jsonb,
  text,
  boolean
)
to anon, authenticated;

-- ============================================================
-- 9. CONSULTAR PEDIDO
--
-- El cliente visualiza el ticket.
-- El token permanece guardado internamente en el navegador.
--
-- La combinación ticket + token evita que otras personas
-- consulten pedidos adivinando el correlativo.
-- ============================================================

drop function if exists public.consultar_pedido(text);
drop function if exists public.consultar_pedido(uuid);
drop function if exists public.consultar_pedido(text, text);

create function public.consultar_pedido(
  p_ticket text,
  p_token_consulta text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_ticket text;
  v_token_consulta text;
  v_resultado jsonb;
begin
  v_ticket :=
    upper(
      trim(
        coalesce(
          p_ticket,
          ''
        )
      )
    );

  v_token_consulta :=
    trim(
      coalesce(
        p_token_consulta,
        ''
      )
    );

  if v_ticket = '' then
    raise exception
      'El ticket del pedido es obligatorio.';
  end if;

  if v_ticket !~ '^TG-[0-9]{6}-[0-9]{4}$' then
    raise exception
      'El formato del ticket no es válido.';
  end if;

  if v_token_consulta = '' then
    raise exception
      'No se encontró la credencial privada de seguimiento.';
  end if;

  select jsonb_build_object(
    'pedido_id',
    p.id,

    'ticket',
    p.ticket,

    'estado',
    p.estado,

    'estado_pago',
    p.estado_pago,

    'tipo',
    p.tipo,

    'cliente_nombre',
    p.cliente_nombre,

    'mesa',
    case
      when p.tipo = 'mesa'
        then jsonb_build_object(
          'numero',
          m.numero,

          'nombre',
          coalesce(
            m.nombre,
            'Mesa ' || m.numero::text
          )
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

    'descuento',
    p.descuento,

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

    'observaciones',
    p.observaciones,

    'creado_en',
    p.creado_en,

    'actualizado_en',
    p.actualizado_en,

    'detalle',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'producto_id',
            d.producto_id,

            'producto',
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
        from public.detalle_pedido d
        where d.pedido_id = p.id
      ),
      '[]'::jsonb
    )
  )
  into v_resultado
  from public.pedidos p
  left join public.mesas m
    on m.id = p.mesa_id
  where upper(p.ticket) = v_ticket
    and p.token_consulta = v_token_consulta;

  if v_resultado is null then
    raise exception
      'No se encontró el pedido o la credencial de seguimiento no es válida.';
  end if;

  return v_resultado;
end;
$$;

comment on function public.consultar_pedido(text, text)
is
'Consulta públicamente un pedido utilizando su ticket visible y token privado.';

revoke all
on function public.consultar_pedido(text, text)
from public;

grant execute
on function public.consultar_pedido(text, text)
to anon, authenticated;

-- ============================================================
-- 10. CONFIRMAR COSTO DE DELIVERY FUERA DE ZONA
--
-- Solo puede ejecutarlo personal autenticado con rol:
-- - administrador
-- - caja
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
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_rol public.rol_usuario;

  v_pedido record;
  v_costo numeric(10,2);
  v_total numeric(10,2);
begin
  select
    p.id,
    p.rol
  into
    v_usuario_id,
    v_rol
  from public.perfiles p
  where p.id = auth.uid()
    and p.activo = true;

  if v_usuario_id is null then
    raise exception
      'Debe iniciar sesión para confirmar el costo del delivery.';
  end if;

  if v_rol not in (
    'administrador',
    'caja'
  ) then
    raise exception
      'Su usuario no tiene permiso para confirmar el costo del delivery.';
  end if;

  if p_pedido_id is null then
    raise exception
      'El pedido es obligatorio.';
  end if;

  if p_costo_delivery is null
    or p_costo_delivery < 0
    or p_costo_delivery > 9999.99
  then
    raise exception
      'El costo de delivery no es válido.';
  end if;

  v_costo :=
    round(
      p_costo_delivery,
      2
    );

  select
    p.id,
    p.ticket,
    p.tipo,
    p.zona_delivery,
    p.subtotal,
    p.recargo,
    p.descuento,
    p.estado
  into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
  for update;

  if not found then
    raise exception
      'El pedido no existe.';
  end if;

  if v_pedido.tipo <> 'delivery'
    or v_pedido.zona_delivery <> 'fuera_urbana'
  then
    raise exception
      'El pedido no corresponde a un delivery fuera de la zona urbana.';
  end if;

  if v_pedido.estado in (
    'cerrado',
    'cancelado'
  ) then
    raise exception
      'No se puede modificar un pedido cerrado o cancelado.';
  end if;

  v_total :=
    round(
      v_pedido.subtotal
      + v_pedido.recargo
      + v_costo
      - v_pedido.descuento,
      2
    );

  update public.pedidos
  set
    costo_delivery =
      v_costo,

    costo_delivery_confirmado =
      v_costo,

    delivery_por_confirmar =
      false,

    delivery_confirmado =
      true,

    delivery_confirmado_por =
      v_usuario_id,

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
    'pedido_id',
    p_pedido_id,

    'ticket',
    v_pedido.ticket,

    'costo_delivery',
    v_costo,

    'delivery_por_confirmar',
    false,

    'delivery_confirmado',
    true,

    'total_preliminar',
    false,

    'total',
    v_total
  );
end;
$$;

comment on function public.confirmar_costo_delivery(uuid, numeric)
is
'Permite a caja o administrador confirmar el costo de un delivery fuera de la zona urbana.';

revoke all
on function public.confirmar_costo_delivery(uuid, numeric)
from public;

grant execute
on function public.confirmar_costo_delivery(uuid, numeric)
to authenticated;

-- ============================================================
-- 11. ACTUALIZAR DETALLE ADMINISTRATIVO DEL PEDIDO
--
-- Reemplaza la función para incluir información de delivery.
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
    p.id,
    p.rol
  into
    v_usuario_id,
    v_rol
  from public.perfiles p
  where p.id = auth.uid()
    and p.activo = true;

  if v_usuario_id is null then
    raise exception
      'Usuario no autenticado.';
  end if;

  select
    pe.*,
    m.numero as mesa_numero,
    m.nombre as mesa_nombre
  into v_pedido
  from public.pedidos pe
  left join public.mesas m
    on m.id = pe.mesa_id
  where pe.id = p_pedido_id;

  if not found then
    raise exception
      'Pedido no encontrado.';
  end if;

  if v_rol = 'mesero'
    and v_pedido.creado_por is distinct from v_usuario_id
  then
    raise exception
      'Acceso denegado.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'producto_id',
        d.producto_id,

        'producto',
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
    ),
    '[]'::jsonb
  )
  into v_items
  from public.detalle_pedido d
  where d.pedido_id = p_pedido_id;

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

    'zona_delivery',
    v_pedido.zona_delivery,

    'delivery_por_confirmar',
    v_pedido.delivery_por_confirmar,

    'delivery_confirmado',
    v_pedido.delivery_confirmado,

    'costo_delivery',
    v_pedido.costo_delivery,

    'costo_delivery_confirmado',
    v_pedido.costo_delivery_confirmado,

    'total_preliminar',
    v_pedido.total_preliminar,

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

    'actualizado_en',
    v_pedido.actualizado_en,

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
