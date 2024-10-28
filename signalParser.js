const fs = require('fs');
const path = require('path');

function parseSignal(message) {
  const signalData = {};

  // Regex patterns to match relevant data
  const positionPattern = /(LONG|SHORT)/i;
  const symbolPattern = /(\w+\/USDT)/i;
  const entryPricePattern = /price\s?\$?([\d.]+)(?:-(\d+.\d+))?/i; // Handle single price or range
  const targetPattern = /🎯\$?([\d.]+)/g;
  const leveragePattern = /Leverage\s*:\s*(\d+)(?:x)?-(\d+)(?:x)?/i; // Handle leverage range
  const stopLossPattern = /STOP-LOSS\s?\$?([\d.]+)/i;

  // Extract position type (LONG or SHORT)
  const positionMatch = message.match(positionPattern);
  if (positionMatch) {
    signalData.position = positionMatch[1].toUpperCase();
  }

  // Extract trading symbol (e.g., BCH/USDT)
  const symbolMatch = message.match(symbolPattern);
  if (symbolMatch) {
    signalData.symbol = symbolMatch[1].toUpperCase();
  }

  // Extract entry price range or single price and adjust if necessary
  const entryPriceMatch = message.match(entryPricePattern);
  if (entryPriceMatch) {
    const price = parseFloat(entryPriceMatch[1]);
    const maxPrice = entryPriceMatch[2] ? parseFloat(entryPriceMatch[2]) : price + 0.9; // Add range if single price
    signalData.entryPriceRange = `${price.toFixed(2)}-${maxPrice.toFixed(2)}`;
  }

  // Extract all target prices
  const targets = [];
  let targetMatch;
  while ((targetMatch = targetPattern.exec(message)) !== null) {
    targets.push(parseFloat(targetMatch[1]));
  }
  signalData.targets = targets;

  // Extract leverage and calculate the average if it's a range
  const leverageMatch = message.match(leveragePattern);
  if (leverageMatch) {
    const minLeverage = parseInt(leverageMatch[1], 10);
    const maxLeverage = parseInt(leverageMatch[2], 10);
    signalData.leverage = Math.round((minLeverage + maxLeverage) / 2); // Average of the range
  }

  // Extract stop loss
  const stopLossMatch = message.match(stopLossPattern);
  if (stopLossMatch) {
    signalData.stopLoss = parseFloat(stopLossMatch[1]);
  }

  return signalData;
}

// Function to save the parsed signal data to a file
function saveSignalToFile(signalData) {
  const date = new Date();
  const formattedDate = date.toISOString(); // e.g., "2024-10-26T14:30:00.000Z"
  const filePath = path.join(__dirname, 'signals.txt');

  // Create the signal entry with formatted data
  const signalEntry = `${formattedDate} - Signal:\n` +
                      `Position: ${signalData.position}\n` +
                      `Symbol: ${signalData.symbol}\n` +
                      `Entry Price Range: ${signalData.entryPriceRange}\n` +
                      `Targets: ${signalData.targets.join(', ')}\n` +
                      `Leverage: x${signalData.leverage}\n` +
                      `Stop Loss: ${signalData.stopLoss}\n\n`;

  // Append the signal entry to the file
  fs.appendFile(filePath, signalEntry, (err) => {
    if (err) {
      console.error('Error saving signal:', err);
    } else {
      console.log('Signal saved successfully.');
    }
  });
}

module.exports = {
  parseSignal,
  saveSignalToFile
};
