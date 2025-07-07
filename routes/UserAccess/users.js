const express = require('express');
const router = express.Router();
const { pool } = require('../../config'); // Import the pool from config
const bcrypt = require('bcryptjs');
const rateLimit = require("express-rate-limit");
const { authenticateToken } = require('../../index');

// Middleware to parse JSON bodies
router.use(express.json());


// Sanitize schema name to allow only alphanumeric + underscores
const sanitizeSchema = (schema) => schema.replace(/[^a-zA-Z0-9_]/g, '');

// Get all users
router.get('/', async (req, res) => {
    const client = await pool.connect();
    const schema = sanitizeSchema(req.user.to);
    try {
        const query = `
            SELECT 
                u.user_id, u.first_name, u.last_name, u.email, u.phone_no, 
                 d.dept_name, sd.sub_dept_name, l.locality, r.role, u.gender, 
                u.emp_id, des.designation, u.manager_id, u.user_status, u.band, u.created_at 
            FROM 
                ${schema}.users u
            LEFT JOIN 
                ${schema}.departments d ON u.dept_id = d.dept_id
            LEFT JOIN 
                ${schema}.sub_departments sd ON u.sub_id = sd.sub_id
            LEFT JOIN 
                ${schema}.location l ON u.location = l.location_id
            LEFT JOIN 
                ${schema}.role r ON u.role_id = r.role_id
            LEFT JOIN 
                ${schema}.designation des ON u.designation  = des.desig_id
        `;
        const result = await client.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});

// rate limt
router.get('/limit',authenticateToken, async (req, res) => {
    const client = await pool.connect();
    const schema = sanitizeSchema(req.user.to);
    try {
        let { page = 1, limit = 10 } = req.query;

        // Convert to numbers and sanitize
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                u.user_id, u.first_name, u.last_name, u.email, u.phone_no, 
                d.dept_name, sd.sub_dept_name, l.locality, r.role, u.gender, 
                u.emp_id, des.designation, u.manager_id, u.user_status, u.band, u.created_at 
            FROM 
                ${schema}.users u
            LEFT JOIN 
                ${schema}.departments d ON u.dept_id = d.dept_id
            LEFT JOIN 
                ${schema}.sub_departments sd ON u.sub_id = sd.sub_id
            LEFT JOIN 
                ${schema}.location l ON u.location = l.location_id
            LEFT JOIN 
                ${schema}.role r ON u.role_id = r.role_id
            LEFT JOIN 
                ${schema}.designation des ON u.designation = des.desig_id
            ORDER BY u.user_id ASC
            LIMIT $1 OFFSET $2
        `;

        const result = await client.query(query, [limit, offset]);

        // Optional: get total count for frontend pagination
        const countResult = await client.query(`SELECT COUNT(*) FROM ${schema}.users`);
        const totalItems = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            data: result.rows,
            pagination: {
                totalItems,
                totalPages,
                currentPage: page,
                perPage: limit
            }
        });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});





// Get all users excluding superadmin
router.get('/getusers',authenticateToken, async (req, res) => {
    const client = await pool.connect();
    const schema = sanitizeSchema(req.user.to);
    try {
        const superAdminEmail = process.env.Mail; // Retrieve the superadmin email from environment variables

        const query = `
            SELECT 
                u.user_id, u.first_name, u.last_name, u.email, u.phone_no, 
                 d.dept_name, sd.sub_dept_name, l.locality, r.role, u.gender, 
                u.emp_id, des.designation, u.manager_id, u.user_status, u.sub_id, u.band, u.location, u.created_at 
            FROM 
                 ${schema}.users u
            LEFT JOIN 
                 ${schema}.departments d ON u.dept_id = d.dept_id
            LEFT JOIN 
                 ${schema}.sub_departments sd ON u.sub_id = sd.sub_id
            LEFT JOIN 
                 ${schema}.location l ON u.location = l.location_id
            LEFT JOIN 
                 ${schema}.role r ON u.role_id = r.role_id
            LEFT JOIN 
                ${schema}.designation des ON u.designation  = des.desig_id
            WHERE 
                u.email <> $1
        `;
        const values = [superAdminEmail]; // Pass the email as a parameter

        const result = await client.query(query, values);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});



// Get user emails
router.get('/email_users',authenticateToken, async (req, res) => {
    const schema = sanitizeSchema(req.user.to);
    const client = await pool.connect();
    try {
        const result = await client.query(`SELECT email, user_id FROM  ${schema}.users`);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});

// // Route for updating the password (only superadmin can update, but not their own password)
// router.put('/update-password', authenticateToken, async (req, res) => {
//     const { email, newPassword } = req.body;
//     const { email: requesterEmail } = req.user; // Email of the user making the request

//     const client = await pool.connect(); // Connect to the pool
//     try {
//         // Check if the user making the request is superadmin
//         if (requesterEmail !== process.env.Mail) {
//             return res.status(403).json({ error: 'Only superadmin can update passwords.' });
//         }

//         // Check if the email to be updated is superadmin's email
//         if (email === process.env.Mail) {
//             return res.status(403).json({ error: 'Superadmin password cannot be changed.' });
//         }

//         // Retrieve the user by email
//         const query = 'SELECT * FROM users WHERE email = $1';
//         const result = await client.query(query, [email]);

//         if (result.rows.length === 0) {
//             return res.status(404).json({ error: 'User not found. Please check the email entered.' });
//         }

//         // Hash the new password
//         const hashedPassword = await bcrypt.hash(newPassword, 10);

//         // Update the user's password
//         const updateQuery = 'UPDATE users SET password = $1 WHERE email = $2 RETURNING *';
//         const updateResult = await client.query(updateQuery, [hashedPassword, email]);

//         res.status(200).json({
//             message: 'Password updated successfully for user',
//             userId: updateResult.rows[0].user_id,
//         });
//     } catch (err) {
//         console.error('Error updating password:', err);
//         res.status(500).json({ error: 'Internal server error',message:err.detail });
//     } finally {
//         client.release(); // Release the client back to the pool
//     }
// });


// Route for updating user details
// router.put('/user/update', async (req, res) => {
//     const { user_id, manager_id, designation, role_id, location, dept_id, sub_id, user_status,band } = req.body;

//     const client = await pool.connect(); // Connect to the pool
//     try {
//         // Validate that `user_id` is provided
//         if (!user_id) {
//             return res.status(400).json({ error: "User ID is required." });
//         }

//         // Dynamically construct the query for updating only the provided fields
//         const fields = [];
//         const values = [];
//         let index = 1;

//         if (manager_id !== undefined) {
//             fields.push(`manager_id = $${index++}`);
//             values.push(manager_id);
//         }
//         if (designation !== undefined) {
//             fields.push(`designation = $${index++}`);
//             values.push(designation);
//         }
//         if (role_id !== undefined) {
//             fields.push(`role_id = $${index++}`);
//             values.push(role_id);
//         }
//         if (location !== undefined) {
//             fields.push(`location = $${index++}`);
//             values.push(location);
//         }
//         if (dept_id !== undefined) {
//             fields.push(`dept_id = $${index++}`);
//             values.push(dept_id);
//         }
//         if (sub_id !== undefined) {
//             fields.push(`sub_id = $${index++}`);
//             values.push(sub_id);
//         }
//         if (user_status !== undefined) {
//             fields.push(`user_status = $${index++}`);
//             values.push(user_status);
//         }
//         if (band !== undefined) {
//             fields.push(`user_status = $${index++}`);
//             values.push(user_status);
//         }

//         // Add user_id as the last value for the WHERE clause
//         values.push(user_id);

//         // If no fields are provided, return the existing user details
//         if (fields.length === 0) {
//             const query = `
//                 SELECT *
//                 FROM users
//                 WHERE user_id = $1;
//             `;
//             const result = await client.query(query, [user_id]);
//             if (result.rowCount === 0) {
//                 return res.status(404).json({ error: "User not found." });
//             }

//             return res.status(200).json({
//                 message: "No fields provided for update. Returning current user details.",
//                 user: result.rows[0],
//             });
//         }

//         // Construct the SQL query
//         const query = `
//             UPDATE users
//             SET ${fields.join(', ')}
//             WHERE user_id = $${index}
//             RETURNING *;
//         `;

//         // Execute the query
//         const result = await client.query(query, values);

//         if (result.rowCount === 0) {
//             return res.status(404).json({ error: "User not found." });
//         }

//         res.status(200).json({
//             message: "User details updated successfully.",
//             user: result.rows[0],
//         });
//     } catch (err) {
//         console.error("Error updating user details:", err);
//         res.status(500).json({ error: "Internal server error", message: err });
//     } finally {
//         client.release(); // Release the client back to the pool
//     }
// });

router.put('/user/update',authenticateToken, async (req, res) => {
  const {
    user_id,
    manager_id,
    designation,
    role_id,
    location,
    dept_id,
    sub_id,
    user_status,
    band,
    emp_id,
    category,    // category_id in table
    gender,      // ✅ NEW
    email        // ✅ NEW
  } = req.body;

  const client = await pool.connect();
  const schema = sanitizeSchema(req.user.to);
  try {
    if (!user_id) {
      return res.status(400).json({ error: "User ID is required." });
    }

    const fields = [];
    const values = [];
    let index = 1;

    if (manager_id !== undefined) {
      fields.push(`manager_id = $${index++}`);
      values.push(manager_id);
    }
    if (designation !== undefined) {
      fields.push(`designation = $${index++}`);
      values.push(designation);
    }
    if (role_id !== undefined) {
      fields.push(`role_id = $${index++}`);
      values.push(role_id);
    }
    if (location !== undefined) {
      fields.push(`location = $${index++}`);
      values.push(location);
    }
    if (dept_id !== undefined) {
      fields.push(`dept_id = $${index++}`);
      values.push(dept_id);
    }
    if (sub_id !== undefined) {
      fields.push(`sub_id = $${index++}`);
      values.push(sub_id);
    }
    if (user_status !== undefined) {
      fields.push(`user_status = $${index++}`);
      values.push(user_status);
    }
    if (band !== undefined) {
      fields.push(`band = $${index++}`);
      values.push(band);
    }
    if (emp_id !== undefined) {
      fields.push(`emp_id = $${index++}`);
      values.push(emp_id);
    }
    if (category !== undefined) {
      fields.push(`category_id = $${index++}`);
      values.push(category);
    }
    if (gender !== undefined) {
      fields.push(`gender = $${index++}`);
      values.push(gender);
    }
    if (email !== undefined) {
      fields.push(`email = $${index++}`);
      values.push(email);
    }

    values.push(user_id); // WHERE clause

    if (fields.length === 0) {
      const query = `SELECT * FROM ${schema}.users WHERE user_id = $1`;
      const result = await client.query(query, [user_id]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "User not found." });
      }

      return res.status(200).json({
        message: "No fields provided for update. Returning current user details.",
        user: result.rows[0],
      });
    }

    const query = `
      UPDATE ${schema}.users
      SET ${fields.join(', ')}
      WHERE user_id = $${index}
      RETURNING *;
    `;

    const result = await client.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({
      message: "User details updated successfully.",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating user details:", err);
    res.status(500).json({ error: "Internal server error", message: err });
  } finally {
    client.release();
  }
});

  

// // Route for updating the password for any user
// router.put('/change-password', authenticateToken, async (req, res) => {
//     const { oldPassword, newPassword, confirmPassword } = req.body;
//     const { email: email } = req.user; // Email of the user making the request

//     // Check if all required fields are provided
//     if (!email || !oldPassword || !newPassword || !confirmPassword) {
//         return res.status(400).json({ error: 'All fields (email, oldPassword, newPassword, confirmPassword) are required.' });
//     }

//     const client = await pool.connect(); // Connect to the pool

//     try {
//         // Retrieve the user by email
//         const query = 'SELECT * FROM users WHERE email = $1';
//         const result = await client.query(query, [email]);

//         if (result.rows.length === 0) {
//             return res.status(404).json({ error: 'User not found. Please check the email entered.' });
//         }

//         const user = result.rows[0];

//         // Compare the old password with the stored hashed password
//         const passwordMatch = await bcrypt.compare(oldPassword, user.password);
//         if (!passwordMatch) {
//             return res.status(400).json({ error: 'Old password is incorrect.' });
//         }

//         // Check if newPassword and confirmPassword match
//         if (newPassword !== confirmPassword) {
//             return res.status(400).json({ error: 'New password and confirm password do not match.' });
//         }

//         // Hash the new password
//         const hashedPassword = await bcrypt.hash(newPassword, 10);

//         // Update the user's password
//         const updateQuery = 'UPDATE users SET password = $1 WHERE email = $2 RETURNING *';
//         const updateResult = await client.query(updateQuery, [hashedPassword, email]);

//         res.status(200).json({
//             message: 'Password updated successfully for user',
//             userId: updateResult.rows[0].user_id,
//             email: updateResult.rows[0].email,
//         });
//     } catch (err) {
//         console.error('Error updating password:', err);
//         res.status(500).json({ error: 'Internal server error', message: err.detail });
//     } finally {
//         client.release(); // Release the client back to the pool
//     }
// });



// Filter users
router.get('/filter', async (req, res) => {
    const client = await pool.connect(); // Connect to the pool
    try {
        const { user_id, email, first_name, last_name, phone_no, dateFrom, dateTo, user_status, dept_name, location } = req.body;

        // Build the base query
        let query = `SELECT user_id, first_name, last_name, email, phone_no, dept_name, location, emp_id, role, designation, user_status, created_at FROM users WHERE 1=1`;
        const queryParams = [];

        // Apply specific search filters
        if (user_id) {
            query += ` AND user_id = $${queryParams.length + 1}`;
            queryParams.push(user_id);
        }

        if (email) {
            query += ` AND email = $${queryParams.length + 1}`;
            queryParams.push(email);
        }

        if (first_name) {
            query += ` AND first_name ILIKE $${queryParams.length + 1}`;
            queryParams.push(`%${first_name}%`);
        }

        if (last_name) {
            query += ` AND last_name ILIKE $${queryParams.length + 1}`;
            queryParams.push(`%${last_name}%`);
        }

        if (phone_no) {
            query += ` AND phone_no = $${queryParams.length + 1}`;
            queryParams.push(phone_no);
        }

        if (dateFrom) {
            query += ` AND created_at >= $${queryParams.length + 1}`;
            queryParams.push(dateFrom);
        }

        if (dateTo) {
            query += ` AND created_at <= $${queryParams.length + 1}`;
            queryParams.push(dateTo);
        }

        if (user_status) {
            query += ` AND user_status = $${queryParams.length + 1}`;
            queryParams.push(user_status);
        }

        if (dept_name) {
            query += ` AND dept_name = $${queryParams.length + 1}`;
            queryParams.push(dept_name);
        }

        if (location) {
            query += ` AND location = $${queryParams.length + 1}`;
            queryParams.push(location);
        }

        // Execute the query
        const result = await client.query(query, queryParams);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});

// Delete a user
router.delete('/',authenticateToken, async (req, res) => {
    const client = await pool.connect(); // Connect to the pool
    const { id } = req.body;
    const schema = sanitizeSchema(req.user.to); // Extract user_id from the request body
    const query = `DELETE FROM ${schema}.users WHERE user_id = $1 RETURNING *`;

    try {
        const result = await client.query(query, [id]);
        if (result.rows.length > 0) {
            res.json({ message: 'Deleted successfully', user: result.rows[0] });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Internal server error',message:err.detail });
    } finally {
        client.release(); // Release the client back to the pool
    }
});

// Get user by ID
router.get('/id_user/:id', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { to } = req.user;

    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid User ID' });
    }

    try {
        const query = `
            SELECT 
                u.user_id, u.first_name, u.last_name, u.email, u.phone_no, 
                d.dept_name, sd.sub_dept_name, l.locality, r.role, u.gender, 
                u.emp_id, des.designation, u.manager_id, 
                CONCAT(m.first_name, ' ', m.last_name) AS manager_name,
                u.user_status, u.band, u.created_at AS user_created_at,
                
                -- User details data
                ud.dob, ud.address, ud.marital_status, ud.nationality, ud.personal_number, 
                ud.joining_date, ud.created_at AS details_created_at, ud.updated_at AS details_updated_at,

                -- New extra_details JSONB column
                ud.extra_details
            FROM 
                ${to}.users u
            LEFT JOIN 
                ${to}.users m ON u.manager_id = m.user_id
            LEFT JOIN 
                ${to}.departments d ON u.dept_id = d.dept_id
            LEFT JOIN 
                ${to}.sub_departments sd ON u.sub_id = sd.sub_id
            LEFT JOIN 
                ${to}.location l ON u.location = l.location_id
            LEFT JOIN 
                ${to}.role r ON u.role_id = r.role_id
            LEFT JOIN 
                ${to}.designation des ON u.designation = des.desig_id
            LEFT JOIN 
                ${to}.user_details ud ON u.user_id = ud.user_id
            WHERE 
                u.user_id = $1
        `;

        const result = await pool.query(query, [id]);

        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});





const prepareFields = (newData, existingData = {}) => {
    const defaultValues = {
        dob: null,
        address: null,
        marital_status: null,
        nationality: null,
        personal_number: null,
        joining_date: null,
        extra_details: {},
    };

    // Merge existing extra_details with new ones
    const mergedExtraDetails = {
        ...existingData.extra_details,  // Keep existing extra_details
        ...newData.extra_details,       // Overwrite with new values (if provided)
        emergency_contact: {
            ...existingData.extra_details?.emergency_contact, // Keep existing emergency_contact
            ...newData.extra_details?.emergency_contact, // Update only provided fields
        },
        spouse_details: {
            ...existingData.extra_details?.spouse_details, // Keep existing spouse_details
            ...newData.extra_details?.spouse_details, // Update only provided fields
        },
    };

    return {
        dob: newData.dob || existingData.dob || null,
        address: newData.address || existingData.address || null,
        marital_status: newData.marital_status || existingData.marital_status || null,
        nationality: newData.nationality || existingData.nationality || null,
        personal_number: newData.personal_number || existingData.personal_number || null,
        joining_date: newData.joining_date || existingData.joining_date || null,
        extra_details: mergedExtraDetails,
    };
};


// API to create or update user details
router.post("/user-details",authenticateToken, async (req, res) => {
    const { user_id, ...newData } = req.body;
    const schema = sanitizeSchema(req.user.to);

    if (!user_id) {
        return res.status(400).json({ message: "User ID is required." });
    }

    const client = await pool.connect();

    try {
        // Check if user exists in the 'users' table
        const checkUserMainQuery = `SELECT * FROM ${schema}.users WHERE user_id = $1`; 
        const checkUserMainResult = await client.query(checkUserMainQuery, [user_id]);

        if (checkUserMainResult.rowCount === 0) {
            return res.status(400).json({ message: "User does not exist. You can create this user." });
        }

        // Check if user already has details in 'user_details' table
        const checkUserDetailsQuery = `SELECT * FROM ${schema}.user_details WHERE user_id = $1`;
        const checkUserDetailsResult = await client.query(checkUserDetailsQuery, [user_id]);

        if (checkUserDetailsResult.rowCount > 0) {
            // User exists in 'user_details', update their details
            const existingData = checkUserDetailsResult.rows[0];
            const updatedData = prepareFields(newData, existingData);

            const updateQuery = `
                UPDATE ${schema}.user_details
                SET
                    dob = $2,
                    address = $3,
                    marital_status = $4,
                    nationality = $5,
                    personal_number = $6,
                    joining_date = $7,
                    extra_details = $8,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1
                RETURNING *;
            `;
            const values = [
                user_id,
                updatedData.dob,
                updatedData.address,
                updatedData.marital_status,
                updatedData.nationality,
                updatedData.personal_number,
                updatedData.joining_date,
                JSON.stringify(updatedData.extra_details),
            ];

            const updateResult = await client.query(updateQuery, values);

            return res.status(200).json({
                message: "User details updated successfully.",
                data: updateResult.rows[0],
            });
        } else {
            // User exists in 'users' but not in 'user_details', create new entry
            const newUserData = prepareFields(newData);

            const insertQuery = `
                INSERT INTO ${schema}.user_details (user_id, dob, address, marital_status, nationality, personal_number, joining_date, extra_details, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING *;
            `;
            const values = [
                user_id,
                newUserData.dob,
                newUserData.address,
                newUserData.marital_status,
                newUserData.nationality,
                newUserData.personal_number,
                newUserData.joining_date,
                JSON.stringify(newUserData.extra_details),
            ];

            const insertResult = await client.query(insertQuery, values);

            return res.status(201).json({
                message: "User details added successfully.",
                data: insertResult.rows[0],
            });
        }
    } catch (error) {
        console.error("Error handling user details:", error);
        return res.status(500).json({ message: "Internal server error." });
    } finally {
        client.release();
    }
});


// Export the router
module.exports = router;
