const express = require("express");
const { body } = require("express-validator");
const { checkAccess } = require("../../index");
const { authenticateToken } = require("../../index.js");
const route = express.Router();
const createTables = require("../tables.js");

const { pool } = require("../../config");

// config.js or wherever you're using it
const connectionString = process.env.String; // Make sure this comes first

if (!connectionString) {
  throw new Error(
    'Environment variable "String" (connection string) is not defined'
  );
}

const decoded = decodeURIComponent(connectionString);
const match = decoded.match(/search_path=([^&\s]+)/);
const schema = match ? match[1] : "public";

// console.log("Schema:", schema);

//create table in database
route.post("/create-tables", async (req, res) => {
  try {
    const result = await createTables();

    if (result && result.success) {
      res.status(200).send("All tables created successfully!");
    } else {
      res.status(500).json({
        message: "Failed to create all tables.",
        errors: result ? result.errors : "Unknown error",
      });
    }
  } catch (err) {
    console.error("Unexpected error while creating tables:", err);
    res.status(500).send("Unexpected error occurred.");
  }
});

// A single workflow if ID is given
// All workflows if no ID is provided
// GET: Fetch all workflows or a specific workflow by ID
route.get("/workflowmodules/:workflowId?", async (req, res) => {
  const { workflowId } = req.params;
  console.log("Fetching workflow(s):", workflowId || "All");

  try {
    let result;
    if (workflowId) {
      result = await pool.query(
        `select  concat(first_name,' ',last_name)as madeby ,m.* from workflowmodule m left join users u on m.created_by=u.user_id where m.workflow_id= $1`,
        [workflowId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      return res.json(result.rows[0]);
    } else {
      result = await pool.query(`select  concat(first_name,' ',last_name)as madeby ,m.* from workflowmodule m left join users u on m.created_by=u.user_id`);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "No workflows found" });
      }

      return res.json(result.rows);
    }
  } catch (err) {
    console.error("Error fetching workflows:", err);
    return res.status(500).json({ error: "Failed to fetch workflow(s)" });
  }
});

// POST: Create a new workflow
route.post("/workflowmodules", async (req, res) => {
  const { workflow_name, description, module_name, created_by } = req.body;

  if (!workflow_name || !description || !module_name || !created_by) {
    return res.status(400).json({
      error: "workflow_name, description, module_name, and created_by are required",
    });
  }
    const client = await pool.connect();

    try {
      // Check if the user exists
      const userCheck = await client.query(
        "SELECT user_id FROM users WHERE user_id = $1",
        [created_by]
      );

      if (userCheck.rowCount === 0) {
        
        return res.status(404).json({ error: "User does not exist." });
      }

      // Check if the workflow already exists with the same name and module
      const workflowCheck = await client.query(
        `SELECT * FROM workflowmodule WHERE workflow_name = $1 AND module_name = $2`,
        [workflow_name, module_name]
      );

      if (workflowCheck.rowCount > 0) {
       
        return res.status(400).json({ error: "Workflow with same name and module already exists" });
      }

      // Insert new workflow
      const result = await client.query(
        `INSERT INTO workflowmodule(workflow_name, description, module_name, created_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [workflow_name, description, module_name, created_by]
      );

      res.status(201).json({
        success: true,
        message: "Workflow created successfully",
        data: result.rows[0],
      });

    } 
    catch (err) {
    console.error("Error creating workflow:", err);
    return res.status(500).json({ error: "Failed to create workflow" });
  }
  finally{
    client.release();
  }
   
});

// DELETE: Delete workflow by ID
route.delete("/workflowmodules/:workflowId", async (req, res) => {
  const { workflowId } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM workflowmodule WHERE workflow_id = $1 RETURNING *`,
      [workflowId]
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Workflow not found or already deleted" });
    }

    return res.status(200).json({
      success: true,
      message: "Workflow successfully deleted",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error deleting workflow:", err);
    return res.status(500).json({ error: "Failed to delete workflow" });
  }
});

// PUT: Update workflow by ID
route.put("/workflowmodules/:workflowId", async (req, res) => {
  const { workflowId } = req.params;
  const { workflow_name, description, module_name } = req.body;

  if (!workflow_name || !description || !module_name) {
    return res.status(400).json({
      error: "workflow_name, description, and module_name are required",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE workflowmodule SET workflow_name = $1, description = $2, module_name = $3
       WHERE workflow_id = $4 RETURNING *`,
      [workflow_name, description, module_name, workflowId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Workflow updated successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating workflow:", err);
    return res.status(500).json({ error: "Failed to update workflow" });
  }
});







// // Assign user to a workflow


//userworkflow
route.get("/userworkflow/:workflowId?", async (req, res) => {
  const { workflowId } = req.params;

  try {
    let result;

    if (workflowId) {
      result = await pool.query(`select concat(first_name,' ',last_name)as name,workflow_name, uw.workflow_id,uw.user_id,uw.assigned_at
                                from developer.userworkflow uw
                                left join developer.users u on uw.user_id =u.user_id 
                                left join developer.workflowmodule wm on wm.workflow_id=uw.workflow_id where uw.workflow_id= $1`,[workflowId]);

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ error: `UserWorkflow with ID ${workflowId} not found` });
      }

      return res.status(200).json(result.rows[0]);
    }

    // Fetch all userworkflow entries
   result = await pool.query(`select concat(first_name,' ',last_name)as name,workflow_name, uw.workflow_id,uw.user_id,uw.assigned_at
                              from developer.userworkflow uw
                              left join developer.users u on uw.user_id =u.user_id 
                              left join developer.workflowmodule wm on wm.workflow_id=uw.workflow_id`);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No UserWorkflow entries found" });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching userworkflow:", err.message);
    res
      .status(500)
      .json({ error: "Internal Server Error while fetching userworkflow" });
  }
});

//get user name which is not present in particular workflow
route.get("/userworkflow/name/:workflowId?", async(req,res)=>{
  const {workflow_id}=req.params;
  const client =await pool.connect();
  try{
     let result = await client.query(`select concat(first_name,' ',last_name) as username from developer.users where user_id not in (select user_id from developer.userworkflow 
                                      where workflow_id=$1)`,[workflow_id]);
       if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ error: `UserWorkflow with ID ${workflow_id} not found` });
      }

      return res.status(200).json(result.rows[0]);

  }
  catch(err){
    console.error("Error fetching userworkflow:", err.message);
    res
      .status(500)
      .json({ error: "Internal Server Error while fetching userworkflow" });
  }
  finally{
    client.release();
  }
});
//send bulk user for single workflow
route.post("/userworkflow/bulk", async (req, res) => {
  const { workflow_id, user_ids } = req.body;

  if (!workflow_id || !Array.isArray(user_ids) || user_ids.length === 0) {
    return res
      .status(400)
      .json({ error: "workflow_id and user_ids[] are required" });
  }

  try {
    //  Check if the workflow_id exists
    const workflowExists = await pool.query(
      `SELECT 1 FROM workflowmodule WHERE workflow_id = $1`,
      [workflow_id]
    );
    if (workflowExists.rows.length === 0) {
      return res
        .status(400)
        .json({ error: `Workflow ID ${workflow_id} does not exist` });
    }

    // Check if all user_ids exist in users table
    const userCheck = await pool.query(
      `SELECT user_id FROM users WHERE user_id = ANY($1)`,
      [user_ids]
    );
    const existingUserIds = userCheck.rows.map((row) => row.user_id);

    // Identify the user_ids that are missing
    const missingUserIds = user_ids.filter((id) => !existingUserIds.includes(id));

    if (missingUserIds.length > 0) {
      return res.status(400).json({
        error: "Some user_ids do not exist in users table",
        missing_user_ids: missingUserIds,
        existing_user_ids: existingUserIds, // Optional: if you want to return which exist
      });
    }

    // Check already assigned users
    const checkQuery = `
      SELECT user_id FROM userworkflow 
      WHERE workflow_id = $1 AND user_id = ANY($2)
    `;
    const checkResult = await pool.query(checkQuery, [workflow_id, user_ids]);

    const alreadyAssignedIds = checkResult.rows.map((row) => row.user_id);
    const newUserIds = user_ids.filter(
      (id) => !alreadyAssignedIds.includes(id)
    );

    if (newUserIds.length === 0) {
      return res.status(409).json({
        error: "All provided users are already assigned to this workflow",
        already_assigned: alreadyAssignedIds,
      });
    }

    // Insert new user-workflow mappings
    const values = newUserIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    const params = [workflow_id, ...newUserIds];

    const insertQuery = `
      INSERT INTO userworkflow (workflow_id, user_id)
      VALUES ${values}
      RETURNING *
    `;
    const insertResult = await pool.query(insertQuery, params);

    res.status(201).json({
      success: true,
      assigned_count: insertResult.rowCount,
      assigned: insertResult.rows,
      skipped: alreadyAssignedIds,
    });
  } catch (err) {
    console.error("Bulk assignment error:", err);

    res.status(500).json({ error: "Failed to assign users to workflow" });
  }
});

// DELETE workflow - workflow id can delete
route.delete("/userworkflow/:Id", async (req, res) => {
  const id = req.params.Id;

  try {
    const result = await pool.query(
      `DELETE FROM userworkflow WHERE workflow_id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "userWorkflow not found or already deleted" });
    }

    res.status(200).json({
      success: true,
      message: "userWorkflow successfully deleted",
      deletedWorkflow: result.rows[0],
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete workflow" });
  }
});











//approvalgroup

//insert into approval groups
// route.post("/approvalgroups", async (req, res) => {
//   const { workflow_id, entity_type, entity_ids, action, group_name } = req.body;

//   if (!workflow_id || !entity_type || !Array.isArray(entity_ids) || !entity_ids.length || !action || !group_name) {
//     return res.status(400).json({ error: "Missing required fields or empty entity_ids array" });
//   }

//   try {
//     const client = await pool.connect();

//     try {
//       await client.query("BEGIN");

//       const insertValues = [];
//       const placeholders = [];

//       entity_ids.forEach((id, index) => {
//         const idx = index * 5; // 5 columns per row
//         placeholders.push(`($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
//         insertValues.push(action, group_name, workflow_id, entity_type, id);
//       });

//       const query = `
//         INSERT INTO approval_groups
//         (action, group_name, workflow_id, entity_type, entity_id)
//         VALUES ${placeholders.join(", ")}
//         RETURNING *;
//       `;

//       const result = await client.query(query, insertValues);

//       await client.query("COMMIT");

//       res.status(201).json({
//         success: true,
//         message: "Approval groups created in bulk",
//         data: result.rows,
//       });

//     } catch (error) {
//       await client.query("ROLLBACK");
//       console.error("Bulk insert error:", error);
//       res.status(500).json({ error: "Error creating approval groups in bulk" });
//     } finally {
//       client.release();
//     }
//   } catch (err) {
//     console.error("Connection error:", err);
//     res.status(500).json({ error: "Database connection failed" });
//   }
// });

//function validate for existing of table with it id present or not 
// const validateEntityIds = async (client, entity_type, entity_ids) => {
//   try {
//     const tableInfo = await client.query(`
//       SELECT
//         kcu.table_name,
//         kcu.column_name
//       FROM
//         information_schema.table_constraints tc
//         JOIN information_schema.key_column_usage kcu
//           ON tc.constraint_name = kcu.constraint_name
//           AND tc.table_schema = kcu.table_schema
//       WHERE
//         tc.constraint_type = 'PRIMARY KEY'
//         AND tc.table_name = $1
//       LIMIT 1
//     `, [entity_type]);

//     if (tableInfo.rowCount === 0) {
//       const err = new Error(`Invalid entity type`);
//       err.code = 'INVALID_ENTITY_TYPE';
//       err.entity_type = entity_type;
//       throw err;
//     }

//     const { column_name } = tableInfo.rows[0];

//     const res = await client.query(
//       `SELECT ${column_name} FROM ${entity_type} WHERE ${column_name} = ANY($1)`,
//       [entity_ids]
//     );

//     const foundIds = new Set(res.rows.map(row => row[column_name]));
//     const missingIds = entity_ids.filter(id => !foundIds.has(id));

//     if (missingIds.length > 0) {
//       const err = new Error(`Invalid entity IDs`);
//       err.code = 'INVALID_ENTITY_IDS';
//       err.entity_type = entity_type;
//       err.invalid_ids = missingIds;
//       throw err;
//     }

//   } catch (err) {
//     // Re-throw custom errors; wrap unknown issues
//     if (err.code === 'INVALID_ENTITY_TYPE' || err.code === 'INVALID_ENTITY_IDS') {
//       throw err;
//     }

//     const fallbackError = new Error(`Failed to validate entity "${entity_type}".`);
//     fallbackError.code = 'ENTITY_VALIDATION_ERROR';
//     throw fallbackError;
//   }
// };

// route.put('/group', async (req, res) => {
//   const groups = req.body;

//   if (!Array.isArray(groups) || groups.length === 0) {
//     return res.status(400).json({
//       error: 'Invalid input, expected an array of group objects'
//     });
//   }

//   const client = await pool.connect();
//   try {
//     await client.query("BEGIN");

//     const approvalInsertParams = [];
//     const approvalInsertValues = [];
//     const skippedEntries = [];

//     let paramIndex = 1;

//     for (const group of groups) {
//       const { workflowid, action, group_names, entity_type, entity_ids } = group;

//       if (
//         !workflowid || !action || !entity_type ||
//         !Array.isArray(group_names) || group_names.length === 0 ||
//         !Array.isArray(entity_ids) || entity_ids.length === 0
//       ) {
//         throw new Error(
//           'Each group must include workflowid, action, group_names[], entity_type, and entity_ids[]'
//         );
//       }

//        //  Validate entity_type + entity_ids
//       await validateEntityIds(client, entity_type, entity_ids);

//       // Fetch existing combinations
//       const existingRes = await client.query(
//         `
//         SELECT group_name, entity_id FROM approval_groups
//         WHERE workflow_id = $1 AND action = $2 AND entity_type = $3
//           AND group_name = ANY($4) AND entity_id = ANY($5)
//         `,
//         [workflowid, action, entity_type, group_names, entity_ids]
//       );

//       const existingMap = new Set(
//         existingRes.rows.map(row => `${row.group_name}_${row.entity_id}`)
//       );

//       for (const group_name of group_names) {
//         for (const entity_id of entity_ids) {
//           const key = `${group_name}_${entity_id}`;
//           if (existingMap.has(key)) {
//             skippedEntries.push({
//               group_name,
//               entity_id,
//               message: "Group already exists for this entity"
//             });
//             continue;
//           }

//           approvalInsertParams.push(
//             `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`
//           );
//           approvalInsertValues.push(action, group_name, workflowid, entity_type, entity_id);
//           paramIndex += 5;
//         }
//       }
//     }

//     let approvalResult = { rows: [] };
//     if (approvalInsertParams.length > 0) {
//       const approvalQuery = `
//         INSERT INTO approval_groups (action, group_name, workflow_id, entity_type, entity_id)
//         VALUES ${approvalInsertParams.join(", ")}
//         RETURNING *;
//       `;
//       approvalResult = await client.query(approvalQuery, approvalInsertValues);
//     }

//     await client.query("COMMIT");

//     res.status(201).json({
//       success: true,
//       message: "Groups processed successfully.",
//       inserted: approvalResult.rows,
//       skipped: skippedEntries,
//     });

//   } catch (err) {
//     await client.query("ROLLBACK");

//     if (err.code === '23503' && err.constraint === 'approval_groups_workflow_id_fkey') {
//       return res.status(400).json({
//         error: `Invalid workflow_id: The provided workflow ID does not exist in the workflow table.`
//       });
//     }

//     if (err.code === '23505' && err.constraint === 'unique_approval_entry') {
//       return res.status(409).json({
//         error: `Duplicate entry: An approval group with this combination already exists.`
//       });
//     }
    
//       if (err.code === 'INVALID_ENTITY_TYPE') {
//       return res.status(400).json({
//         error: `Invalid entity type: The table "${err.entity_type}" does not exist or has no primary key.`
//       });
//     }

//     if (err.code === 'INVALID_ENTITY_IDS') {
//       return res.status(400).json({
//         error: `Invalid ${err.entity_type} IDs: ${err.invalid_ids.join(', ')}`
//       });
//     }
//     console.error("Group insert error:", err);
//     res.status(500).json({ error: err.message || "Internal Server Error" });
//   } finally {
//     client.release();
//   }
// });
//insert into approval groups
route.post("/approvalgroups", async (req, res) => {
  const { workflow_id, entity_type, entity_ids, action, group_name } = req.body;

  if (!workflow_id || !entity_type || !Array.isArray(entity_ids) || !entity_ids.length || !action || !group_name) {
    return res.status(400).json({ error: "Missing required fields or empty entity_ids array" });
  }

  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const insertValues = [];
      const placeholders = [];

      entity_ids.forEach((id, index) => {
        const idx = index * 5; // 5 columns per row
        placeholders.push(`($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
        insertValues.push(action, group_name, workflow_id, entity_type, id);
      });

      const query = `
        INSERT INTO approval_groups
        (action, group_name, workflow_id, entity_type, entity_id)
        VALUES ${placeholders.join(", ")}
        RETURNING *;
      `;

      const result = await client.query(query, insertValues);

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Approval groups created in bulk",
        data: result.rows,
      });

    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Bulk insert error:", error);
      res.status(500).json({ error: "Error creating approval groups in bulk" });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Connection error:", err);
    res.status(500).json({ error: "Database connection failed" });
  }
});

route.put('/group', async (req, res) => {
  const groups = req.body;

  if (!Array.isArray(groups) || groups.length === 0) {
    return res.status(400).json({
      error: 'Invalid input, expected an array of group objects'
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const approvalInsertParams = [];
    const approvalInsertValues = [];
    const skippedEntries = [];

    let paramIndex = 1;

    for (const group of groups) {
      const { workflowid, action, group_names, entity_type, entity_ids } = group;

      if (
        !workflowid || !action || !entity_type ||
        !Array.isArray(group_names) || group_names.length === 0 ||
        !Array.isArray(entity_ids) || entity_ids.length === 0
      ) {
        throw new Error(
          'Each group must include workflowid, action, group_names[], entity_type, and entity_ids[]'
        );
      }

      // Fetch existing combinations
      const existingRes = await client.query(
        `
        SELECT group_name, entity_id FROM approval_groups
        WHERE workflow_id = $1 AND action = $2 AND entity_type = $3
          AND group_name = ANY($4) AND entity_id = ANY($5)
        `,
        [workflowid, action, entity_type, group_names, entity_ids]
      );

      const existingMap = new Set(
        existingRes.rows.map(row => `${row.group_name}_${row.entity_id}`)
      );

      for (const group_name of group_names) {
        for (const entity_id of entity_ids) {
          const key = `${group_name}_${entity_id}`;
          if (existingMap.has(key)) {
            skippedEntries.push({
              group_name,
              entity_id,
              message: "Group already exists for this entity"
            });
            continue;
          }

          approvalInsertParams.push(
            `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`
          );
          approvalInsertValues.push(action, group_name, workflowid, entity_type, entity_id);
          paramIndex += 5;
        }
      }
    }

    let approvalResult = { rows: [] };
    if (approvalInsertParams.length > 0) {
      const approvalQuery = `
        INSERT INTO approval_groups (action, group_name, workflow_id, entity_type, entity_id)
        VALUES ${approvalInsertParams.join(", ")}
        RETURNING *;
      `;
      approvalResult = await client.query(approvalQuery, approvalInsertValues);
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Groups processed successfully.",
      inserted: approvalResult.rows,
      skipped: skippedEntries,
    });

  } catch (err) {
    await client.query("ROLLBACK");

    if (err.code === '23503' && err.constraint === 'approval_groups_workflow_id_fkey') {
      return res.status(400).json({
        error: `Invalid workflow_id: The provided workflow ID does not exist in the workflow table.`
      });
    }

    if (err.code === '23505' && err.constraint === 'unique_approval_entry') {
      return res.status(409).json({
        error: `Duplicate entry: An approval group with this combination already exists.`
      });
    }

    console.error("Group insert error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  } finally {
    client.release();
  }
});

// Updates the action of existing approval group entries based on workflow, entity, and group name.
route.put('/group/update', async (req, res) => {
  const updates = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      error: 'Invalid input, expected an array of update objects'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updated = [];
    const notFound = [];

    for (const item of updates) {
      const { workflow_id, entity_type, entity_id, group_name, new_action } = item;

      if (!workflow_id || !entity_type || !entity_id || !group_name || !new_action) {
        throw new Error('Each item must include workflow_id, entity_type, entity_id, group_name, and new_action');
      }

      // Perform the update
      const result = await client.query(
        `
        UPDATE approval_groups
        SET action = $1
        WHERE workflow_id = $2 AND entity_type = $3 AND entity_id = $4 AND group_name = $5
        RETURNING *;
        `,
        [new_action, workflow_id, entity_type, entity_id, group_name]
      );

      if (result.rowCount === 0) {
        notFound.push({
          workflow_id,
          entity_type,
          entity_id,
          group_name,
          message: 'Group not found for update'
        });
      } else {
        updated.push(result.rows[0]);
      }
    }

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      updated,
      not_found: notFound
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  } finally {
    client.release();
  }
});


// GET: Fetch all  Approval Groups
route.get("/approvalgroups/:workflowId?", async (req, res) => {
  const { workflowId } = req.params;
  console.log("Fetching workflow(s):", workflowId || "All");

  try {
    let result;
    if (workflowId) {
      result = await pool.query(
        `SELECT * FROM approval_groups WHERE workflow_id = $1`,
        [workflowId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      return res.json(result.rows[0]);
    } else {
      result = await pool.query(`SELECT * FROM approval_groups`);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "No workflows found" });
      }

      return res.json(result.rows);
    }
  } catch (err) {
    console.error("Error fetching workflows:", err);
    return res.status(500).json({ error: "Failed to fetch workflow(s)" });
  }
});











//tables
route.get("/tables", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT table_name 
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name
    `,
      [schema]
    );
    res.json(result.rows.map((row) => row.table_name));
  } catch (err) {
    console.error("Error fetching tables:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API: Get All Data from a Selected Table
route.get("/tables/:tableName/data", async (req, res) => {
  const { tableName } = req.params;

  try {
    const tableCheck = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [schema, tableName]
    );

    if (tableCheck.rowCount === 0) {
      return res
        .status(400)
        .json({ error: `Table '${tableName}' does not exist in the schema` });
    }

    //  Fetch all data from the table
    const dataQuery = `SELECT * FROM ${schema}."${tableName}" LIMIT 100`;
    const dataResult = await pool.query(dataQuery);

    res.json(dataResult.rows);
  } catch (err) {
    console.error("Error fetching table data:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// Deletes all current members in a group (based on workflowid, action, group_name, entity_type)
// Inserts all given entity_ids into that group
route.post("/approvalgroups/bulks", async (req, res) => {
  const { workflowid, action, group_name, entity_type, entity_ids } = req.body;

  if (
    !workflowid ||
    !action ||
    !group_name ||
    !entity_type ||
    !Array.isArray(entity_ids) ||
    entity_ids.length === 0
  ) {
    return res.status(400).json({
      error:
        "workflowid, action, group_name, entity_type, and non-empty entity_ids array are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Validate workflowid
    const workflowRes = await client.query(
      `SELECT 1 FROM ${schema}.workflowmodule WHERE workflow_id = $1`,
      [workflowid]
    );
    if (workflowRes.rowCount === 0) {
      throw new Error(`workflowid ${workflowid} does not exist`);
    }

    // Check entity_type table and id column
    const tableCheck = await client.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = $2
      )`,
      [schema, entity_type.toLowerCase()]
    );
    if (!tableCheck.rows[0].exists) {
      throw new Error(`Table "${entity_type}" not found in schema "${schema}"`);
    }

    const colRes = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name IN ('id', 'workflow_id')`,
      [schema, entity_type.toLowerCase()]
    );
    if (colRes.rows.length === 0) {
      throw new Error(
        `Table "${entity_type}" must have 'id' or 'workflow_id' column`
      );
    }
    const idColumn = colRes.rows.some((col) => col.column_name === "id")
      ? "id"
      : "workflow_id";

    // Delete existing group members for this group
    await client.query(
      `DELETE FROM ${schema}.approval_groups 
       WHERE workflowid = $1 AND action = $2 AND group_name = $3 AND entity_type = $4`,
      [workflowid, action, group_name, entity_type]
    );

    // Validate and prepare insert values
    const values = [];
    const params = [];
    let i = 1;

    for (const entity_id of entity_ids) {
      // Validate each entity_id exists
      const existsRes = await client.query(
        `SELECT 1 FROM ${schema}."${entity_type}" WHERE ${idColumn} = $1`,
        [entity_id]
      );
      if (existsRes.rowCount === 0) {
        throw new Error(
          `Record with ${idColumn}=${entity_id} not found in "${entity_type}"`
        );
      }

      params.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
      values.push(action, group_name, entity_type, entity_id, workflowid);
    }

    const insertQuery = `
      INSERT INTO ${schema}.approval_groups (action, group_name, entity_type, entity_id, workflowid)
      VALUES ${params.join(", ")}
      RETURNING *;
    `;
    const result = await client.query(insertQuery, values);

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Approval group users replaced successfully.",
      data: result.rows,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error updating approval group:", err.message);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = route;
