const express = require('express')
const {pool} = require('../../config')
const route = express.Router()
const {authenticateToken}= require('../middleware/auth')
const router = require('./contact-supp')


router.post("/testing" , authenticateToken, async(req ,res) =>{

    const client = await pool.connect()

    try {
        const { workflowname, budget, Approver, Discription  } = req.body;
        if(!workflowname || !budget || !budget.length ===0){
            return res.status(400).json({error: "Workflow name, action, and at least one budget ID are required."})
        }
         // Check if all budget IDs exist in the `budget` table
         const queryCheck = `SELECT id FROM budget WHERE id = ANY($1)`;
         const resultCheck = await client.query(queryCheck, [budget_ids]); 
 
         const existingIds = resultCheck.rows.map(row => row.id);
         const missingIds = budget_ids.filter(id => !existingIds.includes(id));
 
         if (missingIds.length > 0) {
             return res.status(404).json({ error: `Budget ID(s) not found: ${missingIds.join(", ")}` });
         }
        
    } catch (error) {
        return res.status(400).json({success:"false" , message:error})
        
    }
    return res.status(500).json("Internal server Error")
}) 