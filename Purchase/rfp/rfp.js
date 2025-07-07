const express = require('express');
const createTables = require('../table');
const { pool } = require('../../config');
const router = express.Router();
require('dotenv').config();
const sharp = require('sharp');
const sendMail = require('../../mailConfig')

const axios = require('axios');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });




// Creating Default Entry for RFP's Organization and Logo

router.post('/default_rfp_organization', async (req, res) => {

  const { Organization_name, Organization_address, Organization_logo_url ,Organization_logo } = req.body;

  if (!Organization_name) {
    return res.status(400).json({ success: false, message: 'Organization name is required' });
  }

  const finalLogo = Organization_logo_url;

  try {
    const existingOrg = await pool.query(
      'SELECT id FROM  default_rfp_details WHERE Organization_name = $1',
      [Organization_name]
    );

    if (existingOrg.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Organization already exists' });
    }

    const insertQuery = `
      INSERT INTO default_rfp_details (Organization_name,Organization_address ,Organization_logo_url , organization_logo )
      VALUES ($1, $2, $3 , $4)
      RETURNING *
    `;
    const result = await pool.query(insertQuery, [Organization_name, Organization_address, finalLogo , Organization_logo]);

    return res.status(201).json({
      success: true,
      message: 'Organization created successfully',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Error inserting organization:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// GET API for Default Organization Name and Logo

router.get('/default_rfp_organization', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM default_rfp_details ORDER BY id DESC');
    console.log(result.rows)
    return res.status(200).json({
      success: true,
      message: 'Organizations fetched successfully',
      data: result.rows,
    });
  } catch (err) {
    console.error('Error fetching organizations:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});



// create a new rfps  requuest


router.post('/create_rfp', async (req, res) => {

  let logoImage = null;

  const {
    rfp_id,
    Organization_Name,
    Logo,
    Title,
    Start_Date,
    End_Date,
    Upload_file,
    Additional_Description,
  } = req.body;

  const missingFields = [];

  if (!rfp_id) missingFields.push('rfp_id');
  if (!Organization_Name) missingFields.push('Organization_Name');
  if (!Logo) missingFields.push('Logo');

  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required field(s): ${missingFields.join(', ')}`
    });
  }

  // Helper function to check if URL is valid and not empty
  const isValidUrl = (url) => {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return false;
    }
    try {
      new URL(url.trim());
      return true;
    } catch {
      return false;
    }
  };

  // Validate URL format for optional fields
  if (Logo && !isValidUrl(Logo)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid URL format for Logo'
    });
  }

  if (Upload_file && !isValidUrl(Upload_file)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid URL format for Upload_file'
    });
  }

  // File validation function
  const validateFile = async (url, fileType, maxSizeMB = 10) => {
    try {
      const response = await axios.head(url, { timeout: 10000 });
      const contentLength = parseInt(response.headers['content-length'] || '0');
      const contentType = response.headers['content-type'] || '';

      // Check file size (convert MB to bytes)
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      if (contentLength > maxSizeBytes) {
        return {
          valid: false,
          message: `File size exceeds ${maxSizeMB}MB limit. Current size: ${(contentLength / (1024 * 1024)).toFixed(2)}MB`
        };
      }

      // Validate file type based on content-type and URL extension
      const urlLower = url.toLowerCase();

      if (fileType === 'logo') {
        const validLogoTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
        const validLogoExtensions = ['.png', '.jpg', '.jpeg', '.svg'];

        const hasValidContentType = validLogoTypes.some(type => contentType.includes(type));
        const hasValidExtension = validLogoExtensions.some(ext => urlLower.endsWith(ext));

        if (!hasValidContentType && !hasValidExtension) {
          return {
            valid: false,
            message: 'Logo must be PNG, JPG, JPEG, or SVG format'
          };
        }
      } else if (fileType === 'document') {
        const validDocTypes = ['application/pdf'];
        const validDocExtensions = ['.pdf'];

        const hasValidContentType = validDocTypes.some(type => contentType.includes(type));
        const hasValidExtension = validDocExtensions.some(ext => urlLower.endsWith(ext));

        if (!hasValidContentType && !hasValidExtension) {
          return {
            valid: false,
            message: 'Document must be PDF format only'
          };
        }
      }

      return { valid: true, size: contentLength, contentType };

    } catch (error) {
      return {
        valid: false,
        message: `Unable to validate file: ${error.message}`
      };
    }
  };

  // Function to validate A4 page size
  const validateA4Size = (page) => {
    const { width, height } = page.getSize();

    // A4 dimensions in points (72 points per inch)
    // A4 = 210mm x 297mm = 8.27" x 11.69" = 595.28 x 841.89 points
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;

    // Allow small tolerance for rounding differences
    const tolerance = 5;

    const isA4Portrait = Math.abs(width - A4_WIDTH) <= tolerance && Math.abs(height - A4_HEIGHT) <= tolerance;
    const isA4Landscape = Math.abs(width - A4_HEIGHT) <= tolerance && Math.abs(height - A4_WIDTH) <= tolerance;

    return {
      isA4: isA4Portrait || isA4Landscape,
      isPortrait: isA4Portrait,
      isLandscape: isA4Landscape,
      actualWidth: width,
      actualHeight: height,
      expectedWidth: A4_WIDTH,
      expectedHeight: A4_HEIGHT
    };
  };

  // Determine logo source and validate
  let logoSource = null;
  let useDefaultLogo = true;

  if (isValidUrl(Logo)) {
    const logoValidation = await validateFile(Logo, 'logo', 10);
    if (logoValidation.valid) {
      logoSource = Logo;
      useDefaultLogo = false;
    } else {
      console.log(`Logo validation failed for ${Logo}: ${logoValidation.message}. Using default logo.`);
    }
  }

  // Set default logo path
  const defaultLogoPath = path.join(__dirname, '../uploads/Soft_Trails.jpeg');
  if (useDefaultLogo) {
    logoSource = defaultLogoPath;
  }

  // Validate upload file if provided
  if (isValidUrl(Upload_file)) {
    const docValidation = await validateFile(Upload_file, 'document', 10);
    if (!docValidation.valid) {
      return res.status(400).json({
        success: false,
        message: `Document validation failed: ${docValidation.message}`
      });
    }
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if RFP ID already exists
    const checkQuery = 'SELECT * FROM rfp_info WHERE rfp_id = $1';
    const checkResult = await client.query(checkQuery, [rfp_id]);

    if (checkResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'RFP with this ID already exists. Please use a unique RFP ID.'
      });
    }

    // Download and validate logo file
    let logoBuffer;

    if (useDefaultLogo) {
      // Use local default logo
      if (!fs.existsSync(logoSource)) {
        console.log('Default logo not found at:', logoSource);
        logoBuffer = null;
      } else {
        logoBuffer = fs.readFileSync(logoSource);
      }
    } else {
      // Download logo from URL
      try {
        const logoRes = await axios.get(logoSource, { responseType: 'arraybuffer', timeout: 15000 });
        logoBuffer = logoRes.data;

        // Double-check size after download
        if (logoBuffer.byteLength > 2 * 1024 * 1024) {
          console.log('Downloaded logo too large, using default logo');
          logoBuffer = fs.existsSync(defaultLogoPath) ? fs.readFileSync(defaultLogoPath) : null;
        }
      } catch (error) {
        console.log(`Failed to download logo from ${logoSource}: ${error.message}. Using default logo.`);
        logoBuffer = fs.existsSync(defaultLogoPath) ? fs.readFileSync(defaultLogoPath) : null;
      }
    }

    // Download and validate PDF file
    let existingPdfBuffer;
    if (isValidUrl(Upload_file)) {
      try {
        const pdfRes = await axios.get(Upload_file, { responseType: 'arraybuffer', timeout: 15000 });
        existingPdfBuffer = pdfRes.data;

        // Double-check size after download
        if (existingPdfBuffer.byteLength > 10 * 1024 * 1024) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `PDF file too large: ${(existingPdfBuffer.byteLength / (1024 * 1024)).toFixed(2)}MB. Maximum allowed: 10MB`
          });
        }
      } catch (error) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Failed to download PDF: ${error.message}`
        });
      }
    }

    // Load background template from local folder
    const templatePath = path.join(__dirname, '../uploads/RFP_Template.pdf');

    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        message: 'RFP background template not found. Please ensure RFP_Template.pdf exists in uploads folder.'
      });
    }

    // Load the background template
    const templateBytes = fs.readFileSync(templatePath);
    const newPdf = await PDFDocument.load(templateBytes);

    // Get the first page (background template)
    const pages = newPdf.getPages();
    const page = pages[0];

    // Validate A4 size
    const sizeValidation = validateA4Size(page);

    if (!sizeValidation.isA4) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Template is not A4 size. Current size: ${sizeValidation.actualWidth.toFixed(2)} x ${sizeValidation.actualHeight.toFixed(2)} points. Expected A4: ${sizeValidation.expectedWidth} x ${sizeValidation.expectedHeight} points.`
      });
    }

    // Log the orientation for debugging
    console.log(`Template is A4 ${sizeValidation.isPortrait ? 'Portrait' : 'Landscape'}`);

    // Embed fonts for text overlay
    const fontBold = await newPdf.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await newPdf.embedFont(StandardFonts.Helvetica);

    // === DYNAMIC CONTENT OVERLAY ON BACKGROUND ===

    // Parse Organization_Name to extract company name and address
    // const orgLines = Organization_Name ? Organization_Name.split(/[,\n]/).map(line => line.trim()).filter(line => line) : ['Organization Name'];
    const rawOrg = Organization_Name.replace(/\/n/g, '\n');
    const orgLines = rawOrg
      .split(/[,\n]/)
      .map(line => line.trim())
      .filter(line => line);

    // First line is company name, rest are address details
    const companyName = orgLines[0] || 'Higher India Private Limited';
    const addressLines = orgLines.slice(1);


    // RFP:ID
    page.drawText(`RFP ID : ${rfp_id}`, {
      x: 30,
      y: 800,
      size: 14,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Company Name/Organization (top left area) - coordinates may need adjustment based on your template
    page.drawText(companyName, {
      x: 40,
      y: 650,
      size: 14,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Default address if not provided
    const defaultAddress = [
      '2/1 Rajpur road Survey Chowk,',
      'Dehradun. 248001'
    ];

    const finalAddressLines = addressLines.length > 0 ? addressLines : defaultAddress;

    // Dynamic Address lines

    let yPos = 630;
    const linespacing = 20
    finalAddressLines.forEach((line) => {
      if (line && yPos > 580) {  // lower threshold
        page.drawText(line, {
          x: 40,
          y: yPos,
          size: 14,
          font: fontRegular,
          color: rgb(0.1, 0.1, 0.1),
        });
        yPos -= linespacing;
      }
    });


    // Current date
    const currentDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    page.drawText(currentDate, {
      x: 40,
      y: yPos - 5,
      size: 14,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Request for Proposal
    page.drawText("Request For Proposal (RFP)", {
      x: 40,
      y: 460,
      size: 26,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Project Title Section - Adjust coordinates based on your template
    page.drawText(Title || 'Project Title', {
      x: 40,
      y: 400,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Process Additional Description
    let descriptionText;

    if (Additional_Description) {
      if (typeof Additional_Description === 'string') {
        descriptionText = Additional_Description.trim();
      } else if (typeof Additional_Description === 'object' && Additional_Description.description) {
        descriptionText = Additional_Description.description.trim();
      } else {
        descriptionText = 'No additional description provided.';
      }
    } else {
      descriptionText = 'No additional description provided.';
    }


    // Split description into lines for proper formatting
    const words = descriptionText.split(' ');
    const lines = [];
    let currentLine = '';
    const maxCharsPerLine = 55; // Adjust based on your template layout

    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
      if (testLine.length > maxCharsPerLine && currentLine) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Display description lines - Adjust coordinates based on your template
    let yPosition = 370;
    lines.slice(0, 6).forEach((line) => {
      page.drawText(line, {
        x: 40,
        y: yPosition,
        size: 14,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1),
      });
      yPosition -= 14;
    });

    // RFP Dates section - Adjust coordinates based on your template
    page.drawText(`RFP open date :  ${Start_Date || ''}`, {
      x: 40,
      y: 140,
      size: 14,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText(`RFP end date :   ${End_Date || ''}`, {
      x: 40,
      y: 120,
      size: 14,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Company Logo (if available) - Position at top right, left side of gray line
    if (logoBuffer) {
      try {
        // let logoImageType;

        if (useDefaultLogo) {
          // Determine file type from default logo path
          const defaultLogoLower = defaultLogoPath.toLowerCase();
          if (defaultLogoLower.endsWith('.png')) {
            logoImage = await newPdf.embedPng(logoBuffer);
          } else if (defaultLogoLower.endsWith('.jpg') || defaultLogoLower.endsWith('.jpeg')) {
            logoImage = await newPdf.embedJpg(logoBuffer);
          }
        } else {
          // Determine file type from URL
          const logoLower = logoSource.toLowerCase();
          if (logoLower.endsWith('.png')) {
            logoImage = await newPdf.embedPng(logoBuffer);
          } else if (logoLower.endsWith('.jpg') || logoLower.endsWith('.jpeg')) {
            try {
              logoImage = await newPdf.embedJpg(logoBuffer);
            } catch (jpgError) {
              // Fallback: try to convert to PNG if JPG embedding fails
              logoImage = await newPdf.embedPng(logoBuffer);
            }
          } else if (logoLower.endsWith('.svg')) {
            // Convert SVG to PNG using sharp
            const pngBuffer = await sharp(logoBuffer).png().toBuffer();
            logoImage = await newPdf.embedPng(pngBuffer);
          }
        }

        if (logoImage) {
          // Position logo at top right, left side of gray line
          const pageWidth = page.getSize().width;
          const logoWidth = 150;
          const logoHeight = 40;
          // Increased size for better visibility
          const grayLineOffset = 40; // Distance from right edge where gray line might be

          page.drawImage(logoImage, {
            x: pageWidth - grayLineOffset - logoWidth - 200, // Position left of gray line
            y: 720, // Top area of the page
            width: logoWidth,
            height: logoHeight,
          });
        }
      } catch (error) {
        console.log('Logo embedding failed:', error.message);
        // Continue without logo if embedding fails
      }
    }

    // Softrail logo - Place at top right, right side of gray line
    const softrailLogoPath = path.join(__dirname, '../uploads/softrail_logo.png');

    if (fs.existsSync(softrailLogoPath)) {
      try {
        const softrailLogoBytes = fs.readFileSync(softrailLogoPath);
        const softrailLogo = await newPdf.embedPng(softrailLogoBytes);

        const pageWidth = page.getSize().width;
        const logoSize = 35;

        page.drawImage(softrailLogo, {
          x: pageWidth - logoSize - 20, // Right side, with some margin from edge
          y: 750, // Top area of the page
          width: logoSize,
          height: logoSize,
        });
      } catch (error) {
        console.log('Softrail logo embedding failed:', error.message);
        // Continue without softrail logo if embedding fails
      }
    } else {
      console.log('Softrail logo not found at:', softrailLogoPath);
    }

    // Append uploaded PDF (if exists)
    if (existingPdfBuffer) {
      try {
        const existingPdf = await PDFDocument.load(existingPdfBuffer);
        const copiedPages = await newPdf.copyPages(existingPdf, existingPdf.getPageIndices());
        copiedPages.forEach((p) => newPdf.addPage(p));
      } catch (error) {
        console.log('PDF appending failed:', error.message);
        // Continue without appending if it fails
      }
    }

    // Save the final PDF
    const finalPdfBytes = await newPdf.save();

    // Ensure upload directory exists
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Write PDF file
    const pdfFileName = `${rfp_id}.pdf`;
    const pdfFilePath = path.join(uploadDir, pdfFileName);
    fs.writeFileSync(pdfFilePath, finalPdfBytes);

    // Generate file URL
    const baseURL = req.protocol + '://' + req.get('host');
    const rfpFileLink = `${baseURL}/uploads/${pdfFileName}`;

    // Insert into database
    const insertQuery = `
    INSERT INTO developer.rfp_info (
      rfp_id,
      organization_name,
      logo_file_link,
      title,
      rfp_start_date,
      rfp_end_date,
      upload_file_link,
      rfp_file_link,
      additional_description
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;

    await client.query(insertQuery, [
      rfp_id,
      Organization_Name,
      isValidUrl(Logo) ? Logo : null, // Store original logo URL only if valid
      Title,
      Start_Date,
      End_Date,
      isValidUrl(Upload_file) ? Upload_file : null, // Store original upload URL only if valid
      rfpFileLink,
      Additional_Description,
    ]);

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'RFP created successfully',
      data: {
        rfp_id,
        rfp_file_link: rfpFileLink,
        organization_name: Organization_Name,
        title: Title,
        start_date: Start_Date,
        end_date: End_Date,
        template_format: sizeValidation.isPortrait ? 'A4 Portrait' : 'A4 Landscape',
        logo_used: useDefaultLogo ? 'default' : 'provided'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in create_rfp:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate and save RFP document',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});


// API TO PREVIEW THE GENERATED DOCUMENTS

router.get('/preview_rfp/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, '../uploads', filename);

  // Check if file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Set appropriate content type based on file extension (example for pdf, png, jpg)
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.pdf':
        res.contentType('application/pdf');
        break;
      case '.png':
        res.contentType('image/png');
        break;
      case '.jpg':
      case '.jpeg':
        res.contentType('image/jpeg');
        break;
      case '.doc':
      case '.docx':
        res.contentType('application/msword');
        break;
      default:
        res.contentType('application/octet-stream');
    }

    // Stream file to response
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});


// API TO UPDATE RFP 


router.put('/update_rfp/:rfp_id', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rfp_id } = req.params;
    const {
      Title,
      rfp_start_date,
      rfp_end_date,
      upload_file_link,
      additional_description,
    } = req.body;


    const missingFields = [];

    if (!Title) missingFields.push('Title');
    if (!rfp_start_date) missingFields.push('Start Date');
    if (!rfp_end_date) missingFields.push('End Date');
    if (!upload_file_link) missingFields.push('Uploaded File');
    if (!additional_description || Object.keys(additional_description).length === 0) {
      missingFields.push('Description');
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required field(s): ${missingFields.join(', ')}`
      });
    }

    // Fetch existing RFP data
    const checkResult = await client.query('SELECT * FROM rfp_info WHERE rfp_id = $1', [rfp_id]);
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'RFP not found' });
    }

    const existingRfp = checkResult.rows[0];

    // Helper: Validate URL
    const isValidUrl = (url) => {
      if (!url || typeof url !== 'string' || url.trim() === '') return false;
      try {
        new URL(url.trim());
        return true;
      } catch {
        return false;
      }
    };

    // Helper: Get file extension
    const getFileExtension = (url) => {
      try {
        const pathname = new URL(url).pathname;
        return pathname.split('.').pop().toLowerCase();
      } catch {
        return '';
      }
    };

    // Helper: Detect image format from buffer
    const detectImageFormat = (buffer) => {
      if (!buffer || buffer.length < 8) return null;

      // PNG signature
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'png';
      }

      // JPEG signature
      if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'jpeg';
      }

      // SVG (check for XML declaration or <svg tag)
      const start = buffer.slice(0, 100).toString('utf8').toLowerCase();
      if (start.includes('<svg') || start.includes('<?xml')) {
        return 'svg';
      }

      return null;
    };

    // Helper: Convert SVG to PNG
    const convertSvgToPng = async (svgBuffer, width = 150, height = 40) => {
      try {
        const sharp = require('sharp');
        return await sharp(svgBuffer)
          .resize({ width, height, fit: 'inside' }) // maintains aspect ratio
          .png()
          .toBuffer();
      } catch (error) {
        console.warn('SVG conversion failed, trying alternative method:', error.message);
        throw new Error('SVG conversion not available');
      }
    };

    // Validate document file if a new one is provided
    const validateFile = async (url, maxSizeMB = 10) => {
      try {
        const response = await axios.head(url, { timeout: 10000 });
        const contentLength = parseInt(response.headers['content-length'] || '0');
        const contentType = response.headers['content-type'] || '';
        const maxSizeBytes = maxSizeMB * 1024 * 1024;

        const isPdf = contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf');

        if (!isPdf) return { valid: false, message: 'Document must be PDF format' };
        if (contentLength > maxSizeBytes) {
          return { valid: false, message: `File too large: ${(contentLength / (1024 * 1024)).toFixed(2)}MB (max ${maxSizeMB}MB)` };
        }

        return { valid: true };
      } catch (error) {
        return { valid: false, message: `File validation failed: ${error.message}` };
      }
    };

    // Use provided values or keep existing ones (partial updates)
    const Start_Date = rfp_start_date ?? existingRfp.rfp_start_date;
    const End_Date = rfp_end_date ?? existingRfp.rfp_end_date;
    const Additional_Description = additional_description ?? existingRfp.additional_description;

    // Logo always comes from existing RFP record - no changes allowed in PUT
    const Logo = existingRfp.logo_file_link;


    // Handle upload_file_link validation and update
    let Upload_file = existingRfp.upload_file_link; // Keep existing by default
    if (upload_file_link) {
      const docValidation = await validateFile(upload_file_link);
      if (!docValidation.valid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: docValidation.message });
      }
      Upload_file = upload_file_link; // Update with new file
    }

    // Handle logo processing - always from database
    let logoBuffer;
    let logoFormat = null;
    let logoContentType = '';

    // Only process logo if it exists in database
    if (isValidUrl(Logo)) {
      try {
        const logoRes = await axios.get(Logo, {
          responseType: 'arraybuffer',
          timeout: 15000
        });
        logoBuffer = Buffer.from(logoRes.data);
        logoContentType = logoRes.headers['content-type'] || '';

        // Detect format from content-type or URL extension
        if (logoContentType.includes('image/png') || Logo.toLowerCase().endsWith('.png')) {
          logoFormat = 'png';
        } else if (logoContentType.includes('image/jpeg') || logoContentType.includes('image/jpg') ||
          Logo.toLowerCase().endsWith('.jpg') || Logo.toLowerCase().endsWith('.jpeg')) {
          logoFormat = 'jpeg';
        } else if (logoContentType.includes('image/svg') || Logo.toLowerCase().endsWith('.svg')) {
          logoFormat = 'svg';
        } else {
          // Fallback to buffer detection
          logoFormat = detectImageFormat(logoBuffer);
        }

      } catch (logoError) {
        console.warn('Logo download failed from database URL:', logoError.message);
        // Set to null if logo from database fails to load
        logoBuffer = null;
        logoFormat = null;
      }
    } else {
      console.warn('No valid logo URL found in database for RFP:', rfp_id);
    }

    // Handle uploaded PDF buffer
    let existingPdfBuffer;
    if (isValidUrl(Upload_file)) {
      try {
        const pdfRes = await axios.get(Upload_file, { responseType: 'arraybuffer', timeout: 15000 });
        existingPdfBuffer = pdfRes.data;
      } catch (error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: `PDF download failed: ${error.message}` });
      }
    }

    // Load RFP template
    const templatePath = path.join(__dirname, '../uploads/RFP_Template.pdf');
    if (!fs.existsSync(templatePath)) {
      await client.query('ROLLBACK');
      return res.status(500).json({ success: false, message: 'RFP template missing in uploads/' });
    }

    const templateBytes = fs.readFileSync(templatePath);
    const newPdf = await PDFDocument.load(templateBytes);
    const page = newPdf.getPages()[0];

    // Validate template size (A4)
    const validateA4Size = ({ width, height }) => {
      const A4_WIDTH = 595.28;
      const A4_HEIGHT = 841.89;
      const tolerance = 5;
      return (
        (Math.abs(width - A4_WIDTH) <= tolerance && Math.abs(height - A4_HEIGHT) <= tolerance) ||
        (Math.abs(width - A4_HEIGHT) <= tolerance && Math.abs(height - A4_WIDTH) <= tolerance)
      );
    };

    if (!validateA4Size(page.getSize())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Template is not A4 size.' });
    }

    // Prepare fonts
    const fontBold = await newPdf.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await newPdf.embedFont(StandardFonts.Helvetica);

    // Dynamic text overlay
    const rawOrg = existingRfp.organization_name.replace(/\/n/g, '\n');
    const orgLines = rawOrg.split(/[,\n]/).map(line => line.trim()).filter(Boolean);
    const companyName = orgLines[0] || 'Higher India Private Limited';
    const addressLines = orgLines.slice(1).length > 0 ? orgLines.slice(1) : ['2/1 Rajpur road Survey Chowk,', 'Dehradun. 248001'];

    page.drawText(`RFP ID : ${rfp_id}`, { x: 30, y: 800, size: 14, font: fontBold });
    page.drawText(companyName, { x: 40, y: 650, size: 14, font: fontBold });

    let yPos = 630;
    addressLines.forEach((line) => {
      page.drawText(line, { x: 40, y: yPos, size: 14, font: fontRegular });
      yPos -= 20;
    });

    page.drawText(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), {
      x: 40, y: yPos - 5, size: 14, font: fontRegular,
    });

    page.drawText('Request For Proposal (RFP)', { x: 40, y: 460, size: 26, font: fontBold });
    page.drawText(existingRfp.title || 'Project Title', { x: 40, y: 400, size: 16, font: fontBold });

    const descriptionText = typeof Additional_Description === 'string'
      ? Additional_Description.trim()
      : (Additional_Description?.description?.trim() || Additional_Description?.notes?.trim() || 'No additional description provided.');

    const words = descriptionText.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).length > 55) {
        lines.push(line);
        line = word;
      } else {
        line += (line ? ' ' : '') + word;
      }
    }
    if (line) lines.push(line);

    let y = 370;
    lines.slice(0, 6).forEach(l => {
      page.drawText(l, { x: 40, y, size: 14, font: fontRegular });
      y -= 14;
    });

    page.drawText(`RFP open date :  ${Start_Date}`, { x: 40, y: 140, size: 14, font: fontBold });
    page.drawText(`RFP end date :   ${End_Date}`, { x: 40, y: 120, size: 14, font: fontBold });

    // Embed logo from database (multi-format support)
    if (logoBuffer && logoFormat) {
      try {
        let logoImage;
        let processedLogoBuffer = logoBuffer;

        switch (logoFormat) {
          case 'png':
            processedLogoBuffer = await sharp(logoBuffer).resize(150, 40).toBuffer();
            logoImage = await newPdf.embedPng(processedLogoBuffer);
            break;

          case 'jpeg':
            processedLogoBuffer = await sharp(logoBuffer).resize(150, 40).toBuffer();
            logoImage = await newPdf.embedJpg(processedLogoBuffer);
            break;

          case 'svg':
            try {
              // Convert SVG to PNG
              processedLogoBuffer = await convertSvgToPng(logoBuffer, 150, 40);
              logoImage = await newPdf.embedPng(processedLogoBuffer);
            } catch (svgError) {
              console.warn('SVG conversion failed:', svgError.message);
              logoImage = null;
            }
            break;

          default:
            // Try PNG first, then JPEG as fallback
            try {
              logoImage = await newPdf.embedPng(logoBuffer);
            } catch {
              try {
                logoImage = await newPdf.embedJpg(logoBuffer);
              } catch {
                console.warn('Unknown logo format, skipping logo embedding');
                logoImage = null;
              }
            }
        }

        // Draw the logo if successfully embedded
        if (logoImage) {
          console.log("Logo embedded successfully from database");
          // Position logo at top right
          const pageWidth = page.getSize().width;
          const logoWidth = 150;
          const logoHeight = 40;
          const grayLineOffset = 40;

          page.drawImage(logoImage, {
            x: pageWidth - grayLineOffset - logoWidth - 200,
            y: 720,
            width: logoWidth,
            height: logoHeight,
          });
        }

      } catch (logoError) {
        console.warn('Logo embedding failed:', logoError.message);
        // Continue without logo rather than failing the entire operation
      }
    } else {
      console.warn('No logo available for embedding - either no URL in database or download failed');
    }


    // Append user PDF if provided
    if (existingPdfBuffer) {
      try {
        const appendPdf = await PDFDocument.load(existingPdfBuffer);
        const copiedPages = await newPdf.copyPages(appendPdf, appendPdf.getPageIndices());
        copiedPages.forEach(p => newPdf.addPage(p));
      } catch (pdfError) {
        console.warn('PDF appending failed:', pdfError.message);
      }
    }

    // Save and write PDF
    const pdfBytes = await newPdf.save();
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const pdfFilePath = path.join(uploadDir, `${rfp_id}.pdf`);
    fs.writeFileSync(pdfFilePath, pdfBytes);

    const baseURL = `${req.protocol}://${req.get('host')}`;
    const rfpFileLink = `${baseURL}/uploads/${rfp_id}.pdf`;

    // Update database - logo_file_link remains unchanged
    const updateResult = await client.query(`
      UPDATE rfp_info SET 
        Title = $1,
        rfp_start_date = $2,
        rfp_end_date = $3,
        upload_file_link = $4,
        rfp_file_link = $5,
        additional_description = $6,
        updated_at = NOW()
      WHERE rfp_id = $7
      RETURNING *`,
      [Title, Start_Date, End_Date, isValidUrl(Upload_file) ? Upload_file : null, rfpFileLink, Additional_Description, rfp_id]
    );

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      message: 'RFP updated successfully',
      data: {
        rfp_id,
        rfp_file_link: rfpFileLink,
        organization_name: existingRfp.organization_name,
        title: existingRfp.title,
        rfp_start_date: Start_Date,
        rfp_end_date: End_Date,
        logo_used: Logo, // This is from database, unchanged
        logo_format: logoFormat,
        updated_rfp: updateResult.rows[0],
      }
    });

  }
  catch (error) {
    await client.query('ROLLBACK');
    console.error('Update RFP error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
  finally {
    client.release();
  }
});




// get request to get all the created rfps


router.get('/receive_rfp', async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query("SELECT * FROM rfp_info ORDER BY id ASC ")
    res.json(result.rows);

  }
  catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    client.release();
  }
})


// GET RFP REQUEST WITH PARTICULAR RFP_ID 

router.get('/receive_rfp/:rfp_id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rfp_id } = req.params;

    const queryResult = await client.query("SELECT * FROM rfp_info WHERE rfp_id = $1", [rfp_id]);

    if (queryResult.rows.length === 0) {
      return res.status(404).json({ message: "RPF request not found" });
    }
    res.json(queryResult.rows)
  }

  catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error", details: error.message });
  } finally {
    client.release();
  }

})


const disposableDomains = [
  'tempmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'mailinator.com',
  // Add more from a source like https://github.com/disposable-email-domains/disposable-email-domains
];

router.post('/send_rfp_mail', async (req, res) => {
   const rfp_id = res.params
  const { to, subject, html } = req.body


  const missingFields = [];

   // Step 1: Check for Missing Fields
  if (!to || to.trim === '') {
    missingFields.push("Sender Email is Missing")
  }
  if (!subject || subject.trim === '') {
    missingFields.push('Subject for the mail is missing')
  }

  if (!html || html.trim === "") {
    missingField.push('RFP details are missing')
  }
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false, message: `Missing required fields: ${missingFields.join(', ')}`,
      missingFields: missingFields
    });
  }


   // Step 2: Check for Entred Email is valid or not

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let emails = [];

  // Handle multiple emails (comma-separated or array)
  if (Array.isArray(to)) {
    emails = to.map(email => email.trim()).filter(email => email !== '');
  } else if (typeof to === 'string') {
    emails = to.split(',').map(email => email.trim()).filter(email => email !== '');
  }


  // Validate each email
  const invalidEmails = [];
  emails.forEach(email => {
    if (!emailRegex.test(email)) {
      invalidEmails.push(email);
    }
  });

  if (invalidEmails.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid email format: ${invalidEmails.join(', ')}`
    });
  }

    // Step 3: Check for disposable emails
  const disposableEmails = [];
  emails.forEach(email => {
    const domain = email.split('@')[1].toLowerCase();
    if (disposableDomains.includes(domain)) {
      disposableEmails.push(email);
    }
  });
  if (disposableEmails.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Disposable emails not allowed: ${disposableEmails.join(', ')}`,
    });
  }
 


  try {
    await sendMail(to, subject, html);
    res.status(200).json({ success: true, message: "Email send successfully" })
  }

  catch (error) {
    console.error('Email sending error:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }

})

module.exports = router;