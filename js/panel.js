"use strict";

const panelState = {
  session: null,
  profile: null,
  orders: [],
  currentView: null,
  activeOrderFilter: "todos"
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
 * @returns {Promise<void>}
 */
async function initializePanel() {
  if (!window.toscanaSupabase) {
    fatal("No se configuró correctamente la conexión con Supabase.");
    return;
  }

  if (!window.toscanaViewLoader) {
    fatal("No se cargó el administrador de vistas.");
    return;
  }

  try {
    const {
      data: sessionData,
      error: sessionError
    } = await window.toscanaSupabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData.session?.user) {
      redirectToLogin();
      return;
    }

    panelState.session = sessionData.session;

    const {
      data: profile,
      error: profileError
    } = await window.toscanaSupabase
      .from("perfiles")
      .select("id,nombre_completo,rol,activo")
      .eq("id", sessionData.session.user.id)
      .single();

    if (profileError || !profile || !profile.activo) {
      await window.toscanaSupabase.auth.signOut();
      redirectToLogin();
      return;
    }

    panelState.profile = profile;

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
 * Configura la información permanente del usuario.
 */
function setupStaticUI() {
  const profile = panelState.profile;

  const displayName =
    profile.nombre_completo ||
    panelState.session?.user?.email ||
    "Usuario";

  document.querySelector("#user-name").textContent =
    displayName;

  document.querySelector("#user-role").textContent =
    pretty(profile.rol);

  document.querySelector("#user-avatar").textContent =
    getInitials(displayName);
}

/**
 * Configura los eventos permanentes del panel.
 */
function setupStaticEvents() {
  const logoutButton =
    document.querySelector("#logout-button");

  const sidebarToggle =
    document.querySelector("#sidebar-toggle");

  const sidebar =
    document.querySelector("#sidebar");

  const overlay =
    document.querySelector("#sidebar-overlay");

  const orderDialog =
    document.querySelector("#order-dialog");

  const closeOrderDialog =
    document.querySelector("#close-order-dialog");

  logoutButton.addEventListener("click", logout);

  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("visible");
  });

  overlay.addEventListener("click", closeSidebar);

  document
    .querySelectorAll(".nav-item")
    .forEach((button) => {
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
 * Oculta módulos que no corresponden al rol actual.
 */
function applyRolePermissions() {
  const currentRole = panelState.profile.rol;

  document
    .querySelectorAll("[data-roles]")
    .forEach((element) => {
      const allowedRoles = element.dataset.roles
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean);

      element.hidden =
        !allowedRoles.includes(currentRole);
    });
}

/**
 * Navega entre las vistas del panel.
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

  switch (viewName) {
    case "dashboard":
      await loadDashboardView();
      break;

    case "pedidos":
      await loadOrdersView();
      break;

    default:
      renderPendingModule(viewName);
      break;
  }
}

/**
 * Comprueba si la vista está autorizada para el rol actual.
 *
 * @param {string} viewName
 * @returns {boolean}
 */
function isViewAllowed(viewName) {
  const button = document.querySelector(
    `.nav-item[data-view="${escapeSelector(viewName)}"]`
  );

  if (!button || button.hidden) {
    return false;
  }

  if (!button.dataset.roles) {
    return true;
  }

  const allowedRoles = button.dataset.roles
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);

  return allowedRoles.includes(
    panelState.profile.rol
  );
}

/**
 * Marca el botón activo del menú lateral.
 *
 * @param {string} viewName
 */
function setActiveNavigationItem(viewName) {
  document
    .querySelectorAll(".nav-item")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.view === viewName
      );
    });
}

/**
 * Actualiza el título superior.
 *
 * @param {string} viewName
 */
function setPageTitle(viewName) {
  document.querySelector("#page-title").textContent =
    VIEW_NAMES[viewName] || "Módulo";
}

/**
 * Carga la vista dinámica del Dashboard.
 *
 * @returns {Promise<void>}
 */
async function loadDashboardView() {
  panelState.currentView = "dashboard";

  await window.toscanaViewLoader.load("dashboard");

  const dashboard =
    document.querySelector("#view-dashboard");

  if (!dashboard) {
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
 * Configura los datos iniciales del Dashboard.
 */
function setupDashboardUI() {
  const currentDate =
    document.querySelector("#current-date");

  if (!currentDate) {
    return;
  }

  currentDate.textContent =
    new Intl.DateTimeFormat("es-EC", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(new Date());
}

/**
 * Configura los eventos del Dashboard.
 */
function setupDashboardEvents() {
  const refreshButton =
    document.querySelector("#refresh-dashboard");

  if (refreshButton) {
    refreshButton.addEventListener(
      "click",
      loadDashboard
    );
  }
}

/**
 * Carga indicadores y pedidos del Dashboard.
 *
 * @returns {Promise<void>}
 */
async function loadDashboard() {
  if (panelState.currentView !== "dashboard") {
    return;
  }

  clearMessage();

  const refreshButton =
    document.querySelector("#refresh-dashboard");

  setButtonLoading(
    refreshButton,
    true,
    "Actualizando…"
  );

  try {
    if (
      ["administrador", "caja"].includes(
        panelState.profile.rol
      )
    ) {
      await Promise.all([
        loadSummary(),
        loadDashboardOrders()
      ]);
    } else {
      resetRestrictedSummary();
      await loadDashboardOrders();
    }
  } finally {
    setButtonLoading(
      refreshButton,
      false,
      "Actualizar"
    );
  }
}

/**
 * Carga el resumen diario.
 *
 * @returns {Promise<void>}
 */
async function loadSummary() {
  const {
    data,
    error
  } = await window.toscanaSupabase.rpc(
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
      "No fue posible cargar los indicadores."
    );

    return;
  }

  setText(
    "#metric-active-orders",
    data?.pedidos_activos ?? 0
  );

  setText(
    "#metric-total-orders",
    data?.total_pedidos ?? 0
  );

  setText(
    "#metric-sales",
    money(data?.ventas_generadas)
  );

  setText(
    "#metric-paid",
    money(data?.total_pagado)
  );
}

/**
 * Evita errores de autorización en cocina o mesero.
 */
function resetRestrictedSummary() {
  setText("#metric-active-orders", "—");
  setText("#metric-total-orders", "—");
  setText("#metric-sales", "Restringido");
  setText("#metric-paid", "Restringido");
}

/**
 * Carga los pedidos activos del Dashboard.
 *
 * @returns {Promise<void>}
 */
async function loadDashboardOrders() {
  const loading =
    document.querySelector("#orders-loading");

  const empty =
    document.querySelector("#orders-empty");

  const list =
    document.querySelector("#orders-list");

  const count =
    document.querySelector("#orders-count");

  if (!loading || !empty || !list || !count) {
    showMessage(
      "La estructura del Dashboard está incompleta."
    );

    return;
  }

  setOrdersLoadingState({
    loading,
    empty,
    list,
    count
  });

  const orders = await fetchActiveOrders();

  loading.hidden = true;

  if (orders === null) {
    return;
  }

  count.textContent = String(orders.length);

  if (orders.length === 0) {
    empty.hidden = false;
    return;
  }

  list.innerHTML = orders
    .map(createOrderCard)
    .join("");

  attachOrderCardEvents(list);
}

/**
 * Carga la vista dinámica de Pedidos activos.
 *
 * @returns {Promise<void>}
 */
async function loadOrdersView() {
  panelState.currentView = "pedidos";
  panelState.activeOrderFilter = "todos";

  await window.toscanaViewLoader.load("pedidos");

  const ordersView =
    document.querySelector("#view-pedidos");

  if (!ordersView) {
    showMessage(
      "La vista de Pedidos activos no se cargó correctamente."
    );

    return;
  }

  setupOrdersViewEvents();

  await loadActiveOrdersModule();
}

/**
 * Configura los eventos de la vista Pedidos.
 */
function setupOrdersViewEvents() {
  const refreshButton =
    document.querySelector("#refresh-orders");

  if (refreshButton) {
    refreshButton.addEventListener(
      "click",
      loadActiveOrdersModule
    );
  }

  document
    .querySelectorAll("[data-order-filter]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const filter =
          button.dataset.orderFilter || "todos";

        panelState.activeOrderFilter = filter;

        document
          .querySelectorAll("[data-order-filter]")
          .forEach((filterButton) => {
            filterButton.classList.toggle(
              "active",
              filterButton === button
            );
          });

        renderActiveOrders();
      });
    });
}

/**
 * Consulta y presenta los pedidos del módulo.
 *
 * @returns {Promise<void>}
 */
async function loadActiveOrdersModule() {
  if (panelState.currentView !== "pedidos") {
    return;
  }

  clearMessage();

  const refreshButton =
    document.querySelector("#refresh-orders");

  const loading =
    document.querySelector(
      "#active-orders-loading"
    );

  const empty =
    document.querySelector(
      "#active-orders-empty"
    );

  const list =
    document.querySelector(
      "#active-orders-list"
    );

  const count =
    document.querySelector(
      "#active-orders-count"
    );

  if (
    !loading ||
    !empty ||
    !list ||
    !count
  ) {
    showMessage(
      "La estructura del módulo de pedidos está incompleta."
    );

    return;
  }

  setButtonLoading(
    refreshButton,
    true,
    "Actualizando…"
  );

  setOrdersLoadingState({
    loading,
    empty,
    list,
    count
  });

  try {
    const orders = await fetchActiveOrders();

    loading.hidden = true;

    if (orders === null) {
      return;
    }

    renderActiveOrders();
  } finally {
    setButtonLoading(
      refreshButton,
      false,
      "Actualizar"
    );
  }
}

/**
 * Filtra y renderiza los pedidos activos.
 */
function renderActiveOrders() {
  const empty =
    document.querySelector(
      "#active-orders-empty"
    );

  const list =
    document.querySelector(
      "#active-orders-list"
    );

  const count =
    document.querySelector(
      "#active-orders-count"
    );

  if (!empty || !list || !count) {
    return;
  }

  const filteredOrders =
    panelState.activeOrderFilter === "todos"
      ? panelState.orders
      : panelState.orders.filter(
          (order) =>
            order.estado ===
            panelState.activeOrderFilter
        );

  count.textContent =
    String(filteredOrders.length);

  empty.hidden =
    filteredOrders.length > 0;

  if (filteredOrders.length === 0) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = filteredOrders
    .map(createOrderCard)
    .join("");

  attachOrderCardEvents(list);
}

/**
 * Consulta los pedidos activos en Supabase.
 *
 * @returns {Promise<Array<object>|null>}
 */
async function fetchActiveOrders() {
  const {
    data,
    error
  } = await window.toscanaSupabase.rpc(
    "listar_pedidos_activos"
  );

  if (error) {
    console.error(
      "Error al cargar pedidos activos:",
      error
    );

    showMessage(
      "No fue posible cargar los pedidos activos."
    );

    return null;
  }

  panelState.orders =
    Array.isArray(data)
      ? data
      : [];

  return panelState.orders;
}

/**
 * Prepara el estado visual de carga de pedidos.
 *
 * @param {object} elements
 */
function setOrdersLoadingState({
  loading,
  empty,
  list,
  count
}) {
  loading.hidden = false;
  empty.hidden = true;
  list.innerHTML = "";
  count.textContent = "0";
}

/**
 * Genera la tarjeta HTML de un pedido.
 *
 * @param {object} order
 * @returns {string}
 */
function createOrderCard(order) {
  const orderId =
    order.pedido_id || "";

  const ticket =
    order.ticket || "Sin ticket";

  const location =
    getOrderLocation(order);

  const customer =
    order.cliente_nombre
      ? escapeHTML(order.cliente_nombre)
      : "";

  const elapsedTime =
    getElapsedTime(order.creado_en);

  return `
    <article
      class="order-card"
      data-id="${escapeHTML(orderId)}"
      tabindex="0"
      role="button"
      aria-label="Abrir pedido ${escapeHTML(ticket)}"
    >
      <div class="order-card-header">
        <div>
          <strong>${escapeHTML(ticket)}</strong>
          <span>${escapeHTML(location)}</span>
        </div>

        <span
          class="status-badge status-${escapeHTML(
            order.estado
          )}"
        >
          ${escapeHTML(pretty(order.estado))}
        </span>
      </div>

      ${
        customer
          ? `
            <p class="order-customer">
              Cliente: ${customer}
            </p>
          `
          : ""
      }

      <div class="order-card-body">
        <div>
          <span>Productos</span>
          <strong>
            ${Number(order.cantidad_items || 0)}
          </strong>
        </div>

        <div>
          <span>Total</span>
          <strong>${money(order.total)}</strong>
        </div>

        <div>
          <span>Tiempo</span>
          <strong>${escapeHTML(elapsedTime)}</strong>
        </div>
      </div>
    </article>
  `;
}

/**
 * Agrega eventos de apertura a las tarjetas.
 *
 * @param {HTMLElement} container
 */
function attachOrderCardEvents(container) {
  container
    .querySelectorAll(".order-card")
    .forEach((card) => {
      const openCard = () => {
        const orderId = card.dataset.id;

        if (orderId) {
          openOrder(orderId);
        }
      };

      card.addEventListener(
        "click",
        openCard
      );

      card.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            openCard();
          }
        }
      );
    });
}

/**
 * Determina la ubicación de un pedido.
 *
 * @param {object} order
 * @returns {string}
 */
function getOrderLocation(order) {
  if (order.tipo === "mesa") {
    if (order.mesa_nombre) {
      return order.mesa_nombre;
    }

    if (order.mesa_numero) {
      return `Mesa ${order.mesa_numero}`;
    }

    return "Mesa";
  }

  return pretty(order.tipo) || "Sin ubicación";
}

/**
 * Calcula el tiempo transcurrido desde la creación.
 *
 * @param {string} createdAt
 * @returns {string}
 */
function getElapsedTime(createdAt) {
  if (!createdAt) {
    return "—";
  }

  const createdDate =
    new Date(createdAt);

  if (
    Number.isNaN(createdDate.getTime())
  ) {
    return "—";
  }

  const difference =
    Date.now() - createdDate.getTime();

  const minutes =
    Math.max(
      0,
      Math.floor(difference / 60000)
    );

  if (minutes < 1) {
    return "Ahora";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours =
    Math.floor(minutes / 60);

  const remainingMinutes =
    minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${remainingMinutes} min`;
}

/**
 * Abre el modal de detalle.
 *
 * @param {string} orderId
 * @returns {Promise<void>}
 */
async function openOrder(orderId) {
  const dialog =
    document.querySelector("#order-dialog");

  const content =
    document.querySelector(
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

  const {
    data,
    error
  } = await window.toscanaSupabase.rpc(
    "obtener_detalle_pedido",
    {
      p_pedido_id: orderId
    }
  );

  if (error) {
    console.error(
      "Error al cargar el pedido:",
      error
    );

    content.innerHTML = `
      <div class="empty-state">
        <strong>
          No fue posible cargar el pedido.
        </strong>

        <p>${escapeHTML(error.message)}</p>
      </div>
    `;

    return;
  }

  content.innerHTML =
    createOrderDetail(data);
}

/**
 * Genera el detalle completo del pedido.
 *
 * @param {object} order
 * @returns {string}
 */
function createOrderDetail(order) {
  const details =
    Array.isArray(order?.detalle)
      ? order.detalle
      : [];

  const detailRows =
    details.length > 0
      ? details
          .map((item) => {
            return `
              <tr>
                <td>
                  <strong>
                    ${escapeHTML(
                      item.producto ||
                      "Producto"
                    )}
                  </strong>

                  ${
                    item.observaciones
                      ? `
                        <small>
                          ${escapeHTML(
                            item.observaciones
                          )}
                        </small>
                      `
                      : ""
                  }
                </td>

                <td>
                  ${Number(item.cantidad || 0)}
                </td>

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
          <h2>
            ${escapeHTML(
              order?.ticket ||
              "Sin ticket"
            )}
          </h2>
        </div>

        <span
          class="status-badge status-${escapeHTML(
            order?.estado
          )}"
        >
          ${escapeHTML(
            pretty(order?.estado)
          )}
        </span>
      </div>

      <div class="order-detail-summary">
        <div>
          <span>Ubicación</span>
          <strong>
            ${escapeHTML(
              getOrderDetailLocation(order)
            )}
          </strong>
        </div>

        <div>
          <span>Total</span>
          <strong>
            ${money(order?.total)}
          </strong>
        </div>

        <div>
          <span>Pago</span>
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
              <span>
                Observaciones generales
              </span>

              <p>
                ${escapeHTML(
                  order.observaciones
                )}
              </p>
            </div>
          `
          : ""
      }
    </div>
  `;
}

/**
 * Determina la ubicación desde el detalle RPC.
 *
 * @param {object} order
 * @returns {string}
 */
function getOrderDetailLocation(order) {
  if (order?.tipo === "mesa") {
    if (order?.mesa?.nombre) {
      return order.mesa.nombre;
    }

    if (order?.mesa?.numero) {
      return `Mesa ${order.mesa.numero}`;
    }

    return "Mesa";
  }

  return pretty(order?.tipo) || "Sin ubicación";
}

/**
 * Muestra temporalmente un módulo pendiente.
 *
 * @param {string} viewName
 */
function renderPendingModule(viewName) {
  panelState.currentView = viewName;

  const container =
    document.querySelector("#view-container");

  const moduleName =
    VIEW_NAMES[viewName] || "Módulo";

  container.innerHTML = `
    <section class="panel-view active">
      <div class="content-card placeholder-card">
        <h2>${escapeHTML(moduleName)}</h2>

        <p>
          Este módulo está preparado para su
          implementación incremental.
        </p>
      </div>
    </section>
  `;
}

/**
 * Cierra el menú lateral.
 */
function closeSidebar() {
  document
    .querySelector("#sidebar")
    .classList.remove("open");

  document
    .querySelector("#sidebar-overlay")
    .classList.remove("visible");
}

/**
 * Cierra la sesión.
 *
 * @returns {Promise<void>}
 */
async function logout() {
  const button =
    document.querySelector("#logout-button");

  setButtonLoading(
    button,
    true,
    "Cerrando sesión…"
  );

  try {
    await window.toscanaSupabase.auth.signOut();
  } catch (error) {
    console.error(
      "Error al cerrar sesión:",
      error
    );
  } finally {
    redirectToLogin();
  }
}

/**
 * Redirige al inicio de sesión.
 */
function redirectToLogin() {
  window.location.replace("./login.html");
}

/**
 * Muestra un error crítico.
 *
 * @param {string} message
 */
function fatal(message) {
  document.querySelector(
    "#app-loading"
  ).innerHTML = `
    <div class="fatal-error">
      <h1>No fue posible cargar el panel</h1>

      <p>${escapeHTML(message)}</p>

      <a href="./login.html">
        Volver al inicio de sesión
      </a>
    </div>
  `;
}

/**
 * Muestra un mensaje global.
 *
 * @param {string} message
 */
function showMessage(message) {
  const element =
    document.querySelector("#global-message");

  element.textContent = message;
  element.hidden = false;
}

/**
 * Limpia el mensaje global.
 */
function clearMessage() {
  const element =
    document.querySelector("#global-message");

  element.textContent = "";
  element.hidden = true;
}

/**
 * Cambia el estado visual de un botón.
 *
 * @param {HTMLButtonElement|null} button
 * @param {boolean} loading
 * @param {string} text
 */
function setButtonLoading(
  button,
  loading,
  text
) {
  if (!button) {
    return;
  }

  button.disabled = loading;
  button.textContent = text;
}

/**
 * Asigna texto a un selector.
 *
 * @param {string} selector
 * @param {string|number} value
 */
function setText(selector, value) {
  const element =
    document.querySelector(selector);

  if (element) {
    element.textContent =
      String(value);
  }
}

/**
 * Formatea valores monetarios.
 *
 * @param {unknown} value
 * @returns {string}
 */
function money(value) {
  return new Intl.NumberFormat(
    "es-EC",
    {
      style: "currency",
      currency: "USD"
    }
  ).format(Number(value || 0));
}

/**
 * Convierte un valor técnico a texto.
 *
 * @param {unknown} value
 * @returns {string}
 */
function pretty(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

/**
 * Obtiene las iniciales del usuario.
 *
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  const initials =
    String(name || "TG")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();

  return initials || "TG";
}

/**
 * Escapa texto para insertarlo en HTML.
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
 * Escapa valores usados en selectores CSS.
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
