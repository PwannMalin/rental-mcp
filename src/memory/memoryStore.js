export class MemoryStore {
    constructor() {
        this.userMemory = new Map();
    }

    getUserKey(userId, tenantId) {
        return `${tenantId}:${userId}`;
    }

    get(userId, tenantId) {
        const key = this.getUserKey(userId, tenantId);

        if (!this.userMemory.has(key)) {
            this.userMemory.set(key, {
                customers: [],
                rentals: [],
                lastActions: [],
                context: {}
            });
        }

        return this.userMemory.get(key);
    }

    update(userId, tenantId, updateFn) {
        const memory = this.get(userId, tenantId);
        updateFn(memory);
        return memory;
    }

    addCustomer(userId, tenantId, customer) {
        return this.update(userId, tenantId, (m) => {
            m.customers.unshift({
                ...customer,
                timestamp: new Date().toISOString()
            });

            m.customers = m.customers.slice(0, 20); // cap memory
        });
    }

    addRental(userId, tenantId, rental) {
        return this.update(userId, tenantId, (m) => {
            m.rentals.unshift({
                ...rental,
                timestamp: new Date().toISOString()
            });

            m.rentals = m.rentals.slice(0, 20);
        });
    }

    addAction(userId, tenantId, action) {
        return this.update(userId, tenantId, (m) => {
            m.lastActions.unshift({
                action,
                timestamp: new Date().toISOString()
            });

            m.lastActions = m.lastActions.slice(0, 30);
        });
    }
}