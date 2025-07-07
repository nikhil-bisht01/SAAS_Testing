require('dotenv').config();
const express = require('express');
const router = express.Router();
const { pool } = require('../config');


// Doctype APIs
  router.post('/', async (req, res) => {
    const {doc_name, description } = req.body;
    const client = await pool.connect(); // Connect to the database
    try {
      const result = await client.query(
        'INSERT INTO DMS_allow_doc (doc_name,description) VALUES ($1, $2) RETURNING *',
        [doc_name, description]
      );
      res.status(201).json(result.rows[0]); // Return the inserted row
    } catch (err) {
      console.error('Error adding allow_doc:', err);
      res.status(500).json({ error: 'Error adding allow_doc' , message:err.detail});
    } finally {
      client.release(); // Release the database connection
    }
  });
  
  
  router.get('/', async (req, res) => {
    const client = await pool.connect(); // Connect to the database
    try {
      const result = await client.query('SELECT * FROM DMS_allow_doc ORDER BY id ASC'); // Fetch all records
      res.status(200).json(result.rows); // Return the rows
    } catch (err) {
      console.error('Error fetching allow_docs:', err);
      res.status(500).send('Error fetching allow_docs');
    } finally {
      client.release(); // Release the database connection
    }
  });
  
  
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect(); // Connect to the database
    try {
      const result = await client.query('DELETE FROM DMS_allow_doc WHERE id = $1 RETURNING *', [id]);
      if (result.rowCount === 0) {
        return res.status(404).send('Doctype not found'); // Handle non-existent allow_doc
      }
      res.status(200).send('Doctype deleted');
    } catch (err) {
      console.error('Error deleting allow_doc:', err);
      res.status(500).json({ error: 'Error deleting allow_doc' , message:err.detail});
    } finally {
      client.release(); // Release the database connection
    }
  });



  module.exports = router;
