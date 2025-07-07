// routes/departments.js
const express = require('express');
const router = express.Router();
const { pool } = require("../../config"); // Use the connection pool from config
const { logApiRequest } = require('../../logs/logger.js');
const { authenticateToken } = require('../../index.js');

// Middleware to parse JSON bodies
router.use(express.json());

// POST /departments - Add a new department
router.post('/', authenticateToken, async (req, res) => {
    const { dept_name, dept_data } = req.body;
    const submodule = 'Organization Setup';
    const action = 'Add Department';
    const module = 'HRMS';
    const user_id = req.user?.id || req.user?.user_id;

    if (!dept_name) {
        await logApiRequest(req, { error: 'Department name is required' }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: 'Department name is required' });
    }

    const client = await pool.connect();
    try {
        const query = 'INSERT INTO departments (dept_name, dept_data) VALUES ($1, $2) RETURNING *';
        const values = [dept_name, dept_data]; // Fixed: Added user_id
        const result = await client.query(query, values);
        const newDepartment = result.rows[0];

        await logApiRequest(req, newDepartment, "Success", submodule, action, module, user_id);
        res.status(201).json({
            message: 'Department added successfully.',
            department: newDepartment,
        });
    } catch (err) {
        console.error('Error adding department:', err);
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});

// PUT /departments/:id - Update an existing department
router.put('/:id',authenticateToken, async (req, res) => {
    const { id } = req.params; // Department ID
    const { dept_name, dept_data, status } = req.body; // New department details
    const user_id = req.user?.id || req.user?.user_id;

    const submodule = "Organization Setup";
    const action = "Update Department";
    const module = "HRMS";


    const client = await pool.connect(); // Connect to the pool
    try {
        // Ensure department ID is provided
        if (!id) {
            await logApiRequest(req, { error: 'Department ID is required' }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({ error: 'Department ID is required' });
        }

        // Check if the department exists
        const checkQuery = 'SELECT * FROM departments WHERE dept_id = $1';
        const checkResult = await client.query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Department not found' });
        }

        // Prepare the update query
        const updateQuery = `
            UPDATE departments 
            SET dept_name = $1, 
                dept_data = $2, 
                status = $3 
            WHERE dept_id = $4 
            RETURNING *`;
        const values = [
            dept_name || checkResult.rows[0].dept_name,
            dept_data || checkResult.rows[0].dept_data,
            status || checkResult.rows[0].status, // Default to existing status if not provided
            id
        ];

        // Execute the update query
        const result = await client.query(updateQuery, values);
        const updatedDepartment = result.rows[0];

        await logApiRequest(req, updatedDepartment, "Success", submodule, action, module, user_id);
        res.status(200).json({
            message: 'Department updated successfully.',
            department: updatedDepartment,
        });
    } catch (err) {
        console.error('Error updating department:', err);
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});


// GET /departments - Retrieve all departments
router.get('/', async (req, res) => {
    const client = await pool.connect(); // Connect to the pool
    try {
        const result = await client.query('SELECT * FROM departments');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error retrieving departments:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});

// DELETE /departments/:id - Delete a department
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const user_id = req.user?.id || req.user?.user_id;

    const submodule = "Organization Setup";
    const action = "Delete Department";
    const module = "HRMS";

    if (!id) {
        await logApiRequest(req, { error: 'Department ID is required' }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: 'Department ID is required' });
    }

    const client = await pool.connect();
    try {
        const query = 'DELETE FROM departments WHERE dept_id = $1 RETURNING *';
        const result = await client.query(query, [id]);

        if (result.rows.length > 0) {
            await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
            res.json({ message: 'Department deleted successfully', department: result.rows[0] });
        } else {
            await logApiRequest(req, { error: 'Department not found' }, "Failed", submodule, action, module, user_id);
            res.status(404).json({ error: 'Department not found' });
        }
    } catch (err) {
        console.error('Error deleting department:', err);
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});



// Filter users
router.get('/filter', async (req, res) => {
    const client = await pool.connect(); // Connect to the pool
    try {
        const { dateFrom, dateTo} = req.body;

        // Build the base query
        let query = `SELECT * FROM departments WHERE 1=1`;
        const queryParams = [];

     

        if (dateFrom) {
            query += ` AND created_at >= $${queryParams.length + 1}`;
            queryParams.push(dateFrom);
        }

        if (dateTo) {
            query += ` AND created_at <= $${queryParams.length + 1}`;
            queryParams.push(dateTo);
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
