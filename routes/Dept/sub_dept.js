// routes/departments.js
const express = require('express');
const router = express.Router();
const { pool } = require("../../config"); // Use the connection pool from config
const { logApiRequest } = require('../../logs/logger.js');
const { authenticateToken } = require('../../index.js');


// POST /sub_departments - Add a new sub-department (vertical)
router.post('/', authenticateToken, async (req, res) => {
    const { dept_id, sub_dept_name, sub_data } = req.body;
    const submodule = 'Organization Setup';
    const action = 'Create Verticals';
    const module = 'HRMS';
    const user_id = req.user?.id || req.user?.user_id;
    // const user_id = null;

    // Ensure department ID and sub-department name are provided
    if (!dept_id || !sub_dept_name) {
        await logApiRequest(req, { error: 'Department ID and Sub-department name are required' }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: 'Department ID and Sub-department name are required' });
    }

    const client = await pool.connect();
    try {
        const query = 'INSERT INTO sub_departments (dept_id, sub_dept_name, sub_data) VALUES ($1, $2, $3) RETURNING *';
        const values = [dept_id, sub_dept_name, sub_data || null];  // Use null if sub_data is not provided
        const result = await client.query(query, values);
        const newSubDepartment = result.rows[0];  // Get the newly added sub-department
        
        await logApiRequest(req, newSubDepartment, "Success", submodule, action, module, user_id);
        res.status(201).json({
            message: 'Sub-department added successfully.',
            sub_department: newSubDepartment,
        });
    } catch (err) {
        console.error('Error adding sub-department:', err);
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release(); // Release the client back to the pool
    }
});


// GET /sub_departments/:dept_id - Retrieve all sub-departments for a department
router.get('/get/:dept_id', async (req, res) => {
    const { dept_id } = req.params;

    const client = await pool.connect();
    try {
        const query = 'SELECT * FROM sub_departments WHERE dept_id = $1';
        const result = await client.query(query, [dept_id]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error retrieving sub-departments:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});


// GET /sub_departments - Retrieve all sub-departments
router.get('/sub_dept', async (req, res) => {
    const client = await pool.connect();
    try {
        const query = 'SELECT * FROM sub_departments';
        const result = await client.query(query);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error retrieving sub-departments:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});



// PUT /sub_departments/:id - Update a sub-department
router.put('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { sub_dept_name, sub_data,status } = req.body;
    const submodule = 'Organization Setup';
    const action = 'Update Vertical';
    const module = 'HRMS';
    const user_id = req.user?.id || req.user?.user_id;

    const client = await pool.connect();
    try {
        const checkQuery = 'SELECT * FROM sub_departments WHERE sub_id = $1';
        const checkResult = await client.query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sub-department not found' });
        }

        const updateQuery = `
            UPDATE sub_departments
            SET sub_dept_name = $1, 
                sub_data = $2, 
                status = $3
            WHERE sub_id = $4
            RETURNING *`;
            
        const values = [
            sub_dept_name || checkResult.rows[0].sub_dept_name,
            sub_data || checkResult.rows[0].sub_data,
            status || checkResult.rows[0].status, // Keep existing status if not provided
            id
        ];

        const result = await client.query(updateQuery, values);
        const updatedSubDepartment = result.rows[0];

        res.status(200).json({
            message: 'Sub-department updated successfully.',
            sub_department: updatedSubDepartment,
        });
    } catch (err) {
        console.error('Error updating sub-department:', err);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});


// DELETE /sub_departments/:id - Delete a sub-department
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const submodule = 'Organization Setup';
    const action = 'Delete Vertical';
    const module = 'HRMS';
    const user_id = req.user?.id || req.user?.user_id;

    const client = await pool.connect();
    try {
        const query = 'DELETE FROM sub_departments WHERE sub_id = $1 RETURNING *';
        const result = await client.query(query, [id]);

        if (result.rows.length > 0) {
            await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
            res.json({ message: 'Sub-department deleted successfully', sub_department: result.rows[0] });
        } else {
            await logApiRequest(req, { error: 'Sub-department not found' }, "Failed", submodule, action, module, user_id);
            res.status(404).json({ error: 'Sub-department not found' });
        }
    } catch (err) {
        console.error('Error deleting sub-department:', err);
        await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});


// Export the router
module.exports = router;