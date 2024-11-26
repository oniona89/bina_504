const axios = require('axios');
const { logMessage } = require('./logger');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function parseSignalUsingChatGPT(message) {
  const prompt = `You are a trading assistant. Please parse the following signal message and extract the signal data in a JSON format with the following fields:
  {
    "position": "LONG" or "SHORT", // The position to take (LONG for buying, SHORT for selling)
    "symbol": "symbol/USDT", // The trading pair, e.g. "BTC/USDT"
    "entryPriceRange": "minPrice-maxPrice", // The acceptable price range for entry, e.g. "30000-30500"
    "targets": [target1, target2, ...], // Array of target prices to reach for take-profit
    "leverage": leverage, // Leverage for the trade, an integer (if a range, return the average leverage and math floor it to an integer )
    "stopLoss": stopLoss // The stop-loss price for the trade
  }
  
  Please make sure the output is strictly valid JSON, no extra text, only the JSON data.
  If the data is incomplete or ambiguous, try your best to make reasonable assumptions.
  Message: ${message}`;

  // Retry logic parameters
  const maxRetries = 3;
  let attempt = 0;
  let response;

  while (attempt < maxRetries) {
    try {
      response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4', // You can switch to 'gpt-4-turbo' if you prefer
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Log the full response to inspect
      logMessage(`Full response from OpenAI API: ${response.data}`);

      // Try parsing the response as JSON
      const completion = response.data.choices[0].message.content.trim();

      // Attempt to parse the response as valid JSON
      try {
        const signalData = JSON.parse(completion);
        logMessage(`Parsed Signal Data from ChatGPT: ${signalData}`);
        return signalData;
      } catch (jsonError) {
        console.error("Error parsing JSON from ChatGPT response:", jsonError);
        logMessage(`Received non-JSON response: ${completion}`);
      }

      // If parsing failed, retry
      attempt++;
      logMessage(`Retry attempt ${attempt}...`);
    } catch (error) {
      console.error("Error fetching signal data from OpenAI API:", error.response ? error.response.data : error.message);
      attempt++;
      logMessage(`Retry attempt ${attempt}...`);
    }
  }

  console.error("Failed to parse a valid JSON response after multiple attempts.");
  return null;
}

// Fallback function to parse the response manually if JSON parsing fails
function extractSignalDataFromText(text) {
  const signalData = {};

  const positionMatch = text.match(/position\s*:\s*"(LONG|SHORT)"/i);
  const symbolMatch = text.match(/symbol\s*:\s*"(.*?)"/i);
  const entryRangeMatch = text.match(/entryPriceRange\s*:\s*"(.*?)"/i);
  const targetsMatch = text.match(/targets\s*:\s*\[(.*?)\]/i);
  const leverageMatch = text.match(/leverage\s*:\s*(\d+)/i);
  const stopLossMatch = text.match(/stopLoss\s*:\s*([\d.]+)/i);

  if (positionMatch) signalData.position = positionMatch[1];
  if (symbolMatch) signalData.symbol = symbolMatch[1];
  if (entryRangeMatch) signalData.entryPriceRange = entryRangeMatch[1];
  if (targetsMatch) signalData.targets = targetsMatch[1].split(',').map(Number);
  if (leverageMatch) signalData.leverage = parseInt(leverageMatch[1], 10);
  if (stopLossMatch) signalData.stopLoss = parseFloat(stopLossMatch[1]);

  logMessage(`Extracted Signal Data: ${signalData}`);
  return signalData;
}

module.exports = {
  parseSignalUsingChatGPT,
};
