const express = require('express');
const router = express.Router();
const {pool}= require('../config')
const {authenticateToken} =require('../index.js') // adjust path as needed
const { getSubscriptionData } = require('../middleware/subscriptionMiddleware'); // adjust path as needed
const {createTables} =require('../setuptable');

const { handleDocumentManagement, handleLeaveManagement,} = require('../Controllers/productHandlers')

const productFunctionMap = {
  'Document Management': handleDocumentManagement,
  'leave management': handleLeaveManagement,
  // Add more mappings here
};

router.post('/create1', authenticateToken, async (req, res) => {
  const { to, from } = req.user;

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(to)) {
    return res.status(400).json({ error: 'Invalid schema name format' });
  }

 // Step 1: Create necessary tables Default
    await createTables(to);

  const subscriptionData = getSubscriptionData(from);
  if (!subscriptionData || !Array.isArray(subscriptionData.subscriptions)) {
    return res.status(403).json({ error: 'Subscription data not found or invalid format.' });
  }

  const productNames = subscriptionData.subscriptions.map(p => p.productName);

  await Promise.all(
    productNames
      .filter(name => productFunctionMap[name])
      .map(name => productFunctionMap[name](to))
  );


   // Step 4: Get user_id from schema's users table
  const userResult = await pool.query(`SELECT user_id FROM ${to}.users ORDER BY user_id ASC LIMIT 1`);
  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: 'No user found in the target schema.' });
  }
  const user_id = userResult.rows[0].user_id;

 // Define values to insert
const accessValues = [
  [user_id, 'UserDirectory', 'UMC'],
  [user_id, 'UserDirectory', 'UM'],
  [user_id, 'UserDirectory', 'AddUM'],
  [user_id, 'UserDirectory', 'DltUM'],
  [user_id, 'UserDirectory', 'EditUM'],
  [user_id, 'AMS', 'update_access'],
  [user_id, 'HRMS', 'HRMS'],
  [user_id, 'ORG', 'ORG'],
  [user_id, 'ORG', 'Dept'],
  [user_id, 'ORG', 'Domain'],
  [user_id, 'ORG', 'Designation'],
  [user_id, 'ORG', 'Location']
];

  // Generate dynamic query with parameter placeholders
  const insertQuery = `
    INSERT INTO ${to}.api_access (user_id, module, api_name)
    VALUES ${accessValues.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ')}
  `;

  // Flatten values into one array for parameter binding
  const insertParams = accessValues.flat();

  // Run the insert query
  await pool.query(insertQuery, insertParams);

  return res.status(200).json({
    message: 'Relevant functions executed based on subscribed products.',
    products: productNames
  },);
});


module.exports = router;
