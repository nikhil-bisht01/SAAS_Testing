const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { pool } = require('../../config'); // Use the connection pool from config
const moment = require('moment');
const { checkAccess } = require('../../index');
const { authenticateToken } = require('../../index.js');
const { logApiRequest } = require('../../logs/logger.js');

// Middleware to parse JSON bodies
// router.use(express.json());

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

// ✅ Create a new contact 
router.post('/', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    const { customer_id, contact_person, phone_num, email_id, address, city, state, country, pincode, department, designation, date_of_end, status } = req.body;
    const date_of_start = req.body.date_of_start || moment().format('YYYY-MM-DD');

    const user_id = req.user?.id || req.user?.user_id;
    const submodule = 'Profile';
    const action = 'Create Contact';
    const module = 'CRM';

    if (!user_id) {
        return res.status(403).json({ error: 'User ID missing in token' });
    }

    try {
        // ✅ Check customer status before creating contact
        const customerStatusQuery = `SELECT status FROM customers WHERE customer_id = $1`;
        const customerStatusResult = await client.query(customerStatusQuery, [customer_id]);
             

        if (customerStatusResult.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const customerStatus = customerStatusResult.rows[0].status;
        if (customerStatus !== 'active') {
            await logApiRequest(req, { error: 'Cannot create contact. Customer is inactive.' }, "Failed", submodule, action, module);
            return res.status(403).json({ error: 'Cannot create contact. Customer is inactive.' });
        }

        /* 
        // ✅ Load Subscription Data
        const subscriptionData = getSubscriptionData();

        if (!subscriptionData) {
            await logApiRequest(req, { error: 'Subscription data not loaded' }, "Failed", submodule, action, module);
            return res.status(500).json({ error: 'Subscription data not loaded' });
        }

        // ✅ Check Subscription Validity
        const expirationDate = new Date(subscriptionData.productKey.expirationDate.join('-'));
        const currentDate = new Date();

        if (expirationDate < currentDate) {
            await logApiRequest(req, { error: 'Subscription expired. Please renew.' }, "Failed", submodule, action, module);
            return res.status(403).json({ error: 'Subscription expired. Please renew.' });
        }

        // ✅ Extract Contact Limit from Subscription
        const contactSubscription = subscriptionData.subscriptions.find(
            sub => sub.module === "CRM" && sub.subModule === "contact"
        );
        const maxContactsAllowed = contactSubscription ? contactSubscription.noOfUsers : 0;

        console.log("Max Allowed Contacts:", maxContactsAllowed);

        // ✅ Get Current Contact Count for Customer
        const countQuery = 'SELECT COUNT(*) FROM contacts WHERE customer_id = $1';
        const countResult = await client.query(countQuery, [customer_id]);
        const currentContacts = parseInt(countResult.rows[0].count);

        console.log("Current Contacts:", currentContacts);

        // ✅ Enforce Contact Limit
        if (currentContacts >= maxContactsAllowed) {
            await logApiRequest(req, { error: 'Maximum contact limit reached. Cannot create more contacts.' }, "Failed", submodule, action, module);
            return res.status(403).json({ error: 'Maximum contact limit reached. Cannot create more contacts.' });
        } 
        */

        // ✅ Insert Contact into Database
        const query = `
            INSERT INTO contacts 
            (customer_id, contact_person, phone_num, email_id, address, city, state, country, pincode, department, designation, date_of_start, date_of_end, status)  
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
            RETURNING *`;

        const values = [customer_id, contact_person, phone_num, email_id, address, city, state, country, pincode, department, designation, date_of_start, date_of_end, status];

        const result = await client.query(query, values);
        const newContact = result.rows[0];

        // ✅ Log API Request
        await logApiRequest(req, newContact, "Success", submodule, action, module);

        res.status(201).json({ message: 'Contact created successfully', contact: newContact });

    } catch (err) {
        console.error('Error inserting contact:', err);

        // ✅ Log Error
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module);

        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});



// Get all contacts
router.get('/', async (req, res) => {
    const client = await pool.connect(); // Connect to the pool
    try {
        const result = await client.query('SELECT * FROM contacts');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching contacts:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});




// ✅ Update a contact by ID 
router.put('/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    const contact_id = req.params.id;
    const { customer_id, contact_person, phone_num, email_id, address, city, state, country, pincode, department, designation, date_of_start, date_of_end, status } = req.body;

    const user_id = req.user?.id || req.user?.user_id;
    const submodule = 'Profile';
    const module = 'CRM';
    const action = 'Update Contact';

    if (!user_id) {
        return res.status(403).json({ error: 'User ID missing in token' });
    }

    try {
        // ✅ Check if associated customer is active
        const customerStatusQuery = `SELECT status FROM customers WHERE customer_id = $1`;
        const customerStatusResult = await client.query(customerStatusQuery, [customer_id]);

        if (customerStatusResult.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const customerStatus = customerStatusResult.rows[0].status;
        if (customerStatus !== 'active') {
            await logApiRequest(req, { error: 'Cannot update contact. Customer is inactive.' }, "Failed", submodule, action, module);
            return res.status(403).json({ error: 'Cannot update contact. Customer is inactive.' });
        }

        /*
        // ✅ Load Subscription Data
        const subscriptionData = getSubscriptionData();

        if (!subscriptionData) {
            await logApiRequest(req, { error: 'Subscription data not loaded' }, "Failed", submodule, action, module);
            return res.status(500).json({ error: 'Subscription data not loaded' });
        }

        // ✅ Check Subscription Validity
        const expirationDate = new Date(subscriptionData.productKey.expirationDate.join('-'));
        const currentDate = new Date();

        if (expirationDate < currentDate) {
            await logApiRequest(req, { error: 'Subscription expired. Please renew.' }, "Failed", submodule, action, module);
            return res.status(403).json({ error: 'Subscription expired. Please renew.' });
        }

        // ✅ Extract Contact Limit from Subscription
        const contactSubscription = subscriptionData.subscriptions.find(
            sub => sub.module === "CRM" && sub.subModule === "contact"
        );
        const maxContactsAllowed = contactSubscription ? contactSubscription.noOfUsers : 0;

        console.log("Max Allowed Contacts:", maxContactsAllowed);

        // ✅ Get Current Contact Count for Customer
        const countQuery = 'SELECT COUNT(*) FROM contacts WHERE customer_id = $1';
        const countResult = await client.query(countQuery, [customer_id]);
        const currentContacts = parseInt(countResult.rows[0].count);

        console.log("Current Contacts:", currentContacts);

        // ✅ Enforce Contact Limit
        if (currentContacts > maxContactsAllowed) {
            await logApiRequest(req, { error: 'Maximum contact limit exceeded. Cannot update contact.' }, "Failed", submodule, action, module);
            return res.status(403).json({ error: 'Maximum contact limit exceeded. Cannot update contact.' });
        }
        */

        // ✅ Update Contact in Database
        const query = `
            UPDATE contacts
            SET customer_id = $1, contact_person = $2, phone_num = $3, email_id = $4, address = $5, city = $6, state = $7, country = $8, pincode = $9, department = $10, designation = $11, 
                date_of_start = $12, date_of_end = $13, status = $14, updated_at = CURRENT_TIMESTAMP
            WHERE contact_id = $15 RETURNING *`;

        const values = [customer_id, contact_person, phone_num, email_id, address, city, state, country, pincode, department, designation, date_of_start, date_of_end, status, contact_id];

        const result = await client.query(query, values);

        if (result.rows.length > 0) {
            const updatedContact = result.rows[0];

            // ✅ Log API Request
            await logApiRequest(req, updatedContact, "Success", submodule, action, module);

            res.json({ message: 'Contact updated successfully', contact: updatedContact });
        } else {
            await logApiRequest(req, { error: 'Contact not found' }, "Failed", submodule, action, module);
            res.status(404).json({ error: 'Contact not found' });
        }
    } catch (err) {
        console.error('Error updating contact:', err);

        // ✅ Log Error
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module);

        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});


// Delete a contact by ID
router.delete('/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect(); // Connect to the pool
    const contact_id = req.params.id;

    const user_id = req.user?.id || req.user?.user_id;
    const submodule = 'Profile';
    const module = 'CRM';
    const action = 'Delete Contact';

    if (!user_id) {
        await logApiRequest(req, { error: 'User ID missing in token' }, "Failed", submodule, action, module);
        return res.status(403).json({ error: 'User ID missing in token' });
    }

    try {
        // Check if contact exists before attempting deletion
        const checkQuery = 'SELECT * FROM contacts WHERE contact_id = $1';
        const checkResult = await client.query(checkQuery, [contact_id]);

        if (checkResult.rows.length === 0) {
            await logApiRequest(req, { error: 'Contact not found' }, "Failed", submodule, action, module);
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Perform deletion
        const deleteQuery = 'DELETE FROM contacts WHERE contact_id = $1 RETURNING *';
        const result = await client.query(deleteQuery, [contact_id]);

        const deletedContact = result.rows[0];

        // ✅ Log successful deletion
        await logApiRequest(req, deletedContact, "Success", submodule, action, module);

        res.json({ message: 'Contact deleted successfully', contact: deletedContact });
    } catch (err) {
        console.error('Error deleting contact:', err);

        // ✅ Log error for failed deletion
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module);

        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release(); // Release the client back to the pool
    }
});


// Filter users
router.get('/filter', async (req, res) => {
    const client = await pool.connect(); // Connect to the pool
    try {
        const { dateFrom, dateTo, city, state, country, department } = req.body;

        // Build the base query
        let query = `SELECT * FROM  s WHERE 1=1`;
        const queryParams = [];

        // Apply specific search filters

        if (dateFrom) {
            query += ` AND created_at >= $${queryParams.length + 1}`;
            queryParams.push(dateFrom);
        }

        if (dateTo) {
            query += ` AND created_at <= $${queryParams.length + 1}`;
            queryParams.push(dateTo);
        }

        if (department) {
            query += ` AND department >= $${queryParams.length + 1}`;
            queryParams.push(department);
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

        // Execute the query
        const result = await client.query(query, queryParams);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});

// Export the router
module.exports = router;
