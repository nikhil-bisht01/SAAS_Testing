require('dotenv').config();
const express = require('express');
const router = express.Router();
const { pool } = require('../config');

// CREATE a new DMS_publish entry
router.post('/', async (req, res) => {
  try {
    const {
      service_id,
      doctype_id,
      allow_doc_id,
      format,
      allowed_size,
      review,
      visibility,
      approval_needed,
      workflow_id,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO DMS_publish (service_id, doctype_id, allow_doc_id, format, allowed_size , review, visibility, approval_needed,
      workflow_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,$9) RETURNING *`,
      [service_id, doctype_id, allow_doc_id, format, allowed_size, review , visibility, approval_needed,
      workflow_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting DMS_publish:', err.message);
    res.status(500).json({ error: 'Internal server error',message:err.detail });
  }
});

// GET all DMS_publish entries
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM DMS_publish ORDER BY id ASC ');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching DMS_publish:', err.message);
    res.status(500).json({ error: 'Internal server error', });
  }
});

// UPDATE DMS_publish by ID
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      service_id,
      doctype_id,
      allow_doc_id,
      format,
      allowed_size,
      review,
    } = req.body;

    const result = await pool.query(
      `UPDATE DMS_publish SET
        service_id = $1,
        doctype_id = $2,
        allow_doc_id = $3,
        format = $4,
        allowed_size = $5,
        review = $6
       WHERE id = $7 RETURNING *`,
      [service_id, doctype_id, allow_doc_id, format, allowed_size, review, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'DMS_publish not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating DMS_publish:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE DMS_publish by ID
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM DMS_publish WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'DMS_publish not found' });
    }

    res.json({ message: 'DMS_publish deleted successfully' });
  } catch (err) {
    console.error('Error deleting DMS_publish:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});


//visibility

router.put('/visibility/:id', async (req, res) => {
  const { id } = req.params;
  const { visibility } = req.body;
  const client = await pool.connect();

  try {
    // Validate visibility input
    if (typeof visibility !== 'boolean') {
      return res.status(400).json({ error: 'Visibility must be a boolean (true or false)' });
    }

    const result = await client.query(
      'UPDATE DMS_publish SET visibility = $1 WHERE id = $2 RETURNING id, visibility',
      [visibility, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'DMS_publish not found' });
    }

    res.status(200).json({
      message: 'Document visibility updated successfully',
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating document visibility:', error);
    res.status(500).json({ error: 'Failed to update document visibility', message: error.message });
  } finally {
    client.release();
  }
});



// GET DMS_publish by names of service, doctype, and allow_doc
router.get('/check', async (req, res) => {
  const { service_name, doctype, doc_name } = req.query;

  if (!service_name || !doctype || !doc_name) {
    return res.status(400).json({ error: 'Missing required query parameters: service_name, doctype, doc_name' });
  }

  const client = await pool.connect();
  try {
    // Fetch IDs
    const serviceResult = await client.query(`SELECT id FROM DMS_service WHERE name = $1`, [service_name]);
    if (serviceResult.rowCount === 0) {
      return res.status(404).json({ error: `Service '${service_name}' not found. Please talk to your admin` });
    }

    const doctypeResult = await client.query(`SELECT id FROM DMS_doctype WHERE doctype = $1`, [doctype]);
    if (doctypeResult.rowCount === 0) {
      return res.status(404).json({ error: `Doctype '${doctype}' not found. Please talk to your admin` });
    }

    const allowDocResult = await client.query(`SELECT id FROM DMS_allow_doc WHERE doc_name = $1`, [doc_name]);
    if (allowDocResult.rowCount === 0) {
      return res.status(404).json({ error: `Allowed document '${doc_name}' not found. Please talk to your admin` });
    }

    const service_id = serviceResult.rows[0].id;
    const doctype_id = doctypeResult.rows[0].id;
    const allow_doc_id = allowDocResult.rows[0].id;

    // Check in DMS_publish
    const publishResult = await client.query(
      `SELECT id FROM DMS_publish WHERE service_id = $1 AND doctype_id = $2 AND allow_doc_id = $3`,
      [service_id, doctype_id, allow_doc_id]
    );

    if (publishResult.rowCount === 0) {
      return res.status(404).json({ error: 'No matching found for the given combination. Please talk to your admin' });
    }

    res.status(200).json({ dms_publish_id: publishResult.rows[0].id });

  } catch (err) {
    console.error('Error checking DMS_publish:', err.message);
    res.status(500).json({ error: 'Internal server error', message: err.detail });
  } finally {
    client.release();
  }
});


module.exports = router;
