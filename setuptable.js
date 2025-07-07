const { pool } = require('./config');  // Importing the pool directly from config.js

// DROP TABLE IF EXISTS departments CASCADE;
// DROP TABLE IF EXISTS location CASCADE;
// DROP TABLE IF EXISTS designation CASCADE;
// DROP TABLE IF EXISTS role CASCADE;
// DROP TABLE IF EXISTS domain CASCADE;

// DROP TABLE IF EXISTS contacts CASCADE;
// DROP TABLE IF EXISTS customers CASCADE;
// DROP TABLE IF EXISTS users CASCADE;
// DROP TABLE IF EXISTS api_access CASCADE;

// DROP TABLE IF EXISTS leave_balances CASCADE;
// DROP TABLE IF EXISTS leave_request CASCADE;
// DROP TABLE IF EXISTS leave_types CASCADE;
// DROP TABLE IF EXISTS leave_settings CASCADE;
// DROP TABLE IF EXISTS entries CASCADE;


// Function to create tables if they don't exist
// Function to create all necessary tables
// const createTables = async () => {
//   const client = await pool.connect();
//     try {
//         const createTablesQuery = `

       

//      CREATE TABLE IF NOT EXISTS departments (
//         dept_id SERIAL PRIMARY KEY,
//         dept_name VARCHAR(50) UNIQUE NOT NULL,
//         dept_data TEXT,
//         status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       );


//       CREATE TABLE IF NOT EXISTS sub_departments (
//         sub_id SERIAL PRIMARY KEY,
//         dept_id INTEGER REFERENCES departments(dept_id) ON DELETE CASCADE NOT NULL,
//         sub_dept_name VARCHAR(50) UNIQUE NOT NULL,
//         sub_data TEXT,
//         status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       );



//     CREATE TABLE IF NOT EXISTS location (
//       location_id SERIAL PRIMARY KEY,
//       locality VARCHAR(80) UNIQUE NOT NULL,
//       city VARCHAR(40) NOT NULL,
//       state VARCHAR(40) NOT NULL,
//       country VARCHAR(40) NOT NULL,
//       code VARCHAR(15) NOT NULL,
//       remarks Text,
//       status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
    
//     CREATE TABLE IF NOT EXISTS sub_location (
//      sub_location_id SERIAL PRIMARY KEY,
//      location_id INTEGER REFERENCES location(location_id) ON DELETE CASCADE NOT NULL,
//      building_no VARCHAR(40) NOT NULL,
//      floor VARCHAR(40),
//      room VARCHAR(40),
//      section VARCHAR(40),
//      description TEXT,
//      status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL,
//      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//      );


    
//     CREATE TABLE IF NOT EXISTS designation (
//       desig_id SERIAL PRIMARY KEY,
//       designation VARCHAR(100) UNIQUE NOT NULL,
//       status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL, 
//       description TEXT  -- Description of the designation
//     );


//     CREATE TABLE IF NOT EXISTS role (
//       role_id SERIAL PRIMARY KEY,
//       role VARCHAR(100) UNIQUE NOT NULL,  
//       description TEXT,  -- Description of the role
//       access VARCHAR(100)  -- Access level associated with the role (can store access details)
//     );


//     CREATE TABLE IF NOT EXISTS domain (
//       dom_id SERIAL PRIMARY KEY,
//       domain_name VARCHAR(100) UNIQUE NOT NULL,
//       status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL,
//       description TEXT  
//     );


//      CREATE TABLE IF NOT EXISTS user_categories (
//       category_id SERIAL PRIMARY KEY,
//       category VARCHAR(100) NOT NULL,
//       description TEXT,
//       status VARCHAR(20) DEFAULT'active'
//     );

//       CREATE TABLE IF NOT EXISTS users (
//         user_id SERIAL PRIMARY KEY,
//         first_name VARCHAR(30) NOT NULL,
//         last_name VARCHAR(30) NOT NULL,
//         gender VARCHAR(10) CHECK (gender IN ('Male', 'Female','Others')) NOT NULL,
//         email VARCHAR(50) UNIQUE NOT NULL,
//         phone_no VARCHAR(15) UNIQUE NOT NULL,
//         password TEXT,
//         dept_id INTEGER REFERENCES departments(dept_id),
//         sub_id INTEGER REFERENCES sub_departments(sub_id),
//         location INTEGER REFERENCES location(location_id),
//         emp_id VARCHAR(20) NOT NULL UNIQUE,
//         role_id INTEGER REFERENCES role(role_id),
//         designation INTEGER REFERENCES designation(desig_id),
//         password_reset BOOLEAN DEFAULT false,
//         manager_id  INTEGER,
//         otp_code VARCHAR(6),
//         band INT NOT NULL DEFAULT 0,
//         category_id INTEGER REFERENCES user_categories(category_id),
//         user_status VARCHAR(10) CHECK (user_status IN ('active', 'inactive')),
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       );

//      CREATE TABLE IF NOT EXISTS user_details (
//         id SERIAL PRIMARY KEY,
//         user_id INTEGER UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
//         dob DATE,
//         address TEXT,
//         marital_status VARCHAR(20),
//         nationality VARCHAR(100),
//         personal_number VARCHAR(15) UNIQUE,
//         joining_date DATE,
//         extra_details JSONB,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );

//       CREATE TABLE IF NOT EXISTS customers (
//           customer_id SERIAL PRIMARY KEY,
//           customer_name VARCHAR(100) NOT NULL,
          
//           -- Allowing NULL values but ensuring they are unique if provided
//           landline_num VARCHAR(15) UNIQUE,
//           email_id VARCHAR(100) UNIQUE,
          
//           -- Optional fields, allowing NULL values
//           gst_number VARCHAR(15) UNIQUE,
//           pan_no VARCHAR(10) UNIQUE,
//           tan_number VARCHAR(15) UNIQUE,

//           address TEXT,
//           city VARCHAR(50),
//           state VARCHAR(50),
//           country VARCHAR(50),
//           pincode VARCHAR(10),
          
//           lead VARCHAR(50),

//           -- Ensure the status can only be 'active' or 'inactive'
//           status VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

//           -- Ensure that at least one of landline_num or email_id is provided
//           CONSTRAINT contact_required CHECK (
//               landline_num IS NOT NULL OR email_id IS NOT NULL
//           ),

//           -- Timestamps for record creation and updates
//           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       );



//       CREATE TABLE IF NOT EXISTS contacts (
//         contact_id SERIAL PRIMARY KEY,
//         customer_id INTEGER REFERENCES customers(customer_id) ON DELETE CASCADE,
//         contact_person VARCHAR(100) NOT NULL,
//         phone_num VARCHAR(15) UNIQUE,
//         email_id VARCHAR(100) UNIQUE,
//         address TEXT,
//         city VARCHAR(50) NOT NULL,
//         state VARCHAR(50) NOT NULL,
//         country VARCHAR(50) NOT NULL,
//         pincode VARCHAR(10) NOT NULL,
//         department VARCHAR(100) NOT NULL,
//         designation VARCHAR(100),
//         date_of_start TEXT,
//         date_of_end TEXT,
//         status VARCHAR(10) CHECK (status IN ('active', 'inactive')),
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       );

//       CREATE TABLE IF NOT EXISTS api_access (
//         access_id SERIAL PRIMARY KEY,
//         user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
//         module VARCHAR(100),
//         api_name VARCHAR(100)
        
//       );

//       CREATE TABLE IF NOT EXISTS queries (
//     id SERIAL PRIMARY KEY,
//     customer_id INTEGER REFERENCES customers(customer_id) ON DELETE CASCADE,
//     service VARCHAR(255) NOT NULL,
//     messages TEXT NOT NULL,
//     status VARCHAR(50) DEFAULT 'pending',
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

//   CREATE TABLE IF NOT EXISTS year_settings (
//     id SERIAL PRIMARY KEY,
//     year_type VARCHAR(20) CHECK (year_type IN ('financial', 'calendar')) NOT NULL,
//     start_date DATE NOT NULL,
//     end_date DATE NOT NULL,
//     description TEXT,
//     CHECK (end_date > start_date)
// );


// CREATE TABLE IF NOT EXISTS working_days (
//     id SERIAL PRIMARY KEY,
//     year_type VARCHAR(20) CHECK (year_type IN ('financial', 'calendar'))  NOT NULL,
//     working_days VARCHAR(10) CHECK (working_days IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')) NOT NULL
// );


// CREATE TABLE IF NOT EXISTS holidays (
//     id SERIAL PRIMARY KEY,
//     holiday_name VARCHAR(100) NOT NULL,
//     holiday_date DATE NOT NULL  UNIQUE,
//     year_type VARCHAR(10) CHECK (year_type IN ('financial', 'calendar')) NOT NULL, -- Distinguishes between financial and calendar year holidays
//     description TEXT
// );


// CREATE TABLE IF NOT EXISTS policies (
//   policy_id SERIAL PRIMARY KEY,
//   category VARCHAR(100) NOT NULL,
//   name VARCHAR(255) NOT NULL,
//   description TEXT NOT NULL,
//   version VARCHAR(10) NOT NULL,
//   document BYTEA NOT NULL,
//   mime_type VARCHAR(100),
//   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );




//    CREATE TABLE IF NOT EXISTS leave_types (
//     id SERIAL PRIMARY KEY,
//     leave_type VARCHAR(50) UNIQUE NOT NULL,
//     allocation INTEGER NOT NULL,
//     allocation_type VARCHAR(10) CHECK (allocation_type IN ('monthly', 'yearly')) NOT NULL,
//     carry_forward BOOLEAN DEFAULT FALSE, 
//     carry_forward_type VARCHAR(10) CHECK (carry_forward_type IN ('Value', 'Percentage')) DEFAULT 'Percentage', 
//     percentage INTEGER CHECK (percentage >= 0 AND percentage <= 100) DEFAULT 0,
//     constraint_type VARCHAR(10) NOT NULL CHECK (constraint_type IN ('min', 'max')),
//     value INTEGER NOT NULL,
//     max_requests INTEGER,
//     description TEXT
// );

     
//    CREATE TABLE IF NOT EXISTS leave_balances (
//     id SERIAL PRIMARY KEY,
//     user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
//     leave_type VARCHAR(50) REFERENCES leave_types(leave_type) ON DELETE CASCADE,
//     allocation_type VARCHAR(10) CHECK (allocation_type IN ('monthly', 'yearly')),
//     balance FLOAT DEFAULT 0,
//     previous_balance FLOAT DEFAULT 0,
//     total_balance FLOAT GENERATED ALWAYS AS (balance + previous_balance) STORED, 
//     request_count INTEGER DEFAULT 0,
//     UNIQUE (user_id, leave_type),
//     status VARCHAR(15) CHECK (status IN ('pending', 'approved', 'rejected')),
//     pending_changes jsonb,
//     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );
  

//    CREATE TABLE IF NOT EXISTS leave_requests (
//     id SERIAL PRIMARY KEY,
//     user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
//     leave_type VARCHAR(50) REFERENCES leave_types(leave_type),
//     start_date DATE NOT NULL,
//     end_date DATE NOT NULL,
//     leave_days FLOAT DEFAULT NULL,
//     reason TEXT,
//     status VARCHAR(15) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
//     manager_id INTEGER  REFERENCES users(user_id),
//     half_day_start BOOLEAN DEFAULT FALSE,
//     half_day_end BOOLEAN DEFAULT FALSE,
//     remarks TEXT,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

//     CREATE TABLE IF NOT EXISTS categories (
//     category_id SERIAL PRIMARY KEY,
//     categories_name VARCHAR(255) NOT NULL,
//     description TEXT,
//     date_of_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     status VARCHAR(50) DEFAULT 'Draft' CHECK (status IN ('Draft','Active', 'Inactive')),
//     workflowname VARCHAR(50),
//     created_by INT REFERENCES users(user_id) 
//      );
     
//    CREATE TABLE IF NOT EXISTS entries (
//     id SERIAL PRIMARY KEY,
//     sender_id INTEGER REFERENCES users(user_id) NOT NULL,
//     receiver_id INTEGER REFERENCES users(user_id) NOT NULL,
//     category_id INTEGER REFERENCES categories(category_id) NOT NULL,
//     status VARCHAR(20) CHECK (status IN ('Draft', 'Active', 'Inactive')) NOT NULL,
//     stages VARCHAR(40) CHECK (stages IN ('FormDesign', 'Resubmitted', 'SubmittedForApproval', 'Approved', 'Hidden')) NOT NULL,
//     description TEXT,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );


//     CREATE TABLE IF NOT EXISTS User_workflow (
//       id SERIAL PRIMARY KEY,        
//       userid INTEGER REFERENCES users(user_id) NOT NULL, 
//       workflowid INTEGER NOT NULL,
//       CONSTRAINT unique_user_workflow UNIQUE (userid, workflowid)
//    );


//    CREATE TABLE IF NOT EXISTS api_logs (
//       log_id SERIAL PRIMARY KEY,
//       api_endpoint TEXT NOT NULL,               -- The endpoint that was hit
//       method VARCHAR(10) NOT NULL,              -- GET, POST, PUT, DELETE, etc.
//       status VARCHAR(20) NOT NULL,              -- Success / Failed
//       request_payload JSONB DEFAULT '{}'::jsonb, -- Request body payload
//       response_payload JSONB DEFAULT '{}'::jsonb, -- Response body or error
//       user_id INT,                              -- Foreign key if linked to users (optional)
//       submodule VARCHAR(100),                   -- Submodule name
//       action VARCHAR(100),                      -- Action taken
//       module VARCHAR(100),                      -- Module name
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- Timestamp of log
//     );
      
//       CREATE TABLE IF NOT EXISTS email_verifications (
//         email VARCHAR(255) PRIMARY KEY,
//         otp_hash TEXT,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         expires_at TIMESTAMP,
//         is_verified BOOLEAN DEFAULT FALSE
//       );
        
    
//     CREATE TABLE IF NOT EXISTS leave_settings (
//     id SERIAL PRIMARY KEY,
//     setting_name VARCHAR(50) UNIQUE NOT NULL,
//     setting_value BOOLEAN 
// );

//    INSERT INTO leave_settings (setting_name, setting_value)
//       VALUES
//     ('sandwichLeaveEnabled', NULL),
//     ('currentCondition', NULL),  -- Assuming condition 1 is true (for example)
//     ('lapse', NULL)
//     ON CONFLICT (setting_name) DO NOTHING; -- To avoid duplicate entries

//     `;

//     await client.query(createTablesQuery);
//     console.log("Tables created");
//   } catch (error) {
//     console.error("Error creating tables:", error);
//   } finally {
//     client.release();
//   }
// };


const createTables = async (to) => {
  const client = await pool.connect();
  try {
    const s = (table) => `${to}.${table}`; // helper to prefix schema

    const createTablesQuery = `
      CREATE TABLE IF NOT EXISTS ${s('departments')} (
        dept_id SERIAL PRIMARY KEY,
        dept_name VARCHAR(50) UNIQUE NOT NULL,
        dept_data TEXT,
        status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('sub_departments')} (
        sub_id SERIAL PRIMARY KEY,
        dept_id INTEGER REFERENCES ${s('departments')}(dept_id) ON DELETE CASCADE NOT NULL,
        sub_dept_name VARCHAR(50) UNIQUE NOT NULL,
        sub_data TEXT,
        status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('location')} (
        location_id SERIAL PRIMARY KEY,
        locality VARCHAR(80) UNIQUE NOT NULL,
        city VARCHAR(40) NOT NULL,
        state VARCHAR(40) NOT NULL,
        country VARCHAR(40) NOT NULL,
        code VARCHAR(15) NOT NULL,
        remarks TEXT,
        status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('sub_location')} (
        sub_location_id SERIAL PRIMARY KEY,
        location_id INTEGER REFERENCES ${s('location')}(location_id) ON DELETE CASCADE NOT NULL,
        building_no VARCHAR(40) NOT NULL,
        floor VARCHAR(40),
        room VARCHAR(40),
        section VARCHAR(40),
        description TEXT,
        status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('designation')} (
        desig_id SERIAL PRIMARY KEY,
        designation VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL, 
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS ${s('role')} (
        role_id SERIAL PRIMARY KEY,
        role VARCHAR(100) UNIQUE NOT NULL,  
        description TEXT,
        access VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS ${s('domain')} (
        dom_id SERIAL PRIMARY KEY,
        domain_name VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(20) CHECK (status IN ('Inactive', 'Active'))  DEFAULT 'Active' NOT NULL,
        description TEXT  
      );

      CREATE TABLE IF NOT EXISTS ${s('user_categories')} (
        category_id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS ${s('users')} (
        user_id SERIAL PRIMARY KEY,
        first_name VARCHAR(30) NOT NULL,
        last_name VARCHAR(30) NOT NULL,
        gender VARCHAR(10) CHECK (gender IN ('Male', 'Female','Others')) NOT NULL,
        email VARCHAR(50) UNIQUE NOT NULL,
        phone_no VARCHAR(15) UNIQUE NOT NULL,
        password TEXT,
        dept_id INTEGER REFERENCES ${s('departments')}(dept_id),
        sub_id INTEGER REFERENCES ${s('sub_departments')}(sub_id),
        location INTEGER REFERENCES ${s('location')}(location_id),
        emp_id VARCHAR(20) NOT NULL UNIQUE,
        role_id INTEGER REFERENCES ${s('role')}(role_id),
        designation INTEGER REFERENCES ${s('designation')}(desig_id),
        password_reset BOOLEAN DEFAULT false,
        manager_id INTEGER,
        otp_code VARCHAR(6),
        band INT NOT NULL DEFAULT 0,
        category_id INTEGER REFERENCES ${s('user_categories')}(category_id),
        user_status VARCHAR(10) CHECK (user_status IN ('active', 'inactive')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('user_details')} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES ${s('users')}(user_id) ON DELETE CASCADE,
        dob DATE,
        address TEXT,
        marital_status VARCHAR(20),
        nationality VARCHAR(100),
        personal_number VARCHAR(15) UNIQUE,
        joining_date DATE,
        extra_details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );



        CREATE TABLE IF NOT EXISTS ${s('customers')} (
        customer_id SERIAL PRIMARY KEY,
        customer_name VARCHAR(100) NOT NULL,
        landline_num VARCHAR(15) UNIQUE,
        email_id VARCHAR(100) UNIQUE,
        gst_number VARCHAR(15) UNIQUE,
        pan_no VARCHAR(10) UNIQUE,
        tan_number VARCHAR(15) UNIQUE,
        address TEXT,
        city VARCHAR(50),
        state VARCHAR(50),
        country VARCHAR(50),
        pincode VARCHAR(10),
        lead VARCHAR(50),
        status VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        CONSTRAINT contact_required CHECK (
            landline_num IS NOT NULL OR email_id IS NOT NULL
        ),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('contacts')} (
        contact_id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES ${s('customers')}(customer_id) ON DELETE CASCADE,
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
        date_of_start TEXT,
        date_of_end TEXT,
        status VARCHAR(10) CHECK (status IN ('active', 'inactive')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('api_access')} (
        access_id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES ${s('users')}(user_id) ON DELETE CASCADE,
        module VARCHAR(100),
        api_name VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS ${s('queries')} (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES ${s('customers')}(customer_id) ON DELETE CASCADE,
        service VARCHAR(255) NOT NULL,
        messages TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('year_settings')} (
        id SERIAL PRIMARY KEY,
        year_type VARCHAR(20) CHECK (year_type IN ('financial', 'calendar')) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        description TEXT,
        CHECK (end_date > start_date)
      );

      CREATE TABLE IF NOT EXISTS ${s('working_days')} (
        id SERIAL PRIMARY KEY,
        year_type VARCHAR(20) CHECK (year_type IN ('financial', 'calendar')) NOT NULL,
        working_days VARCHAR(10) CHECK (working_days IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ${s('holidays')} (
        id SERIAL PRIMARY KEY,
        holiday_name VARCHAR(100) NOT NULL,
        holiday_date DATE NOT NULL UNIQUE,
        year_type VARCHAR(10) CHECK (year_type IN ('financial', 'calendar')) NOT NULL,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS ${s('policies')} (
        policy_id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        version VARCHAR(10) NOT NULL,
        document BYTEA NOT NULL,
        mime_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('leave_types')} (
        id SERIAL PRIMARY KEY,
        leave_type VARCHAR(50) UNIQUE NOT NULL,
        allocation INTEGER NOT NULL,
        allocation_type VARCHAR(10) CHECK (allocation_type IN ('monthly', 'yearly')) NOT NULL,
        carry_forward BOOLEAN DEFAULT FALSE,
        carry_forward_type VARCHAR(10) CHECK (carry_forward_type IN ('Value', 'Percentage')) DEFAULT 'Percentage',
        percentage INTEGER CHECK (percentage >= 0 AND percentage <= 100) DEFAULT 0,
        constraint_type VARCHAR(10) NOT NULL CHECK (constraint_type IN ('min', 'max')),
        value INTEGER NOT NULL,
        max_requests INTEGER,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS ${s('leave_balances')} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES ${s('users')}(user_id) ON DELETE CASCADE,
        leave_type VARCHAR(50) REFERENCES ${s('leave_types')}(leave_type) ON DELETE CASCADE,
        allocation_type VARCHAR(10) CHECK (allocation_type IN ('monthly', 'yearly')),
        balance FLOAT DEFAULT 0,
        previous_balance FLOAT DEFAULT 0,
        total_balance FLOAT GENERATED ALWAYS AS (balance + previous_balance) STORED,
        request_count INTEGER DEFAULT 0,
        UNIQUE (user_id, leave_type),
        status VARCHAR(15) CHECK (status IN ('pending', 'approved', 'rejected')),
        pending_changes JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('leave_requests')} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES ${s('users')}(user_id) ON DELETE CASCADE,
        leave_type VARCHAR(50) REFERENCES ${s('leave_types')}(leave_type),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        leave_days FLOAT DEFAULT NULL,
        reason TEXT,
        status VARCHAR(15) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        manager_id INTEGER REFERENCES ${s('users')}(user_id),
        half_day_start BOOLEAN DEFAULT FALSE,
        half_day_end BOOLEAN DEFAULT FALSE,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('categories')} (
        category_id SERIAL PRIMARY KEY,
        categories_name VARCHAR(255) NOT NULL,
        description TEXT,
        date_of_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'Draft' CHECK (status IN ('Draft','Active', 'Inactive')),
        workflowname VARCHAR(50),
        created_by INT REFERENCES ${s('users')}(user_id)
      );

      CREATE TABLE IF NOT EXISTS ${s('entries')} (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES ${s('users')}(user_id) NOT NULL,
        receiver_id INTEGER REFERENCES ${s('users')}(user_id) NOT NULL,
        category_id INTEGER REFERENCES ${s('categories')}(category_id) NOT NULL,
        status VARCHAR(20) CHECK (status IN ('Draft', 'Active', 'Inactive')) NOT NULL,
        stages VARCHAR(40) CHECK (stages IN ('FormDesign', 'Resubmitted', 'SubmittedForApproval', 'Approved', 'Hidden')) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('User_workflow')} (
        id SERIAL PRIMARY KEY,
        userid INTEGER REFERENCES ${s('users')}(user_id) NOT NULL,
        workflowid INTEGER NOT NULL,
        CONSTRAINT unique_user_workflow UNIQUE (userid, workflowid)
      );

      CREATE TABLE IF NOT EXISTS ${s('api_logs')} (
        log_id SERIAL PRIMARY KEY,
        api_endpoint TEXT NOT NULL,
        method VARCHAR(10) NOT NULL,
        status VARCHAR(20) NOT NULL,
        request_payload JSONB DEFAULT '{}'::jsonb,
        response_payload JSONB DEFAULT '{}'::jsonb,
        user_id INT,
        submodule VARCHAR(100),
        action VARCHAR(100),
        module VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ${s('email_verifications')} (
        email VARCHAR(255) PRIMARY KEY,
        otp_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        is_verified BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS ${s('leave_settings')} (
        id SERIAL PRIMARY KEY,
        setting_name VARCHAR(50) UNIQUE NOT NULL,
        setting_value BOOLEAN
      );

      INSERT INTO ${s('leave_settings')} (setting_name, setting_value)
      VALUES
        ('sandwichLeaveEnabled', NULL),
        ('currentCondition', NULL),
        ('lapse', NULL)
      ON CONFLICT (setting_name) DO NOTHING;
    
    `;

    await client.query(createTablesQuery);
    console.log(`✅ Tables created in schema: ${to}`);
  } catch (error) {
    console.error(`❌ Error creating tables in schema ${to}:`, error);
  } finally {
    client.release();
  }
};

module.exports = { createTables };


module.exports = { createTables };
