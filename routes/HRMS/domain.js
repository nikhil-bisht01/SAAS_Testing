// routes/domain.js
const express = require('express');
const router = express.Router();
const { pool } = require("../../config");
const { logApiRequest } = require('../../logs/logger.js');
const { authenticateToken } = require('../../index.js');

router.use(express.json());

// POST /domain - Add a new domain
router.post('/', authenticateToken, async (req, res) => {
    const { domain_name, description } = req.body;
    const submodule = 'Organization Setup';
    const action = 'Add Domain';
    const module = 'HRMS';
    const user_id = req.user?.id || req.user?.user_id;

    if (!domain_name) {
        await logApiRequest(req, { error: 'Domain name is required' }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: 'Domain name is required' });
    }

    const client = await pool.connect();
    try {
        const query = 'INSERT INTO domain (domain_name, description) VALUES ($1, $2) RETURNING *';
        const values = [domain_name, description];
        const result = await client.query(query, values);
        const newDomain = result.rows[0];

        await logApiRequest(req, newDomain, "Success", submodule, action, module, user_id);
        res.status(201).json({
            message: 'Domain added successfully.',
            domain: newDomain,
        });
    } catch (err) {
        console.error('Error adding domain:', err);
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});

// GET /domain - Retrieve all domains
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM domain');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error retrieving domains:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// DELETE /domain - Delete a domain
router.delete('/:id?', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const submodule = 'Organization Setup';
    const action = 'Delete Domain';
    const module = 'HRMS';
    const user_id = req.user?.id || req.user?.user_id;

    if (!id) {
        await logApiRequest(req, { error: 'Domain ID is required' }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: 'Domain ID is required' });
    }

    const client = await pool.connect();
    try {
        const result = await client.query('DELETE FROM domain WHERE dom_id = $1 RETURNING *', [id]);
        if (result.rows.length > 0) {
            await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
            res.json({ message: 'Domain deleted successfully', domain: result.rows[0] });
        } else {
            await logApiRequest(req, { error: 'Domain not found' }, "Failed", submodule, action, module, user_id);
            res.status(404).json({ error: 'Domain not found' });
        }
    } catch (err) {
        console.error('Error deleting domain:', err);
        await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});




// PUT /domain/:id - Update the status of an existing domain
router.put('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params; // Domain ID
    const { status } = req.body; // Updated status

    const action = 'Update Domain Status';
    const module = 'HRMS';
    const submodule = 'Organization Setup';
    const user_id = req.user?.id || req.user?.user_id;

    const client = await pool.connect();
    try {
        // Ensure domain ID is provided
        if (!id) {
            await logApiRequest(req, { error: 'Domain ID is required' }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({ error: 'Domain ID is required' });
        }

        // Check if the domain exists
        const checkQuery = 'SELECT * FROM domain WHERE dom_id = $1';
        const checkResult = await client.query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            await logApiRequest(req, { error: 'Domain not found' }, "Failed", submodule, action, module, user_id);
            return res.status(404).json({ error: 'Domain not found' });
        }

        // Update only the status field
        const updateQuery = `
            UPDATE domain 
            SET status = $1
            WHERE dom_id = $2 
            RETURNING *`;

        const values = [status || checkResult.rows[0].status, id];

        const result = await client.query(updateQuery, values);
        const updatedDomain = result.rows[0];

        await logApiRequest(req, updatedDomain, "Success", submodule, action, module, user_id);

        res.status(200).json({
            message: 'Domain status updated successfully.',
            domain: updatedDomain,
        });
    } catch (err) {
        console.error('Error updating domain status:', err);
        await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});


module.exports = router;
