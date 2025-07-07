const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRET_KEY = 'softtrails123'; 

function getSubscriptionData(code) {
  try {
    const filePath = path.join(__dirname, `../subscriptions_${code}.enc`);

    // Step 1: Read encrypted file as binary
    const encryptedData = fs.readFileSync(filePath);

    // Step 2: Decrypt the data
    const decryptedJson = decrypt(encryptedData, SECRET_KEY);

    if (!decryptedJson || decryptedJson.length === 0) {
      console.error('Decrypted data is empty or unreadable.');
      return null;
    }

    // Step 3: Parse the decrypted JSON
    const parsedData = JSON.parse(decryptedJson);
    return parsedData;
  } catch (error) {
    console.error('Error reading subscription data:', error);
    return null;
  }
}

// AES decryption (matches your Java logic)
function decrypt(encryptedData, secretKey) {
  try {
    const key = crypto.createHash('sha256').update(secretKey).digest().slice(0, 16); // AES-128
    const decipher = crypto.createDecipheriv('aes-128-ecb', key, null); // ECB mode, no IV
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encryptedData, null, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

module.exports = {getSubscriptionData} ;
