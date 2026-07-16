"use strict";

/**
 * Gestor compartido de Supabase Realtime para Toscana Grill.
 *
 * Objetivo:
 * - Mantener un único canal de escucha para la tabla public.pedidos.
 * - Evitar canales duplicados al cambiar entre módulos.
 * - Permitir que Dashboard, Pedidos, Cocina, Caja e Histórico
 *   se suscriban mediante callbacks simples.
 */

(function initializeRealtimeManager() {
  const state = {
    channel: null,
    status: "disconnected",
    subscribers: new Map(),
    nextSubscriberId: 1
  };

  /**
   * Valida las dependencias globales.
   */
  function validateDependencies() {
    if (!window.toscanaSupabase) {
      throw new Error(
        "Supabase no está disponible para el servicio Realtime."
      );
    }
  }

  /**
   * Inicia el canal compartido.
   *
   * Si ya existe un canal activo, no crea otro.
   *
   * @returns {Promise<void>}
   */
  async function connect() {
    validateDependencies();

    if (state.channel) {
      return;
    }

    state.status = "connecting";

    state.channel = window.toscanaSupabase
      .channel("toscana-pedidos-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pedidos"
        },
        handleDatabaseChange
      )
      .subscribe((status) => {
        state.status = normalizeStatus(status);

        if (status === "CHANNEL_ERROR") {
          console.error(
            "El canal Realtime de pedidos presentó un error."
          );
        }

        if (status === "TIMED_OUT") {
          console.error(
            "La conexión Realtime de pedidos agotó el tiempo de espera."
          );
        }

        notifyStatusSubscribers();
      });
  }

  /**
   * Normaliza el estado devuelto por Supabase.
   *
   * @param {string} status
   * @returns {string}
   */
  function normalizeStatus(status) {
    switch (status) {
      case "SUBSCRIBED":
        return "connected";

      case "CLOSED":
        return "disconnected";

      case "CHANNEL_ERROR":
        return "error";

      case "TIMED_OUT":
        return "timeout";

      default:
        return String(status || "unknown").toLowerCase();
    }
  }

  /**
   * Procesa cada cambio recibido desde PostgreSQL.
   *
   * @param {object} payload
   */
  function handleDatabaseChange(payload) {
    const event = {
      type: payload.eventType || null,
      table: payload.table || "pedidos",
      schema: payload.schema || "public",
      newRecord: payload.new || null,
      oldRecord: payload.old || null,
      receivedAt: new Date().toISOString()
    };

    state.subscribers.forEach((subscriber) => {
      if (subscriber.type !== "change") {
        return;
      }

      try {
        subscriber.callback(event);
      } catch (error) {
        console.error(
          "Error en un suscriptor Realtime:",
          error
        );
      }
    });
  }

  /**
   * Informa cambios de estado de conexión.
   */
  function notifyStatusSubscribers() {
    state.subscribers.forEach((subscriber) => {
      if (subscriber.type !== "status") {
        return;
      }

      try {
        subscriber.callback(state.status);
      } catch (error) {
        console.error(
          "Error en un suscriptor del estado Realtime:",
          error
        );
      }
    });
  }

  /**
   * Registra una función que será ejecutada cuando cambie un pedido.
   *
   * @param {Function} callback
   * @returns {Function} Función para cancelar la suscripción.
   */
  function subscribe(callback) {
    if (typeof callback !== "function") {
      throw new TypeError(
        "El suscriptor Realtime debe ser una función."
      );
    }

    const subscriberId = state.nextSubscriberId++;

    state.subscribers.set(subscriberId, {
      type: "change",
      callback
    });

    connect().catch((error) => {
      console.error(
        "No fue posible iniciar Realtime:",
        error
      );
    });

    return function unsubscribe() {
      state.subscribers.delete(subscriberId);
    };
  }

  /**
   * Registra una función para conocer el estado del canal.
   *
   * @param {Function} callback
   * @returns {Function}
   */
  function subscribeToStatus(callback) {
    if (typeof callback !== "function") {
      throw new TypeError(
        "El suscriptor de estado debe ser una función."
      );
    }

    const subscriberId = state.nextSubscriberId++;

    state.subscribers.set(subscriberId, {
      type: "status",
      callback
    });

    callback(state.status);

    connect().catch((error) => {
      console.error(
        "No fue posible iniciar Realtime:",
        error
      );
    });

    return function unsubscribe() {
      state.subscribers.delete(subscriberId);
    };
  }

  /**
   * Cierra completamente el canal.
   *
   * Normalmente solo se utilizará al cerrar sesión.
   *
   * @returns {Promise<void>}
   */
  async function disconnect() {
    if (!state.channel) {
      state.status = "disconnected";
      return;
    }

    try {
      await window.toscanaSupabase.removeChannel(
        state.channel
      );
    } catch (error) {
      console.error(
        "No fue posible cerrar el canal Realtime:",
        error
      );
    } finally {
      state.channel = null;
      state.status = "disconnected";
      notifyStatusSubscribers();
    }
  }

  /**
   * Devuelve el estado actual.
   *
   * @returns {string}
   */
  function getStatus() {
    return state.status;
  }

  /**
   * Indica si el canal está conectado.
   *
   * @returns {boolean}
   */
  function isConnected() {
    return state.status === "connected";
  }

  window.toscanaRealtime = Object.freeze({
    connect,
    disconnect,
    subscribe,
    subscribeToStatus,
    getStatus,
    isConnected
  });
})();
