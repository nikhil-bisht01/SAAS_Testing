// routes/designation.js
const express = require('express');
const router = express.Router();
const { pool } = require("../../config"); // Use the connection pool from config
const { logApiRequest } = require('../../logs/logger.js');
const { authenticateToken } = require('../../index.js');

// Middleware to parse JSON bodies
router.use(express.json());


// POST /designation - Add a new designation
router.post('/', authenticateToken, async (req, res) => {
    const { designation, description } = req.body;
    const action = 'Add Designation';
    const module = 'HRMS';
    const submodule = 'Organization Setup';
    const user_id = req.user?.id || req.user?.user_id;

    if (!designation) {
        await logApiRequest(req, { error: 'Designation is required' }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: 'Designation is required' });
    }

    const client = await pool.connect();
    try {
        const query = 'INSERT INTO designation (designation, description) VALUES ($1, $2) RETURNING *';
        const values = [designation, description];
        const result = await client.query(query, values);
        const newDesignation = result.rows[0];

        await logApiRequest(req, newDesignation, "Success", submodule, action, module, user_id);
        res.status(201).json({
            message: 'Designation added successfully.',
            designation: newDesignation,
        });
    } catch (err) {
        console.error('Error adding designation:', err);
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});

// GET /designation - Retrieve all designations
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM designation');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error retrieving designations:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// DELETE /designation - Delete a designation
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const action = 'Delete Designation';
    const module = 'HRMS';
    const submodule = 'Organization Setup';
    const user_id = req.user?.id || req.user?.user_id;

    if (!id) {
        await logApiRequest(req, { error: 'Designation ID is required' }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: 'Designation ID is required' });
    }

    const client = await pool.connect();
    try {
        const result = await client.query('DELETE FROM designation WHERE desig_id = $1 RETURNING *', [id]);
        if (result.rows.length > 0) {
            await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
            res.json({ message: 'Designation deleted successfully', designation: result.rows[0] });
        } else {
            await logApiRequest(req, { error: 'Designation not found' }, "Failed", submodule, action, module, user_id);
            res.status(404).json({ error: 'Designation not found' });
        }
    } catch (err) {
        console.error('Error deleting designation:', err);
        await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});



// PUT /designation/:id - Update an existing designation
router.put('/:id', async (req, res) => {
    const { id } = req.params; // Designation ID
    const { designation, description, status } = req.body; // Updated designation details
    const action = 'Update Designation';
    const module = 'HRMS';
    const submodule = 'Organization Setup';
    const user_id = req.user?.id || req.user?.user_id;

    const client = await pool.connect(); // Connect to the pool
    try {
        // Ensure designation ID is provided
        if (!id) {
            return res.status(400).json({ error: 'Designation ID is required' });
        }

        // Check if the designation exists
        const checkQuery = 'SELECT * FROM designation WHERE desig_id = $1';
        const checkResult = await client.query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Designation not found' });
        }

        // Prepare the update query
        const updateQuery = `
            UPDATE designation 
            SET designation = $1, 
                description = $2, 
                status = $3
            WHERE desig_id = $4 
            RETURNING *`;
            
        const values = [
            designation || checkResult.rows[0].designation,
            description || checkResult.rows[0].description,
            status || checkResult.rows[0].status, // Keep existing status if not provided
            id
        ];

        // Execute the update query
        const result = await client.query(updateQuery, values);
        const updatedDesignation = result.rows[0];

        await logApiRequest(req, updatedDesignation, "Success", submodule, action, module, user_id);
        res.status(200).json({
            message: 'Designation updated successfully.',
            designation: updatedDesignation,
        });
    } catch (err) {
        console.error('Error updating designation:', err);
        await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});



module.exports = router;
