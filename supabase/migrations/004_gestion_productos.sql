-- Toscana Grill POS
-- Migración 004: gestión administrativa de productos.
--
-- Funciones incluidas:
-- 1. listar_productos_admin()
-- 2. guardar_producto()
-- 3. cambiar_estado_producto()
--
-- Solo usuarios activos con rol administrador pueden ejecutarlas.

begin;

-- ============================================================
-- 1. LISTAR TODOS LOS PRODUCTOS PARA ADMINISTRACIÓN
-- ============================================================

create or replace function public.listar_productos_admin()
returns table (
  producto_id bigint,
  categoria_id bigint,
  categoria_nombre text,
  nombre text,
  descripcion text,
  precio numeric,
  imagen_url text,
  disponible boolean,
  activo boolean,
  creado_en timestamptz,
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
      'Usuario no autenticado o inactivo.';
  end if;

  if v_rol <> 'administrador' then
    raise exception
      'Solo el administrador puede consultar la gestión de productos.';
  end if;

  return query
  select
    producto.id as producto_id,
    producto.categoria_id,
    categoria.nombre as categoria_nombre,
    producto.nombre,
    producto.descripcion,
    producto.precio,
    producto.imagen_url,
    producto.disponible,
    producto.activo,
    producto.creado_en,
    producto.actualizado_en
  from public.productos producto
  left join public.categorias categoria
    on categoria.id = producto.categoria_id
  order by
    coalesce(categoria.orden, 999),
    categoria.nombre nulls last,
    producto.nombre;
end;
$$;

-- ============================================================
-- 2. CREAR O EDITAR UN PRODUCTO
-- ============================================================

create or replace function public.guardar_producto(
  p_producto_id bigint default null,
  p_categoria_id bigint default null,
  p_nombre text default null,
  p_descripcion text default null,
  p_precio numeric default null,
  p_imagen_url text default null,
  p_disponible boolean default true,
  p_activo boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_rol public.rol_usuario;
  v_producto_id bigint;
  v_nombre text;
  v_descripcion text;
  v_imagen_url text;
  v_precio numeric(10,2);
  v_es_nuevo boolean;
begin
  -- ----------------------------------------------------------
  -- Validar administrador autenticado
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
    raise exception
      'Usuario no autenticado o inactivo.';
  end if;

  if v_rol <> 'administrador' then
    raise exception
      'Solo el administrador puede guardar productos.';
  end if;

  -- ----------------------------------------------------------
  -- Normalizar y validar datos
  -- ----------------------------------------------------------

  v_nombre :=
    nullif(
      trim(
        coalesce(
          p_nombre,
          ''
        )
      ),
      ''
    );

  if v_nombre is null then
    raise exception
      'El nombre del producto es obligatorio.';
  end if;

  if char_length(v_nombre) > 120 then
    raise exception
      'El nombre del producto no puede superar 120 caracteres.';
  end if;

  v_descripcion :=
    nullif(
      trim(
        coalesce(
          p_descripcion,
          ''
        )
      ),
      ''
    );

  if v_descripcion is not null
     and char_length(v_descripcion) > 500 then
    raise exception
      'La descripción no puede superar 500 caracteres.';
  end if;

  v_imagen_url :=
    nullif(
      trim(
        coalesce(
          p_imagen_url,
          ''
        )
      ),
      ''
    );

  if v_imagen_url is not null
     and char_length(v_imagen_url) > 1000 then
    raise exception
      'La URL de imagen es demasiado extensa.';
  end if;

  if p_precio is null then
    raise exception
      'El precio del producto es obligatorio.';
  end if;

  if p_precio < 0 then
    raise exception
      'El precio no puede ser negativo.';
  end if;

  if p_precio > 99999999.99 then
    raise exception
      'El precio supera el valor permitido.';
  end if;

  v_precio :=
    round(
      p_precio::numeric,
      2
    );

  if p_categoria_id is not null
     and not exists (
       select 1
       from public.categorias categoria
       where categoria.id = p_categoria_id
         and categoria.activa = true
     ) then
    raise exception
      'La categoría seleccionada no existe o está inactiva.';
  end if;

  -- ----------------------------------------------------------
  -- Crear producto
  -- ----------------------------------------------------------

  if p_producto_id is null then
    insert into public.productos (
      categoria_id,
      nombre,
      descripcion,
      precio,
      imagen_url,
      disponible,
      activo
    )
    values (
      p_categoria_id,
      v_nombre,
      v_descripcion,
      v_precio,
      v_imagen_url,
      coalesce(
        p_disponible,
        true
      ),
      coalesce(
        p_activo,
        true
      )
    )
    returning id
    into v_producto_id;

    v_es_nuevo := true;

  -- ----------------------------------------------------------
  -- Editar producto existente
  -- ----------------------------------------------------------

  else
    update public.productos
    set
      categoria_id = p_categoria_id,
      nombre = v_nombre,
      descripcion = v_descripcion,
      precio = v_precio,
      imagen_url = v_imagen_url,
      disponible = coalesce(
        p_disponible,
        disponible
      ),
      activo = coalesce(
        p_activo,
        activo
      )
    where id = p_producto_id
    returning id
    into v_producto_id;

    if v_producto_id is null then
      raise exception
        'Producto no encontrado.';
    end if;

    v_es_nuevo := false;
  end if;

  return jsonb_build_object(
    'producto_id',
    v_producto_id,
    'nombre',
    v_nombre,
    'precio',
    v_precio,
    'disponible',
    coalesce(
      p_disponible,
      true
    ),
    'activo',
    coalesce(
      p_activo,
      true
    ),
    'creado',
    v_es_nuevo,
    'mensaje',
    case
      when v_es_nuevo
      then 'Producto creado correctamente.'
      else 'Producto actualizado correctamente.'
    end
  );
end;
$$;

-- ============================================================
-- 3. CAMBIAR DISPONIBILIDAD O ESTADO ACTIVO
-- ============================================================

create or replace function public.cambiar_estado_producto(
  p_producto_id bigint,
  p_disponible boolean default null,
  p_activo boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_rol public.rol_usuario;
  v_nombre text;
  v_disponible boolean;
  v_activo boolean;
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
      'Usuario no autenticado o inactivo.';
  end if;

  if v_rol <> 'administrador' then
    raise exception
      'Solo el administrador puede cambiar el estado de productos.';
  end if;

  if p_disponible is null
     and p_activo is null then
    raise exception
      'Debe indicar al menos un estado para modificar.';
  end if;

  update public.productos
  set
    disponible = coalesce(
      p_disponible,
      disponible
    ),
    activo = coalesce(
      p_activo,
      activo
    )
  where id = p_producto_id
  returning
    nombre,
    disponible,
    activo
  into
    v_nombre,
    v_disponible,
    v_activo;

  if v_nombre is null then
    raise exception
      'Producto no encontrado.';
  end if;

  return jsonb_build_object(
    'producto_id',
    p_producto_id,
    'nombre',
    v_nombre,
    'disponible',
    v_disponible,
    'activo',
    v_activo,
    'mensaje',
    'Estado del producto actualizado correctamente.'
  );
end;
$$;

-- ============================================================
-- 4. PERMISOS DE EJECUCIÓN
-- ============================================================

revoke all
on function public.listar_productos_admin()
from public;

revoke all
on function public.guardar_producto(
  bigint,
  bigint,
  text,
  text,
  numeric,
  text,
  boolean,
  boolean
)
from public;

revoke all
on function public.cambiar_estado_producto(
  bigint,
  boolean,
  boolean
)
from public;

grant execute
on function public.listar_productos_admin()
to authenticated;

grant execute
on function public.guardar_producto(
  bigint,
  bigint,
  text,
  text,
  numeric,
  text,
  boolean,
  boolean
)
to authenticated;

grant execute
on function public.cambiar_estado_producto(
  bigint,
  boolean,
  boolean
)
to authenticated;

commit;
