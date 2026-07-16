"use strict";

/**
 * Módulo Productos de Toscana Grill.
 *
 * Responsabilidades:
 * - Cargar la vista productos.html.
 * - Consultar categorías activas.
 * - Consultar todos los productos administrativos.
 * - Filtrar por texto, categoría y estado.
 * - Crear y editar productos.
 * - Cambiar disponibilidad y estado activo.
 * - Mantener sincronizado el catálogo del menú público.
 */

(function initializeProductsModule() {
  const state = {
    initialized: false,
    loading: false,
    saving: false,
    products: [],
    categories: [],
    filters: {
      search: "",
      categoryId: "",
      status: ""
    },
    callbacks: {
      showMessage: null,
      clearMessage: null
    }
  };

  /**
   * Inicializa el módulo Productos.
   *
   * @param {object} options
   * @param {Function} options.showMessage
   * @param {Function} options.clearMessage
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

    await window.toscanaViewLoader.load("productos");

    const view = document.querySelector("#view-productos");

    if (!view) {
      throw new Error(
        "La vista productos.html no se cargó correctamente."
      );
    }

    setupEvents();

    state.initialized = true;

    await refresh();
  }

  /**
   * Valida dependencias globales.
   */
  function validateDependencies() {
    if (!window.toscanaSupabase) {
      throw new Error(
        "Supabase no está disponible para el módulo Productos."
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
    const newProductButton = document.querySelector(
      "#new-product-button"
    );

    const refreshButton = document.querySelector(
      "#refresh-products"
    );

    const searchInput = document.querySelector(
      "#products-search"
    );

    const categoryFilter = document.querySelector(
      "#products-category-filter"
    );

    const statusFilter = document.querySelector(
      "#products-status-filter"
    );

    const productDialog = document.querySelector(
      "#product-dialog"
    );

    const closeDialogButton = document.querySelector(
      "#close-product-dialog"
    );

    const cancelButton = document.querySelector(
      "#cancel-product-button"
    );

    const productForm = document.querySelector(
      "#product-form"
    );

    if (newProductButton) {
      newProductButton.addEventListener(
        "click",
        openNewProductDialog
      );
    }

    if (refreshButton) {
      refreshButton.addEventListener(
        "click",
        refresh
      );
    }

    if (searchInput) {
      searchInput.addEventListener(
        "input",
        () => {
          state.filters.search =
            searchInput.value.trim().toLowerCase();

          renderProducts();
        }
      );
    }

    if (categoryFilter) {
      categoryFilter.addEventListener(
        "change",
        () => {
          state.filters.categoryId =
            categoryFilter.value;

          renderProducts();
        }
      );
    }

    if (statusFilter) {
      statusFilter.addEventListener(
        "change",
        () => {
          state.filters.status =
            statusFilter.value;

          renderProducts();
        }
      );
    }

    if (closeDialogButton) {
      closeDialogButton.addEventListener(
        "click",
        closeProductDialog
      );
    }

    if (cancelButton) {
      cancelButton.addEventListener(
        "click",
        closeProductDialog
      );
    }

    if (productDialog) {
      productDialog.addEventListener(
        "click",
        (event) => {
          if (event.target === productDialog) {
            closeProductDialog();
          }
        }
      );
    }

    if (productForm) {
      productForm.addEventListener(
        "submit",
        saveProduct
      );
    }
  }

  /**
   * Recarga categorías y productos.
   *
   * @returns {Promise<void>}
   */
  async function refresh() {
    if (!document.querySelector("#view-productos")) {
      return;
    }

    if (state.loading) {
      return;
    }

    state.loading = true;
    state.callbacks.clearMessage();

    const loading = document.querySelector(
      "#products-loading"
    );

    const refreshButton = document.querySelector(
      "#refresh-products"
    );

    window.toscanaUtils.setButtonLoading(
      refreshButton,
      true,
      "Actualizando…"
    );

    if (loading) {
      loading.hidden = false;
    }

    try {
      await Promise.all([
        loadCategories(),
        loadProducts()
      ]);

      renderCategoryOptions();
      renderSummary();
      renderProducts();
    } catch (error) {
      console.error(
        "Error al actualizar Productos:",
        error
      );

      state.callbacks.showMessage(
        error?.message ||
        "No fue posible actualizar la gestión de productos."
      );
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
   * Carga categorías activas.
   *
   * @returns {Promise<void>}
   */
  async function loadCategories() {
    const {
      data,
      error
    } = await window.toscanaSupabase
      .from("categorias")
      .select(
        "id,nombre,orden,activa"
      )
      .eq("activa", true)
      .order("orden")
      .order("nombre");

    if (error) {
      console.error(
        "Error al cargar categorías:",
        error
      );

      throw new Error(
        "No fue posible cargar las categorías."
      );
    }

    state.categories =
      window.toscanaUtils.toArray(data);
  }

  /**
   * Carga productos administrativos.
   *
   * @returns {Promise<void>}
   */
  async function loadProducts() {
    const {
      data,
      error
    } = await window.toscanaSupabase.rpc(
      "listar_productos_admin"
    );

    if (error) {
      console.error(
        "Error al cargar productos:",
        error
      );

      throw new Error(
        error.message ||
        "No fue posible cargar los productos."
      );
    }

    state.products =
      window.toscanaUtils.toArray(data);
  }

  /**
   * Renderiza opciones de categoría.
   */
  function renderCategoryOptions() {
    const categoryFilter = document.querySelector(
      "#products-category-filter"
    );

    const productCategory = document.querySelector(
      "#product-category"
    );

    const options = state.categories
      .map((category) => {
        return `
          <option value="${window.toscanaUtils.escapeHTML(
            category.id
          )}">
            ${window.toscanaUtils.escapeHTML(
              category.nombre
            )}
          </option>
        `;
      })
      .join("");

    if (categoryFilter) {
      const currentValue =
        state.filters.categoryId;

      categoryFilter.innerHTML = `
        <option value="">
          Todas
        </option>
        ${options}
      `;

      categoryFilter.value =
        currentValue;
    }

    if (productCategory) {
      productCategory.innerHTML = `
        <option value="">
          Sin categoría
        </option>
        ${options}
      `;
    }
  }

  /**
   * Renderiza indicadores.
   */
  function renderSummary() {
    const total = state.products.length;

    const available = state.products.filter(
      (product) =>
        product.activo === true &&
        product.disponible === true
    ).length;

    const unavailable = state.products.filter(
      (product) =>
        product.activo === true &&
        product.disponible === false
    ).length;

    const inactive = state.products.filter(
      (product) =>
        product.activo === false
    ).length;

    window.toscanaUtils.setText(
      "#products-total-count",
      total
    );

    window.toscanaUtils.setText(
      "#products-available-count",
      available
    );

    window.toscanaUtils.setText(
      "#products-unavailable-count",
      unavailable
    );

    window.toscanaUtils.setText(
      "#products-inactive-count",
      inactive
    );
  }

  /**
   * Filtra y renderiza productos.
   */
  function renderProducts() {
    const grid = document.querySelector(
      "#products-grid"
    );

    const empty = document.querySelector(
      "#products-empty"
    );

    const badge = document.querySelector(
      "#products-results-badge"
    );

    if (!grid || !empty || !badge) {
      return;
    }

    const filteredProducts =
      state.products.filter(
        matchesCurrentFilters
      );

    badge.textContent =
      String(filteredProducts.length);

    empty.hidden =
      filteredProducts.length > 0;

    if (filteredProducts.length === 0) {
      grid.innerHTML = "";
      return;
    }

    grid.innerHTML = filteredProducts
      .map(createProductCard)
      .join("");

    attachProductCardEvents(grid);
  }

  /**
   * Evalúa filtros actuales.
   *
   * @param {object} product
   * @returns {boolean}
   */
  function matchesCurrentFilters(product) {
    const searchText = `
      ${product.nombre || ""}
      ${product.descripcion || ""}
      ${product.categoria_nombre || ""}
    `.toLowerCase();

    const matchesSearch =
      !state.filters.search ||
      searchText.includes(
        state.filters.search
      );

    const matchesCategory =
      !state.filters.categoryId ||
      String(product.categoria_id || "") ===
        String(state.filters.categoryId);

    let matchesStatus = true;

    if (
      state.filters.status === "available"
    ) {
      matchesStatus =
        product.activo === true &&
        product.disponible === true;
    }

    if (
      state.filters.status === "unavailable"
    ) {
      matchesStatus =
        product.activo === true &&
        product.disponible === false;
    }

    if (
      state.filters.status === "inactive"
    ) {
      matchesStatus =
        product.activo === false;
    }

    return (
      matchesSearch &&
      matchesCategory &&
      matchesStatus
    );
  }

  /**
   * Genera tarjeta administrativa.
   *
   * @param {object} product
   * @returns {string}
   */
  function createProductCard(product) {
    const utils =
      window.toscanaUtils;

    const statusLabel =
      !product.activo
        ? "Inactivo"
        : product.disponible
          ? "Disponible"
          : "Agotado";

    const statusClass =
      !product.activo
        ? "status-cancelado"
        : product.disponible
          ? "status-listo"
          : "status-pendiente";

    const imageHTML =
      product.imagen_url
        ? `
          <img
            class="product-admin-image"
            src="${utils.escapeHTML(
              product.imagen_url
            )}"
            alt="${utils.escapeHTML(
              product.nombre
            )}"
            loading="lazy"
          >
        `
        : `
          <div class="product-admin-image product-admin-image-empty">
            Sin imagen
          </div>
        `;

    return `
      <article
        class="product-admin-card"
        data-product-id="${utils.escapeHTML(
          product.producto_id
        )}"
      >
        ${imageHTML}

        <div class="product-admin-content">
          <div class="product-admin-header">
            <div>
              <span class="product-admin-category">
                ${utils.escapeHTML(
                  product.categoria_nombre ||
                  "Sin categoría"
                )}
              </span>

              <h3>
                ${utils.escapeHTML(
                  product.nombre
                )}
              </h3>
            </div>

            <span
              class="status-badge ${statusClass}"
            >
              ${statusLabel}
            </span>
          </div>

          <p class="product-admin-description">
            ${utils.escapeHTML(
              product.descripcion ||
              "Sin descripción"
            )}
          </p>

          <strong class="product-admin-price">
            ${utils.money(
              product.precio
            )}
          </strong>
        </div>

        <footer class="product-admin-actions">
          <button
            type="button"
            class="secondary-button"
            data-edit-product="${utils.escapeHTML(
              product.producto_id
            )}"
          >
            Editar
          </button>

          <button
            type="button"
            class="secondary-button"
            data-toggle-availability="${utils.escapeHTML(
              product.producto_id
            )}"
          >
            ${
              product.disponible
                ? "Marcar agotado"
                : "Marcar disponible"
            }
          </button>

          <button
            type="button"
            class="secondary-button"
            data-toggle-active="${utils.escapeHTML(
              product.producto_id
            )}"
          >
            ${
              product.activo
                ? "Desactivar"
                : "Activar"
            }
          </button>
        </footer>
      </article>
    `;
  }

  /**
   * Registra eventos de tarjetas.
   *
   * @param {HTMLElement} container
   */
  function attachProductCardEvents(container) {
    container
      .querySelectorAll(
        "[data-edit-product]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            openEditProductDialog(
              button.dataset.editProduct
            );
          }
        );
      });

    container
      .querySelectorAll(
        "[data-toggle-availability]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            await toggleAvailability(
              button.dataset
                .toggleAvailability
            );
          }
        );
      });

    container
      .querySelectorAll(
        "[data-toggle-active]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            await toggleActiveState(
              button.dataset.toggleActive
            );
          }
        );
      });
  }

  /**
   * Abre formulario para nuevo producto.
   */
  function openNewProductDialog() {
    resetProductForm();

    window.toscanaUtils.setText(
      "#product-dialog-title",
      "Nuevo producto"
    );

    const dialog = document.querySelector(
      "#product-dialog"
    );

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  /**
   * Abre formulario para editar.
   *
   * @param {string|number} productId
   */
  function openEditProductDialog(productId) {
    const product = state.products.find(
      (item) =>
        String(item.producto_id) ===
        String(productId)
    );

    if (!product) {
      state.callbacks.showMessage(
        "No se encontró el producto seleccionado."
      );

      return;
    }

    resetProductForm();

    setInputValue(
      "#product-id",
      product.producto_id
    );

    setInputValue(
      "#product-name",
      product.nombre
    );

    setInputValue(
      "#product-category",
      product.categoria_id || ""
    );

    setInputValue(
      "#product-price",
      Number(product.precio || 0).toFixed(2)
    );

    setInputValue(
      "#product-image-url",
      product.imagen_url || ""
    );

    setInputValue(
      "#product-description",
      product.descripcion || ""
    );

    setCheckboxValue(
      "#product-available",
      product.disponible
    );

    setCheckboxValue(
      "#product-active",
      product.activo
    );

    window.toscanaUtils.setText(
      "#product-dialog-title",
      "Editar producto"
    );

    const dialog = document.querySelector(
      "#product-dialog"
    );

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  /**
   * Guarda producto.
   *
   * @param {SubmitEvent} event
   * @returns {Promise<void>}
   */
  async function saveProduct(event) {
    event.preventDefault();

    if (state.saving) {
      return;
    }

    clearProductFormMessage();

    const productId =
      getInputValue("#product-id");

    const name =
      getInputValue("#product-name");

    const categoryId =
      getInputValue("#product-category");

    const priceText =
      getInputValue("#product-price");

    const description =
      getInputValue(
        "#product-description"
      );

    const imageUrl =
      getInputValue(
        "#product-image-url"
      );

    const available =
      getCheckboxValue(
        "#product-available"
      );

    const active =
      getCheckboxValue(
        "#product-active"
      );

    const price =
      Number(priceText);

    if (!name) {
      showProductFormMessage(
        "El nombre del producto es obligatorio."
      );

      return;
    }

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      showProductFormMessage(
        "Ingresa un precio válido."
      );

      return;
    }

    state.saving = true;

    const saveButton =
      document.querySelector(
        "#save-product-button"
      );

    window.toscanaUtils.setButtonLoading(
      saveButton,
      true,
      "Guardando…"
    );

    try {
      const {
        data,
        error
      } = await window.toscanaSupabase.rpc(
        "guardar_producto",
        {
          p_producto_id:
            productId
              ? Number(productId)
              : null,
          p_categoria_id:
            categoryId
              ? Number(categoryId)
              : null,
          p_nombre: name,
          p_descripcion:
            description || null,
          p_precio: price,
          p_imagen_url:
            imageUrl || null,
          p_disponible: available,
          p_activo: active
        }
      );

      if (error) {
        console.error(
          "Error al guardar producto:",
          error
        );

        throw new Error(
          error.message ||
          "No fue posible guardar el producto."
        );
      }

      closeProductDialog();

      state.callbacks.showMessage(
        data?.mensaje ||
        "Producto guardado correctamente."
      );

      await refresh();
    } catch (error) {
      console.error(
        "Error operativo al guardar producto:",
        error
      );

      showProductFormMessage(
        error?.message ||
        "No fue posible guardar el producto."
      );
    } finally {
      state.saving = false;

      window.toscanaUtils.setButtonLoading(
        saveButton,
        false,
        "Guardar producto"
      );
    }
  }

  /**
   * Cambia disponibilidad.
   *
   * @param {string|number} productId
   * @returns {Promise<void>}
   */
  async function toggleAvailability(productId) {
    const product = state.products.find(
      (item) =>
        String(item.producto_id) ===
        String(productId)
    );

    if (!product) {
      return;
    }

    const nextValue =
      !product.disponible;

    const confirmed = window.confirm(
      nextValue
        ? `¿Marcar "${product.nombre}" como disponible?`
        : `¿Marcar "${product.nombre}" como agotado?`
    );

    if (!confirmed) {
      return;
    }

    await changeProductState({
      productId,
      available: nextValue,
      active: null
    });
  }

  /**
   * Cambia estado activo.
   *
   * @param {string|number} productId
   * @returns {Promise<void>}
   */
  async function toggleActiveState(productId) {
    const product = state.products.find(
      (item) =>
        String(item.producto_id) ===
        String(productId)
    );

    if (!product) {
      return;
    }

    const nextValue =
      !product.activo;

    const confirmed = window.confirm(
      nextValue
        ? `¿Activar "${product.nombre}"?`
        : `¿Desactivar "${product.nombre}" y ocultarlo del menú?`
    );

    if (!confirmed) {
      return;
    }

    await changeProductState({
      productId,
      available: null,
      active: nextValue
    });
  }

  /**
   * Ejecuta cambio de estado.
   *
   * @param {object} options
   * @returns {Promise<void>}
   */
  async function changeProductState({
    productId,
    available,
    active
  }) {
    state.callbacks.clearMessage();

    try {
      const {
        data,
        error
      } = await window.toscanaSupabase.rpc(
        "cambiar_estado_producto",
        {
          p_producto_id:
            Number(productId),
          p_disponible:
            available,
          p_activo:
            active
        }
      );

      if (error) {
        console.error(
          "Error al cambiar estado del producto:",
          error
        );

        throw new Error(
          error.message ||
          "No fue posible cambiar el estado del producto."
        );
      }

      state.callbacks.showMessage(
        data?.mensaje ||
        "Estado del producto actualizado."
      );

      await refresh();
    } catch (error) {
      console.error(
        "Error operativo en producto:",
        error
      );

      state.callbacks.showMessage(
        error?.message ||
        "No fue posible actualizar el producto."
      );
    }
  }

  /**
   * Cierra el formulario.
   */
  function closeProductDialog() {
    const dialog = document.querySelector(
      "#product-dialog"
    );

    if (dialog?.open) {
      dialog.close();
    }

    resetProductForm();
  }

  /**
   * Limpia formulario.
   */
  function resetProductForm() {
    const form = document.querySelector(
      "#product-form"
    );

    if (form) {
      form.reset();
    }

    setInputValue(
      "#product-id",
      ""
    );

    setCheckboxValue(
      "#product-available",
      true
    );

    setCheckboxValue(
      "#product-active",
      true
    );

    clearProductFormMessage();
  }

  /**
   * Obtiene valor de input.
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
   * Asigna valor a input.
   *
   * @param {string} selector
   * @param {unknown} value
   */
  function setInputValue(
    selector,
    value
  ) {
    const element =
      document.querySelector(selector);

    if (element) {
      element.value =
        String(value ?? "");
    }
  }

  /**
   * Obtiene valor checkbox.
   *
   * @param {string} selector
   * @returns {boolean}
   */
  function getCheckboxValue(selector) {
    const element =
      document.querySelector(selector);

    return Boolean(
      element?.checked
    );
  }

  /**
   * Asigna valor checkbox.
   *
   * @param {string} selector
   * @param {unknown} value
   */
  function setCheckboxValue(
    selector,
    value
  ) {
    const element =
      document.querySelector(selector);

    if (element) {
      element.checked =
        Boolean(value);
    }
  }

  /**
   * Muestra mensaje del formulario.
   *
   * @param {string} message
   */
  function showProductFormMessage(message) {
    const element =
      document.querySelector(
        "#product-form-message"
      );

    if (!element) {
      return;
    }

    element.textContent = message;
    element.hidden = false;
  }

  /**
   * Limpia mensaje del formulario.
   */
  function clearProductFormMessage() {
    const element =
      document.querySelector(
        "#product-form-message"
      );

    if (!element) {
      return;
    }

    element.textContent = "";
    element.hidden = true;
  }

  /**
   * Limpia el estado interno.
   */
  function destroy() {
    state.initialized = false;
    state.loading = false;
    state.saving = false;
    state.products = [];
    state.categories = [];

    state.filters = {
      search: "",
      categoryId: "",
      status: ""
    };

    state.callbacks = {
      showMessage: null,
      clearMessage: null
    };
  }

  /**
   * Muestra mensaje global por defecto.
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

  window.toscanaProductsModule =
    Object.freeze({
      initialize,
      refresh,
      destroy,

      getProducts() {
        return [...state.products];
      },

      isInitialized() {
        return state.initialized;
      }
    });
})();
