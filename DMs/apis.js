require('dotenv').config();
const express = require('express');
const router = express.Router();
const createTables = require('./createtabels');
const { pool } = require('../config');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");






router.post('/create-tables', async (req, res) => {
    try {
      const result = await createTables();
      
      if (result && result.success) {
        res.status(200).send('All tables created successfully!');
      } else {
        res.status(500).json({
          message: 'Failed to create all tables.',
          errors: result ? result.errors : 'Unknown error',
        });
      }
    } catch (err) {
      console.error('Unexpected error while creating tables:', err);
      res.status(500).send('Unexpected error occurred.');
    }
  });






// Services APIs
router.post('/services', async (req, res) => {
  const { name, description } = req.body;
  const client = await pool.connect(); // Ensure you connect to the database

  try {
    const result = await client.query(
      'INSERT INTO service (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    res.status(201).json(result.rows[0]); // Access the result rows correctly
  } catch (err) {
    console.error('Error adding service:', err);
    res.status(500).json({ error: 'Error adding service' , message:err.detail});
  } finally {
    client.release(); // Ensure the client is released after use
  }
});

  
router.get('/services', async (req, res) => {
  const client = await pool.connect(); // Connect to the database
  try {
    const result = await client.query('SELECT * FROM service'); // Execute query
    res.status(200).json(result.rows); // Return the rows from the query result
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).send('Error fetching services');
  } finally {
    client.release(); // Release the database connection
  }
});

  
router.delete('/services/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect(); // Connect to the database
  try {
    const result = await client.query('DELETE FROM service WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).send('Service not found'); // Handle non-existent service
    }
    res.status(200).send('Service deleted');
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).json({ error: 'Error deleting service' , message:err.detail});
  } finally {
    client.release(); // Release the database connection
  }
});











  // Doctype APIs
  router.post('/doctypes', async (req, res) => {
    const { service_id,doctype, name, description } = req.body;
    const client = await pool.connect(); // Connect to the database
    try {
      const result = await client.query(
        'INSERT INTO doctype (service_id, doctype, name, description) VALUES ($1, $2, $3, $4) RETURNING *',
        [service_id,doctype, name, description]
      );
      res.status(201).json(result.rows[0]); // Return the inserted row
    } catch (err) {
      console.error('Error adding doctype:', err);
      res.status(500).json({ error: 'Error adding doctype' , message:err.detail});
    } finally {
      client.release(); // Release the database connection
    }
  });
  
  
  router.get('/doctypes', async (req, res) => {
    const client = await pool.connect(); // Connect to the database
    try {
      const result = await client.query('SELECT * FROM doctype'); // Fetch all records
      res.status(200).json(result.rows); // Return the rows
    } catch (err) {
      console.error('Error fetching doctypes:', err);
      res.status(500).send('Error fetching doctypes');
    } finally {
      client.release(); // Release the database connection
    }
  });
  
  
  router.delete('/doctypes/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect(); // Connect to the database
    try {
      const result = await client.query('DELETE FROM doctype WHERE id = $1 RETURNING *', [id]);
      if (result.rowCount === 0) {
        return res.status(404).send('Doctype not found'); // Handle non-existent doctype
      }
      res.status(200).send('Doctype deleted');
    } catch (err) {
      console.error('Error deleting doctype:', err);
      res.status(500).json({ error: 'Error deleting doctype' , message:err.detail});
    } finally {
      client.release(); // Release the database connection
    }
  });
  
  









  // Document APIs
 
// Configure S3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
// Configure Multer (In-Memory Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: JPG, JPEG, PNG, GIF, PDF'), false);
    }
  },
});

router.post('/upload-documents', upload.array('documents', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const { metadata } = req.body;
  if (!metadata) {
    return res.status(400).json({ error: 'Metadata is required' });
  }

  let metadataArray;
  try {
    metadataArray = JSON.parse(metadata);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid metadata format' });
  }

  if (metadataArray.length !== req.files.length) {
    return res.status(400).json({ error: 'Mismatch between files and metadata count' });
  }

  const uploadedFiles = [];
  const client = await pool.connect();

  try {
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const {doctype_id, user_id, document_name } = metadataArray[i];

      if (!document_name) {
        return res.status(400).json({ error: 'Document name is required for all files' });
      }

      const document_no = `DOC-${Date.now()}-${i}`;
      const folderName = `Higher/${user_id}/`; // Folder based on user_id
      const fileName = `${document_name}-${document_no}`;
      const filePath = `${folderName}${fileName}`;

      const s3Params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: filePath,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      };

      await s3.send(new PutObjectCommand(s3Params));

      const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${filePath}`;

      const result = await client.query(
        `INSERT INTO document (doctype_id, user_id, document_name, document_no, path, visibility)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [doctype_id, user_id, document_name, document_no, fileUrl, true]
      );

      uploadedFiles.push({
        document_id: result.rows[0].id,
        document_no: document_no,
        file_url: fileUrl,
      });
    }

    res.status(200).json({
      message: 'Documents uploaded successfully!',
      uploaded_files: uploadedFiles,
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: 'Failed to upload documents', message: error.detail });
  } finally {
    client.release();
  }
});


/**
 * 📌 GET API: Fetch All Documents
 */

router.get('/documents', async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT d.id, dt.service_id, s.name AS service_name, 
              d.doctype_id, dt.name AS doctype_name, 
              d.user_id, COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') AS uploaded_by,
              d.document_name, d.document_no, d.path AS document_path, d.visibility, d.created_at
       FROM document d
       LEFT JOIN doctype dt ON d.doctype_id = dt.id
       LEFT JOIN service s ON dt.service_id = s.id
       LEFT JOIN users u ON d.user_id = u.user_id
       ORDER BY d.created_at DESC`
    );

    const documents = result.rows.map(doc => ({
      document_id: doc.id,
      service: { id: doc.service_id, name: doc.service_name },
      document_type: { id: doc.doctype_id, name: doc.doctype_name },
      uploaded_by: { id: doc.user_id, name: doc.uploaded_by },
      document_name: doc.document_name,
      document_no: doc.document_no,
      document_url: doc.document_path,
      visibility: doc.visibility,
      uploaded_at: doc.created_at
    }));

    res.status(200).json(documents);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Error fetching documents' });
  } finally {
    client.release();
  }
});




router.get('/flt_documents', async (req, res) => {
  const client = await pool.connect();

  try {
    const { service_id, doctype_id, user_id, docname } = req.query;
    const errors = [];

    // Check if the provided service_id exists
    if (service_id) {
      const serviceCheck = await client.query('SELECT 1 FROM service WHERE id = $1', [service_id]);
      if (serviceCheck.rowCount === 0) {
        errors.push('Invalid service_id');
      }
    }

    // Check if the provided doctype_id exists
    if (doctype_id) {
      const doctypeCheck = await client.query('SELECT 1 FROM doctype WHERE id = $1', [doctype_id]);
      if (doctypeCheck.rowCount === 0) {
        errors.push('Invalid doctype_id');
      }
    }

    // Check if the provided user_id exists
    if (user_id) {
      const userCheck = await client.query('SELECT 1 FROM users WHERE user_id = $1', [user_id]);
      if (userCheck.rowCount === 0) {
        errors.push('Invalid user_id');
      }
    }

    // Return error if any condition fails
    if (errors.length > 0) {
      return res.status(404).json({ error: errors.join(', ') });
    }

    // Base query to fetch documents
    let query = `
      SELECT d.id, dt.service_id, s.name AS service_name,
             d.doctype_id, dt.name AS doctype_name,
             d.user_id, COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') AS uploaded_by,
             d.document_name, d.document_no, d.path AS document_path, d.visibility, d.created_at
      FROM document d
      LEFT JOIN doctype dt ON d.doctype_id = dt.id
      LEFT JOIN service s ON dt.service_id = s.id
      LEFT JOIN users u ON d.user_id = u.user_id
    `;

    const conditions = [];
    const values = [];
    let index = 1;

    if (service_id) {
      conditions.push(`dt.service_id = $${index++}`);
      values.push(service_id);
    }
    if (doctype_id) {
      conditions.push(`d.doctype_id = $${index++}`);
      values.push(doctype_id);
    }
    if (docname) {
      conditions.push(`d.document_name ILIKE $${index++}`);
      values.push(`%${docname}%`);
    }
    if (user_id) {
      conditions.push(`d.user_id = $${index++}`);
      values.push(user_id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY d.created_at DESC';

    const result = await client.query(query, values);

    const documents = result.rows.map(doc => ({
      document_id: doc.id,
      service: { id: doc.service_id, name: doc.service_name },
      document_type: { id: doc.doctype_id, name: doc.doctype_name },
      uploaded_by: { id: doc.user_id, name: doc.uploaded_by || 'Unknown' },
      document_name: doc.document_name,
      document_no: doc.document_no,
      document_url: doc.document_path,
      visibility: doc.visibility,
      uploaded_at: doc.created_at
    }));

    res.status(200).json(documents);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Error fetching documents' });
  } finally {
    client.release();
  }
});






router.get('/empty-folders', async (req, res) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Prefix: 'Higher/',  // Your base folder to check for
    Delimiter: '/',     // This will list folders
  };

  try {
    // Fetch folder structure from S3
    const data = await s3.send(new ListObjectsV2Command(params));

    // List all folders (common prefixes)
    const folders = data.CommonPrefixes.map((prefix) => prefix.Prefix);
    const emptyFolders = [];

    // Check each folder for files
    for (const folder of folders) {
      const fileParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Prefix: folder,
      };

      const fileData = await s3.send(new ListObjectsV2Command(fileParams));

      // Check if the folder has no files or subfolders (excluding the folder itself)
      const isEmpty = fileData.Contents.every(item => item.Key === folder || item.Key.startsWith(folder));

      // If no files or subfolders exist, the folder is considered empty
      if (fileData.Contents.length === 0 || isEmpty) {
        emptyFolders.push(folder);
      }
    }

    // Return response
    res.status(200).json({
      message: 'Empty folders fetched successfully!',
      empty_folders: emptyFolders,
    });
  } catch (error) {
    console.error('Error fetching empty folders:', error);
    res.status(500).json({ error: 'Failed to fetch empty folders', message: error.message });
  }
});






// PUT API: Update Document Metadata (Visibility)
router.put('/update-document/:id', async (req, res) => {
  const { id } = req.params;
  const { visibility } = req.body;
  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE document SET visibility = $1 WHERE id = $2 RETURNING *`,
      [visibility, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.status(200).json({
      message: 'Document updated successfully!',
      updated_document: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document', message: error.message });
  } finally {
    client.release();
  }
});



router.delete('/documents/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect(); // Connect to the database
  try {
    const result = await client.query('DELETE FROM document WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).send('Document not found'); // Handle non-existent document
    }
    res.status(200).send('Document deleted');
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).send('Error deleting document');
  } finally {
    client.release(); // Release the database connection
  }
});








  // Document Versions APIs
  router.post('/document-versions', async (req, res) => {
    const { document_id, version, path, updated_by } = req.body;
    const client = await pool.connect(); // Connect to the database
    try {
      const result = await client.query(
        'INSERT INTO document_versions (document_id, version, path, updated_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [document_id, version, path, updated_by]
      );
      res.status(201).json(result.rows[0]); // Return the inserted document version
    } catch (err) {
      console.error('Error adding document version:', err);
      res.status(500).send('Error adding document version');
    } finally {
      client.release(); // Release the database connection
    }
  });
  
  
  router.get('/document-versions/:document_id', async (req, res) => {
    const { document_id } = req.params;
    const client = await pool.connect(); // Connect to the database
    try {
      const result = await client.query(
        'SELECT * FROM document_versions WHERE document_id = $1 ORDER BY version DESC',
        [document_id]
      );
      res.status(200).json(result.rows); // Return the document versions
    } catch (err) {
      console.error('Error fetching document versions:', err);
      res.status(500).send('Error fetching document versions');
    } finally {
      client.release(); // Release the database connection
    }
  });
  
  






  // Docflow APIs
  router.post('/docflows', async (req, res) => {
    const { document_id, action, user_id, status } = req.body;
    const client = await pool.connect(); // Connect to the database
    try {
      const result = await client.query(
        'INSERT INTO docflow (document_id, action, user_id, status) VALUES ($1, $2, $3, $4) RETURNING *',
        [document_id, action, user_id, status]
      );
      res.status(201).json(result.rows[0]); // Return the inserted docflow entry
    } catch (err) {
      console.error('Error adding docflow:', err);
      res.status(500).send('Error adding docflow');
    } finally {
      client.release(); // Release the database connection
    }
  });
  
  
  router.get('/docflows/:document_id', async (req, res) => {
    const { document_id } = req.params;
    const client = await pool.connect(); // Connect to the database
    try {
      const result = await client.query(
        'SELECT * FROM docflow WHERE document_id = $1',
        [document_id]
      );
      res.status(200).json(result.rows); // Return the docflow entries
    } catch (err) {
      console.error('Error fetching docflow:', err);
      res.status(500).send('Error fetching docflow');
    } finally {
      client.release(); // Release the database connection
    }
  });
  




  
  module.exports = router;
