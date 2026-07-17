"use strict";

/**
 * Toscana Grill
 * Menú público, portada, carrito móvil y registro de pedidos.
 *
 * Incluye:
 * - Portada visual.
 * - Reloj de Ecuador en tiempo real.
 * - Horario abierto/cerrado.
 * - Navegación entre portada y menú.
 * - Filtros por categorías.
 * - Búsqueda.
 * - Carrito persistente.
 * - Panel inferior del pedido.
 * - Costo de desechables para llevar y delivery.
 * - QR por mesa.
 * - Modo de toma manual.
 * - Registro mediante Supabase.
 */

const DISPOSABLES_COST = 0.50;

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
  submittingOrder: false,

  clockTimer: null
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
  initializeClock();
  renderBusinessStatus();

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

    if (
      appState.adminMode ||
      appState.qrTableNumber
    ) {
      showMenuView();
    }
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

/* =========================================================
   EVENTOS
   ========================================================= */

/**
 * Registra los eventos permanentes.
 */
function bindPermanentEvents() {
  const showMenuButton =
    document.querySelector(
      "#show-menu-button"
    );

  const showCartButton =
    document.querySelector(
      "#show-cart-button"
    );

  const backHomeButton =
    document.querySelector(
      "#back-home-button"
    );

  const openCartTopButton =
    document.querySelector(
      "#open-cart-top-button"
    );

  const mobileCartButton =
    document.querySelector(
      "#mobile-cart-button"
    );

  const closeCartButton =
    document.querySelector(
      "#close-cart-button"
    );

  const cartOverlay =
    document.querySelector(
      "#cart-overlay"
    );

  const searchInput =
    document.querySelector(
      "#search"
    );

  const orderType =
    document.querySelector(
      "#order-type"
    );

  const submitOrderButton =
    document.querySelector(
      "#submit-order"
    );

  const newOrderButton =
    document.querySelector(
      "#new-order"
    );

  if (showMenuButton) {
    showMenuButton.addEventListener(
      "click",
      showMenuView
    );
  }

  if (showCartButton) {
    showCartButton.addEventListener(
      "click",
      openCart
    );
  }

  if (backHomeButton) {
    backHomeButton.addEventListener(
      "click",
      showHomeView
    );
  }

  if (openCartTopButton) {
    openCartTopButton.addEventListener(
      "click",
      openCart
    );
  }

  if (mobileCartButton) {
    mobileCartButton.addEventListener(
      "click",
      openCart
    );
  }

  if (closeCartButton) {
    closeCartButton.addEventListener(
      "click",
      closeCart
    );
  }

  if (cartOverlay) {
    cartOverlay.addEventListener(
      "click",
      closeCart
    );
  }

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      renderMenu
    );
  }

  if (orderType) {
    orderType.addEventListener(
      "change",
      () => {
        toggleOrderFields();
        renderCart();
      }
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

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeCart();
      }
    }
  );
}

/* =========================================================
   NAVEGACIÓN ENTRE VISTAS
   ========================================================= */

/**
 * Muestra la portada.
 */
function showHomeView() {
  const homeView =
    document.querySelector(
      "#home-view"
    );

  const menuView =
    document.querySelector(
      "#menu-view"
    );

  if (homeView) {
    homeView.hidden = false;
  }

  if (menuView) {
    menuView.hidden = true;
  }

  closeCart();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/**
 * Muestra el menú.
 */
function showMenuView() {
  const homeView =
    document.querySelector(
      "#home-view"
    );

  const menuView =
    document.querySelector(
      "#menu-view"
    );

  if (homeView) {
    homeView.hidden = true;
  }

  if (menuView) {
    menuView.hidden = false;
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/**
 * Abre el panel del pedido.
 */
function openCart() {
  const drawer =
    document.querySelector(
      "#cart-drawer"
    );

  const overlay =
    document.querySelector(
      "#cart-overlay"
    );

  if (!drawer || !overlay) {
    return;
  }

  overlay.hidden = false;

  drawer.classList.add(
    "open"
  );

  drawer.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.classList.add(
    "cart-open"
  );
}

/**
 * Cierra el panel del pedido.
 */
function closeCart() {
  const drawer =
    document.querySelector(
      "#cart-drawer"
    );

  const overlay =
    document.querySelector(
      "#cart-overlay"
    );

  if (!drawer || !overlay) {
    return;
  }

  drawer.classList.remove(
    "open"
  );

  drawer.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.classList.remove(
    "cart-open"
  );

  window.setTimeout(
    () => {
      if (
        !drawer.classList.contains(
          "open"
        )
      ) {
        overlay.hidden = true;
      }
    },
    220
  );
}

/* =========================================================
   RELOJ Y HORARIO
   ========================================================= */

/**
 * Inicia el reloj de Ecuador.
 */
function initializeClock() {
  updateEcuadorClock();

  if (appState.clockTimer) {
    window.clearInterval(
      appState.clockTimer
    );
  }

  appState.clockTimer =
    window.setInterval(
      () => {
        updateEcuadorClock();
        renderBusinessStatus();
      },
      1000
    );
}

/**
 * Actualiza el reloj de Ecuador.
 */
function updateEcuadorClock() {
  const element =
    document.querySelector(
      "#ecuador-clock"
    );

  if (!element) {
    return;
  }

  const now = new Date();

  const formatted =
    new Intl.DateTimeFormat(
      "es-EC",
      {
        timeZone:
          "America/Guayaquil",
        weekday:
          "long",
        year:
          "numeric",
        month:
          "long",
        day:
          "numeric",
        hour:
          "numeric",
        minute:
          "2-digit",
        second:
          "2-digit",
        hour12:
          true
      }
    ).format(now);

  element.textContent =
    `🕒 Hora Ecuador · ${formatted}`;
}

/**
 * Calcula y muestra si el restaurante está abierto.
 *
 * Horario configurado:
 * - Lunes a jueves: 17:00 a 22:00
 * - Viernes: 17:00 a 23:00
 * - Sábado: 12:00 a 23:00
 * - Domingo: 12:00 a 21:00
 */
function renderBusinessStatus() {
  const element =
    document.querySelector(
      "#business-status"
    );

  if (!element) {
    return;
  }

  const now = getEcuadorDateParts();

  const schedule = {
    0: {
      open: 12 * 60,
      close: 21 * 60,
      label: "domingo 12:00 a 21:00"
    },
    1: {
      open: 17 * 60,
      close: 22 * 60,
      label: "lunes 17:00 a 22:00"
    },
    2: {
      open: 17 * 60,
      close: 22 * 60,
      label: "martes 17:00 a 22:00"
    },
    3: {
      open: 17 * 60,
      close: 22 * 60,
      label: "miércoles 17:00 a 22:00"
    },
    4: {
      open: 17 * 60,
      close: 22 * 60,
      label: "jueves 17:00 a 22:00"
    },
    5: {
      open: 17 * 60,
      close: 23 * 60,
      label: "viernes 17:00 a 23:00"
    },
    6: {
      open: 12 * 60,
      close: 23 * 60,
      label: "sábado 12:00 a 23:00"
    }
  };

  const today =
    schedule[now.weekday];

  const currentMinutes =
    now.hour * 60 +
    now.minute;

  const isOpen =
    currentMinutes >=
      today.open &&
    currentMinutes <
      today.close;

  element.classList.toggle(
    "open",
    isOpen
  );

  element.classList.toggle(
    "closed",
    !isOpen
  );

  element.textContent =
    isOpen
      ? `Abierto ahora · ${today.label}`
      : `Cerrado ahora · horario ${today.label}`;
}

/**
 * Obtiene las partes actuales de fecha y hora en Ecuador.
 *
 * @returns {{
 *   weekday:number,
 *   hour:number,
 *   minute:number
 * }}
 */
function getEcuadorDateParts() {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Guayaquil",
        weekday:
          "short",
        hour:
          "2-digit",
        minute:
          "2-digit",
        hour12:
          false
      }
    );

  const parts =
    formatter.formatToParts(
      new Date()
    );

  const weekdayText =
    parts.find(
      (part) =>
        part.type ===
        "weekday"
    )?.value;

  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    weekday:
      weekdayMap[
        weekdayText
      ] ?? 0,

    hour:
      Number(
        parts.find(
          (part) =>
            part.type ===
            "hour"
        )?.value ?? 0
      ),

    minute:
      Number(
        parts.find(
          (part) =>
            part.type ===
            "minute"
        )?.value ?? 0
      )
  };
}

/* =========================================================
   PARÁMETROS DE URL
   ========================================================= */

/**
 * Detecta el modo administrativo o la mesa del QR.
 */
function detectURLMode() {
  const parameters =
    new URLSearchParams(
      window.location.search
    );

  const mode =
    String(
      parameters.get(
        "modo"
      ) || ""
    )
      .trim()
      .toLowerCase();

  appState.adminMode =
    mode === "admin" ||
    mode === "personal";

  if (appState.adminMode) {
    appState.qrTableNumber =
      null;

    appState.qrTable =
      null;

    return;
  }

  const tableParameter =
    parameters.get(
      "mesa"
    );

  if (!tableParameter) {
    appState.qrTableNumber =
      null;

    return;
  }

  const tableNumber =
    Number.parseInt(
      tableParameter,
      10
    );

  if (
    !Number.isInteger(
      tableNumber
    ) ||
    tableNumber <= 0
  ) {
    appState.qrTableNumber =
      null;

    showOrderMessage(
      "El código QR contiene un número de mesa no válido."
    );

    return;
  }

  appState.qrTableNumber =
    tableNumber;
}

/**
 * Aplica la configuración detectada.
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
 * Habilita la toma manual.
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
    orderType.disabled =
      false;
  }

  if (tableSelect) {
    tableSelect.disabled =
      false;
  }

  appState.qrTable =
    null;
}

/**
 * Aplica la mesa indicada por QR.
 */
function applyQRTable() {
  if (!appState.qrTableNumber) {
    enableManualOrderMode();
    return;
  }

  const table =
    appState.tables.find(
      (item) =>
        Number(
          item.numero
        ) ===
        Number(
          appState.qrTableNumber
        )
    );

  if (!table) {
    showOrderMessage(
      `La Mesa ${appState.qrTableNumber} no existe o está desactivada.`
    );

    appState.qrTable =
      null;

    enableManualOrderMode();

    return;
  }

  appState.qrTable =
    table;

  const orderType =
    document.querySelector(
      "#order-type"
    );

  const tableSelect =
    document.querySelector(
      "#table-select"
    );

  if (orderType) {
    orderType.value =
      "mesa";

    orderType.disabled =
      true;
  }

  if (tableSelect) {
    tableSelect.value =
      String(
        table.id
      );

    tableSelect.disabled =
      true;
  }

  renderQRTableNotice();
}

/**
 * Muestra el aviso de modo manual.
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
    document.createElement(
      "p"
    );

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
 * Muestra el aviso de mesa automática.
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
    document.createElement(
      "p"
    );

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
  ].forEach(
    (selector) => {
      const element =
        document.querySelector(
          selector
        );

      if (element) {
        element.remove();
      }
    }
  );
}

/* =========================================================
   MENÚ
   ========================================================= */

/**
 * Carga los productos.
 *
 * @returns {Promise<void>}
 */
async function loadMenu() {
  if (appState.loadingMenu) {
    return;
  }

  appState.loadingMenu =
    true;

  try {
    const {
      data,
      error
    } =
      await window.toscanaSupabase
        .from(
          "productos"
        )
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
        .eq(
          "activo",
          true
        )
        .eq(
          "disponible",
          true
        )
        .order(
          "nombre"
        );

    if (error) {
      console.warn(
        "No se pudo cargar Supabase. Se intentará utilizar el catálogo local.",
        error
      );

      await loadFallbackMenu();
    } else {
      appState.menu =
        Array.isArray(
          data
        )
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
    appState.loadingMenu =
      false;
  }
}

/**
 * Normaliza un producto.
 *
 * @param {object} product
 * @returns {object}
 */
function normalizeSupabaseProduct(
  product
) {
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
        product.precio ||
        0
      ),

    categoria:
      product.categorias
        ?.nombre ||
      "Otros",

    categoria_orden:
      Number(
        product.categorias
          ?.orden ??
        999
      ),

    imagen_url:
      product.imagen_url ||
      null
  };
}

/**
 * Carga el menú local.
 *
 * @returns {Promise<void>}
 */
async function loadFallbackMenu() {
  const response =
    await fetch(
      "data/menu.json",
      {
        cache:
          "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      "No fue posible cargar el menú."
    );
  }

  const fallback =
    await response.json();

  const products =
    Array.isArray(
      fallback.productos
    )
      ? fallback.productos
      : [];

  appState.menu =
    products.map(
      (product) => ({
        ...product,

        precio:
          Number(
            product.precio ||
            0
          ),

        categoria:
          product.categoria ||
          product.categorias
            ?.nombre ||
          "Otros",

        categoria_orden:
          Number(
            product.categoria_orden ??
            product.categorias
              ?.orden ??
            999
          ),

        imagen_url:
          product.imagen_url ||
          null
      })
    );
}

/**
 * Construye las categorías.
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

        return firstCategory
          .name
          .localeCompare(
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
 * Renderiza las categorías.
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
    createCategoryButton(
      {
        key:
          "todos",
        name:
          "Todos",
        icon:
          "▦"
      }
    );

  const categoryButtons =
    appState.categories
      .map(
        (category) =>
          createCategoryButton(
            {
              key:
                category.key,
              name:
                category.name,
              icon:
                ""
            }
          )
      )
      .join("");

  navigation.innerHTML =
    allButton +
    categoryButtons;

  navigation
    .querySelectorAll(
      "[data-category-filter]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            appState.activeCategory =
              button.dataset
                .categoryFilter ||
              "todos";

            renderCategoryNavigation();
            renderMenu();

            window.requestAnimationFrame(
              scrollActiveCategoryIntoView
            );
          }
        );
      }
    );
}

/**
 * Genera botón de categoría.
 *
 * @param {object} options
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
 * Centra el filtro activo.
 */
function scrollActiveCategoryIntoView() {
  const activeButton =
    document.querySelector(
      ".category-filter.active"
    );

  activeButton?.scrollIntoView(
    {
      behavior:
        "smooth",
      block:
        "nearest",
      inline:
        "center"
    }
  );
}

/**
 * Renderiza productos filtrados.
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
      searchInput?.value ||
      ""
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
    filteredProducts.length ===
    0
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
        .map(
          createProductCard
        )
        .join("")}
    </div>
  `;

  attachProductEvents(
    container
  );
}

/**
 * Actualiza el contador de resultados.
 *
 * @param {number} count
 * @param {HTMLElement|null} element
 */
function updateResultsLabel(
  count,
  element
) {
  if (!element) {
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

  element.textContent =
    `${categoryName} · ${productText}`;
}

/**
 * Genera una tarjeta.
 *
 * @param {object} product
 * @returns {string}
 */
function createProductCard(
  product
) {
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
    <article class="product-card">
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
        >
          Agregar
        </button>
      </div>
    </article>
  `;
}

/**
 * Registra eventos de productos.
 *
 * @param {HTMLElement} container
 */
function attachProductEvents(
  container
) {
  container
    .querySelectorAll(
      "[data-add-product]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            addProduct(
              button.dataset
                .addProduct
            );

            animateAddButton(
              button
            );
          }
        );
      }
    );
}

/**
 * Anima el botón Agregar.
 *
 * @param {HTMLButtonElement} button
 */
function animateAddButton(
  button
) {
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
    500
  );
}

/**
 * Renderiza error del menú.
 *
 * @param {string} message
 */
function renderMenuError(
  message
) {
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
        ${escapeHTML(message)}
      </p>
    </div>
  `;
}

/* =========================================================
   MESAS
   ========================================================= */

/**
 * Carga mesas activas.
 *
 * @returns {Promise<void>}
 */
async function loadTables() {
  if (appState.loadingTables) {
    return;
  }

  appState.loadingTables =
    true;

  try {
    const {
      data,
      error
    } =
      await window.toscanaSupabase
        .from(
          "mesas"
        )
        .select(
          "id,numero,nombre,capacidad"
        )
        .eq(
          "activa",
          true
        )
        .order(
          "numero"
        );

    if (error) {
      throw new Error(
        "No fue posible cargar las mesas."
      );
    }

    appState.tables =
      Array.isArray(
        data
      )
        ? data
        : [];

    renderTableOptions();
  } finally {
    appState.loadingTables =
      false;
  }
}

/**
 * Renderiza las mesas.
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
    appState.tables.length ===
    0
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
      .map(
        (table) => {
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
        }
      )
      .join("")}
  `;
}

/* =========================================================
   CARRITO
   ========================================================= */

/**
 * Agrega un producto.
 *
 * @param {string|number} productId
 */
function addProduct(
  productId
) {
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
    existingItem.cantidad +=
      1;
  } else {
    appState.cart.push({
      producto_id:
        product.id,

      nombre:
        product.nombre,

      precio:
        Number(
          product.precio ||
          0
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
 * Modifica cantidad.
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
 * Elimina un producto.
 *
 * @param {string|number} productId
 */
function removeCartItem(
  productId
) {
  appState.cart =
    appState.cart.filter(
      (product) =>
        String(
          product.producto_id
        ) !==
        String(productId)
    );

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

  if (
    !cartContainer ||
    !emptyState
  ) {
    return;
  }

  emptyState.hidden =
    appState.cart.length >
    0;

  if (
    appState.cart.length ===
    0
  ) {
    cartContainer.innerHTML =
      "";
  } else {
    cartContainer.innerHTML =
      appState.cart
        .map(
          createCartItem
        )
        .join("");

    attachCartEvents(
      cartContainer
    );
  }

  renderCartTotals();
}

/**
 * Genera un producto del carrito.
 *
 * @param {object} item
 * @returns {string}
 */
function createCartItem(
  item
) {
  const subtotal =
    Number(
      item.precio ||
      0
    ) *
    Number(
      item.cantidad ||
      0
    );

  return `
    <article class="cart-item">
      <div class="cart-item-heading">
        <strong>
          ${escapeHTML(
            item.nombre
          )}
        </strong>

        <span>
          ${money(subtotal)}
        </span>
      </div>

      <div class="cart-item-footer">
        <div class="cart-item-controls">
          <button
            type="button"
            data-minus="${escapeHTML(
              item.producto_id
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
          >
            +
          </button>
        </div>

        <button
          type="button"
          class="remove-cart-item"
          data-remove-item="${escapeHTML(
            item.producto_id
          )}"
        >
          Eliminar
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
function attachCartEvents(
  container
) {
  container
    .querySelectorAll(
      "[data-minus]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            changeQuantity(
              button.dataset.minus,
              -1
            );
          }
        );
      }
    );

  container
    .querySelectorAll(
      "[data-plus]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            changeQuantity(
              button.dataset.plus,
              1
            );
          }
        );
      }
    );

  container
    .querySelectorAll(
      "[data-remove-item]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            removeCartItem(
              button.dataset
                .removeItem
            );
          }
        );
      }
    );
}

/**
 * Renderiza subtotal, desechables y total.
 */
function renderCartTotals() {
  const totals =
    calculateCartTotals();

  const orderType =
    getCurrentOrderType();

  const disposables =
    requiresDisposables(
      orderType
    )
      ? DISPOSABLES_COST
      : 0;

  const total =
    totals.amount +
    disposables;

  setText(
    "#cart-count",
    totals.quantity
  );

  setText(
    "#top-cart-count",
    totals.quantity
  );

  setText(
    "#mobile-cart-count",
    totals.quantity
  );

  setText(
    "#cart-subtotal",
    money(
      totals.amount
    )
  );

  setText(
    "#cart-disposables",
    money(
      disposables
    )
  );

  setText(
    "#cart-total",
    money(total)
  );

  const disposablesRow =
    document.querySelector(
      "#disposables-row"
    );

  if (disposablesRow) {
    disposablesRow.hidden =
      disposables <= 0;
  }
}

/**
 * Calcula los totales.
 *
 * @returns {{
 *   amount:number,
 *   quantity:number
 * }}
 */
function calculateCartTotals() {
  return appState.cart.reduce(
    (totals, item) => {
      const price =
        Number(
          item.precio ||
          0
        );

      const quantity =
        Number(
          item.cantidad ||
          0
        );

      totals.amount +=
        price *
        quantity;

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
 * Devuelve el tipo de pedido seleccionado.
 *
 * @returns {string}
 */
function getCurrentOrderType() {
  if (
    appState.qrTable &&
    !appState.adminMode
  ) {
    return "mesa";
  }

  return String(
    document.querySelector(
      "#order-type"
    )?.value ||
    "mesa"
  );
}

/**
 * Indica si aplica desechables.
 *
 * @param {string} orderType
 * @returns {boolean}
 */
function requiresDisposables(
  orderType
) {
  return [
    "para_llevar",
    "delivery"
  ].includes(
    orderType
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
        : [];
  } catch {
    appState.cart = [];
  }
}

/* =========================================================
   FORMULARIO
   ========================================================= */

/**
 * Muestra u oculta campos.
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
    getCurrentOrderType();

  tableField.hidden =
    selectedType !== "mesa";

  addressField.hidden =
    selectedType !==
    "delivery";

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
  if (
    appState.submittingOrder
  ) {
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
    const {
      data,
      error
    } =
      await window.toscanaSupabase.rpc(
        "crear_pedido",
        buildOrderPayload(
          validation
        )
      );

    if (error) {
      throw new Error(
        error.message ||
        "No se pudo registrar el pedido."
      );
    }

    if (!data) {
      throw new Error(
        "El pedido no devolvió una respuesta válida."
      );
    }

    persistLastOrderToken(
      data.token_consulta
    );

    renderSuccessDialog(
      data
    );

    closeCart();
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
 * Valida el pedido.
 *
 * @returns {object}
 */
function validateOrder() {
  if (
    appState.cart.length ===
    0
  ) {
    return {
      valid: false,
      message:
        "Agrega al menos un producto."
    };
  }

  const orderType =
    getCurrentOrderType();

  const tableSelect =
    document.querySelector(
      "#table-select"
    );

  const address =
    getInputValue(
      "#delivery-address"
    );

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
    orderType ===
      "delivery" &&
    !address
  ) {
    return {
      valid: false,
      message:
        "Registra la dirección de entrega."
    };
  }

  return {
    valid:
      true,
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
 * Muestra la confirmación.
 *
 * @param {object} order
 */
function renderSuccessDialog(
  order
) {
  const recargo =
    Number(
      order.recargo ||
      0
    );

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
    "#success-subtotal",
    money(
      order.subtotal
    )
  );

  setText(
    "#success-disposables",
    money(recargo)
  );

  setText(
    "#success-total",
    money(
      order.total
    )
  );

  const row =
    document.querySelector(
      "#success-disposables-row"
    );

  if (row) {
    row.hidden =
      recargo <= 0;
  }

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
 * Inicia un nuevo pedido.
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
  showMenuView();
}

/**
 * Limpia campos.
 */
function clearCustomerFields() {
  [
    "#customer-name",
    "#customer-phone",
    "#delivery-address",
    "#order-notes"
  ].forEach(
    (selector) => {
      const element =
        document.querySelector(
          selector
        );

      if (element) {
        element.value =
          "";
      }
    }
  );
}

/* =========================================================
   UTILIDADES
   ========================================================= */

function normalizeSearchText(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase()
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );
}

function normalizeCategory(
  value
) {
  return normalizeSearchText(
    value
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

function getInputValue(
  selector
) {
  return String(
    document.querySelector(
      selector
    )?.value ||
    ""
  ).trim();
}

function setText(
  selector,
  value
) {
  const element =
    document.querySelector(
      selector
    );

  if (element) {
    element.textContent =
      String(
        value ??
        ""
      );
  }
}

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

function showOrderMessage(
  message
) {
  const element =
    document.querySelector(
      "#order-message"
    );

  if (!element) {
    return;
  }

  element.textContent =
    String(
      message ||
      ""
    );

  element.hidden =
    false;

  openCart();
}

function clearOrderMessage() {
  const element =
    document.querySelector(
      "#order-message"
    );

  if (!element) {
    return;
  }

  element.textContent =
    "";

  element.hidden =
    true;
}

function persistLastOrderToken(
  token
) {
  if (!token) {
    return;
  }

  localStorage.setItem(
    "toscana_ultimo_token",
    String(token)
  );
}

function money(value) {
  return new Intl.NumberFormat(
    "es-EC",
    {
      style:
        "currency",
      currency:
        "USD",
      minimumFractionDigits:
        2
    }
  ).format(
    Number(
      value ||
      0
    )
  );
}

function pretty(value) {
  return String(
    value ||
    ""
  )
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

function escapeHTML(value) {
  return String(
    value ??
    ""
  ).replace(
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
