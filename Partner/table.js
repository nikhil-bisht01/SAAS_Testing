const { pool } = require("../config");


//DROP TABLE IF EXISTS Main_customers CASCADE;

const createTables = async () => {
    const client = await pool.connect();
    try {
        const createTablesQuery = `

                CREATE TABLE IF NOT EXISTS partners (
            partner_id SERIAL PRIMARY KEY,
            partner_name VARCHAR(100) NOT NULL,
            gst_number VARCHAR(15),
            landline_num VARCHAR(15) UNIQUE NOT NULL,
            email_id VARCHAR(100) UNIQUE NOT NULL,
            pan_no VARCHAR(10) UNIQUE,
            tan_number VARCHAR(15) UNIQUE,
            address TEXT,
            city VARCHAR(50),
            state VARCHAR(50),
            country VARCHAR(50),
            pincode VARCHAR(10),
            website VARCHAR(255),
            status VARCHAR(20) CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

            CREATE TABLE IF NOT EXISTS partner_contacts (
            contact_id SERIAL PRIMARY KEY,
            partner_id INTEGER REFERENCES partners(partner_id) ON DELETE CASCADE,
            contact_person VARCHAR(100) NOT NULL,
            phone_num VARCHAR(15) UNIQUE,
            email_id VARCHAR(100) UNIQUE,
            address TEXT,
            city VARCHAR(50) NOT NULL,
            state VARCHAR(50) NOT NULL,
            country VARCHAR(50) NOT NULL,
            pincode VARCHAR(10) NOT NULL,
            department VARCHAR(100) NOT NULL,
            designation VARCHAR(100),
            date_of_start DATE,
            date_of_end DATE,
            status VARCHAR(10) CHECK (status IN ('active', 'inactive')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
