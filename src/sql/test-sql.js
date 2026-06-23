const { getPool } = require("./sql");

async function test() {
    try {
        const pool = await getPool();

        const result = await pool.request().query(`
            SELECT GETDATE() AS CurrentTime
        `);

        console.log(result.recordset);

        process.exit(0);

    } catch (err) {

        console.error("SQL ERROR:");
        console.error(err);

        process.exit(1);
    }
}

test();