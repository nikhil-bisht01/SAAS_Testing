const express = require('express');
const router = express.Router();
const { pool } = require('../../config'); // Import the pool from config
const { authenticateToken } = require('../../index');

// Create a new category
router.post('/create', async (req, res) => {
  const { category, description, status } = req.body;
  try {
    // Check for duplicate category
    const existing = await pool.query('SELECT * FROM user_categories WHERE category = $1', [category]);
    if (existing.rowCount > 0) {
      return res.status(400).json({ success: false, message: 'Category already exists.' });
    }

    const result = await pool.query(
      `INSERT INTO user_categories (category, description, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [category, description, status || 'active']
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all categories
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM user_categories ORDER BY category_id ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get category by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM user_categories WHERE category_id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update category (partial update allowed)
router.put('/update/:id', async (req, res) => {
  const { id } = req.params;
  const { category, description, status } = req.body;

  try {
    const fields = [];
    const values = [];
    let index = 1;

    if (category !== undefined) {
      fields.push(`category = $${index++}`);
      values.push(category);
    }
    if (description !== undefined) {
      fields.push(`description = $${index++}`);
      values.push(description);
    }
    if (status !== undefined) {
      fields.push(`status = $${index++}`);
      values.push(status);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided to update.' });
    }

    values.push(id); // for WHERE clause

    const query = `
      UPDATE user_categories
      SET ${fields.join(', ')}
      WHERE category_id = $${index}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete category
router.delete('/delete/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM user_categories WHERE category_id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    res.json({ success: true, message: 'Category deleted successfully.', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});



// Export the router
module.exports = router;