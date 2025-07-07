const express = require('express');
const router = express.Router();
const { pool } = require("../../config");
const { logApiRequest } = require('../../logs/logger.js');
const { authenticateToken } = require('../../index.js');



// POST API: Add a new user-workflow relationship
router.post('/',authenticateToken, async (req, res) => {
    const { userid, workflowid } = req.body;
    const client = await pool.connect();
    const submodule = 'User Workflow Assignment';
    const action = 'Assign Workflow to User';
    const module = 'Asset Management';
    const user_id = userid

    try {
        // Check if the user exists
        const userCheck = await client.query('SELECT * FROM users WHERE user_id = $1', [userid]);
        if (userCheck.rowCount === 0) {
            await logApiRequest(req, { error: 'User does not exist.' }, "Failed", submodule, action, module, user_id);
            return res.status(404).json({ error: 'User does not exist.' });
        }

        // Check if the workflow exists
        const workflowCheck = await client.query('SELECT * FROM work_flow_ WHERE workflowid = $1', [workflowid]);
        if (workflowCheck.rowCount === 0) {
            await logApiRequest(req, { error: 'Workflow does not exist.' }, "Failed", submodule, action, module, user_id);
            return res.status(404).json({ error: 'Workflow does not exist.' });
        }

        // Check if the relationship already exists
        const relationshipCheck = await client.query(
            'SELECT * FROM User_workflow WHERE userid = $1 AND workflowid = $2',
            [userid, workflowid]
        );
        if (relationshipCheck.rowCount > 0) {
            await logApiRequest(req, { error: 'User already assigned to this workflow.' }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({ error: 'User already assigned to this workflow.' });
        }

        // Insert the relationship
        const result = await client.query(
            'INSERT INTO User_workflow (userid, workflowid) VALUES ($1, $2) RETURNING *',
            [userid, workflowid]
        );

        await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error assigning workflow:', error);
        await logApiRequest(req, { error: 'Internal server error', message: error.detail }, "Failed", submodule, action, module, user_id);

        if (error.code === '23505') {
            res.status(400).json({ error: 'User already assigned to a workflow.' });
        } else {
            res.status(500).json({ error: 'Internal server error.' });
        }
    } finally {
        client.release();
    }
});



// GET API: Retrieve all user-workflow relationships for a specific user
router.get('/:id', async (req, res) => {
    const { id } = req.params; // User ID
    const client = await pool.connect();

    try {
        // Query to fetch all user-workflow relationships for the given user ID
        const result = await client.query(
            'SELECT * FROM user_workflow WHERE workflowid = $1', 
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'No user found for the specified workflow.' });
        }

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error retrieving user-workflow relationships:', error);
        res.status(500).json({ error: 'Internal server error.' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});


// DELETE API: Delete a specific user-workflow relationship
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    const submodule = 'User Workflow Assignment';
    const action = 'Delete User-Workflow Mapping';
    const module = 'Asset Management';
    const user_id = req.user?.id || req.user?.user_id;

    try {
        const result = await client.query('DELETE FROM User_workflow WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            await logApiRequest(req, { error: 'Record not found.' }, "Failed", submodule, action, module, user_id);
            return res.status(404).json({ error: 'Record not found.' });
        }

        await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
        res.status(200).json({
            message: 'Record deleted successfully.',
            deleted: result.rows[0],
        });
    } catch (error) {
        console.error('Error deleting user-workflow mapping:', error);
        await logApiRequest(req, { error: 'Internal server error', message: error.detail }, "Failed", submodule, action, module, user_id);
        res.status(500).json({ error: 'Internal server error.' });
    } finally {
        client.release();
    }
});


module.exports = router;