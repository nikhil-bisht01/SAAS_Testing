const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const jwt = require("jsonwebtoken");
const { pool } = require("./config.js");
const https = require('https');
const http = require('http'); // Added HTTP support
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { logApiRequest } = require('./logs/logger');
const {createTables}=require("./setuptable")
const { updateYearlyLeaveBalances } = require('./Controllers/yearControl');
const {validateAssetSubscription} = require('./middleware/subscriptionMiddleware');
const app = express();
// const httpsPort = process.env.HTTPS_PORT || 3443; // HTTPS port
const httpPort = process.env.HTTP_PORT || 3000; // HTTP port

// Load SSL certificate and private key from the certificates directory
// const sslOptions = {
//   key: fs.readFileSync(path.join(process.env.key)),
//   cert: fs.readFileSync(path.join(process.env.cert)),
//   ca: fs.readFileSync(path.join(process.env.ca)),
// };

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3001',
      'http://localhost:3000',
      'http://localhost:3002',
      'https://higher-system.firebaseapp.com',
      'http://higherindia.net:3002',
      'https://higherindia.net',
      'https://higher-system.web.app',
      ...(process.env.corsOp ? process.env.corsOp.split(',').map(o => o.trim()) : [])
    ];

    console.log("🌍 Incoming Request Origin:", origin);
    console.log("✅ Allowed Origins:", allowedOrigins);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error("🚫 Blocked by CORS:", origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors());


// // Handle preflight requests
// app.options('*', (req, res) => {
//   res.header('Access-Control-Allow-Origin', process.env.corsOp);
//   res.header('Access-Control-Allow-Methods', '*'); // Changed to allow all methods
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   res.header('Access-Control-Allow-Credentials', 'true');
//   res.sendStatus(204); // Success for preflight
// });




// Create HTTPS server
// const httpsServer = https.createServer(sslOptions, app);

// Create HTTP server
const httpServer = http.createServer(app);

// Start HTTPS server
// httpsServer.listen(httpsPort, () => {
//   console.log(`HTTPS Server is running on port ${httpsPort}`);
// });

// Start HTTP server
httpServer.listen(httpPort, () => {
  console.log(`HTTP Server is running on port ${httpPort}`);
});




// ✅ Set EJS as the view engine
app.set("view engine", "ejs");

// ✅ Set views directory to match your file path
app.set('views', path.join(__dirname, 'Purchase'));

// ✅ Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());



// Call createTables function to set up the database

// createTables();



const JWT_SECRET = process.env.JWT_SECRET; // Load JWT secret from environment variable

if (!JWT_SECRET) {
  console.error("Error: JWT_SECRET is not set in environment variables.");
  process.exit(1); // Exit if JWT_SECRET is not defined
}

// Middleware to verify JWT and attach user info to req.user
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token is missing' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = { user_id: user.id, email: user.email, to: user.to, from: user.from }; // Attach user_id and email to req.user
    next();
  });
};

// Route to verify the token
app.post('/verify-token', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    res.json({
      message: 'Token is valid',
      userId: decoded.id,
      email: decoded.email
    });
  });
});

// Middleware to check user access to a specific API
const checkAccess = (apiName) => {
  return async (req, res, next) => {
    const { user_id } = req.user;
    const query = `SELECT * FROM api_access WHERE user_id = $1 AND api_name = $2`;

    try {
      const result = await pool.query(query, [user_id, apiName]);
      if (result.rows.length > 0) {
        next();
      } else {
        res.status(403).json({ error: 'Access denied. You do not have permission to access this API.' });
      }
    } catch (err) {
      console.error('Error checking API access:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

module.exports = { authenticateToken, checkAccess };



app.post('/signup', [
  body('email').isEmail().withMessage('Invalid email address')
], async (req, res, next) => {
  console.log('Request body:', req.body);
  const { email } = req.body;
  console.log(email);
  // Check if the email is for superadmin
  const isSuperAdmin = email == process.env.Mail;
  console.log(isSuperAdmin);

  // If email is for superadmin but no token is provided, allow unauthenticated superadmin signup
  if (isSuperAdmin && !req.headers.authorization) {
    return createUser(req, res);
  }

  // If token is provided, authenticate it and proceed
  authenticateToken(req, res, async (authErr) => {
    if (authErr) {
      // Authentication failed; return error
      return res.status(403).json({ error: 'Authentication required.' });
    }

    // If the email is for superadmin, prevent creation since superadmin should be created without authentication
    if (isSuperAdmin) {
      return res.status(403).json({ error: 'Superadmin creation is not allowed here.' });
    }

    // Proceed with regular user creation
    await createUser(req, res);
  });
});

// Common function for user creation logic
async function createUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    first_name,
    last_name,
    gender,
    email,
    phone_no,
    password,
    dept_id,
    sub_id,
    api_access,
    location,
    emp_id,
    role,
    designation,
    manager_id,
    user_status,
    band
  } = req.body;

  try {
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const passwordResetValue = (email === process.env.Mail);

    const query = `
      INSERT INTO users (
        first_name, last_name, gender, email, phone_no, password,dept_id, sub_id, location, emp_id, role_id, designation, manager_id, user_status, password_reset,band
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`;

    const values = [
      first_name,
      last_name,
      gender,
      email,
      phone_no,
      hashedPassword,
      dept_id,
      sub_id,
      location,
      emp_id,
      role,
      designation,
      manager_id,
      user_status,
      passwordResetValue,
      band || 0
    ];

    const result = await pool.query(query, values);
    const newUser = result.rows[0];

    if (api_access && api_access.length > 0) {
      const accessQuery = `
        INSERT INTO api_access (user_id, api_name)
        VALUES ${api_access.map((_, i) => `(${newUser.user_id}, $${i + 1})`).join(', ')}`;
      await pool.query(accessQuery, api_access);
    }

    res.status(201).json({
      message: 'User registered successfully.',
      userId: newUser.user_id,
    });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ error: 'Internal server error', message: err.detail });
  }
}






app.post("/mail-verify", async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required.' });
  }

  try {
    // Step 1: Find schema_name from schema_allocation using code
    const allocationQuery = `
      SELECT *
      FROM schema_allocation 
      WHERE company_code = $1
    `;
    const allocationResult = await pool.query(allocationQuery, [code]);

    if (allocationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid credentials.' });
    }

    const { schema_name } = allocationResult.rows[0];

    // Step 2: Check email in the users table of that schema
    const userQuery = `
      SELECT * 
      FROM ${schema_name}.users 
      WHERE email = $1
    `;
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in the schema.' });
    }

    const user = userResult.rows[0];

    // Step 3: Password reset check
    if (!user.password_reset) {
      return res.status(403).json({
        error: 'Password reset required. Please change your password before logging in.',
        requiresPasswordReset: true
      });
    }

    // ✅ All checks passed
    return res.status(200).json({
      message: 'User found. You can proceed to login.', schema_name
    });

  } catch (error) {
    console.error('Error verifying email:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.detail });
  }
});


app.post('/login', async (req, res) => {
  const { email, password, schema_name, code } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const query = `SELECT * FROM ${schema_name}.users WHERE email = $1`;
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found. Please check the email entered.' });
    }

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: 'Incorrect password. Please try again.' });
    }

    const payload = {
      id: user.user_id,
      email: user.email,
      to: schema_name,
      from: code
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'Login successful',
      userId: user.user_id,
      token: token
    });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: 'Internal server error', message: error.detail });
  }
});





const crypto = require('crypto');
const sendMail = require('./mailConfig'); // Your mail config

// Function to generate a 6-digit OTP
const generateOTP = () => {
  return crypto.randomInt(1000, 9999).toString(); // 4-digit OTP
};

// Function to request OTP and send via email
app.post('/request-otp', async (req, res) => {
  const { email } = req.body;

  try {
    // Check if user exists
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otp = generateOTP();

    // Update user table with OTP and expiration time

    // const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes
    // const updateQuery = 'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE email = $3';
    // await pool.query(updateQuery, [otp, otpExpiresAt, email]);


    //Update user table with OTP
    const updateQuery = 'UPDATE users SET otp_code = $1 WHERE email = $2';
    await pool.query(updateQuery, [otp, email]);


    // Send the OTP via email
    await sendMail(email, 'Your OTP Code', `<p>Your OTP code is ${otp}</p>`);

    res.json({ message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Error sending OTP:', err);
    res.status(500).json({ error: 'Internal server error', message: error.detail });
  }
});




app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Get user data with OTP from the database
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Check if OTP is correct and not expired
    // if (user.otp_code === otp && new Date() < new Date(user.otp_expires_at)) {
    //   // Clear OTP once verified
    //   const clearOtpQuery = 'UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE email = $1';


    // Check if OTP is correct
    if (user.otp_code === otp) {
      // Clear OTP once verified
      const clearOtpQuery = 'UPDATE users SET otp_code = NULL WHERE email = $1';

      await pool.query(clearOtpQuery, [email]);

      res.json({ message: 'OTP verified. You can now reset your password.' });
    } else {
      res.status(400).json({ error: 'Invalid OTP' });
    }
  } catch (err) {
    console.error('Error verifying OTP:', err);
    res.status(500).json({ error: 'Internal server error', message: error.detail });
  }
});



app.post('/reset-password', async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `
      UPDATE users
      SET password = $1, password_reset = true , otp_code = NULL
      WHERE email = $2
    `;
    await pool.query(query, [hashedPassword, email]);

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Internal server error', message: error.detail });
  }
});






// Monthly

// function Importing 
const { resetMonthlyLeaveBalances } = require('./Controllers/leaveController');
// // Schedule the task to run at the start of every month
// cron.schedule('0 0 1 * *', resetMonthlyLeaveBalances);


// Test route to manually trigger the resetMonthlyLeaveBalances function
app.get('/reset-monthly', async (req, res) => {
  try {
    await resetMonthlyLeaveBalances();
    res.status(200).json({ message: 'Monthly leave balances reset successfully!' });
  } catch (err) {
    console.error('Error resetting monthly leave balances:', err);
    res.status(500).json({ error: 'Failed to reset monthly leave balances' });
  }
});





// Yearly

// Endpoint to set the condition
app.post('/set-condition', authenticateToken, async (req, res) => {
  const { condition } = req.body; // condition should be a boolean

  if (typeof condition === 'boolean') {
    const client = await pool.connect();
    try {
      const query = `
              UPDATE leave_settings
              SET setting_value = $1
              WHERE setting_name = 'currentCondition'
              RETURNING *;
          `;
      await client.query(query, [condition]); // Store the boolean value directly
      return res.status(200).json({ message: `Condition set to ${condition}` });
    } catch (err) {
      console.error('Error updating condition:', err);
      res.status(500).json({ error: 'Failed to update condition', message: err.detail });
    } finally {
      client.release();
    }
  } else {
    return res.status(400).json({ error: 'Condition must be a boolean value (true or false).', });
  }
});



// Endpoint to get the current condition
app.get('/get-condition', async (req, res) => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT setting_value
      FROM leave_settings
      WHERE setting_name = 'currentCondition';
    `;
    const result = await client.query(query);

    if (result.rows.length > 0) {
      // Extract the setting_value from the result
      const currentCondition = result.rows[0].setting_value;
      return res.status(200).json({ currentCondition });
    } else {
      return res.status(404).json({ error: 'Condition not found' });
    }
  } catch (err) {
    console.error('Error fetching condition:', err);
    res.status(500).json({ error: 'Failed to fetch condition', message: err.detail });
  } finally {
    client.release();
  }
});



// Endpoint to set the lapse status
app.post('/set-lapse', authenticateToken, async (req, res) => {
  const { lapse: newLapse } = req.body; // Expect lapse in the request body

  // Validate that lapse is a boolean
  if (typeof newLapse === 'boolean') {
    const client = await pool.connect();
    try {
      const query = `
              UPDATE leave_settings
              SET setting_value = $1
              WHERE setting_name = 'lapse'
              RETURNING *;
          `;
      await client.query(query, [newLapse]); // Store boolean value
      return res.status(200).json({ message: `Lapse status set to ${newLapse ? 'enabled' : 'disabled'}` });
    } catch (err) {
      console.error('Error updating lapse status:', err);
      res.status(500).json({ error: 'Failed to update lapse status', message: err.detail });
    } finally {
      client.release();
    }
  } else {
    return res.status(400).json({ error: 'Lapse must be a boolean value (true or false).' });
  }
});

// Endpoint to get the current lapse status
app.get('/get-lapse', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT setting_value FROM leave_settings WHERE setting_name = $1', ['lapse']);
    if (result.rowCount > 0) {
      return res.status(200).json({ lapse: result.rows[0].setting_value });
    } else {
      return res.status(404).json({ error: 'Lapse setting not found' });
    }
  } catch (err) {
    console.error('Error fetching lapse status:', err);
    res.status(500).json({ error: 'Failed to fetch lapse status', message: err.detail });
  } finally {
    client.release();
  }
});




// Set up a cron job to run the update function at midnight on December 31st
// cron.schedule('0 0 31 12 *', async () => { // Runs at midnight on December 31st every year
//   console.log('Running yearly leave balance update...');
//   const client = await pool.connect(); // Connect to the database
//   try {
//     await client.query('BEGIN'); // Start a transaction
//     console.log("Starting update process...");

//     const conditionQuery = `
//         SELECT setting_value FROM leave_settings WHERE setting_name = $1`;
//     const conditionResult = await client.query(conditionQuery, ['currentCondition']);

//     const lapseQuery = `
//         SELECT setting_value FROM leave_settings WHERE setting_name = $1`;
//     const lapseResult = await client.query(lapseQuery, ['lapse']);

//     const condition = conditionResult.rowCount > 0 ? conditionResult.rows[0].setting_value : false;
//     const lapse = lapseResult.rowCount > 0 ? lapseResult.rows[0].setting_value : false;

//     console.log(`Condition: ${condition}, Lapse: ${lapse}`);

//     // Call the update function with retrieved values
//     await updateYearlyLeaveBalances(condition, lapse); // Ensure the update function handles booleans correctly

//     await client.query('COMMIT'); // Commit the transaction
//     console.log('Leave balances updated successfully');
//   } catch (error) {
//     await client.query('ROLLBACK'); // Rollback the transaction on error
//     console.error('Error updating leave balances:', error);
//   } finally {
//     client.release(); // Release the database connection
//   }
// });



app.get('/trigger-update', authenticateToken, async (req, res) => {
  console.log('Manually triggering yearly leave balance update...');
  const client = await pool.connect(); // Connect to the database
  try {
    await client.query('BEGIN'); // Start a transaction
    console.log("Starting update process...");

    const conditionQuery = `
      SELECT setting_value FROM leave_settings WHERE setting_name = $1`;
    const conditionResult = await client.query(conditionQuery, ['currentCondition']);

    const lapseQuery = `
     SELECT setting_value FROM leave_settings WHERE setting_name = $1`;
    const lapseResult = await client.query(lapseQuery, ['lapse']);




    const condition = conditionResult.rowCount > 0 ? conditionResult.rows[0].setting_value : false;
    const lapse = lapseResult.rowCount > 0 ? lapseResult.rows[0].setting_value : false;


    console.log(`Condition: ${condition}, Lapse: ${lapse}`);

    // Call the update function with retrieved values
    await updateYearlyLeaveBalances(condition, lapse); // Ensure the update function handles booleans correctly

    await client.query('COMMIT'); // Commit the transaction
    return res.status(200).json({ message: `Leave balances updated successfully with condition ${condition} and lapse ${lapse}` });
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback the transaction on error
    console.error('Error updating leave balances:', error);
    return res.status(500).json({ error: 'Error updating leave balances' });
  } finally {
    client.release(); // Release the database connection
  }
});








// Function to map input data types to PostgreSQL types
function mapDataType(type) {
  switch (type) {
    case "String":
      return "TEXT";  // Change String to TEXT or VARCHAR
    case "Integer":
      return "INTEGER";
    case "Date":
      return "DATE";
    case "Number":
      return "NUMERIC";  // Or you could use FLOAT/REAL if needed
    case "Boolean":
      return "BOOLEAN"
    case "Json":
      return "json"
    default:
      throw new Error(`Unsupported data type: ${type}`);
  }
}



app.post("/assettable", async (req, res) => {
    const { categoryName, fields } = req.body;

    if (!categoryName || !fields || typeof fields !== "object") {
        return res.status(400).send({ error: "Invalid input format." });
    }

    const client = await pool.connect(); // Acquire a client from the pool
    try {

        // Create the table query with proper quoting, and fix the initial comma issue
        let createTableQuery = `CREATE TABLE IF NOT EXISTS "${categoryName}" (unique_id SERIAL PRIMARY KEY, category_id INTEGER REFERENCES categories(category_id),status VARCHAR(20) DEFAULT 'Repository',
                             stages VARCHAR(20) DEFAULT 'Added', sub_stages VARCHAR(20) DEFAULT 'Added', toapprove TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;

        const fieldEntries = Object.entries(fields);

        fieldEntries.forEach(([fieldName, fieldDefinition], index) => {
            const [type, ...constraints] = fieldDefinition.split(",").map((s) => s.trim());
            const sqlType = mapDataType(type);

            // If the field name contains spaces, quote it
            const quotedFieldName = fieldName.includes(" ") ? `"${fieldName}"` : fieldName;

            // Add commas only between fields (not before the first field)
            createTableQuery += `, ${quotedFieldName} ${sqlType} ${constraints.join(" ")}`;
        });

        createTableQuery += ");";  // Ensure table definition ends with closing parentheses

        console.log("Generated SQL Query: ", createTableQuery); // Debug log for generated query

        // Execute the query to create the table
        await client.query(createTableQuery);




        // Modify table to add computed columns if categories_type === "RawMaterials"

        const queries = `SELECT categories_type FROM categories WHERE categoriesname = $1`;
        const result = await client.query(queries, [categoryName]);

        const { categories_type } = result.rows[0];
        console.log("Category Name:", categories_type);

        if (categories_type === "RawMaterials") {

            // Ensure usedassets has a default value of 0
            const addUsedMaterialsQuery = `ALTER TABLE "${categoryName}" ADD COLUMN "Used Materials" NUMERIC DEFAULT 0;`;
            await client.query(addUsedMaterialsQuery);

            const alterQuery = `
            ALTER TABLE "${categoryName}" 
            ADD COLUMN "Available Materials" NUMERIC GENERATED ALWAYS AS (Quantity - "Used Materials") STORED,
            ADD COLUMN "Unit Cost" NUMERIC GENERATED ALWAYS AS ("Total Cost"/Quantity) STORED,
            ADD COLUMN  "MIN" NUMERIC,
            ADD COLUMN  "MAX" NUMERIC
          `;

            console.log("New fields added");
            await client.query(alterQuery);
        }


        // Step 3: Delete related entries from temp_table only if table creation succeeds
        const deleteTempQuery = `DELETE FROM tempasset_table WHERE category_name = $1`;
        await client.query(deleteTempQuery, [categoryName]);

        res.status(200).send({ message: `Table ${categoryName} created successfully!` });
    } catch (error) {
        console.error("Error creating table:", error);
        res.status(500).send({ error: "Failed to create table.", details: error.message });
    } finally {
        client.release(); // Release the client back to the pool
    }
});



// GET mapped
app.get("/table-data/:categoryName", async (req, res) => {
  const { categoryName } = req.params; // Access categoryName from the route params

  if (!categoryName) {
    return res.status(400).send({ error: "Table name is required." });
  }

  const client = await pool.connect();
  try {
    // Query to get column names and data types
    const queryColumns = `
      SELECT col.column_name, 
       col.data_type, 
       (CASE col.is_nullable WHEN 'YES' THEN TRUE ELSE FALSE END) AS is_nullable, 
       col.column_default,
       (CASE WHEN cons.constraint_type = 'UNIQUE' THEN TRUE ELSE FALSE END) AS is_unique
FROM information_schema.columns col
LEFT JOIN (
    SELECT kcu.column_name, tc.constraint_type
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
) cons ON col.column_name = cons.column_name
WHERE col.table_name = $1;
    `;

    const joinSql = `
  SELECT 
    t.*, 
    CONCAT(
      'Building:', COALESCE(sl.building_no, ''), 
      ' , Floor:', COALESCE(sl.floor, ''), 
      ' , Room:', COALESCE(sl.room, ''), 
      ' , Section:', COALESCE(sl.section, ''), 
      ' , Description:', COALESCE(sl.description, '')
    ) AS location_details,
    CONCAT(u.first_name, ' ', u.last_name) AS name
  FROM "${categoryName}" t
  LEFT JOIN assetmapping am 
    ON t.unique_id = am.asset_id AND t.category_id = am.category_id
  LEFT JOIN sub_location sl 
    ON am.location_id = sl.sub_location_id
  LEFT JOIN users u 
    ON am.user_id = u.user_id;
`;

    // Fetch column details
    const resultColumns = await client.query(queryColumns, [categoryName]);
    if (resultColumns.rows.length === 0) {
      return res.status(404).send({ error: "Table not found." });
    }

    // Fetch joined data
    const resultData = await client.query(joinSql);

    // Default columns to add to the response
    const defaultColumns = [
      { columnName: "location_details", dataType: "text" },
      { columnName: "name", dataType: "text" }
    ];

    // Merge default columns with fetched columns if they aren't already present
    const columns = [...defaultColumns, ...resultColumns.rows.map(row => ({
      columnName: row.column_name,
      dataType: row.data_type
    }))];

    const data = resultData.rows;

    res.status(200).send({ columns, data });
  } catch (error) {
    console.error("Error fetching column types and joined data:", error);
    res.status(500).send({ error: "Failed to fetch column types and joined data.", message: error.detail });
  } finally {
    client.release();
  }
});





// all 
app.get("/getColumnTypesAndData/:categoryName", async (req, res) => {
  const { categoryName } = req.params;  // Access categoryName from the route params

  if (!categoryName) {
    return res.status(400).send({ error: "Table name is required." });
  }

  const client = await pool.connect();
  try {
    // Query to get column names and data types
    const queryColumns = `
      SELECT col.column_name, 
       col.data_type, 
       (CASE col.is_nullable WHEN 'YES' THEN TRUE ELSE FALSE END) AS is_nullable, 
       col.column_default,
       (CASE WHEN cons.constraint_type = 'UNIQUE' THEN TRUE ELSE FALSE END) AS is_unique
FROM information_schema.columns col
LEFT JOIN (
    SELECT kcu.column_name, tc.constraint_type
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
) cons ON col.column_name = cons.column_name
WHERE col.table_name = $1; 
    `;

    // Query to get all the data from the table
    const queryData = `
      SELECT * FROM "${categoryName}";
    `;

    // Fetch column details
    const resultColumns = await client.query(queryColumns, [categoryName]);
    if (resultColumns.rows.length === 0) {
      return res.status(404).send({ error: "Table not found." });
    }

    // Fetch data from the table
    const resultData = await client.query(queryData);

    // Format the response
    const columns = resultColumns.rows.map(row => ({
      columnName: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable,
      columnDefault: row.column_default,
      isUnique: row.is_unique
    }));

    // Format the rows into an array of objects
    const data = resultData.rows;

    res.status(200).send({ columns, data });

  } catch (error) {
    console.error("Error fetching column types and data:", error);
    res.status(500).send({ error: "Failed to fetch column types and data.", details: error.message });
  } finally {
    client.release();
  }
});



app.post('/insert/:tableName', async (req, res) => {
  const { tableName } = req.params;
  const { category_id, action, user_id, values } = req.body;
  
  const submodule = "AssetAddition";
    const module = 'Asset Management';

  if (submodule !== action) {
    //await logApiRequest(req, { error: 'This Action Does Not Match' }, "Failed", submodule, action, module, user_id);
    return res.status(400).json({ error: "This Action Does Not Match" });
  }

  try {
    // Step 1: Get category info
    const categoryQuery = `
      SELECT c.status, c.workflowname, c.stages, c.created_by, wf.workflowid
      FROM categories c
      LEFT JOIN work_flow_ wf ON wf.workflowname = c.workflowname
      WHERE c.category_id = $1
    `;
    const categoryResult = await pool.query(categoryQuery, [category_id]);

    if (categoryResult.rowCount === 0) {
   //   await logApiRequest(req, { error: 'Category not found' }, "Failed", submodule, action, module, user_id);
            
      throw { status: 404, message: "Category not found" };
    }

    const { workflowid } = categoryResult.rows[0];

    // Step 2: Get approved roles for this category/action
    const approvalRoleQuery = `
      SELECT groups FROM approval_group WHERE category_id = $1 and action = $2
    `;
    const approvalRoleResult = await pool.query(approvalRoleQuery, [category_id, action]);
    const approvedRoles = approvalRoleResult.rows.map(row => row.groups);

    if (approvedRoles.length === 0) {
      //await logApiRequest(req, { error: 'No roles assigned for this category' }, "Failed", submodule, action, module, user_id);
      
      throw { status: 403, message: "No roles assigned for this category" };
    }

    // ✅ Check for Bypass role
    const isBypass = approvedRoles.includes("bypass");

    // Step 3: Check user workflow permission (always enforced)
    const userWorkflowQuery = `
      SELECT 1 FROM user_workflow WHERE userid = $1 AND workflowid = $2
    `;
    const userWorkflowResult = await pool.query(userWorkflowQuery, [user_id, workflowid]);

    if (userWorkflowResult.rowCount === 0) {
    //  await logApiRequest(req, { error: 'User does not have permission for this workflow' }, "Failed", submodule, action, module, user_id);
      
      throw { status: 403, message: "User does not have permission for this workflow" };
    }

    // Step 4: Role validation (only if not bypass)
    if (!isBypass) {
      const ROLEQuery = `SELECT * FROM role WHERE role = ANY($1::text[])`;
      const ROLEResult = await pool.query(ROLEQuery, [approvedRoles]);

      if (ROLEResult.rowCount === 0) {
       // await logApiRequest(req, { error: "The group you belong to doesn't exist in the main role table." }, "Failed", submodule, action, module, user_id);
      
        throw { status: 403, message: "The group you belong to doesn't exist in the main role table." };
      }

      const apiAccessQuery = `
        SELECT api_name FROM api_access 
        WHERE user_id = $1 AND api_name = ANY($2::text[])
      `;
      const apiAccessResult = await pool.query(apiAccessQuery, [user_id, approvedRoles]);

      if (apiAccessResult.rowCount === 0) {
      //  await logApiRequest(req, { error: 'User role not authorized for this workflow' }, "Failed", submodule, action, module, user_id);
        return res.status(403).json({ error: "User role not authorized for this workflow" });
      }
    }

    // ✅ MIN/MAX basic rule check
    const min = values.min ?? values.MIN;
    const max = values.max ?? values.MAX;

    if (min !== undefined && max !== undefined) {
      if (Number(min) > Number(max)) {
        //await logApiRequest(req, { error: "MIN cannot be greater than MAX" }, "Failed", submodule, action, module, user_id);
        
        return res.status(400).json({ error: "MIN cannot be greater than MAX" });
      }
    }

    // ✅ Quantity-specific validation
    const quantity = Number(values.quantity);
    if (!isNaN(quantity)) {

      if (min !== undefined && max !== undefined) {
        // Both MIN and MAX provided
        if (quantity < Number(min) || quantity > Number(max)) {
        //  await logApiRequest(req, { error: `Quantity should be between MIN (${min}) and MAX (${max})` }, "Failed", submodule, action, module, user_id);
            
          return res.status(400).json({
            error: `Quantity should be between MIN (${min}) and MAX (${max})`
          });
        }
      }
      if (min !== undefined && quantity < Number(min)) {
      //  await logApiRequest(req, { error: `Quantity should be greater than or equal to MIN (${min})` }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: `Quantity should be greater than or equal to MIN (${min})` });
      }

      if (max !== undefined && quantity > Number(max)) {
     //   await logApiRequest(req, { error: `Quantity should be less than or equal MAX (${max})` }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: `Quantity should be less than or equal to MAX (${max})` });
      }
    }

    // ✅ Default values
    values.category_id = category_id;
    if (!values.status) values.status = 'Repository';
    if (!values.stages) values.stages = 'Added';

    // ✅ Construct INSERT query
    const columnNames = [];
    const placeholders = [];
    const queryValues = [];

    Object.keys(values).forEach((key, index) => {
      if (key.toLowerCase() !== 'unique_id') {
        columnNames.push(`"${key}"`);
        placeholders.push(`$${index + 1}`);
        queryValues.push(values[key]);
      }
    });

    const insertSQL = `INSERT INTO "${tableName}" (${columnNames.join(', ')}) VALUES (${placeholders.join(', ')});`;
    await pool.query(insertSQL, queryValues);
   
   
   // await logApiRequest(req, { error: `Data inserted successfully${isBypass ? ' (bypass mode)' : ''}` }, "Success", submodule, action, module, user_id);
            
    res.status(200).send(`Data inserted successfully${isBypass ? ' (bypass mode)' : ''}`);
  } catch (error) {
    console.error('Error inserting data:', error);
    res.status(error.status || 500).json({ error: error.message || 'Internal Server Error' });
  }
});




// POST API to create Asset Mapping (User/Location/Category or Asset-to-Asset)
app.post("/assetmapping", async (req, res) => {
  const { assetId, location_id, categoryId, userId, sourceCategory_Id, destinationCategory_Id, sourceAssetId, destinationAssetId } = req.body;

  try {

      if (userId && location_id && categoryId && assetId) {
          // Validate User
          const userValidationQuery = "SELECT COUNT(*) AS count FROM Users WHERE user_ID = $1";
          const userResult = await pool.query(userValidationQuery, [userId]);

          if (userResult.rows[0].count === 0) {
              return res.status(400).json({ message: "UserId does not exist in the Users table." });
          }

          // Validate Category
          const categoryValidationQuery = "SELECT COUNT(*) AS count FROM Categories WHERE category_id = $1";
          const categoryResult = await pool.query(categoryValidationQuery, [categoryId]);

          if (categoryResult.rows[0].count === 0) {
              return res.status(400).json({ message: "CategoryId does not exist in the Categories table." });
          }

          // Validate Location
          const locationValidationQuery = "SELECT COUNT(*) AS count FROM sub_location WHERE sub_location_id = $1";
          const locationResult = await pool.query(locationValidationQuery, [location_id]);

          if (locationResult.rows[0].count === 0) {
              return res.status(400).json({ message: "Sub_LocationId does not exist in the Locations table." });
          }

          // Check for duplicate mapping
          const duplicateCheckQuery = `
              SELECT COUNT(*) AS count 
              FROM assetmapping 
              WHERE asset_id = $1 AND location_id = $2 AND category_id = $3 AND user_id = $4
          `;
          const duplicateResult = await pool.query(duplicateCheckQuery, [assetId, location_id, categoryId, userId]);

          if (duplicateResult.rows[0].count > 0) {
              return res.status(400).json({ message: "Combination of assetId, locationId, categoryId, and userId already exists." });
          }

          // Insert mapping with allocation_type = 'allocation to user'
          const insertQuery = `
              INSERT INTO assetmapping (asset_id, location_id, category_id, user_id, allocation_type) 
              VALUES ($1, $2, $3, $4, $5) RETURNING id
          `;
          const insertResult = await pool.query(insertQuery, [assetId, location_id, categoryId, userId, 'allocation to user']);

          return res.status(201).json({
              message: "Asset mapping created successfully.",
              id: insertResult.rows[0].id,
          });
      }

      // --- Asset-to-Asset Mapping Logic ---
      if (sourceCategory_Id && destinationCategory_Id && sourceAssetId && destinationAssetId) {
          // Helper function to validate asset in dynamic table
          const validateAssetInCategory = async (categoryId, assetUniqueId) => {
              const categoryQuery = "SELECT categoriesname FROM Categories WHERE category_id = $1";
              const categoryResult = await pool.query(categoryQuery, [categoryId]);

              if (categoryResult.rows.length === 0) {
                  throw new Error(`Category with ID ${categoryId} does not exist.`);
              }
              console.log(categoryResult);

              const tableName = categoryResult.rows[0].categoriesname;

              const assetCheckQuery = `SELECT COUNT(*) AS count FROM "${tableName}" WHERE unique_id = $1;`
              const assetResult = await pool.query(assetCheckQuery, [assetUniqueId]);

              if (assetResult.rows[0].count === "0") {
                  throw new Error(`Asset with unique_id ${assetUniqueId} does not exist in table '${tableName}'.`);
              }

              return tableName;
          };

          const sourceTable = await validateAssetInCategory(sourceCategory_Id, sourceAssetId);
          const destTable = await validateAssetInCategory(destinationCategory_Id, destinationAssetId);

          // Insert mapping with allocation_type = 'asset to asset allocation'
          const insertMappingQuery = `
              INSERT INTO assetmapping (source_asset_id, source_category_id, destination_asset_id, destination_category_id, allocatedtime, allocation_type)
              VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
              RETURNING id
          `;
          const insertResult = await pool.query(insertMappingQuery, [
              sourceAssetId,
              sourceCategory_Id,
              destinationAssetId,
              destinationCategory_Id,
              'asset to asset allocation'
          ]);

          return res.status(201).json({
              message: "Asset-to-Asset mapping created successfully.",
              id: insertResult.rows[0].id,
          });
      }

      // If neither valid mapping data is provided
      res.status(400).json({ message: "Invalid input. Provide either user/location/category mapping or asset-to-asset mapping data." });
  } catch (error) {
      console.error("Error creating asset mapping:", error.message);
      res.status(500).json({ message: "Internal server error.", error: error.message });
  }
});


app.get("/asset-mapping-details/:categoryId", async (req, res) => {
  const { categoryId } = req.params;
  if (!categoryId) {
      return res.status(400).json({ error: "Category ID is required." });
  }

  const client = await pool.connect();
  try {
      // Step 1: Get mappings for the given category
      const mappingQuery = `
          SELECT source_category_id, destination_category_id, source_asset_id, destination_asset_id
          FROM assetmapping
          WHERE source_category_id = $1
      `;
      const mappingResult = await client.query(mappingQuery, [categoryId]);

      if (mappingResult.rows.length === 0) {
          return res.status(404).json({ error: "No asset mappings found for this category." });
      }

      // Step 2: Extract unique category IDs involved
      const allCategoryIds = [
          ...new Set(
              mappingResult.rows.flatMap(row => [row.source_category_id, row.destination_category_id])
          )
      ];

      // Step 3: Get category names
      const categoryNameQuery = `
          SELECT category_id, categoriesname
          FROM categories
          WHERE category_id = ANY($1)
      `;
      const categoriesResult = await client.query(categoryNameQuery, [allCategoryIds]);

      const categoryMap = {};
      categoriesResult.rows.forEach(row => {
          categoryMap[row.category_id] = row.categoriesname;
      });

      // Step 4: Build a map of table name -> set of asset IDs
      const tableAssetMap = {};
      mappingResult.rows.forEach(row => {
          const sourceTable = categoryMap[row.source_category_id];
          const destTable = categoryMap[row.destination_category_id];

          if (!sourceTable || !destTable) return;

          tableAssetMap[sourceTable] = tableAssetMap[sourceTable] || new Set();
          tableAssetMap[sourceTable].add(row.source_asset_id);

          tableAssetMap[destTable] = tableAssetMap[destTable] || new Set();
          tableAssetMap[destTable].add(row.destination_asset_id);
      });

      // Step 5: Fetch asset data from each dynamic table
      const assetDataMap = {};
      for (const [tableName, idSet] of Object.entries(tableAssetMap)) {
          const ids = Array.from(idSet);
          if (ids.length === 0) continue;

          const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
          const sql = `SELECT * FROM "${tableName}" WHERE unique_id IN (${placeholders})`;

          try {
              const result = await client.query(sql, ids);
              assetDataMap[tableName] = {};
              result.rows.forEach(row => {
                  assetDataMap[tableName][row.unique_id] = row;
              });
          } catch (err) {
              console.warn(`Error fetching data from table "${tableName}":`, err.message);
          }
      }

      // Step 6: Build final response
      const responseList = mappingResult.rows.map(row => {
          const sourceTable = categoryMap[row.source_category_id];
          const destinationTable = categoryMap[row.destination_category_id];

          return {
              sourceCategoryName: sourceTable,
              destinationCategoryName: destinationTable,
              sourceAsset: assetDataMap[sourceTable]?.[row.source_asset_id] || null,
              destinationAsset: assetDataMap[destinationTable]?.[row.destination_asset_id] || null
          };
      });

      res.status(200).json({
          count: responseList.length,
          mappings: responseList
      });

  } catch (error) {
      console.error("Error retrieving asset mapping details:", error);
      res.status(500).json({ error: "Failed to retrieve asset mapping details." });
  } finally {
      client.release();
  }
});


// Department and Sub-Department Routes
const deptRoutes = require('./routes/Dept/dept');
const sub_department = require('./routes/Dept/sub_dept');
app.use('/departments', deptRoutes);
app.use('/sub_dept', sub_department);



// User and Access Management Routes
const userRoutes = require('./routes/UserAccess/users');
const apiAccessRoutes = require('./routes/UserAccess/access');
app.use('/users', userRoutes);
app.use('/access', apiAccessRoutes);



// CRM
const customerRoutes = require('./routes/CRM/customers');
const contactRoutes = require('./routes/CRM/contacts');
app.use('/customers', customerRoutes);
app.use('/contacts', contactRoutes);



// Location and Sub-Location Routes
const locationRoutes = require('./routes/location/location');
const sublocRouter = require('./routes/location/sublocation');
app.use('/loc', locationRoutes);
app.use('/sloc', sublocRouter);



// Designation, Role, and Domain Routes
const designationRouter = require('./routes/HRMS/designation');
const roleRouter = require('./routes/HRMS/role');
const domainRouter = require('./routes/HRMS/domain');
app.use('/designation', designationRouter);
app.use('/role', roleRouter);
app.use('/domain', domainRouter);



// Leave Management and Year Settings Routes
const leaveRoutes = require('./routes/leaves/leave');
const yearsetRouter = require('./routes/leaves/yearset');
app.use('/leave', leaveRoutes);
app.use('/yrset', yearsetRouter);



// for all management logs
const Logs = require('./logs/logApi');
app.use('/logs', Logs);



// Asset Management System (AMS) Routes
const assetsRouter = require('./routes/asset/assets');
const lifecycleRouter = require('./routes/asset/lifecycle');
const workflow = require('./routes/asset/user_workflow');
const asseteslog = require('./logs/assets');
app.use('/assets', assetsRouter);
app.use('/lifecycle', lifecycleRouter);
app.use('/AMSlog', asseteslog);
app.use('/workflow', workflow);



//HR Policies Routes
const policy = require('./customerlog/policy');
app.use('/hr-policy', policy);

// DMS
const dmsRouter = require('./DMs/apis');
app.use('/dms', dmsRouter);


//customer Login
const custlogin = require('./customerlog/api');
app.use('/custlog', custlogin);

const custque = require('./customerlog/queries');
app.use('/query', custque);

// resume
const resume = require('./customerlog/resume');
app.use('/resume', resume);

// Partners
const Partners = require('./Partner/partners');
app.use('/partners', Partners);

const ContactPartners = require('./Partner/partnerContacts');
app.use('/copartners', ContactPartners);



//suppliers
app.use('/uploads', express.static(path.join(__dirname, 'Purchase/uploads')));

const supplier= require('./Purchase/suppliers/supplier')
app.use('/supplier',supplier);


//suppliers_contacts
const contact =require('./Purchase/suppliers/contact-supp');
app.use('/S_contact',contact);

// purchase indenting
const purchase=require('./Purchase/indenting/api');
app.use('/purchase',purchase);

// Purchase rfps
const rfps = require('./Purchase/rfp/rfp.js');
app.use('/Purchase/rfps/' , rfps)


// quotation
const quotation=require('./Purchase/indenting/negotiation');
app.use('/quotation',quotation);

//Budget Routes
const budgetRoutes = require('./Purchase/budget/budget');
app.use('/budget', budgetRoutes);

//Budget Workflow Routes
const workflowRoutes = require('./Purchase/budget/workflow');
app.use('/budget-workflow', workflowRoutes);


app.use('/purchase/form', express.static(path.join(__dirname, 'Purchase/form')));




///// DMS //////////////

// Routes
const mappingRoutes = require('./DMSsys/mapping');
const serviceRoutes = require('./DMSsys/service');
const doctypeRoutes = require('./DMSsys/doctype');
const allowDocRoutes = require('./DMSsys/allow_doc');
const DMSRoutes = require('./DMSsys/dms');

// Use routes
app.use('/mapping', mappingRoutes);
app.use('/service', serviceRoutes);
app.use('/doctype', doctypeRoutes);
app.use('/allow_doc', allowDocRoutes);
app.use('/dmsapi',DMSRoutes);




// Workflow
const Workflow = require('./routes/Workflow/Workflow');
app.use('/uniworkflow',Workflow);

// user category
const user_categories = require('./routes/UserAccess/userCategory');
app.use('/user-category', user_categories);



// first user setup
const schema = require('./logic/schema.js');
app.use('/schema',schema);