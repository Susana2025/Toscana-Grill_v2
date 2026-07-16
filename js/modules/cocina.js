"use strict";

/**
 * Módulo Cocina de Toscana Grill.
 *
 * Responsabilidades:
 * - Cargar la vista cocina.html.
 * - Consultar pedidos activos.
 * - Mostrar únicamente pedidos confirmados, en preparación y listos.
 * - Consultar el detalle de cada pedido para mostrar productos.
 * - Distribuir los pedidos en columnas operativas.
 * - Mostrar tiempos y observaciones.
 *
 * Importante:
 * Este módulo todavía no cambia estados.
 * Primero debe existir una función SQL segura que valide:
 * - usuario autenticado;
 * - rol autorizado;
 * - transición permitida;
 * - registro en historial.
 */

(function initializeKitchenModule() {
  const KITCHEN_STATES = [
    "confirmado",
    "en_preparacion",
    "listo"
  ];

  const state = {
    initialized: false,
    loading: false,
    orders: [],
    details: new Map(),
    callbacks: {
      showMessage: null,
      clearMessage: null,
      openOrder: null
    }
  };

  /**
   * Inicializa el módulo Cocina.
   *
   * @param {object} options
   * @param {Function} options.showMessage
   * @param {Function} options.clearMessage
   * @param {Function} options.openOrder
   * @returns {Promise<void>}
   */
  async function initialize(options = {}) {
    validateDependencies();

    state.callbacks.showMessage =
      typeof options.showMessage === "function"
        ? options.showMessage
        : defaultShowMessage;

    state.callbacks.clearMessage =
      typeof options.clearMessage === "function"
        ? options.clearMessage
        : defaultClearMessage;

    state.callbacks.openOrder =
      typeof options.openOrder === "function"
        ? options.openOrder
        : null;

    await window.toscanaViewLoader.load("cocina");

    const view = document.querySelector("#view-cocina");

    if (!view) {
      throw new Error(
        "La vista cocina.html no se cargó correctamente."
      );
    }

    setupEvents();

    state.initialized = true;

    await refresh();
  }

  /**
   * Comprueba que las dependencias globales existan.
   */
  function validateDependencies() {
    if (!window.toscanaSupabase) {
      throw new Error(
        "Supabase no está disponible para el módulo Cocina."
      );
    }

    if (!window.toscanaViewLoader) {
      throw new Error(
        "El cargador de vistas no está disponible."
      );
    }

    if (!window.toscanaUtils) {
      throw new Error(
        "Las utilidades compartidas no están disponibles."
      );
    }
  }

  /**
   * Configura los eventos internos de la vista.
   */
  function setupEvents() {
    const refreshButton = document.querySelector(
      "#refresh-kitchen"
    );

    if (refreshButton) {
      refreshButton.addEventListener(
        "click",
        refresh
      );
    }
  }

  /**
   * Recarga la información del panel de cocina.
   *
   * @returns {Promise<void>}
   */
  async function refresh() {
    if (!document.querySelector("#view-cocina")) {
      return;
    }

    if (state.loading) {
      return;
    }

    state.loading = true;
    state.callbacks.clearMessage();

    const refreshButton = document.querySelector(
      "#refresh-kitchen"
    );

    const loading = document.querySelector(
      "#kitchen-loading"
    );

    window.toscanaUtils.setButtonLoading(
      refreshButton,
      true,
      "Actualizando…"
    );

    if (loading) {
      loading.hidden = false;
    }

    clearColumns();

    try {
      const orders = await fetchKitchenOrders();

      state.orders = orders;
      state.details.clear();

      await loadOrderDetails(orders);

      render();
    } catch (error) {
      console.error(
        "Error al actualizar Cocina:",
        error
      );

      state.callbacks.showMessage(
        error?.message ||
          "No fue posible actualizar el panel de cocina."
      );

      render();
    } finally {
      if (loading) {
        loading.hidden = true;
      }

      window.toscanaUtils.setButtonLoading(
        refreshButton,
        false,
        "Actualizar"
      );

      state.loading = false;
    }
  }

  /**
   * Consulta pedidos activos y conserva solo los estados de cocina.
   *
   * @returns {Promise<Array<object>>}
   */
  async function fetchKitchenOrders() {
    const { data, error } =
      await window.toscanaSupabase.rpc(
        "listar_pedidos_activos"
      );

    if (error) {
      console.error(
        "Error al consultar listar_pedidos_activos:",
        error
      );

      throw new Error(
        "No fue posible consultar los pedidos de cocina."
      );
    }

    return window.toscanaUtils
      .toArray(data)
      .filter((order) =>
        KITCHEN_STATES.includes(order.estado)
      )
      .sort((firstOrder, secondOrder) => {
        const firstDate = new Date(
          firstOrder.creado_en || 0
        ).getTime();

        const secondDate = new Date(
          secondOrder.creado_en || 0
        ).getTime();

        return firstDate - secondDate;
      });
  }

  /**
   * Consulta el detalle de los pedidos para mostrar productos.
   *
   * @param {Array<object>} orders
   * @returns {Promise<void>}
   */
  async function loadOrderDetails(orders) {
    if (orders.length === 0) {
      return;
    }

    const detailRequests = orders.map(
      async (order) => {
        const orderId =
          order.pedido_id ||
          order.id;

        if (!orderId) {
          return;
        }

        const { data, error } =
          await window.toscanaSupabase.rpc(
            "obtener_detalle_pedido",
            {
              p_pedido_id: orderId
            }
          );

        if (error) {
          console.error(
            `Error al cargar el detalle del pedido ${orderId}:`,
            error
          );

          state.details.set(
            orderId,
            {
              detalle: [],
              observaciones: null,
              error: true
            }
          );

          return;
        }

        state.details.set(
          orderId,
          data || {
            detalle: [],
            observaciones: null
          }
        );
      }
    );

    await Promise.all(detailRequests);
  }

  /**
   * Renderiza las tres columnas del tablero.
   */
  function render() {
    const confirmedOrders =
      state.orders.filter(
        (order) =>
          order.estado === "confirmado"
      );

    const preparingOrders =
      state.orders.filter(
        (order) =>
          order.estado === "en_preparacion"
      );

    const readyOrders =
      state.orders.filter(
        (order) =>
          order.estado === "listo"
      );

    renderColumn({
      orders: confirmedOrders,
      listSelector: "#kitchen-confirmed-list",
      emptySelector: "#kitchen-confirmed-empty",
      countSelector: "#kitchen-confirmed-count",
      badgeSelector: "#kitchen-confirmed-badge"
    });

    renderColumn({
      orders: preparingOrders,
      listSelector: "#kitchen-preparing-list",
      emptySelector: "#kitchen-preparing-empty",
      countSelector: "#kitchen-preparing-count",
      badgeSelector: "#kitchen-preparing-badge"
    });

    renderColumn({
      orders: readyOrders,
      listSelector: "#kitchen-ready-list",
      emptySelector: "#kitchen-ready-empty",
      countSelector: "#kitchen-ready-count",
      badgeSelector: "#kitchen-ready-badge"
    });
  }

  /**
   * Renderiza una columna del tablero.
   *
   * @param {object} options
   * @param {Array<object>} options.orders
   * @param {string} options.listSelector
   * @param {string} options.emptySelector
   * @param {string} options.countSelector
   * @param {string} options.badgeSelector
   */
  function renderColumn({
    orders,
    listSelector,
    emptySelector,
    countSelector,
    badgeSelector
  }) {
    const list = document.querySelector(
      listSelector
    );

    const empty = document.querySelector(
      emptySelector
    );

    const count = document.querySelector(
      countSelector
    );

    const badge = document.querySelector(
      badgeSelector
    );

    if (!list || !empty || !count || !badge) {
      return;
    }

    const orderCount = orders.length;

    count.textContent = String(orderCount);
    badge.textContent = String(orderCount);

    empty.hidden = orderCount > 0;

    if (orderCount === 0) {
      list.innerHTML = "";
      return;
    }

    list.innerHTML = orders
      .map(createKitchenCard)
      .join("");

    attachCardEvents(list);
  }

  /**
   * Genera una tarjeta operativa de cocina.
   *
   * @param {object} order
   * @returns {string}
   */
  function createKitchenCard(order) {
    const utils = window.toscanaUtils;

    const orderId =
      order.pedido_id ||
      order.id ||
      "";

    const detail =
      state.details.get(orderId) || {};

    const items =
      utils.toArray(detail.detalle);

    const ticket =
      order.ticket ||
      "Sin ticket";

    const location =
      utils.getOrderLocation(order);

    const elapsedTime =
      utils.getElapsedTime(
        order.creado_en
      );

    const timeLevel =
      getTimeLevel(order.creado_en);

    const productsHTML =
      createProductsList(items);

    const generalObservation =
      detail.observaciones ||
      null;

    const customer =
      order.cliente_nombre
        ? `
          <p class="kitchen-customer">
            Cliente:
            <strong>
              ${utils.escapeHTML(
                order.cliente_nombre
              )}
            </strong>
          </p>
        `
        : "";

    const observationHTML =
      generalObservation
        ? `
          <div class="kitchen-observation">
            <span>Observación general</span>

            <p>
              ${utils.escapeHTML(
                generalObservation
              )}
            </p>
          </div>
        `
        : "";

    const detailErrorHTML =
      detail.error
        ? `
          <p class="kitchen-detail-warning">
            No fue posible cargar el detalle completo.
          </p>
        `
        : "";

    return `
      <article
        class="kitchen-card kitchen-time-${utils.escapeHTML(
          timeLevel
        )}"
        data-id="${utils.escapeHTML(orderId)}"
      >
        <header class="kitchen-card-header">
          <div>
            <strong>
              ${utils.escapeHTML(ticket)}
            </strong>

            <span>
              ${utils.escapeHTML(location)}
            </span>
          </div>

          <span class="kitchen-time">
            ${utils.escapeHTML(elapsedTime)}
          </span>
        </header>

        ${customer}

        <div class="kitchen-products">
          ${productsHTML}
        </div>

        ${observationHTML}
        ${detailErrorHTML}

        <footer class="kitchen-card-footer">
          <span>
            ${Number(
              order.cantidad_items || 0
            )}
            producto${
              Number(
                order.cantidad_items || 0
              ) === 1
                ? ""
                : "s"
            }
          </span>

          <button
            class="kitchen-detail-button"
            type="button"
            data-kitchen-detail="${utils.escapeHTML(
              orderId
            )}"
          >
            Ver detalle
          </button>
        </footer>
      </article>
    `;
  }

  /**
   * Genera el listado de productos de una comanda.
   *
   * @param {Array<object>} items
   * @returns {string}
   */
  function createProductsList(items) {
    const utils = window.toscanaUtils;

    if (items.length === 0) {
      return `
        <p class="kitchen-products-empty">
          No se encontraron productos.
        </p>
      `;
    }

    return `
      <ul class="kitchen-products-list">
        ${items
          .map((item) => {
            const productName =
              item.producto ||
              item.nombre_producto ||
              "Producto";

            const quantity =
              Number(item.cantidad || 0);

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
              <li>
                <div>
                  <strong>
                    ${quantity} ×
                    ${utils.escapeHTML(
                      productName
                    )}
                  </strong>

                  ${itemObservation}
                </div>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }

  /**
   * Registra eventos de las tarjetas de cocina.
   *
   * @param {HTMLElement} container
   */
  function attachCardEvents(container) {
    container
      .querySelectorAll(
        "[data-kitchen-detail]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const orderId =
              button.dataset.kitchenDetail;

            if (
              orderId &&
              state.callbacks.openOrder
            ) {
              state.callbacks.openOrder(
                orderId
              );
            }
          }
        );
      });
  }

  /**
   * Determina la alerta visual según el tiempo transcurrido.
   *
   * @param {unknown} createdAt
   * @returns {"normal"|"warning"|"critical"}
   */
  function getTimeLevel(createdAt) {
    if (!createdAt) {
      return "normal";
    }

    const createdDate = new Date(createdAt);

    if (Number.isNaN(createdDate.getTime())) {
      return "normal";
    }

    const minutes = Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          createdDate.getTime()
        ) / 60000
      )
    );

    if (minutes >= 30) {
      return "critical";
    }

    if (minutes >= 15) {
      return "warning";
    }

    return "normal";
  }

  /**
   * Limpia visualmente las columnas.
   */
  function clearColumns() {
    const listSelectors = [
      "#kitchen-confirmed-list",
      "#kitchen-preparing-list",
      "#kitchen-ready-list"
    ];

    const emptySelectors = [
      "#kitchen-confirmed-empty",
      "#kitchen-preparing-empty",
      "#kitchen-ready-empty"
    ];

    const countSelectors = [
      "#kitchen-confirmed-count",
      "#kitchen-preparing-count",
      "#kitchen-ready-count",
      "#kitchen-confirmed-badge",
      "#kitchen-preparing-badge",
      "#kitchen-ready-badge"
    ];

    listSelectors.forEach((selector) => {
      const element =
        document.querySelector(selector);

      if (element) {
        element.innerHTML = "";
      }
    });

    emptySelectors.forEach((selector) => {
      const element =
        document.querySelector(selector);

      if (element) {
        element.hidden = true;
      }
    });

    countSelectors.forEach((selector) => {
      window.toscanaUtils.setText(
        selector,
        "0"
      );
    });
  }

  /**
   * Limpia el estado interno del módulo.
   */
  function destroy() {
    state.initialized = false;
    state.loading = false;
    state.orders = [];
    state.details.clear();

    state.callbacks = {
      showMessage: null,
      clearMessage: null,
      openOrder: null
    };
  }

  /**
   * Muestra un mensaje global por defecto.
   *
   * @param {string} message
   */
  function defaultShowMessage(message) {
    const element = document.querySelector(
      "#global-message"
    );

    if (!element) {
      return;
    }

    element.textContent = message;
    element.hidden = false;
  }

  /**
   * Limpia el mensaje global por defecto.
   */
  function defaultClearMessage() {
    const element = document.querySelector(
      "#global-message"
    );

    if (!element) {
      return;
    }

    element.textContent = "";
    element.hidden = true;
  }

  window.toscanaKitchenModule =
    Object.freeze({
      initialize,
      refresh,
      destroy,
      getOrders() {
        return [...state.orders];
      },
      isInitialized() {
        return state.initialized;
      }
    });
})();
