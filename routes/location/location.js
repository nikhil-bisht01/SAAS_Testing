const express = require('express');
const router = express.Router();
const { pool } = require('../../config.js'); // Use the connection pool from config
const { logApiRequest } = require('../../logs/logger.js');
const { authenticateToken } = require('../../index.js');

router.use(express.json());

// Get all countrys
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM location');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching countrys:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release(); // Always release the client in a finally block
  }
});

// Delete a country (location)
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const module = 'HRMS';
  const submodule = 'Organization Setup';
  const action = 'Delete Country';
  const user_id = req.user?.id || req.user?.user_id;
  const client = await pool.connect();

  if (!id) {
    await logApiRequest(req, { error: 'Country ID is required' }, "Failed", submodule, action, module, user_id);
    return res.status(400).json({ error: 'Country ID is required' });
  }

  try {
    const query = 'DELETE FROM location WHERE location_id = $1 RETURNING *';
    const result = await client.query(query, [id]);
    if (result.rows.length > 0) {
      await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
      res.json({ message: 'Deleted successfully', country: result.rows[0] });
    } else {
      await logApiRequest(req, { error: 'Country not found' }, "Failed", submodule, action, module, user_id);
      res.status(404).json({ error: 'Country not found' });
    }
  } catch (err) {
    console.error('Error deleting location:', err);
    await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});


// Add a new location
router.post('/', authenticateToken, async (req, res) => {
  const { locality, city, state, country, code, remarks } = req.body;
  const module = 'HRMS';
  const submodule = 'Organization Setup';
  const action = 'Add Location';
  const user_id = req.user?.id || req.user?.user_id; // Extract user_id only for logs

  const client = await pool.connect();

  if (!locality || !city || !state || !country || !code) {
    await logApiRequest(req, { error: 'Missing required fields' }, "Failed", submodule, action, module, user_id);
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // Insert into location table (without user_id)
    const result = await client.query(
      `INSERT INTO location (locality, city, state, country, code, remarks) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [locality, city, state, country, code, remarks]
    );

    // Log the API request with user_id (but not storing it in location)
    await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);

    res.status(201).json({ message: 'Location added successfully', location: result.rows[0] });
  } catch (error) {
    console.error('Error adding location:', error);
    await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /location/:id - Partially update an existing location
router.patch('/:id', async (req, res) => {
  const client = await pool.connect();
  const { id } = req.params;
  const { locality, city, state, country, code, remarks, status } = req.body;
  const module = 'HRMS';
  const submodule = 'Organization Setup';
  const action = 'Update Location';
  const user_id = req.user?.id || req.user?.user_id;


  // Ensure at least one field is provided for updating
  if (!locality && !city && !state && !country && !code && !remarks) {
    await logApiRequest(req, { error: 'No fields provided to update' }, "Failed", submodule, action, module, user_id);
    return res.status(400).json({ message: 'No fields provided to update' });
  }

  try {
    // Build dynamic query for updating only provided fields
    const fieldsToUpdate = [];
    const values = [];

    if (locality) {
      fieldsToUpdate.push('locality = $' + (fieldsToUpdate.length + 1));
      values.push(locality);
    }
    if (city) {
      fieldsToUpdate.push('city = $' + (fieldsToUpdate.length + 1));
      values.push(city);
    }
    if (state) {
      fieldsToUpdate.push('state = $' + (fieldsToUpdate.length + 1));
      values.push(state);
    }
    if (country) {
      fieldsToUpdate.push('country = $' + (fieldsToUpdate.length + 1));
      values.push(country);
    }
    if (code) {
      fieldsToUpdate.push('code = $' + (fieldsToUpdate.length + 1));
      values.push(code);
    }
    if (remarks) {
      fieldsToUpdate.push('remarks = $' + (fieldsToUpdate.length + 1));
      values.push(remarks);
    }
    if (status !== undefined) {
      fieldsToUpdate.push('status = $' + (fieldsToUpdate.length + 1));
      values.push(status);
    }

    // Add the `id` for the WHERE clause
    values.push(id);

    // Execute the dynamic query
    const query = `
      UPDATE location 
      SET ${fieldsToUpdate.join(', ')} 
      WHERE location_id = $${fieldsToUpdate.length + 1} 
      RETURNING *;
    `;
    const result = await client.query(query, values);

 
    // Handle cases where the location with the given ID does not exist
    if (result.rowCount === 0) {
      await logApiRequest(req, { error: 'Location not found' }, "Failed", submodule, action, module, user_id);
      return res.status(404).json({ message: 'Location not found' });
    }

    await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
    res.status(200).json({ message: 'Location updated successfully', location: result.rows[0] });
  } catch (error) {
    console.error('Error updating location:', error);
    await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release(); // Always release the client in a finally block
  }
});



// Filter users
router.get('/filter', async (req, res) => {
  const client = await pool.connect(); // Connect to the pool
  try {
      const {dateFrom, dateTo, city, state, country } = req.body;

      // Build the base query
      let query = `SELECT * FROM location WHERE 1=1`;
      const queryParams = [];

      // Apply specific search filters

      if (dateFrom) {
          query += ` AND created_at >= $${queryParams.length + 1}`;
          queryParams.push(dateFrom);
      }

      if (dateTo) {
          query += ` AND created_at <= $${queryParams.length + 1}`;
          queryParams.push(dateTo);
      }

      if (city) {
          query += ` AND city = $${queryParams.length + 1}`;
          queryParams.push(city);
      }

      if (state) {
          query += ` AND state = $${queryParams.length + 1}`;
          queryParams.push(state);
      }

      if (country) {
          query += ` AND country = $${queryParams.length + 1}`;
          queryParams.push(country);
      }

      // Execute the query
      const result = await client.query(query, queryParams);
      res.status(200).json(result.rows);
  } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Server error' });
  } finally {
      client.release(); // Release the client back to the pool
  }
});

module.exports = router;
