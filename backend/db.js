import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool, types } = pkg;

// Return date columns (OID 1082) as strings instead of JavaScript Date objects
// so JSON serailization doesn't convert them to UTC.
types.setTypeParser(1082, (val) => val);

const pool = new Pool ({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

pool.on('connect', () => {
    console.log('Connected to NEON Postgreas')
});

pool.on('error', (err) => {
    console.error('Unexpected Postgres error ', err);
    process.exit(-1);
});

export default  pool;
