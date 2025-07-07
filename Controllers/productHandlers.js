const createTables =require('../DMSsys/createtabels')
const { pool } =require('../config')

async function handleDocumentManagement(schema) {
  try {
    // Step 1: Create necessary tables
    await createTables(schema);

const result = await pool.query(`SELECT user_id FROM ${schema}.users ORDER BY user_id ASC LIMIT 1`);    const user_id=result.rows[0].id;

    if (result.rows.length === 0) {
      throw new Error(`No users found`);
    }
     const id = result.rows[0].user_id;

    // Step 2: Insert API access record
    const query = `
      INSERT INTO ${schema}.api_access (user_id, module, api_name)
      VALUES ($1, $2, $3)
    `;

    await pool.query(query, [id, 'DMS', 'doc_management']);

    console.log(`✅ Document Management initialized for schema: ${schema}`);
  } catch (error) {
    console.error(`❌ Error in handleDocumentManagement for schema: ${schema}`, error);
    throw error; // rethrow to let caller handle the failure
  }
}

async function handleLeaveManagement(schema) {
  // Your logic here
  console.log(`🏖️ Leave Management setup for schema: ${schema}`);
}

module.exports = {
  handleDocumentManagement,
  handleLeaveManagement,
};