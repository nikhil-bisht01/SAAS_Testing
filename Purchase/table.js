const { pool } = require("../config");


// -- ✅ Drop Tables in Reverse Order to Avoid FK Conflicts
// DROP TABLE IF EXISTS goods_received_notes CASCADE;
// DROP TABLE IF EXISTS purchase_orders CASCADE;
// DROP TABLE IF EXISTS quotations CASCADE;
// DROP TABLE IF EXISTS suppliers CASCADE;
// DROP TABLE IF EXISTS indenting CASCADE;
// DROP TABLE IF EXISTS budget CASCADE;
// DROP TABLE IF EXISTS budget_user_workflow CASCADE;
// DROP TABLE IF EXISTS budget_workflow CASCADE;
// DROP TABLE IF EXISTS Purchase_Approval_Groups CASCADE;


const createTables = async () => {
  const client = await pool.connect();
  try {
    const createTablesQuery = `

      CREATE TABLE IF NOT EXISTS budget (
        id SERIAL PRIMARY KEY,
        budget_name VARCHAR(50) UNIQUE NOT NULL,
        dept_id INTEGER REFERENCES departments(dept_id) ON DELETE SET NULL,
        budget NUMERIC NOT NULL,
        user_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS budget_workflow (
        workflowId SERIAL PRIMARY KEY,
        workflowname VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_by INT NOT NULL,
        budget_ids INT[] NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS budget_user_workflow (
        id SERIAL PRIMARY KEY,
        userid INT NOT NULL,
        workflowid INT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userid) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (workflowid) REFERENCES budget_workflow(workflowId) ON DELETE CASCADE,
        UNIQUE (userid, workflowid) -- Ensures a user is assigned to a workflow only once
      );

      CREATE TABLE IF NOT EXISTS Purchase_Approval_Groups (
        id SERIAL PRIMARY KEY,
        group_name TEXT NOT NULL,
        workflowid INT REFERENCES budget_workflow(workflowId) ON DELETE CASCADE NOT NULL,
        action TEXT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (group_name, workflowid, action)
    );

        CREATE TABLE IF NOT EXISTS indenting (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
          dept_id INTEGER REFERENCES departments(dept_id) ON DELETE SET NULL,
          asset_name TEXT NOT NULL,
          quantity FLOAT NOT NULL,
          request_for TEXT,
          category TEXT,
          uom TEXT,
          status VARCHAR(20) CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Resubmitted')) DEFAULT 'Pending',
          workflow_id INT REFERENCES budget_workflow(workflowId) ON DELETE SET NULL, -- New column added
          budget_id INT REFERENCES budget(id) NOT NULL,
          rfp_id VARCHAR(20) UNIQUE, 
          remarks TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rfp_info (
          id SERIAL PRIMARY KEY,
          rfp_id VARCHAR(20) REFERENCES indenting(rfp_id) ON DELETE CASCADE,
          organization_name TEXT NOT NULL,
          logo_file_link TEXT,
          title TEXT ,
          rfp_start_date DATE ,
          rfp_end_date DATE ,
          upload_file_link TEXT,
          rfp_file_link TEXT,
          additional_description JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

          CREATE TABLE IF NOT EXISTS default_rfp_details (
             id SERIAL PRIMARY KEY,
             Organization_name TEXT NOT NULL UNIQUE,
             Organization_address TEXT,
             Organization_logo_url TEXT,
             Organization_logo TEXT,
             created_at TIMESTAMP DEFAULT NOW(),
             updated_at TIMESTAMP DEFAULT NOW()
);



       CREATE TABLE IF NOT EXISTS suppliers (
          id SERIAL PRIMARY KEY,
          supplier_name VARCHAR(100) NOT NULL,
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
          lead VARCHAR(50),
          workflow_id INTEGER NOT NULL,
          current_stage VARCHAR(100),
          status VARCHAR(20) CHECK (status IN ('Active', 'Inactive')) DEFAULT 'Active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );


        CREATE TABLE IF NOT EXISTS supplier_contacts (
          contact_id SERIAL PRIMARY KEY,
          supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
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
          category_type VARCHAR(50),  
          category VARCHAR(50),       
          asset_name VARCHAR(100),   
          date_of_start TEXT,
          date_of_end TEXT,
          status VARCHAR(10) CHECK (status IN ('active', 'inactive')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS supplier_Approval_Groups (
        id SERIAL PRIMARY KEY,
        group_name TEXT NOT NULL,
        workflowid INT REFERENCES budget_workflow(workflowId) ON DELETE CASCADE NOT NULL,
        action TEXT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (group_name, workflowid, action)
    );


        CREATE TABLE IF NOT EXISTS quotations (
            id SERIAL PRIMARY KEY,
            purchase_request_id INT REFERENCES indenting(id) ON DELETE CASCADE,
            supplier_id INT REFERENCES suppliers(id) ON DELETE CASCADE,
            quotation_url TEXT UNIQUE NOT NULL,

            -- Procurement (Sender) Fields
            rfq_delivery_time TEXT NOT NULL,
            rfq_terms_conditions TEXT,

            -- Supplier Response Fields
            supplier_price DECIMAL(10,2),
            supplier_delivery_time TEXT,
            supplier_terms_conditions TEXT,
            supplier_remarks TEXT,

            -- Status Tracking
            status VARCHAR(20) CHECK (status IN ('pending', 'submitted', 'selected', 'rejected','accepted' )) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (purchase_request_id,supplier_id)
        );

        CREATE TABLE IF NOT EXISTS quotation_messages (
          id SERIAL PRIMARY KEY,
          quotation_id INT REFERENCES quotations(id) ON DELETE CASCADE,
          sender_role VARCHAR(20) CHECK (sender_role IN ('user', 'supplier')) NOT NULL,
          message JSONB NOT NULL,
          attachment_url TEXT,
          status VARCHAR(10) CHECK (status IN ('accepted', 'revise', 'rejected')) DEFAULT 'revise',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

        CREATE TABLE IF NOT EXISTS purchase_orders (
          id SERIAL PRIMARY KEY,
          quotation_id INT REFERENCES quotations(id) ON DELETE CASCADE,
          purchase_team_id INT REFERENCES users(user_id) ON DELETE SET NULL,
          status VARCHAR(20) CHECK (status IN ('sent_to_supplier', 'supplier_accepted', 'supplier_rejected')) DEFAULT 'sent_to_supplier',
          remarks TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS goods_received_notes (
          id SERIAL PRIMARY KEY,
          purchase_order_id INT REFERENCES indenting(id) ON DELETE CASCADE,
          received_by INT REFERENCES users(user_id) ON DELETE SET NULL,
          finance_approved BOOLEAN DEFAULT FALSE,
          user_confirmed BOOLEAN DEFAULT FALSE,
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
