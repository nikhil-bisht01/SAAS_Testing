const express = require('express');
const router = express.Router();
const { pool } = require("../config");

// GET API - Fetch all rows
router.get('/', async (req, res) => {
    const client = await pool.connect();

    try {
        const result = await client.query(`SELECT lg.*, cgt.categoriesname 
                                            FROM entries lg 
                                            LEFT JOIN categories cgt 
                                             ON lg.category_id = cgt.category_id;`);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to fetch entries' });
    }
    finally {
        client.release(); // Release the client back to the pool
    }
});

router.post('/', async (req, res) => {
    const { sender_id, receiver_id, category_id, status, stages, description } = req.body;
    const client = await pool.connect();

    // Define valid statuses and stages, and their transitions
    const validStatuses = ["Draft", "Active", "Inactive"];
    const validStages = ["FormDesign", "Resubmitted", "SubmittedForApproval", "Approved", "Hidden"];
    const validTransitions = {
        "Draft": ["FormDesign", "Resubmitted", "SubmittedForApproval"],
        "Active": ["Approved"],
        "Inactive": ["Hidden"]
    };

    try {
        // Validate required inputs
        if (!sender_id || !receiver_id || !category_id || !status || !stages) {
            return res.status(400).json({
                error: "sender_id, receiver_id, category_id, status, and stages are required."
            });
        }

        // Validate status
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status value." });
        }

        // Validate stage
        if (!validStages.includes(stages)) {
            return res.status(400).json({ error: "Invalid stage value." });
        }

        // Check if the category exists
        const categoryQuery = `SELECT * FROM categories WHERE category_id = $1`;
        const categoryResult = await client.query(categoryQuery, [category_id]);
        if (categoryResult.rowCount === 0) {
            return res.status(404).json({ error: "Category not found." });
        }

        // Validate sender and receiver
        const userQuery = `SELECT user_id FROM users WHERE user_id = ANY($1::int[])`;
        const userResult = await client.query(userQuery, [[sender_id, receiver_id]]);
        if (userResult.rowCount < 1) {
            return res.status(404).json({
                error: "Sender or receiver not found in the system."
            });
        }

        // Validate status and stage transitions
        const currentStatusQuery = `SELECT status FROM categories WHERE category_id = $1`;
        const currentStatusResult = await client.query(currentStatusQuery, [category_id]);

        if (currentStatusResult.rowCount > 0) {
            const { status: currentStatus } = currentStatusResult.rows[0];
            const allowedStages = validTransitions[currentStatus] || [];

            if (!allowedStages.includes(stages)) {
                return res.status(400).json({
                    error: `Invalid stage transition from '${currentStatus}' to '${stages}'.`
                });
            }
        } else {
            return res.status(404).json({ error: "Category not found." });
        }

        // Insert the new entry into the entries table
        const insertQuery = `
            INSERT INTO entries (sender_id, receiver_id, category_id, status, stages, description)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const values = [sender_id, receiver_id, category_id, status, stages, description];
        const result = await client.query(insertQuery, values);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Error creating entry:", err.message);
        res.status(500).json({ error: "Failed to create entry due to an internal server error." });
    } finally {
        client.release(); // Release the client back to the pool
    }
});

// Export the router
module.exports = router;
