"use strict";

/**
 * Toscana Grill
 * Menú público y toma manual de pedidos.
 *
 * Modos:
 * - Cliente con QR: ?mesa=4
 * - Personal: ?modo=admin
 * - Público general: sin parámetros
 *
 * Navegación:
 * - Filtro "Todos"
 * - Filtro por categoría
 * - Búsqueda dentro del filtro seleccionado
 */

const state = {
  menu: [],
  tables: [],
  cart: [],
  categories: [],
  activeCategory: "todos",
  qrTableNumber: null,
  qrTable: null,
  adminMode: false
};

document.addEventListener(
  "DOMContentLoaded",
  initializeApp
);

/**
 * Inicializa el menú.
 *
 * @returns {Promise<void>}
 */
async function initializeApp() {
  bindEvents();
  detectURLMode();

  if (!window.toscanaSupabase) {
    showMessage(
      "No se configuró correctamente la conexión con Supabase."
    );

    return;
  }

  try {
    await Promise.all([
      loadMenu(),
      loadTables()
    ]);

    restoreCart();
    renderCart();
    applyURLConfiguration();
    toggleOrderFields();
  } catch (error) {
    console.error(
      "Error al inicializar el menú:",
      error
    );

    showMessage(
      error?.message ||
      "No fue posible cargar el menú."
    );
  }
}

/**
 * Registra eventos permanentes.
 */
function bindEvents() {
  const searchInput =
    document.querySelector("#search");

  const clearCartButton =
    document.querySelector("#clear-cart");

  const orderType =
    document.querySelector("#order-type");

  const submitButton =
    document.querySelector("#submit-order");

  const newOrderButton =
    document.querySelector("#new-order");

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      renderMenu
    );
  }

  if (clearCartButton) {
    clearCartButton.addEventListener(
      "click",
      clearCart
    );
  }

  if (orderType) {
    orderType.addEventListener(
      "change",
      toggleOrderFields
    );
  }

  if (submitButton) {
    submitButton.addEventListener(
      "click",
      submitOrder
    );
  }

  if (newOrderButton) {
    newOrderButton.addEventListener(
      "click",
      startNewOrder
    );
  }
}

/**
 * Detecta los parámetros de operación.
 */
function detectURLMode() {
  const parameters =
    new URLSearchParams(
      window.location.search
    );

  const mode = String(
    parameters.get("modo") || ""
  )
    .trim()
    .toLowerCase();

  state.adminMode =
    mode === "admin" ||
    mode === "personal";

  if (state.adminMode) {
    state.qrTableNumber = null;
    state.qrTable = null;
    return;
  }

  const tableParameter =
    parameters.get("mesa");

  if (!tableParameter) {
    state.qrTableNumber = null;
    return;
  }

  const tableNumber =
    Number.parseInt(
      tableParameter,
      10
    );

  if (
    !Number.isInteger(tableNumber) ||
    tableNumber <= 0
  ) {
    state.qrTableNumber = null;

    showMessage(
      "El código QR contiene un número de mesa no válido."
    );

    return;
  }

  state.qrTableNumber = tableNumber;
}

/**
 * Carga el catálogo disponible.
 *
 * @returns {Promise<void>}
 */
async function loadMenu() {
  const {
    data,
    error
  } = await window.toscanaSupabase
    .from("productos")
    .select(`
      id,
      nombre,
      descripcion,
      precio,
      categoria_id,
      imagen_url,
      categorias (
        id,
        nombre,
        orden
      )
    `)
    .eq("activo", true)
    .eq("disponible", true)
    .order("nombre");

  if (error) {
    console.warn(
      "No se pudo cargar el menú desde Supabase. Se utilizará el catálogo local.",
      error
    );

    const response = await fetch(
      "data/menu.json",
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        "No fue posible cargar el menú."
      );
    }

    const fallback =
      await response.json();

    state.menu =
      Array.isArray(fallback.productos)
        ? fallback.productos
        : [];
  } else {
    state.menu =
      window.Array.isArray(data)
        ? data.map((product) => ({
            ...product,
            categoria:
              product.categorias?.nombre ||
              "Otros",
            categoria_orden:
              Number(
                product.categorias?.orden ??
                999
              )
          }))
        : [];
  }

  buildCategories();
  renderCategoryNavigation();
  renderMenu();
}

/**
 * Construye el catálogo de categorías únicas.
 */
function buildCategories() {
  const categoryMap =
    new Map();

  state.menu.forEach((product) => {
    const name =
      product.categoria ||
      product.categorias?.nombre ||
      "Otros";

    const order =
      Number(
        product.categoria_orden ??
        product.categorias?.orden ??
        999
      );

    const key =
      normalizeCategory(name);

    if (!categoryMap.has(key)) {
      categoryMap.set(key, {
        key,
        name,
        order
      });
    }
  });

  state.categories =
    Array.from(
      categoryMap.values()
    ).sort((first, second) => {
      if (first.order !== second.order) {
        return first.order - second.order;
      }

      return first.name.localeCompare(
        second.name,
        "es"
      );
    });

  const activeCategoryExists =
    state.activeCategory === "todos" ||
    state.categories.some(
      (category) =>
        category.key ===
        state.activeCategory
    );

  if (!activeCategoryExists) {
    state.activeCategory = "todos";
  }
}

/**
 * Renderiza los filtros de categorías.
 */
function renderCategoryNavigation() {
  const navigation =
    document.querySelector(
      "#category-nav"
    );

  if (!navigation) {
    return;
  }

  const allButton = `
    <button
      type="button"
      class="category-filter ${
        state.activeCategory === "todos"
          ? "active"
          : ""
      }"
      data-category-filter="todos"
      aria-pressed="${
        state.activeCategory === "todos"
          ? "true"
          : "false"
      }"
    >
      <span aria-hidden="true">▦</span>
      Todos
    </button>
  `;

  const categoryButtons =
    state.categories
      .map((category) => {
        const isActive =
          state.activeCategory ===
          category.key;

        return `
          <button
            type="button"
            class="category-filter ${
              isActive
                ? "active"
                : ""
            }"
            data-category-filter="${escapeHTML(
              category.key
            )}"
            aria-pressed="${
              isActive
                ? "true"
                : "false"
            }"
          >
            ${escapeHTML(
              category.name
            )}
          </button>
        `;
      })
      .join("");

  navigation.innerHTML =
    allButton +
    categoryButtons;

  navigation
    .querySelectorAll(
      "[data-category-filter]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          state.activeCategory =
            button.dataset
              .categoryFilter ||
            "todos";

          renderCategoryNavigation();
          renderMenu();

          scrollSelectedCategoryIntoView();
        }
      );
    });
}

/**
 * Mantiene visible el filtro seleccionado.
 */
function scrollSelectedCategoryIntoView() {
  const activeButton =
    document.querySelector(
      ".category-filter.active"
    );

  if (!activeButton) {
    return;
  }

  activeButton.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "center"
  });
}

/**
 * Renderiza productos según categoría y búsqueda.
 */
function renderMenu() {
  const searchInput =
    document.querySelector(
      "#search"
    );

  const container =
    document.querySelector(
      "#menu-container"
    );

  const resultsLabel =
    document.querySelector(
      "#menu-results-label"
    );

  if (!container) {
    return;
  }

  const query = String(
    searchInput?.value || ""
  )
    .trim()
    .toLowerCase();

  const filteredProducts =
    state.menu.filter((product) => {
      const categoryName =
        product.categoria ||
        product.categorias?.nombre ||
        "Otros";

      const categoryKey =
        normalizeCategory(
          categoryName
        );

      const matchesCategory =
        state.activeCategory ===
          "todos" ||
        categoryKey ===
          state.activeCategory;

      const searchableText = `
        ${product.nombre || ""}
        ${product.descripcion || ""}
        ${categoryName}
      `.toLowerCase();

      const matchesSearch =
        !query ||
        searchableText.includes(query);

      return (
        matchesCategory &&
        matchesSearch
      );
    });

  if (resultsLabel) {
    const selectedCategory =
      state.activeCategory ===
      "todos"
        ? "Todos los productos"
        : state.categories.find(
            (category) =>
              category.key ===
              state.activeCategory
          )?.name ||
          "Productos";

    resultsLabel.textContent =
      `${selectedCategory} · ${filteredProducts.length}`;
  }

  if (
    filteredProducts.length === 0
  ) {
    container.innerHTML = `
      <div class="menu-empty">
        <strong>
          No se encontraron productos.
        </strong>

        <p>
          Prueba otra categoría o cambia el texto de búsqueda.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <div class="products-grid">
      ${filteredProducts
        .map(createProductCard)
        .join("")}
    </div>
  `;

  container
    .querySelectorAll(
      "[data-add-product]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          addProduct(
            button.dataset
              .addProduct
          );
        }
      );
    });
}

/**
 * Genera una tarjeta de producto.
 *
 * @param {object} product
 * @returns {string}
 */
function createProductCard(product) {
  const imageHTML =
    product.imagen_url
      ? `
        <div class="product-card-image-wrapper">
          <img
            class="product-card-image"
            src="${escapeHTML(
              product.imagen_url
            )}"
            alt="${escapeHTML(
              product.nombre
            )}"
            loading="lazy"
            decoding="async"
          >
        </div>
      `
      : `
        <div
          class="product-card-image-wrapper product-card-image-empty"
          aria-hidden="true"
        >
          <span>🔥</span>
        </div>
      `;

  return `
    <article class="product-card">
      ${imageHTML}

      <div class="product-card-content">
        <span class="product-card-category">
          ${escapeHTML(
            product.categoria ||
            product.categorias?.nombre ||
            "Otros"
          )}
        </span>

        <h3>
          ${escapeHTML(
            product.nombre
          )}
        </h3>

        <p>
          ${escapeHTML(
            product.descripcion ||
            "Preparado al momento."
          )}
        </p>
      </div>

      <div class="product-card-footer">
        <strong>
          ${money(
            product.precio
          )}
        </strong>

        <button
          type="button"
          data-add-product="${escapeHTML(
            product.id
          )}"
        >
          Agregar
        </button>
      </div>
    </article>
  `;
}

/**
 * Carga mesas activas.
 *
 * @returns {Promise<void>}
 */
async function loadTables() {
  const {
    data,
    error
  } = await window.toscanaSupabase
    .from("mesas")
    .select(
      "id,numero,nombre,capacidad"
    )
    .eq("activa", true)
    .order("numero");

  if (error) {
    console.error(
      "No se pudieron cargar las mesas:",
      error
    );

    state.tables = [];

    throw new Error(
      "No fue posible cargar las mesas."
    );
  }

  state.tables =
    Array.isArray(data)
      ? data
      : [];

  renderTableOptions();
}

/**
 * Renderiza opciones de mesa.
 */
function renderTableOptions() {
  const select =
    document.querySelector(
      "#table-select"
    );

  if (!select) {
    return;
  }

  if (state.tables.length === 0) {
    select.innerHTML = `
      <option value="">
        No hay mesas disponibles
      </option>
    `;

    return;
  }

  select.innerHTML = `
    <option value="">
      Selecciona una mesa
    </option>

    ${state.tables
      .map((table) => {
        const label =
          table.nombre ||
          `Mesa ${table.numero}`;

        return `
          <option value="${escapeHTML(
            table.id
          )}">
            ${escapeHTML(label)}
          </option>
        `;
      })
      .join("")}
  `;
}

/**
 * Aplica configuración de URL.
 */
function applyURLConfiguration() {
  if (state.adminMode) {
    enableManualOrderMode();
    renderAdminModeNotice();
    return;
  }

  applyQRTable();
}

/**
 * Activa selección manual.
 */
function enableManualOrderMode() {
  const orderType =
    document.querySelector(
      "#order-type"
    );

  const tableSelect =
    document.querySelector(
      "#table-select"
    );

  if (orderType) {
    orderType.disabled = false;
  }

  if (tableSelect) {
    tableSelect.disabled = false;
  }

  state.qrTable = null;
}

/**
 * Muestra aviso de toma manual.
 */
function renderAdminModeNotice() {
  const tableField =
    document.querySelector(
      "#table-field"
    );

  if (!tableField) {
    return;
  }

  removeModeNotices();

  const notice =
    document.createElement("p");

  notice.id =
    "admin-mode-notice";

  notice.className =
    "qr-table-notice";

  notice.textContent =
    "Modo de toma manual: selecciona el tipo de pedido y la mesa correspondiente.";

  tableField.appendChild(
    notice
  );
}

/**
 * Fija la mesa procedente del QR.
 */
function applyQRTable() {
  if (!state.qrTableNumber) {
    enableManualOrderMode();
    return;
  }

  const table =
    state.tables.find(
      (item) =>
        Number(item.numero) ===
        Number(
          state.qrTableNumber
        )
    );

  if (!table) {
    showMessage(
      `La Mesa ${state.qrTableNumber} no existe o está desactivada.`
    );

    state.qrTable = null;
    enableManualOrderMode();
    return;
  }

  state.qrTable = table;

  const orderType =
    document.querySelector(
      "#order-type"
    );

  const tableSelect =
    document.querySelector(
      "#table-select"
    );

  if (orderType) {
    orderType.value = "mesa";
    orderType.disabled = true;
  }

  if (tableSelect) {
    tableSelect.value =
      String(table.id);

    tableSelect.disabled = true;
  }

  renderQRTableNotice();
}

/**
 * Muestra mesa detectada.
 */
function renderQRTableNotice() {
  if (!state.qrTable) {
    return;
  }

  const tableField =
    document.querySelector(
      "#table-field"
    );

  if (!tableField) {
    return;
  }

  removeModeNotices();

  const label =
    state.qrTable.nombre ||
    `Mesa ${state.qrTable.numero}`;

  const notice =
    document.createElement("p");

  notice.id =
    "qr-table-notice";

  notice.className =
    "qr-table-notice";

  notice.textContent =
    `${label} identificada automáticamente mediante el código QR.`;

  tableField.appendChild(
    notice
  );
}

/**
 * Elimina avisos anteriores.
 */
function removeModeNotices() {
  [
    "#qr-table-notice",
    "#admin-mode-notice"
  ].forEach((selector) => {
    const element =
      document.querySelector(
        selector
      );

    if (element) {
      element.remove();
    }
  });
}

/**
 * Agrega un producto al carrito.
 *
 * @param {string|number} productId
 */
function addProduct(productId) {
  const product =
    state.menu.find(
      (item) =>
        String(item.id) ===
        String(productId)
    );

  if (!product) {
    return;
  }

  const existingItem =
    state.cart.find(
      (item) =>
        String(
          item.producto_id
        ) ===
        String(productId)
    );

  if (existingItem) {
    existingItem.cantidad += 1;
  } else {
    state.cart.push({
      producto_id:
        product.id,
      nombre:
        product.nombre,
      precio:
        Number(product.precio),
      cantidad:
        1,
      observaciones:
        ""
    });
  }

  saveCart();
  renderCart();
}

/**
 * Cambia cantidad de producto.
 *
 * @param {string|number} productId
 * @param {number} variation
 */
function changeQuantity(
  productId,
  variation
) {
  const item =
    state.cart.find(
      (product) =>
        String(
          product.producto_id
        ) ===
        String(productId)
    );

  if (!item) {
    return;
  }

  item.cantidad += variation;

  if (item.cantidad <= 0) {
    state.cart =
      state.cart.filter(
        (product) =>
          String(
            product.producto_id
          ) !==
          String(productId)
      );
  }

  saveCart();
  renderCart();
}

/**
 * Renderiza carrito.
 */
function renderCart() {
  const container =
    document.querySelector(
      "#cart-items"
    );

  const emptyMessage =
    document.querySelector(
      "#cart-empty"
    );

  const totalElement =
    document.querySelector(
      "#cart-total"
    );

  const countElement =
    document.querySelector(
      "#cart-count"
    );

  if (
    !container ||
    !emptyMessage ||
    !totalElement
  ) {
    return;
  }

  emptyMessage.hidden =
    state.cart.length > 0;

  container.innerHTML =
    state.cart
      .map((item) => `
        <article class="cart-item">
          <div class="cart-item-info">
            <strong>
              ${escapeHTML(
                item.nombre
              )}
            </strong>

            <span>
              ${money(
                item.precio
              )} c/u
            </span>
          </div>

          <div class="cart-item-controls">
            <button
              type="button"
              data-minus="${escapeHTML(
                item.producto_id
              )}"
              aria-label="Reducir cantidad"
            >
              −
            </button>

            <strong>
              ${Number(
                item.cantidad
              )}
            </strong>

            <button
              type="button"
              data-plus="${escapeHTML(
                item.producto_id
              )}"
              aria-label="Aumentar cantidad"
            >
              +
            </button>
          </div>
        </article>
      `)
      .join("");

  container
    .querySelectorAll(
      "[data-minus]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          changeQuantity(
            button.dataset.minus,
            -1
          );
        }
      );
    });

  container
    .querySelectorAll(
      "[data-plus]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          changeQuantity(
            button.dataset.plus,
            1
          );
        }
      );
    });

  const total =
    state.cart.reduce(
      (sum, item) =>
        sum +
        Number(item.precio) *
        Number(item.cantidad),
      0
    );

  const quantity =
    state.cart.reduce(
      (sum, item) =>
        sum +
        Number(item.cantidad),
      0
    );

  totalElement.textContent =
    money(total);

  if (countElement) {
    countElement.textContent =
      String(quantity);
  }
}

/**
 * Muestra campos según el tipo de pedido.
 */
function toggleOrderFields() {
  const orderType =
    document.querySelector(
      "#order-type"
    );

  const tableField =
    document.querySelector(
      "#table-field"
    );

  const addressField =
    document.querySelector(
      "#address-field"
    );

  if (
    !orderType ||
    !tableField ||
    !addressField
  ) {
    return;
  }

  const type =
    orderType.value;

  tableField.hidden =
    type !== "mesa";

  addressField.hidden =
    type !== "delivery";

  if (
    state.qrTable &&
    !state.adminMode
  ) {
    orderType.value =
      "mesa";

    orderType.disabled =
      true;

    tableField.hidden =
      false;

    addressField.hidden =
      true;
  }
}

/**
 * Envía el pedido.
 *
 * @returns {Promise<void>}
 */
async function submitOrder() {
  clearMessage();

  if (state.cart.length === 0) {
    showMessage(
      "Agrega al menos un producto."
    );

    return;
  }

  const orderTypeElement =
    document.querySelector(
      "#order-type"
    );

  const tableSelect =
    document.querySelector(
      "#table-select"
    );

  const addressInput =
    document.querySelector(
      "#delivery-address"
    );

  const submitButton =
    document.querySelector(
      "#submit-order"
    );

  const orderType =
    state.qrTable &&
    !state.adminMode
      ? "mesa"
      : orderTypeElement?.value;

  const tableId =
    orderType === "mesa"
      ? (
          state.qrTable?.id ||
          tableSelect?.value ||
          null
        )
      : null;

  const address =
    String(
      addressInput?.value || ""
    ).trim();

  if (
    orderType === "mesa" &&
    !tableId
  ) {
    showMessage(
      "Selecciona una mesa."
    );

    return;
  }

  if (
    orderType === "delivery" &&
    !address
  ) {
    showMessage(
      "Registra la dirección de entrega."
    );

    return;
  }

  if (!submitButton) {
    return;
  }

  submitButton.disabled =
    true;

  submitButton.textContent =
    "Registrando…";

  try {
    const {
      data,
      error
    } =
      await window.toscanaSupabase.rpc(
        "crear_pedido",
        {
          p_tipo:
            orderType,
          p_mesa_id:
            tableId,
          p_cliente_nombre:
            getInputValue(
              "#customer-name"
            ) || null,
          p_cliente_telefono:
            getInputValue(
              "#customer-phone"
            ) || null,
          p_direccion_entrega:
            address || null,
          p_observaciones:
            getInputValue(
              "#order-notes"
            ) || null,
          p_items:
            state.cart.map(
              (item) => ({
                producto_id:
                  item.producto_id,
                cantidad:
                  item.cantidad,
                observaciones:
                  item.observaciones ||
                  null
              })
            )
        }
      );

    if (error) {
      throw error;
    }

    localStorage.setItem(
      "toscana_ultimo_token",
      data.token_consulta
    );

    setText(
      "#success-ticket",
      data.ticket
    );

    setText(
      "#success-status",
      pretty(data.estado)
    );

    setText(
      "#success-total",
      money(data.total)
    );

    const dialog =
      document.querySelector(
        "#success-dialog"
      );

    if (dialog) {
      dialog.showModal();
    }
  } catch (error) {
    console.error(
      "Error al registrar el pedido:",
      error
    );

    showMessage(
      error?.message ||
      "No se pudo registrar el pedido."
    );
  } finally {
    submitButton.disabled =
      false;

    submitButton.textContent =
      "Confirmar pedido";
  }
}

/**
 * Inicia nuevo pedido.
 */
function startNewOrder() {
  clearCart();
  clearCustomerFields();

  const dialog =
    document.querySelector(
      "#success-dialog"
    );

  if (dialog?.open) {
    dialog.close();
  }

  applyURLConfiguration();
  toggleOrderFields();
}

/**
 * Vacía carrito.
 */
function clearCart() {
  state.cart = [];
  saveCart();
  renderCart();
}

/**
 * Limpia datos del cliente.
 */
function clearCustomerFields() {
  [
    "#customer-name",
    "#customer-phone",
    "#delivery-address",
    "#order-notes"
  ].forEach((selector) => {
    const element =
      document.querySelector(
        selector
      );

    if (element) {
      element.value = "";
    }
  });
}

/**
 * Guarda carrito localmente.
 */
function saveCart() {
  localStorage.setItem(
    "toscana_cart",
    JSON.stringify(state.cart)
  );
}

/**
 * Restaura carrito.
 */
function restoreCart() {
  try {
    const storedCart =
      JSON.parse(
        localStorage.getItem(
          "toscana_cart"
        )
      );

    state.cart =
      Array.isArray(storedCart)
        ? storedCart
        : [];
  } catch {
    state.cart = [];
  }
}

/**
 * Normaliza categoría.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

/**
 * Obtiene valor de campo.
 *
 * @param {string} selector
 * @returns {string}
 */
function getInputValue(selector) {
  const element =
    document.querySelector(
      selector
    );

  return String(
    element?.value || ""
  ).trim();
}

/**
 * Muestra mensaje.
 *
 * @param {string} text
 */
function showMessage(text) {
  const message =
    document.querySelector(
      "#order-message"
    );

  if (!message) {
    return;
  }

  message.textContent = text;
  message.hidden = false;
}

/**
 * Limpia mensaje.
 */
function clearMessage() {
  const message =
    document.querySelector(
      "#order-message"
    );

  if (!message) {
    return;
  }

  message.textContent = "";
  message.hidden = true;
}

/**
 * Asigna texto.
 *
 * @param {string} selector
 * @param {unknown} value
 */
function setText(selector, value) {
  const element =
    document.querySelector(
      selector
    );

  if (element) {
    element.textContent =
      String(value ?? "");
  }
}

/**
 * Formatea moneda.
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
  ).format(
    Number(value || 0)
  );
}

/**
 * Convierte texto técnico.
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
 * Escapa HTML.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHTML(value) {
  return String(value ?? "")
    .replace(
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
