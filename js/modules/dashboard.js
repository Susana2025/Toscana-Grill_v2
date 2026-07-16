"use strict";

/**
 * Módulo Dashboard de Toscana Grill.
 *
 * Responsabilidades:
 * - Cargar la vista dashboard.html.
 * - Mostrar la fecha actual.
 * - Consultar el resumen diario.
 * - Consultar pedidos activos.
 * - Renderizar tarjetas de pedidos.
 * - Abrir el detalle mediante panel.js.
 * - Actualizarse automáticamente mediante Supabase Realtime.
 */

(function initializeDashboardModule() {
  const REALTIME_REFRESH_DELAY = 350;

  const state = {
    initialized: false,
    loading: false,
    refreshPending: false,
    currentRole: null,
    orders: [],
    realtimeTimer: null,
    unsubscribeRealtime: null,

    callbacks: {
      showMessage: null,
      clearMessage: null,
      openOrder: null
    }
  };

  /**
   * Inicializa el módulo Dashboard.
   *
   * @param {object} options
   * @param {string} options.role
   * @param {Function} options.showMessage
   * @param {Function} options.clearMessage
   * @param {Function} options.openOrder
   * @returns {Promise<void>}
   */
  async function initialize(options = {}) {
    validateDependencies();

    state.currentRole =
      options.role || null;

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

    await window.toscanaViewLoader.load(
      "dashboard"
    );

    const view = document.querySelector(
      "#view-dashboard"
    );

    if (!view) {
      throw new Error(
        "La vista dashboard.html no se cargó correctamente."
      );
    }

    setupDate();
    setupEvents();
    setupRealtime();

    state.initialized = true;

    await refresh();
  }

  /**
   * Valida dependencias globales.
   */
  function validateDependencies() {
    if (!window.toscanaSupabase) {
      throw new Error(
        "Supabase no está disponible para el módulo Dashboard."
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
   * Muestra la fecha actual.
   */
  function setupDate() {
    const currentDate =
      document.querySelector(
        "#current-date"
      );

    if (!currentDate) {
      return;
    }

    currentDate.textContent =
      new Intl.DateTimeFormat(
        "es-EC",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        }
      ).format(new Date());
  }

  /**
   * Configura eventos internos.
   */
  function setupEvents() {
    const refreshButton =
      document.querySelector(
        "#refresh-dashboard"
      );

    if (refreshButton) {
      refreshButton.addEventListener(
        "click",
        refresh
      );
    }
  }

  /**
   * Activa Realtime.
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
   * Procesa cualquier inserción o cambio de pedido.
   *
   * @param {object} event
   */
  function handleRealtimeChange(event) {
    if (!state.initialized) {
      return;
    }

    if (
      !document.querySelector(
        "#view-dashboard"
      )
    ) {
      return;
    }

    if (
      ![
        "INSERT",
        "UPDATE",
        "DELETE"
      ].includes(event?.type)
    ) {
      return;
    }

    scheduleRealtimeRefresh();
  }

  /**
   * Agrupa eventos consecutivos para evitar consultas duplicadas.
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
   * Actualiza toda la información del Dashboard.
   *
   * @returns {Promise<void>}
   */
  async function refresh() {
    if (
      !document.querySelector(
        "#view-dashboard"
      )
    ) {
      return;
    }

    if (state.loading) {
      state.refreshPending = true;
      return;
    }

    state.loading = true;
    state.refreshPending = false;

    state.callbacks.clearMessage();

    const refreshButton =
      document.querySelector(
        "#refresh-dashboard"
      );

    window.toscanaUtils.setButtonLoading(
      refreshButton,
      true,
      "Actualizando…"
    );

    try {
      const canSeeFinancialSummary =
        [
          "administrador",
          "caja"
        ].includes(state.currentRole);

      if (canSeeFinancialSummary) {
        await Promise.all([
          loadSummary(),
          loadOrders()
        ]);
      } else {
        renderRestrictedSummary();
        await loadOrders();
      }
    } catch (error) {
      console.error(
        "Error al actualizar el Dashboard:",
        error
      );

      state.callbacks.showMessage(
        error?.message ||
        "No fue posible actualizar el Dashboard."
      );
    } finally {
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
   * Consulta indicadores diarios.
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
        "Error al consultar resumen_diario:",
        error
      );

      throw new Error(
        "No fue posible cargar los indicadores diarios."
      );
    }

    window.toscanaUtils.setText(
      "#metric-active-orders",
      data?.pedidos_activos ?? 0
    );

    window.toscanaUtils.setText(
      "#metric-total-orders",
      data?.total_pedidos ?? 0
    );

    window.toscanaUtils.setText(
      "#metric-sales",
      window.toscanaUtils.money(
        data?.ventas_generadas
      )
    );

    window.toscanaUtils.setText(
      "#metric-paid",
      window.toscanaUtils.money(
        data?.total_pagado
      )
    );
  }

  /**
   * Oculta indicadores financieros para roles restringidos.
   */
  function renderRestrictedSummary() {
    window.toscanaUtils.setText(
      "#metric-active-orders",
      "—"
    );

    window.toscanaUtils.setText(
      "#metric-total-orders",
      "—"
    );

    window.toscanaUtils.setText(
      "#metric-sales",
      "Restringido"
    );

    window.toscanaUtils.setText(
      "#metric-paid",
      "Restringido"
    );
  }

  /**
   * Consulta y renderiza pedidos activos.
   *
   * @returns {Promise<void>}
   */
  async function loadOrders() {
    const loading =
      document.querySelector(
        "#orders-loading"
      );

    const empty =
      document.querySelector(
        "#orders-empty"
      );

    const list =
      document.querySelector(
        "#orders-list"
      );

    const count =
      document.querySelector(
        "#orders-count"
      );

    if (
      !loading ||
      !empty ||
      !list ||
      !count
    ) {
      throw new Error(
        "La estructura visual del Dashboard está incompleta."
      );
    }

    loading.hidden = false;
    empty.hidden = true;
    list.innerHTML = "";
    count.textContent = "0";

    const {
      data,
      error
    } = await window.toscanaSupabase.rpc(
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

    count.textContent =
      String(state.orders.length);

    if (state.orders.length === 0) {
      empty.hidden = false;
      return;
    }

    list.innerHTML = state.orders
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
    const utils =
      window.toscanaUtils;

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
      utils.getElapsedTime(
        order.creado_en
      );

    const customerHTML =
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

    return `
      <article
        class="order-card"
        data-id="${utils.escapeHTML(
          orderId
        )}"
        tabindex="0"
        role="button"
        aria-label="Abrir pedido ${utils.escapeHTML(
          ticket
        )}"
      >
        <div class="order-card-header">
          <div>
            <strong>
              ${utils.escapeHTML(
                ticket
              )}
            </strong>

            <span>
              ${utils.escapeHTML(
                location
              )}
            </span>
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

        ${customerHTML}

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
              ${utils.money(
                order.total
              )}
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
   * Registra eventos de apertura de pedidos.
   *
   * @param {HTMLElement} container
   */
  function attachOrderEvents(container) {
    container
      .querySelectorAll(
        ".order-card"
      )
      .forEach((card) => {
        const openCard = () => {
          const orderId =
            card.dataset.id;

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
   * Libera la suscripción y limpia el estado.
   */
  function destroy() {
    state.initialized = false;
    state.loading = false;
    state.refreshPending = false;
    state.currentRole = null;
    state.orders = [];

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
   * Limpia el mensaje global por defecto.
   */
  function defaultClearMessage() {
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

  window.toscanaDashboardModule =
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
