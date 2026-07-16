"use strict";

/**
 * Utilidades compartidas del panel administrativo.
 *
 * Este archivo no consulta Supabase ni controla vistas.
 * Únicamente proporciona funciones reutilizables para todos los módulos.
 */

(function initializeToscanaUtils() {
  /**
   * Escapa un valor antes de insertarlo dentro de HTML.
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

  /**
   * Escapa un valor utilizado dentro de un selector CSS.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function escapeSelector(value) {
    const normalizedValue = String(value ?? "");

    if (window.CSS?.escape) {
      return window.CSS.escape(normalizedValue);
    }

    return normalizedValue.replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    );
  }

  /**
   * Convierte un valor numérico a formato monetario en dólares.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function money(value) {
    const numericValue = Number(value || 0);

    return new Intl.NumberFormat("es-EC", {
      style: "currency",
      currency: "USD"
    }).format(
      Number.isFinite(numericValue)
        ? numericValue
        : 0
    );
  }

  /**
   * Convierte identificadores técnicos a texto legible.
   *
   * Ejemplo:
   * en_preparacion -> En Preparacion
   *
   * @param {unknown} value
   * @returns {string}
   */
  function pretty(value) {
    return String(value ?? "")
      .trim()
      .replaceAll("_", " ")
      .replace(
        /\b\w/g,
        (character) => character.toUpperCase()
      );
  }

  /**
   * Obtiene hasta dos iniciales de un nombre o correo.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function getInitials(value) {
    const text = String(value || "TG").trim();

    if (!text) {
      return "TG";
    }

    const initials = text
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();

    return initials || "TG";
  }

  /**
   * Calcula el tiempo transcurrido desde una fecha.
   *
   * @param {unknown} createdAt
   * @returns {string}
   */
  function getElapsedTime(createdAt) {
    if (!createdAt) {
      return "—";
    }

    const createdDate = new Date(createdAt);

    if (Number.isNaN(createdDate.getTime())) {
      return "—";
    }

    const difference = Date.now() - createdDate.getTime();

    const totalMinutes = Math.max(
      0,
      Math.floor(difference / 60000)
    );

    if (totalMinutes < 1) {
      return "Ahora";
    }

    if (totalMinutes < 60) {
      return `${totalMinutes} min`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (minutes === 0) {
      return `${hours} h`;
    }

    return `${hours} h ${minutes} min`;
  }

  /**
   * Formatea una fecha con configuración regional de Ecuador.
   *
   * @param {unknown} value
   * @param {Intl.DateTimeFormatOptions} [options]
   * @returns {string}
   */
  function formatDate(value, options = {}) {
    const date = value
      ? new Date(value)
      : new Date();

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    const defaultOptions = {
      year: "numeric",
      month: "long",
      day: "numeric"
    };

    return new Intl.DateTimeFormat(
      "es-EC",
      {
        ...defaultOptions,
        ...options
      }
    ).format(date);
  }

  /**
   * Determina la ubicación resumida de un pedido.
   *
   * @param {object} order
   * @returns {string}
   */
  function getOrderLocation(order = {}) {
    if (order.tipo === "mesa") {
      if (order.mesa_nombre) {
        return String(order.mesa_nombre);
      }

      if (order.mesa_numero) {
        return `Mesa ${order.mesa_numero}`;
      }

      if (order.mesa?.nombre) {
        return String(order.mesa.nombre);
      }

      if (order.mesa?.numero) {
        return `Mesa ${order.mesa.numero}`;
      }

      return "Mesa";
    }

    return pretty(order.tipo) || "Sin ubicación";
  }

  /**
   * Cambia el estado visual de un botón.
   *
   * @param {HTMLButtonElement|null} button
   * @param {boolean} loading
   * @param {string} text
   */
  function setButtonLoading(button, loading, text) {
    if (!button) {
      return;
    }

    button.disabled = Boolean(loading);
    button.textContent = text;
  }

  /**
   * Asigna contenido de texto a un elemento.
   *
   * @param {string} selector
   * @param {unknown} value
   */
  function setText(selector, value) {
    const element = document.querySelector(selector);

    if (!element) {
      return;
    }

    element.textContent = String(value ?? "");
  }

  /**
   * Devuelve un arreglo seguro.
   *
   * @param {unknown} value
   * @returns {Array}
   */
  function toArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  /**
   * Espera una cantidad determinada de milisegundos.
   *
   * @param {number} milliseconds
   * @returns {Promise<void>}
   */
  function wait(milliseconds) {
    const delay = Number(milliseconds);

    return new Promise((resolve) => {
      window.setTimeout(
        resolve,
        Number.isFinite(delay) && delay > 0
          ? delay
          : 0
      );
    });
  }

  /**
   * Genera un identificador sencillo para elementos temporales.
   *
   * @param {string} prefix
   * @returns {string}
   */
  function createId(prefix = "toscana") {
    const randomPart = Math.random()
      .toString(36)
      .slice(2, 10);

    const timestamp = Date.now().toString(36);

    return `${prefix}-${timestamp}-${randomPart}`;
  }

  /**
   * Comprueba si un objeto tiene una propiedad propia.
   *
   * @param {object} object
   * @param {string} property
   * @returns {boolean}
   */
  function hasOwn(object, property) {
    return Object.prototype.hasOwnProperty.call(
      object,
      property
    );
  }

  window.toscanaUtils = Object.freeze({
    escapeHTML,
    escapeSelector,
    money,
    pretty,
    getInitials,
    getElapsedTime,
    formatDate,
    getOrderLocation,
    setButtonLoading,
    setText,
    toArray,
    wait,
    createId,
    hasOwn
  });
})();
