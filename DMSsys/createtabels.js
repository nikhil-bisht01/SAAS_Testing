const { pool } = require("../config");

// const createTables = async () => {
//     const client = await pool.connect();
//     try {
//         const DMSTablesQuery = `
     
//     -- Service Table
//     CREATE TABLE IF NOT EXISTS DMS_service (
//         id SERIAL PRIMARY KEY,
//         name VARCHAR(255) UNIQUE NOT NULL,
//         description TEXT,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );

//     -- Doctype Table
//     CREATE TABLE IF NOT EXISTS DMS_doctype (
//     id SERIAL PRIMARY KEY,
//     doctype VARCHAR(50) UNIQUE NOT NULL,
//     description TEXT,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

  
//     CREATE TABLE IF NOT EXISTS DMS_allow_doc (
//     id SERIAL PRIMARY KEY,
//     doc_name VARCHAR(50) UNIQUE NOT NULL,
//     description TEXT,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

  
//     CREATE TABLE IF NOT EXISTS DMS_publish (
//     id SERIAL PRIMARY KEY,
//     service_id INTEGER NOT NULL REFERENCES DMS_service(id) ON DELETE CASCADE ,
//     doctype_id INTEGER NOT NULL REFERENCES DMS_doctype(id) ON DELETE CASCADE,
//     allow_doc_id INTEGER NOT NULL REFERENCES DMS_allow_doc(id) ON DELETE CASCADE,
//     format TEXT[], -- change here
//     allowed_size INTEGER,
//     review TEXT,
//     approval_needed BOOLEAN DEFAULT FALSE,
//     workflow_id INT REFERENCES workflowmodule(workflow_id) ON DELETE SET NULL, 
//     visibility BOOLEAN DEFAULT TRUE,
//     UNIQUE(service_id,doctype_id,allow_doc_id),
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );

//     CREATE TABLE IF NOT EXISTS document (
//     id SERIAL PRIMARY KEY,
//     publish_id INTEGER REFERENCES DMS_publish(id) ON DELETE CASCADE,
//     user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
//     document_name VARCHAR(255) NOT NULL,
//     path TEXT NOT NULL,
//     visibility BOOLEAN DEFAULT TRUE,
//     status VARCHAR(20) CHECK (status IN ('Pending','Send For Approval', 'Approved','Reject','Resubmit')) DEFAULT 'Pending' NOT NULL,
//     ref_no BIGINT,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//    );

//         CREATE OR REPLACE FUNCTION update_updated_at_column()
//         RETURNS TRIGGER AS $$
//         BEGIN
//         NEW.updated_at = CURRENT_TIMESTAMP;
//         RETURN NEW;
//         END;
//         $$ language 'plpgsql';

//         CREATE TRIGGER set_updated_at
//         BEFORE UPDATE ON document
//         FOR EACH ROW
//         EXECUTE PROCEDURE update_updated_at_column();
        
//             `;

//         await client.query(DMSTablesQuery);
//         console.log("Tables and triggers created successfully.");

//         return { success: true }; // Ensure this is returned
//     } catch (error) {
//         console.error("Error creating tables and triggers:", error.message, error.stack);
//         return { success: false, errors: error.message }; // Return error details
//     } finally {
//         client.release();
//     }
// };


const createTables = async (schema) => {
  const client = await pool.connect();
  try {
    const DMSTablesQuery = `
    CREATE TABLE IF NOT EXISTS ${schema}.DMS_service (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${schema}.DMS_doctype (
      id SERIAL PRIMARY KEY,
      doctype VARCHAR(50) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${schema}.DMS_allow_doc (
      id SERIAL PRIMARY KEY,
      doc_name VARCHAR(50) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    DROP TABLE IF EXISTS ${schema}.DMS_publish CASCADE;
    CREATE TABLE IF NOT EXISTS ${schema}.DMS_publish (
      id SERIAL PRIMARY KEY,
      service_id INTEGER NOT NULL REFERENCES ${schema}.DMS_service(id) ON DELETE CASCADE,
      doctype_id INTEGER NOT NULL REFERENCES ${schema}.DMS_doctype(id) ON DELETE CASCADE,
      allow_doc_id INTEGER NOT NULL REFERENCES ${schema}.DMS_allow_doc(id) ON DELETE CASCADE,
      format TEXT[],
      allowed_size INTEGER,
      review TEXT,
      approval_needed BOOLEAN DEFAULT FALSE,
      workflow_id INT REFERENCES workflowmodule(workflow_id) ON DELETE SET NULL,
      visibility BOOLEAN DEFAULT TRUE,
      UNIQUE(service_id, doctype_id, allow_doc_id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    DROP TABLE IF EXISTS ${schema}.document CASCADE;
    CREATE TABLE IF NOT EXISTS ${schema}.document (
      id SERIAL PRIMARY KEY,
      publish_id INTEGER REFERENCES ${schema}.DMS_publish(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      document_name VARCHAR(255) NOT NULL,
      path TEXT NOT NULL,
      visibility BOOLEAN DEFAULT TRUE,
      status VARCHAR(20) CHECK (status IN ('Pending','Send For Approval', 'Approved','Reject','Resubmit')) DEFAULT 'Pending' NOT NULL,
      ref_no BIGINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE OR REPLACE FUNCTION ${schema}.update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON ${schema}.document
    FOR EACH ROW
    EXECUTE PROCEDURE ${schema}.update_updated_at_column();
    `;

    await client.query(DMSTablesQuery);
    console.log("Tables and triggers created successfully.");
    return { success: true };
  } catch (error) {
    console.error("Error creating tables and triggers:", error.message);
    return { success: false, errors: error.message };
  } finally {
    client.release();
  }
};

 module.exports = createTables;