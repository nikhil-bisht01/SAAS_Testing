// routes/api_access.js
const express = require('express');
const router = express.Router();
const { pool } = require("../../config");
const { authenticateToken } = require('../../index');
const { checkAccess } = require('../../index');

// Middleware to parse JSON bodies
router.use(express.json());

// Sanitize schema name to allow only alphanumeric + underscores
const sanitizeSchema = (schema) => schema.replace(/[^a-zA-Z0-9_]/g, '');

// 🔐 Get all API access (with schema)
router.get('/', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  const schema = sanitizeSchema(req.user.to);

  try {
    const result = await client.query(`SELECT * FROM ${schema}.api_access`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching API access:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// 🔐 Update API access
router.put('/update_access', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  const { user_id, api_access, module } = req.body;
  const schema = sanitizeSchema(req.user.to);

  try {
    const userQuery = `SELECT user_id, email FROM ${schema}.users WHERE user_id = $1`;
    const userResult = await client.query(userQuery, [user_id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found. Please check the user_id provided.' });
    }

    const user_email = userResult.rows[0].email;

    if (user_email === process.env.Mail) {
      return res.status(403).json({ error: 'Super Admin access cannot be modified.' });
    }

    const deleteQuery = `DELETE FROM ${schema}.api_access WHERE user_id = $1 AND module = $2`;
    await client.query(deleteQuery, [user_id, module]);

    if (api_access.length > 0) {
      const valuePlaceholders = api_access.map((_, i) => `($1, $2, $${i + 3})`).join(', ');
      const values = [user_id, module, ...api_access];

      const accessQuery = `
        INSERT INTO ${schema}.api_access (user_id, module, api_name)
        VALUES ${valuePlaceholders}`;
      await client.query(accessQuery, values);
    }

    const updatedAccessQuery = `SELECT api_name FROM ${schema}.api_access WHERE user_id = $1 AND module = $2`;
    const updatedAccessResult = await client.query(updatedAccessQuery, [user_id, module]);

    const updatedApis = updatedAccessResult.rows.map(row => row.api_name);

    res.status(200).json({
      message: 'API access updated successfully.',
      updatedAccess: updatedApis
    });
  } catch (err) {
    console.error('Error updating API access:', err);
    res.status(500).json({ error: 'Internal server error', message: err.detail });
  } finally {
    client.release();
  }
});



// 🔐 Verify API access
router.post('/verify-access', authenticateToken, async (req, res) => {
  const { user_id, pages } = req.body;
  const client = await pool.connect();
  const schema = sanitizeSchema(req.user.to);

  if (!user_id || !pages) {
    return res.status(404).json({ error: 'User or pages not found. Please check the data provided.' });
  }

  try {
    const query = `SELECT api_name FROM ${schema}.api_access WHERE user_id = $1 AND api_name = ANY($2::text[])`;
    const result = await client.query(query, [user_id, pages]);

    const accessiblePages = result.rows.map(row => row.api_name);
    const accessResult = {};
    pages.forEach(page => {
      accessResult[page] = accessiblePages.includes(page);
    });

    res.json(accessResult);
  } catch (err) {
    console.error('Error verifying access:', err);
    res.status(500).json({ error: 'Internal server error', message: err.detail });
  } finally {
    client.release();
  }
});

// 🔐 Get API access for a specific user
router.get('/access/:user_id', authenticateToken, async (req, res) => {
  const { user_id } = req.params;
  const client = await pool.connect();
  const schema = sanitizeSchema(req.user.to);

  try {
    const query = `SELECT * FROM ${schema}.api_access WHERE user_id = $1`;
    const result = await client.query(query, [user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No API access found for the given user_id' });
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching API access for user_id:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// 🔐 Get users assigned to a role
router.get('/role-users', authenticateToken, async (req, res) => {
  const { role } = req.query;
  const client = await pool.connect();
  const schema = sanitizeSchema(req.user.to);

  if (!role) {
    return res.status(400).json({ message: 'Missing required query parameter: role' });
  }

  try {
    const roleCheckQuery = `SELECT * FROM ${schema}.role WHERE role = $1`;
    const roleCheckResult = await client.query(roleCheckQuery, [role]);

    if (roleCheckResult.rows.length === 0) {
      return res.status(404).json({ message: `Role '${role}' does not exist.` });
    }

    const accessQuery = `
      SELECT user_id 
      FROM ${schema}.api_access 
      WHERE module = 'ROLE' AND api_name = $1
    `;
    const accessResult = await client.query(accessQuery, [role]);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({ message: 'No users found for this role.' });
    }

    const userIds = accessResult.rows.map(row => row.user_id);
    res.json({ role, users: userIds });
  } catch (error) {
    console.error('Error fetching users by role:', error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;