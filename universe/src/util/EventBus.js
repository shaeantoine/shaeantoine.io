const listeners = new Map();

/** @param {string} event @param {(payload: any) => void} handler @returns unsubscribe fn */
export function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => off(event, handler);
}

export function off(event, handler) {
    listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
    listeners.get(event)?.forEach((handler) => handler(payload));
}
