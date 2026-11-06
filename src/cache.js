export class Cache {
  constructor(limit = 250) { this.limit = limit; this.items = new Map(); this.pending = new Map(); }
  get(key) {
    const item = this.items.get(key);
    if (!item || item.until <= Date.now()) { this.items.delete(key); return undefined; }
    return item.value;
  }
  set(key, value, ttl) {
    this.items.delete(key);
    this.items.set(key, { value, until: Date.now() + ttl });
    while (this.items.size > this.limit) this.items.delete(this.items.keys().next().value);
    return value;
  }
  async use(key, ttl, loader) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = Promise.resolve().then(loader).then(value => this.set(key, value, typeof ttl === 'function' ? ttl(value) : ttl)).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
