require('dotenv').config();
const express = require('express');
const router = express.Router();
const { pool } = require('../config');
const {authenticateToken} =require('../index.js')
const {getSubscriptionData} =require('../middleware/subscriptionMiddleware.js')


// Services API
router.post('/', authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  const { to, from } = req.user; 
  const client = await pool.connect();


    // ✅ Validate schema name to prevent SQL injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(to)) {
    return res.status(400).json({ error: 'Invalid schema name format' });
  }

  // Step 1: Get subscription info
  const subscriptionData = getSubscriptionData(from);
  if (!subscriptionData) {
    return res.status(403).json({ error: 'Subscription data not found or unreadable.' });
  }

  // Step 2: Find the specific submodule limit
  const product = subscriptionData.subscriptions.find(p => 
    p.productName === 'Document Management' && p.is_active === true
  );

  if (!product) {
    return res.status(403).json({ error: 'Access to Document Management not found.' });
  }

  const subModule = product.subModules.find(
    s => s.submoduleName === 'Add Service'
  );

  if (!subModule) {
    return res.status(403).json({ error: 'Add Service submodule is not part of your plan.' });
  }

  const noOfLimit = subModule.noOfLimit;

  try {
    // Step 3: Count existing services
    const countResult = await client.query(`SELECT COUNT(*) FROM ${to}.DMS_service`);
    const totalServices = parseInt(countResult.rows[0].count, 10);

    if (totalServices >= noOfLimit) {
      return res.status(403).json({ error: `You have reached your service creation limit of ${noOfLimit}.` });
    }

    // Step 4: Add new service
    const insertResult = await client.query(
      `INSERT INTO ${to}.DMS_service (name, description) VALUES ($1, $2) RETURNING *`,
      [name, description]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    console.error('Error adding service:', err);
    res.status(500).json({ error: 'Error adding service', message: err.detail });
  } finally {
    client.release();
  }
});


// // Services APIs
// router.post('/',authenticateToken, async (req, res) => {
//   const { name, description } = req.body;
//   const {code} = req.user.code;
//   const client = await pool.connect(); // Ensure you connect to the database
    
//   const result = getSubscriptionData(code);
  
//   try {
//     const result = await client.query(
//       'INSERT INTO DMS_service (name, description) VALUES ($1, $2) RETURNING *',
//       [name, description]
//     );
//     res.status(201).json(result.rows[0]); // Access the result rows correctly
//   } catch (err) {
//     console.error('Error adding service:', err);
//     res.status(500).json({ error: 'Error adding service' , message:err.detail});
//   } finally {
//     client.release(); // Ensure the client is released after use
//   }
// });

  
router.get('/',authenticateToken, async (req, res) => {
  const client = await pool.connect(); // Connect to the database
  const {to}=req.user;
  
  // ✅ Validate schema name to prevent SQL injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(to)) {
    return res.status(400).json({ error: 'Invalid schema name format' });
  }

  try {
    const result = await client.query(`SELECT * FROM ${to}.DMS_service ORDER BY id ASC`); // Execute query
    res.status(200).json(result.rows); // Return the rows from the query result
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).send('Error fetching services');
  } finally {
    client.release(); // Release the database connection
  }
});

  
router.delete('/:id',authenticateToken, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect(); // Connect to the database
  const {to}=req.user;
  
  // ✅ Validate schema name to prevent SQL injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(to)) {
    return res.status(400).json({ error: 'Invalid schema name format' });
  }

  try {
    const result = await client.query(`DELETE FROM ${to}.DMS_service WHERE id = $1 RETURNING *`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).send('Service not found'); // Handle non-existent service
    }
    res.status(200).send('Service deleted');
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).json({ error: 'Error deleting service' , message:err.detail});
  } finally {
    client.release(); // Release the database connection
  }
});


  
module.exports = router;