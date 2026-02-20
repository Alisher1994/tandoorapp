const pool = require('./connection');

async function check() {
    try {
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'restaurants'");
        console.log('Columns in restaurants:');
        res.rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type}`));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
