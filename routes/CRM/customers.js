const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { pool } = require('../../config.js'); // Use the connection pool from config
const { logApiRequest } = require('../../logs/logger.js'); // Import the logApiRequest function
const { authenticateToken } = require('../../index.js'); // Import the authenticateToken function




// Middleware to parse JSON bodies
router.use(express.json());

// Commented out Subscription Data (As per your request)
// const getSubscriptionData = () => {
//     try {
//         const filePath = path.join(__dirname, '../../subscriptions_2.json');
//         const rawData = fs.readFileSync(filePath, 'utf8');
//         return JSON.parse(rawData);
//     } catch (error) {
//         console.error('Error reading subscription data:', error);
//         return null;
//     }
// };

// Create a new customer
router.post('/', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    const {
        customer_name,
        gst_number,
        landline_num,
        email_id,
        pan_no,
        tan_number,
        address,
        city,
        state,
        country,
        pincode
    } = req.body;

    const lead = 'Sales';
    const action = 'Create Customer';
    const submodule = 'Profile';
    const module = 'CRM';
    const user_id = req.user.user_id;

    // Validate required fields
    if (!customer_name || (!landline_num && !email_id)) {
        return res.status(400).json({
            error: 'Customer name and at least one of landline number or email ID is required.'
        });
    }

    // Convert empty strings to null to avoid uniqueness conflict
    const values = [
        customer_name,
        gst_number ,
        landline_num ,
        email_id ,
        pan_no ,
        tan_number ,
        address ,
        city,
        state ,
        country ,
        pincode ,
        lead
    ];

    const query = `
        INSERT INTO customers (
            customer_name, gst_number, landline_num, email_id, pan_no, tan_number,
            address, city, state, country, pincode, lead
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`;

    try {
        const result = await client.query(query, values);
        const newCustomer = result.rows[0];

        // Log the API request (successful)
        await logApiRequest(req, newCustomer, "Success", submodule, action, module);

        res.status(201).json({ message: 'Customer created successfully', customer: newCustomer });
    } catch (err) {
        console.error('Error inserting customer:', err);

        // Log the API request (error)
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module);

        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});




// ✅ Get all customers without logging
router.get('/', authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const result = await client.query('SELECT * FROM customers');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching customers:', err);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});


// ✅ Update customer status (active/inactive)
router.patch('/status/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    const id = req.params.id;
    const { status } = req.body;

    const lead = 'Sales';
    const action = 'Update Customer Status';
    const submodule = 'Profile';
    const module = 'CRM';

    if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Use "active" or "inactive".' });
    }

    try {
        const result = await client.query(
            `UPDATE customers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $2 RETURNING *`,
            [status, id]
        );

        if (result.rows.length === 0) {
            await logApiRequest(req, { error: 'Customer not found' }, "Failed", submodule, action, module);
            return res.status(404).json({ error: 'Customer not found' });
        }

        await logApiRequest(req, result.rows[0], "Success", submodule, action, module);
        res.json({ message: `Customer status updated to ${status}`, customer: result.rows[0] });

    } catch (err) {
        console.error('Error updating status:', err);
        res.status(500).json({ error: 'Internal server error', message: err.message });
    } finally {
        client.release();
    }
});



// ✅ Update a customer by ID
router.put('/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    const id = req.params.id;
    const {
        customer_name, gst_number, landline_num, email_id,
        pan_no, tan_number, address, city, state, country,
        pincode
    } = req.body;

    const lead = 'Sales';
    const action = 'Update Customer';
    const submodule = 'Profile';
    const module = 'CRM';

    try {
        // 🔍 Step 1: Check if customer exists and get status
        const customerStatusResult = await client.query(
            `SELECT status FROM customers WHERE customer_id = $1`,
            [id]
        );

        if (customerStatusResult.rows.length === 0) {
            await logApiRequest(req, { error: 'Customer not found' }, "Failed", submodule, action, module);
            return res.status(404).json({ error: 'Customer not found' });
        }

        const currentStatus = customerStatusResult.rows[0].status;

        // ❌ Step 2: Block update if status is 'inactive'
        if (currentStatus === 'inactive') {
            await logApiRequest(req, { error: 'Cannot update customer profile. Customer is inactive.' }, "Failed", submodule, action, module);
            return res.status(403).json({ error: 'Cannot update customer profile. Customer is inactive.' });
        }

        // ✅ Step 3: Validate customer_name and at least one contact field
        if (!customer_name || (!landline_num && !email_id)) {
            return res.status(400).json({
                error: 'Customer name and at least one of landline number or email ID is required.'
            });
        }

        // 🧼 Step 4: Normalize optional fields to `null` if empty
        const values = [
            customer_name,
            gst_number ,
            landline_num ,
            email_id ,
            pan_no ,
            tan_number ,
            address ,
            city ,
            state ,
            country ,
            pincode ,
            id
        ];

        const query = `
            UPDATE customers
            SET customer_name = $1,
                gst_number = $2,
                landline_num = $3,
                email_id = $4,
                pan_no = $5,
                tan_number = $6,
                address = $7,
                city = $8,
                state = $9,
                country = $10,
                pincode = $11,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = $12
            RETURNING *`;

        const result = await client.query(query, values);

        await logApiRequest(req, result.rows[0], "Success", submodule, action, module);
        res.json({ message: 'Customer updated successfully', customer: result.rows[0] });

    } catch (err) {
        console.error('Error updating customer:', err);
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});




// ✅ Delete a customer by ID 
router.delete('/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    const id = req.params.id;
    const submodule = 'Profile';
    const action = 'Delete Customer';
    const module = 'CRM';

    const query = 'DELETE FROM customers WHERE customer_id = $1 RETURNING *';

    try {
        const result = await client.query(query, [id]);

        if (result.rows.length > 0) {
            await logApiRequest(req, { message: 'Customer deleted successfully', customer: result.rows[0] }, "Success", submodule, action, module);
            res.json({ message: 'Customer deleted successfully', customer: result.rows[0] });
        } else {
            await logApiRequest(req, { error: 'Customer not found' }, "Failed", submodule, action, module);
            res.status(404).json({ error: 'Customer not found' });
        }
    } catch (err) {
        console.error('Error deleting customer:', err);
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});



// ✅ Filter users
router.get('/filter', async (req, res) => {
    const client = await pool.connect();
    try {
        const { dateFrom, dateTo, city, state, country } = req.query;
        let query = `SELECT * FROM customers WHERE 1=1`;
        const queryParams = [];

        if (dateFrom) {
            query += ` AND created_at >= $${queryParams.length + 1}`;
            queryParams.push(dateFrom);
        }
        if (dateTo) {
            query += ` AND created_at <= $${queryParams.length + 1}`;
            queryParams.push(dateTo);
        }
        if (city) {
            query += ` AND city = $${queryParams.length + 1}`;
            queryParams.push(city);
        }
        if (state) {
            query += ` AND state = $${queryParams.length + 1}`;
            queryParams.push(state);
        }
        if (country) {
            query += ` AND country = $${queryParams.length + 1}`;
            queryParams.push(country);
        }

        const result = await client.query(query, queryParams);
        await logApiRequest(req, result.rows, 200);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err.message);
        await logApiRequest(req, { error: 'Server error' }, 500);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// ✅ Export the router
module.exports = router;
