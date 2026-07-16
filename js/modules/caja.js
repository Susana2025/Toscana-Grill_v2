"use strict";

/**
 * Módulo Caja de Toscana Grill.
 *
 * Flujo simplificado:
 * listo -> entregado -> cerrado
 *
 * Responsabilidades:
 * - Cargar la vista caja.html.
 * - Consultar pedidos activos.
 * - Mostrar pedidos listos y entregados.
 * - Marcar pedidos como entregados.
 * - Cerrar pedidos entregados.
 * - Mostrar el total pendiente de los pedidos visibles.
 *
 * En esta etapa no se registran todavía métodos de pago.
 * El cierre representa la finalización administrativa del pedido.
 */

(function initializeCashierModule() {
  const CASHIER_STATES = [
    "listo",
    "entregado"
  ];

  const state = {
    initialized: false,
    loading: false,
    updatingOrderId: null,
    orders: [],
    callbacks: {
      showMessage: null,
      clearMessage: null,
      openOrder: null
    }
  };

  /**
   * Inicializa el módulo Caja.
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

    await window.toscanaViewLoader.load("caja");

    const view = document.querySelector("#view-caja");

    if (!view) {
      throw new Error(
        "La vista caja.html no se cargó correctamente."
      );
    }

    setupEvents();

    state.initialized = true;

    await refresh();
  }

  /**
   * Valida las dependencias requeridas.
   */
  function validateDependencies() {
    if (!window.toscanaSupabase) {
      throw new Error(
        "Supabase no está disponible para el módulo Caja."
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
   * Configura los eventos internos.
   */
  function setupEvents() {
    const refreshButton = document.querySelector(
      "#refresh-cashier"
    );

    if (refreshButton) {
      refreshButton.addEventListener(
        "click",
        refresh
      );
    }
  }

  /**
   * Recarga los pedidos visibles en Caja.
   *
   * @returns {Promise<void>}
   */
  async function refresh() {
    if (!document.querySelector("#view-caja")) {
      return;
    }

    if (state.loading) {
      return;
    }

    state.loading = true;
    state.callbacks.clearMessage();

    const refreshButton = document.querySelector(
      "#refresh-cashier"
    );

    const loading = document.querySelector(
      "#cashier-loading"
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
      state.orders = await fetchCashierOrders();
      render();
    } catch (error) {
      console.error(
        "Error al actualizar Caja:",
        error
      );

      state.callbacks.showMessage(
        error?.message ||
          "No fue posible actualizar el módulo Caja."
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
   * Consulta pedidos activos y conserva los estados de Caja.
   *
   * @returns {Promise<Array<object>>}
   */
  async function fetchCashierOrders() {
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
        "No fue posible consultar los pedidos de Caja."
      );
    }

    return window.toscanaUtils
      .toArray(data)
      .filter((order) =>
        CASHIER_STATES.includes(order.estado)
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
   * Renderiza las columnas de Caja.
   */
  function render() {
    const readyOrders = state.orders.filter(
      (order) => order.estado === "listo"
    );

    const deliveredOrders = state.orders.filter(
      (order) => order.estado === "entregado"
    );

    renderColumn({
      orders: readyOrders,
      listSelector: "#cashier-ready-list",
      emptySelector: "#cashier-ready-empty",
      countSelector: "#cashier-ready-count",
      badgeSelector: "#cashier-ready-badge"
    });

    renderColumn({
      orders: deliveredOrders,
      listSelector: "#cashier-delivered-list",
      emptySelector: "#cashier-delivered-empty",
      countSelector: "#cashier-delivered-count",
      badgeSelector: "#cashier-delivered-badge"
    });

    renderPendingTotal();
  }

  /**
   * Renderiza una columna de Caja.
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

    count.textContent = String(orders.length);
    badge.textContent = String(orders.length);

    empty.hidden = orders.length > 0;

    if (orders.length === 0) {
      list.innerHTML = "";
      return;
    }

    list.innerHTML = orders
      .map(createCashierCard)
      .join("");

    attachCardEvents(list);
  }

  /**
   * Calcula y muestra el total pendiente visible.
   */
  function renderPendingTotal() {
    const total = state.orders.reduce(
      (accumulator, order) => {
        const value = Number(order.total || 0);

        return accumulator +
          (Number.isFinite(value) ? value : 0);
      },
      0
    );

    window.toscanaUtils.setText(
      "#cashier-pending-total",
      window.toscanaUtils.money(total)
    );
  }

  /**
   * Genera una tarjeta de Caja.
   *
   * @param {object} order
   * @returns {string}
   */
  function createCashierCard(order) {
    const utils = window.toscanaUtils;

    const orderId =
      order.pedido_id ||
      order.id ||
      "";

    const ticket =
      order.ticket ||
      "Sin ticket";

    const location =
      utils.getOrderLocation(order);

    const elapsedTime =
      utils.getElapsedTime(order.creado_en);

    const customerHTML =
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

    return `
      <article
        class="kitchen-card cashier-card"
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

          <span class="status-badge status-${utils.escapeHTML(
            order.estado
          )}">
            ${utils.escapeHTML(
              utils.pretty(order.estado)
            )}
          </span>
        </header>

        ${customerHTML}

        <div class="cashier-order-summary">
          <div>
            <span>Productos</span>

            <strong>
              ${Number(
                order.cantidad_items || 0
              )}
            </strong>
          </div>

          <div>
            <span>Total</span>

            <strong>
              ${utils.money(order.total)}
            </strong>
          </div>

          <div>
            <span>Tiempo</span>

            <strong>
              ${utils.escapeHTML(elapsedTime)}
            </strong>
          </div>
        </div>

        <footer class="kitchen-card-footer">
          <button
            class="kitchen-detail-button"
            type="button"
            data-cashier-detail="${utils.escapeHTML(
              orderId
            )}"
          >
            Ver detalle
          </button>

          ${createActionButton(order)}
        </footer>
      </article>
    `;
  }

  /**
   * Genera la acción disponible según el estado.
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

    if (order.estado === "listo") {
      return `
        <button
          class="kitchen-action-button"
          type="button"
          data-cashier-action="entregado"
          data-order-id="${utils.escapeHTML(orderId)}"
          ${isUpdating ? "disabled" : ""}
        >
          ${
            isUpdating
              ? "Procesando…"
              : "Marcar entregado"
          }
        </button>
      `;
    }

    if (order.estado === "entregado") {
      return `
        <button
          class="kitchen-action-button"
          type="button"
          data-cashier-action="cerrado"
          data-order-id="${utils.escapeHTML(orderId)}"
          ${isUpdating ? "disabled" : ""}
        >
          ${
            isUpdating
              ? "Procesando…"
              : "Cerrar pedido"
          }
        </button>
      `;
    }

    return "";
  }

  /**
   * Registra los eventos de las tarjetas.
   *
   * @param {HTMLElement} container
   */
  function attachCardEvents(container) {
    container
      .querySelectorAll(
        "[data-cashier-detail]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const orderId =
              button.dataset.cashierDetail;

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
        "[data-cashier-action]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            const orderId =
              button.dataset.orderId;

            const nextState =
              button.dataset.cashierAction;

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
   * Cambia el estado mediante la RPC segura.
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

    const actionConfirmed =
      confirmStatusChange(nextState);

    if (!actionConfirmed) {
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
          "Error al actualizar el pedido desde Caja:",
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
        "Error operativo de Caja:",
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
          "#view-caja"
        )
      ) {
        render();
      }
    }
  }

  /**
   * Solicita confirmación antes de acciones finales.
   *
   * @param {string} nextState
   * @returns {boolean}
   */
  function confirmStatusChange(nextState) {
    if (nextState === "entregado") {
      return window.confirm(
        "¿Confirmas que el pedido ya fue entregado?"
      );
    }

    if (nextState === "cerrado") {
      return window.confirm(
        "¿Confirmas que el pedido puede cerrarse?"
      );
    }

    return true;
  }

  /**
   * Limpia visualmente las columnas.
   */
  function clearColumns() {
    const listSelectors = [
      "#cashier-ready-list",
      "#cashier-delivered-list"
    ];

    const emptySelectors = [
      "#cashier-ready-empty",
      "#cashier-delivered-empty"
    ];

    const countSelectors = [
      "#cashier-ready-count",
      "#cashier-delivered-count",
      "#cashier-ready-badge",
      "#cashier-delivered-badge"
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

    window.toscanaUtils.setText(
      "#cashier-pending-total",
      window.toscanaUtils.money(0)
    );
  }

  /**
   * Limpia el estado interno del módulo.
   */
  function destroy() {
    state.initialized = false;
    state.loading = false;
    state.updatingOrderId = null;
    state.orders = [];

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

  window.toscanaCashierModule =
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
