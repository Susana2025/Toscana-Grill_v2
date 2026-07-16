"use strict";

/**
 * Coordinador principal del panel administrativo.
 *
 * Responsabilidades:
 * - Validar sesión.
 * - Consultar perfil.
 * - Aplicar permisos.
 * - Controlar navegación.
 * - Inicializar módulos independientes.
 * - Gestionar el modal de detalle de pedidos.
 * - Cerrar sesión.
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
    moduleName: "toscanaCashierModule"
  },

  historial: {
    title: "Histórico de pedidos",
    roles: [
      "administrador",
      "caja",
      "mesero"
    ],
    moduleName: "toscanaHistoryModule"
  },

  productos: {
    title: "Gestión de productos",
    roles: [
      "administrador"
    ],
    moduleName: "toscanaProductsModule"
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

    const appLoading =
      document.querySelector(
        "#app-loading"
      );

    const adminApp =
      document.querySelector(
        "#admin-app"
      );

    if (appLoading) {
      appLoading.hidden = true;
    }

    if (adminApp) {
      adminApp.hidden = false;
    }
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
 * Verifica las dependencias globales.
 */
function validateGlobalDependencies() {
  const dependencies = [
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
    dependencies.find(
      (dependency) =>
        !dependency.object
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
  } =
    await window.toscanaSupabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session || null;
}

/**
 * Obtiene el perfil del usuario.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getUserProfile(userId) {
  const {
    data,
    error
  } =
    await window.toscanaSupabase
      .from("perfiles")
      .select(
        "id,nombre_completo,rol,activo"
      )
      .eq("id", userId)
      .single();

  if (error) {
    console.error(
      "Error al consultar el perfil:",
      error
    );

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
 * Presenta la información del usuario.
 */
function setupUserInterface() {
  const profile =
    panelState.profile;

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
 * Configura los eventos globales del panel.
 */
function setupGlobalEvents() {
  const logoutButton =
    document.querySelector(
      "#logout-button"
    );

  const sidebarToggle =
    document.querySelector(
      "#sidebar-toggle"
    );

  const sidebar =
    document.querySelector(
      "#sidebar"
    );

  const overlay =
    document.querySelector(
      "#sidebar-overlay"
    );

  const orderDialog =
    document.querySelector(
      "#order-dialog"
    );

  const closeOrderDialog =
    document.querySelector(
      "#close-order-dialog"
    );

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      logout
    );
  }

  if (
    sidebarToggle &&
    sidebar &&
    overlay
  ) {
    sidebarToggle.addEventListener(
      "click",
      () => {
        const isOpen =
          sidebar.classList.toggle(
            "open"
          );

        overlay.classList.toggle(
          "visible",
          isOpen
        );

        sidebarToggle.setAttribute(
          "aria-expanded",
          String(isOpen)
        );
      }
    );
  }

  if (overlay) {
    overlay.addEventListener(
      "click",
      closeSidebar
    );
  }

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

          await navigateToView(
            viewName
          );

          closeSidebar();
        }
      );
    });

  if (
    closeOrderDialog &&
    orderDialog
  ) {
    closeOrderDialog.addEventListener(
      "click",
      () => {
        if (orderDialog.open) {
          orderDialog.close();
        }
      }
    );
  }

  if (orderDialog) {
    orderDialog.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          orderDialog
        ) {
          orderDialog.close();
        }
      }
    );
  }

  window.addEventListener(
    "resize",
    () => {
      if (
        window.innerWidth >
        900
      ) {
        closeSidebar();
      }
    }
  );
}

/**
 * Aplica permisos sobre las opciones del menú.
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
 * Navega hacia un módulo.
 *
 * @param {string} viewName
 * @returns {Promise<void>}
 */
async function navigateToView(
  viewName
) {
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

  setActiveNavigationItem(
    viewName
  );

  setPageTitle(
    config.title
  );

  destroyCurrentModule();

  panelState.currentView =
    viewName;

  if (!config.moduleName) {
    renderPendingModule(
      config.title
    );

    return;
  }

  const module =
    window[config.moduleName];

  if (!module) {
    const message =
      `No se cargó correctamente el módulo ${config.title}.`;

    showGlobalMessage(
      message
    );

    renderModuleError(
      config.title,
      "El archivo JavaScript del módulo no está disponible."
    );

    return;
  }

  renderViewLoading();

  try {
    await module.initialize({
      role:
        panelState.profile.rol,
      profile:
        panelState.profile,
      session:
        panelState.session,
      showMessage:
        showGlobalMessage,
      clearMessage:
        clearGlobalMessage,
      openOrder
    });
  } catch (error) {
    console.error(
      `Error al cargar ${config.title}:`,
      error
    );

    const message =
      error?.message ||
      `No fue posible cargar ${config.title}.`;

    showGlobalMessage(
      message
    );

    renderModuleError(
      config.title,
      message
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

  if (
    !currentConfig?.moduleName
  ) {
    return;
  }

  const currentModule =
    window[
      currentConfig.moduleName
    ];

  if (
    currentModule &&
    typeof currentModule.destroy ===
      "function"
  ) {
    try {
      currentModule.destroy();
    } catch (error) {
      console.error(
        "Error al destruir el módulo actual:",
        error
      );
    }
  }
}

/**
 * Marca el botón activo del menú.
 *
 * @param {string} viewName
 */
function setActiveNavigationItem(
  viewName
) {
  document
    .querySelectorAll(".nav-item")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.view ===
          viewName
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
 * Muestra la carga del módulo.
 */
function renderViewLoading() {
  const container =
    document.querySelector(
      "#view-container"
    );

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="view-loading">
      <div class="loader"></div>

      <p>
        Cargando módulo…
      </p>
    </div>
  `;
}

/**
 * Muestra un módulo pendiente.
 *
 * @param {string} title
 */
function renderPendingModule(title) {
  const container =
    document.querySelector(
      "#view-container"
    );

  if (!container) {
    return;
  }

  container.innerHTML = `
    <section class="panel-view active">
      <div class="content-card placeholder-card">
        <h2>
          ${window.toscanaUtils.escapeHTML(
            title
          )}
        </h2>

        <p>
          Este módulo está preparado para su implementación incremental.
        </p>
      </div>
    </section>
  `;
}

/**
 * Muestra un error dentro del contenedor.
 *
 * @param {string} title
 * @param {string} message
 */
function renderModuleError(
  title,
  message
) {
  const container =
    document.querySelector(
      "#view-container"
    );

  if (!container) {
    return;
  }

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

  if (
    !orderId ||
    !dialog ||
    !content
  ) {
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
    } =
      await window.toscanaSupabase.rpc(
        "obtener_detalle_pedido",
        {
          p_pedido_id:
            orderId
        }
      );

    if (error) {
      throw error;
    }

    content.innerHTML =
      createOrderDetailHTML(
        data || {}
      );
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
 * Genera el contenido del detalle de un pedido.
 *
 * @param {object} order
 * @returns {string}
 */
function createOrderDetailHTML(
  order = {}
) {
  const utils =
    window.toscanaUtils;

  const details =
    utils.toArray(
      order.detalle
    );

  const rows =
    details.length > 0
      ? details
          .map((item) => {
            const productName =
              item.producto ||
              item.nombre_producto ||
              "Producto";

            const observation =
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

                  ${observation}
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

  const customer =
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

  const phone =
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

  const address =
    order.direccion_entrega
      ? `
        <div>
          <span>Dirección</span>

          <strong>
            ${utils.escapeHTML(
              order.direccion_entrega
            )}
          </strong>
        </div>
      `
      : "";

  const observations =
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
          <p>
            Pedido
          </p>

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
          <span>
            Ubicación
          </span>

          <strong>
            ${utils.escapeHTML(
              utils.getOrderLocation(
                order
              )
            )}
          </strong>
        </div>

        <div>
          <span>
            Total
          </span>

          <strong>
            ${utils.money(
              order.total
            )}
          </strong>
        </div>

        <div>
          <span>
            Estado de pago
          </span>

          <strong>
            ${utils.escapeHTML(
              utils.pretty(
                order.estado_pago
              )
            )}
          </strong>
        </div>

        ${customer}
        ${phone}
        ${address}
      </div>

      <div class="order-detail-table-wrapper">
        <table class="order-detail-table">
          <thead>
            <tr>
              <th>
                Producto
              </th>

              <th>
                Cantidad
              </th>

              <th>
                Precio
              </th>

              <th>
                Subtotal
              </th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      ${observations}
    </div>
  `;
}

/**
 * Cierra el menú lateral.
 */
function closeSidebar() {
  const sidebar =
    document.querySelector(
      "#sidebar"
    );

  const overlay =
    document.querySelector(
      "#sidebar-overlay"
    );

  const sidebarToggle =
    document.querySelector(
      "#sidebar-toggle"
    );

  if (sidebar) {
    sidebar.classList.remove(
      "open"
    );
  }

  if (overlay) {
    overlay.classList.remove(
      "visible"
    );
  }

  if (sidebarToggle) {
    sidebarToggle.setAttribute(
      "aria-expanded",
      "false"
    );
  }
}

/**
 * Cierra la sesión.
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
    if (
      window.toscanaRealtime &&
      typeof window.toscanaRealtime.disconnect ===
        "function"
    ) {
      await window.toscanaRealtime.disconnect();
    }

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
 * Redirige al formulario de inicio de sesión.
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

  element.textContent =
    String(message || "");

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
 * Muestra un error crítico.
 *
 * @param {string} message
 */
function renderFatalError(message) {
  const loading =
    document.querySelector(
      "#app-loading"
    );

  if (!loading) {
    return;
  }

  const safeMessage =
    window.toscanaUtils
      ? window.toscanaUtils.escapeHTML(
          message
        )
      : String(message);

  loading.innerHTML = `
    <div class="fatal-error">
      <h1>
        No fue posible cargar el panel
      </h1>

      <p>
        ${safeMessage}
      </p>

      <a href="./login.html">
        Volver al inicio de sesión
      </a>
    </div>
  `;
}
