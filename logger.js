// logger.js
const fs = require('fs');
const path = require('path');

// Log file path
const logFilePath = path.join(__dirname, 'binanceLog.txt');

// Function to send a message to Telegram
async function sendTelegramMessage(client, logOutputGroupEntity, message) {
  try {
    await client.sendMessage(logOutputGroupEntity, { message });
    console.log(`Sent message to Telegram group: ${message}`);
  } catch (error) {
    console.error('Failed to send message to Telegram:', error);
  }
}

// Function to log messages to a file and optionally send to Telegram
function logMessage(message, client, logOutputGroupEntity) {
  const date = new Date();
  const formattedDate = date.toISOString();
  const logEntry = `${formattedDate} - ${message}\n`;

  // Append log to the file
  fs.appendFile(logFilePath, logEntry, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });

  // Optionally send log message to Telegram
  if (client && logOutputGroupEntity) {
    sendTelegramMessage(client, logOutputGroupEntity, message);
  }

  // Print to console for real-time feedback
  console.log(message);
}

module.exports = {
  sendTelegramMessage,
  logMessage,
};
