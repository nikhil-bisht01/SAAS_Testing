const { authenticateToken } = require('../index');
const express = require("express");
const router = express.Router();
const { pool } = require("../config");



router.get("/get-logs", authenticateToken, async (req, res) => {
    const client = await pool.connect();

    const { module, submodule, status, startDate, endDate } = req.query;

    try {
        // Base query
        let query = "SELECT * FROM api_logs WHERE 1 = 1";
        const queryParams = [];

        // Add conditions based on provided filters
        if (module) {
            query += ` AND module = $${queryParams.length + 1}`;
            queryParams.push(module);
        }

        if (submodule) {
            query += ` AND submodule = $${queryParams.length + 1}`;
            queryParams.push(submodule);
        }

        if (status) {
            query += ` AND status = $${queryParams.length + 1}`;
            queryParams.push(status);
        }

        if (startDate && endDate) {
            query += ` AND created_at BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
            queryParams.push(startDate, endDate);
        }

        const result = await client.query(query, queryParams);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "No logs found for the given criteria." });
        }

        // Format logs
        const logs = result.rows.map((log) => ({
            id: log.id,
            api_endpoint: log.api_endpoint,
            method: log.method,
            submodule: log.submodule,
            action: log.action,
            module: log.module,
            status: log.status,
            request_payload: log.request_payload || null,
            response_payload: log.response_payload || null,
            created_at: log.created_at,
            user_id: log.user_id,
        }));


        return res.status(200).json({
            message: "Logs retrieved successfully.",
            logs: logs,
        });

    } catch (err) {
        console.error("Error fetching logs:", err);

        return res.status(500).json({
            error: "Internal server error",
            message: err.detail || err.message || err.error,
        });
    } finally {
        client.release();
    }
});




module.exports = router;
