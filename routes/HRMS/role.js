const express = require('express');
const router = express.Router();
const { pool } = require('../../config.js'); // Use the connection pool from config
const { logApiRequest } = require('../../logs/logger.js');
const { authenticateToken } = require('../../index.js');

router.use(express.json());

// POST /role - Add a new role
router.post('/', authenticateToken, async (req, res) => {
    const { role, description, access } = req.body;
    const submodule = 'User Management';
    const action = 'Add Role';
    const module = 'HRMS';
    const user_id = req.user?.id || req.user?.user_id;

    if (!role) {
        await logApiRequest(req, { error: 'Role is required' }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: 'Role is required' });
    }

    const client = await pool.connect();
    try {
        const query = 'INSERT INTO role (role, description, access) VALUES ($1, $2, $3) RETURNING *';
        const values = [role, description || null, access || null];
        const result = await client.query(query, values);
        const newRole = result.rows[0];

        await logApiRequest(req, newRole, "Success", submodule, action, module, user_id);
        res.status(201).json({ message: 'Role added successfully.', role: newRole });
    } catch (err) {
        console.error('Error adding role:', err);
        await logApiRequest(req, { error: 'Internal server error', message: err.detail }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error', message: err.detail });
    } finally {
        client.release();
    }
});

// GET /role - Retrieve all roles
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM role');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error retrieving roles:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// DELETE /role - Delete a role
router.delete('/', authenticateToken, async (req, res) => {
    const { id } = req.body;
    const submodule = 'User Management';
    const action = 'Delete Role';
    const module = 'HRMS';
    const user_id = req.user?.id || req.user?.user_id;

    if (!id) {
        await logApiRequest(req, { error: 'Role ID is required' }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: 'Role ID is required' });
    }

    const client = await pool.connect();
    try {
        const result = await client.query('DELETE FROM role WHERE role_id = $1 RETURNING *', [id]);
        if (result.rows.length > 0) {
            await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
            res.json({ message: 'Role deleted successfully', role: result.rows[0] });
        } else {
            await logApiRequest(req, { error: 'Role not found' }, "Failed", submodule, action, module, user_id);
            res.status(404).json({ error: 'Role not found' });
        }
    } catch (err) {
        console.error('Error deleting role:', err);
        await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// POST route to check email and update user role
router.post('/update-role', authenticateToken, async (req, res) => {
    const { email, newRole } = req.body;
    const submodule = 'User Management';
    const action = 'Update User Role';
    const module = 'HRMS';
    const user_id = req.user?.id || req.user?.user_id;

    if (!email || !newRole) {
        await logApiRequest(req, { error: 'Email and new role are required' }, "Failed", submodule, action, module, user_id);
        return res.status(400).json({ error: 'Email and new role are required.' });
    }
    const client = await pool.connect();
    try {
        const updateRoleQuery = 'UPDATE users SET role = $1 WHERE email = $2 RETURNING *';
        const updatedUser = await client.query(updateRoleQuery, [newRole, email]);

        await logApiRequest(req, updatedUser.rows[0], "Success", submodule, action, module, user_id);
        res.status(200).json({ message: 'User role updated successfully.', user: updatedUser.rows[0] });
    } catch (error) {
        console.error('Error updating user role:', error);
        await logApiRequest(req, { error: 'Internal server error', message: error.detail }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error', message: error.detail });
    } finally {
        client.release();
    }
});

module.exports = router;
