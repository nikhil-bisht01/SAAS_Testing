const express = require("express");
const router = express.Router();
const { pool } = require("../../config.js");
const { logApiRequest } = require('../../logs/logger.js');
const { authenticateToken } = require('../../index.js')


// GET /leave-types - Get all leave types
router.get("/leave-types", authenticateToken, async (req, res) => {

  const client = await pool.connect();
  const user_id = req.user_id

  try {
    // Fetch all leave types
    const query = "SELECT * FROM leave_types";
    const result = await client.query(query);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Leave types not found" });
    }


    // Log the success response
    return res.status(200).json({
      message: "Leave types retrieved successfully.",
      leave_types: result.rows,
    });

  } catch (err) {
    console.error("Error fetching leave types:", err);
    return res.status(500).json({
      error: "Internal server error",
      message: err.detail || err.message || err.error,
    });
  } finally {
    client.release();
  }
});

// POST /leave-types - Create a new leave type
router.post("/leave-types", authenticateToken, async (req, res) => {
  const {
    leave_type,
    allocation,
    allocation_type,
    carry_forward,
    carry_forward_type,
    percentage,
    description,
    constraint_type, // New field for min/max constraint type
    value, // New field for the value of min/max
    max_requests, // Optional field for max requests
  } = req.body;
  let responsePayload = {};

  // Hardcoded values for submodule and action
  const submodule = 'Leave Management';
  const action = 'Create a new leave type';
  const module = 'HRMS';

  // Validation for carry_forward fields
  if (carry_forward && (!carry_forward_type || percentage === undefined)) {

    responsePayload = {
      error: "Missing carry forward details",
      message:
        "If carry_forward is true, both carry_forward_type and percentage are required",
    };
    await logApiRequest(req, responsePayload, "failed", submodule, action, module);
    return res.status(400).json(responsePayload);
  }

  // Validation for constraint_type and value
  if (!["min", "max"].includes(constraint_type)) {

    responsePayload = {
      error: "Invalid constraint type",
      message: 'constraint_type must be either "min" or "max"',
    };
    await logApiRequest(req, responsePayload, "failed", submodule, action, module);
    return res.status(400).json(responsePayload);
  }

  if (value <= 0) {

    responsePayload = {
      error: "Invalid value",
      message: "The value for the constraint must be greater than zero",
    }
    await logApiRequest(req, responsePayload, "failed", submodule, action, module);
    return res.status(400).json(responsePayload);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN"); // Start a transaction

    // Insert new leave type
    const insertLeaveTypeQuery = `
            INSERT INTO leave_types (leave_type, allocation, allocation_type, carry_forward, carry_forward_type, percentage, description, constraint_type, value, max_requests)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`;

    const leaveTypeResult = await client.query(insertLeaveTypeQuery, [
      leave_type,
      allocation,
      allocation_type,
      carry_forward,
      carry_forward_type,
      percentage,
      description,
      constraint_type,
      value,
      max_requests, // This can be null or a valid integer
    ]);

    const newLeaveType = leaveTypeResult.rows[0];

    // Add new leave type balance for each user in leave_balances table
    const insertLeaveBalanceQuery = `
            INSERT INTO leave_balances (user_id, leave_type, allocation_type, balance, previous_balance, updated_at)
            SELECT user_id, $1, $2, $3, 0, NOW()
            FROM users`;

    await client.query(insertLeaveBalanceQuery, [
      leave_type,
      allocation_type,
      allocation,
    ]);

    await client.query("COMMIT"); // Commit the transaction


    responsePayload = {
      message:
        "Leave type created successfully and added to all users' balances.",
      leave_type: newLeaveType,
    };

    await logApiRequest(req, responsePayload, "success", submodule, action, module);

    res.status(201).json(responsePayload);
  } catch (err) {
    await client.query("ROLLBACK"); // Rollback the transaction on error
    console.error(
      "Error creating leave type and adding to user balances:",
      err
    );

    responsePayload = {
      error: "Failed to create leave type and add to user balances",
      message: err.detail,
    };
    await logApiRequest(req, responsePayload, "failed", submodule, action, module);
    res.status(500).json(responsePayload);
  } finally {
    client.release();
  }
});

// PUT /leave-types - Update Leave  Type Credentials
router.put("/leave-types/:id", authenticateToken, async (req, res) => {
  const leave_type_id = req.params.id;

  let responsePayload = {};

  const submodule = "Leave Management";
  const action = "Update leave type";
  const module = "HRMS";

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Fetch existing leave type data
    const existing = await client.query("SELECT * FROM leave_types WHERE id = $1", [leave_type_id]);

    if (existing.rowCount === 0) {
      throw new Error("Leave type not found");
    }

    const current = existing.rows[0];

    // Ignore incoming leave_type; use the existing one
    const {
      allocation = current.allocation,
      allocation_type = current.allocation_type,
      carry_forward = current.carry_forward,
      carry_forward_type = current.carry_forward_type,
      percentage = current.percentage,
      description = current.description,
      constraint_type = current.constraint_type,
      value = current.value,
      max_requests = current.max_requests,
    } = req.body;

    // Validation
    if (
      carry_forward &&
      (!carry_forward_type || percentage === undefined)
    ) {
      responsePayload = {
        error: "Missing carry forward details",
        message: "If carry_forward is true, both carry_forward_type and percentage are required",
      };
      await logApiRequest(req, responsePayload, "failed", submodule, action, module);
      return res.status(400).json(responsePayload);
    }

    if (!["min", "max"].includes(constraint_type)) {
      responsePayload = {
        error: "Invalid constraint type",
        message: 'constraint_type must be either "min" or "max"',
      };
      await logApiRequest(req, responsePayload, "failed", submodule, action, module);
      return res.status(400).json(responsePayload);
    }

    if (value <= 0) {
      responsePayload = {
        error: "Invalid value",
        message: "The value for the constraint must be greater than zero",
      };
      await logApiRequest(req, responsePayload, "failed", submodule, action, module);
      return res.status(400).json(responsePayload);
    }

    // Final update query (leave_type NOT updated)
    const updateQuery = `
      UPDATE leave_types
      SET allocation = $1,
          allocation_type = $2,
          carry_forward = $3,
          carry_forward_type = $4,
          percentage = $5,
          description = $6,
          constraint_type = $7,
          value = $8,
          max_requests = $9
      WHERE id = $10
      RETURNING *;
    `;

    const result = await client.query(updateQuery, [
      allocation,
      allocation_type,
      carry_forward,
      carry_forward_type,
      percentage,
      description,
      constraint_type,
      value,
      max_requests,
      leave_type_id,
    ]);

    const updatedLeaveType = result.rows[0];

    await client.query("COMMIT");

    responsePayload = {
      message: "Leave type updated successfully (name unchanged)",
      leave_type: updatedLeaveType,
    };
    await logApiRequest(req, responsePayload, "success", submodule, action, module);
    res.status(200).json(responsePayload);
  } catch (err) {
    await client.query("ROLLBACK");

    console.error("Error updating leave type:", err);

    responsePayload = {
      error: "Failed to update leave type",
      message: err.message || err.detail || "Unknown error",
    };
    await logApiRequest(req, responsePayload, "failed", submodule, action, module);
    res.status(500).json(responsePayload);
  } finally {
    client.release();
  }
});



// DELETE /leave-types/:leave_type - Delete a leave type by leave_type
router.delete("/leave-types/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  let responsePayload = {};

  const submodule = 'Leave Management';
  const action = 'Delete a leave type';
  const module = 'HRMS';

  try {
    await client.query("BEGIN"); // Start transaction

    // Check if the leave type exists
    const checkExistQuery = `SELECT * FROM leave_types WHERE id = $1`;
    const checkExistResult = await client.query(checkExistQuery, [id]);

    if (checkExistResult.rows.length === 0) {
      responsePayload = { error: "Leave type not found" };
      await logApiRequest(req, responsePayload, "failed", submodule, action, module);
      return res.status(404).json(responsePayload);
    }

    // Delete all related leave requests first
    const deleteLeaveRequestsQuery = `DELETE FROM leave_requests WHERE leave_type = (SELECT leave_type FROM leave_types WHERE id = $1)`;
    await client.query(deleteLeaveRequestsQuery, [id]);

    // Now delete the leave type
    const deleteQuery = `DELETE FROM leave_types WHERE id = $1`;
    await client.query(deleteQuery, [id]);

    await client.query("COMMIT"); // Commit transaction

    responsePayload = { message: "Leave type and associated leave requests deleted successfully" };
    await logApiRequest(req, responsePayload, "success", submodule, action, module);

    res.status(200).json(responsePayload);
  } catch (err) {
    await client.query("ROLLBACK"); // Rollback transaction in case of error
    console.error("Error deleting leave type:", err);

    responsePayload = { error: "Failed to delete leave type", details: err.detail };
    await logApiRequest(req, responsePayload, "failed", submodule, action, module);

    res.status(500).json(responsePayload);
  } finally {
    client.release();
  }
});


// POST /leave-balances - Automatically create leave balances for a user
router.post("/balance", authenticateToken, async (req, res) => {
  const { user_id } = req.body;
  const client = await pool.connect();
  let responsePayload = {};
  // Hardcoded values for submodule and action
  const submodule = 'Leave Management';
  const action = 'fetchLeaveTypes';
  const module = 'HRMS';
  try {

    // Check if the user exists
    const userCheckQuery = "SELECT user_id FROM users WHERE user_id = $1";
    const userCheckResult = await client.query(userCheckQuery, [user_id]);

    if (userCheckResult.rowCount === 0) {

      const responsePayload = { error: "User not found" };
      // Log the failure if user not found
      await logApiRequest(req, responsePayload, "failed", submodule, action, module);

      return res.status(404).json(responsePayload);
    }

    // Fetch all leave types from the leave_types table
    const leaveTypesQuery =
      "SELECT leave_type, allocation, allocation_type FROM leave_types";
    const leaveTypesResult = await client.query(leaveTypesQuery);
    const leaveTypes = leaveTypesResult.rows;

    if (leaveTypes.length === 0) {
      const responsePayload = { error: "No leave types found" };
      // Log the failure if no leave types found
      await logApiRequest(req, responsePayload, "failed", submodule, action, module);

      return res.status(404).json(responsePayload);
    }

    // Insert leave balances for each leave type for the given user
    const balancePromises = leaveTypes.map(
      ({ leave_type, allocation, allocation_type }) => {
        return client.query(
          `INSERT INTO leave_balances (user_id, leave_type, allocation_type, balance, previous_balance)
                 VALUES ($1, $2, $3, $4, $5)`,
          [user_id, leave_type, allocation_type, allocation, 0] // Set balance equal to allocation and previous_balance to 0
        );
      }
    );

    await Promise.all(balancePromises);

    responsePayload = { message: "Leave balances created successfully", user_id: user_id }
    // Log the success after balances are created
    await logApiRequest(req, responsePayload, "success", submodule, action, module);

    res.status(201).json(responsePayload);
  } catch (err) {
    responsePayload = { error: "Failed to create leave balances", message: err.detail }
    // Log the failure if there was an error during processing
    await logApiRequest(req, responsePayload, "failed", submodule, action, module);

    console.error("Error creating leave balances:", err);
    res.status(500).json(responsePayload);
  } finally {
    client.release();
  }
});

// GET /leave-types - Get all leave types with user names
router.get("/balance-all",authenticateToken,  async (req, res) => {
  const client = await pool.connect();
  try {
    // Fetch leave balances along with user names (first_name + last_name as name)
    const query = `
            SELECT lb.*, u.first_name || ' ' || u.last_name AS name
            FROM leave_balances lb
            JOIN users u ON lb.user_id = u.user_id
        `;
    const result = await client.query(query);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Leave balance not found" });
    }

    res.status(200).json({ message: "Leave balance retrieved successfully.", leave_balances: result.rows });
  } catch (err) {
    console.error("Error fetching leave balance:", err);

    res
      .status(500)
      .json({ error: "Internal server error", message: err.detail });
  } finally {
    client.release();
  }
});




// GET /balance/:user_id - Get leave balance for a specific user
router.get("/balance/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; // Extract user_id from the URL parameters
  const client = await pool.connect();

  try {
    // Fetch leave balance for the specified user
    const query = "SELECT * FROM leave_balances WHERE user_id = $1";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Leave balance not found for this user" });
    }
    res.status(200).json({ message: "Leave balance retrieved successfully.", leave_balance: result.rows });
  } catch (err) {
    console.error("Error fetching leave balance:", err);
    res
      .status(500)
      .json({ error: "Internal server error", message: err.detail });
  } finally {
    client.release();
  }
});



// leave balance update------>
router.put("/leave-balances-update/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { balance, previous_balance } = req.body;

  const submodule = 'Leave Management';
  const action = 'Update balance for a leave balance record';
  const module = 'HRMS';

  const client = await pool.connect();
  let responsePayload = {};

  try {
    // Step 1: Get user ID from token (assuming req.user is set by middleware)
// Step 1: Get user ID from token
const userId =  req.user?.user_id;
console.log(userId);
if (!userId) {
  responsePayload = { error: "Unauthorized: User ID not found in token" };
  await logApiRequest(req, responsePayload, "failed", submodule, action, module);
  return res.status(401).json(responsePayload);
}

// Step 2: Fetch manager ID using user_id field
const managerQuery = "SELECT manager_id FROM users WHERE user_id = $1";
const managerResult = await client.query(managerQuery, [userId]);

if (managerResult.rowCount === 0 || !managerResult.rows[0].manager_id) {
  responsePayload = { error: "Manager not found for current user" };
  await logApiRequest(req, responsePayload, "failed", submodule, action, module);
  return res.status(404).json(responsePayload);
}

const managerId = managerResult.rows[0].manager_id;


    // Step 3: Check if the leave balance record exists
    const fetchQuery = "SELECT * FROM leave_balances WHERE id = $1";
    const fetchResult = await client.query(fetchQuery, [id]);

    if (fetchResult.rowCount === 0) {
      responsePayload = { error: "Leave balance record not found" };
      await logApiRequest(req, responsePayload, "failed", submodule, action, module);
      return res.status(404).json(responsePayload);
    }

    // Step 4: Prepare pending changes and update query
    const updates = [];
    const values = [];
    let queryIndex = 1;

    const pendingChanges = {};
    if (balance !== undefined) {
      pendingChanges.pending_balance = balance;
    }

    if (previous_balance !== undefined) {
      pendingChanges.pending_previous_balance = previous_balance;
    }

    if (Object.keys(pendingChanges).length > 0) {
      updates.push(`pending_changes = $${queryIndex++}`);
      values.push(pendingChanges);
    }

    updates.push(`status = 'pending'`);
    updates.push(`manager_id = $${queryIndex++}`);
    values.push(managerId);

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const updateQuery = `
      UPDATE leave_balances
      SET ${updates.join(", ")}
      WHERE id = $${queryIndex}
      RETURNING *;
    `;

    const updateResult = await client.query(updateQuery, values);

    responsePayload = { message: "Leave balance updated successfully", leave_balance: updateResult.rows[0] };
    await logApiRequest(req, responsePayload, "success", submodule, action, module);
    res.status(200).json(responsePayload);
  } catch (err) {
    console.error("Error updating leave balance:", err);
    responsePayload = { error: "Failed to update leave balance", message: err.detail || err.message };
    await logApiRequest(req, responsePayload, "failed", submodule, action, module);
    res.status(500).json(responsePayload);
  } finally {
    client.release();
  }
});


// new leave balance approval 
router.put("/leave-balances-approval/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const submodule = 'Leave Management';
  const action = 'Update the status of a leave balance';
  const module = 'HRMS';

  const client = await pool.connect();
  let responsePayload = {};

  try {
    const currentManagerId =  req.user?.user_id;

    if (!currentManagerId) {
      responsePayload = { error: "Unauthorized: Manager ID not found in token" };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);
      return res.status(401).json(responsePayload);
    }

    const fetchQuery = `
      SELECT lb.user_id, lb.manager_id
      FROM leave_balances lb
      WHERE lb.id = $1;
    `;
    const fetchResult = await client.query(fetchQuery, [id]);

    if (fetchResult.rowCount === 0) {
      responsePayload = { error: "Leave balance record not found" };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);
      return res.status(404).json(responsePayload);
    }

    const leaveBalanceRecord = fetchResult.rows[0];

    if (leaveBalanceRecord.manager_id !== currentManagerId) {
      responsePayload = { error: "You are not authorized to approve/disapprove this leave balance" };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);
      return res.status(403).json(responsePayload);
    }

    if (!["approved", "rejected"].includes(status)) {
      responsePayload = { error: 'Status must be either "approved" or "rejected"' };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);
      return res.status(400).json(responsePayload);
    }

    if (status === "approved") {
      const fetchLeaveBalance = await client.query(`
        SELECT * FROM leave_balances WHERE id = $1;
      `, [id]);

      const leaveBalance = fetchLeaveBalance.rows[0];
      const pendingChanges = leaveBalance.pending_changes;

      if (!pendingChanges) {
        responsePayload = { error: "No pending changes to approve" };
        await logApiRequest(req, responsePayload, 'failed', submodule, action, module);
        return res.status(400).json(responsePayload);
      }

      const { pending_balance, pending_previous_balance } = pendingChanges;

      const updateQuery = `
        UPDATE leave_balances
        SET balance = $1,
            previous_balance = $2,
            status = 'approved',
            pending_changes = NULL,
            manager_id = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING id, balance, previous_balance, status, updated_at;
      `;

      const updateResult = await client.query(updateQuery, [
        pending_balance,
        pending_previous_balance,
        id
      ]);

      responsePayload = {
        message: "Leave balance request approved",
        leave_balance: updateResult.rows[0]
      };
      await logApiRequest(req, responsePayload, 'success', submodule, action, module);
      return res.status(200).json(responsePayload);
    } else if (status === "rejected") {
      const updateQuery = `
        UPDATE leave_balances
        SET pending_changes = NULL,
            status = 'rejected',
             manager_id = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, status, manager_id , updated_at;
      `;

      const updateResult = await client.query(updateQuery, [id]);

      responsePayload = {
        message: "Leave balance request rejected",
        leave_balance: updateResult.rows[0]
      };
      await logApiRequest(req, responsePayload, 'success', submodule, action, module);
      return res.status(200).json(responsePayload);
    }

  } catch (err) {
    responsePayload = { error: "Failed to process leave balance", message: err.detail || err.message };
    await logApiRequest(req, responsePayload, 'failed', submodule, action, module);
    return res.status(500).json(responsePayload);
  } finally {
    client.release();
  }
});


// new get balance api
// router.get("/leave-balances-for-manager", authenticateToken, async (req, res) => {
//   const submodule = 'Leave Management';
//   const action = 'Fetch pending leave balances assigned to manager';
//   const module = 'HRMS';

//   const client = await pool.connect();
//   let responsePayload = {};

//   try {
//     const managerId = req.user?.user_id;
//     console.log(managerId, "manager id........")

//     if (!managerId) {
//       responsePayload = { error: "Unauthorized: Manager ID not found in token" };
//       return res.status(401).json(responsePayload);
//     }

//     const query = `
//       SELECT 
//         lb.id, 
//         lb.user_id, 
//         lb.leave_type,
//         lb.allocation_type,
//         lb.balance, 
//         lb.previous_balance, 
//         lb.total_balance,
//         lb.request_count,
//         lb.pending_changes,
//         lb.status, 
//         lb.updated_at,
//         lb.manager_id
//       FROM leave_balances lb
//       JOIN users u ON lb.user_id = u.user_id
//       WHERE lb.manager_id = $1 AND lb.status = 'pending';
//     `;

//     const result = await client.query(query, [managerId]);

//     responsePayload = {
//       message: "Pending leave balances fetched successfully",
//       leave_balances: result.rows
//     };

//     return res.status(200).json(responsePayload);

//   } catch (err) {
//     responsePayload = { error: "Failed to fetch leave balances", message: err.message };
//     return res.status(500).json(responsePayload);
//   } finally {
//     client.release();
//   }
// });

router.get("/leave-balances-for-manager", authenticateToken, async (req, res) => {
  const submodule = 'Leave Management';
  const action = 'Fetch pending leave balances assigned to manager';
  const module = 'HRMS';

  const client = await pool.connect();
  let responsePayload = {};

  try {
    const managerId = req.user?.user_id;
    console.log("Token managerId:", managerId);  // 🟢 Log from token

    if (!managerId) {
      return res.status(401).json({ error: "Unauthorized: Manager ID not found in token" });
    }

    // 🔍 Check if managerId exists in users table
    const managerCheck = await client.query(
      `SELECT user_id FROM users WHERE user_id = $1`,
      [managerId]
    );

    if (managerCheck.rows.length === 0) {
      return res.status(404).json({ error: "Manager not found in users table" });
    }

    const userTableId = managerCheck.rows[0].user_id;
    console.log("User table managerId:", userTableId);  // 🔵 Log from users table

    // ✅ Proceed to fetch leave balances
    const query = `
      SELECT 
        lb.id, 
        lb.user_id, 
        lb.leave_type,
        lb.allocation_type,
        lb.balance, 
        lb.previous_balance, 
        lb.total_balance,
        lb.request_count,
        lb.pending_changes,
        lb.status, 
        lb.updated_at,
        lb.manager_id
      FROM leave_balances lb
      JOIN users u ON lb.user_id = u.user_id
      WHERE lb.manager_id = $1 AND lb.status = 'pending';
    `;

    const result = await client.query(query, [managerId]);

    responsePayload = {
      message: "Pending leave balances fetched successfully",
      leave_balances: result.rows
    };

    return res.status(200).json(responsePayload);

  } catch (err) {
    responsePayload = { error: "Failed to fetch leave balances", message: err.message };
    return res.status(500).json(responsePayload);
  } finally {
    client.release();
  }
});



//leave-balances/:id - Update balance or previous_balance for a leave balance record
// router.put("/leave-balances/:id", authenticateToken, async (req, res) => {
//   const { id } = req.params;
//   const { balance, previous_balance } = req.body;
//   const submodule = 'Leave Management';
//   const action = 'Update balance for a leave balance record';
//   const module = 'HRMS';
//   const client = await pool.connect();
//   let responsePayload = {};

//   try {
//     const fetchQuery = "SELECT * FROM leave_balances WHERE id = $1";
//     const fetchResult = await client.query(fetchQuery, [id]);

//     if (fetchResult.rowCount === 0) {
//       responsePayload = { error: "Leave balance record not found" };
//       await logApiRequest(req, responsePayload, "failed", submodule, action, module);
//       return res.status(404).json(responsePayload);
//     }

//     const updates = [];
//     const values = [];
//     let queryIndex = 1;

//     // Prepare pending changes as a JSON object
//     const pendingChanges = {};
//     if (balance !== undefined) {
//       pendingChanges.pending_balance = balance;
//     }

//     if (previous_balance !== undefined) {
//       pendingChanges.pending_previous_balance = previous_balance;
//     }

//     // Add pending changes to updates
//     updates.push(`pending_changes = $${queryIndex++}`);
//     values.push(pendingChanges);

//     updates.push(`status = 'pending'`);

//     if (updates.length === 0) {
//       responsePayload = { error: "No fields to update" };
//       await logApiRequest(req, responsePayload, "failed", submodule, action, module);
//       return res.status(400).json(responsePayload);
//     }

//     values.push(id);

//     const updateQuery = `
//       UPDATE leave_balances
//       SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
//       WHERE id = $${queryIndex}
//       RETURNING *;
//     `;

//     const updateResult = await client.query(updateQuery, values);

//     responsePayload = { message: "Leave balance updated successfully", leave_balance: updateResult.rows[0] };
//     await logApiRequest(req, responsePayload, "success", submodule, action, module);
//     res.status(200).json(responsePayload);
//   } catch (err) {
//     console.error("Error updating leave balance:", err);
//     responsePayload = { error: "Failed to update leave balance", message: err.detail };
//     await logApiRequest(req, responsePayload, "failed", submodule, action, module);
//     res.status(500).json(responsePayload);
//   } finally {
//     client.release();
//   }
// });

// Leave Balance approval
// router.put("/leave-balances-update/:id", authenticateToken, async (req, res) => {
//   const { id } = req.params;  // Leave balance ID
//   const { status } = req.body;  // Status (approve or disapprove)
//   const submodule = 'Leave Management';
//   const action = 'Update the status of a leave balance';
//   const module = 'HRMS';

//   const client = await pool.connect();  // Get a client from the pool
//   let responsePayload = {};

//   try {
//     // Extract user information from the token (assuming user_id is in the JWT token)
//     const currentUserId = req.user.user_id;


//     const fetchQuery = `
//       SELECT lb.user_id
//       FROM leave_balances lb
//       WHERE lb.id = $1;
//     `;
//     const fetchResult = await client.query(fetchQuery, [id]);


//     if (fetchResult.rowCount === 0) {
//       responsePayload = { error: "Leave balance record not found" };
//       await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log failure response
//       return res.status(404).json(responsePayload);
//     }

//     const userIdFromLeaveBalance = fetchResult.rows[0].user_id;  // This is the user_id from the leave_balance record

//     // Step 2: Retrieve the manager_id from the users table based on the user_id
//     const userQuery = "SELECT manager_id FROM users WHERE user_id = $1";
//     const userResult = await client.query(userQuery, [userIdFromLeaveBalance]);

//     if (userResult.rowCount === 0) {
//       responsePayload = { error: "User not found" };
//       await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log failure response
//       return res.status(404).json(responsePayload);
//     }

//     const manager_id = userResult.rows[0].manager_id;  // Get manager_id for this user

//     if (manager_id !== currentUserId) {
//       responsePayload = { error: "You are not authorized to approve or disapprove this leave balance" };
//       await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log failure response
//       return res.status(403).json(responsePayload);
//     }

//     // Validate status input (approved or rejected)
//     if (!["approved", "rejected"].includes(status)) {
//       responsePayload = { error: 'Status must be either "approved" or "rejected"' };
//       await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log failure response
//       return res.status(400).json(responsePayload);
//     }

//     // If the status is approve, handle approval logic
//     if (status === "approved") {
//       const fetchLeaveBalance = await client.query(`
//         SELECT * FROM leave_balances WHERE id = $1;
//       `, [id]);

//       const leaveBalance = fetchLeaveBalance.rows[0];
//       const pendingChanges = leaveBalance.pending_changes;

//       if (!pendingChanges) {
//         responsePayload = { error: "No pending changes to approve" };
//         await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log failure response
//         return res.status(400).json(responsePayload);
//       }

//       // Update the leave balance with pending changes and mark as approved
//       const updateQuery = `
//         UPDATE leave_balances
//         SET balance = $1, previous_balance = $2, status = 'approved', updated_at = CURRENT_TIMESTAMP
//         WHERE id = $3
//         RETURNING id, balance, previous_balance, status, updated_at;
//       `;
//       const { pending_balance, pending_previous_balance } = pendingChanges;
//       const updateResult = await client.query(updateQuery, [
//         pending_balance,
//         pending_previous_balance,
//         id  // Use the ID from the URL parameter
//       ]);

//       responsePayload = { message: "Leave balance request approved", leave_balance: updateResult.rows[0] };
//       await logApiRequest(req, responsePayload, 'success', submodule, action, module);  // Log success response
//       return res.status(200).json(responsePayload);

//     } else if (status === "rejected") {
//       // If the status is rejected, remove pending changes and mark as rejected
//       const updateQuery = `
//         UPDATE leave_balances
//         SET pending_changes = NULL, status = 'rejected', updated_at = CURRENT_TIMESTAMP
//         WHERE id = $1
//         RETURNING id, status, updated_at;
//       `;
//       const updateResult = await client.query(updateQuery, [id]);  // Use the ID from the URL parameter

//       responsePayload = { message: "Leave balance request disapproved", leave_balance: updateResult.rows[0] };
//       await logApiRequest(req, responsePayload, 'success', submodule, action, module);  // Log success response
//       return res.status(200).json(responsePayload);
//     }

//   } catch (err) {
//     responsePayload = { error: "Failed to process leave balance", message: err.detail };
//     await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log error
//     return res.status(500).json(responsePayload);
//   } finally {
//     client.release();
//   }
// });



/// Endpoint to set the sandwich leave rule (enable or disable)
router.post("/sandwich", authenticateToken, async (req, res) => {
  const { enabled } = req.body; // 'enabled' can be true or false
  // Hardcoded values for submodule and action
  const submodule = 'Leave Management';
  const module = 'HRMS';
  const action = 'Sandwich leave rule (enable or disable)';
  let responsePayload = {};

  if (typeof enabled === "boolean") {
    const client = await pool.connect();
    try {
      const query = `
                UPDATE leave_settings
                SET setting_value = $1
                WHERE setting_name = 'sandwichLeaveEnabled'
                RETURNING *;
            `;
      const result = await client.query(query, [enabled]);

      // Prepare the response payload
      responsePayload = {
        message: `Sandwich leave rule ${enabled ? "enabled" : "disabled"}`,
        sandwich_leave: result.rows[0] // You might want to include the updated record here for more context
      };

      // Log the successful request
      await logApiRequest(req, responsePayload, "success", submodule, action, module);

      // Send the successful response
      res.status(200).json(responsePayload);
    } catch (err) {
      console.error("Error updating sandwich leave rule:", err);

      // Prepare the failure response payload
      responsePayload = {
        error: "Failed to update sandwich leave rule",
        message: err.detail,
      };

      // Log the failed request
      await logApiRequest(req, responsePayload, "failed", submodule, action, module);

      // Send the failure response
      res.status(500).json(responsePayload);
    } finally {
      client.release();
    }
  } else {
    // Invalid input, 'enabled' is not a boolean
    responsePayload = {
      error: 'Invalid input. "enabled" must be a boolean (true or false).',
    };

    // Log the failed request
    await logApiRequest(req, responsePayload, "failed", submodule, action, module);

    // Send the invalid input response
    return res.status(400).json(responsePayload);
  }
});


// Endpoint to get the sandwich leave status
router.get("/sandwich", authenticateToken, async (req, res) => {
  const client = await pool.connect();


  try {
    const result = await client.query(
      "SELECT setting_value FROM leave_settings WHERE setting_name = $1",
      ["sandwichLeaveEnabled"]
    );

    // Log the request if successful
    if (result.rowCount > 0) {

      // Return success response
      return res.status(200).json({
        message: `Fetched sandwich leave setting: ${result.rows[0].setting_value}`,
        sandwichLeaveEnabled: result.rows[0].setting_value, // Include the setting value in the response
      });
    } else {

      // Return not found response
      return res.status(404).json({ error: "Setting not found" });
    }
  } catch (err) {
    console.error("Error fetching sandwich leave setting:", err);

    // Prepare failure response payload
    // Return error response
    res.status(500).json({
      error: "Failed to fetch sandwich leave setting",
      message: err.detail,
    });
  } finally {
    client.release();
  }
});


// POST /leave-requests - Create a new leave request
router.post("/leave-requests", authenticateToken, async (req, res) => {
  const {
    user_id,
    leave_type,
    start_date,
    end_date,
    reason,
    manager_id,
    half_day_start,
    half_day_end,
  } = req.body;
  const client = await pool.connect();
  // Hardcoded values for submodule and action
  const submodule = 'Leave Management';
  const action = 'Create a new leave request';
  const module = 'HRMS';

  
  let responsePayload = { message: "Leave request created successfully." };

  if (
    !user_id ||
    !leave_type ||
    !start_date ||
    !end_date ||
    !reason ||
    !manager_id ||
    typeof half_day_start !== "boolean" ||
    typeof half_day_end !== "boolean"
  ) {

    responsePayload = {
      error:
        "All fields are required, including valid boolean values for half_day_start and half_day_end.",
    };

    await logApiRequest(req, responsePayload, 'failed', submodule, action, module);
    return res
      .status(400)
      .json(responsePayload);
  }
  try {
    // Fetch the sandwich leave setting
    const sandwichLeaveSettingQuery = `
         SELECT setting_value FROM leave_settings WHERE setting_name = $1`;
    const sandwichLeaveSettingResult = await client.query(
      sandwichLeaveSettingQuery,
      ["sandwichLeaveEnabled"]
    );

    const sandwichLeaveEnabled =
      sandwichLeaveSettingResult.rowCount > 0
        ? sandwichLeaveSettingResult.rows[0].setting_value
        : false;

    // Check if the leave type is valid and get allocation and constraints
    const leaveTypeQuery = `
            SELECT allocation, constraint_type, value, max_requests FROM leave_types WHERE leave_type = $1`;
    const leaveTypeResult = await client.query(leaveTypeQuery, [leave_type]);

    if (leaveTypeResult.rows.length === 0) {

      responsePayload = { error: "Leave type not found" };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);
      return res.status(404).json(responsePayload);
    }

    const { allocation, constraint_type, value, max_requests } =
      leaveTypeResult.rows[0];

    // Check the user's leave balance and request count for the specified leave type
    const balanceQuery = `
            SELECT balance, request_count,total_balance FROM leave_balances 
            WHERE user_id = $1 AND leave_type = $2`;
    const balanceResult = await client.query(balanceQuery, [
      user_id,
      leave_type,
    ]);

    if (balanceResult.rows.length === 0) {

      responsePayload = { error: "Leave balance not found for the specified leave type" };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response

      return res
        .status(404)
        .json(responsePayload);
    }

    const { balance, request_count, total_balance } = balanceResult.rows[0];

    // Check if the user have enough balance to apply the leave in case of Request pending
    const pendingRequest = `
                 SELECT user_id, leave_type, SUM(leave_days) AS total_leave_days FROM leave_requests WHERE status = 'pending' AND 
                 user_id = $1 AND leave_type = $2 GROUP BY user_id, leave_type ORDER BY user_id, leave_type`;

    // sum of leaves in pending for a user and its type

    // Execute the query
    const requestResult = await client.query(pendingRequest, [
      user_id,
      leave_type,
    ]);

    // Safely extract total_leave_days or default to 0 if no rows are returned
    const { total_leave_days = 0 } = requestResult.rows[0] || {};

    // Check if the pending leave days exceed the available balance
    if (total_leave_days >= total_balance) {
      responsePayload = { error: `Insufficient leave balance for ${leave_type}. Pending requests total: ${total_leave_days} days, available Balance: ${total_balance} days. Please adjust your request or consult your manager.` };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);
      return res.status(404).json(responsePayload);
    }

    // Check if the user has exceeded the maximum number of requests (if max_requests is set)
    if (max_requests !== null && request_count >= max_requests) {
      responsePayload = { error: `You have exceeded the maximum number of ${max_requests} requests for ${leave_type}` };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response

      return res
        .status(400)
        .json(responsePayload);
    }

    // Check for overlapping leave requests
    const overlapQuery = `
            SELECT * FROM leave_requests 
            WHERE user_id = $1 
              AND ((start_date BETWEEN $2 AND $3) OR (end_date BETWEEN $2 AND $3) 
              OR ($2 BETWEEN start_date AND end_date) OR ($3 BETWEEN start_date AND end_date)) AND status!='rejected'`;
    const overlapResult = await client.query(overlapQuery, [
      user_id,
      start_date,
      end_date,
    ]);

    if (overlapResult.rows.length > 0) {

      responsePayload = { error: "Leave request violates overlapping condition with existing leave." };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response
      return res
        .status(400)
        .json(responsePayload);
    }

    const startDate = new Date(
      Date.UTC(
        parseInt(start_date.split("-")[0]), // Year
        parseInt(start_date.split("-")[1]) - 1, // Month (0-based)
        parseInt(start_date.split("-")[2]) // Day
      )
    );

    const endDate = new Date(
      Date.UTC(
        parseInt(end_date.split("-")[0]), // Year
        parseInt(end_date.split("-")[1]) - 1, // Month (0-based)
        parseInt(end_date.split("-")[2]), // Day
        23,
        59,
        59 // End of the day in UTC
      )
    );

    // Calculate total leave days including both start and end dates
    let totalLeaveDays =
      Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    //console.log(totalLeaveDays);

    let half_day = 0;

    // Adjust for half-day selections
    if (half_day_start && half_day_end) {
      if (totalLeaveDays > 1) {
        half_day = 1; // Reduce by a full day if both half days are selected
      } else {

        responsePayload = { error: "Total leave days must be more than 1 to select both half days." };
        await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response

        return res
          .status(400)
          .json(responsePayload);
      }
    } else if (half_day_start || half_day_end) {
      half_day = 0.5; // Reduce by half a day if either half day is selected
    }

    // Check for working days and holidays
    const holidaysQuery = `SELECT holiday_date FROM holidays WHERE holiday_date BETWEEN $1 AND $2`;
    const holidaysResult = await client.query(holidaysQuery, [
      start_date,
      end_date,
    ]);

    const workingDaysQuery = `
            SELECT working_days FROM working_days 
            WHERE year_type = 
              (SELECT year_type FROM year_settings WHERE $1 BETWEEN start_date AND end_date)`;
    const workingDaysResult = await client.query(workingDaysQuery, [
      start_date,
    ]);

    const workingDays = workingDaysResult.rows.map((row) => row.working_days);
    const holidays = holidaysResult.rows.map((row) => row.holiday_date);

    if (sandwichLeaveEnabled && totalLeaveDays > 1)  {
      // Count all days including weekends and holidays
      totalLeaveDays =
        Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

      // Check for non-working days before the start date
      let beforeDate = new Date(startDate);
      while (true) {
        beforeDate.setDate(beforeDate.getDate() - 1);
        const dayOfWeek = beforeDate.toLocaleDateString("en-US", {
          weekday: "long",
        });
        const formattedDate = beforeDate.toISOString().split("T")[0];

        if (
          workingDays.includes(dayOfWeek) &&
          !holidays.includes(formattedDate)
        ) {
          // Stop if a working day is encountered
          break;
        }
        totalLeaveDays++; // Add non-working day to total leave days
      }

      // Check for non-working days after the end date
      let afterDate = new Date(endDate);
      while (true) {
        afterDate.setDate(afterDate.getDate() + 1);
        const dayOfWeek = afterDate.toLocaleDateString("en-US", {
          weekday: "long",
        });
        const formattedDate = afterDate.toISOString().split("T")[0];

        if (
          workingDays.includes(dayOfWeek) &&
          !holidays.includes(formattedDate)
        ) {
          // Stop if a working day is encountered
          break;
        }
        totalLeaveDays++; // Add non-working day to total leave days
      }
    } else {
      // Only count working days, excluding weekends and holidays
      totalLeaveDays = 0; // Reset to count working days only
      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 1)
      ) {
        const dayOfWeek = d.toLocaleDateString("en-US", { weekday: "long" }); // e.g., 'Monday', 'Sunday'
        const formattedDate = d.toISOString().split("T")[0];

        if (
          workingDays.includes(dayOfWeek) &&
          !holidays.includes(formattedDate)
        ) {
          totalLeaveDays++; // Count only working days
        }
      }
    }

    // Check if the total leave days meet the required constraints
    if (constraint_type === "min" && totalLeaveDays < value) {
      responsePayload = { error: `You must apply for at least ${value} days of leave` };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response
      return res
        .status(400)
        .json(responsePayload);
    }

    if (constraint_type === "max" && totalLeaveDays > value) {
      responsePayload = { error: `You can apply for a maximum of ${value} days of leave` };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response
      return res
        .status(400)
        .json(responsePayload);
    }

    // updating the final totalLeaveDays
    totalLeaveDays = totalLeaveDays - half_day;

    // Check if the user has enough leave balance
    if (totalLeaveDays > total_balance) {
      responsePayload = { error: "Insufficient leave balance" };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response
      return res.status(400).json(responsePayload);
    }

    // Create the leave request and store the total leave days in actual_leave_days
    const leaveRequestQuery = `
            INSERT INTO leave_requests (
                user_id, leave_type, start_date, end_date, reason, manager_id, leave_days, half_day_start, half_day_end
            )
            VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9) RETURNING *`;

    const leaveRequestResult = await client.query(leaveRequestQuery, [
      user_id,
      leave_type,
      start_date,
      end_date,
      reason,
      manager_id,
      totalLeaveDays,
      half_day_start,
      half_day_end,
    ]);

    // Format dates before sending response
    const formattedLeaveRequest = {
      ...leaveRequestResult.rows[0],
      start_date: start_date, // Use the original start_date from the request
      end_date: end_date, // Use the original end_date from the request
    };

    responsePayload = {
      message: "Leave request created successfully.",
      leave_request: formattedLeaveRequest,
    };
    await logApiRequest(req, responsePayload, 'success', submodule, action, module); // Log success

    res.status(201).json(responsePayload);

  } catch (err) {
    console.error("Error creating leave request:", err);
    responsePayload = {
      error: "Failed to create leave request",
      message: err.detail || err.message || err.error,
    };

    // Log error response
    await logApiRequest(req, responsePayload, 'failed', submodule, action, module); // Log failure

    res.status(500).json(responsePayload);
  } finally {
    client.release();
  }
});

// DELETE /leave-requests/:id - Delete a leave request before the start date and adjust balance if approved
router.delete("/leave-requests/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  // Hardcoded values for submodule and action
  const submodule = 'Leave Management';
  const action = 'Delete a leave request';
  const module = 'HRMS';
  let responsePayload = {};
  const client = await pool.connect();

  try {
    // Check if the leave request exists
    const leaveRequestQuery = `SELECT * FROM leave_requests WHERE id = $1`;
    const leaveRequestResult = await client.query(leaveRequestQuery, [id]);

    if (leaveRequestResult.rows.length === 0) {
      // Log the failed request when leave request is not found
      responsePayload = { error: "Leave request not found" };
      await logApiRequest(req, responsePayload, "failed", submodule, action, module);

      return res.status(404).json(responsePayload);
    }

    const leaveRequest = leaveRequestResult.rows[0];
    const currentDate = new Date();
    const startDate = new Date(leaveRequest.start_date);

    // Allow deletion only if the start date has not passed
    if (currentDate >= startDate) {
      // Log the failed request when trying to delete a leave request after the start date
      responsePayload = { error: "Cannot delete leave request after the start date" };
      await logApiRequest(req, responsePayload, "failed", submodule, action, module);

      return res.status(400).json(responsePayload);
    }

    // If the leave request was approved, add back the leave days to the balance
    if (leaveRequest.status === "approved") {
      const { user_id, leave_type, leave_days } = leaveRequest;

      // Update the user's leave balance by adding back the days
      const balanceQuery = `
                UPDATE leave_balances 
                SET balance = balance + $1, request_count = request_count - 1 
                WHERE user_id = $2 AND leave_type = $3
                RETURNING balance, previous_balance, total_balance`;
      await client.query(balanceQuery, [leave_days, user_id, leave_type]);
    }

    // Delete the leave request
    const deleteQuery = `DELETE FROM leave_requests WHERE id = $1`;
    await client.query(deleteQuery, [id]);

    // Log the successful deletion
    responsePayload = { message: "Leave request deleted successfully." };
    await logApiRequest(req, responsePayload, "success", submodule, action, module);

    // Send the success response
    res.status(200).json(responsePayload);
  } catch (err) {
    console.error("Error deleting leave request:", err);

    // Log the failed request in case of error
    responsePayload = { error: "Internal server error", message: err.detail };
    await logApiRequest(req, responsePayload, "failed", submodule, action, module);

    // Send the failure response
    res.status(500).json(responsePayload);
  } finally {
    client.release();
  }
});


// GET /leave-requests - Get all leave requests
router.get("/leave-requests", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const query = `
            SELECT lr.*, lt.leave_type, u.first_name AS manager_first_name, u.last_name AS manager_last_name, E.first_name, E.last_name 
            FROM leave_requests lr
            JOIN leave_types lt ON lr.leave_type = lt.leave_type
            LEFT JOIN users u ON lr.manager_id = u.user_id
            LEFT JOIN users E ON lr.user_id = E.user_id
            ORDER BY lr.id DESC
            `;

    const result = await client.query(query);

    if (result.rows.length === 0) {
      // Log when no leave requests are found
      return res.status(404).json({ error: "No leave requests found" });
    }
    // Log success with the number of leave requests retrieved
    res.status(200).json({
      message: "All leave requests retrieved successfully.",
      leave_requests: result.rows,
    });
  } catch (err) {
    console.error("Error fetching leave requests:", err);
    // Log failure in case of an error

    res
      .status(500)
      .json({ error: "Internal server error", message: err.detail });
  } finally {
    client.release();
  }
});

// GET /leave-requests/:user_id - Get all leave requests for a specific user
router.get("/leave-requests/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;
  const client = await pool.connect();

  try {
    const query = `
            SELECT lr.*, lt.leave_type, u.first_name, u.last_name 
            FROM leave_requests lr
            LEFT JOIN leave_types lt ON lr.leave_type = lt.leave_type
            LEFT JOIN users u ON lr.manager_id = u.user_id
            WHERE lr.user_id = $1 ORDER BY lr.id DESC`;

    const result = await client.query(query, [user_id]);

    if (result.rows.length === 0) {
      // Log failure when no leave requests are found for this user

      return res
        .status(404)
        .json({ error: `No leave requests found for user ${user_id}` });
    }

    res.status(200).json({
      message: "Leave requests retrieved successfully.",
      leave_requests: result.rows,
    });
  } catch (err) {
    console.error("Error fetching leave requests:", err);
    // Log failure in case of an error

    res
      .status(500)
      .json({ error: "Internal server error", message: err.detail });
  } finally {
    client.release();
  }
});

// GET /leave-requests/manager/:manager_id - Get all leave requests for a specific manager
router.get("/manager/:manager_id", authenticateToken, async (req, res) => {
  const { manager_id } = req.params;
  const client = await pool.connect();

  try {
    const query = `
            SELECT lr.*, lt.leave_type, u.first_name AS employee_first_name, u.last_name AS employee_last_name 
            FROM leave_requests lr
            JOIN leave_types lt ON lr.leave_type = lt.leave_type
            JOIN users u ON lr.user_id = u.user_id
            WHERE lr.manager_id = $1 ORDER BY lr.id DESC`;

    const result = await client.query(query, [manager_id]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No leave requests found for this manager" });
    }

    res.status(200).json({
      message: "Leave requests retrieved successfully.",
      leave_requests: result.rows,
    });
  } catch (err) {
    console.error("Error fetching leave requests:", err);
    res
      .status(500)
      .json({ error: "Internal server error", message: err.detail });
  } finally {
    client.release();
  } s
});

// PUT /leave-requests/:id - Update the status of a leave request and adjust leave balance if approved
router.put("/leave-requests/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; // Leave request ID
  const { manager_id, status, remarks } = req.body; // Manager ID and new status
  // Hardcoded values for submodule and action
  const submodule = 'Leave Management';
  const action = 'Update the status of a leave request';
  const module = 'HRMS';

  const client = await pool.connect(); // Get a client from the pool

  let statusCode = 200; // Default to success
  let responsePayload = { message: "Leave request status updated successfully." };

  try {
    // Check if the leave request exists
    const leaveRequestQuery = `SELECT * FROM leave_requests WHERE id = $1`;
    const leaveRequestResult = await client.query(leaveRequestQuery, [id]);

    if (leaveRequestResult.rows.length === 0) {
      responsePayload = { error: "Leave request not found" };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response
      return res.status(404).json(responsePayload);
    }

    const leaveRequest = leaveRequestResult.rows[0];

    // Check if the leave request's manager_id matches the provided manager_id
    if (leaveRequest.manager_id !== manager_id) {
      responsePayload = { error: "You are not authorized to update this leave request" };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response
      return res.status(403).json(responsePayload);
    }

    // Validate status input
    if (!["approved", "rejected"].includes(status)) {
      responsePayload = { error: 'Status must be either "approved" or "rejected"' };
      await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response
      return res.status(400).json(responsePayload);
    }

    // If the status is approved, adjust the leave balance and increment request count
    if (status === "approved") {
      const totalLeaveDays = leaveRequest.leave_days; // Use leave_days from the leave_requests table

      // Deduct leave days from the user's leave balance
      const { user_id, leave_type } = leaveRequest;
      const balanceQuery = `SELECT balance, request_count, total_balance FROM leave_balances WHERE user_id = $1 AND leave_type = $2`;
      const balanceResult = await client.query(balanceQuery, [user_id, leave_type]);

      if (balanceResult.rows.length === 0) {
        responsePayload = { error: "Leave balance not found for the user and leave type" };
        await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response
        return res.status(404).json(responsePayload);
      }

      const { balance, total_balance } = balanceResult.rows[0];

      // Ensure leave balance is sufficient
      if (total_balance < totalLeaveDays) {
        responsePayload = { error: "Insufficient leave balance to approve the request" };
        await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response
        return res.status(400).json(responsePayload);
      }

      // Deduct leave days according to the balance and previous_balance logic
      let remainingLeaveDays = totalLeaveDays;

      if (balance > 0) {
        if (balance >= remainingLeaveDays) {
          // Deduct entirely from balance if it's enough
          const updateBalanceQuery = `
            UPDATE leave_balances 
            SET balance = balance - $1, request_count = request_count + 1 
            WHERE user_id = $2 AND leave_type = $3`;
          await client.query(updateBalanceQuery, [
            remainingLeaveDays,
            user_id,
            leave_type,
          ]);
        } else {
          // Partially deduct from balance and then from previous_balance
          remainingLeaveDays -= balance; // Calculate remaining days after using balance
          const updateBalanceQuery = `
            UPDATE leave_balances 
            SET balance = 0, previous_balance = previous_balance - $1, request_count = request_count + 1 
            WHERE user_id = $2 AND leave_type = $3`;
          await client.query(updateBalanceQuery, [
            remainingLeaveDays,
            user_id,
            leave_type,
          ]);
        }
      } else {
        // Deduct entirely from previous_balance if balance is zero
        const updateBalanceQuery = `
          UPDATE leave_balances 
          SET previous_balance = previous_balance - $1, request_count = request_count + 1 
          WHERE user_id = $2 AND leave_type = $3`;
        await client.query(updateBalanceQuery, [
          remainingLeaveDays,
          user_id,
          leave_type,
        ]);
      }

      // Ensure no negative total_balance after the update
      const updatedBalanceResult = await client.query(balanceQuery, [
        user_id,
        leave_type,
      ]);
      if (updatedBalanceResult.rows[0].total_balance < 0) {
        responsePayload = { error: "Negative leave balance not allowed" };
        await logApiRequest(req, responsePayload, 'failed', submodule, action, module);  // Log the failure response
        return res.status(400).json(responsePayload);
      }
    }

    // Update the status of the leave request
    const updateQuery = `UPDATE leave_requests SET status = $1, remarks = $2 WHERE id = $3 RETURNING *`;
    const updatedLeaveRequest = await client.query(updateQuery, [
      status,
      remarks,
      id,
    ]);

    responsePayload = {
      message: "Leave request status updated successfully.",
      leave_request: updatedLeaveRequest.rows[0],
    };

    // Log the API request and response
    await logApiRequest(req, responsePayload, 'success', submodule, action, module);

    // Send success response
    res.status(statusCode).json(responsePayload);
  } catch (err) {
    console.error("Error updating leave request status:", err);
    responsePayload = {
      error: err.error || "Internal server error",
      message: err.message || err.detail || null,
    };

    // Log the error
    await logApiRequest(req, responsePayload, 'failed', submodule, action, module);

    // Send error response
    res.status(500).json(responsePayload);
  } finally {
    client.release();
  }
});




module.exports = router;