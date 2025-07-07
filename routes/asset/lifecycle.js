const express = require('express');
const router = express.Router();
const { pool } = require("../../config");
const {logApiRequest} = require('../../logs/logger'); // Adjust path if needed

router.put('/update-asset-status/:asset_id', async (req, res) => {
    const { asset_id } = req.params;
    const { user_id, new_stages, sub_stages, category_id, action } = req.body;
    const client = await pool.connect();

    const submodule = 'Asset Management';
    const module = 'Asset';

    const statusTransitions = {
        Repository: {
            Added: ["AwaitingApproval"],
            AwaitingApproval: ["Active", "Resubmitted"],
            Resubmitted: ["AwaitingApproval"],
        },
        Inventory: {
            Active: ["Mapped", "Inactive"],
            Mapped: ["Damage"],
            Damage: ["SendForRepair"],
            SendForRepair: ["Repaired", "Discard"],
            Repaired: ["Active"],
            Inactive: ["Active", "Discard"],
        },
    };

    const actionStageMappings = {
        AssetAddition: ["AwaitingApproval"],
        AssetApproval: ["Active", "Resubmitted"],
        MappingApprove: ["Mapped", "Inactive"],
        DiscardApprove: ["Discard", "Active"],
        RepairApprove: ["SendForRepair", "Repaired"],
        DamageApprove: ["Damage"],
    };

    try {

        // Step 1: Validate action
        const validStages = actionStageMappings[action];
        if (!validStages) {
           // await logApiRequest(req, {
            //     message: "Invalid action",
            //     details: { action }
            // }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({ error: `Invalid action: '${action}'` });
        }

        if (!validStages.includes(new_stages)) {
           // await logApiRequest(req, {
            //     message: "Invalid stage transition",
            //     details: { action, new_stages, allowedStages: validStages }
            // }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({
                error: `Invalid stage transition for action '${action}'. Allowed stages: ${validStages.join(", ")}`,
            });
        }


        // Step 1: Fetch category details
        const categoryQuery = `
            SELECT workflowname, categoriesname 
            FROM categories 
            WHERE category_id = $1
        `;
        const categoryResult = await client.query(categoryQuery, [category_id]);

        if (categoryResult.rowCount === 0) {
           // await logApiRequest(req, {
            //     message: "Category not found",
            //     details: { category_id }
            // }, "Failed", submodule, action, module, user_id);
            return res.status(404).json({ error: "Category not found" });
        }

        const { workflowname, categoriesname } = categoryResult.rows[0];

        // Step 2: Fetch asset details
        const assetQuery = `
            SELECT status, stages 
            FROM "${categoriesname}" 
            WHERE unique_id = $1 AND category_id = $2
        `;
        const assetResult = await client.query(assetQuery, [asset_id, category_id]);

        if (assetResult.rowCount === 0) {
           // await logApiRequest(req, {
            //     message: "Asset not found",
            //     details: { asset_id, category_id }
            // }, "Failed", submodule, action, module, user_id);
            return res.status(404).json({ error: "Asset not found" });
        }

        const { status: currentStatus, stages: currentStages } = assetResult.rows[0];

        // Step 3: Check if status is valid
        if (!statusTransitions[currentStatus]) {
           // await logApiRequest(req, {
            //     message: "Invalid asset status",
            //     details: { currentStatus }
            // }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({
                error: `Invalid status '${currentStatus}'. Valid statuses are 'Repository' or 'Inventory'.`,
            });
        }

        // Step 4: Check if stage transition is valid
        const allowedTransitions = statusTransitions[currentStatus]?.[currentStages] || [];
        if (!allowedTransitions.includes(new_stages)) {
        //    // await logApiRequest(req, {
        //         message: "Invalid status transition",
        //         details: {
        //             currentStatus,
        //             currentStages,
        //             attemptedStage: new_stages,
        //             allowedTransitions
        //         }
        //     }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({
                error: `Invalid stage transition for '${currentStatus}' from '${currentStages}' to '${new_stages}'. Allowed transitions: ${allowedTransitions.join(", ")}`,
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
            SET stages = $1, sub_stages = $2
            WHERE unique_id = $3 AND category_id = $4
        `;
            await client.query(updateAssetStatusQuery, [new_stages, sub_stages, asset_id, category_id]);

            if (new_stages === "Damage") {
                try {
                    const deleteAssetQuery = `
                    DELETE FROM assetmapping 
                    WHERE asset_id = $1 AND category_id = $2
                `;
                    await client.query(deleteAssetQuery, [asset_id, category_id]);

                    console.log(`Asset with ID ${asset_id} deleted from ${categoriesname} due to damage.`);
                } catch (error) {
                   // await logApiRequest(req, {
                    //     error: 'Error deleting asset',
                    //     message: error.message || error.detail
                    // }, "Failed", submodule, action, module, user_id);
                    console.error(`Error deleting asset: ${error.message}`);
                    throw error;
                }
            }
             
           // await logApiRequest(req, {
            //     message: "Asset status updated (bypass)",
            //     assetDetails: { asset_id, category_id, status: new_stages, sub_stages }
            // }, "Success", submodule, action, module, user_id);

            // Step 8: Respond with success
            return res.status(200).json({
                message: "Asset status updated successfully",
                assetDetails: {
                    asset_id,
                    category_id,
                    status: new_stages,
                    sub_stages,

                },
            });
        }



        // Step 5: Check workflow permissions for the user
        const workflowQuery = `
            SELECT workflowid 
            FROM work_flow_ 
            WHERE workflowname = $1
        `;
        const workflowResult = await client.query(workflowQuery, [workflowname]);

        if (workflowResult.rowCount === 0) {
           // await logApiRequest(req, {
            //     message: "Workflow not found",
            //     details: { workflowname }
            // }, "Failed", submodule, action, module, user_id);
            return res.status(404).json({ error: "Workflow not found for the asset's category" });
        }

        const { workflowid } = workflowResult.rows[0];
        const userWorkflowQuery = `
            SELECT 1 
            FROM user_workflow 
            WHERE userid = $1 AND workflowid = $2
        `;
        const userWorkflowResult = await client.query(userWorkflowQuery, [user_id, workflowid]);

        if (userWorkflowResult.rowCount === 0) {
           // await logApiRequest(req, {
            //     message: "Permission denied",
            //     details: { user_id, workflowid }
            // }, "Failed", submodule, action, module, user_id);
            return res.status(403).json({ error: "User does not have permission to update this workflow" });
        }

        // Step 6: Verify user's role permissions for the action
        const assetApprovalRoleQuery = `
            SELECT groups 
            FROM approval_group 
            WHERE category_id = $1 AND action = $2
        `;
        const assetApprovalRoleResult = await client.query(assetApprovalRoleQuery, [category_id, action]);
        const approvedRoles = assetApprovalRoleResult.rows.map(row => row.groups);

        if (approvedRoles.length === 0) {
           // await logApiRequest(req, {
            //     message: "No roles assigned for this action",
            //     details: { category_id, action }
            // }, "Failed", submodule, action, module, user_id);
            return res.status(403).json({ error: "No roles assigned for this Approval Group" });
        }

        const apiAccessQuery = `
            SELECT api_name 
            FROM api_access 
            WHERE user_id = $1 AND api_name = ANY($2::text[])
        `;
        const apiAccessResult = await client.query(apiAccessQuery, [user_id, approvedRoles]);

        if (apiAccessResult.rowCount === 0) {
           // await logApiRequest(req, {
            //     message: "User role not authorized",
            //     details: { user_id, roles: approvedRoles }
            // }, "Failed", submodule, action, module, user_id);
            return res.status(403).json({ error: "User role not authorized for this category" });
        }

        // Step 7: Update asset status
        const updateAssetStatusQuery = `
            UPDATE "${categoriesname}" 
            SET stages = $1, sub_stages = $2
            WHERE unique_id = $3 AND category_id = $4
        `;
        await client.query(updateAssetStatusQuery, [new_stages, sub_stages, asset_id, category_id]);

        if (new_stages === "Damage") {
            try {
                const deleteAssetQuery = `
                    DELETE FROM assetmapping 
                    WHERE asset_id = $1 AND category_id = $2
                `;
                await client.query(deleteAssetQuery, [asset_id, category_id]);

                console.log(`Asset with ID ${asset_id} deleted from ${categoriesname} due to damage.`);
            } catch (error) {
               // await logApiRequest(req, {
                //     error: 'Error deleting asset',
                //     message: error.message || error.detail
                // }, "Failed", submodule, action, module, user_id);
                console.error(`Error deleting asset: ${error.message}`);
                throw error;
            }
        }
       
       // await logApiRequest(req, {
        //     message: "Asset status updated",
        //     assetDetails: { asset_id, category_id, status: new_stages, sub_stages }
        // }, "Success", submodule, action, module, user_id);

        // Step 8: Respond with success
        return res.status(200).json({
            message: "Asset status updated successfully",
            assetDetails: {
                asset_id,
                category_id,
                status: new_stages,
                sub_stages,

            },
        });
    } catch (error) {
        console.error("Error updating asset status:", error);
       // await logApiRequest(req, {
        //     error: 'Internal server error',
        //     message: error.message || error.detail
        // }, "Failed", submodule, action, module, user_id);
        return res.status(500).json({ error: "Internal server error" });
    } 
    finally {
        client.release(); // Release the client back to the pool
    }
});



// Sub-stages
router.put('/sub_stage/:asset_id', async (req, res) => {
    const { asset_id } = req.params;
    const { user_id, new_stages, sub_stages, category_id, action, toapprove } = req.body;
    const client = await pool.connect();
    const submodule = 'Asset Management';
    const module = 'Asset';

    // Define valid statuses and transitions
    const statusTransitions1 = {
        "Added": ["AwaitingApproval"],
        "AwaitingApproval": ["Approved", "Resubmitted"],
        "Resubmitted": ["AwaitingApproval"],
        "Approved": ["AwaitingApproval"]
    };

    const statusTransitions = {
        Repository: {
            Added: ["AwaitingApproval"],
            AwaitingApproval: ["Active", "Resubmitted"],
            Resubmitted: ["AwaitingApproval"],
        },
        Inventory: {
            Active: ["Mapped", "Inactive"],
            Mapped: ["Damage"],
            Damage: ["SendForRepair"],
            SendForRepair: ["Repaired", "Discard"],
            Repaired: ["Active"],
            Inactive: ["Active", "Discard"],
        },
    };

    const actionStageMappings = {
        MappingRequest: ["Mapped", "Inactive"],
        DiscardRequest: ["Discard", "Active"],
        RepairRequest: ["SendForRepair", "Repaired"],
        DamageRequest: ["Damage"],
    };

    try {
        // Step 0: Validate action
        const validStages = actionStageMappings[action];
        if (!validStages) {
           // await logApiRequest(req, { error: `Invalid action: '${action}'` }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({ error: `Invalid action: '${action}` });
        }

        if (!validStages.includes(new_stages)) {
           // await logApiRequest(req, { error: "Invalid stage transition", validStages }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({
                error: `Invalid stage transition for action '${action}'. Allowed stages: ${validStages.join(", ")}`,
            });
        }

        // Step 1: Fetch category details
        const categoryQuery = `
            SELECT workflowname, categoriesname 
            FROM categories 
            WHERE category_id = $1
        `;
        const categoryResult = await client.query(categoryQuery, [category_id]);

        if (categoryResult.rowCount === 0) {
           // await logApiRequest(req, { error: "Category not found" }, "Failed", submodule, action, module, user_id);
            return res.status(404).json({ error: "Category not found" });
        }

        const { workflowname, categoriesname } = categoryResult.rows[0];

        // Step 2: Fetch asset details
        const assetQuery = `
            SELECT status, stages, sub_stages
            FROM "${categoriesname}" 
            WHERE unique_id = $1 AND category_id = $2
        `;
        const assetResult = await client.query(assetQuery, [asset_id, category_id]);

        if (assetResult.rowCount === 0) {
           // await logApiRequest(req, { error: "Asset not found" }, "Failed", submodule, action, module, user_id);
            return res.status(404).json({ error: "Asset not found" });
        }

        const { status: currentStatus, stages: currentStages, sub_stages: currentSub } = assetResult.rows[0];

        // Step 3: Validate sub_stage transition
        const allowedStages = statusTransitions1[currentSub] || [];
        if (!allowedStages.includes(sub_stages)) {
           // await logApiRequest(req, { error: "Invalid sub_stage transition", allowedStages }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({
                error: `Invalid sub_stage transition for current sub_stage '${currentSub}'. Allowed transitions: ${allowedStages.join(", ")}`,
            });
        }

        // Step 4: Check if status is valid
        if (!statusTransitions[currentStatus]) {
           // await logApiRequest(req, { error: `Invalid status: ${currentStatus}` }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({
                error: `Invalid status '${currentStatus}'. Valid statuses are 'Repository' or 'Inventory'.`,
            });
        }

        // Step 5: Check if stage transition is valid
        const allowedTransitions = statusTransitions[currentStatus]?.[currentStages] || [];
        if (!allowedTransitions.includes(new_stages)) {
           // await logApiRequest(req, { error: "Invalid stage transition", allowedTransitions }, "Failed", submodule, action, module, user_id);
            return res.status(400).json({
                error: `Invalid stage transition for '${currentStatus}' from '${currentStages}' to '${new_stages}'. Allowed transitions: ${allowedTransitions.join(", ")}`,
            });
        }





        // Check if bypass role exists
        const bypassRoleQuery = `
                SELECT * FROM approval_group WHERE category_id = $1 AND action = $2 AND groups = 'bypass'
            `;
        const bypassRoleResult = await client.query(bypassRoleQuery, [category_id, action]);

        if (bypassRoleResult.rowCount !== 0) {
            const updateAssetSubStageQuery = `
            UPDATE "${categoriesname}" 
            SET sub_stages = $1 , toapprove=$2
            WHERE unique_id = $3 AND category_id = $4 
        `;
        await client.query(updateAssetSubStageQuery, [sub_stages, toapprove, asset_id, category_id]);
        
       // await logApiRequest(req, { asset_id, category_id, sub_stages, toapprove }, "Success", submodule, action, module, user_id);

        return res.status(200).json({
            message: "Asset sub_stage updated successfully",
            assetDetails: {
                asset_id,
                category_id,
                sub_stages,
            },
        });
        }








        // Step 6: Check workflow permissions for the user
        const workflowQuery = `
            SELECT workflowid 
            FROM work_flow_ 
            WHERE workflowname = $1
        `;
        const workflowResult = await client.query(workflowQuery, [workflowname]);

        if (workflowResult.rowCount === 0) {
           // await logApiRequest(req, { error: "Workflow not found" }, "Failed", submodule, action, module, user_id);
            return res.status(404).json({ error: "Workflow not found for the asset's category" });
        }

        const { workflowid } = workflowResult.rows[0];
        const userWorkflowQuery = `
            SELECT 1 
            FROM user_workflow 
            WHERE userid = $1 AND workflowid = $2
        `;
        const userWorkflowResult = await client.query(userWorkflowQuery, [user_id, workflowid]);

        
        if (userWorkflowResult.rowCount === 0) {
           // await logApiRequest(req, { error: "User does not have permission" }, "Failed", submodule, action, module, user_id);
            return res.status(403).json({ error: "User does not have permission to update this workflow" });
        }

        // Step 7: Verify user's role permissions for the action
        const assetApprovalRoleQuery = `
            SELECT groups 
            FROM approval_group 
            WHERE category_id = $1 AND action = $2
        `;
        const assetApprovalRoleResult = await client.query(assetApprovalRoleQuery, [category_id, action]);
        const approvedRoles = assetApprovalRoleResult.rows.map(row => row.groups);

        if (approvedRoles.length === 0) {
           // await logApiRequest(req, { error: "No roles found for approval group" }, "Failed", submodule, action, module, user_id);
            return res.status(403).json({ error: "No roles assigned for this Approval Group" });
        }

        const apiAccessQuery = `
            SELECT api_name 
            FROM api_access 
            WHERE user_id = $1 AND api_name = ANY($2::text[])
        `;
        const apiAccessResult = await client.query(apiAccessQuery, [user_id, approvedRoles]);

        if (apiAccessResult.rowCount === 0) {
           // await logApiRequest(req, { error: "Unauthorized user role" }, "Failed", submodule, action, module, user_id);
            return res.status(403).json({ error: "User role not authorized for this category" });
        }

        // Step 8: Update asset sub_stage
        const updateAssetSubStageQuery = `
            UPDATE "${categoriesname}" 
            SET sub_stages = $1 , toapprove=$2
            WHERE unique_id = $3 AND category_id = $4 
        `;
        await client.query(updateAssetSubStageQuery, [sub_stages, toapprove, asset_id, category_id]);

       // await logApiRequest(req, { asset_id, category_id, sub_stages, toapprove }, "Success", submodule, action, module, user_id);

        // Step 9: Respond with success
        return res.status(200).json({
            message: "Asset sub_stage updated successfully",
            assetDetails: {
                asset_id,
                category_id,
                sub_stages,
            },
        });
    } catch (error) {
        console.error("Error updating asset sub_stage:", error);
       // await logApiRequest(req, { error: error.message }, "Failed", submodule, action, module, user_id);
        return res.status(500).json({ error: "Internal server error" });
    } finally {
        client.release(); // Release the client back to the pool
    }
});



// Export the router
module.exports = router;
