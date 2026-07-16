"use strict";

/**
 * Módulo Pedidos activos de Toscana Grill.
 *
 * Responsabilidades:
 * - Cargar la vista pedidos.html.
 * - Consultar pedidos activos.
 * - Filtrar pedidos por estado.
 * - Renderizar tarjetas.
 * - Abrir el detalle mediante panel.js.
 *
 * Este módulo no controla autenticación, navegación global ni sesión.
 */

(function initializeOrdersModule() {
  const state = {
    initialized: false,
    orders: [],
    activeFilter: "todos",
    callbacks: {
      showMessage: null,
      clearMessage: null,
      openOrder: null
    }
  };

  /**
   * Inicializa el módulo.
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

    state.activeFilter = "todos";

    await window.toscanaViewLoader.load("pedidos");

    const view = document.querySelector("#view-pedidos");

    if (!view) {
      throw new Error(
        "La vista pedidos.html no se cargó correctamente."
      );
    }

    setupEvents();

    state.initialized = true;

    await refresh();
  }

  /**
   * Valida dependencias requeridas.
   */
  function validateDependencies() {
    if (!window.toscanaSupabase) {
      throw new Error(
        "Supabase no está disponible para el módulo Pedidos."
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
   * Configura eventos internos.
   */
  function setupEvents() {
    const refreshButton = document.querySelector(
      "#refresh-orders"
    );

    if (refreshButton) {
      refreshButton.addEventListener(
        "click",
        refresh
      );
    }

    document
      .querySelectorAll("[data-order-filter]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const filter =
            button.dataset.orderFilter ||
            "todos";

          state.activeFilter = filter;

          document
            .querySelectorAll("[data-order-filter]")
            .forEach((filterButton) => {
              filterButton.classList.toggle(
                "active",
                filterButton === button
              );
            });

          render();
        });
      });
  }

  /**
   * Recarga los pedidos activos.
   *
   * @returns {Promise<void>}
   */
  async function refresh() {
    if (!document.querySelector("#view-pedidos")) {
      return;
    }

    state.callbacks.clearMessage();

    const refreshButton = document.querySelector(
      "#refresh-orders"
    );

    const loading = document.querySelector(
      "#active-orders-loading"
    );

    const empty = document.querySelector(
      "#active-orders-empty"
    );

    const list = document.querySelector(
      "#active-orders-list"
    );

    const count = document.querySelector(
      "#active-orders-count"
    );

    if (!loading || !empty || !list || !count) {
      state.callbacks.showMessage(
        "La estructura del módulo Pedidos está incompleta."
      );

      return;
    }

    window.toscanaUtils.setButtonLoading(
      refreshButton,
      true,
      "Actualizando…"
    );

    loading.hidden = false;
    empty.hidden = true;
    list.innerHTML = "";
    count.textContent = "0";

    try {
      const { data, error } =
        await window.toscanaSupabase.rpc(
          "listar_pedidos_activos"
        );

      loading.hidden = true;

      if (error) {
        console.error(
          "Error al consultar listar_pedidos_activos:",
          error
        );

        throw new Error(
          "No fue posible cargar los pedidos activos."
        );
      }

      state.orders =
        window.toscanaUtils.toArray(data);

      render();
    } catch (error) {
      console.error(
        "Error al actualizar Pedidos:",
        error
      );

      loading.hidden = true;

      state.callbacks.showMessage(
        error?.message ||
          "No fue posible actualizar el módulo Pedidos."
      );
    } finally {
      window.toscanaUtils.setButtonLoading(
        refreshButton,
        false,
        "Actualizar"
      );
    }
  }

  /**
   * Renderiza pedidos según filtro activo.
   */
  function render() {
    const empty = document.querySelector(
      "#active-orders-empty"
    );

    const list = document.querySelector(
      "#active-orders-list"
    );

    const count = document.querySelector(
      "#active-orders-count"
    );

    if (!empty || !list || !count) {
      return;
    }

    const filteredOrders =
      state.activeFilter === "todos"
        ? state.orders
        : state.orders.filter(
            (order) =>
              order.estado ===
              state.activeFilter
          );

    count.textContent = String(
      filteredOrders.length
    );

    empty.hidden =
      filteredOrders.length > 0;

    if (filteredOrders.length === 0) {
      list.innerHTML = "";
      return;
    }

    list.innerHTML = filteredOrders
      .map(createOrderCard)
      .join("");

    attachOrderEvents(list);
  }

  /**
   * Genera una tarjeta de pedido.
   *
   * @param {object} order
   * @returns {string}
   */
  function createOrderCard(order) {
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

    const customer =
      order.cliente_nombre
        ? `
          <p class="order-customer">
            Cliente:
            ${utils.escapeHTML(
              order.cliente_nombre
            )}
          </p>
        `
        : "";

    const elapsedTime =
      utils.getElapsedTime(
        order.creado_en
      );

    return `
      <article
        class="order-card"
        data-id="${utils.escapeHTML(orderId)}"
        tabindex="0"
        role="button"
        aria-label="Abrir pedido ${utils.escapeHTML(
          ticket
        )}"
      >
        <div class="order-card-header">
          <div>
            <strong>
              ${utils.escapeHTML(ticket)}
            </strong>

            <span>
              ${utils.escapeHTML(location)}
            </span>
          </div>

          <span
            class="status-badge status-${utils.escapeHTML(
              order.estado
            )}"
          >
            ${utils.escapeHTML(
              utils.pretty(order.estado)
            )}
          </span>
        </div>

        ${customer}

        <div class="order-card-body">
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
              ${utils.escapeHTML(
                elapsedTime
              )}
            </strong>
          </div>
        </div>
      </article>
    `;
  }

  /**
   * Registra eventos de apertura.
   *
   * @param {HTMLElement} container
   */
  function attachOrderEvents(container) {
    container
      .querySelectorAll(".order-card")
      .forEach((card) => {
        const openCard = () => {
          const orderId = card.dataset.id;

          if (
            orderId &&
            state.callbacks.openOrder
          ) {
            state.callbacks.openOrder(
              orderId
            );
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
   * Limpia el estado interno.
   */
  function destroy() {
    state.initialized = false;
    state.orders = [];
    state.activeFilter = "todos";

    state.callbacks = {
      showMessage: null,
      clearMessage: null,
      openOrder: null
    };
  }

  /**
   * Muestra mensaje global por defecto.
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

  window.toscanaOrdersModule =
    Object.freeze({
      initialize,
      refresh,
      destroy,
      getOrders() {
        return [...state.orders];
      },
      getActiveFilter() {
        return state.activeFilter;
      },
      isInitialized() {
        return state.initialized;
      }
    });
})();
