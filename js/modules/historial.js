"use strict";

/**
 * Módulo Histórico de Toscana Grill.
 *
 * Responsabilidades:
 * - Cargar la vista historial.html.
 * - Consultar pedidos cerrados y cancelados.
 * - Filtrar por fecha, estado y texto.
 * - Mostrar indicadores resumidos.
 * - Abrir el detalle completo de cada pedido.
 */

(function initializeHistoryModule() {
  const state = {
    initialized: false,
    loading: false,
    orders: [],
    filters: {
      dateFrom: null,
      dateTo: null,
      status: "",
      search: ""
    },
    callbacks: {
      showMessage: null,
      clearMessage: null,
      openOrder: null
    }
  };

  /**
   * Inicializa el módulo Histórico.
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

    await window.toscanaViewLoader.load("historial");

    const view = document.querySelector("#view-historial");

    if (!view) {
      throw new Error(
        "La vista historial.html no se cargó correctamente."
      );
    }

    setDefaultDates();
    setupEvents();

    state.initialized = true;

    await refresh();
  }

  /**
   * Valida dependencias.
   */
  function validateDependencies() {
    if (!window.toscanaSupabase) {
      throw new Error(
        "Supabase no está disponible para el módulo Histórico."
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
   * Define por defecto los últimos 30 días.
   */
  function setDefaultDates() {
    const today = new Date();

    const dateTo = formatDateInput(today);

    const dateFromValue = new Date(today);
    dateFromValue.setDate(
      dateFromValue.getDate() - 30
    );

    const dateFrom = formatDateInput(
      dateFromValue
    );

    const fromInput = document.querySelector(
      "#history-date-from"
    );

    const toInput = document.querySelector(
      "#history-date-to"
    );

    if (fromInput) {
      fromInput.value = dateFrom;
    }

    if (toInput) {
      toInput.value = dateTo;
    }

    state.filters.dateFrom = dateFrom;
    state.filters.dateTo = dateTo;
  }

  /**
   * Configura eventos.
   */
  function setupEvents() {
    const refreshButton = document.querySelector(
      "#refresh-history"
    );

    const applyButton = document.querySelector(
      "#apply-history-filters"
    );

    const clearButton = document.querySelector(
      "#clear-history-filters"
    );

    const searchInput = document.querySelector(
      "#history-search"
    );

    if (refreshButton) {
      refreshButton.addEventListener(
        "click",
        refresh
      );
    }

    if (applyButton) {
      applyButton.addEventListener(
        "click",
        async () => {
          readFiltersFromForm();
          await refresh();
        }
      );
    }

    if (clearButton) {
      clearButton.addEventListener(
        "click",
        async () => {
          clearFilters();
          await refresh();
        }
      );
    }

    if (searchInput) {
      searchInput.addEventListener(
        "keydown",
        async (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            readFiltersFromForm();
            await refresh();
          }
        }
      );
    }
  }

  /**
   * Lee los filtros desde el formulario.
   */
  function readFiltersFromForm() {
    const fromInput = document.querySelector(
      "#history-date-from"
    );

    const toInput = document.querySelector(
      "#history-date-to"
    );

    const statusInput = document.querySelector(
      "#history-status"
    );

    const searchInput = document.querySelector(
      "#history-search"
    );

    state.filters.dateFrom =
      fromInput?.value || null;

    state.filters.dateTo =
      toInput?.value || null;

    state.filters.status =
      statusInput?.value || "";

    state.filters.search =
      searchInput?.value.trim() || "";
  }

  /**
   * Limpia los filtros.
   */
  function clearFilters() {
    const statusInput = document.querySelector(
      "#history-status"
    );

    const searchInput = document.querySelector(
      "#history-search"
    );

    if (statusInput) {
      statusInput.value = "";
    }

    if (searchInput) {
      searchInput.value = "";
    }

    setDefaultDates();

    state.filters.status = "";
    state.filters.search = "";
  }

  /**
   * Recarga el histórico.
   *
   * @returns {Promise<void>}
   */
  async function refresh() {
    if (!document.querySelector("#view-historial")) {
      return;
    }

    if (state.loading) {
      return;
    }

    state.loading = true;
    state.callbacks.clearMessage();

    const refreshButton = document.querySelector(
      "#refresh-history"
    );

    const loading = document.querySelector(
      "#history-loading"
    );

    const empty = document.querySelector(
      "#history-empty"
    );

    const body = document.querySelector(
      "#history-table-body"
    );

    window.toscanaUtils.setButtonLoading(
      refreshButton,
      true,
      "Actualizando…"
    );

    if (loading) {
      loading.hidden = false;
    }

    if (empty) {
      empty.hidden = true;
    }

    if (body) {
      body.innerHTML = "";
    }

    try {
      const {
        data,
        error
      } = await window.toscanaSupabase.rpc(
        "listar_historial_pedidos",
        {
          p_fecha_desde:
            state.filters.dateFrom || null,
          p_fecha_hasta:
            state.filters.dateTo || null,
          p_estado:
            state.filters.status || null,
          p_busqueda:
            state.filters.search || null,
          p_limite: 100
        }
      );

      if (error) {
        console.error(
          "Error al consultar listar_historial_pedidos:",
          error
        );

        throw new Error(
          error.message ||
          "No fue posible consultar el histórico."
        );
      }

      state.orders =
        window.toscanaUtils.toArray(data);

      render();
    } catch (error) {
      console.error(
        "Error al actualizar Histórico:",
        error
      );

      state.callbacks.showMessage(
        error?.message ||
        "No fue posible actualizar el histórico."
      );

      state.orders = [];
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
   * Renderiza tabla e indicadores.
   */
  function render() {
    renderSummary();
    renderTable();
  }

  /**
   * Renderiza los indicadores.
   */
  function renderSummary() {
    const closedOrders =
      state.orders.filter(
        (order) =>
          order.estado === "cerrado"
      );

    const cancelledOrders =
      state.orders.filter(
        (order) =>
          order.estado === "cancelado"
      );

    const closedTotal =
      closedOrders.reduce(
        (total, order) => {
          const value = Number(
            order.total || 0
          );

          return total +
            (
              Number.isFinite(value)
                ? value
                : 0
            );
        },
        0
      );

    window.toscanaUtils.setText(
      "#history-orders-count",
      state.orders.length
    );

    window.toscanaUtils.setText(
      "#history-results-badge",
      state.orders.length
    );

    window.toscanaUtils.setText(
      "#history-closed-total",
      window.toscanaUtils.money(
        closedTotal
      )
    );

    window.toscanaUtils.setText(
      "#history-cancelled-count",
      cancelledOrders.length
    );
  }

  /**
   * Renderiza la tabla.
   */
  function renderTable() {
    const body = document.querySelector(
      "#history-table-body"
    );

    const empty = document.querySelector(
      "#history-empty"
    );

    if (!body || !empty) {
      return;
    }

    empty.hidden =
      state.orders.length > 0;

    if (state.orders.length === 0) {
      body.innerHTML = "";
      return;
    }

    body.innerHTML = state.orders
      .map(createHistoryRow)
      .join("");

    attachRowEvents(body);
  }

  /**
   * Genera una fila del histórico.
   *
   * @param {object} order
   * @returns {string}
   */
  function createHistoryRow(order) {
    const utils = window.toscanaUtils;

    const orderId =
      order.pedido_id ||
      order.id ||
      "";

    const location =
      utils.getOrderLocation(order);

    const customer =
      order.cliente_nombre ||
      "—";

    const createdBy =
      order.creado_por_nombre ||
      "—";

    const dateValue =
      order.cerrado_en ||
      order.actualizado_en ||
      order.creado_en;

    const formattedDate =
      formatDateTime(dateValue);

    return `
      <tr>
        <td>
          <strong>
            ${utils.escapeHTML(
              order.ticket ||
              "Sin ticket"
            )}
          </strong>
        </td>

        <td>
          ${utils.escapeHTML(
            formattedDate
          )}
        </td>

        <td>
          ${utils.escapeHTML(
            location
          )}
        </td>

        <td>
          ${utils.escapeHTML(
            customer
          )}
        </td>

        <td>
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
        </td>

        <td>
          ${Number(
            order.cantidad_items || 0
          )}
        </td>

        <td>
          <strong>
            ${utils.money(
              order.total
            )}
          </strong>
        </td>

        <td>
          ${utils.escapeHTML(
            createdBy
          )}
        </td>

        <td>
          <button
            type="button"
            class="secondary-button history-detail-button"
            data-history-detail="${utils.escapeHTML(
              orderId
            )}"
          >
            Ver detalle
          </button>
        </td>
      </tr>
    `;
  }

  /**
   * Registra los eventos de detalle.
   *
   * @param {HTMLElement} container
   */
  function attachRowEvents(container) {
    container
      .querySelectorAll(
        "[data-history-detail]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const orderId =
              button.dataset.historyDetail;

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
   * Formatea una fecha para input HTML.
   *
   * @param {Date} date
   * @returns {string}
   */
  function formatDateInput(date) {
    const year = date.getFullYear();

    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  /**
   * Formatea fecha y hora.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function formatDateTime(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "es-EC",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }
    ).format(date);
  }

  /**
   * Limpia el estado interno.
   */
  function destroy() {
    state.initialized = false;
    state.loading = false;
    state.orders = [];

    state.filters = {
      dateFrom: null,
      dateTo: null,
      status: "",
      search: ""
    };

    state.callbacks = {
      showMessage: null,
      clearMessage: null,
      openOrder: null
    };
  }

  /**
   * Mensaje global por defecto.
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
   * Limpia mensaje global por defecto.
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

  window.toscanaHistoryModule =
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
