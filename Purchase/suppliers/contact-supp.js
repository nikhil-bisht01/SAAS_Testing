const express = require('express');
const {pool} = require('../../config');
const router=express.Router();



// ✅ Get All Supplier Contacts
router.get('/supplier-contacts', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM supplier_contacts ORDER BY contact_id DESC');
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    } finally {
        client.release();
    }
});

// ✅ Get Contacts by Supplier ID
router.get('/supplier-contacts/supplier/:supplier_id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { supplier_id } = req.params;
        const result = await client.query('SELECT * FROM supplier_contacts WHERE supplier_id = $1', [supplier_id]);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    } finally {
        client.release();
    }
});

// ✅ Get a Single Contact by Contact ID
router.get('/supplier-contacts/:contact_id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { contact_id } = req.params;
        const result = await client.query('SELECT * FROM supplier_contacts WHERE contact_id = $1', [contact_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Contact not found" });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    } finally {
        client.release();
    }
});

// ✅ Create a New Supplier Contact
const { body, validationResult } = require('express-validator');

router.post('/supplier-contacts', [
   
    body('contact_person').notEmpty().withMessage('Contact person is required').trim(),
    body('phone_num').exists({ checkFalsy: true }).withMessage('Phone number is required')
  .matches(/^[0-9\-]{10,15}$/).withMessage('Phone number must be 10 to 15 digits and may include hyphens'),


    body('email_id').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('address').notEmpty().withMessage('Address is required').trim(),
    body('city').notEmpty().withMessage('City is required').trim(),
    body('state').notEmpty().withMessage('State is required').trim(),
    body('country').notEmpty().withMessage('Country is required').trim(),
    body('pincode').isLength({ min: 6, max: 6 }).withMessage('Pincode must be 6 digits').isNumeric().withMessage('Pincode must be numeric'),
    body('department').notEmpty().withMessage('Department is required').trim(),
    body('designation').notEmpty().withMessage('Designation is required').trim(),
    body('category_type').notEmpty().withMessage('Category type is required').trim(),
    body('category').notEmpty().withMessage('Category is required').trim(),
    body('asset_name').optional().trim(),
    body('date_of_start').optional().isISO8601().withMessage('Start date must be in YYYY-MM-DD format'),
    body('date_of_end').optional().isISO8601().withMessage('End date must be in YYYY-MM-DD format'),
    
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) 
        {
            const messages = errors.array().map(message => message.msg); 
            return res.status(400).json({ errors: messages });
          }
      
    const client = await pool.connect();
    try {
      const {
        supplier_id, contact_person, phone_num, email_id,
        address, city, state, country, pincode,
        department, designation, category_type,
        category, asset_name, date_of_start, date_of_end, status
      } = req.body;
      if (!supplier_id) {
        return res.status(400).json({ message: 'Supplier ID is required' });
    }
  
      const query = `
        INSERT INTO supplier_contacts (
          supplier_id, contact_person, phone_num, email_id,
          address, city, state, country, pincode,
          department, designation, category_type,
          category, asset_name, date_of_start, date_of_end, status 
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 
                $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *;
      `;
  
      const values = [
        supplier_id, contact_person, phone_num, email_id,
        address, city, state, country, pincode,
        department, designation, category_type,
        category, asset_name, date_of_start, date_of_end,
        (status || 'active')

      ];
  
      const result = await client.query(query, values);
      res.status(201).json(result.rows[0]);
    }
    catch (error) {
      console.error(error + "define errors") ;
      res.status(500).json({ message: "Error adding contact", details: error.message });
    }
    finally {
      client.release();
    }
  });



// ✅ Update a Supplier Contact
router.put('/supplier-contacts/:contact_id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { contact_id } = req.params;
        const {
            supplier_id, contact_person, phone_num, email_id,
            address, city, state, country, pincode,
            department, designation, category_type,
            category, asset_name, date_of_start, date_of_end, status
        } = req.body;

        const query = `
            UPDATE supplier_contacts SET
                supplier_id = $1,
                contact_person = $2,
                phone_num = $3,
                email_id = $4,
                address = $5,
                city = $6,
                state = $7,
                country = $8,
                pincode = $9,
                department = $10,
                designation = $11,
                category_type = $12,
                category = $13,
                asset_name = $14,
                date_of_start = $15,
                date_of_end = $16,
                status = $17,
                updated_at = CURRENT_TIMESTAMP
            WHERE contact_id = $18
            RETURNING *;
        `;
        const values = [
            supplier_id, contact_person, phone_num, email_id,
            address, city, state, country, pincode,
            department, designation, category_type,
            category, asset_name, date_of_start, date_of_end, status, contact_id
        ];
        const result = await client.query(query, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Contact not found" });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating contact", details: error.message });
    } finally {
        client.release();
    }
});

// ✅ Delete a Supplier Contact
router.delete('/supplier-contacts/:contact_id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { contact_id } = req.params;
        const result = await client.query('DELETE FROM supplier_contacts WHERE contact_id = $1 RETURNING *', [contact_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Contact not found" });
        }
        res.json({ message: "Contact deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting contact", details: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;