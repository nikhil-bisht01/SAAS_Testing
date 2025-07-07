require('dotenv').config();
const express = require('express');
const router = express.Router();
const createTables = require('./createtabels');
const { pool } = require('../config');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand, ListObjectsV2Command,DeleteObjectCommand  } = require("@aws-sdk/client-s3");
const { URL } = require('url');
const { authenticateToken } = require('../index');


router.post('/tables',authenticateToken, async (req, res) => {
    try {
      const {to}=req.user;
  
  // ✅ Validate schema name to prevent SQL injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(to)) {
    return res.status(400).json({ error: 'Invalid schema name format' });
  }

      const result = await createTables(to);
      
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



//✅ GET API that fetches unique values
router.get("/upload", async (req, res) => {
    const client = await pool.connect();
    try {
        const { service_id, doctype_id, allow_doc_id } = req.query;

        let query;
        let values = [];

        if (!service_id && !doctype_id && !allow_doc_id) {
            // Return unique request_for values
            query = `SELECT DISTINCT dp.service_id, s.name FROM 
            DMS_publish dp LEFT JOIN DMS_service s on dp.service_id=s.id`;
        } 
        
        else if (service_id && !doctype_id) {
            // Return unique categories based on request_for
            query = "SELECT DISTINCT dp.doctype_id,dt.doctype FROM DMS_publish dp LEFT JOIN DMS_doctype dt on dp.doctype_id = dt.id WHERE service_id = $1";
            values.push(service_id);
        } 
        
        else if (service_id && doctype_id && !allow_doc_id) {
            // Return unique asset_name based on category
            query = "SELECT DISTINCT dp.allow_doc_id, da.doc_name FROM DMS_publish dp LEFT JOIN DMS_allow_doc da on dp.allow_doc_id = da.id WHERE service_id = $1 AND doctype_id = $2";
            values.push(service_id, doctype_id);
        }
        
        else if (service_id && doctype_id && allow_doc_id) {
            // Return unique asset_name based on category
            query = "SELECT format FROM DMS_publish WHERE service_id = $1 AND doctype_id = $2 AND allow_doc_id= $3";
            values.push(service_id, doctype_id,allow_doc_id);
        }
        
        else {
            return res.status(400).json({ error: "Invalid parameters" });
        }

        const result = await client.query(query, values);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching asset data:", error);
        res.status(500).json({ error: "Internal server error." });
    } finally {
        client.release();
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
  // Let fileFilter pass everything. Validation will be done later.
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});

router.post('/upload-documents', upload.array('documents', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const { metadata } = req.body;
  const Mainfile = req.body.Mainfile || 'Higher';
  const ref = req.body.ref || '';
  const customFolder = req.body.custom_folder || 'default';

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
    const { publish_id, user_id } = metadataArray[0]; // Assume same group for batch

    // Step 1: Get publish details
    const publishRes = await client.query(
      `SELECT service_id, doctype_id, format, allowed_size, approval_needed, workflow_id
       FROM DMS_publish WHERE id = $1`,
      [publish_id]
    );

    if (publishRes.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid publish_id' });
    }

    const {
      service_id,
      doctype_id,
      format,
      allowed_size,
      approval_needed,
      workflow_id
    } = publishRes.rows[0];

    const allowedFormats = format.map(ext => ext.toLowerCase());

    // Validate format and size
    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
      const fileSize = file.size / (1024 ** 2); // MB

      if (!allowedFormats.includes(ext)) {
        return res.status(400).json({
          error: `Invalid file type '${ext}' in '${file.originalname}'. Allowed types: ${allowedFormats.join(', ')}`,
        });
      }

      if (allowed_size && fileSize > allowed_size) {
        return res.status(400).json({
          error: `File '${file.originalname}' exceeds allowed size of ${allowed_size} MB. Actual: ${Math.ceil(fileSize)} MB`,
        });
      }
    }

    // Step 2: Generate or reuse ref_no
    const refCheck = await client.query(
      `SELECT d.ref_no FROM document d
       JOIN DMS_publish p ON d.publish_id = p.id
       WHERE d.user_id = $1 AND p.service_id = $2 AND p.doctype_id = $3
       LIMIT 1`,
      [user_id, service_id, doctype_id]
    );

    let ref_no;
    if (refCheck.rowCount > 0) {
      ref_no = refCheck.rows[0].ref_no;
    } else {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      ref_no = parseInt(`${year}${month}${day}${randomPart}`, 10);
    }

    // Step 3: Determine document status
    let docStatus = 'Approved';
    if (approval_needed) {
      const wfCheck = await client.query(
        `SELECT 1 FROM workflowmodule WHERE workflow_id = $1`,
        [workflow_id]
      );

      if (wfCheck.rowCount === 0) {
        return res.status(400).json({ error: 'Approval is required but workflow_id is invalid or missing' });
      }

      docStatus = 'Pending';
    }

    // Step 4: Upload files
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const { service, publish_id, user_id, document_name } = metadataArray[i];

      if (!document_name) {
        return res.status(400).json({ error: 'Document name is required for all files' });
      }

      const folderName = `${Mainfile}/${service}/${customFolder}/${ref}${ref_no}_${user_id}/`;
      const filePath = `${folderName}${document_name}`;

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
        `INSERT INTO document (publish_id, user_id, document_name, ref_no, path, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [publish_id, user_id, document_name, ref_no, fileUrl, docStatus]
      );

      uploadedFiles.push({
        document_id: result.rows[0].id,
        ref_no: ref_no,
        status: docStatus,
        file_url: fileUrl,
      });
    }

    res.status(200).json({
      message: 'Documents uploaded successfully!',
      uploaded_files: uploadedFiles,
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({
      error: 'Failed to upload documents',
      message: error.message || error.detail,
    });
  } finally {
    client.release();
  }
});






router.get('/documents', async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT 
         d.id AS document_id,
         d.document_name,
         d.path AS document_path,
         p.visibility,
         d.created_at AS uploaded_at,
         d.user_id,
         COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') AS uploaded_by,
         p.id AS publish_id,
         s.id AS service_id,
         s.name AS service_name,
         dt.id AS doctype_id,
         dt.doctype AS doctype_name,
         ad.id AS allow_doc_id,
         ad.doc_name AS allowed_doc_name
       FROM document d
       LEFT JOIN users u ON d.user_id = u.user_id
       LEFT JOIN DMS_publish p ON d.publish_id = p.id
       LEFT JOIN DMS_service s ON p.service_id = s.id
       LEFT JOIN DMS_doctype dt ON p.doctype_id = dt.id
       LEFT JOIN DMS_allow_doc ad ON p.allow_doc_id = ad.id
       ORDER BY d.created_at DESC`
    );

    const documents = result.rows.map(doc => ({
      document_id: doc.document_id,
      service: { id: doc.service_id, name: doc.service_name },
      document_type: { id: doc.doctype_id, name: doc.doctype_name },
      allowed_doc: { id: doc.allow_doc_id, name: doc.allowed_doc_name },
      uploaded_by: { id: doc.user_id, name: doc.uploaded_by },
      document_name: doc.document_name,
      document_no: doc.document_no,
      document_url: doc.document_path,
      visibility: doc.visibility,
      uploaded_at: doc.uploaded_at
    }));

    res.status(200).json(documents);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Error fetching documents' });
  } finally {
    client.release();
  }
});


router.get('/list', async (req, res) => {
  const inputPrefix = req.query.prefix || './';
  const prefix = inputPrefix.replace('./', '').replace(/^\/+|\/+$/g, '') + '/'; // Normalize

  const s3Params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Prefix: prefix === '/' ? '' : prefix,
    Delimiter: '/', // Important: this groups common prefixes like folders
  };

  try {
    const data = await s3.send(new ListObjectsV2Command(s3Params));

    // Collect "folders"
    const folders = (data.CommonPrefixes || []).map(p => ({
      type: 'folder',
      name: p.Prefix.replace(prefix, '').replace(/\/$/, ''),
    }));

    // Collect files at this level
    const files = (data.Contents || [])
      .filter(obj => obj.Key !== prefix) // Avoid listing the prefix itself
      .map(obj => ({
        type: 'file',
        name: obj.Key.replace(prefix, ''),
        url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${obj.Key}`,
      }));

    res.status(200).json({
      path: inputPrefix,
      folders,
      files,
    });
  } catch (err) {
    console.error('S3 List Error:', err);
    res.status(500).json({ error: 'Failed to list contents', message: err.message });
  }
});



//DELETE

router.delete('/documents/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    // Step 1: Get the document record
    const fetchResult = await client.query(
      'SELECT id, document_name, path FROM document WHERE id = $1',
      [id]
    );

    if (fetchResult.rowCount === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = fetchResult.rows[0];

    // Step 2: Parse S3 URL to get Bucket and Key
    const s3Url = new URL(document.path);
    const Bucket = s3Url.hostname.split('.')[0]; // 'higherindia'
    const Key = decodeURIComponent(s3Url.pathname.slice(1)); // remove leading '/'

    // Step 3: Delete from DB first
    await client.query('DELETE FROM document WHERE id = $1', [id]);

    // Step 4: Delete file from S3 using v3 SDK
    const command = new DeleteObjectCommand({ Bucket, Key });

    try {
      await s3.send(command);
      res.status(200).json({
        message: 'Document and S3 file deleted successfully',
        deleted_document: {
          id: document.id,
          document_name: document.document_name,
          file_url: document.path
        }
      });
    } catch (s3Err) {
      console.error('S3 deletion error:', s3Err);
      res.status(500).json({
        error: 'Document deleted from database, but failed to delete file from S3',
        s3_error: s3Err.message
      });
    }
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document', message: error.message });
  } finally {
    client.release();
  }
});



  module.exports = router;
