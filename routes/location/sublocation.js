// routes/sub_locations.js
const express = require('express');
const router = express.Router();
const { pool } = require('../../config.js'); // Use the connection pool from config
const { logApiRequest } = require('../../logs/logger.js');
const { authenticateToken } = require('../../index.js');

router.use(express.json());

// GET all sub-locations
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM sub_location');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sub-locations:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release(); // Always release the client in a finally block
  }
});

// GET sub-locations by location_id
router.get('/:location_id', async (req, res) => {
  const { location_id } = req.params; // Extract location_id from route parameters
  const client = await pool.connect();

  try {
    // Fetch sub-locations for the given location_id
    const query = `
      SELECT * FROM sub_location
      WHERE location_id = $1
    `;
    const result = await client.query(query, [location_id]);

    // Send the fetched sub-locations
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sub-locations:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release(); // Always release the client in a finally block
  }
});

// POST API to add a new sub-location
router.post('/', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  const module = 'HRMS';
  const submodule = 'Organization Setup';
  const { location_id, building_no, floor, room, section, description } = req.body;
  const action = 'Add Sub-Location';
  const user_id = req.user?.id || req.user?.user_id;

  if (!location_id || !building_no) {
    await logApiRequest(req, { error: 'Missing required fields' }, "Failed", submodule, action, module, user_id);
    return res.status(400).json({ message: 'Missing required fields: location_id and building_no' });
  }

  try {
    const query = 'INSERT INTO sub_location (location_id, building_no, floor, room, section, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *';
    const result = await client.query(query, [location_id, building_no, floor, room, section, description]);
    await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
    res.status(201).json({ message: 'Sub-location added successfully', sub_location: result.rows[0] });
  } catch (error) {
    console.error('Error adding sub-location:', error);
    await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// DELETE a sub-location
router.delete('/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  const { id } = req.params;
  const module = 'HRMS';
  const submodule = 'Organization Setup';
  const action = 'Delete Sub-Location';
  const user_id = req.user?.id || req.user?.user_id;

  if (!id) {
    await logApiRequest(req, { error: 'Missing required field: id' }, "Failed", submodule, action, module, user_id);
    return res.status(400).json({ message: 'Missing required field: id' });
  }

  try {
    const result = await client.query('DELETE FROM sub_location WHERE sub_location_id = $1 RETURNING *', [id]);
    if (result.rows.length > 0) {
      await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
      res.json({ message: 'Deleted successfully', sub_location: result.rows[0] });
    } else {
      await logApiRequest(req, { error: 'Sub-location not found' }, "Failed", submodule, action, module, user_id);
      res.status(404).json({ error: 'Sub-location not found' });
    }
  } catch (err) {
    console.error('Error deleting sub-location:', err);
    await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PATCH /sub-location/:id - Partially update an existing sub-location
router.patch('/:id', async (req, res) => {
  const client = await pool.connect();
  const { id } = req.params; // Sub-location ID
  const { location_id, building_no, floor, room, section, description, status } = req.body;
  const module = 'HRMS';
  const submodule = 'Organization Setup';
  const action = 'Update Sub-location';
  const user_id = req.user?.id || req.user?.user_id;

  // Ensure at least one field is provided for updating
  if (!location_id && !building_no && !floor && !room && !section && !description) {
    await logApiRequest(req, { error: 'No fields provided to update' }, "Failed", submodule, action, module, user_id);
    return res.status(400).json({ message: 'No fields provided to update' });
  }

  try {
    // Build dynamic query for updating only provided fields
    const fieldsToUpdate = [];
    const values = [];

    if (building_no) {
      fieldsToUpdate.push('building_no = $' + (fieldsToUpdate.length + 1));
      values.push(building_no);
    }
    if (floor) {
      fieldsToUpdate.push('floor = $' + (fieldsToUpdate.length + 1));
      values.push(floor);
    }
    if (room) {
      fieldsToUpdate.push('room = $' + (fieldsToUpdate.length + 1));
      values.push(room);
    }
    if (section) {
      fieldsToUpdate.push('section = $' + (fieldsToUpdate.length + 1));
      values.push(section);
    }
    if (description) {
      fieldsToUpdate.push('description = $' + (fieldsToUpdate.length + 1));
      values.push(description);
    }
    if (status !== undefined) {
      fieldsToUpdate.push('status = $' + (fieldsToUpdate.length + 1));
      values.push(status);
    }

    // Add the `id` for the WHERE clause
    values.push(id);

    // Execute the dynamic query
    const query = `
      UPDATE sub_location 
      SET ${fieldsToUpdate.join(', ')} 
      WHERE sub_location_id = $${fieldsToUpdate.length + 1} 
      RETURNING *;
    `;
    const result = await client.query(query, values);

    // Handle cases where the sub-location with the given ID does not exist
    if (result.rowCount === 0) {
      await logApiRequest(req, { error: 'Sub-location not found' }, "Failed", submodule, action, module, user_id);
      return res.status(404).json({ message: 'Sub-location not found' });
    }

    await logApiRequest(req, result.rows[0], "Success", submodule, action, module, user_id);
    res.status(200).json({ message: 'Sub-location updated successfully', sub_location: result.rows[0] });
  } catch (error) {
    console.error('Error updating sub-location:', error);
    await logApiRequest(req, { error: 'Internal server error' }, "Failed", submodule, action, module, user_id);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release(); // Always release the client in a finally block
  }
});


module.exports = router;
