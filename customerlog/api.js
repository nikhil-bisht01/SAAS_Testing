const express = require('express');
const router = express.Router();
const { pool } = require('../config');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const createTables = require('./table');
const crypto = require('crypto');
const sendMail = require('../mailConfig');
const sendSMS = require('../smsConfig');



router.post('/create-tables', async (req, res) => {
    try {
        const result = await createTables();

        if (result && result.success) {
            res.status(200).send('All tables created successfully!');
        } else {
            res.status(500).json({
                message: 'Failed to create all tables.',
                errors: result ? result.errors : 'Unknown error',
            });
        }
    } catch (err) {
        console.error('Unexpected error while creating tables:', err);
        res.status(500).send('Unexpected error occurred.');
    }
});



const JWT_SECRET = process.env.MAIN_JWT_SECRET;

if (!JWT_SECRET) {
    console.error("Error: JWT_SECRET is not set in environment variables.");
    process.exit(1); // Exit if JWT_SECRET is not defined
}

// Middleware to verify JWT and attach user info to req.user
//   const authenticateToken = (req, res, next) => {
//     const authHeader = req.headers['authorization'];
//     const token = authHeader && authHeader.split(' ')[1];

//     if (!token) {
//       return res.status(401).json({ error: 'Token is missing' });
//     }

//     jwt.verify(token, JWT_SECRET, (err, user) => {
//       if (err) {
//         return res.status(403).json({ error: 'Invalid or expired token' });
//       }
//       req.user = { user_id: user.id, email: user.email }; // Attach user_id and email to req.user
//       next();
//     });
//   };

// Route to verify the token
router.post('/verify-token', (req, res) => {
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
            id: decoded.id,
            customerId: decoded.customer_id, // Extract and return customer_id
            customer_name: decoded.customer_name // Extract and return customer_name
        });
    });
});




router.post('/signup', async (req, res) => {
    const { customer_name, phone_num, email_id, password } = req.body;

    // Validate input
    if (!customer_name || !phone_num || !email_id || !password) {
        return res.status(400).json({ error: "All fields are required." });
    }

    const client = await pool.connect();
    try {
        // Check if the user already exists in Main_customers
        const existingUserQuery = `SELECT * FROM Main_customers WHERE email_id = $1 OR phone_num = $2`;
        const existingUser = await client.query(existingUserQuery, [email_id, phone_num]);
        if (existingUser.rowCount > 0) {
            return res.status(400).json({ error: "User with this email or phone number already exists." });
        }

        // Check if the user exists in the CRM database
        const crmQuery = `
            SELECT customer_id FROM customers WHERE email_id = $1 AND landline_num = $2
        `;
        const crmResult = await client.query(crmQuery, [email_id, phone_num]);
        if (crmResult.rowCount === 0) {
            return res.status(400).json({ error: "User with this email or phone number does not exist in CRM." });
        }

        // Check if the user has a pending OTP verification
        const otpCheckQuery = `
          SELECT email_or_phone FROM otp_verification WHERE email_or_phone = $1 OR email_or_phone = $2
      `;
        const otpResult = await client.query(otpCheckQuery, [email_id, phone_num]);
        if (otpResult.rowCount === 0) {
            return res.status(400).json({ error: "User with this email or phone number has no pending OTP verification." });
        }

        const { customer_id } = crmResult.rows[0];

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the new user into Main_customers
        const insertUserQuery = `
            INSERT INTO Main_customers (customer_id, customer_name, phone_num, email_id, password)
            VALUES ($1, $2, $3, $4, $5) RETURNING id, customer_id, customer_name, email_id, created_at
        `;
        const newUserResult = await client.query(insertUserQuery, [
            customer_id,
            customer_name,
            phone_num,
            email_id,
            hashedPassword,
        ]);



        const { email_or_phone } = otpResult.rows[0];

        // Determine if the OTP is for email or phone and update the corresponding field
        const isEmail = email_or_phone.includes('@');
        let updateVerificationQuery;
        let updateParam;

        if (isEmail) {
            updateVerificationQuery = `
                UPDATE Main_customers
                SET validemail = TRUE
                WHERE email_id = $1
                RETURNING validemail
            `;
            updateParam = email_or_phone;
        } else {
            updateVerificationQuery = `
                UPDATE Main_customers
                SET validephone = TRUE
                WHERE phone_num = $1
                RETURNING validephone
            `;
            updateParam = email_or_phone;
        }

        const verificationUpdateResult = await client.query(updateVerificationQuery, [updateParam]);
        if (verificationUpdateResult.rowCount === 0) {
            return res.status(400).json({ error: "Failed to update verification status." });
        }

        // Delete the OTP after successful verification
        const deleteOtpQuery = `DELETE FROM otp_verification WHERE email_or_phone = $1`;
        await client.query(deleteOtpQuery, [email_or_phone]);

        // Respond with success and the new user details
        res.status(201).json({
            message: "User registered successfully.",
            user: newUserResult.rows[0],
        });
    } catch (error) {
        console.error("Error during signup:", error.message);
        res.status(500).json({ error: "Internal server error." });
    } finally {
        client.release();
    }
});



// Login Endpoint
router.post('/login', async (req, res) => {
    const { email_id, password } = req.body;

    // Validate input
    if (!email_id || !password) {
        return res.status(400).json({ error: "Email/Phone and Password are required." });
    }

    const client = await pool.connect();
    try {
        // Determine if input is email or phone number
        const isEmail = email_id.includes('@');
        const query = isEmail
            ? `SELECT * FROM Main_customers WHERE email_id = $1`
            : `SELECT * FROM Main_customers WHERE phone_num = $1`;

        // Retrieve user
        const userResult = await client.query(query, [email_id]);
        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: "User not found." });
        }

        const user = userResult.rows[0];

        // Check validity flag
        if (isEmail && !user.validemail) {
            return res.status(403).json({ error: "Email is not verified. Please verify your email before logging in." });
        } else if (!isEmail && !user.validephone) {
            return res.status(403).json({ error: "Phone number is not verified. Please verify your phone number before logging in." });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid credentials." });
        }

        const token = jwt.sign(
            {
                id: user.id,
                customer_id: user.customer_id, // Include customer_id in the payload
                customer_name: user.customer_name // Include customer_name in the payload
            },
            JWT_SECRET,
            { expiresIn: '24h' } // Token expiration time
        );

        res.status(200).json({
            message: "Login successful.",
            token,
        });
    } catch (error) {
        console.error("Error during login:", error.message);
        res.status(500).json({ error: "Internal server error." });
    } finally {
        client.release();
    }
});


// Create a new customer
router.post('/add', async (req, res) => {
    const client = await pool.connect(); // Connect to the pool
    const { customer_name, phone_num, email_id } = req.body;
    const lead = 'Website';



    const query = `
      INSERT INTO customers (customer_name, landline_num, email_id, lead) 
      VALUES ($1, $2, $3, $4) RETURNING *`;
    const values = [customer_name, phone_num, email_id, lead];

    try {

        // Check if the user exists in the CRM database
        const crmQuery = `
            SELECT customer_id FROM customers WHERE email_id = $1 AND landline_num = $2
             `;
        const crmResult = await client.query(crmQuery, [email_id, phone_num]);
        if (crmResult.rowCount !== 0) {
            return res.status(400).json({ error: "User with this email or phone number does exist in CRM." });
        }

        const result = await client.query(query, values);
        const newCustomer = result.rows[0];
        res.status(201).json({
            message: 'Customer created successfully',
            customer: newCustomer
        });
    } catch (err) {
        console.error('Error inserting customer:', err);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release(); // Release the client back to the pool
    }
});










// Function to generate a 4-digit OTP
const generateOTP = () => {
    return crypto.randomInt(1000, 9999).toString(); // 4-digit OTP
};


// Request OTP (Signup or Other) and Store in Database
router.post('/request-otp', async (req, res) => {
    const { email } = req.body;

    const client = await pool.connect();
    try {

        const queryuser = 'SELECT * FROM Main_customers WHERE email_id = $1 or phone_num = $1';
        const userResult = await client.query(queryuser, [email])

        if (userResult.rowCount !== 0) {
            return res.status(404).json({ error: "User already exist." });
        }

        const otp = generateOTP();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 5); // OTP expires in 5 minutes

        // Store OTP and email/phone in the table
        const query = `
            INSERT INTO otp_verification (email_or_phone, otp, expires_at)
            VALUES ($1, $2, $3)`;
        await client.query(query, [email, otp, expiresAt]);

        const isEmail = email.includes('@');
        
        if(isEmail){
            // Send the OTP via email
        await sendMail(email, 'Your OTP Code', `<p>Your OTP code is ${otp}</p>`);
        }
        else if(!isEmail){
            //  Send SMS verification code
         const smsBody = `Your verification code is: ${otp}`;
         await sendSMS(email, smsBody);
        }
        res.json({ message: 'OTP sent to your email.' });
    } catch (err) {
        console.error('Error sending OTP:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});


// Verify OTP from the Database
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    const client = await pool.connect();
    try {
        // Retrieve OTP from the database
        const query = `
            SELECT * FROM otp_verification
            WHERE email_or_phone = $1 AND otp = $2
            AND expires_at > NOW()`;
        const result = await client.query(query, [email, otp]);

        if (result.rowCount === 0) {
            return res.status(400).json({ error: 'Invalid OTP or OTP has expired.' });
        }


        // Update user's verification status in the users table
        const updateQuery = `
            UPDATE otp_verification
            SET status = TRUE
            WHERE email_or_phone = $1`;
        const updateResult = await client.query(updateQuery, [email]);

        if (updateResult.rowCount === 0) {
            return res.status(400).json({ error: 'Failed to update verification status.' });
        }

        res.json({ message: 'OTP verified.' });
    } catch (err) {
        console.error('Error verifying OTP:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});


// Get all customers
router.get('/:id', async (req, res) => {
    const client = await pool.connect(); // Connect to the pool
    const {id}=req.params;
    try {
        const query = 'SELECT * FROM customers where customer_id = $1';
        const result = await client.query(query, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching customers:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});



// Get all customers
router.get('/', async (req, res) => {
    const client = await pool.connect(); // Connect to the pool
    const {id}=req.params;
    try {
        const query = 'SELECT * FROM customers ';
        const result = await client.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching customers:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});


module.exports = router;
