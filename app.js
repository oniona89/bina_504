const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs');
const path = require('path');
const { parseSignal, saveSignalToFile } = require('./signalParser');
const { executeTrade } = require('./binanceExecutor'); // Import the Binance trade execution function

// Replace with your API ID and Hash from my.telegram.org
const apiId = 18030888;
const apiHash = 'cba4b1a292d9cb0800e953b94cd76654';

// Log file paths
const logFilePath = path.join(__dirname, 'log.txt');

// StringSession for saving session (so you don't need to re-login each time)
const stringSession = new StringSession('');

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
  console.log('Session:', client.session.save());

  // Replace with your group's ID (ensure it's an integer)
  const targetGroupId = 4522993194;

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
