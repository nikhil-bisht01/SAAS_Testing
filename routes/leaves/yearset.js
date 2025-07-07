const express = require('express');
const router = express.Router();
const { pool } = require("../../config");
const { authenticateToken } = require('../../index');

// POST /year_set - Create a new year setting
router.post('/year', authenticateToken, async (req, res) => {
    const { year_type, start_date, end_date, description } = req.body;

    if (!year_type || !start_date || !end_date) {
        return res.status(400).json({ error: 'year_type, start_date, and end_date are required' });
    }

    // Convert dates to proper format (YYYY-MM-DD)
    const startDate = new Date(start_date).toISOString().split('T')[0]; // Get date in YYYY-MM-DD format
    const endDate = new Date(end_date).toISOString().split('T')[0]; // Get date in YYYY-MM-DD format

    const client = await pool.connect();
    try {
        // Step 1: Check for overlapping year settings
        const overlapCheckQuery = `
            SELECT * FROM year_settings 
            WHERE ($1 BETWEEN start_date AND end_date) OR ($2 BETWEEN start_date AND end_date)
        `;
        const overlapCheckResult = await client.query(overlapCheckQuery, [startDate, endDate]);

        if (overlapCheckResult.rows.length > 0) {
            return res.status(400).json({ error: 'New year setting overlaps with existing year settings' });
        }

        // Step 2: Insert the new year setting
        const query = `
            INSERT INTO year_settings (year_type, start_date, end_date, description)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const values = [year_type, startDate, endDate, description];
        const result = await client.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating year setting:', err);
        res.status(500).json({ error: 'Failed to create year setting', message: err.detail });
    } finally {
        client.release();
    }
});




// GET /year_set - Retrieve all year settings
router.get('/year', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const query = 'SELECT * FROM year_settings ORDER BY start_date';
        const result = await client.query(query);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching year settings:', err);
        res.status(500).json({ error: 'Failed to fetch year settings', message: err.detail });
    } finally {
        client.release();
    }
});


// DELETE /year/:id - Delete a year setting by ID
router.delete('/year/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        // Check if the year setting exists
        const checkQuery = `SELECT * FROM year_settings WHERE id = $1`;
        const checkResult = await client.query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Year setting not found' });
        }

        // Delete the year setting
        const deleteQuery = `DELETE FROM year_settings WHERE id = $1 RETURNING *`;
        const deleteResult = await client.query(deleteQuery, [id]);

        res.status(200).json({
            message: 'Year setting deleted successfully',
            deleted_setting: deleteResult.rows[0]
        });
    } catch (err) {
        console.error('Error deleting year setting:', err);
        res.status(500).json({ error: 'Failed to delete year setting', message: err.detail });
    } finally {
        client.release();
    }
});





// POST /working_days - Create new working days
router.post('/days', authenticateToken, async (req, res) => {
    const { year_type, working_day } = req.body; // working_day is expected to be an array

    // Check if required fields are provided
    if (!year_type || !Array.isArray(working_day) || working_day.length === 0) {
        return res.status(400).json({ error: 'year_type must be provided and working_day must be a non-empty array' });
    }
    z
    const client = await pool.connect();
    try {
        // Step 1: Delete existing entries for the year_type
        const deleteQuery = `DELETE FROM working_days WHERE year_type = $1`;
        await client.query(deleteQuery, [year_type]);

        // Step 2: Insert new working days
        const insertPromises = working_day.map(day => {
            const query = `
                INSERT INTO working_days (year_type, working_days)
                VALUES ($1, $2)
                RETURNING *
            `;
            const values = [year_type, day];
            return client.query(query, values); // Return promise for each insert
        });

        // Execute all insert promises
        const results = await Promise.all(insertPromises);

        // Respond with the created entries
        res.status(201).json(results.map(result => result.rows[0]));
    } catch (err) {
        console.error('Error creating working days:', err);
        res.status(500).json({ error: 'Failed to create working days', message: err.detail });
    } finally {
        client.release(); // Ensure the client is released
    }
});




// GET /working_days - Retrieve all working days
router.get('/days', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const query = 'SELECT * FROM working_days';
        const result = await client.query(query);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching working days:', err);
        res.status(500).json({ error: 'Failed to fetch working days', message: err.detail });
    } finally {
        client.release();
    }
});




// POST /holidays - Create new holidays
router.post('/holidays', authenticateToken, async (req, res) => {
    const holidays = req.body; // Expecting an array of holiday objects

    if (!Array.isArray(holidays) || holidays.length === 0) {
        return res.status(400).json({ error: 'An array of holidays is required' });
    }

    const client = await pool.connect();
    try {
        const results = [];

        for (const holiday of holidays) {
            const { holiday_name, holiday_date, description } = holiday;

            if (!holiday_name || !holiday_date) {
                return res.status(400).json({ error: 'holiday_name and holiday_date are required for each holiday' });
            }

            // Step 1: Check for existing holiday
            const existingHolidayQuery = `
                SELECT * FROM holidays
                WHERE holiday_name = $1 AND holiday_date = $2
            `;
            const existingHolidayResult = await client.query(existingHolidayQuery, [holiday_name, holiday_date]);

            if (existingHolidayResult.rows.length > 0) {
                return res.status(400).json({ error: `Holiday already exists: ${holiday_name} on ${holiday_date}` });
            }

            // Step 2: Determine the year type based on holiday_date
            const yearTypeQuery = `
                SELECT year_type FROM year_settings
                WHERE $1 BETWEEN start_date AND end_date
            `;
            const yearTypeResult = await client.query(yearTypeQuery, [holiday_date]);

            if (yearTypeResult.rows.length === 0) {
                return res.status(400).json({ error: `Holiday date ${holiday_date} does not fall within any defined year settings` });
            }

            const year_type = yearTypeResult.rows[0].year_type; // Get the year type

            // Step 3: Insert the holiday into the holidays table
            const query = `
                INSERT INTO holidays (holiday_name, holiday_date, year_type, description)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            const values = [holiday_name, holiday_date, year_type, description];
            const result = await client.query(query, values);
            results.push(result.rows[0]); // Store the result
        }

        res.status(201).json(results); // Return all inserted holidays
    } catch (err) {
        console.error('Error creating holidays:', err);
        res.status(500).json({ error: 'Failed to create holidays', message: err.detail });
    } finally {
        client.release();
    }
});


// DELETE /holidays - Delete a holiday
router.delete('/holidays', authenticateToken, async (req, res) => {
    const { holiday_name, holiday_date } = req.body; // Expecting holiday_name and holiday_date in the request body

    // Check if required fields are provided
    if (!holiday_name || !holiday_date) {
        return res.status(400).json({ error: 'holiday_name and holiday_date are required' });
    }

    const client = await pool.connect();
    try {
        // Step 1: Check for existing holiday
        const existingHolidayQuery = `
            SELECT * FROM holidays
            WHERE holiday_name = $1 AND holiday_date = $2
        `;
        const existingHolidayResult = await client.query(existingHolidayQuery, [holiday_name, holiday_date]);

        if (existingHolidayResult.rows.length === 0) {
            return res.status(404).json({ error: `Holiday not found: ${holiday_name} on ${holiday_date}` });
        }

        // Step 2: Delete the holiday
        const deleteQuery = `
            DELETE FROM holidays
            WHERE holiday_name = $1 AND holiday_date = $2
            RETURNING *
        `;
        const deleteResult = await client.query(deleteQuery, [holiday_name, holiday_date]);

        // Respond with the deleted holiday details
        res.status(200).json({ message: 'Holiday deleted successfully', deletedHoliday: deleteResult.rows[0] });
    } catch (err) {
        console.error('Error deleting holiday:', err);
        res.status(500).json({ error: 'Failed to delete holiday', message: err.detail });
    } finally {
        client.release(); // Ensure the client is released
    }
});





// GET /holidays - Retrieve all holidays with upcoming ones on top
router.get('/holidays', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        // Get today's date in the format YYYY-MM-DD
        const today = new Date().toISOString().split('T')[0];

        const query = `
            SELECT * FROM holidays
            ORDER BY 
                CASE 
                    WHEN holiday_date >= $1 THEN 0 
                    ELSE 1 
                END, 
                holiday_date
        `;
        const result = await client.query(query, [today]);

        // Format the holiday_date before sending the response
        const holidays = result.rows.map(holiday => ({
            ...holiday,
            holiday_date: holiday.holiday_date.toISOString().split('T')[0] // Send only the date part
        }));

        res.status(200).json(holidays);
    } catch (err) {
        console.error('Error fetching holidays:', err);
        res.status(500).json({ error: 'Failed to fetch holidays', message: err.detail });
    } finally {
        client.release();
    }
});


module.exports = router;