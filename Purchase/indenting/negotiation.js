const express = require('express');
const { pool } = require('../../config');
const router = express.Router();
require('dotenv').config();


// API: Move to Transition
router.put('/quotation/:quotationId/selected', async (req, res) => {
    const client = await pool.connect();
    try {
        const { quotationId } = req.params;

        const update = await client.query(
            `UPDATE quotations SET status = 'selected' WHERE id = $1 AND status = 'submitted' RETURNING *`,
            [quotationId]
        );

        if (update.rowCount === 0) {
            return res.status(400).json({ message: "Quotation must be in submitted state to transition." });
        }

        res.json({ message: "Quotation moved to transition stage", quotation: update.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to move quotation to transition" });
    } finally {
        client.release();
    }
});


// Send Message in Transition
router.post('/:quotationId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { quotationId } = req.params;
        const { sender_role, message, attachment_url, status = 'revise' } = req.body;

        if (!['accepted', 'revise', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid message status.' });
        }

        if (typeof message !== 'object' || message === null) {
            return res.status(400).json({ message: 'Message must be a JSON object.' });
        }

        // Check quotation status
        const { rows } = await client.query(
            `SELECT status FROM quotations WHERE id = $1`,
            [quotationId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Quotation not found' });
        }

        const quotationStatus = rows[0].status;

        if (quotationStatus !== 'selected') {
            return res.status(400).json({ message: 'Messaging allowed only when quotation is in selected state.' });
        }

        const finalizedStatuses = ['accepted', 'rejected'];
        const finalStatusRes = await client.query(
            `SELECT COUNT(*) FROM quotation_messages WHERE quotation_id = $1 AND status IN ('accepted', 'rejected')`,
            [quotationId]
        );

        const finalizedCount = parseInt(finalStatusRes.rows[0].count, 10);

        if (finalizedCount > 0) {
            return res.status(400).json({ message: 'Messaging is disabled as quotation is already finalized.' });
        }

        await client.query(
            `INSERT INTO quotation_messages (quotation_id, sender_role, message, attachment_url, status)
             VALUES ($1, $2, $3::jsonb, $4, $5)`,
            [quotationId, sender_role, message, attachment_url || null, status]
        );

        res.json({ message: "Message sent successfully." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to send message.", message: error.detail });
    } finally {
        client.release();
    }
});



// Update Final Status (accept, reject, revise)
router.put('/message/:quotationId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { quotationId } = req.params;
        const { status } = req.body;

        if (!['accepted', 'rejected', 'revise'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        await client.query('BEGIN');

        const updateQuery = `UPDATE quotations SET status = $1 WHERE id = $2 RETURNING *`;
        const { rows } = await client.query(updateQuery, [status, quotationId]);

        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Quotation not found' });
        }

        // Update message statuses for traceability
        await client.query(
            `UPDATE quotation_messages SET status = $1 WHERE quotation_id = $2`,
            [status, quotationId]
        );

        // Optionally delete all messages if rejected
        if (status === 'rejected') {
            await client.query(
                `DELETE FROM quotation_messages WHERE quotation_id = $1`,
                [quotationId]
            );
        }

        await client.query('COMMIT');
        res.json({ message: `Quotation ${status} successfully.` });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ message: 'Error updating quotation status' });
    } finally {
        client.release();
    }
});


// Get all messages for a quotation
router.get('/message/:quotationId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { quotationId } = req.params;

        // Check if quotation exists
        const quotation = await client.query(
            `SELECT id FROM quotations WHERE id = $1`,
            [quotationId]
        );

        if (quotation.rowCount === 0) {
            return res.status(404).json({ message: 'Quotation not found' });
        }

        // Fetch all messages for the quotation
        const result = await client.query(
            `SELECT * FROM quotation_messages 
             WHERE quotation_id = $1 
             ORDER BY created_at ASC`,
            [quotationId]
        );

        res.json({
            quotation_id: quotationId,
            messages: result.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch messages.' });
    } finally {
        client.release();
    }
});

module.exports = router;
