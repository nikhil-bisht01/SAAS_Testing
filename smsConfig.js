const axios = require('axios');
require('dotenv').config();

// Function to send SMS
const sendSMS = async (to, message) => {
  const url = 'https://www.fast2sms.com/dev/bulkV2';
  const headers = {
    'authorization': "d2EIPUTmGuwV3N9KX5FbcesLD8WjSMifJ1ptCnZAaY0gyOBQ76Q4PfnNT2o3vgklEwAXVKhSZUe01cd9", // Replace with your Fast2SMS API key
    'Content-Type': 'application/json',
  };

  const data = {
    sender_id: 'FSTSMS',
    message: message,
    language: 'english',
    route: 'p',
    numbers:to,  // Numbers should be a comma-separated string
  };

  try {
    const response = await axios.post(url, data, { headers });
    console.log('SMS sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending SMS:', error);
    console.log(error.message);
    throw new Error('Failed to send SMS');
  }
};

module.exports = sendSMS;
