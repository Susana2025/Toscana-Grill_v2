-- Toscana Grill POS
-- Migración 005: carga del catálogo original.
--
-- Contenido:
-- - 8 categorías.
-- - 37 productos originales.
--
-- Comportamiento:
-- - No elimina productos existentes.
-- - No sobrescribe precios ni descripciones existentes.
-- - Evita duplicados comparando nombres sin distinguir
--   mayúsculas, minúsculas ni espacios laterales.
-- - Puede ejecutarse más de una vez de forma segura.

begin;

-- ============================================================
-- 1. CARGAR CATEGORÍAS FALTANTES
-- ============================================================

with categorias_catalogo (
  nombre,
  orden
) as (
  values
    ('Asados al barril', 10),
    ('Choripanes', 20),
    ('Especiales', 30),
    ('Caldos', 40),
    ('Adicionales', 50),
    ('Limonadas', 60),
    ('Jugos naturales', 70),
    ('Bebidas', 80)
)
insert into public.categorias (
  nombre,
  orden,
  activa
)
select
  catalogo.nombre,
  catalogo.orden,
  true
from categorias_catalogo catalogo
where not exists (
  select 1
  from public.categorias categoria
  where lower(trim(categoria.nombre)) =
        lower(trim(catalogo.nombre))
);

-- ============================================================
-- 2. REACTIVAR CATEGORÍAS DEL CATÁLOGO
-- ============================================================
-- Si una categoría ya existía, se conserva su identificador,
-- pero se asegura que quede activa.

update public.categorias categoria
set activa = true
where lower(trim(categoria.nombre)) in (
  'asados al barril',
  'choripanes',
  'especiales',
  'caldos',
  'adicionales',
  'limonadas',
  'jugos naturales',
  'bebidas'
);

-- ============================================================
-- 3. CARGAR PRODUCTOS FALTANTES
-- ============================================================

with productos_catalogo (
  categoria_nombre,
  nombre,
  precio,
  descripcion,
  disponible,
  activo
) as (
  values

    -- --------------------------------------------------------
    -- ASADOS AL BARRIL
    -- --------------------------------------------------------

    (
      'Asados al barril',
      'Panceta crocante al barril',
      5.50::numeric,
      'Panceta crocante al barril, acompañada de papas fritas y guacamole.',
      true,
      true
    ),

    (
      'Asados al barril',
      'Parrillada andina al barril',
      5.50::numeric,
      'Lomo de cerdo, presa de pollo, chorizo parrillero, choclo, papas salteadas, ensalada, chimichurri y ají de la casa.',
      true,
      true
    ),

    (
      'Asados al barril',
      'Lomo de res al barril',
      4.75::numeric,
      'Lomo ahumado de res al barril, acompañado de arroz moro, patacones y menestra.',
      true,
      true
    ),

    (
      'Asados al barril',
      'Costillas de cerdo ahumadas en salsa BBQ',
      5.00::numeric,
      'Costillas de cerdo ahumadas en salsa BBQ, acompañadas de papas rústicas sazonadas, ensalada y limonada.',
      true,
      true
    ),

    (
      'Asados al barril',
      'Pollo colorado al barril',
      5.50::numeric,
      '¼ de pollo colorado al barril con papas salteadas, ensalada y salsa de la casa.',
      true,
      true
    ),

    (
      'Asados al barril',
      'Bandeja familiar Toscana',
      24.00::numeric,
      '4 filetes de pollo, 4 chuletas de cerdo, 6 chorizos, patacones para 4 personas, 4 arroces moro, 4 menestras, ensalada, chimichurri y salsas.',
      true,
      true
    ),

    (
      'Asados al barril',
      'Cuy al barril',
      22.00::numeric,
      'Cuy grande entero, papas criollas con salsa de maní, mote y ensalada. Porciones para 4 personas.',
      true,
      true
    ),

    -- --------------------------------------------------------
    -- CHORIPANES
    -- --------------------------------------------------------

    (
      'Choripanes',
      'Choripán clásico argentino',
      3.50::numeric,
      'Chorizo al barril, pan baguette tostado, chimichurri casero, salsa criolla, cebolla caramelizada y papas fritas.',
      true,
      true
    ),

    (
      'Choripanes',
      'Choripán mexicano',
      3.75::numeric,
      'Chorizo al barril, pan baguette tostado, guacamole, salsa criolla picante, cebolla caramelizada y papas fritas.',
      true,
      true
    ),

    (
      'Choripanes',
      'Choripán italiano Toscana',
      3.75::numeric,
      'Chorizo al barril, pan baguette tostado, queso mozzarella, salsa especial de tomate con albahaca y orégano, y papas fritas.',
      true,
      true
    ),

    -- --------------------------------------------------------
    -- ESPECIALES
    -- --------------------------------------------------------

    (
      'Especiales',
      'Llapingacho barrilero',
      4.75::numeric,
      'Llapingacho con carne de cerdo desmechada al barril, chorizo, huevo, aguacate y ají.',
      true,
      true
    ),

    (
      'Especiales',
      'Fritada de la casa',
      5.00::numeric,
      'Fritada con mote, maduros, papas criollas, tostado, encurtido y ají.',
      true,
      true
    ),

    (
      'Especiales',
      'Hornado',
      5.25::numeric,
      'Hornado con mote, tortilla de papa, ensalada, cuero crocante y ají.',
      true,
      true
    ),

    -- --------------------------------------------------------
    -- CALDOS
    -- --------------------------------------------------------

    (
      'Caldos',
      'Caldo de pata',
      3.50::numeric,
      'Caldo tradicional de pata.',
      true,
      true
    ),

    -- --------------------------------------------------------
    -- ADICIONALES
    -- --------------------------------------------------------

    (
      'Adicionales',
      'Arroz moro con queso mozzarella',
      2.50::numeric,
      'Porción adicional.',
      true,
      true
    ),

    (
      'Adicionales',
      'Arroz blanco',
      1.50::numeric,
      'Porción adicional.',
      true,
      true
    ),

    (
      'Adicionales',
      'Porción de papas',
      1.50::numeric,
      'Porción adicional.',
      true,
      true
    ),

    (
      'Adicionales',
      'Porción de ensalada',
      1.25::numeric,
      'Porción adicional.',
      true,
      true
    ),

    (
      'Adicionales',
      'Menestra',
      1.50::numeric,
      'Porción adicional.',
      true,
      true
    ),

    (
      'Adicionales',
      'Chorizo',
      0.60::numeric,
      'Unidad adicional.',
      true,
      true
    ),

    (
      'Adicionales',
      'Plato de patacones',
      1.75::numeric,
      'Porción adicional.',
      true,
      true
    ),

    -- --------------------------------------------------------
    -- LIMONADAS
    -- --------------------------------------------------------

    (
      'Limonadas',
      'Limonada clásica - vaso',
      1.00::numeric,
      'Vaso individual.',
      true,
      true
    ),

    (
      'Limonadas',
      'Limonada clásica - jarra',
      3.50::numeric,
      'Jarra para compartir.',
      true,
      true
    ),

    (
      'Limonadas',
      'Limonada de fresa - vaso',
      1.50::numeric,
      'Vaso individual.',
      true,
      true
    ),

    (
      'Limonadas',
      'Limonada de fresa - jarra',
      4.50::numeric,
      'Jarra para compartir.',
      true,
      true
    ),

    (
      'Limonadas',
      'Limonada de coco - vaso',
      1.75::numeric,
      'Vaso individual.',
      true,
      true
    ),

    (
      'Limonadas',
      'Limonada de coco - jarra',
      5.00::numeric,
      'Jarra para compartir.',
      true,
      true
    ),

    -- --------------------------------------------------------
    -- JUGOS NATURALES
    -- --------------------------------------------------------

    (
      'Jugos naturales',
      'Jugo de mora - vaso',
      1.50::numeric,
      'Vaso individual.',
      true,
      true
    ),

    (
      'Jugos naturales',
      'Jugo de mora - jarra',
      4.50::numeric,
      'Jarra para compartir.',
      true,
      true
    ),

    (
      'Jugos naturales',
      'Jugo de naranjilla - vaso',
      1.50::numeric,
      'Vaso individual.',
      true,
      true
    ),

    (
      'Jugos naturales',
      'Jugo de naranjilla - jarra',
      4.50::numeric,
      'Jarra para compartir.',
      true,
      true
    ),

    (
      'Jugos naturales',
      'Jugo de coco - vaso',
      1.75::numeric,
      'Vaso individual.',
      true,
      true
    ),

    (
      'Jugos naturales',
      'Jugo de coco - jarra',
      5.00::numeric,
      'Jarra para compartir.',
      true,
      true
    ),

    -- --------------------------------------------------------
    -- BEBIDAS
    -- --------------------------------------------------------

    (
      'Bebidas',
      'Gaseosa personal',
      1.00::numeric,
      'Presentación personal.',
      true,
      true
    ),

    (
      'Bebidas',
      'Gaseosa 1 litro',
      2.75::numeric,
      'Botella de 1 litro.',
      true,
      true
    ),

    (
      'Bebidas',
      'Botella de agua',
      0.75::numeric,
      'Agua embotellada.',
      true,
      true
    ),

    (
      'Bebidas',
      'Cerveza personal',
      1.50::numeric,
      'Presentación personal.',
      true,
      true
    )
)

insert into public.productos (
  categoria_id,
  nombre,
  descripcion,
  precio,
  imagen_url,
  disponible,
  activo
)
select
  categoria.id,
  producto.nombre,
  producto.descripcion,
  producto.precio,
  null,
  producto.disponible,
  producto.activo
from productos_catalogo producto
join public.categorias categoria
  on lower(trim(categoria.nombre)) =
     lower(trim(producto.categoria_nombre))
where not exists (
  select 1
  from public.productos existente
  where lower(trim(existente.nombre)) =
        lower(trim(producto.nombre))
);

commit;
