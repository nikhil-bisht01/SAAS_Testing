const express = require('express');
const createTables = require('../table');
const sendMail = require('../../mailConfig');
const { pool } = require('../../config');
const router = express.Router();
require('dotenv').config();

// ✅ API Endpoint to Create Tables
router.post('/table', async (req, res) => {
    const result = await createTables();

    if (result.success) {
        res.status(200).send("All tables created successfully!");
    }
    else {
        res.status(500).json({
            message: "Failed to create all tables.",
            errors: result.errors,
        });
    }
});


// ✅ Get All Indenting Requests
router.get('/indenting', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query(`SELECT * FROM indenting ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    } finally {
        client.release();
    }
});



// Function to generate random 10-digit number as string
function generateRfpId() {
    return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

// ✅  PUT API to generate RFP id for particular indent ID

router.put('/indenting/:id/rfp', async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;

        // 1. Check indenting record
        const query = 'SELECT * FROM indenting WHERE id = $1';
        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Indenting request not found" });
        }

        const indent = result.rows[0];

        // 2. Check if status is not approved
        if (indent.status !== 'Approved') {
            return res.status(400).json({ message: "Only Approved indentings can generate RFP ID" });
        }

        // 3. Check if already has rfp_id
        if (indent.rfp_id) {
            return res.status(400).json({ message: "RFP ID already generated for this indenting" });
        }


        // 4. Generate RFP ID
        const RFP_id = generateRfpId(); // e.g., Date.now() or custom logic

        // 5. Update indenting record
        const updateQuery = 'UPDATE indenting SET rfp_id = $1 WHERE id = $2';
        await client.query(updateQuery, [RFP_id, id]);

        res.status(200).json({ message: "RFP ID Generated", RFP_ID: RFP_id });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
});


// ✅ GET API TO GET ALL RFP ID PRESENT AT INDENTING TABLE  

// router.get('/indenting/rfp', async (req, res) => {
//     const client = await pool.connect();

//     try {
//         const resultQuery = await client.query("SELECT rfp_id FROM indenting WHERE rfp_id IS NOT NULL ");

//         res.json(resultQuery.rows);
//     } catch (error) {
//         console.error("Error fetching rfp_ids:", error);
//         res.status(500).json({ message: "Internal Server Error", details: error.message });
//     } finally {
//         client.release();
//     }
// });


// router.get('/indenting/rfp/:rfpId', async (req, res) => {
//     const client = await pool.connect();
//     try {
//         const { rfpId } = req.params;
//            console.log("Received rfpId:", rfpId);

//         // Fetch the row where rfp_id matches
//         const query = 'SELECT * FROM indenting WHERE rfp_id = $1';
//         const result = await client.query(query, [rfpId]);

//         if (result.rows.length == 0) {
//             return res.status(404).json({ message: "No record found with this RFP ID" });
//         }

//         res.json(result.rows[0]);

//     } catch (error) {
//         console.error("Error fetching row by RFP ID:", error);
//         res.status(500).json({ message: "Internal Server Error", details: error.message });
//     } finally {
//         client.release();
//     }
// });

router.get('/indenting/rfp/:rfpId?', async (req, res) => {
    const client = await pool.connect();

    try {
        const { rfpId } = req.params;

        if (rfpId) {
            const query = 'SELECT * FROM indenting WHERE rfp_id = $1';
            const result = await client.query(query, [rfpId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ message: "No record found with this RFP ID" });
            }

            return res.json(result.rows[0]);
        } else {
            const resultQuery = await client.query("SELECT rfp_id FROM indenting WHERE rfp_id IS NOT NULL");
            return res.json(resultQuery.rows);
        }
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
});


// ✅ Get a Specific Indenting Request by ID
router.get('/indenting/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const query = 'SELECT * FROM indenting WHERE id = $1';
        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Indenting request not found" });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
});





//✅ GET API that fetches unique values
router.get("/assets", async (req, res) => {
    const client = await pool.connect();
    try {
        const { request_for, category } = req.query;

        let query;
        let values = [];

        if (!request_for && !category) {
            // Return unique request_for values
            query = "SELECT DISTINCT request_for FROM indenting";
        } else if (request_for && !category) {
            // Return unique categories based on request_for
            query = "SELECT DISTINCT category FROM indenting WHERE request_for = $1";
            values.push(request_for);
        } else if (request_for && category) {
            // Return unique asset_name based on category
            query = "SELECT DISTINCT asset_name FROM indenting WHERE request_for = $1 AND category = $2";
            values.push(request_for, category);
        } else {
            return res.status(400).json({ error: "Invalid parameters" });
        }

        const result = await client.query(query, values);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching asset data:", error);
        res.status(500).json({ error: "Internal server error." });
    } finally {
        client.release();
    }
});


// ✅ Create a New Indenting Request
router.post("/indenting", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN"); // Start transaction

        const requiredAction = "Request";

        const {
            user_id,
            asset_name,
            quantity,
            uom,
            category,
            request_for,
            remarks,
            workflow_id,
            budget,
        } = req.body;

        // ✅ 1. Check if the user exists
        const userCheckQuery =
            "SELECT user_id, dept_id FROM users WHERE user_id = $1";
        const userCheckResult = await client.query(userCheckQuery, [user_id]);

        if (userCheckResult.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        const dept_id = userCheckResult.rows[0].dept_id;

        // ✅ 2. Check if the workflow exists
        const workflowCheckQuery =
            "SELECT workflowid, budget_ids FROM budget_workflow WHERE workflowid = $1";
        const workflowCheckResult = await client.query(workflowCheckQuery, [
            workflow_id,
        ]);

        if (workflowCheckResult.rows.length === 0) {
            return res.status(404).json({ message: "Workflow not found" });
        }

        const budgetIds = workflowCheckResult.rows[0].budget_ids; // Array of budget IDs

        // ✅ 4. Validate the budget
        const budgetCheckQuery = `
              SELECT id
              FROM budget 
              WHERE id = $1 AND id = ANY($2::int[])
          `;
        const budgetCheckResult = await client.query(budgetCheckQuery, [
            budget,
            budgetIds,
        ]);

        if (budgetCheckResult.rows.length === 0) {
            return res
                .status(404)
                .json({ message: "Budget not associated with this workflow" });
        }

        // ✅ 5. Check if the user is assigned to the workflow
        const assignmentCheckQuery =
            "SELECT * FROM budget_user_workflow WHERE userid = $1 AND workflowid = $2";
        const assignmentCheckResult = await client.query(assignmentCheckQuery, [
            user_id,
            workflow_id,
        ]);

        if (assignmentCheckResult.rows.length === 0) {
            return res
                .status(403)
                .json({ message: "User is not assigned to this workflow" });
        }

        // // ✅ 6. Verify user's role permissions for the action
        // const roleQuery = `
        //     SELECT group_name
        //     FROM Purchase_Approval_Groups
        //     WHERE workflowid = $1 AND action = $2
        // `;
        // const roleResult = await client.query(roleQuery, [workflow_id,requiredAction]);
        // const approvedRoles = roleResult.rows.map(row => row.group_name);

        // if (approvedRoles.length === 0) {
        //     return res.status(403).json({ error: "No roles assigned for this workflow or this action" });
        // }

        // // ✅ Check if the user has the required role
        // const apiAccessQuery = `
        //     SELECT api_name
        //     FROM api_access
        //     WHERE user_id = $1 AND api_name = ANY($2::text[])
        // `;
        // const apiAccessResult = await client.query(apiAccessQuery, [user_id, approvedRoles]);

        // if (apiAccessResult.rowCount === 0) {
        //     return res.status(403).json({ error: "User role not authorized for this workflow" });
        // }

        // ✅ 6. Verify user's role permissions for the action
        // ✅ 6. Verify user's role permissions for the action
        const roleQuery = `
      SELECT group_name 
      FROM purchase_approval_groups 
      WHERE workflowid = $1 AND action = $2 
  `;
        const roleResult = await client.query(roleQuery, [workflow_id, requiredAction]);
        console.log(roleResult.rows)
        const approvedRoles = roleResult.rows.map(row => row.group_name);
        console.log("I am here: ", approvedRoles);

        if (approvedRoles.length === 0) {
            return res.status(403).json({ error: "No roles assigned for this workflow or this action" });
        }

        // ✅ Check for Bypass role
        const isBypass = approvedRoles.includes("Bypass");

        if (!isBypass) {
            // ✅ Check if the user has the required role (via api_access)
            const apiAccessQuery = `
          SELECT api_name 
          FROM api_access 
          WHERE user_id = $1 AND api_name = ANY($2::text[])
      `;
            const apiAccessResult = await client.query(apiAccessQuery, [user_id, approvedRoles]);

            if (apiAccessResult.rowCount === 0) {
                return res.status(403).json({ error: "User role not authorized for this workflow" });
            }
        }
        // 👉 if Bypass is true, role check is skipped and insert continues below


        // ✅ 7. Insert the indenting request if all checks pass
        const insertQuery = `
              INSERT INTO indenting (user_id, dept_id, asset_name, quantity, uom, category, request_for, remarks, workflow_id, budget_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              RETURNING *
          `;
        const values = [
            user_id,
            dept_id,
            asset_name,
            quantity,
            uom,
            category,
            request_for,
            remarks,
            workflow_id,
            budget,
        ];

        const result = await client.query(insertQuery, values);

        // ✅ Commit transaction if everything succeeds
        await client.query("COMMIT");

        res.status(201).json(result.rows[0]);
    } catch (error) {
        await client.query("ROLLBACK"); // Rollback in case of any error
        console.error(error);
        res
            .status(500)
            .json({
                message: "Error creating indenting request",
                details: error.message,
            });
    } finally {
        client.release();
    }
});


// ✅ 1️⃣ API: Update asset_name, remarks, and quantity if status is pending or resubmitted
router.put('/indenting/update-details/:id', async (req, res) => {
    const { id } = req.params;
    const { asset_name, remarks, quantity, user_id } = req.body;

    if (!asset_name && !remarks && quantity === undefined) {
        return res.status(400).json({ message: 'Provide asset_name, remarks, or quantity to update.' });
    }

    const requiredAction = "Request";
    const client = await pool.connect();

    try {
        // ✅ 1️⃣ Fetch indenting details
        const indentingQuery = `
            SELECT status, workflow_id, budget_id 
            FROM indenting 
            WHERE id = $1
        `;
        const indentingResult = await client.query(indentingQuery, [id]);
        if (indentingResult.rows.length === 0) {
            return res.status(404).json({ message: 'Indenting request not found.' });
        }

        const { status, workflow_id, budget_id } = indentingResult.rows[0];

        // ✅ 2️⃣ Check if user exists
        const userCheckQuery = `SELECT dept_id FROM users WHERE user_id = $1`;
        const userCheckResult = await client.query(userCheckQuery, [user_id]);
        if (userCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const dept_id = userCheckResult.rows[0].dept_id;

        // ✅ 3️⃣ Check if workflow exists
        const workflowCheckQuery = `
            SELECT workflowid, budget_ids
            FROM budget_workflow 
            WHERE workflowid = $1
        `;
        const workflowCheckResult = await client.query(workflowCheckQuery, [workflow_id]);
        if (workflowCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'Workflow not found.' });
        }
        const budgetIds = workflowCheckResult.rows[0].budget_ids;

        // ✅ 5️⃣ Validate budget association with workflow
        const budgetCheckQuery = `
            SELECT id 
            FROM budget 
            WHERE id = $1 AND id = ANY($2::int[])
        `;
        const budgetCheckResult = await client.query(budgetCheckQuery, [budget_id, budgetIds]);
        if (budgetCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'Budget not associated with this workflow' });
        }

        // ✅ 6️⃣ Check if user is assigned to the workflow
        const assignmentCheckQuery = `SELECT * FROM budget_user_workflow WHERE userid = $1 AND workflowid = $2`;
        const assignmentCheckResult = await client.query(assignmentCheckQuery, [user_id, workflow_id]);
        if (assignmentCheckResult.rows.length === 0) {
            return res.status(403).json({ message: 'User is not assigned to this workflow' });
        }

        // ✅ 7️⃣ Verify user's role permissions for the action
        const roleQuery = `SELECT group_name FROM Purchase_Approval_Groups WHERE workflowid = $1 AND action = $2`;
        const roleResult = await client.query(roleQuery, [workflow_id, requiredAction]);
        const approvedRoles = roleResult.rows.map(row => row.group_name);

        if (approvedRoles.length === 0) {
            return res.status(403).json({ error: 'No roles assigned for this workflow or this action' });
        }

        // ✅ 8️⃣ Check for Bypass role
        const isBypass = approvedRoles.includes("Bypass");

        if (!isBypass) {
            // ✅ Check if the user has the required role via api_access
            const apiAccessQuery = `
                SELECT api_name 
                FROM api_access 
                WHERE user_id = $1 AND api_name = ANY($2::text[])
            `;
            const apiAccessResult = await client.query(apiAccessQuery, [user_id, approvedRoles]);

            if (apiAccessResult.rowCount === 0) {
                return res.status(403).json({ error: "User role not authorized for this workflow" });
            }
        }

        // ✅ 9️⃣ Check status and perform update
        if (status === 'Pending' || status === 'Resubmitted') {
            const fields = [];
            const values = [];
            let index = 1;

            if (asset_name) {
                fields.push(`asset_name = $${index}`);
                values.push(asset_name);
                index++;
            }
            if (remarks) {
                fields.push(`remarks = $${index}`);
                values.push(remarks);
                index++;
            }
            if (quantity !== undefined) {
                fields.push(`quantity = $${index}`);
                values.push(quantity);
                index++;
            }

            values.push(id);
            const updateQuery = `UPDATE indenting SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`;
            const updateResult = await client.query(updateQuery, values);

            res.json(updateResult.rows[0]);
        } else {
            return res.status(400).json({
                message: 'Cannot update asset_name, remarks, or quantity when status is not Pending or Resubmitted.'
            });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating details', details: error.message });
    } finally {
        client.release();
    }
});


// ✅ 2️⃣ API: Update status with required flow

router.put('/indenting/update-status/:id', async (req, res) => {
    const { id } = req.params;
    const { status: newStatus, user_id } = req.body;

    const validTransitions = {
        Pending: ['Approved', 'Rejected', 'Resubmitted'],
        Resubmitted: ['Approved', 'Rejected'],
        Approved: ['Resubmitted']
    };

    if (!newStatus) {
        return res.status(400).json({ message: 'Please provide a status to update.' });
    }

    const requiredAction = "Approve";

    const client = await pool.connect();
    try {
        // Fetch indenting details
        const indentingQuery = `
            SELECT status, workflow_id, budget_id 
            FROM indenting 
            WHERE id = $1
        `;
        const indentingResult = await client.query(indentingQuery, [id]);

        if (indentingResult.rows.length === 0) {
            return res.status(404).json({ message: 'Indenting request not found.' });
        }

        const { status: currentStatus, workflow_id, budget_id } = indentingResult.rows[0];

        // User check
        const userCheckQuery = `SELECT dept_id FROM users WHERE user_id = $1`;
        const userCheckResult = await client.query(userCheckQuery, [user_id]);

        if (userCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const dept_id = userCheckResult.rows[0].dept_id;

        // Workflow check
        const workflowCheckQuery = `SELECT workflowid, budget_ids FROM budget_workflow WHERE workflowid = $1`;
        const workflowCheckResult = await client.query(workflowCheckQuery, [workflow_id]);

        if (workflowCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'Workflow not found.' });
        }

        const budgetIds = workflowCheckResult.rows[0].budget_ids;

        // Validate budget association
        const budgetCheckQuery = `
            SELECT id FROM budget 
            WHERE id = $1 AND id = ANY($2::int[])
        `;
        const budgetCheckResult = await client.query(budgetCheckQuery, [budget_id, budgetIds]);

        if (budgetCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'Budget not associated with this workflow' });
        }

        // Check user assignment to workflow
        const assignmentCheckQuery = `
            SELECT * FROM budget_user_workflow 
            WHERE userid = $1 AND workflowid = $2
        `;
        const assignmentCheckResult = await client.query(assignmentCheckQuery, [user_id, workflow_id]);

        if (assignmentCheckResult.rows.length === 0) {
            return res.status(403).json({ message: 'User is not assigned to this workflow' });
        }

        // ✅ Verify user's role permissions
        const roleQuery = `
            SELECT group_name FROM Purchase_Approval_Groups 
            WHERE workflowid = $1 AND action = $2
        `;
        const roleResult = await client.query(roleQuery, [workflow_id, requiredAction]);
        const approvedRoles = roleResult.rows.map(row => row.group_name);

        if (approvedRoles.length === 0) {
            return res.status(403).json({ error: 'No roles assigned for this workflow or this action' });
        }

        // ✅ 8️⃣ Check for Bypass role
        const isBypass = approvedRoles.includes("Bypass");

        if (!isBypass) {
            // ✅ Check if the user has the required role via api_access
            const apiAccessQuery = `
                SELECT api_name 
                FROM api_access 
                WHERE user_id = $1 AND api_name = ANY($2::text[])
            `;
            const apiAccessResult = await client.query(apiAccessQuery, [user_id, approvedRoles]);

            if (apiAccessResult.rowCount === 0) {
                return res.status(403).json({ error: "User role not authorized for this workflow" });
            }
        }

        // ✅ Validate status transition
        if (
            !validTransitions[currentStatus] ||
            !validTransitions[currentStatus].includes(newStatus)
        ) {
            return res.status(400).json({
                message: `Invalid status transition from '${currentStatus}' to '${newStatus}'.`
            });
        }

        const updatedAt = new Date();
        const approvedDate = newStatus === "Approved" ? updatedAt : null;

        // ✅ Update status
        const updateQuery = `
        UPDATE indenting 
        SET status = $1, updated_at = $2, approved_date = $3
        WHERE id = $4 
        RETURNING *
    `;

        const result = await client.query(updateQuery, [newStatus, updatedAt, approvedDate, id]);


        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating status', details: error.message });
    } finally {
        client.release();
    }
});



// API: for Indent approval group


router.get('/workflow/:workflowId/approval-groups', async (req, res) => {
    const { workflowId } = req.params;
    const { action } = req.query;  // Optional query parameter to filter by action



    const client = await pool.connect();

    try {
        // Build the query to fetch approval groups based on workflowId and optional action
        let query = `
            SELECT group_name
            FROM Purchase_Approval_Groups
            WHERE workflowid = $1
        `;
        const queryParams = [workflowId];

        // If action is provided, add it to the query
        if (action) {
            query += ' AND action = $2';
            queryParams.push(action);
        }

        // Execute the query
        const result = await client.query(query, queryParams);

        // Handle case if no approval groups are found
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No approval groups found for this workflow' });
        }

        // Send the list of group names
        const groupNames = result.rows.map(row => row.group_name);
        res.json({ approval_groups: groupNames });
    } catch (error) {
        console.error('Error fetching approval groups:', error);

        // Send a generic error message for production
        res.status(500).json({ message: 'An error occurred while fetching approval groups' });

        // Optionally log the error in a more detailed log system like Winston/Pino
        // logError(error);
    } finally {
        client.release();
    }
});





// ✅ Delete an Indenting Request
router.delete('/indenting/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const query = 'DELETE FROM indenting WHERE id = $1 RETURNING *';
        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Indenting request not found" });
        }
        res.json({ message: "Indenting request deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting indenting request", details: error.message });
    } finally {
        client.release();
    }
});





// ✅ View all received quotations
router.get('/quotations/:purchaseRequestId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { purchaseRequestId } = req.params;
        const result = await client.query('SELECT * FROM quotations WHERE purchase_request_id = $1', [purchaseRequestId]);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching quotations' });
    } finally {
        client.release();
    }
});

// ✅ Select/reject a quotation
router.put('/quotations/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await client.query('UPDATE quotations SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating quotation status', message: error.detail });
    } finally {
        client.release();
    }
});

// ✅ Create a purchase order for a selected quotation
router.post('/purchase-orders', async (req, res) => {
    const client = await pool.connect();
    try {
        const { quotation_id, purchase_team_id, remarks } = req.body;
        const result = await client.query(
            'INSERT INTO purchase_orders (quotation_id, purchase_team_id, remarks) VALUES ($1, $2, $3) RETURNING *',
            [quotation_id, purchase_team_id, remarks]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating purchase order' });
    } finally {
        client.release();
    }
});

// ✅ Accept/reject supplier terms
router.put('/purchase-orders/:id/status', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await client.query('UPDATE purchase_orders SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating purchase order status' });
    } finally {
        client.release();
    }
});

// ✅ Log received goods
router.post('/goods-received/:purchaseOrderId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { purchaseOrderId } = req.params;
        const { received_by } = req.body;
        const result = await client.query(
            'INSERT INTO goods_received_notes (purchase_order_id, received_by) VALUES ($1, $2) RETURNING *',
            [purchaseOrderId, received_by]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error logging received goods' });
    } finally {
        client.release();
    }
});

// ✅ Finance & User Confirm Delivery (Either One Can Be True)
router.put('/goods-received/:id/approve', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { finance_approved, user_confirmed } = req.body;

        // Dynamically build query based on provided fields
        let updateFields = [];
        let values = [];

        if (finance_approved !== undefined) {
            updateFields.push("finance_approved = $" + (values.length + 1));
            values.push(finance_approved);
        }
        if (user_confirmed !== undefined) {
            updateFields.push("user_confirmed = $" + (values.length + 1));
            values.push(user_confirmed);
        }

        // If no fields provided, return an error
        if (updateFields.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        values.push(id); // Add ID at the end
        const query = `UPDATE goods_received_notes SET ${updateFields.join(", ")} WHERE id = $${values.length} RETURNING *`;

        const result = await client.query(query, values);
        res.json(result.rows[0]);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating approval status' });
    } finally {
        client.release();
    }
});

// ✅ Ensure this matches the correct directory setup
router.get('/form/quotation-form/:supplierId/:indentingId', (req, res) => {
    const { supplierId, indentingId } = req.params;

    // ✅ Ensure this path matches the `views` directory in `index.js`
    res.render('form/form', { supplierId, indentingId });
});


router.get('/form/thank-you', (req, res) => {
    res.render('form/thank-you');
});


module.exports = router;