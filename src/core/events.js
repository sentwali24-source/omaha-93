// Tiny synchronous event bus. Handlers run in registration order.
// Event names and payloads are documented in ARCHITECTURE.md ("Events").
export class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(name, fn) {
    let list = this.handlers.get(name);
    if (!list) this.handlers.set(name, (list = []));
    list.push(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const off = this.on(name, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off(name, fn) {
    const list = this.handlers.get(name);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(name, payload) {
    const list = this.handlers.get(name);
    if (!list || list.length === 0) return;
    for (const fn of list.slice()) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] handler for "${name}" threw`, err);
      }
    }
  }
}
