"use strict";

/**
 * Toscana Grill
 * Menú público y toma manual de pedidos.
 *
 * Modos disponibles:
 *
 * 1. Cliente mediante QR:
 *    ?mesa=4
 *    La mesa queda seleccionada y bloqueada.
 *
 * 2. Personal del restaurante:
 *    ?modo=admin
 *    Permite seleccionar manualmente el tipo de pedido y la mesa.
 *
 * 3. Acceso general:
 *    Sin parámetros.
 *    Mantiene la selección manual habilitada.
 *
 * Funcionalidades:
 * - Carga productos y categorías desde Supabase.
 * - Filtro "Todos" y filtro individual por categoría.
 * - Búsqueda de productos.
 * - Carrito persistente en localStorage.
 * - Pedido en mesa, para llevar o delivery.
 * - Detección automática de mesa mediante QR.
 * - Registro del pedido mediante la RPC crear_pedido.
 */

const appState = {
  menu: [],
  categories: [],
  tables: [],
  cart: [],

  activeCategory: "todos",

  qrTableNumber: null,
  qrTable: null,
  adminMode: false,

  loadingMenu: false,
  loadingTables: false,
  submittingOrder: false
};

document.addEventListener(
  "DOMContentLoaded",
  initializeApplication
);

/**
 * Inicializa la aplicación.
 *
 * @returns {Promise<void>}
 */
async function initializeApplication() {
  bindPermanentEvents();
  detectURLMode();
  restoreCart();
  renderCart();

  if (!window.toscanaSupabase) {
    showOrderMessage(
      "No se configuró correctamente la conexión con Supabase."
    );

    renderMenuError(
      "No fue posible conectar con el catálogo."
    );

    return;
  }

  try {
    await Promise.all([
      loadMenu(),
      loadTables()
    ]);

    applyURLConfiguration();
    toggleOrderFields();
  } catch (error) {
    console.error(
      "Error al inicializar Toscana Grill:",
      error
    );

    showOrderMessage(
      error?.message ||
      "No fue posible cargar el menú."
    );
  }
}

/**
 * Configura eventos permanentes.
 */
function bindPermanentEvents() {
  const searchInput =
    document.querySelector("#search");

  const clearCartButton =
    document.querySelector("#clear-cart");

  const orderType =
    document.querySelector("#order-type");

  const submitOrderButton =
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
      () => {
        if (appState.cart.length === 0) {
          return;
        }

        const confirmed = window.confirm(
          "¿Deseas vaciar todos los productos del pedido?"
        );

        if (confirmed) {
          clearCart();
        }
      }
    );
  }

  if (orderType) {
    orderType.addEventListener(
      "change",
      toggleOrderFields
    );
  }

  if (submitOrderButton) {
    submitOrderButton.addEventListener(
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

/* =========================================================
   PARÁMETROS DE LA URL
   ========================================================= */

/**
 * Detecta el modo de operación desde la URL.
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

  appState.adminMode =
    mode === "admin" ||
    mode === "personal";

  if (appState.adminMode) {
    appState.qrTableNumber = null;
    appState.qrTable = null;
    return;
  }

  const tableParameter =
    parameters.get("mesa");

  if (!tableParameter) {
    appState.qrTableNumber = null;
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
    appState.qrTableNumber = null;

    showOrderMessage(
      "El código QR contiene un número de mesa no válido."
    );

    return;
  }

  appState.qrTableNumber =
    tableNumber;
}

/**
 * Aplica el modo detectado en la URL.
 */
function applyURLConfiguration() {
  if (appState.adminMode) {
    enableManualOrderMode();
    renderAdminModeNotice();
    return;
  }

  applyQRTable();
}

/**
 * Habilita la selección manual.
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

  appState.qrTable = null;
}

/**
 * Fija la mesa obtenida desde el QR.
 */
function applyQRTable() {
  if (!appState.qrTableNumber) {
    enableManualOrderMode();
    return;
  }

  const table =
    appState.tables.find(
      (item) =>
        Number(item.numero) ===
        Number(
          appState.qrTableNumber
        )
    );

  if (!table) {
    showOrderMessage(
      `La Mesa ${appState.qrTableNumber} no existe o está desactivada.`
    );

    appState.qrTable = null;
    enableManualOrderMode();

    return;
  }

  appState.qrTable = table;

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
 * Muestra aviso del modo de toma manual.
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
 * Muestra aviso de mesa detectada.
 */
function renderQRTableNotice() {
  if (!appState.qrTable) {
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

  const tableLabel =
    appState.qrTable.nombre ||
    `Mesa ${appState.qrTable.numero}`;

  const notice =
    document.createElement("p");

  notice.id =
    "qr-table-notice";

  notice.className =
    "qr-table-notice";

  notice.textContent =
    `${tableLabel} identificada automáticamente mediante el código QR.`;

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

/* =========================================================
   MENÚ Y CATEGORÍAS
   ========================================================= */

/**
 * Carga el menú desde Supabase.
 *
 * @returns {Promise<void>}
 */
async function loadMenu() {
  if (appState.loadingMenu) {
    return;
  }

  appState.loadingMenu = true;

  try {
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
        "No se pudo cargar el menú desde Supabase. Se intentará utilizar el catálogo local.",
        error
      );

      await loadFallbackMenu();
    } else {
      appState.menu =
        Array.isArray(data)
          ? data.map(
              normalizeSupabaseProduct
            )
          : [];
    }

    buildCategories();
    renderCategoryNavigation();
    renderMenu();
  } catch (error) {
    console.error(
      "Error al cargar el menú:",
      error
    );

    appState.menu = [];
    appState.categories = [];

    renderMenuError(
      error?.message ||
      "No fue posible cargar el catálogo."
    );

    throw error;
  } finally {
    appState.loadingMenu = false;
  }
}

/**
 * Normaliza un producto recibido desde Supabase.
 *
 * @param {object} product
 * @returns {object}
 */
function normalizeSupabaseProduct(product) {
  return {
    ...product,

    id:
      product.id,

    nombre:
      product.nombre ||
      "Producto",

    descripcion:
      product.descripcion ||
      "",

    precio:
      Number(
        product.precio || 0
      ),

    categoria:
      product.categorias?.nombre ||
      "Otros",

    categoria_orden:
      Number(
        product.categorias?.orden ??
        999
      ),

    imagen_url:
      product.imagen_url ||
      null
  };
}

/**
 * Carga el menú local de respaldo.
 *
 * @returns {Promise<void>}
 */
async function loadFallbackMenu() {
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

  const fallbackProducts =
    Array.isArray(
      fallback.productos
    )
      ? fallback.productos
      : [];

  appState.menu =
    fallbackProducts.map(
      (product) => ({
        ...product,

        id:
          product.id,

        nombre:
          product.nombre ||
          "Producto",

        descripcion:
          product.descripcion ||
          "",

        precio:
          Number(
            product.precio || 0
          ),

        categoria:
          product.categoria ||
          product.categorias?.nombre ||
          "Otros",

        categoria_orden:
          Number(
            product.categoria_orden ??
            product.categorias?.orden ??
            999
          ),

        imagen_url:
          product.imagen_url ||
          null
      })
    );
}

/**
 * Construye las categorías únicas.
 */
function buildCategories() {
  const categoryMap =
    new Map();

  appState.menu.forEach(
    (product) => {
      const categoryName =
        product.categoria ||
        "Otros";

      const categoryKey =
        normalizeCategory(
          categoryName
        );

      const categoryOrder =
        Number(
          product.categoria_orden ??
          999
        );

      if (
        !categoryMap.has(
          categoryKey
        )
      ) {
        categoryMap.set(
          categoryKey,
          {
            key:
              categoryKey,
            name:
              categoryName,
            order:
              categoryOrder
          }
        );
      }
    }
  );

  appState.categories =
    Array.from(
      categoryMap.values()
    ).sort(
      (
        firstCategory,
        secondCategory
      ) => {
        if (
          firstCategory.order !==
          secondCategory.order
        ) {
          return (
            firstCategory.order -
            secondCategory.order
          );
        }

        return firstCategory.name.localeCompare(
          secondCategory.name,
          "es"
        );
      }
    );

  const activeCategoryExists =
    appState.activeCategory ===
      "todos" ||
    appState.categories.some(
      (category) =>
        category.key ===
        appState.activeCategory
    );

  if (!activeCategoryExists) {
    appState.activeCategory =
      "todos";
  }
}

/**
 * Renderiza los botones de categorías.
 */
function renderCategoryNavigation() {
  const navigation =
    document.querySelector(
      "#category-nav"
    );

  if (!navigation) {
    return;
  }

  const allButton =
    createCategoryButton({
      key: "todos",
      name: "Todos",
      icon: "▦"
    });

  const categoryButtons =
    appState.categories
      .map(
        (category) =>
          createCategoryButton({
            key:
              category.key,
            name:
              category.name,
            icon:
              ""
          })
      )
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
          const selectedCategory =
            button.dataset
              .categoryFilter ||
            "todos";

          if (
            selectedCategory ===
            appState.activeCategory
          ) {
            return;
          }

          appState.activeCategory =
            selectedCategory;

          renderCategoryNavigation();
          renderMenu();

          window.requestAnimationFrame(
            scrollActiveCategoryIntoView
          );
        }
      );
    });
}

/**
 * Genera un botón de categoría.
 *
 * @param {object} options
 * @param {string} options.key
 * @param {string} options.name
 * @param {string} options.icon
 * @returns {string}
 */
function createCategoryButton({
  key,
  name,
  icon
}) {
  const isActive =
    appState.activeCategory ===
    key;

  const iconHTML =
    icon
      ? `
        <span aria-hidden="true">
          ${escapeHTML(icon)}
        </span>
      `
      : "";

  return `
    <button
      type="button"
      class="category-filter ${
        isActive
          ? "active"
          : ""
      }"
      data-category-filter="${escapeHTML(
        key
      )}"
      aria-pressed="${
        isActive
          ? "true"
          : "false"
      }"
    >
      ${iconHTML}

      ${escapeHTML(name)}
    </button>
  `;
}

/**
 * Mantiene visible la categoría seleccionada.
 */
function scrollActiveCategoryIntoView() {
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
 * Filtra y renderiza productos.
 */
function renderMenu() {
  const container =
    document.querySelector(
      "#menu-container"
    );

  const searchInput =
    document.querySelector(
      "#search"
    );

  const resultsLabel =
    document.querySelector(
      "#menu-results-label"
    );

  if (!container) {
    return;
  }

  const query =
    normalizeSearchText(
      searchInput?.value || ""
    );

  const filteredProducts =
    appState.menu.filter(
      (product) => {
        const categoryName =
          product.categoria ||
          "Otros";

        const categoryKey =
          normalizeCategory(
            categoryName
          );

        const matchesCategory =
          appState.activeCategory ===
            "todos" ||
          categoryKey ===
            appState.activeCategory;

        const searchableText =
          normalizeSearchText(`
            ${product.nombre || ""}
            ${product.descripcion || ""}
            ${categoryName}
          `);

        const matchesSearch =
          !query ||
          searchableText.includes(
            query
          );

        return (
          matchesCategory &&
          matchesSearch
        );
      }
    );

  updateResultsLabel(
    filteredProducts.length,
    resultsLabel
  );

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

  attachProductEvents(
    container
  );
}

/**
 * Actualiza el encabezado de resultados.
 *
 * @param {number} count
 * @param {HTMLElement|null} resultsLabel
 */
function updateResultsLabel(
  count,
  resultsLabel
) {
  if (!resultsLabel) {
    return;
  }

  const categoryName =
    appState.activeCategory ===
      "todos"
      ? "Todos los productos"
      : appState.categories.find(
          (category) =>
            category.key ===
            appState.activeCategory
        )?.name ||
        "Productos";

  const productText =
    count === 1
      ? "1 producto"
      : `${count} productos`;

  resultsLabel.textContent =
    `${categoryName} · ${productText}`;
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
            onerror="this.parentElement.classList.add('product-card-image-empty'); this.remove();"
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
    <article
      class="product-card"
      data-product-card="${escapeHTML(
        product.id
      )}"
    >
      ${imageHTML}

      <div class="product-card-content">
        <span class="product-card-category">
          ${escapeHTML(
            product.categoria ||
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
          aria-label="Agregar ${escapeHTML(
            product.nombre
          )} al pedido"
        >
          Agregar
        </button>
      </div>
    </article>
  `;
}

/**
 * Registra eventos de los productos.
 *
 * @param {HTMLElement} container
 */
function attachProductEvents(container) {
  container
    .querySelectorAll(
      "[data-add-product]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const productId =
            button.dataset
              .addProduct;

          addProduct(
            productId
          );

          animateAddButton(
            button
          );
        }
      );
    });
}

/**
 * Muestra una respuesta breve al agregar.
 *
 * @param {HTMLButtonElement} button
 */
function animateAddButton(button) {
  const originalText =
    button.textContent;

  button.textContent =
    "Agregado";

  button.disabled =
    true;

  window.setTimeout(
    () => {
      button.textContent =
        originalText;

      button.disabled =
        false;
    },
    550
  );
}

/**
 * Muestra un error en el área del menú.
 *
 * @param {string} message
 */
function renderMenuError(message) {
  const container =
    document.querySelector(
      "#menu-container"
    );

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="menu-empty">
      <strong>
        No fue posible cargar el menú.
      </strong>

      <p>
        ${escapeHTML(
          message
        )}
      </p>
    </div>
  `;
}

/* =========================================================
   MESAS
   ========================================================= */

/**
 * Carga las mesas activas.
 *
 * @returns {Promise<void>}
 */
async function loadTables() {
  if (appState.loadingTables) {
    return;
  }

  appState.loadingTables = true;

  try {
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
        "Error al cargar mesas:",
        error
      );

      throw new Error(
        "No fue posible cargar las mesas."
      );
    }

    appState.tables =
      Array.isArray(data)
        ? data
        : [];

    renderTableOptions();
  } finally {
    appState.loadingTables =
      false;
  }
}

/**
 * Renderiza el selector de mesas.
 */
function renderTableOptions() {
  const tableSelect =
    document.querySelector(
      "#table-select"
    );

  if (!tableSelect) {
    return;
  }

  if (
    appState.tables.length === 0
  ) {
    tableSelect.innerHTML = `
      <option value="">
        No hay mesas disponibles
      </option>
    `;

    return;
  }

  tableSelect.innerHTML = `
    <option value="">
      Selecciona una mesa
    </option>

    ${appState.tables
      .map((table) => {
        const tableLabel =
          table.nombre ||
          `Mesa ${table.numero}`;

        const capacityText =
          table.capacidad
            ? ` · ${table.capacidad} personas`
            : "";

        return `
          <option value="${escapeHTML(
            table.id
          )}">
            ${escapeHTML(
              tableLabel +
              capacityText
            )}
          </option>
        `;
      })
      .join("")}
  `;
}

/* =========================================================
   CARRITO
   ========================================================= */

/**
 * Agrega un producto al carrito.
 *
 * @param {string|number} productId
 */
function addProduct(productId) {
  const product =
    appState.menu.find(
      (item) =>
        String(item.id) ===
        String(productId)
    );

  if (!product) {
    return;
  }

  const existingItem =
    appState.cart.find(
      (item) =>
        String(
          item.producto_id
        ) ===
        String(productId)
    );

  if (existingItem) {
    existingItem.cantidad += 1;
  } else {
    appState.cart.push({
      producto_id:
        product.id,

      nombre:
        product.nombre,

      precio:
        Number(
          product.precio || 0
        ),

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
 * Cambia la cantidad de un producto.
 *
 * @param {string|number} productId
 * @param {number} variation
 */
function changeQuantity(
  productId,
  variation
) {
  const item =
    appState.cart.find(
      (product) =>
        String(
          product.producto_id
        ) ===
        String(productId)
    );

  if (!item) {
    return;
  }

  item.cantidad +=
    variation;

  if (item.cantidad <= 0) {
    appState.cart =
      appState.cart.filter(
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
 * Renderiza el carrito.
 */
function renderCart() {
  const cartContainer =
    document.querySelector(
      "#cart-items"
    );

  const emptyState =
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
    !cartContainer ||
    !emptyState ||
    !totalElement
  ) {
    return;
  }

  emptyState.hidden =
    appState.cart.length > 0;

  if (
    appState.cart.length === 0
  ) {
    cartContainer.innerHTML =
      "";
  } else {
    cartContainer.innerHTML =
      appState.cart
        .map(createCartItem)
        .join("");

    attachCartEvents(
      cartContainer
    );
  }

  const totals =
    calculateCartTotals();

  totalElement.textContent =
    money(
      totals.amount
    );

  if (countElement) {
    countElement.textContent =
      String(
        totals.quantity
      );
  }
}

/**
 * Genera un producto del carrito.
 *
 * @param {object} item
 * @returns {string}
 */
function createCartItem(item) {
  return `
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
          aria-label="Reducir cantidad de ${escapeHTML(
            item.nombre
          )}"
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
          aria-label="Aumentar cantidad de ${escapeHTML(
            item.nombre
          )}"
        >
          +
        </button>
      </div>
    </article>
  `;
}

/**
 * Registra eventos del carrito.
 *
 * @param {HTMLElement} container
 */
function attachCartEvents(container) {
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
}

/**
 * Calcula totales del carrito.
 *
 * @returns {{amount:number, quantity:number}}
 */
function calculateCartTotals() {
  return appState.cart.reduce(
    (totals, item) => {
      const price =
        Number(
          item.precio || 0
        );

      const quantity =
        Number(
          item.cantidad || 0
        );

      totals.amount +=
        price * quantity;

      totals.quantity +=
        quantity;

      return totals;
    },
    {
      amount: 0,
      quantity: 0
    }
  );
}

/**
 * Vacía el carrito.
 */
function clearCart() {
  appState.cart = [];
  saveCart();
  renderCart();
}

/**
 * Guarda el carrito.
 */
function saveCart() {
  try {
    localStorage.setItem(
      "toscana_cart",
      JSON.stringify(
        appState.cart
      )
    );
  } catch (error) {
    console.warn(
      "No fue posible guardar el carrito:",
      error
    );
  }
}

/**
 * Recupera el carrito.
 */
function restoreCart() {
  try {
    const storedValue =
      localStorage.getItem(
        "toscana_cart"
      );

    if (!storedValue) {
      appState.cart = [];
      return;
    }

    const storedCart =
      JSON.parse(
        storedValue
      );

    appState.cart =
      Array.isArray(
        storedCart
      )
        ? storedCart
            .filter(
              isValidStoredCartItem
            )
            .map(
              normalizeStoredCartItem
            )
        : [];
  } catch (error) {
    console.warn(
      "No fue posible recuperar el carrito:",
      error
    );

    appState.cart = [];
  }
}

/**
 * Valida un registro guardado.
 *
 * @param {object} item
 * @returns {boolean}
 */
function isValidStoredCartItem(item) {
  return Boolean(
    item &&
    item.producto_id !==
      undefined &&
    item.nombre &&
    Number(item.cantidad) > 0
  );
}

/**
 * Normaliza un producto guardado.
 *
 * @param {object} item
 * @returns {object}
 */
function normalizeStoredCartItem(item) {
  return {
    producto_id:
      item.producto_id,

    nombre:
      String(
        item.nombre
      ),

    precio:
      Number(
        item.precio || 0
      ),

    cantidad:
      Math.max(
        1,
        Number.parseInt(
          item.cantidad,
          10
        ) || 1
      ),

    observaciones:
      String(
        item.observaciones ||
        ""
      )
  };
}

/* =========================================================
   FORMULARIO DEL PEDIDO
   ========================================================= */

/**
 * Muestra u oculta campos según el tipo de pedido.
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

  const selectedType =
    orderType.value;

  tableField.hidden =
    selectedType !== "mesa";

  addressField.hidden =
    selectedType !== "delivery";

  if (
    appState.qrTable &&
    !appState.adminMode
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
 * Registra el pedido.
 *
 * @returns {Promise<void>}
 */
async function submitOrder() {
  if (appState.submittingOrder) {
    return;
  }

  clearOrderMessage();

  const validation =
    validateOrder();

  if (!validation.valid) {
    showOrderMessage(
      validation.message
    );

    return;
  }

  const submitButton =
    document.querySelector(
      "#submit-order"
    );

  appState.submittingOrder =
    true;

  setButtonLoading(
    submitButton,
    true,
    "Registrando…"
  );

  try {
    const payload =
      buildOrderPayload(
        validation
      );

    const {
      data,
      error
    } =
      await window.toscanaSupabase.rpc(
        "crear_pedido",
        payload
      );

    if (error) {
      console.error(
        "Error de Supabase al registrar el pedido:",
        error
      );

      throw new Error(
        error.message ||
        "No se pudo registrar el pedido."
      );
    }

    if (!data) {
      throw new Error(
        "El pedido fue procesado sin una respuesta válida."
      );
    }

    persistLastOrderToken(
      data.token_consulta
    );

    renderSuccessDialog(
      data
    );
  } catch (error) {
    console.error(
      "Error al registrar el pedido:",
      error
    );

    showOrderMessage(
      error?.message ||
      "No se pudo registrar el pedido."
    );
  } finally {
    appState.submittingOrder =
      false;

    setButtonLoading(
      submitButton,
      false,
      "Confirmar pedido"
    );
  }
}

/**
 * Valida los datos del pedido.
 *
 * @returns {object}
 */
function validateOrder() {
  if (
    appState.cart.length === 0
  ) {
    return {
      valid: false,
      message:
        "Agrega al menos un producto."
    };
  }

  const orderTypeElement =
    document.querySelector(
      "#order-type"
    );

  const tableSelect =
    document.querySelector(
      "#table-select"
    );

  const address =
    getInputValue(
      "#delivery-address"
    );

  const orderType =
    appState.qrTable &&
    !appState.adminMode
      ? "mesa"
      : orderTypeElement?.value;

  if (
    ![
      "mesa",
      "para_llevar",
      "delivery"
    ].includes(orderType)
  ) {
    return {
      valid: false,
      message:
        "Selecciona un tipo de pedido válido."
    };
  }

  const tableId =
    orderType === "mesa"
      ? (
          appState.qrTable?.id ||
          tableSelect?.value ||
          null
        )
      : null;

  if (
    orderType === "mesa" &&
    !tableId
  ) {
    return {
      valid: false,
      message:
        "Selecciona una mesa."
    };
  }

  if (
    orderType === "delivery" &&
    !address
  ) {
    return {
      valid: false,
      message:
        "Registra la dirección de entrega."
    };
  }

  return {
    valid: true,
    orderType,
    tableId,
    address
  };
}

/**
 * Construye los parámetros de la RPC.
 *
 * @param {object} validation
 * @returns {object}
 */
function buildOrderPayload(
  validation
) {
  return {
    p_tipo:
      validation.orderType,

    p_mesa_id:
      validation.tableId,

    p_cliente_nombre:
      getInputValue(
        "#customer-name"
      ) || null,

    p_cliente_telefono:
      getInputValue(
        "#customer-phone"
      ) || null,

    p_direccion_entrega:
      validation.orderType ===
        "delivery"
        ? validation.address
        : null,

    p_observaciones:
      getInputValue(
        "#order-notes"
      ) || null,

    p_items:
      appState.cart.map(
        (item) => ({
          producto_id:
            item.producto_id,

          cantidad:
            Number(
              item.cantidad
            ),

          observaciones:
            item.observaciones ||
            null
        })
      )
  };
}

/**
 * Guarda el token del último pedido.
 *
 * @param {unknown} token
 */
function persistLastOrderToken(token) {
  if (!token) {
    return;
  }

  try {
    localStorage.setItem(
      "toscana_ultimo_token",
      String(token)
    );
  } catch (error) {
    console.warn(
      "No fue posible guardar el token del pedido:",
      error
    );
  }
}

/**
 * Abre el diálogo de confirmación.
 *
 * @param {object} order
 */
function renderSuccessDialog(order) {
  setText(
    "#success-ticket",
    order.ticket ||
    "—"
  );

  setText(
    "#success-status",
    pretty(
      order.estado
    ) ||
    "Pendiente"
  );

  setText(
    "#success-total",
    money(
      order.total
    )
  );

  const dialog =
    document.querySelector(
      "#success-dialog"
    );

  if (
    dialog &&
    !dialog.open
  ) {
    dialog.showModal();
  }
}

/**
 * Inicia un pedido nuevo.
 */
function startNewOrder() {
  clearCart();
  clearCustomerFields();
  clearOrderMessage();

  const dialog =
    document.querySelector(
      "#success-dialog"
    );

  if (dialog?.open) {
    dialog.close();
  }

  applyURLConfiguration();
  toggleOrderFields();

  const menuSection =
    document.querySelector(
      ".menu-section"
    );

  menuSection?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/**
 * Limpia campos del cliente.
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

/* =========================================================
   UTILIDADES
   ========================================================= */

/**
 * Normaliza el texto de búsqueda.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );
}

/**
 * Normaliza el nombre de categoría.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeCategory(value) {
  return normalizeSearchText(value)
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
 * Obtiene el valor limpio de un campo.
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
 * Asigna texto a un elemento.
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
 * Controla el estado visual de un botón.
 *
 * @param {HTMLButtonElement|null} button
 * @param {boolean} loading
 * @param {string} label
 */
function setButtonLoading(
  button,
  loading,
  label
) {
  if (!button) {
    return;
  }

  button.disabled =
    loading;

  button.textContent =
    label;
}

/**
 * Muestra mensaje del pedido.
 *
 * @param {string} message
 */
function showOrderMessage(message) {
  const element =
    document.querySelector(
      "#order-message"
    );

  if (!element) {
    return;
  }

  element.textContent =
    String(message || "");

  element.hidden =
    false;
}

/**
 * Limpia el mensaje del pedido.
 */
function clearOrderMessage() {
  const element =
    document.querySelector(
      "#order-message"
    );

  if (!element) {
    return;
  }

  element.textContent = "";
  element.hidden = true;
}

/**
 * Formatea valores monetarios.
 *
 * @param {unknown} value
 * @returns {string}
 */
function money(value) {
  const numericValue =
    Number(value || 0);

  return new Intl.NumberFormat(
    "es-EC",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    }
  ).format(
    Number.isFinite(numericValue)
      ? numericValue
      : 0
  );
}

/**
 * Convierte valores técnicos en texto.
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
 * Escapa texto para HTML.
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

        return entities[
          character
        ];
      }
    );
}
