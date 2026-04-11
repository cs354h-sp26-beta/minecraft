export class LruCache<K, V> {
  // Maybe there is a better number. Idk. This is a ballpark guess
  private static readonly capacity: number = 18;

  // Since the built-in `Map` remembers insertion order, we can just referesh kv pairs
  // on use, and then remove the last element if we exceed the capacity.
  //
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
  private cache: Map<K, V>;

  constructor() {
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= LruCache.capacity) {
      // Contains keys in insertion order.
      //
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys
      const oKey = this.cache.keys().next().value;
      this.cache.delete(oKey);
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }
}
