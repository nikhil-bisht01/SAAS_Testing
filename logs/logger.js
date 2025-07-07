const { pool } = require('../config'); // PostgreSQL connection
// Function to log API requests to the database
async function logApiRequest(req, responsePayload, status, submodule, action, module, res) { 
    const client = await pool.connect();
    try {
        const logQuery = `
          INSERT INTO api_logs (
              api_endpoint, method, status, request_payload, response_payload, user_id, submodule, action, module
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)`;

        const requestPayload = JSON.stringify(req.body || {}); 
        const formattedResponsePayload = JSON.stringify(responsePayload || {});

        await client.query(logQuery, [
            req.originalUrl || req.path || 'Unknown Endpoint',
            req.method || 'Unknown',
            status,
            requestPayload,
            formattedResponsePayload,
            req.user?.user_id || null,
            submodule || 'Unknown',
            action || 'Unknown',
            module || 'Unknown'    
            
        ]);
        res.status(202).JSON({message:"heho"});
    } catch (error) {
        console.error("Error logging API request:", error);
    } finally {
        client.release();
    }
}


module.exports = {
    logApiRequest,
};