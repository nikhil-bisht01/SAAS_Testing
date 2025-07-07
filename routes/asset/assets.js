const express = require('express');
const router = express.Router();
const { pool } = require("../../config");
const { authenticateToken } = require('../../index');
const { checkAccess } = require('../../index');
const { logApiRequest } = require('../../logs/logger.js');
const {validateAssetSubscription} = require('../../middleware/subscriptionMiddleware');


// router.put('/update-category-status', async (req, res) => {
//     const client = await pool.connect();
//     const { category_id, user_id, new_status,new_stages } = req.body;

//     // Define valid statuses and transition rules
//     const validStatuses = ["Draft", "Active", "Inactive"];
//     const statusTransitions = {
//         "Draft": ["Active","Draft"],
//         "Active": ["Inactive"],
//         "Inactive": ["Active"]
//         };

//     // Check if the new status is valid
//     if (!validStatuses.includes(new_status)) {
//         return res.status(400).json({ error: "Invalid status value" });
//     }

//     try {
//         // Step 0: Get the current status, workflow, and created_by associated with the category
//         const categoryQuery = `
//             SELECT status, workflowname, stages, created_by FROM categories WHERE category_id = $1
//         `;
//         const categoryResult = await client.query(categoryQuery, [category_id]);

//         if (categoryResult.rowCount === 0) {
//             return res.status(404).json({ error: "Category not found" });
//         }

//         const { status: currentStatus, workflowname, stages, created_by } = categoryResult.rows[0];


//         // Step 2: If the category form is been published or not 
//         if (stages === "Approved") {
//             return res.status(400).json({ error: "Category is published. Status change is not allowed." });
//         }

//         // Step 3: Verify if the status transition is allowed
//         const allowedTransitions = statusTransitions[currentStatus] || [];
//         if (!allowedTransitions.includes(new_status)) {
//             return res.status(400).json({ error: `Invalid status transition from ${currentStatus} to ${new_status}` });
//         }

//         // Step 4: Verify the workflow exists in the work_flow_ table
//         const workflowQuery = `
//             SELECT workflowid FROM work_flow_ WHERE workflowname = $1
//         `;
//         const workflowResult = await client.query(workflowQuery, [workflowname]);

//         if (workflowResult.rowCount === 0) {
//             return res.status(404).json({ error: "Workflow not found" });
//         }
//         const { workflowid } = workflowResult.rows[0];

//         // Step 5: Check if user_id exists in user_workflow for the given workflowid
//         const userWorkflowQuery = `
//             SELECT 1 FROM user_workflow WHERE userid = $1 AND workflowid = $2
//         `;
//         const userWorkflowResult = await client.query(userWorkflowQuery, [user_id, workflowid]);

//         if (userWorkflowResult.rowCount === 0) {
//             return res.status(403).json({ error: "User does not have permission for this workflow" });
//         }

//         // Step 6: Check if user's role in api_access exists in approval_roles for the category
//         const approvalRoleQuery = `
//             SELECT role FROM approvalrole WHERE category_id = $1
//         `;
//         const approvalRoleResult = await client.query(approvalRoleQuery, [category_id]);
//         const approvedRoles = approvalRoleResult.rows.map(row => row.role);

//         if (approvedRoles.length === 0) {
//             return res.status(403).json({ error: "No roles assigned for this category" });
//         }

//         const apiAccessQuery = `
//             SELECT api_name FROM api_access 
//             WHERE user_id = $1 AND api_name = ANY($2::text[])
//         `;
//         const apiAccessResult = await client.query(apiAccessQuery, [user_id, approvedRoles]);

//         if (apiAccessResult.rowCount === 0) {
//             return res.status(403).json({ error: "User role not authorized for this category" });
//         }

//        // Step 2: If the status is being changed from 'Resubmitted' to 'Draft', verify the user
//         if (currentStatus === "Draft" && new_stages === "Resubmitted") {
//                 const updateCategoryStatusQuery = `
//                     UPDATE categories SET stages = $1 WHERE category_id = $2
//                 `;
//                 await client.query(updateCategoryStatusQuery, [new_stages, category_id]);

//                 return res.status(200).json({ message: "Category status updated successfully" });
//         }

//         // Step 7: Update the status in the categories table if not handled earlier
//         const updateCategoryStatusQuery = `
//             UPDATE categories SET status = $1 WHERE category_id = $2
//         `;
//         await client.query(updateCategoryStatusQuery, [new_status, category_id]);

//         return res.status(200).json({ message: "Category status updated successfully" });
//     } catch (error) {
//         console.error("Error updating category status:", error);
//         return res.status(500).json({ error: "Internal server error" });
//     } finally {
//         client.release(); // Release the client back to the pool
//     }
// });


router.put('/update-category-status',async (req, res) => {
    const client = await pool.connect();
    const { category_id, action, user_id, new_status, new_stages } = req.body;

    // Define valid statuses and transitions
    const validStatuses = ["Draft", "Active", "Inactive"];
    const statusTransitions = {
        "Draft": ["Active", "Draft"],
        "Active": ["Inactive"],
        "Inactive": ["Active"]
    };

    // Validate the new status
    if (!validStatuses.includes(new_status)) {
        return res.status(400).json({ error: "Invalid status value" });
    }

    const module = "CategoryApproval";

    if (module !== action) {
        return res.status(400).json({ error: "This Action Does Not Match" });
    }

    try {


        // Step 1: Fetch category details and associated workflow ID
        const categoryQuery = `
            SELECT c.status, c.workflowname, c.stages, c.created_by, wf.workflowid
            FROM categories c
            left JOIN work_flow_ wf ON wf.workflowname = c.workflowname
            WHERE c.category_id = $1
        `;
        const categoryResult = await client.query(categoryQuery, [category_id]);

        if (categoryResult.rowCount === 0) {
            throw { status: 404, message: "Category not found" };
        }

        const { status: currentStatus, workflowid, stages } = categoryResult.rows[0];

        // Step 2: Check if category is published
        if (stages === "Approved" && new_status !== "Inactive") {
            throw { status: 400, message: "Category is published. Status change is not allowed." };
        }

        // Step 3: Validate status transition
        const allowedTransitions = statusTransitions[currentStatus] || [];
        if (!allowedTransitions.includes(new_status)) {
            throw { status: 400, message: `Invalid status transition from ${currentStatus} to ${new_status}` };
        }





        // Check if bypass role exists
        const bypassRoleQuery = `
           SELECT * FROM approval_group WHERE category_id = $1 AND action = $2 AND groups = 'bypass'
              `;
        const bypassRoleResult = await client.query(bypassRoleQuery, [category_id, action]);

        if (bypassRoleResult.rowCount !== 0) {
            if (currentStatus === "Draft" && new_stages === "Resubmitted") {
                const updateStagesQuery = `
                    UPDATE categories SET stages = $1 WHERE category_id = $2
                `;
                await client.query(updateStagesQuery, [new_stages, category_id]);

                await client.query('COMMIT');
                return res.status(200).json({ message: "Category stages updated to Resubmitted successfully." });
            }

            // Step 7: Update category status
            const updateStatusQuery = `
                UPDATE categories SET status = $1 WHERE category_id = $2
            `;
            await client.query(updateStatusQuery, [new_status, category_id]);

            // Commit transaction
            await client.query('COMMIT');
            return res.status(200).json({ message: "Category status updated successfully." });
        }




        // Step 4: Check user permission for the workflow
        const userWorkflowQuery = `
            SELECT 1 FROM user_workflow WHERE userid = $1 AND workflowid = $2
        `;
        const userWorkflowResult = await client.query(userWorkflowQuery, [user_id, workflowid]);

        if (userWorkflowResult.rowCount === 0) {
            throw { status: 403, message: "User does not have permission for this workflow" };
        }

        // Step 5: Check user roles for category approval
        const approvalRoleQuery = `
            SELECT groups FROM approval_group WHERE category_id = $1 and action = $2
        `;
        const approvalRoleResult = await client.query(approvalRoleQuery, [category_id, action]);
        const approvedRoles = approvalRoleResult.rows.map(row => row.groups);

        if (approvedRoles.length === 0) {
            throw { status: 403, message: "No roles assigned for this category" };
        }

        const ROLEQuery = `
            SELECT * FROM role 
            WHERE role = ANY($1::text[])
        `;
        const ROLEResult = await client.query(ROLEQuery, [approvedRoles]);

        if (ROLEResult.rowCount === 0) {
            throw { status: 403, message: "The Group you belong dose not exist in the Main Group table, Please Contact to your Admin" };
        }


        const apiAccessQuery = `
            SELECT api_name FROM api_access 
            WHERE user_id = $1 AND api_name = ANY($2::text[])
        `;
        const apiAccessResult = await client.query(apiAccessQuery, [user_id, approvedRoles]);

        if (apiAccessResult.rowCount === 0) {
            throw { status: 403, message: "User role not authorized for this category" };
        }

        // Step 6: Handle special case for Resubmitted stages
        if (currentStatus === "Draft" && new_stages === "Resubmitted") {
            const updateStagesQuery = `
                UPDATE categories SET stages = $1 WHERE category_id = $2
            `;
            await client.query(updateStagesQuery, [new_stages, category_id]);

            await client.query('COMMIT');
            return res.status(200).json({ message: "Category stages updated to Resubmitted successfully." });
        }

        // Step 7: Update category status
        const updateStatusQuery = `
            UPDATE categories SET status = $1 WHERE category_id = $2
        `;
        await client.query(updateStatusQuery, [new_status, category_id]);

        // Commit transaction
        await client.query('COMMIT');
        return res.status(200).json({ message: "Category status updated successfully." });
    } catch (error) {
        await client.query('ROLLBACK'); // Rollback transaction on error
        console.error("Error updating category status:", error);
        return res.status(error.status || 500).json({ error: error.message || "Internal server error" });
    } finally {
        client.release(); // Release the client back to the pool
    }
});






router.put("/stages/:category_id", async (req, res) => {
    const { category_id } = req.params;
    const { value } = req.body;
    const client = await pool.connect();

    // Define valid transitions for status and stages
    const validTransitions = {
        "Draft": ["Preview", "FormDesign", "Resubmitted", "SubmittedForApproval"],
        "Active": ["Approved"],
        "Inactive": ["Hidden"]
    };

    try {

        // Step 1: Check if the category exists
        const categoryQuery = `
            SELECT status, stages FROM categories WHERE category_id = $1
        `;
        const categoryResult = await client.query(categoryQuery, [category_id]);

        if (categoryResult.rowCount === 0) {
            return res.status(404).json({ error: "Category not found" });
        }

        const { status, stages: currentStages } = categoryResult.rows[0];

        // Step 2: Check if the new stage is valid for the current status
        const allowedStages = validTransitions[status] || [];
        if (!allowedStages.includes(value)) {
            return res.status(400).json({
                error: `Invalid stage transition for status "${status}". Allowed stages: ${allowedStages.join(", ")}`
            });
        }

        // Step 3: Update the stages value in the database
        const updateStagesQuery = `
            UPDATE categories SET stages = $1 WHERE category_id = $2
        `;
        await client.query(updateStagesQuery, [value, category_id]);

        return res.status(200).json({ message: "Category stage updated successfully" });
    } catch (error) {
        console.error("Error updating stages:", error);
        return res.status(500).json({ error: "Internal server error" });
    } finally {
        client.release(); // Release the client back to the pool
    }
});




// Assets main Function

router.put('/update-asset-status/:asset_id', async (req, res) => {

    const { asset_id } = req.params;
    const { user_id, new_status, category_id, action } = req.body;

    const client = await pool.connect();

    // Define valid statuses and transition rules
    const validStatuses = ["Repository", "Inventory"];
    const statusTransitions = {
        "Repository": ["Inventory"],
        "Inventory": ["Repository"]
    };

    // Check if the new status is valid
    if (!validStatuses.includes(new_status)) {
        return res.status(400).json({ error: "Invalid status value" });
    }


    const module = "AssetApproval";
    if (module !== action) {
        return res.status(400).json({ error: "This Action Does Not Match" });
    }

    try {


        // Step 1: Get category details
        const categoryQuery = `
            SELECT workflowname, categoriesname FROM categories WHERE category_id = $1
        `;
        const categoryResult = await client.query(categoryQuery, [category_id]);

        if (categoryResult.rowCount === 0) {
            return res.status(404).json({ error: "Category not found" });
        }

        const { workflowname, categoriesname } = categoryResult.rows[0];


        // Step 3: Get current asset details
        const assetQuery = `
            SELECT 
                status
            FROM "${categoriesname}"
            WHERE unique_id = $1 AND category_id = $2
        `;
        const assetResult = await client.query(assetQuery, [asset_id, category_id]);

        if (assetResult.rowCount === 0) {
            return res.status(404).json({ error: "Asset not found" });
        }

        const { status: currentStatus } = assetResult.rows[0];

        // Step 4: Check if the status transition is allowed
        const allowedTransitions = statusTransitions[currentStatus] || [];
        if (!allowedTransitions.includes(new_status)) {
            return res.status(400).json({
                error: `Invalid status transition from ${currentStatus} to ${new_status}`
            });
        }


            // Check if bypass role exists
                const bypassRoleQuery = `
                SELECT * FROM approval_group WHERE category_id = $1 AND action = $2 AND groups = 'bypass'
            `;
                const bypassRoleResult = await client.query(bypassRoleQuery, [category_id, action]);

                if (bypassRoleResult.rowCount !== 0) {
                    const updateAssetStatusQuery = `
                    UPDATE "${categoriesname}"
                    SET status = $1
                    WHERE unique_id = $2 AND category_id = $3
                `;
                await client.query(updateAssetStatusQuery, [new_status, asset_id, category_id]);

                return res.status(200).json({
                    message: "Asset status updated successfully",
                    assetDetails: {
                        asset_id,
                        category_id,

                        status: new_status
                    }
                });
                }




        // Step 5: Check user workflow permissions
        const workflowQuery = `
            SELECT workflowid FROM work_flow_ WHERE workflowname = $1
        `;
        const workflowResult = await client.query(workflowQuery, [workflowname]);

        if (workflowResult.rowCount === 0) {
            return res.status(404).json({ error: "Workflow not found for the asset's category" });
        }

        const { workflowid } = workflowResult.rows[0];
        const userWorkflowQuery = `
            SELECT 1 FROM user_workflow WHERE userid = $1 AND workflowid = $2
        `;
        const userWorkflowResult = await client.query(userWorkflowQuery, [user_id, workflowid]);

        if (userWorkflowResult.rowCount === 0) {
            return res.status(403).json({
                error: "User does not have permission to update this asset"
            });
        }

        // Step 6: Check user's approval role permissions
        const assetApprovalRoleQuery = `
            SELECT groups 
            FROM approval_group 
            WHERE category_id = $1 and action =$2 
        `;
        const assetApprovalRoleResult = await client.query(assetApprovalRoleQuery, [category_id, action]);
        const approvedRoles = assetApprovalRoleResult.rows.map(row => row.groups);

        if (approvedRoles.length === 0) {
            return res.status(403).json({ error: "No roles assigned for this category" });
        }

        const apiAccessQuery = `
            SELECT api_name FROM api_access 
            WHERE user_id = $1 AND api_name = ANY($2::text[])
        `;
        const apiAccessResult = await client.query(apiAccessQuery, [user_id, approvedRoles]);

        if (apiAccessResult.rowCount === 0) {
            return res.status(403).json({ error: "User role not authorized for this category" });
        }

        // Step 7: Update the asset's status in the database
        const updateAssetStatusQuery = `
            UPDATE "${categoriesname}"
            SET status = $1
            WHERE unique_id = $2 AND category_id = $3
        `;
        await client.query(updateAssetStatusQuery, [new_status, asset_id, category_id]);

        return res.status(200).json({
            message: "Asset status updated successfully",
            assetDetails: {
                asset_id,
                category_id,

                status: new_status
            }
        });
    } catch (error) {
        console.error("Error updating asset status:", error);
        return res.status(500).json({ error: "Internal server error" });
    } finally {
        client.release(); // Release the client back to the pool
    }
});





// Export the router
module.exports = router;
