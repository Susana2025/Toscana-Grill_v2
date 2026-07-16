"use strict";

/**
 * Coordinador principal del panel administrativo.
 *
 * Responsabilidades:
 * - Validar la sesión.
 * - Obtener el perfil del usuario.
 * - Aplicar permisos por rol.
 * - Controlar la navegación.
 * - Cargar los módulos independientes.
 * - Gestionar el modal de detalle de pedidos.
 * - Cerrar sesión.
 *
 * La lógica propia de Dashboard, Pedidos y Cocina
 * se encuentra en sus respectivos archivos.
 */

const panelState = {
  session: null,
  profile: null,
  currentView: null
};

const VIEW_CONFIG = {
  dashboard: {
    title: "Dashboard",
    roles: [
      "administrador",
      "caja",
      "cocina",
      "mesero"
    ],
    moduleName: "toscanaDashboardModule"
  },

  pedidos: {
    title: "Pedidos activos",
    roles: [
      "administrador",
      "caja",
      "cocina",
      "mesero"
    ],
    moduleName: "toscanaOrdersModule"
  },

  cocina: {
    title: "Panel de cocina",
    roles: [
      "administrador",
      "cocina"
    ],
    moduleName: "toscanaKitchenModule"
  },

  caja: {
    title: "Gestión de caja",
    roles: [
      "administrador",
      "caja"
    ],
    moduleName: null
  },

  historial: {
    title: "Histórico de pedidos",
    roles: [
      "administrador",
      "caja",
      "mesero"
    ],
    moduleName: null
  },

  productos: {
    title: "Productos",
    roles: [
      "administrador"
    ],
    moduleName: null
  },

  usuarios: {
    title: "Usuarios",
    roles: [
      "administrador"
    ],
    moduleName: null
  }
};

document.addEventListener(
  "DOMContentLoaded",
  initializePanel
);

/**
 * Inicializa el panel administrativo.
 *
 * @returns {Promise<void>}
 */
async function initializePanel() {
  try {
    validateGlobalDependencies();

    const session = await getCurrentSession();

    if (!session?.user) {
      redirectToLogin();
      return;
    }

    panelState.session = session;
    panelState.profile = await getUserProfile(
      session.user.id
    );

    if (!panelState.profile?.activo) {
      await window.toscanaSupabase.auth.signOut();
      redirectToLogin();
      return;
    }

    setupUserInterface();
    setupGlobalEvents();
    applyRolePermissions();

    await navigateToView("dashboard");

    document.querySelector(
      "#app-loading"
    ).hidden = true;

    document.querySelector(
      "#admin-app"
    ).hidden = false;
  } catch (error) {
    console.error(
      "Error al inicializar el panel:",
      error
    );

    renderFatalError(
      error?.message ||
      "No fue posible cargar el panel administrativo."
    );
  }
}

/**
 * Verifica que las dependencias globales estén disponibles.
 */
function validateGlobalDependencies() {
  const requiredDependencies = [
    {
      object: window.toscanaSupabase,
      message:
        "No se configuró correctamente la conexión con Supabase."
    },
    {
      object: window.toscanaViewLoader,
      message:
        "No se cargó el administrador de vistas."
    },
    {
      object: window.toscanaUtils,
      message:
        "No se cargaron las utilidades compartidas."
    }
  ];

  const missingDependency =
    requiredDependencies.find(
      (dependency) => !dependency.object
    );

  if (missingDependency) {
    throw new Error(
      missingDependency.message
    );
  }
}

/**
 * Obtiene la sesión activa.
 *
 * @returns {Promise<object|null>}
 */
async function getCurrentSession() {
  const {
    data,
    error
  } = await window.toscanaSupabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session || null;
}

/**
 * Obtiene el perfil del usuario autenticado.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getUserProfile(userId) {
  const {
    data,
    error
  } = await window.toscanaSupabase
    .from("perfiles")
    .select(
      "id,nombre_completo,rol,activo"
    )
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(
      "No fue posible consultar el perfil del usuario."
    );
  }

  if (!data) {
    throw new Error(
      "El usuario no tiene un perfil registrado."
    );
  }

  return data;
}

/**
 * Presenta la información del usuario autenticado.
 */
function setupUserInterface() {
  const profile = panelState.profile;

  const displayName =
    profile.nombre_completo ||
    panelState.session?.user?.email ||
    "Usuario";

  window.toscanaUtils.setText(
    "#user-name",
    displayName
  );

  window.toscanaUtils.setText(
    "#user-role",
    window.toscanaUtils.pretty(
      profile.rol
    )
  );

  window.toscanaUtils.setText(
    "#user-avatar",
    window.toscanaUtils.getInitials(
      displayName
    )
  );
}

/**
 * Configura los eventos permanentes del panel.
 */
function setupGlobalEvents() {
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
    document.querySelector(
      "#close-order-dialog"
    );

  logoutButton.addEventListener(
    "click",
    logout
  );

  sidebarToggle.addEventListener(
    "click",
    () => {
      sidebar.classList.toggle("open");
      overlay.classList.toggle("visible");
    }
  );

  overlay.addEventListener(
    "click",
    closeSidebar
  );

  document
    .querySelectorAll(".nav-item")
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const viewName =
            button.dataset.view;

          if (!viewName) {
            return;
          }

          await navigateToView(viewName);
          closeSidebar();
        }
      );
    });

  closeOrderDialog.addEventListener(
    "click",
    () => {
      if (orderDialog.open) {
        orderDialog.close();
      }
    }
  );

  orderDialog.addEventListener(
    "click",
    (event) => {
      if (event.target === orderDialog) {
        orderDialog.close();
      }
    }
  );

  window.addEventListener(
    "resize",
    () => {
      if (window.innerWidth > 900) {
        closeSidebar();
      }
    }
  );
}

/**
 * Oculta las opciones de navegación no autorizadas.
 */
function applyRolePermissions() {
  const currentRole =
    panelState.profile.rol;

  document
    .querySelectorAll(".nav-item")
    .forEach((button) => {
      const viewName =
        button.dataset.view;

      const config =
        VIEW_CONFIG[viewName];

      if (!config) {
        button.hidden = true;
        return;
      }

      button.hidden =
        !config.roles.includes(
          currentRole
        );
    });
}

/**
 * Navega hacia una vista del panel.
 *
 * @param {string} viewName
 * @returns {Promise<void>}
 */
async function navigateToView(viewName) {
  clearGlobalMessage();

  const config =
    VIEW_CONFIG[viewName];

  if (!config) {
    showGlobalMessage(
      "El módulo solicitado no existe."
    );

    return;
  }

  if (
    !config.roles.includes(
      panelState.profile.rol
    )
  ) {
    showGlobalMessage(
      "Tu usuario no tiene autorización para acceder a este módulo."
    );

    return;
  }

  setActiveNavigationItem(viewName);
  setPageTitle(config.title);

  destroyCurrentModule();

  panelState.currentView = viewName;

  if (!config.moduleName) {
    renderPendingModule(config.title);
    return;
  }

  const module =
    window[config.moduleName];

  if (!module) {
    showGlobalMessage(
      `No se cargó correctamente el módulo ${config.title}.`
    );

    renderPendingModule(config.title);
    return;
  }

  renderViewLoading();

  try {
    await module.initialize({
      role: panelState.profile.rol,
      profile: panelState.profile,
      session: panelState.session,
      showMessage: showGlobalMessage,
      clearMessage: clearGlobalMessage,
      openOrder
    });
  } catch (error) {
    console.error(
      `Error al cargar ${config.title}:`,
      error
    );

    showGlobalMessage(
      error?.message ||
      `No fue posible cargar ${config.title}.`
    );

    renderModuleError(
      config.title,
      error?.message
    );
  }
}

/**
 * Destruye el módulo actualmente cargado.
 */
function destroyCurrentModule() {
  const currentConfig =
    VIEW_CONFIG[
      panelState.currentView
    ];

  if (!currentConfig?.moduleName) {
    return;
  }

  const currentModule =
    window[currentConfig.moduleName];

  if (
    currentModule &&
    typeof currentModule.destroy === "function"
  ) {
    currentModule.destroy();
  }
}

/**
 * Marca la opción activa del menú.
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
 * @param {string} title
 */
function setPageTitle(title) {
  window.toscanaUtils.setText(
    "#page-title",
    title
  );
}

/**
 * Muestra una pantalla de carga de módulo.
 */
function renderViewLoading() {
  const container =
    document.querySelector(
      "#view-container"
    );

  container.innerHTML = `
    <div class="view-loading">
      <div class="loader"></div>
      <p>Cargando módulo…</p>
    </div>
  `;
}

/**
 * Muestra un módulo todavía no desarrollado.
 *
 * @param {string} title
 */
function renderPendingModule(title) {
  const container =
    document.querySelector(
      "#view-container"
    );

  container.innerHTML = `
    <section class="panel-view active">
      <div class="content-card placeholder-card">
        <h2>
          ${window.toscanaUtils.escapeHTML(
            title
          )}
        </h2>

        <p>
          Este módulo está preparado para su
          implementación incremental.
        </p>
      </div>
    </section>
  `;
}

/**
 * Muestra un error de carga dentro del módulo.
 *
 * @param {string} title
 * @param {string} message
 */
function renderModuleError(title, message) {
  const container =
    document.querySelector(
      "#view-container"
    );

  container.innerHTML = `
    <section class="panel-view active">
      <div class="content-card placeholder-card">
        <h2>
          No fue posible cargar
          ${window.toscanaUtils.escapeHTML(
            title
          )}
        </h2>

        <p>
          ${window.toscanaUtils.escapeHTML(
            message ||
            "Se produjo un error inesperado."
          )}
        </p>
      </div>
    </section>
  `;
}

/**
 * Abre el detalle completo de un pedido.
 *
 * @param {string} orderId
 * @returns {Promise<void>}
 */
async function openOrder(orderId) {
  const dialog =
    document.querySelector(
      "#order-dialog"
    );

  const content =
    document.querySelector(
      "#order-detail-content"
    );

  if (!orderId) {
    return;
  }

  content.innerHTML = `
    <div class="section-loading">
      Cargando detalle del pedido…
    </div>
  `;

  if (!dialog.open) {
    dialog.showModal();
  }

  try {
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
      throw error;
    }

    content.innerHTML =
      createOrderDetailHTML(data);
  } catch (error) {
    console.error(
      "Error al cargar el detalle del pedido:",
      error
    );

    content.innerHTML = `
      <div class="empty-state">
        <strong>
          No fue posible cargar el pedido.
        </strong>

        <p>
          ${window.toscanaUtils.escapeHTML(
            error?.message ||
            "Se produjo un error inesperado."
          )}
        </p>
      </div>
    `;
  }
}

/**
 * Genera el HTML del detalle de un pedido.
 *
 * @param {object} order
 * @returns {string}
 */
function createOrderDetailHTML(order = {}) {
  const utils =
    window.toscanaUtils;

  const details =
    utils.toArray(order.detalle);

  const detailRows =
    details.length > 0
      ? details
          .map((item) => {
            const productName =
              item.producto ||
              item.nombre_producto ||
              "Producto";

            const itemObservation =
              item.observaciones
                ? `
                  <small>
                    ${utils.escapeHTML(
                      item.observaciones
                    )}
                  </small>
                `
                : "";

            return `
              <tr>
                <td>
                  <strong>
                    ${utils.escapeHTML(
                      productName
                    )}
                  </strong>

                  ${itemObservation}
                </td>

                <td>
                  ${Number(
                    item.cantidad || 0
                  )}
                </td>

                <td>
                  ${utils.money(
                    item.precio_unitario
                  )}
                </td>

                <td>
                  ${utils.money(
                    item.subtotal
                  )}
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

  const customerHTML =
    order.cliente_nombre
      ? `
        <div>
          <span>Cliente</span>

          <strong>
            ${utils.escapeHTML(
              order.cliente_nombre
            )}
          </strong>
        </div>
      `
      : "";

  const customerPhoneHTML =
    order.cliente_telefono
      ? `
        <div>
          <span>Teléfono</span>

          <strong>
            ${utils.escapeHTML(
              order.cliente_telefono
            )}
          </strong>
        </div>
      `
      : "";

  const observationHTML =
    order.observaciones
      ? `
        <div class="order-observations">
          <span>
            Observaciones generales
          </span>

          <p>
            ${utils.escapeHTML(
              order.observaciones
            )}
          </p>
        </div>
      `
      : "";

  return `
    <div class="order-detail">
      <div class="order-detail-header">
        <div>
          <p>Pedido</p>

          <h2>
            ${utils.escapeHTML(
              order.ticket ||
              "Sin ticket"
            )}
          </h2>
        </div>

        <span
          class="status-badge status-${utils.escapeHTML(
            order.estado
          )}"
        >
          ${utils.escapeHTML(
            utils.pretty(
              order.estado
            )
          )}
        </span>
      </div>

      <div class="order-detail-summary">
        <div>
          <span>Ubicación</span>

          <strong>
            ${utils.escapeHTML(
              utils.getOrderLocation(
                order
              )
            )}
          </strong>
        </div>

        <div>
          <span>Total</span>

          <strong>
            ${utils.money(
              order.total
            )}
          </strong>
        </div>

        <div>
          <span>Estado de pago</span>

          <strong>
            ${utils.escapeHTML(
              utils.pretty(
                order.estado_pago
              )
            )}
          </strong>
        </div>

        ${customerHTML}
        ${customerPhoneHTML}
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

      ${observationHTML}
    </div>
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
    .querySelector(
      "#sidebar-overlay"
    )
    .classList.remove("visible");
}

/**
 * Cierra la sesión del usuario.
 *
 * @returns {Promise<void>}
 */
async function logout() {
  const logoutButton =
    document.querySelector(
      "#logout-button"
    );

  window.toscanaUtils.setButtonLoading(
    logoutButton,
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
 * Redirige al formulario de login.
 */
function redirectToLogin() {
  window.location.replace(
    "./login.html"
  );
}

/**
 * Muestra un mensaje global.
 *
 * @param {string} message
 */
function showGlobalMessage(message) {
  const element =
    document.querySelector(
      "#global-message"
    );

  if (!element) {
    return;
  }

  element.textContent = message;
  element.hidden = false;
}

/**
 * Limpia el mensaje global.
 */
function clearGlobalMessage() {
  const element =
    document.querySelector(
      "#global-message"
    );

  if (!element) {
    return;
  }

  element.textContent = "";
  element.hidden = true;
}

/**
 * Muestra un error crítico durante la carga inicial.
 *
 * @param {string} message
 */
function renderFatalError(message) {
  const loading =
    document.querySelector(
      "#app-loading"
    );

  loading.innerHTML = `
    <div class="fatal-error">
      <h1>
        No fue posible cargar el panel
      </h1>

      <p>
        ${window.toscanaUtils
          ? window.toscanaUtils.escapeHTML(
              message
            )
          : String(message)}
      </p>

      <a href="./login.html">
        Volver al inicio de sesión
      </a>
    </div>
  `;
}
