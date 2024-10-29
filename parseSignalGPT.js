const axios = require('axios');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function parseSignalUsingChatGPT(message) {
  const prompt = `Parse the following message and extract the signal data as JSON with these fields: 
  - position: "LONG" or "SHORT"
  - symbol: symbol format "XXX/USDT"
  - entryPriceRange: price range in format "minPrice-maxPrice"
  - targets: array of target prices
  - leverage: integer representing leverage, average if a range
  - stopLoss: stop loss price
  
Return only valid JSON data and nothing else.
Message: ${message}`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4', // or 'gpt-4-turbo' as appropriate
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const completion = response.data.choices[0].message.content;

    // Try parsing the response as JSON
    try {
      const signalData = JSON.parse(completion);
      console.log("Parsed Signal Data from ChatGPT:", signalData);
      return signalData;
    } catch (jsonError) {
      console.error("Error parsing JSON from ChatGPT response:", jsonError);

      // Fallback to basic data extraction if JSON parsing fails
      const extractedData = extractSignalDataFromText(completion);
      return extractedData;
    }
  } catch (error) {
    console.error("Error fetching signal data from ChatGPT:", error.response ? error.response.data : error.message);
    return null;
  }
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

  console.log("Extracted Signal Data:", signalData);
  return signalData;
}

module.exports = {
  parseSignalUsingChatGPT,
};
