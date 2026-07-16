"use strict";

const panelState = {
  session: null,
  profile: null,
  orders: [],
  currentView: null
};

const VIEW_NAMES = {
  dashboard: "Dashboard",
  pedidos: "Pedidos activos",
  cocina: "Panel de cocina",
  caja: "Gestión de caja",
  historial: "Histórico de pedidos",
  productos: "Productos",
  usuarios: "Usuarios"
};

document.addEventListener("DOMContentLoaded", initializePanel);

/**
 * Inicializa el panel administrativo.
 *
 * Valida la sesión, obtiene el perfil del usuario, configura la interfaz
 * y carga la vista inicial del Dashboard.
 *
 * @returns {Promise<void>}
 */
async function initializePanel() {
  if (!window.toscanaSupabase) {
    fatal("No se configuró correctamente la conexión con Supabase.");
    return;
  }

  if (!window.toscanaViewLoader) {
    fatal("No se cargó el administrador de vistas del panel.");
    return;
  }

  try {
    const { data, error } =
      await window.toscanaSupabase.auth.getSession();

    if (error) {
      throw error;
    }

    if (!data.session?.user) {
      redirectToLogin();
      return;
    }

    panelState.session = data.session;

    const profileResponse = await window.toscanaSupabase
      .from("perfiles")
      .select("id,nombre_completo,rol,activo")
      .eq("id", data.session.user.id)
      .single();

    if (
      profileResponse.error ||
      !profileResponse.data ||
      !profileResponse.data.activo
    ) {
      await window.toscanaSupabase.auth.signOut();
      redirectToLogin();
      return;
    }

    panelState.profile = profileResponse.data;

    setupStaticUI();
    setupStaticEvents();
    applyRolePermissions();

    await navigateToView("dashboard");

    document.querySelector("#app-loading").hidden = true;
    document.querySelector("#admin-app").hidden = false;
  } catch (error) {
    console.error("Error al inicializar el panel:", error);

    fatal(
      error?.message ||
      "No fue posible cargar el panel administrativo."
    );
  }
}

/**
 * Configura los elementos permanentes del panel.
 */
function setupStaticUI() {
  const profile = panelState.profile;

  const userName = document.querySelector("#user-name");
  const userRole = document.querySelector("#user-role");
  const userAvatar = document.querySelector("#user-avatar");

  userName.textContent =
    profile.nombre_completo ||
    panelState.session?.user?.email ||
    "Usuario";

  userRole.textContent = pretty(profile.rol);

  userAvatar.textContent = getInitials(
    profile.nombre_completo ||
    panelState.session?.user?.email ||
    "TG"
  );
}

/**
 * Configura los eventos de los elementos permanentes del panel.
 */
function setupStaticEvents() {
  const logoutButton = document.querySelector("#logout-button");
  const sidebarToggle = document.querySelector("#sidebar-toggle");
  const sidebar = document.querySelector("#sidebar");
  const overlay = document.querySelector("#sidebar-overlay");
  const closeOrderDialog = document.querySelector(
    "#close-order-dialog"
  );
  const orderDialog = document.querySelector("#order-dialog");

  logoutButton.addEventListener("click", logout);

  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("visible");
  });

  overlay.addEventListener("click", closeSidebar);

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", async () => {
      const viewName = button.dataset.view;

      if (!viewName) {
        return;
      }

      await navigateToView(viewName);
      closeSidebar();
    });
  });

  closeOrderDialog.addEventListener("click", () => {
    if (orderDialog.open) {
      orderDialog.close();
    }
  });

  orderDialog.addEventListener("click", (event) => {
    if (event.target === orderDialog) {
      orderDialog.close();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      closeSidebar();
    }
  });
}

/**
 * Oculta las opciones del menú que no corresponden al rol actual.
 */
function applyRolePermissions() {
  const userRole = panelState.profile.rol;

  document.querySelectorAll("[data-roles]").forEach((element) => {
    const allowedRoles = element.dataset.roles
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);

    element.hidden = !allowedRoles.includes(userRole);
  });
}

/**
 * Navega entre los módulos del panel.
 *
 * @param {string} viewName
 * @returns {Promise<void>}
 */
async function navigateToView(viewName) {
  clearMessage();

  if (!isViewAllowed(viewName)) {
    showMessage(
      "Tu usuario no tiene autorización para acceder a este módulo."
    );

    return;
  }

  setActiveNavigationItem(viewName);
  setPageTitle(viewName);

  if (viewName === "dashboard") {
    await loadDashboardView();
    return;
  }

  renderPendingModule(viewName);
}

/**
 * Verifica si el rol actual puede abrir una vista.
 *
 * @param {string} viewName
 * @returns {boolean}
 */
function isViewAllowed(viewName) {
  const navigationButton = document.querySelector(
    `.nav-item[data-view="${escapeSelector(viewName)}"]`
  );

  if (!navigationButton) {
    return false;
  }

  if (!navigationButton.dataset.roles) {
    return true;
  }

  const allowedRoles = navigationButton.dataset.roles
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);

  return allowedRoles.includes(panelState.profile.rol);
}

/**
 * Marca la opción seleccionada dentro del menú lateral.
 *
 * @param {string} viewName
 */
function setActiveNavigationItem(viewName) {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.view === viewName
    );
  });
}

/**
 * Actualiza el título superior del módulo.
 *
 * @param {string} viewName
 */
function setPageTitle(viewName) {
  const pageTitle = document.querySelector("#page-title");

  pageTitle.textContent =
    VIEW_NAMES[viewName] ||
    "Módulo";
}

/**
 * Carga la vista HTML del Dashboard y después inicializa sus eventos.
 *
 * @returns {Promise<void>}
 */
async function loadDashboardView() {
  panelState.currentView = "dashboard";

  await window.toscanaViewLoader.load("dashboard");

  const dashboardView = document.querySelector("#view-dashboard");

  if (!dashboardView) {
    showMessage(
      "La vista del Dashboard no se cargó correctamente."
    );

    return;
  }

  setupDashboardUI();
  setupDashboardEvents();

  await loadDashboard();
}

/**
 * Configura los textos iniciales del Dashboard.
 */
function setupDashboardUI() {
  const currentDate = document.querySelector("#current-date");

  if (currentDate) {
    currentDate.textContent = new Intl.DateTimeFormat(
      "es-EC",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }
    ).format(new Date());
  }
}

/**
 * Configura los eventos internos del Dashboard.
 */
function setupDashboardEvents() {
  const refreshButton = document.querySelector(
    "#refresh-dashboard"
  );

  if (refreshButton) {
    refreshButton.addEventListener("click", loadDashboard);
  }
}

/**
 * Renderiza una vista temporal para los módulos todavía no implementados.
 *
 * @param {string} viewName
 */
function renderPendingModule(viewName) {
  panelState.currentView = viewName;

  const container = document.querySelector("#view-container");
  const moduleName = VIEW_NAMES[viewName] || "Módulo";

  container.innerHTML = `
    <section class="panel-view active">
      <div class="content-card placeholder-card">
        <h2>${escapeHTML(moduleName)}</h2>
        <p>
          Este módulo está preparado para su implementación
          incremental.
        </p>
      </div>
    </section>
  `;
}

/**
 * Recarga indicadores y pedidos activos.
 *
 * @returns {Promise<void>}
 */
async function loadDashboard() {
  if (panelState.currentView !== "dashboard") {
    return;
  }

  clearMessage();

  const refreshButton = document.querySelector(
    "#refresh-dashboard"
  );

  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = "Actualizando…";
  }

  try {
    await Promise.all([
      loadSummary(),
      loadOrders()
    ]);
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = "Actualizar";
    }
  }
}

/**
 * Carga los indicadores diarios del Dashboard.
 *
 * @returns {Promise<void>}
 */
async function loadSummary() {
  const { data, error } = await window.toscanaSupabase.rpc(
    "resumen_diario",
    {
      p_fecha: null
    }
  );

  if (error) {
    console.error(
      "Error al cargar el resumen diario:",
      error
    );

    showMessage(
      "No fue posible cargar los indicadores del Dashboard."
    );

    return;
  }

  setTextContent(
    "#metric-active-orders",
    data?.pedidos_activos ?? 0
  );

  setTextContent(
    "#metric-total-orders",
    data?.total_pedidos ?? 0
  );

  setTextContent(
    "#metric-sales",
    money(data?.ventas_generadas)
  );

  setTextContent(
    "#metric-paid",
    money(data?.total_pagado)
  );
}

/**
 * Carga los pedidos activos.
 *
 * @returns {Promise<void>}
 */
async function loadOrders() {
  const loading = document.querySelector("#orders-loading");
  const empty = document.querySelector("#orders-empty");
  const list = document.querySelector("#orders-list");
  const count = document.querySelector("#orders-count");

  if (!loading || !empty || !list || !count) {
    showMessage(
      "La estructura del listado de pedidos no está disponible."
    );

    return;
  }

  loading.hidden = false;
  empty.hidden = true;
  list.innerHTML = "";
  count.textContent = "0";

  const { data, error } = await window.toscanaSupabase.rpc(
    "listar_pedidos_activos"
  );

  loading.hidden = true;

  if (error) {
    console.error(
      "Error al cargar los pedidos activos:",
      error
    );

    showMessage(
      "No fue posible cargar los pedidos activos."
    );

    return;
  }

  panelState.orders = Array.isArray(data)
    ? data
    : [];

  count.textContent = String(panelState.orders.length);

  if (panelState.orders.length === 0) {
    empty.hidden = false;
    return;
  }

  list.innerHTML = panelState.orders
    .map(createOrderCard)
    .join("");

  list.querySelectorAll(".order-card").forEach((card) => {
    card.addEventListener("click", () => {
      const orderId = card.dataset.id;

      if (orderId) {
        openOrder(orderId);
      }
    });
  });
}

/**
 * Genera el HTML de una tarjeta de pedido.
 *
 * @param {object} order
 * @returns {string}
 */
function createOrderCard(order) {
  const orderId = escapeHTML(order.id);
  const ticket = escapeHTML(order.ticket || "Sin ticket");
  const location = escapeHTML(
    order.mesa_nombre ||
    pretty(order.tipo) ||
    "Sin ubicación"
  );
  const status = escapeHTML(pretty(order.estado));
  const items = Number(order.cantidad_items || 0);
  const total = money(order.total);

  return `
    <article
      class="order-card"
      data-id="${orderId}"
      tabindex="0"
      role="button"
      aria-label="Abrir pedido ${ticket}"
    >
      <div class="order-card-header">
        <div>
          <strong>${ticket}</strong>
          <span>${location}</span>
        </div>

        <span class="status-badge status-${escapeHTML(
          order.estado
        )}">
          ${status}
        </span>
      </div>

      <div class="order-card-body">
        <div>
          <span>Productos</span>
          <strong>${items}</strong>
        </div>

        <div>
          <span>Total</span>
          <strong>${total}</strong>
        </div>
      </div>
    </article>
  `;
}

/**
 * Abre el detalle de un pedido.
 *
 * @param {string} orderId
 * @returns {Promise<void>}
 */
async function openOrder(orderId) {
  const dialog = document.querySelector("#order-dialog");
  const content = document.querySelector(
    "#order-detail-content"
  );

  content.innerHTML = `
    <div class="section-loading">
      Cargando detalle del pedido…
    </div>
  `;

  if (!dialog.open) {
    dialog.showModal();
  }

  const { data, error } = await window.toscanaSupabase.rpc(
    "obtener_detalle_pedido",
    {
      p_pedido_id: orderId
    }
  );

  if (error) {
    console.error(
      "Error al cargar el detalle del pedido:",
      error
    );

    content.innerHTML = `
      <div class="empty-state">
        <strong>No fue posible cargar el pedido.</strong>
        <p>${escapeHTML(error.message)}</p>
      </div>
    `;

    return;
  }

  content.innerHTML = createOrderDetail(data);
}

/**
 * Genera el contenido del modal de pedido.
 *
 * @param {object} order
 * @returns {string}
 */
function createOrderDetail(order) {
  const details = Array.isArray(order?.detalle)
    ? order.detalle
    : [];

  const detailRows = details.length
    ? details
        .map((item) => {
          return `
            <tr>
              <td>${escapeHTML(
                item.producto ||
                item.nombre_producto ||
                "Producto"
              )}</td>

              <td>${Number(item.cantidad || 0)}</td>

              <td>
                ${money(item.precio_unitario)}
              </td>

              <td>
                ${money(item.subtotal)}
              </td>
            </tr>
          `;
        })
        .join("")
    : `
        <tr>
          <td colspan="4">
            No existen productos registrados.
          </td>
        </tr>
      `;

  return `
    <div class="order-detail">
      <div class="order-detail-header">
        <div>
          <p>Pedido</p>
          <h2>${escapeHTML(
            order?.ticket ||
            "Sin ticket"
          )}</h2>
        </div>

        <span class="status-badge status-${escapeHTML(
          order?.estado
        )}">
          ${escapeHTML(pretty(order?.estado))}
        </span>
      </div>

      <div class="order-detail-summary">
        <div>
          <span>Ubicación</span>
          <strong>
            ${escapeHTML(
              order?.mesa?.nombre ||
              pretty(order?.tipo) ||
              "Sin ubicación"
            )}
          </strong>
        </div>

        <div>
          <span>Total</span>
          <strong>${money(order?.total)}</strong>
        </div>

        <div>
          <span>Estado de pago</span>
          <strong>
            ${escapeHTML(
              pretty(order?.estado_pago)
            )}
          </strong>
        </div>
      </div>

      <div class="order-detail-table-wrapper">
        <table class="order-detail-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Precio</th>
              <th>Subtotal</th>
            </tr>
          </thead>

          <tbody>
            ${detailRows}
          </tbody>
        </table>
      </div>

      ${
        order?.observaciones
          ? `
            <div class="order-observations">
              <span>Observaciones</span>
              <p>${escapeHTML(
                order.observaciones
              )}</p>
            </div>
          `
          : ""
      }
    </div>
  `;
}

/**
 * Cierra el menú lateral en dispositivos pequeños.
 */
function closeSidebar() {
  const sidebar = document.querySelector("#sidebar");
  const overlay = document.querySelector("#sidebar-overlay");

  sidebar.classList.remove("open");
  overlay.classList.remove("visible");
}

/**
 * Cierra la sesión actual.
 *
 * @returns {Promise<void>}
 */
async function logout() {
  const logoutButton = document.querySelector("#logout-button");

  logoutButton.disabled = true;
  logoutButton.textContent = "Cerrando sesión…";

  try {
    await window.toscanaSupabase.auth.signOut();
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  } finally {
    redirectToLogin();
  }
}

/**
 * Redirige al formulario de inicio de sesión.
 */
function redirectToLogin() {
  window.location.replace("./login.html");
}

/**
 * Muestra un error crítico durante la carga inicial.
 *
 * @param {string} message
 */
function fatal(message) {
  const loading = document.querySelector("#app-loading");

  loading.innerHTML = `
    <div class="fatal-error">
      <h1>No fue posible cargar el panel</h1>
      <p>${escapeHTML(message)}</p>
      <a href="./login.html">Volver al inicio de sesión</a>
    </div>
  `;
}

/**
 * Muestra un mensaje general.
 *
 * @param {string} message
 */
function showMessage(message) {
  const element = document.querySelector("#global-message");

  element.textContent = message;
  element.hidden = false;
}

/**
 * Oculta el mensaje general.
 */
function clearMessage() {
  const element = document.querySelector("#global-message");

  element.hidden = true;
  element.textContent = "";
}

/**
 * Asigna texto a un elemento cuando existe.
 *
 * @param {string} selector
 * @param {string|number} value
 */
function setTextContent(selector, value) {
  const element = document.querySelector(selector);

  if (element) {
    element.textContent = String(value);
  }
}

/**
 * Convierte un valor numérico a dólares.
 *
 * @param {unknown} value
 * @returns {string}
 */
function money(value) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD"
  }).format(Number(value || 0));
}

/**
 * Convierte valores técnicos a texto legible.
 *
 * @param {unknown} value
 * @returns {string}
 */
function pretty(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

/**
 * Obtiene las iniciales de un nombre.
 *
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  const initials = String(name || "TG")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

  return initials || "TG";
}

/**
 * Escapa texto antes de insertarlo como HTML.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return entities[character];
    }
  );
}

/**
 * Escapa un valor utilizado en un selector CSS.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeSelector(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return String(value).replace(
    /[^a-zA-Z0-9_-]/g,
    ""
  );
}
