"use strict";

/**
 * Módulo Cocina de Toscana Grill.
 *
 * Flujo simplificado:
 * pendiente / confirmado -> en_preparacion -> listo
 *
 * Responsabilidades:
 * - Cargar la vista cocina.html.
 * - Consultar pedidos activos.
 * - Mostrar pedidos por preparar, en preparación y listos.
 * - Consultar productos y observaciones.
 * - Cambiar estados mediante la RPC actualizar_estado_pedido.
 * - Escuchar cambios mediante Supabase Realtime.
 * - Refrescar automáticamente sin duplicar consultas.
 */

(function initializeKitchenModule() {
  const KITCHEN_STATES = [
    "pendiente",
    "confirmado",
    "en_preparacion",
    "listo"
  ];

  const REALTIME_REFRESH_DELAY = 350;

  const state = {
    initialized: false,
    loading: false,
    refreshPending: false,
    updatingOrderId: null,
    realtimeTimer: null,
    unsubscribeRealtime: null,
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
    setupRealtime();

    state.initialized = true;

    await refresh();
  }

  /**
   * Valida las dependencias globales requeridas.
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

    if (!window.toscanaRealtime) {
      throw new Error(
        "El servicio Realtime no está disponible."
      );
    }
  }

  /**
   * Configura los eventos internos del módulo.
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
   * Activa la suscripción Realtime.
   */
  function setupRealtime() {
    if (state.unsubscribeRealtime) {
      state.unsubscribeRealtime();
    }

    state.unsubscribeRealtime =
      window.toscanaRealtime.subscribe(
        handleRealtimeChange
      );
  }

  /**
   * Procesa un cambio recibido desde Supabase Realtime.
   *
   * @param {object} event
   */
  function handleRealtimeChange(event) {
    if (!state.initialized) {
      return;
    }

    if (!document.querySelector("#view-cocina")) {
      return;
    }

    const newState =
      event?.newRecord?.estado || null;

    const oldState =
      event?.oldRecord?.estado || null;

    const affectsKitchen =
      event?.type === "INSERT" ||
      KITCHEN_STATES.includes(newState) ||
      KITCHEN_STATES.includes(oldState);

    if (!affectsKitchen) {
      return;
    }

    scheduleRealtimeRefresh();
  }

  /**
   * Programa un refresco breve para agrupar eventos consecutivos.
   */
  function scheduleRealtimeRefresh() {
    if (state.realtimeTimer) {
      window.clearTimeout(
        state.realtimeTimer
      );
    }

    state.realtimeTimer =
      window.setTimeout(
        async () => {
          state.realtimeTimer = null;

          if (state.loading) {
            state.refreshPending = true;
            return;
          }

          await refresh();
        },
        REALTIME_REFRESH_DELAY
      );
  }

  /**
   * Recarga toda la información del tablero de cocina.
   *
   * @returns {Promise<void>}
   */
  async function refresh() {
    if (!document.querySelector("#view-cocina")) {
      return;
    }

    if (state.loading) {
      state.refreshPending = true;
      return;
    }

    state.loading = true;
    state.refreshPending = false;
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

      if (state.refreshPending) {
        state.refreshPending = false;

        window.setTimeout(
          refresh,
          150
        );
      }
    }
  }

  /**
   * Consulta los pedidos activos relevantes para cocina.
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
   * Consulta el detalle de cada pedido.
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
    const pendingOrders =
      state.orders.filter(
        (order) =>
          order.estado === "pendiente" ||
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
      orders: pendingOrders,
      listSelector: "#kitchen-pending-list",
      emptySelector: "#kitchen-pending-empty",
      countSelector: "#kitchen-pending-count",
      badgeSelector: "#kitchen-pending-badge"
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
   * Genera una tarjeta operativa.
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

    const actionHTML =
      createActionButton(order);

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
          <button
            class="kitchen-detail-button"
            type="button"
            data-kitchen-detail="${utils.escapeHTML(
              orderId
            )}"
          >
            Ver detalle
          </button>

          ${actionHTML}
        </footer>
      </article>
    `;
  }

  /**
   * Genera el botón de acción según el estado.
   *
   * @param {object} order
   * @returns {string}
   */
  function createActionButton(order) {
    const utils = window.toscanaUtils;

    const orderId =
      order.pedido_id ||
      order.id ||
      "";

    const isUpdating =
      state.updatingOrderId === orderId;

    if (
      order.estado === "pendiente" ||
      order.estado === "confirmado"
    ) {
      return `
        <button
          class="kitchen-action-button"
          type="button"
          data-kitchen-action="en_preparacion"
          data-order-id="${utils.escapeHTML(orderId)}"
          ${isUpdating ? "disabled" : ""}
        >
          ${
            isUpdating
              ? "Procesando…"
              : "Iniciar preparación"
          }
        </button>
      `;
    }

    if (order.estado === "en_preparacion") {
      return `
        <button
          class="kitchen-action-button"
          type="button"
          data-kitchen-action="listo"
          data-order-id="${utils.escapeHTML(orderId)}"
          ${isUpdating ? "disabled" : ""}
        >
          ${
            isUpdating
              ? "Procesando…"
              : "Marcar como listo"
          }
        </button>
      `;
    }

    return "";
  }

  /**
   * Genera el listado de productos.
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
   * Registra eventos de detalle y cambio de estado.
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

    container
      .querySelectorAll(
        "[data-kitchen-action]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            const orderId =
              button.dataset.orderId;

            const nextState =
              button.dataset.kitchenAction;

            if (!orderId || !nextState) {
              return;
            }

            await updateOrderStatus(
              orderId,
              nextState
            );
          }
        );
      });
  }

  /**
   * Ejecuta el cambio de estado mediante la RPC segura.
   *
   * @param {string} orderId
   * @param {string} nextState
   * @returns {Promise<void>}
   */
  async function updateOrderStatus(
    orderId,
    nextState
  ) {
    if (state.updatingOrderId) {
      return;
    }

    state.updatingOrderId = orderId;
    state.callbacks.clearMessage();

    render();

    try {
      const { data, error } =
        await window.toscanaSupabase.rpc(
          "actualizar_estado_pedido",
          {
            p_pedido_id: orderId,
            p_estado_nuevo: nextState,
            p_observacion: null
          }
        );

      if (error) {
        console.error(
          "Error al actualizar el estado del pedido:",
          error
        );

        throw new Error(
          error.message ||
          "No fue posible actualizar el pedido."
        );
      }

      if (
        data &&
        data.actualizado === false
      ) {
        state.callbacks.showMessage(
          data.mensaje ||
          "El pedido no necesitó cambios."
        );
      }

      await refresh();
    } catch (error) {
      console.error(
        "Error operativo de Cocina:",
        error
      );

      state.callbacks.showMessage(
        error?.message ||
        "No fue posible cambiar el estado del pedido."
      );
    } finally {
      state.updatingOrderId = null;

      if (
        document.querySelector(
          "#view-cocina"
        )
      ) {
        render();
      }
    }
  }

  /**
   * Determina la alerta visual por tiempo.
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
      "#kitchen-pending-list",
      "#kitchen-preparing-list",
      "#kitchen-ready-list"
    ];

    const emptySelectors = [
      "#kitchen-pending-empty",
      "#kitchen-preparing-empty",
      "#kitchen-ready-empty"
    ];

    const countSelectors = [
      "#kitchen-pending-count",
      "#kitchen-preparing-count",
      "#kitchen-ready-count",
      "#kitchen-pending-badge",
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
   * Limpia el estado interno y cancela Realtime.
   */
  function destroy() {
    state.initialized = false;
    state.loading = false;
    state.refreshPending = false;
    state.updatingOrderId = null;
    state.orders = [];
    state.details.clear();

    if (state.realtimeTimer) {
      window.clearTimeout(
        state.realtimeTimer
      );

      state.realtimeTimer = null;
    }

    if (state.unsubscribeRealtime) {
      state.unsubscribeRealtime();
      state.unsubscribeRealtime = null;
    }

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
