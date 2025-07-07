require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    //connectionString: 'postgresql://higherindia_backend_rlnw_user:a1L9MWheQ3eobbyOS7OL2G7QvwZDdqTO@dpg-croff0q3esus73c0mmm0-a.singapore-postgres.render.com/higherindia_backend_rlnw', // This should point to your database URL
    connectionString: process.env.String,
  
  ssl: {
    rejectUnauthorized: false, // Required for most managed databases, including Render
  }
});

module.exports = { pool };