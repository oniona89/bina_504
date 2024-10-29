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

  // Replace with your group's ID (ensure it's an integer)
  const targetGroupId = 1001754775046;

  // Log messages to a file
  function logMessage(message) {
    const date = new Date();
    const formattedDate = date.toISOString();
    const logEntry = `${formattedDate} - Received Message: ${message}\n\n`;

    fs.appendFile(logFilePath, logEntry, (err) => {
      if (err) {
        console.error('Error logging message:', err);
      }
    });
  }

  client.addEventHandler((update) => {
    if (update && update.message && update.message.message) {
      const message = update.message.message;
      const groupId = Number(update.message.peerId.channelId) 
      || Number(update.message.peerId.chatId);

      // Check if it's from the right group
      if (groupId === targetGroupId) {
        console.log('New message from group:', message);

        // Log the message only if it's from the target group
        logMessage(message);

        // Attempt to parse the message if it's a signal
        const signalData = parseSignal(message);
        if (signalData && signalData.position) {
          console.log('Parsed Signal Data:', signalData);

          // Save the parsed data to signals.txt
          saveSignalToFile(signalData);

          // Execute the trade using Binance API
          executeTrade(signalData);
        }
      }
    }
  });
})();
