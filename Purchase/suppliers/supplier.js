const express = require('express');
const {pool} = require('../../config');
const {authenticateToken , } = require('../middleware/auth')
const router=express.Router();


// ✅ Get All Suppliers
router.get('/suppliers', async (req, res) => {
    const client = await pool.connect();

    try {
        const result = await client.query(`SELECT * FROM suppliers ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    } finally {
        client.release();
    }
});



// ✅ Get a Supplier by ID
router.get('/suppliers/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const query = 'SELECT * FROM suppliers WHERE id = $1';
        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Supplier not found" });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
});



// Creating Suppliers
const { body, validationResult } = require('express-validator');

router.post('/suppliers', [
    // Validate and sanitize input fields
    body('supplier_name').notEmpty().withMessage('Supplier name is required').trim(),
    body('email_id').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('landline_num').optional().isLength({ min: 10, max: 15 }).withMessage('Landline number must be between 10 to 15 characters'),
    
    // Improved GST validation - more robust
    body('gst_number')
      .optional()
      .customSanitizer(value => {
        // Remove all whitespace and convert to uppercase
        return value ? value.replace(/\s+/g, '').toUpperCase() : value;
      })
      .custom((value, { req }) => {
        // Skip validation if empty
        if (!value) return true;
        
        // Strict GST number validation
        const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$/;
        if (!gstRegex.test(value)) {
          throw new Error('Invalid GST number format. Should be like: 27AAPFU0939F1ZV');
        }
        return true;
      }),
    
    body('pan_no')
      .optional()
      .customSanitizer(value => {
        // Remove all whitespace and convert to uppercase
        return value ? value.replace(/\s+/g, '').toUpperCase() : value;
      })
      .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN number'),
    
    body('tan_number')
      .optional()
      .customSanitizer(value => {
        // Remove all whitespace and convert to uppercase
        return value ? value.replace(/\s+/g, '').toUpperCase() : value;
      })
      .matches(/^[A-Z]{4}[0-9]{5}[A-Z]{1}$/).withMessage('Invalid TAN number'),
    
      body('address').notEmpty().withMessage('Address is required').trim(),
      body('city').notEmpty().withMessage('City is required').trim(),
      body('state').notEmpty().withMessage('State is required').trim(),
    body('country').notEmpty().withMessage('Country is required').trim(),
    body('pincode').notEmpty().isNumeric().withMessage('Pincode must be a numeric value').isLength({ min: 6, max: 6 }).withMessage('Pincode must be 6 digits'),
    body('lead').notEmpty().withMessage('Lead name is required').trim(),
    body('workflow_id').isInt().withMessage('Workflow ID must be an integer'),
    body('current_stage').optional().isString().trim().withMessage('Current stage must be a string'),
    body('status').optional().isIn(['Active', 'Inactive']).withMessage('Status must be either "Active" or "Inactive"')
  ], async (req, res) => {
  
    // Add debugging to help identify issues
 
  
    // Handle validation errors
    const errors = validationResult(req);
  
    // Get the validated input data
    const {
      supplier_name, email_id, landline_num, gst_number, pan_no, tan_number,
      address, city, state, country, pincode, status,
      lead, workflow_id, current_stage
    } = req.body;
    const client = await pool.connect();
    try {
      // Additional logging for GST number
      if (!errors.isEmpty()) {
        // console.log('Validation errors:', errors.array());
        
        const errorArray = errors.array();
        
        // Define your expected field order (as per frontend form)
        const fields = [
            'workflow',
            'supplier_name',     
            'landline_num',      
            'email_id',          
            'address',           
            'country',           
            'state',             
            'city',              
            'pincode',           
            'gst_number',        
            'pan_no',            
            'tan_number',        
            'lead',              
            'current_stage',     
            'status',             
            'workflow_id',       
        ];
        
        // Map each field to its error message (or empty string)
        const formattedErrors = fields.map(field => {
          const err = errorArray.find(e => e.path === field);
          return err ? err.msg : '';
        });
        
        return res.status(400).json({ errors: formattedErrors });
      }
      
      const query = `
        INSERT INTO suppliers (
          supplier_name, email_id, landline_num, gst_number, pan_no, tan_number,
          address, city, state, country, pincode, status,
          lead, workflow_id, current_stage
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15
        )
        RETURNING *`;

    const supplierStatus = status && ['Active', 'Inactive'].includes(status) ? status : 'Active';

       
      const values = [
        supplier_name, email_id, landline_num, gst_number, pan_no, tan_number,
        address, city, state, country, pincode, supplierStatus,
        lead, workflow_id, current_stage || 'Initiated'
      ];
  
      const result = await client.query(query, values);
      
      // Auto-assign this supplier to approval groups for its workflow if needed
      // This depends on your implementation of the autoAssignSupplierToWorkflow function
      if (workflow_id && typeof autoAssignSupplierToWorkflow === 'function') {
        try {
          await autoAssignSupplierToWorkflow(result.rows[0].id, workflow_id);
        } catch (assignError) {
          console.error('Error assigning supplier to workflow:', assignError);
          // Continue with the response even if assignment fails
        }
      }
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Database error:',error.detail);
      res.status(500).json({ message: 'Error adding supplier', details: error.detail });
    } finally {
      client.release();
    } 
  });


// Approve/Reject Supplier

router.put('/suppliers/:id/approval', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
    
        const { id } = req.params;
        const { current_stage } = req.body;
        // const {user_id} = req.user;
        // console.log(req.user.email)
        // console.log("hii")
        const requiredAction = 'Approve';

        // ✅ 1. Check if the supplier exists and get its workflow_id
        const supplierQuery = `SELECT workflow_id FROM suppliers WHERE id = $1`;
        const supplierResult = await client.query(supplierQuery, [id]);
        if (supplierResult.rows.length === 0) {
            return res.status(404).json({ message: "Supplier not found" });
        }
        const workflow_id = supplierResult.rows[0].workflow_id;

        // ✅ 2. Check if the user is assigned to the workflow
        const assignmentCheckQuery = `
            SELECT * FROM budget_user_workflow WHERE userid = $1 AND workflowid = $2
        `;
        const assignmentCheckResult = await client.query(assignmentCheckQuery, [user_id, workflow_id]);
        if (assignmentCheckResult.rows.length === 0) {
            return res.status(403).json({ message: 'User is not assigned to this workflow' });
        }

        // ✅ 3. Get allowed roles for the action
        const roleQuery = `
            SELECT group_name FROM Purchase_Approval_Groups 
            WHERE workflowid = $1 AND action = $2
        `;
        const roleResult = await client.query(roleQuery, [workflow_id, requiredAction]);
        const approvedRoles = roleResult.rows.map(row => row.group_name);

        if (approvedRoles.length === 0) {
            return res.status(403).json({ error: 'No roles assigned for this workflow/action' });
        }

        // ✅ 4. Check if user has Bypass role
        const isBypass = approvedRoles.includes("Bypass");

        // ✅ 5. If no Bypass, check api_access for role
        if (!isBypass) {
            const accessQuery = `
                SELECT api_name FROM api_access 
                WHERE user_id = $1 AND api_name = ANY($2::text[])
            `;
            const accessResult = await client.query(accessQuery, [user_id, approvedRoles]);
            if (accessResult.rowCount === 0) {
                return res.status(403).json({ error: "User role not authorized for this workflow" });
            }
        }

        // ✅ 6. Update the supplier stage
        const updateQuery = `
            UPDATE suppliers
            SET current_stage = $1
            WHERE id = $2
            RETURNING *
        `;
        const result = await client.query(updateQuery, [current_stage, id]);

        res.json({ message: `Supplier updated to stage ${current_stage}`, data: result.rows[0] });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating supplier approval", details: error.message });
    } finally {
        client.release();
    }
});




// Supplier Update
router.put('/suppliers/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const {
            supplier_name, email_id, landline_num, gst_number, pan_no, tan_number,
            address, city, state, country, pincode, status, lead,
            workflow_id, current_stage
        } = req.body;

        // Step 1: Check current stage
        const checkQuery = `SELECT current_stage FROM suppliers WHERE id = $1`;
        const checkResult = await client.query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: "Supplier not found" });
        }

        if (checkResult.rows[0].current_stage === 'Approved') {
            return res.status(403).json({ message: "Cannot update supplier. Stage is already 'Approved'." });
        }

        // Step 2: Proceed with update
        const updateQuery = `
            UPDATE suppliers SET
                supplier_name = $1,
                email_id = $2,
                landline_num = $3,
                gst_number = $4,
                pan_no = $5,
                tan_number = $6,
                address = $7,
                city = $8,
                state = $9,
                country = $10,
                pincode = $11,
                status = $12,
                lead = $13,
                workflow_id = $14,
                current_stage = $15,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $16
            RETURNING *`;

        const values = [
            supplier_name, email_id, landline_num, gst_number, pan_no, tan_number,
            address, city, state, country, pincode, status, lead,
            workflow_id, current_stage, id
        ];

        const result = await client.query(updateQuery, values);
        res.json(result.rows[0]);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating supplier", details: error.message });
    } finally {
        client.release();
    }
});


// ✅ Delete a Supplier
router.delete('/suppliers/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const query = 'DELETE FROM suppliers WHERE id = $1 RETURNING *';
        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Supplier not found" });
        }
        res.json({ message: "Supplier deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting supplier", details: error.message });
    } finally {
        client.release();
    }
});






//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//---------------------------------------------- add Groups for suppliers approval ---------------------------------------------------------------------------------------------------------------

// ✅ Get All Approval Groups
router.get('/approval-groups', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const result = await client.query(`SELECT * FROM supplier_Approval_Groups ORDER BY id DESC`);
        // const result = await client.query(`SELECT * FROM role ORDER BY role_id ASC`)
        // const roles = result.rows.map(row =>row.role)
        // console.log(roles)
        // res.json(roles)
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    } finally {
        client.release();
    }
});


// ✅ Get Approval Group by ID
router.get('/approval-groups/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const query = 'SELECT * FROM supplier_Approval_Groups WHERE id = $1';
        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Approval Group not found" });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
});


// ✅ Create New Approval Group
router.post('/approval-groups', async (req, res) => {
    const { workflowid, action, role } = req.body;  
    const client = await pool.connect();

    try {
        if (!workflowid || !action || !role) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        if (!["User", "Developer", "Admin", "Manager"].includes(role)) {
            return res.status(400).json({ message: "Role is not defined" });
        }

        const query = `
            INSERT INTO supplier_Approval_Groups (workflowid, action, group_name)
            VALUES ($1, $2, $3)
            RETURNING *`;

        const values = [workflowid, action, role];  // ⬅️ role used as group_name
        const result = await client.query(query, values);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating approval group", details: error.message });
    } finally {
        client.release();
    }
});



// ✅ Update Approval Group by ID
router.put('/approval-groups/:id', async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const { workflowid, action, role } = req.body; 

        if (!workflowid || !action || !role) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        if (!["User", "Developer", "Admin", "Manager"].includes(role)) {
            return res.status(400).json({ message: "Role is not defined" });
        }

        // Validate if role exists
        const roleResult = await client.query(`SELECT role FROM role WHERE role = $1`, [role]);

        if (roleResult.rows.length === 0) {
            return res.status(404).json({ message: "Role not found" });
        }

        const roleName = roleResult.rows[0].role;

        // Update supplier_Approval_Groups
        const query = `
            UPDATE supplier_Approval_Groups 
            SET workflowid = $1, action = $2, group_name = $3
            WHERE id = $4
            RETURNING *`;

        const values = [workflowid, action, roleName, id];
        const result = await client.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Approval Group not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: "Error updating approval group", details: error.message });
    } finally {
        client.release();
    }
});



// ✅ Delete an Approval Group by ID
router.delete('/approval-groups/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const query = 'DELETE FROM supplier_Approval_Groups WHERE id = $1 RETURNING *';
        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Approval Group not found" });
        }

        res.json({ message: "Approval Group deleted", data: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting approval group", details: error.message });
    } finally {
        client.release();
    }
});


//  Get Current Assigned Approval Group for a Supplier
router.get('/suppliers/:id/approval-groups', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;

        const query = `
            SELECT ag.*, sam.bypass
            FROM supplier_approval_mapping sam
            JOIN supplier_Approval_Groups ag ON sam.approval_group_id = ag.id
            WHERE sam.supplier_id = $1
            ORDER BY sam.updated_at DESC
            LIMIT 1
        `;

        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No approval group assigned for this supplier" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
});


//  Assign/Update Approval Group to Supplier

router.post('/suppliers/:id/approval-groups', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        // const { approval_group_id, bypass } = req.body;
        const { group_name, bypass } = req.body;
        // console.log("try")
        // console.log(req.body)
        // console.log("testing")
        // console.log(approval_group_id)

        // if (!approval_group_id) {
        if (!group_name) {
            return res.status(400).json({ message: "Missing approval_group_id" });
        }

        const exists = await client.query(
            `SELECT id FROM supplier_approval_mapping WHERE supplier_id = $1`,
            [id]
        );

        if (exists.rows.length > 0) {
            await client.query(
                `UPDATE supplier_approval_mapping 
                 SET group_name = $1, bypass = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE supplier_id = $3`,
                // [approval_group_id, bypass || false, id]
                [ group_name, bypass || false, id]
            );
            //        SET approval_group_id = $1, bypass = $2, updated_at = CURRENT_TIMESTAMP
        } else {
            await client.query(
                // `INSERT INTO supplier_approval_mapping (supplier_id, approval_group_id, bypass) 
                `INSERT INTO supplier_approval_mapping (supplier_id, group_name, bypass) 
                 VALUES ($1, $2, $3)`,
                // [id, approval_group_id, bypass || false]
                [id,  group_name, bypass || false]
            );
        }

        res.json({ message: "Approval group assigned successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
});
  

// Get All Available Approval Groups for a Supplier (Based on Workflow ID)

router.get('/suppliers/:id/available-approval-groups', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;

        const supplierRes = await client.query(`SELECT workflow_id FROM suppliers WHERE id = $1`, [id]);

        if (supplierRes.rows.length === 0) {
            return res.status(404).json({ message: "Supplier not found" });
        }

        const workflowid = supplierRes.rows[0].workflow_id;

        const groups = await client.query(
            `SELECT id, group_name 
             FROM supplier_Approval_Groups 
             WHERE workflowid = $1 AND action = 'vendor_approval'`,
            [workflowid]
        );

        res.json(groups.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
});


module.exports = router;