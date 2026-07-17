"use strict";

/* ============================================================
   TOSCANA GRILL
   APLICACIÓN PÚBLICA DEL MENÚ Y PEDIDOS

   Funcionalidades:
   - Portada y menú
   - Categorías y búsqueda
   - Carrito persistente
   - Pedidos de mesa
   - Pedidos para llevar
   - Delivery urbano
   - Delivery fuera de zona
   - Ticket TG-YYMMDD-NNNN
   - Seguimiento mediante ticket y token privado
   - Pedidos guardados en el dispositivo
   - Reloj y estado del establecimiento
   ============================================================ */

/* ============================================================
   1. CONSTANTES
   ============================================================ */

const STORAGE_KEYS = Object.freeze({
  cart: "toscana_cart_v2",
  savedOrders: "toscana_saved_orders_v2",
  lastOrder: "toscana_last_order_v2"
});

const ORDER_TYPES = Object.freeze({
  table: "mesa",
  takeaway: "para_llevar",
  delivery: "delivery"
});

const DELIVERY_ZONES = Object.freeze({
  urban: "urbana",
  outside: "fuera_urbana"
});

const FEES = Object.freeze({
  disposable: 0.5,
  urbanDelivery: 2
});

const ECUADOR_TIME_ZONE = "America/Guayaquil";

const DEFAULT_SCHEDULE = Object.freeze({
  0: { open: "00:00", close: "23:59" },
  1: { open: "00:00", close: "23:59" },
  2: { open: "00:00", close: "23:59" },
  3: { open: "00:00", close: "23:59" },
  4: { open: "00:00", close: "23:59" },
  5: { open: "00:00", close: "23:59" },
  6: { open: "00:00", close: "23:59" }
});

/* ============================================================
   2. ESTADO GLOBAL
   ============================================================ */

const state = {
  products: [],
  categories: [],
  tables: [],
  cart: [],

  selectedCategory: "all",
  searchTerm: "",

  qrTableId: null,

  lastCreatedOrder: null,
  currentTrackingTicket: null,

  isLoadingMenu: false,
  isSubmittingOrder: false,
  isTrackingOrder: false
};

/* ============================================================
   3. REFERENCIAS DEL DOM
   ============================================================ */

const elements = {};

document.addEventListener("DOMContentLoaded", initializeApplication);

/* ============================================================
   4. INICIALIZACIÓN
   ============================================================ */

async function initializeApplication() {
  cacheElements();
  bindEvents();

  restoreCart();
  resolveTableFromUrl();

  updateEcuadorClock();
  updateBusinessStatus();

  window.setInterval(() => {
    updateEcuadorClock();
    updateBusinessStatus();
  }, 1000);

  renderCart();
  renderSavedOrders();

  if (!getSupabaseClient()) {
    renderMenuError(
      "No se encontró la configuración de Supabase. " +
      "Verifica que el cliente se cargue antes de js/app.js."
    );

    showOrderMessage(
      "No se pudo conectar con el sistema de pedidos.",
      "error"
    );

    return;
  }

  await Promise.all([
    loadMenu(),
    loadTables()
  ]);
}

/* ============================================================
   5. CAPTURA DE ELEMENTOS
   ============================================================ */

function cacheElements() {
  elements.homeView =
    document.getElementById("homeView");

  elements.menuView =
    document.getElementById("menuView");

  elements.openMenuButton =
    document.getElementById("openMenuButton");

  elements.openOrderTrackingButton =
    document.getElementById("openOrderTrackingButton");

  elements.backHomeButton =
    document.getElementById("backHomeButton");

  elements.ecuadorClock =
    document.getElementById("ecuadorClock");

  elements.businessStatus =
    document.getElementById("businessStatus");

  elements.businessScheduleMessage =
    document.getElementById("businessScheduleMessage");

  elements.productSearchInput =
    document.getElementById("productSearchInput");

  elements.categoryBar =
    document.getElementById("categoryBar");

  elements.menuContainer =
    document.getElementById("menuContainer");

  elements.menuResultsTitle =
    document.getElementById("menuResultsTitle");

  elements.menuResultsCount =
    document.getElementById("menuResultsCount");

  elements.openCartButton =
    document.getElementById("openCartButton");

  elements.headerCartCount =
    document.getElementById("headerCartCount");

  elements.mobileCartButton =
    document.getElementById("mobileCartButton");

  elements.mobileCartCount =
    document.getElementById("mobileCartCount");

  elements.mobileCartTotal =
    document.getElementById("mobileCartTotal");

  elements.cartOverlay =
    document.getElementById("cartOverlay");

  elements.cartDrawer =
    document.getElementById("cartDrawer");

  elements.closeCartButton =
    document.getElementById("closeCartButton");

  elements.cartItemSummary =
    document.getElementById("cartItemSummary");

  elements.cartItems =
    document.getElementById("cartItems");

  elements.orderForm =
    document.getElementById("orderForm");

  elements.orderType =
    document.getElementById("orderType");

  elements.tableField =
    document.getElementById("tableField");

  elements.tableSelect =
    document.getElementById("tableSelect");

  elements.qrTableNotice =
    document.getElementById("qrTableNotice");

  elements.customerName =
    document.getElementById("customerName");

  elements.customerPhone =
    document.getElementById("customerPhone");

  elements.phoneRequiredText =
    document.getElementById("phoneRequiredText");

  elements.phoneHelpText =
    document.getElementById("phoneHelpText");

  elements.deliveryFields =
    document.getElementById("deliveryFields");

  elements.deliveryZone =
    document.getElementById("deliveryZone");

  elements.urbanDeliveryNotice =
    document.getElementById("urbanDeliveryNotice");

  elements.outsideDeliveryNotice =
    document.getElementById("outsideDeliveryNotice");

  elements.deliveryAddress =
    document.getElementById("deliveryAddress");

  elements.deliveryConfirmation =
    document.getElementById("deliveryConfirmation");

  elements.orderNotes =
    document.getElementById("orderNotes");

  elements.cartSubtotal =
    document.getElementById("cartSubtotal");

  elements.disposableSummaryRow =
    document.getElementById("disposableSummaryRow");

  elements.cartDisposableFee =
    document.getElementById("cartDisposableFee");

  elements.deliverySummaryRow =
    document.getElementById("deliverySummaryRow");

  elements.cartDeliveryFee =
    document.getElementById("cartDeliveryFee");

  elements.pendingDeliverySummaryRow =
    document.getElementById("pendingDeliverySummaryRow");

  elements.cartTotalLabel =
    document.getElementById("cartTotalLabel");

  elements.cartTotal =
    document.getElementById("cartTotal");

  elements.preliminaryTotalNotice =
    document.getElementById("preliminaryTotalNotice");

  elements.orderMessage =
    document.getElementById("orderMessage");

  elements.submitOrderButton =
    document.getElementById("submitOrderButton");

  elements.successDialog =
    document.getElementById("successDialog");

  elements.successDescription =
    document.getElementById("successDescription");

  elements.successTicket =
    document.getElementById("successTicket");

  elements.successTicketReminder =
    document.getElementById("successTicketReminder");

  elements.successStatus =
    document.getElementById("successStatus");

  elements.successTotalLabel =
    document.getElementById("successTotalLabel");

  elements.successTotal =
    document.getElementById("successTotal");

  elements.successDeliveryPendingRow =
    document.getElementById("successDeliveryPendingRow");

  elements.successDeliveryMessage =
    document.getElementById("successDeliveryMessage");

  elements.trackCreatedOrderButton =
    document.getElementById("trackCreatedOrderButton");

  elements.closeSuccessDialogButton =
    document.getElementById("closeSuccessDialogButton");

  elements.trackingDialog =
    document.getElementById("trackingDialog");

  elements.closeTrackingDialogButton =
    document.getElementById("closeTrackingDialogButton");

  elements.trackingForm =
    document.getElementById("trackingForm");

  elements.trackingTicketInput =
    document.getElementById("trackingTicketInput");

  elements.savedOrdersField =
    document.getElementById("savedOrdersField");

  elements.savedOrdersSelect =
    document.getElementById("savedOrdersSelect");

  elements.trackingMessage =
    document.getElementById("trackingMessage");

  elements.submitTrackingButton =
    document.getElementById("submitTrackingButton");

  elements.trackingResult =
    document.getElementById("trackingResult");

  elements.trackingStatus =
    document.getElementById("trackingStatus");

  elements.trackingTicket =
    document.getElementById("trackingTicket");

  elements.trackingType =
    document.getElementById("trackingType");

  elements.trackingTableRow =
    document.getElementById("trackingTableRow");

  elements.trackingTable =
    document.getElementById("trackingTable");

  elements.trackingZoneRow =
    document.getElementById("trackingZoneRow");

  elements.trackingZone =
    document.getElementById("trackingZone");

  elements.trackingAddressRow =
    document.getElementById("trackingAddressRow");

  elements.trackingAddress =
    document.getElementById("trackingAddress");

  elements.trackingSubtotal =
    document.getElementById("trackingSubtotal");

  elements.trackingDisposableFee =
    document.getElementById("trackingDisposableFee");

  elements.trackingDeliveryFee =
    document.getElementById("trackingDeliveryFee");

  elements.trackingTotalLabel =
    document.getElementById("trackingTotalLabel");

  elements.trackingTotal =
    document.getElementById("trackingTotal");

  elements.trackingPreliminaryNotice =
    document.getElementById("trackingPreliminaryNotice");

  elements.trackingItems =
    document.getElementById("trackingItems");

  elements.refreshTrackingButton =
    document.getElementById("refreshTrackingButton");
}

/* ============================================================
   6. EVENTOS
   ============================================================ */

function bindEvents() {
  elements.openMenuButton?.addEventListener(
    "click",
    showMenuView
  );

  elements.backHomeButton?.addEventListener(
    "click",
    showHomeView
  );

  elements.openOrderTrackingButton?.addEventListener(
    "click",
    () => openTrackingDialog()
  );

  elements.productSearchInput?.addEventListener(
    "input",
    handleSearchInput
  );

  elements.categoryBar?.addEventListener(
    "click",
    handleCategoryClick
  );

  elements.menuContainer?.addEventListener(
    "click",
    handleMenuClick
  );

  elements.openCartButton?.addEventListener(
    "click",
    openCart
  );

  elements.mobileCartButton?.addEventListener(
    "click",
    openCart
  );

  elements.closeCartButton?.addEventListener(
    "click",
    closeCart
  );

  elements.cartOverlay?.addEventListener(
    "click",
    closeCart
  );

  elements.cartItems?.addEventListener(
    "click",
    handleCartClick
  );

  elements.cartItems?.addEventListener(
    "input",
    handleCartInput
  );

  elements.orderType?.addEventListener(
    "change",
    handleOrderTypeChange
  );

  elements.deliveryZone?.addEventListener(
    "change",
    handleDeliveryZoneChange
  );

  elements.customerPhone?.addEventListener(
    "input",
    sanitizePhoneInput
  );

  elements.orderForm?.addEventListener(
    "submit",
    submitOrder
  );

  elements.closeSuccessDialogButton?.addEventListener(
    "click",
    closeSuccessDialog
  );

  elements.trackCreatedOrderButton?.addEventListener(
    "click",
    trackLastCreatedOrder
  );

  elements.closeTrackingDialogButton?.addEventListener(
    "click",
    closeTrackingDialog
  );

  elements.trackingForm?.addEventListener(
    "submit",
    submitTracking
  );

  elements.trackingTicketInput?.addEventListener(
    "input",
    formatTrackingTicketInput
  );

  elements.savedOrdersSelect?.addEventListener(
    "change",
    handleSavedOrderSelection
  );

  elements.refreshTrackingButton?.addEventListener(
    "click",
    refreshCurrentTracking
  );

  document.addEventListener(
    "keydown",
    handleGlobalKeydown
  );
}

/* ============================================================
   7. NAVEGACIÓN ENTRE PORTADA Y MENÚ
   ============================================================ */

function showMenuView() {
  if (elements.homeView) {
    elements.homeView.hidden = true;
  }

  if (elements.menuView) {
    elements.menuView.hidden = false;
  }

  updateMobileCartVisibility();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function showHomeView() {
  closeCart();

  if (elements.menuView) {
    elements.menuView.hidden = true;
  }

  if (elements.homeView) {
    elements.homeView.hidden = false;
  }

  if (elements.mobileCartButton) {
    elements.mobileCartButton.hidden = true;
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* ============================================================
   8. SUPABASE
   ============================================================ */

function getSupabaseClient() {
  return window.toscanaSupabase || null;
}

/* ============================================================
   9. CARGA DEL MENÚ
   ============================================================ */

async function loadMenu() {
  state.isLoadingMenu = true;

  renderMenuLoading();

  try {
    const supabaseClient = getSupabaseClient();

    const { data, error } = await supabaseClient
      .from("productos")
      .select(`
        id,
        nombre,
        descripcion,
        precio,
        imagen_url,
        categoria_id,
        activo,
        disponible,
        categorias (
          id,
          nombre,
          orden
        )
      `)
      .eq("activo", true)
      .eq("disponible", true)
      .order("nombre", {
        ascending: true
      });

    if (error) {
      throw error;
    }

    state.products = normalizeProducts(data || []);
    state.categories = extractCategories(state.products);

    renderCategoryBar();
    renderMenu();
  } catch (error) {
    console.error(
      "No se pudo cargar el menú desde Supabase:",
      error
    );

    await loadFallbackMenu();
  } finally {
    state.isLoadingMenu = false;
  }
}

async function loadFallbackMenu() {
  try {
    const response = await fetch(
      "./data/menu.json",
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        `No se pudo cargar data/menu.json: ${response.status}`
      );
    }

    const fallbackData = await response.json();

    const rawProducts =
      fallbackData.productos ||
      fallbackData.products ||
      [];

    state.products = normalizeProducts(rawProducts);
    state.categories = extractCategories(state.products);

    renderCategoryBar();
    renderMenu();
  } catch (error) {
    console.error(
      "No se pudo cargar el menú alternativo:",
      error
    );

    renderMenuError(
      "No fue posible cargar el menú. " +
      "Revisa la conexión e intenta nuevamente."
    );
  }
}


function resolveProductImageUrl(imageValue) {
  const rawValue = String(imageValue || "").trim();

  if (!rawValue) {
    return "";
  }

  if (
    rawValue.startsWith("http://") ||
    rawValue.startsWith("https://") ||
    rawValue.startsWith("data:") ||
    rawValue.startsWith("blob:")
  ) {
    return rawValue;
  }

  const cleanedPath = rawValue
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "");

  return new URL(cleanedPath, window.location.href).href;
}

function normalizeProducts(products) {
  return products
    .map((product) => {
      const categoryObject =
        product.categorias ||
        product.categoria ||
        null;

      const categoryName =
        typeof categoryObject === "string"
          ? categoryObject
          : categoryObject?.nombre ||
            product.categoria_nombre ||
            "Otros";

      const categoryId =
        product.categoria_id ??
        categoryObject?.id ??
        slugify(categoryName);

      return {
        id: Number(product.id),

        name: String(
          product.nombre ||
          product.name ||
          "Producto"
        ),

        description: String(
          product.descripcion ||
          product.description ||
          ""
        ),

        price: Number(
          product.precio ??
          product.price ??
          0
        ),

        imageUrl: resolveProductImageUrl(
          product.imagen_url ||
          product.image_url ||
          product.imagen ||
          product.foto ||
          ""
        ),

        categoryId: String(categoryId),

        categoryName: String(categoryName),

        categoryOrder: Number(
          categoryObject?.orden ??
          product.categoria_orden ??
          9999
        )
      };
    })
    .filter((product) => {
      return (
        Number.isFinite(product.id) &&
        product.id > 0 &&
        Number.isFinite(product.price) &&
        product.price >= 0
      );
    });
}

function extractCategories(products) {
  const categoryMap = new Map();

  products.forEach((product) => {
    if (!categoryMap.has(product.categoryId)) {
      categoryMap.set(product.categoryId, {
        id: product.categoryId,
        name: product.categoryName,
        order: product.categoryOrder
      });
    }
  });

  return Array.from(categoryMap.values())
    .sort((first, second) => {
      if (first.order !== second.order) {
        return first.order - second.order;
      }

      return first.name.localeCompare(
        second.name,
        "es"
      );
    });
}

/* ============================================================
   10. CATEGORÍAS Y BÚSQUEDA
   ============================================================ */

function renderCategoryBar() {
  if (!elements.categoryBar) {
    return;
  }

  const categoryButtons = state.categories
    .map((category) => {
      const activeClass =
        state.selectedCategory === category.id
          ? " active"
          : "";

      return `
        <button
          class="category-filter${activeClass}"
          type="button"
          data-category-id="${escapeAttribute(category.id)}"
        >
          ${escapeHtml(category.name)}
        </button>
      `;
    })
    .join("");

  const allActiveClass =
    state.selectedCategory === "all"
      ? " active"
      : "";

  elements.categoryBar.innerHTML = `
    <button
      class="category-filter${allActiveClass}"
      type="button"
      data-category-id="all"
    >
      Todos
    </button>

    ${categoryButtons}
  `;
}

function handleSearchInput(event) {
  state.searchTerm =
    String(event.target.value || "")
      .trim()
      .toLocaleLowerCase("es");

  renderMenu();
}

function handleCategoryClick(event) {
  const button = event.target.closest(
    "[data-category-id]"
  );

  if (!button) {
    return;
  }

  state.selectedCategory =
    String(button.dataset.categoryId || "all");

  renderCategoryBar();
  renderMenu();
}

function getFilteredProducts() {
  return state.products.filter((product) => {
    const matchesCategory =
      state.selectedCategory === "all" ||
      product.categoryId === state.selectedCategory;

    const searchableText = normalizeText(
      [
        product.name,
        product.description,
        product.categoryName
      ].join(" ")
    );

    const matchesSearch =
      !state.searchTerm ||
      searchableText.includes(
        normalizeText(state.searchTerm)
      );

    return matchesCategory && matchesSearch;
  });
}

/* ============================================================
   11. RENDERIZADO DEL MENÚ
   ============================================================ */

function renderMenuLoading() {
  if (!elements.menuContainer) {
    return;
  }

  elements.menuContainer.innerHTML = `
    <div class="loading-state">
      <div
        class="loading-spinner"
        aria-hidden="true"
      ></div>

      <p>
        Cargando menú...
      </p>
    </div>
  `;

  if (elements.menuResultsCount) {
    elements.menuResultsCount.textContent =
      "Cargando menú...";
  }
}

function renderMenuError(message) {
  if (!elements.menuContainer) {
    return;
  }

  elements.menuContainer.innerHTML = `
    <div class="menu-empty-state">
      <strong>
        No se pudo cargar el menú
      </strong>

      <p>
        ${escapeHtml(message)}
      </p>
    </div>
  `;

  if (elements.menuResultsCount) {
    elements.menuResultsCount.textContent =
      "Menú no disponible";
  }
}

function renderMenu() {
  if (!elements.menuContainer) {
    return;
  }

  const filteredProducts = getFilteredProducts();

  updateMenuResultsInformation(filteredProducts);

  if (filteredProducts.length === 0) {
    elements.menuContainer.innerHTML = `
      <div class="menu-empty-state">
        <strong>
          No encontramos productos
        </strong>

        <p>
          Prueba otra categoría o cambia el texto de búsqueda.
        </p>
      </div>
    `;

    return;
  }

  const groupedProducts = groupProductsByCategory(
    filteredProducts
  );

  elements.menuContainer.innerHTML =
    groupedProducts
      .map(([categoryName, products]) => {
        return `
          <section class="menu-category-section">
            <header class="menu-category-header">
              <h3>
                ${escapeHtml(categoryName)}
              </h3>

              <span>
                ${products.length}
                ${products.length === 1
                  ? "producto"
                  : "productos"}
              </span>
            </header>

            <div class="product-grid">
              ${products
                .map(renderProductCard)
                .join("")}
            </div>
          </section>
        `;
      })
      .join("");
}

function updateMenuResultsInformation(products) {
  const activeCategory =
    state.selectedCategory === "all"
      ? null
      : state.categories.find(
          (category) =>
            category.id === state.selectedCategory
        );

  if (elements.menuResultsTitle) {
    if (state.searchTerm) {
      elements.menuResultsTitle.textContent =
        `Resultados para “${state.searchTerm}”`;
    } else if (activeCategory) {
      elements.menuResultsTitle.textContent =
        activeCategory.name;
    } else {
      elements.menuResultsTitle.textContent =
        "Todos los productos";
    }
  }

  if (elements.menuResultsCount) {
    elements.menuResultsCount.textContent =
      products.length === 1
        ? "1 producto"
        : `${products.length} productos`;
  }
}

function groupProductsByCategory(products) {
  const groups = new Map();

  products.forEach((product) => {
    if (!groups.has(product.categoryName)) {
      groups.set(product.categoryName, []);
    }

    groups.get(product.categoryName).push(product);
  });

  return Array.from(groups.entries()).sort(
    ([firstCategory], [secondCategory]) => {
      const firstData = state.categories.find(
        (category) =>
          category.name === firstCategory
      );

      const secondData = state.categories.find(
        (category) =>
          category.name === secondCategory
      );

      const firstOrder = firstData?.order ?? 9999;
      const secondOrder = secondData?.order ?? 9999;

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }

      return firstCategory.localeCompare(
        secondCategory,
        "es"
      );
    }
  );
}

function renderProductCard(product) {
  const cartItem = state.cart.find(
    (item) =>
      Number(item.productId) === Number(product.id)
  );

  const quantity = cartItem?.quantity || 0;

  const quantityIndicator =
    quantity > 0
      ? `
        <span class="product-cart-quantity">
          ${quantity}
          ${quantity === 1 ? "agregado" : "agregados"}
        </span>
      `
      : "";

  const imageContent = product.imageUrl
    ? `
      <img
        src="${escapeAttribute(product.imageUrl)}"
        alt="${escapeAttribute(product.name)}"
        loading="lazy"
        decoding="async"
        onerror="
          this.remove();
          const container = this.closest('.product-image');

          if (container) {
            container.classList.add('product-image-error');

            const fallback =
              container.querySelector('.product-image-fallback');

            if (fallback) {
              fallback.hidden = false;
            }
          }
        "
      >

      <div
        class="product-image-fallback"
        aria-hidden="true"
        hidden
      >
        <span class="product-flame">🔥</span>

        <small>
          Toscana Grill
        </small>
      </div>
    `
    : `
      <div
        class="product-image-fallback"
        aria-hidden="true"
      >
        <span class="product-flame">🔥</span>

        <small>
          Toscana Grill
        </small>
      </div>
    `;

  return `
    <article class="product-card">
      <div class="product-image">
        ${imageContent}
      </div>

      <div class="product-card-content">
        <div class="product-card-information">
          <p class="product-category">
            ${escapeHtml(product.categoryName)}
          </p>

          <h4>
            ${escapeHtml(product.name)}
          </h4>

          ${
            product.description
              ? `
                <p class="product-description">
                  ${escapeHtml(product.description)}
                </p>
              `
              : ""
          }
        </div>

        <div class="product-card-footer">
          <div class="product-price-wrapper">
            <strong class="product-price">
              ${formatMoney(product.price)}
            </strong>

            ${quantityIndicator}
          </div>

          <button
            class="add-product-button"
            type="button"
            data-add-product="${product.id}"
            aria-label="Agregar ${escapeAttribute(product.name)}"
          >
            <span aria-hidden="true">+</span>
            Agregar
          </button>
        </div>
      </div>
    </article>
  `;
}

function handleMenuClick(event) {
  const addButton = event.target.closest(
    "[data-add-product]"
  );

  if (!addButton) {
    return;
  }

  const productId = Number(
    addButton.dataset.addProduct
  );

  addProductToCart(productId);
}

/* ============================================================
   12. CARGA DE MESAS
   ============================================================ */

async function loadTables() {
  try {
    const supabaseClient = getSupabaseClient();

    const { data, error } = await supabaseClient
      .from("mesas")
      .select(`
        id,
        numero,
        nombre,
        activa
      `)
      .eq("activa", true)
      .order("numero", {
        ascending: true
      });

    if (error) {
      throw error;
    }

    state.tables = Array.isArray(data)
      ? data
      : [];

    renderTableOptions();
  } catch (error) {
    console.error(
      "No se pudieron cargar las mesas:",
      error
    );

    state.tables = [];
    renderTableOptions();
  }
}

function renderTableOptions() {
  if (!elements.tableSelect) {
    return;
  }

  const options = state.tables
    .map((table) => {
      const tableName =
        table.nombre ||
        `Mesa ${table.numero}`;

      return `
        <option value="${escapeAttribute(table.id)}">
          ${escapeHtml(tableName)}
        </option>
      `;
    })
    .join("");

  elements.tableSelect.innerHTML = `
    <option value="">
      Selecciona una mesa
    </option>

    ${options}
  `;

  applyQrTableSelection();
}

function resolveTableFromUrl() {
  const urlParameters =
    new URLSearchParams(window.location.search);

  const rawTableId =
    urlParameters.get("mesa") ||
    urlParameters.get("table") ||
    urlParameters.get("mesa_id");

  if (!rawTableId) {
    state.qrTableId = null;
    return;
  }

  const tableId = Number(rawTableId);

  if (
    Number.isFinite(tableId) &&
    tableId > 0
  ) {
    state.qrTableId = tableId;
  }
}

function applyQrTableSelection() {
  if (
    !state.qrTableId ||
    !elements.tableSelect
  ) {
    return;
  }

  const matchingTable = state.tables.find(
    (table) =>
      Number(table.id) === Number(state.qrTableId)
  );

  if (!matchingTable) {
    return;
  }

  elements.orderType.value = ORDER_TYPES.table;
  elements.tableSelect.value = String(
    matchingTable.id
  );

  elements.tableSelect.disabled = true;

  if (elements.qrTableNotice) {
    elements.qrTableNotice.hidden = false;
  }

  handleOrderTypeChange();
}

/* ============================================================
   13. CARRITO
   ============================================================ */

function addProductToCart(productId) {
  const product = state.products.find(
    (candidate) =>
      Number(candidate.id) === Number(productId)
  );

  if (!product) {
    return;
  }

  const existingItem = state.cart.find(
    (item) =>
      Number(item.productId) === Number(productId)
  );

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    state.cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      notes: ""
    });
  }

  persistCart();
  renderCart();
  renderMenu();

  brieflyAnimateCartButtons();
}

function changeCartQuantity(productId, change) {
  const item = state.cart.find(
    (candidate) =>
      Number(candidate.productId) === Number(productId)
  );

  if (!item) {
    return;
  }

  item.quantity += change;

  if (item.quantity <= 0) {
    state.cart = state.cart.filter(
      (candidate) =>
        Number(candidate.productId) !==
        Number(productId)
    );
  }

  persistCart();
  renderCart();
  renderMenu();
}

function removeCartItem(productId) {
  state.cart = state.cart.filter(
    (item) =>
      Number(item.productId) !==
      Number(productId)
  );

  persistCart();
  renderCart();
  renderMenu();
}

function updateCartItemNotes(
  productId,
  notes
) {
  const item = state.cart.find(
    (candidate) =>
      Number(candidate.productId) ===
      Number(productId)
  );

  if (!item) {
    return;
  }

  item.notes = String(notes || "")
    .slice(0, 300);

  persistCart();
}

function renderCart() {
  renderCartItems();
  renderCartTotals();
  updateCartCounters();
  updateMobileCartVisibility();
}

function renderCartItems() {
  if (!elements.cartItems) {
    return;
  }

  if (state.cart.length === 0) {
    elements.cartItems.innerHTML = `
      <div class="cart-empty">
        <div
          class="cart-empty-icon"
          aria-hidden="true"
        >
          🛒
        </div>

        <strong>
          Tu pedido está vacío
        </strong>

        <p>
          Agrega productos desde el menú.
        </p>
      </div>
    `;

    if (elements.cartItemSummary) {
      elements.cartItemSummary.textContent =
        "Aún no has agregado productos.";
    }

    return;
  }

  elements.cartItems.innerHTML =
    state.cart
      .map((item) => {
        const itemSubtotal =
          item.price * item.quantity;

        return `
          <article class="cart-item">
            <div class="cart-item-main">
              <div>
                <h3>
                  ${escapeHtml(item.name)}
                </h3>

                <p>
                  ${formatMoney(item.price)} cada uno
                </p>
              </div>

              <strong>
                ${formatMoney(itemSubtotal)}
              </strong>
            </div>

            <div class="cart-item-controls">
              <div class="quantity-control">
                <button
                  type="button"
                  data-cart-minus="${item.productId}"
                  aria-label="Reducir cantidad de ${escapeAttribute(item.name)}"
                >
                  −
                </button>

                <strong>
                  ${item.quantity}
                </strong>

                <button
                  type="button"
                  data-cart-plus="${item.productId}"
                  aria-label="Aumentar cantidad de ${escapeAttribute(item.name)}"
                >
                  +
                </button>
              </div>

              <button
                class="remove-cart-item"
                type="button"
                data-cart-remove="${item.productId}"
              >
                Eliminar
              </button>
            </div>

            <label class="cart-item-notes">
              <span>
                Indicaciones para este producto
              </span>

              <textarea
                data-cart-notes="${item.productId}"
                maxlength="300"
                placeholder="Ejemplo: sin cebolla, término medio..."
              >${escapeHtml(item.notes || "")}</textarea>
            </label>
          </article>
        `;
      })
      .join("");

  const totalUnits = getCartUnitCount();

  if (elements.cartItemSummary) {
    elements.cartItemSummary.textContent =
      totalUnits === 1
        ? "1 producto agregado."
        : `${totalUnits} productos agregados.`;
  }
}

function handleCartClick(event) {
  const minusButton = event.target.closest(
    "[data-cart-minus]"
  );

  if (minusButton) {
    changeCartQuantity(
      Number(minusButton.dataset.cartMinus),
      -1
    );

    return;
  }

  const plusButton = event.target.closest(
    "[data-cart-plus]"
  );

  if (plusButton) {
    changeCartQuantity(
      Number(plusButton.dataset.cartPlus),
      1
    );

    return;
  }

  const removeButton = event.target.closest(
    "[data-cart-remove]"
  );

  if (removeButton) {
    removeCartItem(
      Number(removeButton.dataset.cartRemove)
    );
  }
}

function handleCartInput(event) {
  const notesInput = event.target.closest(
    "[data-cart-notes]"
  );

  if (!notesInput) {
    return;
  }

  updateCartItemNotes(
    Number(notesInput.dataset.cartNotes),
    notesInput.value
  );
}

/* ============================================================
   14. CÁLCULOS DEL PEDIDO
   ============================================================ */

function calculateCartSummary() {
  const orderType =
    elements.orderType?.value ||
    ORDER_TYPES.table;

  const deliveryZone =
    elements.deliveryZone?.value ||
    "";

  const subtotal = state.cart.reduce(
    (total, item) => {
      return total +
        Number(item.price) *
        Number(item.quantity);
    },
    0
  );

  const disposableFee =
    orderType === ORDER_TYPES.takeaway ||
    orderType === ORDER_TYPES.delivery
      ? FEES.disposable
      : 0;

  const deliveryFee =
    orderType === ORDER_TYPES.delivery &&
    deliveryZone === DELIVERY_ZONES.urban
      ? FEES.urbanDelivery
      : 0;

  const deliveryPending =
    orderType === ORDER_TYPES.delivery &&
    deliveryZone === DELIVERY_ZONES.outside;

  const total =
    subtotal +
    disposableFee +
    deliveryFee;

  return {
    subtotal: roundMoney(subtotal),
    disposableFee: roundMoney(disposableFee),
    deliveryFee: roundMoney(deliveryFee),
    deliveryPending,
    total: roundMoney(total)
  };
}

function renderCartTotals() {
  const summary = calculateCartSummary();

  if (elements.cartSubtotal) {
    elements.cartSubtotal.textContent =
      formatMoney(summary.subtotal);
  }

  if (elements.cartDisposableFee) {
    elements.cartDisposableFee.textContent =
      formatMoney(summary.disposableFee);
  }

  if (elements.disposableSummaryRow) {
    elements.disposableSummaryRow.hidden =
      summary.disposableFee <= 0;
  }

  if (elements.cartDeliveryFee) {
    elements.cartDeliveryFee.textContent =
      formatMoney(summary.deliveryFee);
  }

  if (elements.deliverySummaryRow) {
    elements.deliverySummaryRow.hidden =
      summary.deliveryFee <= 0;
  }

  if (elements.pendingDeliverySummaryRow) {
    elements.pendingDeliverySummaryRow.hidden =
      !summary.deliveryPending;
  }

  if (elements.cartTotalLabel) {
    elements.cartTotalLabel.textContent =
      summary.deliveryPending
        ? "Total preliminar"
        : "Total";
  }

  if (elements.cartTotal) {
    elements.cartTotal.textContent =
      formatMoney(summary.total);
  }

  if (elements.preliminaryTotalNotice) {
    elements.preliminaryTotalNotice.hidden =
      !summary.deliveryPending;
  }

  if (elements.mobileCartTotal) {
    elements.mobileCartTotal.textContent =
      formatMoney(summary.total);
  }
}

function updateCartCounters() {
  const unitCount = getCartUnitCount();

  if (elements.headerCartCount) {
    elements.headerCartCount.textContent =
      String(unitCount);
  }

  if (elements.mobileCartCount) {
    elements.mobileCartCount.textContent =
      String(unitCount);
  }
}

function getCartUnitCount() {
  return state.cart.reduce(
    (total, item) =>
      total + Number(item.quantity),
    0
  );
}

/* ============================================================
   15. APERTURA Y CIERRE DEL CARRITO
   ============================================================ */

function openCart() {
  if (!elements.cartDrawer) {
    return;
  }

  elements.cartDrawer.classList.add("open");
  elements.cartDrawer.setAttribute(
    "aria-hidden",
    "false"
  );

  if (elements.cartOverlay) {
    elements.cartOverlay.hidden = false;
  }

  document.body.classList.add("cart-open");

  clearOrderMessage();
  handleOrderTypeChange();
}

function closeCart() {
  if (!elements.cartDrawer) {
    return;
  }

  elements.cartDrawer.classList.remove("open");
  elements.cartDrawer.setAttribute(
    "aria-hidden",
    "true"
  );

  if (elements.cartOverlay) {
    elements.cartOverlay.hidden = true;
  }

  document.body.classList.remove("cart-open");
}

function updateMobileCartVisibility() {
  if (!elements.mobileCartButton) {
    return;
  }

  const menuIsVisible =
    elements.menuView &&
    !elements.menuView.hidden;

  elements.mobileCartButton.hidden =
    !menuIsVisible ||
    state.cart.length === 0;
}

function brieflyAnimateCartButtons() {
  const buttons = [
    elements.openCartButton,
    elements.mobileCartButton
  ];

  buttons.forEach((button) => {
    if (!button) {
      return;
    }

    button.classList.remove("cart-button-pulse");

    requestAnimationFrame(() => {
      button.classList.add(
        "cart-button-pulse"
      );

      window.setTimeout(() => {
        button.classList.remove(
          "cart-button-pulse"
        );
      }, 450);
    });
  });
}

/* ============================================================
   16. TIPO DE PEDIDO Y DELIVERY
   ============================================================ */

function handleOrderTypeChange() {
  const orderType =
    elements.orderType?.value ||
    ORDER_TYPES.table;

  const isTable =
    orderType === ORDER_TYPES.table;

  const isDelivery =
    orderType === ORDER_TYPES.delivery;

  if (elements.tableField) {
    elements.tableField.hidden = !isTable;
  }

  if (elements.deliveryFields) {
    elements.deliveryFields.hidden =
      !isDelivery;
  }

  if (elements.phoneRequiredText) {
    elements.phoneRequiredText.hidden =
      !isDelivery;
  }

  if (elements.customerPhone) {
    elements.customerPhone.required =
      isDelivery;
  }

  if (elements.deliveryZone) {
    elements.deliveryZone.required =
      isDelivery;
  }

  if (elements.deliveryAddress) {
    elements.deliveryAddress.required =
      isDelivery;
  }

  if (elements.deliveryConfirmation) {
    elements.deliveryConfirmation.required =
      isDelivery;
  }

  if (!isDelivery) {
    if (elements.deliveryZone) {
      elements.deliveryZone.value = "";
    }

    if (elements.deliveryAddress) {
      elements.deliveryAddress.value = "";
    }

    if (elements.deliveryConfirmation) {
      elements.deliveryConfirmation.checked =
        false;
    }
  }

  if (
    isTable &&
    state.qrTableId &&
    elements.tableSelect
  ) {
    elements.tableSelect.value =
      String(state.qrTableId);
  }

  handleDeliveryZoneChange();
  renderCartTotals();
  clearOrderMessage();
}

function handleDeliveryZoneChange() {
  const orderType =
    elements.orderType?.value;

  const deliveryZone =
    elements.deliveryZone?.value;

  const isDelivery =
    orderType === ORDER_TYPES.delivery;

  const isUrban =
    isDelivery &&
    deliveryZone === DELIVERY_ZONES.urban;

  const isOutside =
    isDelivery &&
    deliveryZone === DELIVERY_ZONES.outside;

  if (elements.urbanDeliveryNotice) {
    elements.urbanDeliveryNotice.hidden =
      !isUrban;
  }

  if (elements.outsideDeliveryNotice) {
    elements.outsideDeliveryNotice.hidden =
      !isOutside;
  }

  renderCartTotals();
  clearOrderMessage();
}

function sanitizePhoneInput(event) {
  const originalValue =
    String(event.target.value || "");

  const cleanedValue = originalValue
    .replace(/[^\d+\s()-]/g, "")
    .slice(0, 16);

  if (cleanedValue !== originalValue) {
    event.target.value = cleanedValue;
  }
}

/* ============================================================
   17. VALIDACIÓN DEL PEDIDO
   ============================================================ */

function validateOrder() {
  if (state.cart.length === 0) {
    return {
      valid: false,
      message:
        "Agrega al menos un producto al pedido."
    };
  }

  const orderType =
    elements.orderType?.value;

  if (
    !Object.values(ORDER_TYPES)
      .includes(orderType)
  ) {
    return {
      valid: false,
      message:
        "Selecciona un tipo de pedido válido."
    };
  }

  if (orderType === ORDER_TYPES.table) {
    const tableId = Number(
      elements.tableSelect?.value
    );

    if (
      !Number.isFinite(tableId) ||
      tableId <= 0
    ) {
      return {
        valid: false,
        message:
          "Selecciona una mesa."
      };
    }
  }

  const customerName =
    String(
      elements.customerName?.value || ""
    ).trim();

  if (customerName.length > 100) {
    return {
      valid: false,
      message:
        "El nombre no puede superar 100 caracteres."
    };
  }

  const phone =
    String(
      elements.customerPhone?.value || ""
    ).trim();

  if (
    phone &&
    !isValidEcuadorianMobile(phone)
  ) {
    return {
      valid: false,
      message:
        "Ingresa un número móvil ecuatoriano válido, por ejemplo 0999999999."
    };
  }

  if (orderType === ORDER_TYPES.delivery) {
    if (!isValidEcuadorianMobile(phone)) {
      return {
        valid: false,
        message:
          "Para delivery debes ingresar un número móvil ecuatoriano válido."
      };
    }

    const deliveryZone =
      elements.deliveryZone?.value;

    if (
      !Object.values(DELIVERY_ZONES)
        .includes(deliveryZone)
    ) {
      return {
        valid: false,
        message:
          "Selecciona la zona de entrega."
      };
    }

    const address =
      String(
        elements.deliveryAddress?.value || ""
      ).trim();

    if (!address) {
      return {
        valid: false,
        message:
          "Ingresa la dirección de entrega."
      };
    }

    if (address.length < 8) {
      return {
        valid: false,
        message:
          "Ingresa una dirección de entrega más detallada."
      };
    }

    if (address.length > 300) {
      return {
        valid: false,
        message:
          "La dirección no puede superar 300 caracteres."
      };
    }

    if (
      !elements.deliveryConfirmation?.checked
    ) {
      return {
        valid: false,
        message:
          "Debes confirmar que el teléfono y la dirección son correctos."
      };
    }
  }

  const notes =
    String(
      elements.orderNotes?.value || ""
    ).trim();

  if (notes.length > 500) {
    return {
      valid: false,
      message:
        "Las observaciones no pueden superar 500 caracteres."
    };
  }

  return {
    valid: true,
    message: ""
  };
}

function isValidEcuadorianMobile(phone) {
  const normalized = normalizePhone(phone);

  return /^09\d{8}$/.test(normalized);
}

function normalizePhone(phone) {
  let digits = String(phone || "")
    .replace(/\D/g, "");

  if (/^5939\d{8}$/.test(digits)) {
    digits = `0${digits.slice(3)}`;
  }

  return digits;
}

/* ============================================================
   18. CREACIÓN DEL PEDIDO
   ============================================================ */

async function submitOrder(event) {
  event.preventDefault();

  if (state.isSubmittingOrder) {
    return;
  }

  clearOrderMessage();

  const validation = validateOrder();

  if (!validation.valid) {
    showOrderMessage(
      validation.message,
      "error"
    );

    return;
  }

  const supabaseClient = getSupabaseClient();

  if (!supabaseClient) {
    showOrderMessage(
      "No se encontró la conexión con Supabase.",
      "error"
    );

    return;
  }

  state.isSubmittingOrder = true;

  setSubmitOrderLoading(true);

  try {
    const orderType =
      elements.orderType.value;

    const isDelivery =
      orderType === ORDER_TYPES.delivery;

    const tableId =
      orderType === ORDER_TYPES.table
        ? Number(elements.tableSelect.value)
        : null;

    const deliveryZone =
      isDelivery
        ? elements.deliveryZone.value
        : null;

    const deliveryAddress =
      isDelivery
        ? String(
            elements.deliveryAddress.value || ""
          ).trim()
        : null;

    const phone =
      String(
        elements.customerPhone.value || ""
      ).trim();

    const items = state.cart.map((item) => ({
      producto_id: Number(item.productId),
      cantidad: Number(item.quantity),
      observaciones:
        String(item.notes || "").trim() ||
        null
    }));

    const rpcParameters = {
      p_tipo: orderType,

      p_mesa_id: tableId,

      p_cliente_nombre:
        String(
          elements.customerName.value || ""
        ).trim() ||
        null,

      p_cliente_telefono:
        phone ||
        null,

      p_direccion_entrega:
        deliveryAddress,

      p_observaciones:
        String(
          elements.orderNotes.value || ""
        ).trim() ||
        null,

      p_items: items,

      p_zona_delivery:
        deliveryZone,

      p_acepta_confirmacion_delivery:
        isDelivery
          ? Boolean(
              elements.deliveryConfirmation.checked
            )
          : false
    };

    const { data, error } =
      await supabaseClient.rpc(
        "crear_pedido",
        rpcParameters
      );

    if (error) {
      throw error;
    }

    const createdOrder =
      normalizeCreatedOrder(data);

    if (
      !createdOrder.ticket ||
      !createdOrder.privateToken
    ) {
      throw new Error(
        "El servidor no devolvió el ticket o la credencial de seguimiento."
      );
    }

    state.lastCreatedOrder =
      createdOrder;

    saveCreatedOrder(createdOrder);
    showOrderSuccess(createdOrder);

    clearCartAfterSuccessfulOrder();
  } catch (error) {
    console.error(
      "Error al registrar el pedido:",
      error
    );

    showOrderMessage(
      getReadableError(
        error,
        "No se pudo registrar el pedido."
      ),
      "error"
    );
  } finally {
    state.isSubmittingOrder = false;
    setSubmitOrderLoading(false);
  }
}

function normalizeCreatedOrder(data) {
  const response =
    Array.isArray(data)
      ? data[0] || {}
      : data || {};

  return {
    id:
      response.pedido_id ||
      response.id ||
      null,

    ticket:
      String(response.ticket || "")
        .trim()
        .toUpperCase(),

    privateToken:
      String(
        response.token_consulta ||
        response.token ||
        ""
      ).trim(),

    status:
      String(
        response.estado ||
        "pendiente"
      ),

    type:
      String(
        response.tipo ||
        elements.orderType?.value ||
        ""
      ),

    subtotal:
      Number(response.subtotal || 0),

    disposableFee:
      Number(
        response.recargo ||
        response.costo_desechables ||
        0
      ),

    deliveryFee:
      Number(
        response.costo_delivery ||
        0
      ),

    total:
      Number(response.total || 0),

    deliveryZone:
      response.zona_delivery ||
      null,

    deliveryPending:
      Boolean(
        response.delivery_por_confirmar
      ),

    deliveryConfirmed:
      Boolean(
        response.delivery_confirmado
      ),

    preliminaryTotal:
      Boolean(
        response.total_preliminar
      ),

    deliveryMessage:
      response.mensaje_delivery ||
      null,

    createdAt:
      new Date().toISOString()
  };
}

function setSubmitOrderLoading(isLoading) {
  if (!elements.submitOrderButton) {
    return;
  }

  elements.submitOrderButton.disabled =
    isLoading;

  elements.submitOrderButton.textContent =
    isLoading
      ? "Registrando pedido..."
      : "Confirmar pedido";
}

/* ============================================================
   19. PEDIDO EXITOSO
   ============================================================ */

function showOrderSuccess(order) {
  if (elements.successTicket) {
    elements.successTicket.textContent =
      order.ticket;
  }

  if (elements.successTicketReminder) {
    elements.successTicketReminder.textContent =
      order.ticket;
  }

  if (elements.successStatus) {
    elements.successStatus.textContent =
      formatStatus(order.status);
  }

  if (elements.successTotalLabel) {
    elements.successTotalLabel.textContent =
      order.preliminaryTotal
        ? "Total preliminar"
        : "Total";
  }

  if (elements.successTotal) {
    elements.successTotal.textContent =
      formatMoney(order.total);
  }

  if (elements.successDeliveryPendingRow) {
    elements.successDeliveryPendingRow.hidden =
      !order.deliveryPending;
  }

  if (elements.successDescription) {
    elements.successDescription.textContent =
      getSuccessDescription(order);
  }

  if (elements.successDeliveryMessage) {
    const shouldShowDeliveryMessage =
      Boolean(order.deliveryMessage) ||
      order.deliveryPending;

    elements.successDeliveryMessage.hidden =
      !shouldShowDeliveryMessage;

    elements.successDeliveryMessage.textContent =
      order.deliveryMessage ||
      (
        order.deliveryPending
          ? "Toscana Grill confirmará el costo final del delivery mediante el número registrado."
          : ""
      );
  }

  closeCart();

  if (
    elements.successDialog &&
    !elements.successDialog.open
  ) {
    elements.successDialog.showModal();
  }
}

function getSuccessDescription(order) {
  if (
    order.type === ORDER_TYPES.delivery &&
    order.deliveryPending
  ) {
    return (
      "Tu pedido fue registrado. " +
      "El total es preliminar hasta que Toscana Grill " +
      "confirme el costo del delivery."
    );
  }

  if (order.type === ORDER_TYPES.delivery) {
    return (
      "Tu pedido fue registrado con el costo de delivery incluido."
    );
  }

  if (order.type === ORDER_TYPES.takeaway) {
    return (
      "Tu pedido para llevar fue enviado correctamente."
    );
  }

  return (
    "Tu pedido fue enviado correctamente a Toscana Grill."
  );
}

function closeSuccessDialog() {
  if (
    elements.successDialog?.open
  ) {
    elements.successDialog.close();
  }

  state.lastCreatedOrder = null;
}

function clearCartAfterSuccessfulOrder() {
  state.cart = [];
  persistCart();

  if (elements.orderNotes) {
    elements.orderNotes.value = "";
  }

  if (elements.deliveryAddress) {
    elements.deliveryAddress.value = "";
  }

  if (elements.deliveryZone) {
    elements.deliveryZone.value = "";
  }

  if (elements.deliveryConfirmation) {
    elements.deliveryConfirmation.checked =
      false;
  }

  renderCart();
  renderMenu();
  handleOrderTypeChange();
}

/* ============================================================
   20. ALMACENAMIENTO DEL CARRITO
   ============================================================ */

function persistCart() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.cart,
      JSON.stringify(state.cart)
    );
  } catch (error) {
    console.warn(
      "No se pudo guardar el carrito:",
      error
    );
  }
}

function restoreCart() {
  try {
    const storedValue =
      localStorage.getItem(STORAGE_KEYS.cart);

    if (!storedValue) {
      state.cart = [];
      return;
    }

    const parsedValue =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      state.cart = [];
      return;
    }

    state.cart = parsedValue
      .map((item) => ({
        productId: Number(
          item.productId ??
          item.producto_id
        ),

        name: String(
          item.name ??
          item.nombre ??
          "Producto"
        ),

        price: Number(
          item.price ??
          item.precio ??
          0
        ),

        quantity: Number(
          item.quantity ??
          item.cantidad ??
          1
        ),

        notes: String(
          item.notes ??
          item.observaciones ??
          ""
        )
      }))
      .filter((item) => {
        return (
          Number.isFinite(item.productId) &&
          item.productId > 0 &&
          Number.isFinite(item.price) &&
          item.price >= 0 &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0
        );
      });
  } catch (error) {
    console.warn(
      "No se pudo recuperar el carrito:",
      error
    );

    state.cart = [];
  }
}

/* ============================================================
   21. PEDIDOS GUARDADOS EN EL DISPOSITIVO
   ============================================================ */

function saveCreatedOrder(order) {
  const savedOrders = getSavedOrders();

  const newSavedOrder = {
    ticket: order.ticket,
    privateToken: order.privateToken,
    type: order.type,
    total: order.total,
    status: order.status,
    createdAt: order.createdAt
  };

  const filteredOrders = savedOrders.filter(
    (savedOrder) =>
      savedOrder.ticket !== order.ticket
  );

  filteredOrders.unshift(newSavedOrder);

  const limitedOrders =
    filteredOrders.slice(0, 20);

  try {
    localStorage.setItem(
      STORAGE_KEYS.savedOrders,
      JSON.stringify(limitedOrders)
    );

    localStorage.setItem(
      STORAGE_KEYS.lastOrder,
      JSON.stringify(newSavedOrder)
    );
  } catch (error) {
    console.warn(
      "No se pudo guardar el seguimiento:",
      error
    );
  }

  renderSavedOrders();
}

function getSavedOrders() {
  try {
    const storedValue =
      localStorage.getItem(
        STORAGE_KEYS.savedOrders
      );

    if (!storedValue) {
      return [];
    }

    const parsedValue =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(
      (order) =>
        isValidTicket(order.ticket) &&
        Boolean(order.privateToken)
    );
  } catch (error) {
    console.warn(
      "No se pudieron recuperar los pedidos guardados:",
      error
    );

    return [];
  }
}

function findSavedOrder(ticket) {
  const normalizedTicket =
    normalizeTicket(ticket);

  return getSavedOrders().find(
    (order) =>
      normalizeTicket(order.ticket) ===
      normalizedTicket
  ) || null;
}

function renderSavedOrders() {
  if (
    !elements.savedOrdersField ||
    !elements.savedOrdersSelect
  ) {
    return;
  }

  const savedOrders = getSavedOrders();

  elements.savedOrdersField.hidden =
    savedOrders.length === 0;

  if (savedOrders.length === 0) {
    elements.savedOrdersSelect.innerHTML = `
      <option value="">
        No existen pedidos guardados
      </option>
    `;

    return;
  }

  const options = savedOrders
    .map((order) => {
      const dateText =
        formatSavedOrderDate(order.createdAt);

      return `
        <option value="${escapeAttribute(order.ticket)}">
          ${escapeHtml(order.ticket)}
          ·
          ${escapeHtml(formatOrderType(order.type))}
          ·
          ${escapeHtml(dateText)}
        </option>
      `;
    })
    .join("");

  elements.savedOrdersSelect.innerHTML = `
    <option value="">
      Selecciona un pedido
    </option>

    ${options}
  `;
}

/* ============================================================
   22. SEGUIMIENTO DEL PEDIDO
   ============================================================ */

function openTrackingDialog(ticket = "") {
  clearTrackingMessage();
  hideTrackingResult();
  renderSavedOrders();

  if (elements.trackingTicketInput) {
    elements.trackingTicketInput.value =
      normalizeTicket(ticket);
  }

  if (
    elements.trackingDialog &&
    !elements.trackingDialog.open
  ) {
    elements.trackingDialog.showModal();
  }

  window.setTimeout(() => {
    elements.trackingTicketInput?.focus();
  }, 100);
}

function closeTrackingDialog() {
  if (elements.trackingDialog?.open) {
    elements.trackingDialog.close();
  }

  clearTrackingMessage();
}

function trackLastCreatedOrder() {
  if (!state.lastCreatedOrder) {
    return;
  }

  if (elements.successDialog?.open) {
    elements.successDialog.close();
  }

  openTrackingDialog(
    state.lastCreatedOrder.ticket
  );

  window.setTimeout(() => {
    executeTracking(
      state.lastCreatedOrder.ticket
    );
  }, 150);
}

function handleSavedOrderSelection(event) {
  const selectedTicket =
    normalizeTicket(event.target.value);

  if (!selectedTicket) {
    return;
  }

  if (elements.trackingTicketInput) {
    elements.trackingTicketInput.value =
      selectedTicket;
  }

  executeTracking(selectedTicket);
}

async function submitTracking(event) {
  event.preventDefault();

  const ticket =
    normalizeTicket(
      elements.trackingTicketInput?.value
    );

  await executeTracking(ticket);
}

async function executeTracking(ticket) {
  if (state.isTrackingOrder) {
    return;
  }

  clearTrackingMessage();
  hideTrackingResult();

  if (!isValidTicket(ticket)) {
    showTrackingMessage(
      "Ingresa un ticket válido con formato TG-YYMMDD-NNNN.",
      "error"
    );

    return;
  }

  const savedOrder = findSavedOrder(ticket);

  if (!savedOrder?.privateToken) {
    showTrackingMessage(
      "Este pedido no está guardado en este dispositivo. " +
      "Para proteger la información, la consulta requiere " +
      "la credencial privada generada al registrar el pedido.",
      "error"
    );

    return;
  }

  const supabaseClient = getSupabaseClient();

  if (!supabaseClient) {
    showTrackingMessage(
      "No se encontró la conexión con Supabase.",
      "error"
    );

    return;
  }

  state.isTrackingOrder = true;
  state.currentTrackingTicket = ticket;

  setTrackingLoading(true);

  try {
    const { data, error } =
      await supabaseClient.rpc(
        "consultar_pedido",
        {
          p_ticket: ticket,
          p_token_consulta:
            savedOrder.privateToken
        }
      );

    if (error) {
      throw error;
    }

    const order = normalizeTrackedOrder(data);

    renderTrackedOrder(order);
    updateSavedOrderStatus(order);
  } catch (error) {
    console.error(
      "Error al consultar el pedido:",
      error
    );

    showTrackingMessage(
      getReadableError(
        error,
        "No se pudo consultar el pedido."
      ),
      "error"
    );
  } finally {
    state.isTrackingOrder = false;
    setTrackingLoading(false);
  }
}

function normalizeTrackedOrder(data) {
  const response =
    Array.isArray(data)
      ? data[0] || {}
      : data || {};

  const tableData =
    response.mesa || null;

  const detail =
    response.detalle ||
    response.items ||
    [];

  return {
    id:
      response.pedido_id ||
      response.id ||
      null,

    ticket:
      normalizeTicket(response.ticket),

    status:
      String(
        response.estado ||
        "pendiente"
      ),

    paymentStatus:
      String(
        response.estado_pago ||
        "pendiente"
      ),

    type:
      String(response.tipo || ""),

    customerName:
      response.cliente_nombre ||
      null,

    table:
      tableData
        ? (
            tableData.nombre ||
            (
              tableData.numero
                ? `Mesa ${tableData.numero}`
                : null
            )
          )
        : null,

    deliveryZone:
      response.zona_delivery ||
      null,

    deliveryAddress:
      response.direccion_entrega ||
      null,

    subtotal:
      Number(response.subtotal || 0),

    disposableFee:
      Number(
        response.recargo ||
        response.costo_desechables ||
        0
      ),

    discount:
      Number(response.descuento || 0),

    deliveryFee:
      Number(
        response.costo_delivery_confirmado ??
        response.costo_delivery ??
        0
      ),

    deliveryPending:
      Boolean(
        response.delivery_por_confirmar
      ),

    deliveryConfirmed:
      Boolean(
        response.delivery_confirmado
      ),

    preliminaryTotal:
      Boolean(
        response.total_preliminar
      ),

    total:
      Number(response.total || 0),

    notes:
      response.observaciones ||
      null,

    createdAt:
      response.creado_en ||
      null,

    updatedAt:
      response.actualizado_en ||
      null,

    items:
      Array.isArray(detail)
        ? detail.map(normalizeTrackedItem)
        : []
  };
}

function normalizeTrackedItem(item) {
  return {
    productId:
      item.producto_id ||
      null,

    name:
      String(
        item.producto ||
        item.producto_nombre ||
        "Producto"
      ),

    quantity:
      Number(item.cantidad || 0),

    unitPrice:
      Number(
        item.precio_unitario ||
        0
      ),

    subtotal:
      Number(
        item.subtotal ||
        (
          Number(item.cantidad || 0) *
          Number(item.precio_unitario || 0)
        )
      ),

    notes:
      item.observaciones ||
      null
  };
}

function renderTrackedOrder(order) {
  if (elements.trackingStatus) {
    elements.trackingStatus.textContent =
      formatStatus(order.status);
  }

  if (elements.trackingTicket) {
    elements.trackingTicket.textContent =
      order.ticket;
  }

  if (elements.trackingType) {
    elements.trackingType.textContent =
      formatOrderType(order.type);
  }

  if (elements.trackingTableRow) {
    elements.trackingTableRow.hidden =
      order.type !== ORDER_TYPES.table;
  }

  if (elements.trackingTable) {
    elements.trackingTable.textContent =
      order.table || "No especificada";
  }

  if (elements.trackingZoneRow) {
    elements.trackingZoneRow.hidden =
      order.type !== ORDER_TYPES.delivery;
  }

  if (elements.trackingZone) {
    elements.trackingZone.textContent =
      formatDeliveryZone(order.deliveryZone);
  }

  if (elements.trackingAddressRow) {
    elements.trackingAddressRow.hidden =
      order.type !== ORDER_TYPES.delivery ||
      !order.deliveryAddress;
  }

  if (elements.trackingAddress) {
    elements.trackingAddress.textContent =
      order.deliveryAddress ||
      "No registrada";
  }

  if (elements.trackingSubtotal) {
    elements.trackingSubtotal.textContent =
      formatMoney(order.subtotal);
  }

  if (elements.trackingDisposableFee) {
    elements.trackingDisposableFee.textContent =
      formatMoney(order.disposableFee);
  }

  if (elements.trackingDeliveryFee) {
    elements.trackingDeliveryFee.textContent =
      order.deliveryPending
        ? "Por confirmar"
        : formatMoney(order.deliveryFee);
  }

  if (elements.trackingTotalLabel) {
    elements.trackingTotalLabel.textContent =
      order.preliminaryTotal
        ? "Total preliminar"
        : "Total";
  }

  if (elements.trackingTotal) {
    elements.trackingTotal.textContent =
      formatMoney(order.total);
  }

  if (elements.trackingPreliminaryNotice) {
    elements.trackingPreliminaryNotice.hidden =
      !order.deliveryPending;
  }

  renderTrackingItems(order.items);

  if (elements.trackingResult) {
    elements.trackingResult.hidden = false;
  }

  clearTrackingMessage();
}

function renderTrackingItems(items) {
  if (!elements.trackingItems) {
    return;
  }

  if (!items.length) {
    elements.trackingItems.innerHTML = `
      <p class="tracking-empty-items">
        No se encontró el detalle del pedido.
      </p>
    `;

    return;
  }

  elements.trackingItems.innerHTML =
    items
      .map((item) => {
        return `
          <article class="tracking-item">
            <div class="tracking-item-header">
              <strong>
                ${item.quantity}
                ×
                ${escapeHtml(item.name)}
              </strong>

              <strong>
                ${formatMoney(item.subtotal)}
              </strong>
            </div>

            <p>
              ${formatMoney(item.unitPrice)}
              por unidad
            </p>

            ${
              item.notes
                ? `
                  <p>
                    Indicaciones:
                    ${escapeHtml(item.notes)}
                  </p>
                `
                : ""
            }
          </article>
        `;
      })
      .join("");
}

async function refreshCurrentTracking() {
  const ticket =
    state.currentTrackingTicket ||
    normalizeTicket(
      elements.trackingTicketInput?.value
    );

  await executeTracking(ticket);
}

function hideTrackingResult() {
  if (elements.trackingResult) {
    elements.trackingResult.hidden = true;
  }
}

function setTrackingLoading(isLoading) {
  if (elements.submitTrackingButton) {
    elements.submitTrackingButton.disabled =
      isLoading;

    elements.submitTrackingButton.textContent =
      isLoading
        ? "Consultando..."
        : "Consultar pedido";
  }

  if (elements.refreshTrackingButton) {
    elements.refreshTrackingButton.disabled =
      isLoading;

    elements.refreshTrackingButton.textContent =
      isLoading
        ? "Actualizando..."
        : "Actualizar estado";
  }
}

function updateSavedOrderStatus(order) {
  const savedOrders = getSavedOrders();

  const updatedOrders = savedOrders.map(
    (savedOrder) => {
      if (
        normalizeTicket(savedOrder.ticket) !==
        normalizeTicket(order.ticket)
      ) {
        return savedOrder;
      }

      return {
        ...savedOrder,
        status: order.status,
        total: order.total
      };
    }
  );

  try {
    localStorage.setItem(
      STORAGE_KEYS.savedOrders,
      JSON.stringify(updatedOrders)
    );
  } catch (error) {
    console.warn(
      "No se pudo actualizar el pedido guardado:",
      error
    );
  }
}

/* ============================================================
   23. FORMATO DEL TICKET
   ============================================================ */

function formatTrackingTicketInput(event) {
  const formattedTicket =
    normalizeTicketInput(event.target.value);

  event.target.value = formattedTicket;
}

function normalizeTicketInput(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  let remaining = raw;

  if (remaining.startsWith("TG")) {
    remaining = remaining.slice(2);
  }

  const datePart =
    remaining.slice(0, 6);

  const sequencePart =
    remaining.slice(6, 10);

  let result = "TG";

  if (
    datePart.length > 0 ||
    raw.startsWith("TG")
  ) {
    result += `-${datePart}`;
  }

  if (sequencePart.length > 0) {
    result += `-${sequencePart}`;
  }

  return result.slice(0, 14);
}

function normalizeTicket(value) {
  const compact = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const match = compact.match(
    /^TG(\d{6})(\d{4})$/
  );

  if (!match) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  return `TG-${match[1]}-${match[2]}`;
}

function isValidTicket(ticket) {
  return /^TG-\d{6}-\d{4}$/.test(
    normalizeTicket(ticket)
  );
}

/* ============================================================
   24. MENSAJES
   ============================================================ */

function showOrderMessage(
  message,
  type = "error"
) {
  if (!elements.orderMessage) {
    return;
  }

  elements.orderMessage.textContent =
    String(message || "");

  elements.orderMessage.dataset.type =
    type;

  elements.orderMessage.hidden = false;
}

function clearOrderMessage() {
  if (!elements.orderMessage) {
    return;
  }

  elements.orderMessage.textContent = "";
  elements.orderMessage.hidden = true;

  delete elements.orderMessage.dataset.type;
}

function showTrackingMessage(
  message,
  type = "error"
) {
  if (!elements.trackingMessage) {
    return;
  }

  elements.trackingMessage.textContent =
    String(message || "");

  elements.trackingMessage.dataset.type =
    type;

  elements.trackingMessage.hidden = false;
}

function clearTrackingMessage() {
  if (!elements.trackingMessage) {
    return;
  }

  elements.trackingMessage.textContent = "";
  elements.trackingMessage.hidden = true;

  delete elements.trackingMessage.dataset.type;
}

/* ============================================================
   25. RELOJ Y HORARIO
   ============================================================ */

function updateEcuadorClock() {
  if (!elements.ecuadorClock) {
    return;
  }

  elements.ecuadorClock.textContent =
    new Intl.DateTimeFormat(
      "es-EC",
      {
        timeZone: ECUADOR_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }
    ).format(new Date());
}

function updateBusinessStatus() {
  if (
    !elements.businessStatus ||
    !elements.businessScheduleMessage
  ) {
    return;
  }

  const ecuadorDateParts =
    getEcuadorDateParts();

  const schedule =
    getConfiguredSchedule();

  const daySchedule =
    schedule[ecuadorDateParts.weekDay];

  if (
    !daySchedule ||
    daySchedule.closed === true
  ) {
    elements.businessStatus.textContent =
      "Cerrado";

    elements.businessStatus.dataset.status =
      "closed";

    elements.businessScheduleMessage.textContent =
      "Hoy no tenemos atención.";

    return;
  }

  const currentMinutes =
    ecuadorDateParts.hour * 60 +
    ecuadorDateParts.minute;

  const openMinutes =
    parseTimeToMinutes(daySchedule.open);

  const closeMinutes =
    parseTimeToMinutes(daySchedule.close);

  const isOpen =
    currentMinutes >= openMinutes &&
    currentMinutes < closeMinutes;

  elements.businessStatus.textContent =
    isOpen
      ? "Abierto ahora"
      : "Cerrado";

  elements.businessStatus.dataset.status =
    isOpen
      ? "open"
      : "closed";

  elements.businessScheduleMessage.textContent =
    isOpen
      ? `Atendemos hoy hasta las ${formatSimpleTime(daySchedule.close)}.`
      : `Horario de hoy: ${formatSimpleTime(daySchedule.open)} a ${formatSimpleTime(daySchedule.close)}.`;
}

function getConfiguredSchedule() {
  const configuredSchedule =
    window.TOSCANA_CONFIG?.schedule ||
    window.TOSCANA_CONFIG?.horario ||
    null;

  if (!configuredSchedule) {
    return DEFAULT_SCHEDULE;
  }

  return {
    ...DEFAULT_SCHEDULE,
    ...configuredSchedule
  };
}

function getEcuadorDateParts() {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: ECUADOR_TIME_ZONE,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    );

  const parts =
    formatter.formatToParts(
      new Date()
    );

  const values = Object.fromEntries(
    parts.map((part) => [
      part.type,
      part.value
    ])
  );

  const weekDayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    weekDay:
      weekDayMap[values.weekday] ?? 0,

    hour:
      Number(values.hour || 0) % 24,

    minute:
      Number(values.minute || 0)
  };
}

function parseTimeToMinutes(value) {
  const [hours, minutes] =
    String(value || "00:00")
      .split(":")
      .map(Number);

  return (
    (Number.isFinite(hours) ? hours : 0) *
      60 +
    (Number.isFinite(minutes) ? minutes : 0)
  );
}

function formatSimpleTime(value) {
  const [hours, minutes] =
    String(value || "00:00")
      .split(":")
      .map(Number);

  const date = new Date();

  date.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0
  );

  return new Intl.DateTimeFormat(
    "es-EC",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  ).format(date);
}

/* ============================================================
   26. TECLADO
   ============================================================ */

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (
    elements.cartDrawer?.classList.contains(
      "open"
    )
  ) {
    closeCart();
  }
}

/* ============================================================
   27. FORMATEADORES
   ============================================================ */

function formatMoney(value) {
  return new Intl.NumberFormat(
    "es-EC",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(Number(value || 0));
}

function roundMoney(value) {
  return Math.round(
    (Number(value || 0) +
      Number.EPSILON) *
      100
  ) / 100;
}

function formatStatus(status) {
  const statusLabels = {
    pendiente: "Pendiente",
    confirmado: "Confirmado",
    en_preparacion: "En preparación",
    listo: "Listo",
    entregado: "Entregado",
    cerrado: "Cerrado",
    cancelado: "Cancelado"
  };

  return (
    statusLabels[status] ||
    capitalizeWords(
      String(status || "pendiente")
        .replace(/_/g, " ")
    )
  );
}

function formatOrderType(type) {
  const typeLabels = {
    mesa: "Consumo en mesa",
    para_llevar: "Para llevar",
    delivery: "Delivery"
  };

  return typeLabels[type] || "Pedido";
}

function formatDeliveryZone(zone) {
  const zoneLabels = {
    urbana: "Dentro de la zona urbana",
    fuera_urbana: "Fuera de la zona urbana"
  };

  return zoneLabels[zone] || "No especificada";
}

function formatSavedOrderDate(value) {
  if (!value) {
    return "Fecha no disponible";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat(
    "es-EC",
    {
      timeZone: ECUADOR_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }
  ).format(date);
}

function capitalizeWords(value) {
  return String(value || "")
    .toLocaleLowerCase("es")
    .replace(
      /(^|\s)\S/g,
      (character) =>
        character.toLocaleUpperCase("es")
    );
}

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ============================================================
   28. SEGURIDAD DE TEXTO
   ============================================================ */

function escapeHtml(value) {
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

function escapeAttribute(value) {
  return escapeHtml(value);
}

/* ============================================================
   29. MANEJO DE ERRORES
   ============================================================ */

function getReadableError(
  error,
  fallbackMessage
) {
  const rawMessage =
    String(
      error?.message ||
      error?.details ||
      error?.hint ||
      ""
    ).trim();

  if (!rawMessage) {
    return fallbackMessage;
  }

  const knownMessages = [
    "El tipo de pedido no es válido",
    "El pedido debe contener al menos un producto",
    "Debe seleccionar una mesa",
    "La mesa seleccionada no existe o está inactiva",
    "Debe ingresar un número móvil ecuatoriano válido",
    "Debe ingresar la dirección de entrega",
    "Debe seleccionar una zona de entrega válida",
    "Debe aceptar la confirmación del pedido y del delivery",
    "Uno de los productos ya no se encuentra disponible",
    "El formato del ticket no es válido",
    "No se encontró el pedido",
    "No se encontró la credencial privada de seguimiento"
  ];

  const matchingMessage =
    knownMessages.find((message) =>
      rawMessage.includes(message)
    );

  if (matchingMessage) {
    return ensurePeriod(matchingMessage);
  }

  if (
    rawMessage.includes(
      "Could not find the function"
    ) ||
    rawMessage.includes(
      "function public.crear_pedido"
    )
  ) {
    return (
      "La función crear_pedido no está disponible. " +
      "Ejecuta primero la migración 007 en Supabase."
    );
  }

  if (
    rawMessage.includes("Failed to fetch") ||
    rawMessage.includes("NetworkError") ||
    rawMessage.includes("Load failed")
  ) {
    return (
      "No se pudo conectar con el servidor. " +
      "Revisa tu conexión a internet."
    );
  }

  console.warn(
    "Mensaje técnico recibido:",
    rawMessage
  );

  return fallbackMessage;
}

function ensurePeriod(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  return /[.!?]$/.test(text)
    ? text
    : `${text}.`;
}
