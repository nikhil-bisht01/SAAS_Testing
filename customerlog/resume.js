const express = require('express');
const router = express.Router();
const { pool } = require('../config');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const sendMail = require('../mailConfig');

// Multer configuration (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });


const SALT_ROUNDS = 10;

// Generate OTP
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
};

// // Request OTP route
router.post('/request-otp', async (req, res) => {
  const { email } = req.body;

  try {
    const existing = await pool.query(
      'SELECT is_verified FROM email_verifications WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0 && existing.rows[0].is_verified === true) {
      return res.status(200).json({
        message: 'Email already verified.',
        email_verified: true
      });
    }

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await pool.query(`
      INSERT INTO email_verifications (email, otp_hash, expires_at, is_verified)
      VALUES ($1, $2, $3, FALSE)
      ON CONFLICT (email) DO UPDATE
      SET otp_hash = $2, expires_at = $3, is_verified = FALSE
    `, [email, otpHash, expiresAt]);

    await sendMail(email, 'Your OTP Code', `<p>Your OTP is <b>${otp}</b></p>`);

    res.status(200).json({
      message: 'OTP sent to email.',
      email_verified: false
    });

  } catch (err) {
    console.error('OTP request error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});


// // Verify OTP route
router.post('/verify-otp', async (req, res) => {
  const { email, enteredOtp } = req.body;

  try {
    const result = await pool.query(
      'SELECT otp_hash, expires_at, is_verified FROM email_verifications WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'OTP not found for this email' });
    }

    const { otp_hash, expires_at, is_verified } = result.rows[0];

    if (is_verified) {
      return res.status(200).json({ message: 'Email already verified', email_verified: true });
    }

    if (new Date() > expires_at) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    const isMatch = await bcrypt.compare(enteredOtp, otp_hash);

    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // ✅ Update: Mark verified and clear otp_hash & expires_at
    await pool.query(
      'UPDATE email_verifications SET is_verified = TRUE, otp_hash = NULL, expires_at = NULL WHERE email = $1',
      [email]
    );

    return res.status(200).json({
      message: 'Email verified successfully.',
      email_verified: true
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    return res.status(500).json({ error: 'OTP verification failed' });
  }
});



// upload application with resume (USER)
router.post('/apply', upload.single('resume'), async (req, res) => {
  const {
    name,
    email,
    phone_no,
    message,
    job_title,
    department,
    year_of_experience,
    ctc,
    source,
    status
  } = req.body;

  const resumeBuffer = req.file?.buffer || null;
  const mimeType = req.file?.mimetype || null;

  if (!resumeBuffer) {
    return res.status(400).json({ success: false, message: 'Resume file is required.' });
  }

  try {
    // ✅ Step 1: Check email verification status
    const verifyCheck = await pool.query(
      'SELECT is_verified FROM email_verifications WHERE email = $1',
      [email]
    );

    if (verifyCheck.rows.length === 0 || verifyCheck.rows[0].is_verified !== true) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before applying.'
      });
    }

    // ✅ Step 2: Check re-apply cooldown (60 days)
    // ✅ Step 2: Check re-apply cooldown (60 days per job title)
const prevApp = await pool.query(
  `SELECT created_at FROM careers 
   WHERE email = $1 AND job_title = $2 
   ORDER BY created_at DESC LIMIT 1`,
  [email, job_title]
);

if (prevApp.rows.length > 0) {
  const lastAppDate = new Date(prevApp.rows[0].created_at);
  const daysSince = Math.floor((Date.now() - lastAppDate) / (1000 * 60 * 60 * 24));
  if (daysSince < 60) {
    return res.status(403).json({
      success: false,
      message: `You already applied for "${job_title}" ${daysSince} day(s) ago. You can re-apply after ${60 - daysSince} day(s).`
    });
  }
}

    // const prevApp = await pool.query(
    //   'SELECT created_at FROM careers WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
    //   [email]
    // );

    // if (prevApp.rows.length > 0) {
    //   const lastAppDate = new Date(prevApp.rows[0].created_at);
    //   const daysSince = Math.floor((Date.now() - lastAppDate) / (1000 * 60 * 60 * 24));
    //   if (daysSince < 60) {
    //     return res.status(403).json({
    //       success: false,
    //       message: `You can only re-apply after ${60 - daysSince} day(s). Please wait.`
    //     });
    //   }
    // }

    // ✅ Step 3: Insert application
    const result = await pool.query(`
      INSERT INTO careers (
        name, email, phone_no, message, job_title, department,
        year_of_experience, ctc, resume, resume_mime, email_verified,
        source, status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12)
      RETURNING *
    `, [
      name,
      email,
      phone_no,
      message,
      job_title,
      department,
      year_of_experience,
      ctc,
      resumeBuffer,
      mimeType,
      source,
      status
    ]);

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully!',
      data: result.rows[0]
    });

  } catch (err) {
    console.error('Apply error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// PUT /update-status/:id
router.put('/update-status/:id', async (req, res) => {
  const applicationId = req.params.id;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      success: false,
      message: 'Status field is required.'
    });
  }

  try {
    const result = await pool.query(
      `UPDATE careers SET status = $1 WHERE id = $2 RETURNING *`,
      [status, applicationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Application status updated successfully.',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});


// router.post('/apply', upload.single('resume'), async (req, res) => {
//   try {
//     const {
//       name,
//       email,
//       phone_no,
//       message,
//       job_title,
//       department,
//       year_of_experience,
//       ctc,
//       source,
//       status,
//       email_verified
//     } = req.body;

//     const resumeBuffer = req.file?.buffer || null;
//     const mimeType = req.file?.mimetype || null;

//     if (!resumeBuffer) {
//       return res.status(400).json({ success: false, message: 'Resume file is required.' });
//     }

//     const isVerified = email_verified === true || email_verified === 'true';

//     if (!isVerified) {
//       return res.status(403).json({
//         success: false,
//         message: 'Please verify your email before applying.'
//       });
//     }

//     const check = await pool.query(
//       `SELECT * FROM careers WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
//       [email]
//     );

//     if (check.rows.length > 0) {
//       const lastApp = check.rows[0];

//       if (!lastApp.email_verified) {
//         return res.status(403).json({
//           success: false,
//           message: 'Email is not verified. Please verify your email before applying again.'
//         });
//       }

//       const lastDate = new Date(lastApp.created_at);
//       const now = new Date();
//       const diffInDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

//       if (diffInDays < 60) {
//         return res.status(403).json({
//           success: false,
//           message: `You can only re-apply after ${60 - diffInDays} day(s). Please wait before applying again.`
//         });
//       }
//     }

//     const result = await pool.query(
//       `INSERT INTO careers 
//         (name, email, phone_no, message, job_title, department, year_of_experience, ctc, resume, resume_mime, email_verified, source, status)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
//        RETURNING *`,
//       [
//         name,
//         email,
//         phone_no,
//         message,
//         job_title,
//         department,
//         year_of_experience,
//         ctc,
//         resumeBuffer,
//         mimeType,
//         isVerified,
//         source,
//         status
//       ]
//     );

//     res.status(201).json({
//       success: true,
//       message: 'Application submitted successfully!',
//       data: result.rows[0]
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
//   }
// });


// upload application with resume (HR)

router.post('/apply-hr', upload.single('resume'), async (req, res) => {
  try {
    const {
      name,
      email,
      phone_no,
      message,
      job_title,
      department,
      year_of_experience,
      ctc,
      source,
      status,
      email_verified = 'true'
    } = req.body;

    const resumeBuffer = req.file?.buffer || null;
    const mimeType = req.file?.mimetype || null;

    if (!resumeBuffer) {
      return res.status(400).json({ success: false, message: 'Resume file is required.' });
    }

    // Ensure email_verified is boolean
    const isVerified = email_verified === true || email_verified === 'true';

    if (!isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before applying.'
      });
    }

    const check = await pool.query(
      `SELECT * FROM careers WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
      [email]
    );

    if (check.rows.length > 0) {
      const lastApp = check.rows[0];

      if (!lastApp.email_verified) {
        return res.status(403).json({
          success: false,
          message: 'Email is not verified. Please verify your email before applying again.'
        });
      }

      const lastDate = new Date(lastApp.created_at);
      const now = new Date();
      const diffInDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

      if (diffInDays < 60) {
        return res.status(403).json({
          success: false,
          message: `You can only re-apply after ${60 - diffInDays} day(s). Please wait before applying again.`
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO careers 
        (name, email, phone_no, message, job_title, department, year_of_experience, ctc, resume, resume_mime, email_verified, source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        name,
        email,
        phone_no,
        message,
        job_title,
        department,
        year_of_experience,
        ctc,
        resumeBuffer,
        mimeType,
        isVerified, // ✅ now based on real value
        source,
        status
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully!',
      data: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
  }
});

// Apply by user
// router.post('/apply', upload.single('resume'), async (req, res) => {
//   try {
//     const {
//       name,
//       email,
//       phone_no,
//       message,
//       job_title,
//       department,
//       year_of_experience,
//       ctc,
//       source,
//       status
//     } = req.body;

//     const resumeBuffer = req.file?.buffer || null;
//     const mimeType = req.file?.mimetype || null;

//     if (!resumeBuffer) {
//       return res.status(400).json({ success: false, message: 'Resume file is required.' });
//     }

//     const result = await pool.query(
//       `INSERT INTO careers 
//         (name, email, phone_no, message, job_title, department, year_of_experience, ctc, resume, resume_mime, source, status)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
//        RETURNING *`,
//       [
//         name,
//         email,
//         phone_no,
//         message,
//         job_title,
//         department,
//         year_of_experience,
//         ctc,
//         resumeBuffer,
//         mimeType,
//         source,
//         status
//       ]
//     );

//     res.status(201).json({
//       success: true,
//       message: 'Application submitted successfully!',
//       data: result.rows[0]
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
//   }
// });





// get all career applications (without resume)

router.get('/careers', async (req, res) => {
  try {
    const query = `
      SELECT id, name, email, phone_no, message, job_title, department,
             year_of_experience, ctc, source, status, created_at
      FROM careers
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows,
    });

  } catch (error) {
    console.error('Error fetching career entries:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});


// get application credentials by uid (exclude resume)

router.get('/careers/credentials/:uid', async (req, res) => {
  const { uid } = req.params;

  // Clean up UID if needed (remove extra quotes)
  const cleanedUid = uid.replace(/['"]+/g, '');

  try {
    const query = `
      SELECT id, name, email, phone_no, message, job_title, department,
             year_of_experience, ctc, source, status, created_at
      FROM careers
      WHERE id = $1
    `;
    
    const result = await pool.query(query, [cleanedUid]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0], // Now includes source and status
    });

  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// get resume file by uid

router.get('/careers/resume/:uid', async (req, res) => {
  const { uid } = req.params;

  // Clean up UID if needed (remove extra quotes or unwanted characters)
  const cleanedUid = uid.replace(/['"]+/g, '');

  try {
    const query = `
      SELECT resume, resume_mime
      FROM careers
      WHERE id = $1
    `;
    
    const result = await pool.query(query, [cleanedUid]);

    if (result.rows.length === 0 || !result.rows[0].resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found',
      });
    }

    const applicant = result.rows[0];
    const resumeBuffer = applicant.resume;  // The resume data stored in the database
    const resumeMime = applicant.resume_mime;  // The MIME type of the resume (e.g., application/pdf)

    // Set the correct content-type for the resume file
    res.setHeader('Content-Type', resumeMime);
    
    // Set content disposition to 'attachment' to allow downloading (you can also use inline for viewing in the browser)
    res.setHeader('Content-Disposition', 'inline');

    // Send the resume buffer as a response
    res.send(resumeBuffer);

  } catch (error) {
    console.error('Error fetching resume:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// flag application by moving to flagged_applications table

router.post('/flag/:id', async (req, res) => {
  const careerId = req.params.id;

  try {
    // Now fetching by "id" not "uid"
    const fetch = await pool.query(`SELECT * FROM careers WHERE id = $1`, [careerId]);

    if (fetch.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const app = fetch.rows[0];

    // Insert into flagged_applications (id is stored as TEXT)
    await pool.query(
      `INSERT INTO flagged_applications 
        (id, name, email, phone_no, message, job_title, department, year_of_experience, ctc, resume, resume_mime, email_verified, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        app.id.toString(),  // Store as text
        app.name,
        app.email,
        app.phone_no,
        app.message,
        app.job_title,
        app.department,
        app.year_of_experience,
        app.ctc,
        app.resume,
        app.resume_mime,
        app.email_verified,
        app.status
      ]
    );

    // Delete original
    await pool.query(`DELETE FROM careers WHERE id = $1`, [careerId]);

    res.json({ success: true, message: 'Application flagged successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Flagging failed', error: err.message });
  }
});

// get all flagged applications (without resume)

router.get('/flagged', async (req, res) => {
  try {
    const query = `
      SELECT id, name, email, phone_no, message, job_title, department,
             year_of_experience, ctc, email_verified, created_at
      FROM flagged_applications
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching flagged applications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch flagged applications',
      error: error.message
    });
  }
});

// get flagged application credentials by uid (exclude resume)

router.get('/flagged/credentials/:uid', async (req, res) => {
  const { uid } = req.params;
  const cleanedUid = uid.replace(/['"]+/g, '');

  try {
    const query = `
      SELECT id, name, email, phone_no, message, job_title, department,
             year_of_experience, ctc, created_at
      FROM flagged_applications
      WHERE id = $1
    `;
    
    const result = await pool.query(query, [cleanedUid]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Flagged application not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],  // Only the visible details, no resume
    });

  } catch (error) {
    console.error('Error fetching flagged credentials:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// get flagged resume file by uid
router.get('/flagged/resume/:uid', async (req, res) => {
  const { uid } = req.params;
  const cleanedUid = uid.replace(/['"]+/g, '');

  try {
    const query = `
      SELECT resume, resume_mime
      FROM flagged_applications
      WHERE id = $1
    `;
    
    const result = await pool.query(query, [cleanedUid]);

    if (result.rows.length === 0 || !result.rows[0].resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found in flagged applications',
      });
    }

    const { resume, resume_mime } = result.rows[0];

    res.setHeader('Content-Type', resume_mime);
    res.setHeader('Content-Disposition', 'inline');
    res.send(resume);

  } catch (error) {
    console.error('Error fetching flagged resume:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

// delete flagged resume file by uid
router.delete('/flagged/:uid', async (req, res) => {
  const { uid } = req.params;
  const cleanedUid = uid.replace(/['"]+/g, '');

  try {
    // Check if the flagged application exists
    const check = await pool.query(
      `SELECT id FROM flagged_applications WHERE id = $1`,
      [cleanedUid]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Flagged application not found',
      });
    }

    // Delete the flagged application
    await pool.query(
      `DELETE FROM flagged_applications WHERE id = $1`,
      [cleanedUid]
    );

    res.json({
      success: true,
      message: 'Flagged application deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting flagged application:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});


module.exports = router