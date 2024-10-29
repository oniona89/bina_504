const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs');
const path = require('path');
const { parseSignal, saveSignalToFile } = require('./signalParser');
const { executeTrade } = require('./binanceExecutor');

// Replace with your API ID and Hash from my.telegram.org
const apiId = 18030888;
const apiHash = 'cba4b1a292d9cb0800e953b94cd76654';

// Log file paths
const logFilePath = path.join(__dirname, 'log.txt');
const sessionFilePath = path.join(__dirname, 'session.txt'); // File to store the session string

// Load the session from the file if it exists
let sessionString = '';
if (fs.existsSync(sessionFilePath)) {
  sessionString = fs.readFileSync(sessionFilePath, 'utf-8');
  console.log('Session loaded from file.');
}

const stringSession = new StringSession(sessionString); // Initialize the session with saved data if available

(async () => {
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text('Please enter your number: '),
    password: async () => await input.text('Please enter your password: '),
    phoneCode: async () => await input.text('Please enter the code you received: '),
    onError: (err) => console.log(err),
  });

  console.log('You are now connected.');

  // Save the session to the file if it's not already saved
  const sessionData = client.session.save();
  if (!fs.existsSync(sessionFilePath) || sessionData !== sessionString) {
    fs.writeFileSync(sessionFilePath, sessionData);
    console.log('Session saved to file.');
  }

  // Group IDs
  const targetGroupId = 1001754775046;
  const log_output_group_id = 4522993194;

  // Function to send a message to the log output group
  async function sendTelegramMessage(message) {
    try {
      await client.sendMessage(log_output_group_id, { message });
      console.log(`Sent message to Telegram group: ${message}`);
    } catch (error) {
      console.error('Failed to send message to Telegram:', error);
    }
  }

  // Health check function to be sent every 10 seconds
  async function sendHealthCheck() {
    const healthMessage = `✅ App is running: ${new Date().toISOString()}`;
    console.log(`Sending health check: ${healthMessage}`); // Log before sending
    await sendTelegramMessage(healthMessage); // Await to handle async issues
  }

  // Set an interval to send a health check every 10 seconds for testing
  setInterval(sendHealthCheck, 10 * 1000); // 10 seconds for testing

  // Log messages to a file and send to Telegram
  function logMessage(message) {
    const date = new Date();
    const formattedDate = date.toISOString();
    const logEntry = `${formattedDate} - ${message}\n\n`;

    // Save the log to the file
    fs.appendFile(logFilePath, logEntry, (err) => {
      if (err) {
        console.error('Error logging message:', err);
      }
    });

    // Send the log to Telegram
    sendTelegramMessage(message);
  }

  client.addEventHandler((update) => {
    if (update && update.message && update.message.message) {
      const message = update.message.message;
      const groupId = Number(update.message.peerId.channelId) 
      || Number(update.message.peerId.chatId);

      // Check if the message is from either targetGroupId or log_output_group_id
      if (groupId === targetGroupId || groupId === log_output_group_id) {
        console.log('New message from group:', message);

        // Log the message and forward it to log_output_group_id
        logMessage(`Received message from group: ${message}`);

        // If the message is from targetGroupId, process it as a signal
        if (groupId === targetGroupId) {
          // Attempt to parse the message if it's a signal
          const signalData = parseSignal(message);
          if (signalData && signalData.position) {
            console.log('Parsed Signal Data:', signalData);

            // Log parsed signal data and save it
            logMessage(`Parsed Signal Data: ${JSON.stringify(signalData)}`);
            saveSignalToFile(signalData);

            // Execute the trade using Binance API
            executeTrade(signalData);
          }
        }
      }
    }
  });
})();
