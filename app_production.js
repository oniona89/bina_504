const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs');
const path = require('path');
const { parseSignalUsingChatGPT } = require('./parseSignalGPT');
const { saveSignalToFile } = require('./signalParser');
const { executeTrades, addSignal } = require('./binanceExecutor');
const { sendTelegramMessage, logMessage } = require('./logger'); // Import logMessage and sendTelegramMessage

// Replace with your API ID and Hash from my.telegram.org
const apiId = 18030888;
const apiHash = 'cba4b1a292d9cb0800e953b94cd76654';

// Log file paths
const logFilePath = path.join(__dirname, 'log.txt');
const sessionFilePath = path.join(__dirname, 'session.txt');

// Load the session from the file if it exists
let sessionString = '';
if (fs.existsSync(sessionFilePath)) {
  sessionString = fs.readFileSync(sessionFilePath, 'utf-8');
  logMessage('Session loaded from file.', null, null);
}

const stringSession = new StringSession(sessionString);

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

  logMessage('Connected to Telegram.', client, null);

  // Save the session to the file if it's not already saved
  const sessionData = client.session.save();
  if (!fs.existsSync(sessionFilePath) || sessionData !== sessionString) {
    fs.writeFileSync(sessionFilePath, sessionData);
    logMessage('Session saved to file.', client, null);
  }

  // Group IDs
  let targetGroupId, veeAnalysisGroupId;
  const targetGroupName = '@Cryptosignals_Real1';
  const veeAnalysisGroupName = -1001754775046;
  const log_output_group_username = -4522993194;
  const test_bina_2_crypto_mock = -4578127979;

  // Load entities for the target groups
  let logOutputGroupEntity;

  try {
    logOutputGroupEntity = await client.getEntity(log_output_group_username);
    logMessage('Log output group entity loaded successfully.', client, logOutputGroupEntity);
  } catch (error) {
    console.error('Error loading log output group entity:', error);
    return;
  }

  try {
    const targetGroupEntity = await client.getEntity(targetGroupName);
    targetGroupId = targetGroupEntity.id * -1;
    logMessage(`Target group (${targetGroupName}) entity loaded successfully.`, client, logOutputGroupEntity);
  } catch (error) {
    console.error('Error loading target group entity:', error);
    return;
  }

  try {
    const veeAnalysisGroupEntity = await client.getEntity(veeAnalysisGroupName);
    veeAnalysisGroupId = veeAnalysisGroupEntity.id * -1;
    logMessage(`Vee Analysis group (${veeAnalysisGroupName}) entity loaded successfully.`, client, logOutputGroupEntity);
  } catch (error) {
    console.error('Error loading Vee Analysis group entity:', error);
    return;
  }

  // Health check function to be sent every 120 seconds
  async function sendHealthCheck() {
    const healthMessage = `✅ App is running: ${new Date().toISOString()}`;
    logMessage(`Sending health check: ${healthMessage}`, client, logOutputGroupEntity);
    await sendTelegramMessage(client, logOutputGroupEntity, healthMessage);
  }

  // Start processing Binance trades
  executeTrades(client, logOutputGroupEntity);

  // Set an interval to send a health check every 120 seconds
  setInterval(sendHealthCheck, 120 * 1000);

  // Listen for messages from the target groups
  client.addEventHandler(async (update) => {
    if (update && update.message && update.message.message) {
      const message = update.message.message;
      const groupId = Number(update.message.peerId.channelId) || Number(update.message.peerId.chatId);

      if ([targetGroupId, veeAnalysisGroupId, test_bina_2_crypto_mock].includes(groupId * -1)) {
        logMessage(`New message from group: ${message}`, client, logOutputGroupEntity);

        // Process messages as signals if from target groups
        if (
          (groupId * -1) === targetGroupId ||
          (groupId * -1) === veeAnalysisGroupId ||
          (groupId * -1) === test_bina_2_crypto_mock
        ) {
          try {
            const signalData = await parseSignalUsingChatGPT(message);
            logMessage(`Parsed signal data: ${JSON.stringify(signalData)}`, client, logOutputGroupEntity);

            if (signalData && signalData.position) {
              logMessage(`Parsed Signal Data: ${JSON.stringify(signalData)}`, client, logOutputGroupEntity);
              saveSignalToFile(signalData);

              // Add the signal to the Binance executor's queue
              addSignal(signalData);
            }
          } catch (error) {
            logMessage(`Error parsing signal: ${error.message}`, client, logOutputGroupEntity);
          }
        }
      }
    }
  });
})();
