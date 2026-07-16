# Toscana Grill — Pedidos

Proyecto independiente para publicar en un repositorio nuevo, sin afectar el menú actualmente operativo.

## Funciones incluidas

- Menú público responsive.
- Carrito persistente en `localStorage`.
- Registro seguro de pedidos mediante la RPC `crear_pedido`.
- Login del personal con Supabase Auth.
- Roles: administrador, caja, cocina y mesero.
- Dashboard con pedidos activos e indicadores diarios.
- Consulta de detalle de pedido.
- Script SQL de instalación de la base.

## Configuración

1. Crea o utiliza un proyecto Supabase.
2. Ejecuta `supabase/schema.sql` en **SQL Editor**.
3. Crea el primer usuario desde **Authentication → Users**.
4. Asigna el rol administrador con la consulta indicada al final de `schema.sql`.
5. Edita `js/supabase-config.js`:
   - `url`: `https://PROJECT_ID.supabase.co`
   - `publishableKey`: clave pública `sb_publishable_...`
6. Publica todos los archivos en la raíz del repositorio nuevo.
7. Activa GitHub Pages desde la rama `main`.

## URLs

- Menú: `/index.html`
- Login: `/admin/login.html`
- Panel: `/admin/panel.html`

## Seguridad

La Publishable Key es pública por diseño. La protección real depende de RLS, privilegios mínimos y funciones RPC. Nunca publiques `service_role`, secret key ni la contraseña de PostgreSQL.
