import test from "node:test";
import assert from "node:assert/strict";

import { getPool } from "../sql/sql.js";

test("getPool returns a pool when SQL env is configured", async () => {
    const hasRealSqlConfig = [process.env.SQL_SERVER, process.env.SQL_DATABASE, process.env.SQL_USER, process.env.SQL_PASSWORD]
        .filter(Boolean)
        .every(value => !/YOUR(server|database|user|password)/i.test(value));

    if (!hasRealSqlConfig) {
        test.skip();
        return;
    }

    const pool = await getPool();

    assert.ok(pool, "expected a SQL pool instance");
    await pool.close();
});