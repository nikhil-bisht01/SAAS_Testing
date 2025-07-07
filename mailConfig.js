const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables from .env file

// Create transporter for sending emails
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT, // Secure SMTP port
  secure: process.env.EMAIL_SECURE === 'true', // Use SSL/TLS based on env variable
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
 
// Function to send an email
const sendMail = (to, subject, html) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = sendMail;
