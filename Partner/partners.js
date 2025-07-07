const express = require("express");
const router = express.Router();
const { pool } = require('../config');
const createTables = require('./table');



// ✅ API Endpoint to Create Tables
router.post("/create-tables", async (req, res) => {
    const result = await createTables();

    if (result.success) {
        res.status(200).send("All tables created successfully!");
    } else {
        res.status(500).json({
            message: "Failed to create all tables.",
            errors: result.errors,
        });
    }
});




// ✅ Apply to Become a Partner
router.post("/apply", async (req, res) => {
    const client = await pool.connect();
    try {
        const { partner_name, gst_number, landline_num, email_id, pan_no, tan_number, 
                address, city, state, country, pincode, website } = req.body;

        const existingPartner = await client.query(
            "SELECT * FROM partners WHERE email_id = $1 OR landline_num = $2",
            [email_id, landline_num]
        );
        if (existingPartner.rows.length > 0) {
            return res.status(400).json({ message: "Email or landline number already registered" });
        }

        const result = await client.query(
            `INSERT INTO partners (partner_name, gst_number, landline_num, email_id, pan_no, 
            tan_number, address, city, state, country, pincode, website)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [partner_name, gst_number, landline_num, email_id, pan_no, tan_number, 
             address, city, state, country, pincode, website]
        );

        res.status(201).json({ message: "Application submitted successfully", partner: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details:error.message });
    } finally {
        client.release();
    }
});

// ✅ Get All Partners
router.get("/", async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM partners ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    } finally {
        client.release();
    }
});

// ✅ Get Partner by ID
router.get("/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const result = await client.query("SELECT * FROM partners WHERE partner_id = $1", [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Partner not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details:error.message });
    } finally {
        client.release();
    }
});

// ✅ Update Partner Information
router.put("/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { partner_name, gst_number, landline_num, email_id, pan_no, tan_number, 
                address, city, state, country, pincode, website, status } = req.body;

        const result = await client.query(
            `UPDATE partners SET partner_name = $1, gst_number = $2, landline_num = $3, email_id = $4, 
            pan_no = $5, tan_number = $6, address = $7, city = $8, state = $9, country = $10, 
            pincode = $11, website = $12, status = $13, updated_at = NOW()
            WHERE partner_id = $14 RETURNING *`,
            [partner_name, gst_number, landline_num, email_id, pan_no, tan_number, 
             address, city, state, country, pincode, website, status, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Partner not found" });
        }

        res.json({ message: "Partner updated successfully", partner: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details:error.message });
    } finally {
        client.release();
    }
});

// ✅ Delete Partner
router.delete("/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const result = await client.query("DELETE FROM partners WHERE partner_id = $1 RETURNING *", [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Partner not found" });
        }

        res.json({ message: "Partner deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", details:error.message });
    } finally {
        client.release();
    }
});

module.exports = router;