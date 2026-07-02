import { EventEmitter } from "events";

const bus = new EventEmitter();
bus.setMaxListeners(500);

export const notificationBus = bus;

export function emitNotificationChange(payload = {}) {
  bus.emit("change", { ts: Date.now(), ...payload });
}
