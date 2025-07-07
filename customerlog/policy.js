const express = require('express');
const router = express.Router();
const { pool } = require('../config'); 
const multer = require('multer');


// Multer configuration (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Create Policy
// router.post('/upload-policy', upload.single('document'), async (req, res) => {
//   const client = await pool.connect();
//   try {
//     const { category, name, description } = req.body;
//     const documentBuffer = req.file?.buffer || null;
//     const mimeType = req.file?.mimetype || null;

//     if (!category || !name || !description || !documentBuffer) {
//       return res.status(400).json({ success: false, message: 'All fields including document are required.' });
//     }

//     // Start transaction
//     await client.query('BEGIN');

//     // Check latest version for given name
//     const versionQuery = `SELECT version FROM policies WHERE name = $1 ORDER BY created_at DESC LIMIT 1`;
//     const versionResult = await client.query(versionQuery, [name]);

//     let version = 'v1';
//     if (versionResult.rows.length > 0) {
//       const lastVersion = versionResult.rows[0].version; // "v1", "v2", etc.
//       const nextVersionNumber = parseInt(lastVersion.slice(1)) + 1;
//       version = `v${nextVersionNumber}`;
//     }

//     // Insert policy
//     const insertQuery = `
//       INSERT INTO policies (category, name, description, version, document, mime_type, created_at)
//       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
//       RETURNING *;
//     `;
//     const result = await client.query(insertQuery, [
//       category,
//       name,
//       description,
//       version,
//       documentBuffer,
//       mimeType
//     ]);

//     await client.query('COMMIT');

//     res.status(201).json({
//       success: true,
//       message: 'Policy uploaded successfully',
//       data: result.rows[0]
//     });

//   } catch (err) {
//     await client.query('ROLLBACK');
//     console.error(err);
//     res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
//   } finally {
//     client.release();
//   }
// });

router.post('/upload-policy', upload.single('document'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { category_id, name, description } = req.body;
    const documentBuffer = req.file?.buffer || null;
    const mimeType = req.file?.mimetype || null;

    if (!category_id || !name || !description || !documentBuffer) {
      return res.status(400).json({ success: false, message: 'All fields including document are required.' });
    }

    await client.query('BEGIN');

    const versionQuery = `SELECT version FROM policies WHERE name = $1 ORDER BY created_at DESC LIMIT 1`;
    const versionResult = await client.query(versionQuery, [name]);

    let version = 'v1';
    if (versionResult.rows.length > 0) {
      const lastVersion = versionResult.rows[0].version;
      const nextVersionNumber = parseInt(lastVersion.slice(1)) + 1;
      version = `v${nextVersionNumber}`;
    }

    const insertQuery = `
      INSERT INTO policies (category_id, name, description, version, document, mime_type, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING *;
    `;

    const result = await client.query(insertQuery, [
      category_id,
      name,
      description,
      version,
      documentBuffer,
      mimeType
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Policy uploaded successfully',
      data: result.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
  } finally {
    client.release();
  }
});


// Get All Policies with Credential
router.get('/policies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT policy_id, category_id, name, description, version, created_at
      FROM policies
      ORDER BY created_at DESC
    `);

    res.status(200).json({
      success: true,
      data: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch policies', error: err.message });
  }
});


// Get Document By ID
router.get('/policies-doc/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM policies WHERE policy_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    const policy = result.rows[0];

    // No document found
    if (!policy.document) {
      return res.status(404).json({ success: false, message: 'No document available' });
    }

    // View document inline (in-browser)
    res.setHeader('Content-Type', policy.mime_type || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${policy.name}-${policy.version}.pdf"`
    );

    return res.send(policy.document);

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch policy', error: err.message });
  }
});

// Get Policy By ID
router.get('/policies/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT * FROM policies WHERE policy_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    const policy = result.rows[0];

    // If query param `view=true`, show PDF in browser
    if (req.query.view === 'true') {
      res.setHeader('Content-Type', policy.mime_type);
      res.setHeader('Content-Disposition', `inline; filename="${policy.name}-${policy.version}.pdf"`);
      return res.send(policy.document);
    }

    // Default behavior: return policy metadata
    res.status(200).json({
      success: true,
      data: policy
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch policy', error: err.message });
  }
});

// Create Category
router.post('/create-category', async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: 'Category name is required.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO policy_categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    res.status(201).json({ success: true, message: 'Category created', data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Category creation failed', error: err.message });
  }
});

// Get Categories
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM policy_categories ORDER BY id DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch categories', error: err.message });
  }
});

// Get Policies By Category id
// router.get('/policies/:category_id', async (req, res) => {
//   const { category_id } = req.params;
//   console.log("hello")

//   try {
//     const result = await pool.query(
//       'SELECT * FROM policies WHERE category_id = $1 ORDER BY created_at DESC',
//       [category_id]
//     );

//     res.json({
//       success: true,
//       data: result.rows
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: 'Failed to fetch policies', error: err.message });
//   }
// });

router.get('/:category_id', async (req, res) => {
  const { category_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT policy_id, name, description, category_id, version, created_at
       FROM policies 
       WHERE category_id = $1 
       ORDER BY created_at DESC`,
      [category_id]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch policies', error: err.message });
  }
});




module.exports = router;