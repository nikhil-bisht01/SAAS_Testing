const { pool } = require("../config");

const createTables = async () => {
    const client = await pool.connect();
    try {
        const createTablesQuery = `

            -- Drop tables if they exist
            DROP TABLE IF EXISTS access_logs;
            DROP TABLE IF EXISTS docflow;
            DROP TABLE IF EXISTS document_versions;
            DROP TABLE IF EXISTS document;
            DROP TABLE IF EXISTS doctype;
            DROP TABLE IF EXISTS service;


            CREATE OR REPLACE FUNCTION update_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Service Table
    CREATE TABLE IF NOT EXISTS service (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Doctype Table
    CREATE TABLE IF NOT EXISTS doctype (
    id SERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES service(id) ON DELETE CASCADE,
    doctype VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_doctype_name UNIQUE (doctype, name) -- Composite unique constraint
);

    CREATE OR REPLACE TRIGGER update_doctype_timestamp
    BEFORE UPDATE ON doctype
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

    -- Document Table
    CREATE TABLE IF NOT EXISTS document (
    id SERIAL PRIMARY KEY,
    doctype_id INTEGER REFERENCES doctype(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    document_name VARCHAR(255) NOT NULL,
    document_no VARCHAR(50) UNIQUE NOT NULL,
    path TEXT NOT NULL,
    visibility BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


    CREATE OR REPLACE TRIGGER update_document_timestamp
    BEFORE UPDATE ON document
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

    -- Document Versions Table
    CREATE TABLE IF NOT EXISTS document_versions (
        id SERIAL PRIMARY KEY,
        document_id INTEGER REFERENCES document(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        path TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_document_version UNIQUE (document_id, version)
    );

    CREATE OR REPLACE TRIGGER update_document_versions_timestamp
    BEFORE UPDATE ON document_versions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

    -- Docflow Table
    CREATE TABLE IF NOT EXISTS docflow (
        id SERIAL PRIMARY KEY,
        document_id INTEGER REFERENCES document(id) ON DELETE CASCADE,
        action VARCHAR(20) CHECK (action IN ('Submit', 'Approve', 'Reject')),
        user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
        status VARCHAR(20) CHECK (status IN ('Pending', 'Completed')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Access Logs Table
    CREATE TABLE IF NOT EXISTS access_logs (
        id SERIAL PRIMARY KEY,
        document_id INTEGER REFERENCES document(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
        action VARCHAR(20) CHECK (action IN ('View', 'Edit', 'Download')),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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