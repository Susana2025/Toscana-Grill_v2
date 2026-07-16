"use strict";

/**
 * Menú público y toma manual de pedidos de Toscana Grill.
 *
 * Modos admitidos:
 *
 * 1. Cliente con QR:
 *    ?mesa=4
 *    La mesa queda seleccionada y bloqueada.
 *
 * 2. Personal del restaurante:
 *    ?modo=admin
 *    Permite elegir manualmente el tipo de pedido y la mesa.
 *
 * 3. Acceso general:
 *    Sin parámetros.
 *    Mantiene la selección manual disponible.
 */

const state = {
  menu: [],
  tables: [],
  cart: [],
  qrTableNumber: null,
  qrTable: null,
  adminMode: false
};

document.addEventListener(
  "DOMContentLoaded",
  initializeApp
);

/**
 * Inicializa la aplicación.
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
 * Configura eventos permanentes.
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
 * Detecta el modo de operación desde la URL.
 */
function detectURLMode() {
  const parameters =
    new URLSearchParams(
      window.location.search
    );

  const mode =
    String(
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
 * Aplica la configuración detectada en la URL.
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
 * Activa la toma manual de pedidos.
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
 * Muestra una indicación de modo administrativo.
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

  notice.id = "admin-mode-notice";
  notice.className = "qr-table-notice";

  notice.textContent =
    "Modo de toma manual: selecciona el tipo de pedido y la mesa correspondiente.";

  tableField.appendChild(notice);
}

/**
 * Carga productos activos y disponibles.
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
      "No se pudo cargar el menú desde Supabase. Se utilizará el archivo local.",
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
      Array.isArray(
        fallback.productos
      )
        ? fallback.productos
        : [];
  } else {
    state.menu = (
      Array.isArray(data)
        ? data
        : []
    ).map((product) => ({
      ...product,
      categoria:
        product.categorias?.nombre ||
        "Otros",
      categoria_orden:
        product.categorias?.orden ||
        999
    }));
  }

  renderMenu();
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
 * Renderiza las opciones de mesa.
 */
function renderTableOptions() {
  const tableSelect =
    document.querySelector(
      "#table-select"
    );

  if (!tableSelect) {
    return;
  }

  if (state.tables.length === 0) {
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
 * Aplica la mesa identificada por QR.
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
        Number(state.qrTableNumber)
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
 * Muestra el aviso de mesa detectada.
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

  notice.id = "qr-table-notice";
  notice.className = "qr-table-notice";

  notice.textContent =
    `${label} identificada automáticamente mediante el código QR.`;

  tableField.appendChild(notice);
}

/**
 * Elimina avisos previos del modo de toma.
 */
function removeModeNotices() {
  [
    "#qr-table-notice",
    "#admin-mode-notice"
  ].forEach((selector) => {
    const element =
      document.querySelector(selector);

    if (element) {
      element.remove();
    }
  });
}

/**
 * Renderiza el menú.
 */
function renderMenu() {
  const searchInput =
    document.querySelector("#search");

  const menuContainer =
    document.querySelector(
      "#menu-container"
    );

  const categoryNavigation =
    document.querySelector(
      "#category-nav"
    );

  if (
    !menuContainer ||
    !categoryNavigation
  ) {
    return;
  }

  const query =
    String(
      searchInput?.value || ""
    )
      .trim()
      .toLowerCase();

  const filteredProducts =
    state.menu.filter((product) => {
      const searchableText = `
        ${product.nombre || ""}
        ${product.descripcion || ""}
        ${product.categoria || ""}
      `.toLowerCase();

      return searchableText.includes(query);
    });

  const groupedProducts =
    filteredProducts.reduce(
      (groups, product) => {
        const category =
          product.categoria ||
          product.categorias?.nombre ||
          "Otros";

        if (!groups[category]) {
          groups[category] = {
            order:
              product.categoria_orden ||
              product.categorias?.orden ||
              999,
            products: []
          };
        }

        groups[category].products.push(
          product
        );

        return groups;
      },
      {}
    );

  const sortedGroups =
    Object.entries(groupedProducts)
      .sort(
        (
          [, firstGroup],
          [, secondGroup]
        ) =>
          firstGroup.order -
          secondGroup.order
      );

  categoryNavigation.innerHTML =
    sortedGroups
      .map(([category]) => {
        return `
          <a
            href="#categoria-${slug(category)}"
            class="category-link"
          >
            ${escapeHTML(category)}
          </a>
        `;
      })
      .join("");

  menuContainer.innerHTML =
    sortedGroups.length > 0
      ? sortedGroups
          .map(
            ([category, group]) => `
              <section
                id="categoria-${slug(category)}"
                class="menu-category"
              >
                <h2>
                  ${escapeHTML(category)}
                </h2>

                <div class="products-grid">
                  ${group.products
                    .map(createProductCard)
                    .join("")}
                </div>
              </section>
            `
          )
          .join("")
      : `
          <div class="menu-empty">
            <strong>
              No se encontraron productos.
            </strong>
          </div>
        `;

  menuContainer
    .querySelectorAll(
      "[data-add-product]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          addProduct(
            Number(
              button.dataset.addProduct
            )
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
  return `
    <article class="product-card">
      <div class="product-card-content">
        <h3>
          ${escapeHTML(
            product.nombre
          )}
        </h3>

        <p>
          ${escapeHTML(
            product.descripcion || ""
          )}
        </p>
      </div>

      <div class="product-card-footer">
        <strong>
          ${money(product.precio)}
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
 * Agrega un producto al carrito.
 *
 * @param {number} productId
 */
function addProduct(productId) {
  const product =
    state.menu.find(
      (item) =>
        Number(item.id) ===
        Number(productId)
    );

  if (!product) {
    return;
  }

  const existingItem =
    state.cart.find(
      (item) =>
        Number(item.producto_id) ===
        Number(productId)
    );

  if (existingItem) {
    existingItem.cantidad += 1;
  } else {
    state.cart.push({
      producto_id:
        Number(product.id),
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
 * Modifica la cantidad.
 *
 * @param {number} productId
 * @param {number} variation
 */
function changeQuantity(
  productId,
  variation
) {
  const item =
    state.cart.find(
      (product) =>
        Number(product.producto_id) ===
        Number(productId)
    );

  if (!item) {
    return;
  }

  item.cantidad += variation;

  if (item.cantidad <= 0) {
    state.cart =
      state.cart.filter(
        (product) =>
          Number(product.producto_id) !==
          Number(productId)
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

  const emptyMessage =
    document.querySelector(
      "#cart-empty"
    );

  const totalElement =
    document.querySelector(
      "#cart-total"
    );

  if (
    !cartContainer ||
    !emptyMessage ||
    !totalElement
  ) {
    return;
  }

  emptyMessage.hidden =
    state.cart.length > 0;

  cartContainer.innerHTML =
    state.cart
      .map(
        (item) => `
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
        `
      )
      .join("");

  cartContainer
    .querySelectorAll(
      "[data-minus]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          changeQuantity(
            Number(
              button.dataset.minus
            ),
            -1
          );
        }
      );
    });

  cartContainer
    .querySelectorAll(
      "[data-plus]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          changeQuantity(
            Number(
              button.dataset.plus
            ),
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

  totalElement.textContent =
    money(total);
}

/**
 * Muestra los campos según tipo de pedido.
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

  const type = orderType.value;

  tableField.hidden =
    type !== "mesa";

  addressField.hidden =
    type !== "delivery";

  if (
    state.qrTable &&
    !state.adminMode
  ) {
    orderType.value = "mesa";
    orderType.disabled = true;
    tableField.hidden = false;
    addressField.hidden = true;
  }
}

/**
 * Registra un pedido.
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
      ? Number(
          state.qrTable?.id ||
          tableSelect?.value
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

  submitButton.disabled = true;
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
          p_tipo: orderType,
          p_mesa_id: tableId,
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

    const successDialog =
      document.querySelector(
        "#success-dialog"
      );

    if (successDialog) {
      successDialog.showModal();
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
    submitButton.disabled = false;
    submitButton.textContent =
      "Confirmar pedido";
  }
}

/**
 * Inicia un pedido nuevo.
 */
function startNewOrder() {
  clearCart();
  clearCustomerFields();

  const successDialog =
    document.querySelector(
      "#success-dialog"
    );

  if (successDialog?.open) {
    successDialog.close();
  }

  applyURLConfiguration();
  toggleOrderFields();
}

/**
 * Vacía el carrito.
 */
function clearCart() {
  state.cart = [];
  saveCart();
  renderCart();
}

/**
 * Limpia campos del cliente.
 */
function clearCustomerFields() {
  const selectors = [
    "#customer-name",
    "#customer-phone",
    "#delivery-address",
    "#order-notes"
  ];

  selectors.forEach((selector) => {
    const element =
      document.querySelector(selector);

    if (element) {
      element.value = "";
    }
  });
}

/**
 * Guarda carrito.
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
 * Obtiene un valor de campo.
 *
 * @param {string} selector
 * @returns {string}
 */
function getInputValue(selector) {
  const element =
    document.querySelector(selector);

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
    document.querySelector(selector);

  if (element) {
    element.textContent =
      String(value ?? "");
  }
}

/**
 * Formatea dinero.
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
  ).format(Number(value || 0));
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
 * Genera slug.
 *
 * @param {unknown} value
 * @returns {string}
 */
function slug(value) {
  return String(value || "")
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
      /^-|-$/g,
      ""
    );
}

/**
 * Escapa HTML.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHTML(value) {
  return String(value ?? "").replace(
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
