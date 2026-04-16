export class LruCache {
    constructor() {
        this.cache = new Map();
    }
    get(key) {
        if (!this.cache.has(key)) {
            return undefined;
        }
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        else if (this.cache.size >= LruCache.capacity) {
            const oldest = this.cache.keys().next();
            if (!oldest.done) {
                this.cache.delete(oldest.value);
            }
        }
        this.cache.set(key, value);
    }
    has(key) {
        return this.cache.has(key);
    }
}
// Maybe there is a better number. Idk. This is a ballpark guess
LruCache.capacity = 18;
//# sourceMappingURL=Cache.js.map