import sql from "mssql";
import "dotenv/config";

const config = {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,

    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function getPool() {
    return await sql.connect(config);
}

export { getPool };