const express = require("express");
const { pool } = require("../../config");
const router = express.Router();
const { authenticateToken } = require("../../index");


// ✅ POST: Create a new workflow
router.post("/workflows", async (req, res) => {
    const client = await pool.connect();
    try {
        const { workflowname, description, created_by, budget_ids } = req.body;

        if (!workflowname || !budget_ids || budget_ids.length === 0) {
            return res.status(400).json({ error: "Workflow name, action, and at least one budget ID are required." });
        }

        // Check if all budget IDs exist in the `budget` table
        const queryCheck = `SELECT id FROM budget WHERE id = ANY($1)`;
        const resultCheck = await client.query(queryCheck, [budget_ids]);

        const existingIds = resultCheck.rows.map(row => row.id);
        const missingIds = budget_ids.filter(id => !existingIds.includes(id));

        if (missingIds.length > 0) {
            return res.status(404).json({ error: `Budget ID(s) not found: ${missingIds.join(", ")}` });
        }

        // Convert array to PostgreSQL format: {1,2,3}
        const budgetIdsArray = `{${budget_ids.join(",")}}`;

        // ✅ Fix: Insert into `budget_ids` instead of `budget_id`
        const query = `
            INSERT INTO budget_workflow (workflowname, description, created_by, budget_ids) 
            VALUES ($1, $2, $3, $4) RETURNING *`;
        const result = await client.query(query, [workflowname, description, created_by, budgetIdsArray]);

        res.status(201).json({ message: "Workflow created successfully", workflow: result.rows[0] });
    } catch (error) {
        console.error("Error creating workflow:", error);
        res.status(500).json({ error: "Internal server error.", message: error.message });
    } finally {
        client.release();
    }
});



// ✅ GET: Retrieve all workflows
router.get("/workflows", async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM budget_workflow");
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error retrieving workflows:", error);
        res.status(500).json({ error: "Internal server error." });
    } finally {
        client.release();
    }
});


// ✅ PATCH
router.patch("/workflows/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { budget_ids } = req.body;

        if (!budget_ids?.length) {
            return res.status(400).json({ error: "At least one budget ID is required." });
        }

        const budgetCheck = await client.query("SELECT id FROM budget WHERE id = ANY($1)", [budget_ids]);
        const existingIds = budgetCheck.rows.map(row => row.id);
        const missingIds = budget_ids.filter(id => !existingIds.includes(id));

        if (missingIds.length > 0) {
            return res.status(404).json({ error: `Budget ID(s) not found: ${missingIds.join(", ")}` });
        }

        const workflowResult = await client.query("SELECT budget_ids FROM budget_workflow WHERE id = $1", [id]);
        if (!workflowResult.rows.length) {
            return res.status(404).json({ error: "Workflow not found." });
        }

        const updatedBudgetIds = Array.from(new Set([...(workflowResult.rows[0].budget_ids || []), ...budget_ids]));
        await client.query("UPDATE budget_workflow SET budget_ids = $1 WHERE id = $2", [updatedBudgetIds, id]);

        res.status(200).json({ message: "Budget IDs updated successfully" });
    } catch (error) {
        console.error("Error updating workflow:", error);
        res.status(500).json({ error: "Internal server error." });
    } finally {
        client.release();
    }
});


// ✅ DELETE: Delete a workflow and its relationships
router.delete("/workflows/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const workflowCheck = await client.query("SELECT * FROM budget_workflow WHERE id = $1", [id]);
        if (workflowCheck.rowCount === 0) {
            return res.status(404).json({ error: "Workflow not found." });
        }

        await client.query("DELETE FROM budget_user_workflow WHERE workflowid = $1", [id]);
        await client.query("DELETE FROM Purchase_Approval_Groups WHERE workflowid = $1", [id]);
        const result = await client.query("DELETE FROM budget_workflow WHERE id = $1 RETURNING *", [id]);

        await client.query("COMMIT");
        res.status(200).json({
            message: "Workflow and related user-workflow relationships deleted successfully.",
            deleted: result.rows[0],
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error deleting workflow and relationships:", error);
        res.status(500).json({ error: "Internal server error." });
    } finally {
        client.release();
    }
});










// ✅ POST: Add users to a workflow
router.post("/user", async (req, res) => {
    const { userids, workflowid } = req.body;
    const client = await pool.connect();
    try {
        // Check if the workflow exists
        const workflowCheck = await client.query("SELECT * FROM budget_workflow WHERE workflowId = $1", [workflowid]);
        if (workflowCheck.rowCount === 0) {
            return res.status(404).json({ error: "Workflow not found." });
        }

        if (!Array.isArray(userids) || userids.length === 0) {
            return res.status(400).json({ error: "User IDs must be provided in an array." });
        }

        const insertedUsers = [];
        const errors = [];

        for (const userid of userids) {
            const userCheck = await client.query("SELECT * FROM users WHERE user_id = $1", [userid]);
            if (userCheck.rowCount === 0) {
                errors.push({ userid, error: "User not found." });
                continue;
            }

            const relationshipCheck = await client.query(
                "SELECT * FROM budget_user_workflow WHERE userid = $1 AND workflowid = $2",
                [userid, workflowid]
            );
            if (relationshipCheck.rowCount > 0) {
                errors.push({ userid, error: "User already assigned to this workflow." });
                continue;
            }

            const result = await client.query(
                "INSERT INTO budget_user_workflow (userid, workflowid) VALUES ($1, $2) RETURNING *",
                [userid, workflowid]
            );
            insertedUsers.push(result.rows[0]);
        }

        res.status(201).json({
            message: insertedUsers.length > 0 ? "Users assigned successfully." : "No users were added.",
            added_users: insertedUsers,
            errors: errors.length > 0 ? errors : null,
        });
    } catch (error) {
        console.error("Error assigning users to workflow:", error);
        res.status(500).json({ error: "Internal server error." });
    } finally {
        client.release();
    }
});

// ✅ DELETE: Remove a users for a specific workflow
router.delete('/user/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const result = await client.query('DELETE FROM budget_user_workflow WHERE id = $1 RETURNING *', [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ message: 'User deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      client.release(); // Release connection
    }
  });


// ✅ GET: Get users for a specific workflow
router.get("/user/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        // Check if the workflow exists
        const workflowCheck = await client.query("SELECT * FROM budget_workflow WHERE workflowId = $1", [id]);
        if (workflowCheck.rowCount === 0) {
            return res.status(404).json({ error: "Workflow not found." });
        }


        const result = await client.query(
            "SELECT * FROM budget_user_workflow WHERE workflowid = $1",
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "No users found for the specified workflow." });
        }

        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error retrieving user-workflow relationships:", error);
        res.status(500).json({ error: "Internal server error." });
    } finally {
        client.release();
    }
});










// ✅ GET: Fetch all Purchase Approval Groups
router.get('/group/:id', async (req, res) => {
      const { id } = req.params;
      const client = await pool.connect();
      try {
         // Check if the workflow exists
         const workflowCheck = await client.query("SELECT * FROM budget_workflow WHERE workflowId = $1", [id]);
         if (workflowCheck.rowCount === 0) {
             return res.status(404).json({ error: "Workflow not found." });
         }
        
          const result = await client.query(
              "SELECT * FROM Purchase_Approval_Groups WHERE workflowid = $1 ORDER BY assigned_at DESC",
              [id]
          );
  
          if (result.rowCount === 0) {
              return res.status(404).json({ error: "No Group found for the specified workflow." });
          }
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error:"Internal Server Error" });
    } finally {
      client.release(); // Release connection
    }
  });
  
  
// ✅ PUT: Replace Purchase Approval Groups for a specific workflowid
router.put('/group', async (req, res) => {
    const groups = req.body;
  
    // Check if input is an array and has valid objects
    if (!Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({
        error: 'Invalid input, expected an array of group objects'
      });
    }
  
    const client = await pool.connect();
    try {
      // Extract workflowid (same for all)
      const workflowid = groups[0].workflowid;
  
      // 1️⃣ Delete existing groups for the given workflowid
      await client.query('DELETE FROM Purchase_Approval_Groups WHERE workflowid = $1', [workflowid]);
  
      // 2️⃣ Insert new groups with the provided workflowid and actions
      const values = [];
      const queryParams = [];
      let paramIndex = 1;
  
      groups.forEach((group) => {
        const { workflowid, action, group_names } = group;
  
        if (!workflowid || !action || !Array.isArray(group_names) || group_names.length === 0) {
          throw new Error('Invalid object format, expected workflowid, action, and group_names');
        }
  
        group_names.forEach((group_name) => {
          queryParams.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
          values.push(group_name, workflowid, action);
          paramIndex += 3;
        });
      });
  
      const query = `
        INSERT INTO Purchase_Approval_Groups (group_name, workflowid, action)
        VALUES ${queryParams.join(', ')}
        RETURNING *;
      `;
  
      const result = await client.query(query, values);
      res.status(201).json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    } finally {
      client.release(); // Release connection
    }
  });
  
  

module.exports = router;
