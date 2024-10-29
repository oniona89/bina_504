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
  
Message: ${message}`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
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
    const signalData = JSON.parse(completion);

    console.log("Parsed Signal Data from ChatGPT:", signalData);
    return signalData;
  } catch (error) {
    console.error("Error fetching signal data from ChatGPT:", error.response ? error.response.data : error.message);
    return null;
  }
}

module.exports = {
  parseSignalUsingChatGPT,
};
