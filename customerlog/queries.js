const express = require('express');
const router = express.Router();
const { pool } = require('../config'); 
const { authenticateToken } = require('..');

// Raise Query
router.post("/inquiry", async (req, res) => {
  const { name, phone_number, email, product, message } = req.body;
  const client = await pool.connect();

  const submodule = 'Customer Creation';
  const module = 'CRM';
  const action = 'Website lead (Customer only)';

  let responsePayload = {};

  try {
    // Input validation
    if (!name || !phone_number || !email) {
      return res.status(400).json({ error: "Name, phone number, and email are required" });
    }

    // Start transaction
    await client.query('BEGIN');

    // Insert customer
    const insertCustomerQuery = `
      INSERT INTO customers (
        customer_name, landline_num, email_id, lead
      ) VALUES ($1, $2, $3, $4)
      RETURNING customer_id;
    `;

    const customerResult = await client.query(insertCustomerQuery, [
      name,
      phone_number,
      email,
      'website' // Lead source
    ]);

    const customer_id = customerResult.rows[0]?.customer_id;

    if (!customer_id) {
      throw new Error('Failed to insert customer.');
    }

    // Insert into queries table
    const insertQuery = `
      INSERT INTO public.queries (
        customer_id, service, messages, status
      ) VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const queryResult = await client.query(insertQuery, [
      customer_id,
      product,
      message,
      'new'
    ]);

    if (queryResult.rows.length === 0) {
      throw new Error('Failed to insert query.');
    }

    // If both inserts succeed, commit transaction
    await client.query('COMMIT');

    responsePayload = {
      message: "Customer and query created successfully",
      customer_id
    };

    return res.status(201).json(responsePayload);

  } catch (err) {
    // Rollback on any failure
    await client.query('ROLLBACK');

    responsePayload = {
      error: "Failed to create customer and query",
      detail: err.detail || err.message
    };

    return res.status(500).json(responsePayload);

  } finally {
    client.release();
  }
});



router.post('/', async (req, res) => {

    const { customer_id, service, Messages } = req.body; // Default status to 'pending' if not provided

    let client = await pool.connect();
    try {
        
        // Insert the query into the database
        const result = await client.query(
            `INSERT INTO queries (customer_id, service, Messages) 
            VALUES ($1, $2, $3) RETURNING *`,
            [customer_id, service, Messages]
        );

        res.status(201).json({
            message: 'Query added successfully',
            query: result.rows[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong while adding the query' });
    } finally {
        client.release();
    }
});

// Route to get all queries
router.get('/', async (req, res) => {
    let client;
    try {
        client = await pool.connect();

        const result = await client.query('SELECT * FROM queries');

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No queries found' });
        }

        res.json({
            queries: result.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong while fetching the queries' });
    } finally {
        client.release();
    }
});

// Route to update the status of a query
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    let  client = await pool.connect();
    try {
       

        // Update the status of the query
        const result = await client.query(
            `UPDATE queries SET status = $1 WHERE id = $2 RETURNING *`,
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Query not found' });
        }

        res.json({
            message: 'Query status updated successfully',
            query: result.rows[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong while updating the status' });
    } finally {
        client.release();
    }
});

module.exports = router;
