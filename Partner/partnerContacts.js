const express = require("express");
const router = express.Router();
const { pool } = require('../config');

// ✅ Add Contact for Partner
router.post("/:partner_id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { partner_id } = req.params;
        const { contact_person, phone_num, email_id, address, city, state, country, pincode, department, designation, date_of_start, date_of_end, status } = req.body;

        const result = await client.query(
            `INSERT INTO partner_contacts (partner_id, contact_person, phone_num, email_id, address, city, state, country, pincode, department, designation, date_of_start, date_of_end, status) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [partner_id, contact_person, phone_num, email_id, address, city, state, country, pincode, department, designation, date_of_start, date_of_end, status]
        );

        res.status(201).json({ message: "Contact added successfully", contact: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" ,details:error.message });
    } finally {
        client.release();
    }
});

// ✅ Get All Contacts for a Partner
router.get("/", async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM partner_contacts ");

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error",details:error.message });
    } finally {
        client.release();
    }
});

// ✅ Get a Single Contact by Contact ID
router.get("/:contact_id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { contact_id } = req.params;
        const result = await client.query("SELECT * FROM partner_contacts WHERE contact_id = $1", [contact_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Contact not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error",details:error.message });
    } finally {
        client.release();
    }
});

// ✅ Update a Contact for a Partner
router.put("/:contact_id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { contact_id } = req.params;
        const { contact_person, phone_num, email_id, address, city, state, country, pincode, department, designation, date_of_start, date_of_end, status } = req.body;

        const result = await client.query(
            `UPDATE partner_contacts 
            SET contact_person = $1, phone_num = $2, email_id = $3, address = $4, city = $5, state = $6, 
            country = $7, pincode = $8, department = $9, designation = $10, date_of_start = $11, 
            date_of_end = $12, status = $13, updated_at = NOW() 
            WHERE contact_id = $14 RETURNING *`,
            [contact_person, phone_num, email_id, address, city, state, country, pincode, department, designation, date_of_start, date_of_end, status, contact_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Contact not found" });
        }

        res.json({ message: "Contact updated successfully", contact: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error",details:error.message });
    } finally {
        client.release();
    }
});

// ✅ Delete a Contact
router.delete("/:contact_id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { contact_id } = req.params;
        const result = await client.query("DELETE FROM partner_contacts WHERE contact_id = $1 RETURNING *", [contact_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Contact not found" });
        }

        res.json({ message: "Contact deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error",details:error.message });
    } finally {
        client.release();
    }
});

module.exports = router;
