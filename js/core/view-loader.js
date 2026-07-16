"use strict";

/**
 * Carga una vista HTML dentro del contenedor principal del panel.
 *
 * @param {string} viewName Nombre del archivo sin extensión.
 * @returns {Promise<void>}
 */
async function loadView(viewName) {
  const container = document.querySelector("#view-container");

  if (!container) {
    throw new Error("No existe el contenedor #view-container.");
  }

  container.innerHTML = `
    <div class="view-loading">
      <p>Cargando módulo…</p>
    </div>
  `;

  try {
    const response = await fetch(`./views/${viewName}.html`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `No fue posible cargar la vista ${viewName}. Código HTTP: ${response.status}`
      );
    }

    container.innerHTML = await response.text();

    document.dispatchEvent(
      new CustomEvent("toscana:view-loaded", {
        detail: {
          view: viewName
        }
      })
    );
  } catch (error) {
    console.error("Error al cargar la vista:", error);

    container.innerHTML = `
      <section class="view-error">
        <h2>No fue posible cargar el módulo</h2>
        <p>${escapeViewText(error.message)}</p>
      </section>
    `;
  }
}

/**
 * Evita insertar directamente mensajes de error dentro del HTML.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeViewText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}

window.toscanaViewLoader = {
  load: loadView
};
