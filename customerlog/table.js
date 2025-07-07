const { pool } = require("../config");


//DROP TABLE IF EXISTS Main_customers CASCADE;

const createTables = async () => {
    const client = await pool.connect();
    try {
        const createTablesQuery = `

        

        CREATE TABLE IF NOT EXISTS Main_customers (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(customer_id) ON DELETE CASCADE UNIQUE,
        customer_name VARCHAR(100) NOT NULL,
        phone_num VARCHAR(15) UNIQUE NOT NULL,
        email_id VARCHAR(100) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        validemail BOOLEAN DEFAULT false,
        validephone BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

       CREATE TABLE IF NOT EXISTS otp_verification (
        id SERIAL PRIMARY KEY,
        email_or_phone VARCHAR(255),
        phone VARCHAR(255),
        status BOOLEAN DEFAULT false,
        otp VARCHAR(4) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
        );

    CREATE TABLE IF NOT EXISTS queries (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id) ON DELETE CASCADE,
    service VARCHAR(255) NOT NULL,
    messages TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


      CREATE TABLE IF NOT EXISTS careers (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone_no TEXT NOT NULL,
            message TEXT,
            job_title TEXT,
            department TEXT,
            year_of_experience TEXT,
            ctc TEXT,
            resume BYTEA,
            resume_mime TEXT,
            email_verified BOOLEAN DEFAULT FALSE,
            source TEXT,
            status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS flagged_applications (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone_no TEXT NOT NULL,
                message TEXT,
                job_title TEXT,
                department TEXT,
                year_of_experience TEXT,
                ctc TEXT,
                resume BYTEA,
                resume_mime TEXT,
                email_verified BOOLEAN DEFAULT TRUE,
                status TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

        `;

        await client.query(createTablesQuery);
        console.log("Tables and triggers created successfully.");

        return { success: true }; // Ensure this is returned
    } catch (error) {
        console.error("Error creating tables and triggers:", error.message, error.stack);
        return { success: false, errors: error.message }; // Return error details
    } finally {
        client.release();
    }
};

module.exports = createTables;
