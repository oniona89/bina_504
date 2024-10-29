const fs = require('fs');
const path = require('path');

function parseSignal(message) {
  const signalData = {};

  // Regex patterns to match relevant data
  const positionPattern = /(LONG|SHORT)/i;
  const symbolPattern = /(\w+\/USDT)/i;
  const entryPricePattern = /price\s?\$?([\d.]+)(?:-(\d+.\d+))?/i;
  const targetPattern = /🎯\$?([\d.]+)/g;
  const leveragePattern = /Leverage\s*:\s*(\d+)(?:x)?(?:-(\d+)(?:x)?)?/i;
  const stopLossPattern = /(?:STOP[-\s]?LOSS|⛔️)\s*:\s*\$?([\d.]+)/i;

  // Extract position
  const positionMatch = message.match(positionPattern);
  if (positionMatch) {
    signalData.position = positionMatch[1].toUpperCase();
    console.log(`Parsed Position: ${signalData.position}`);
  }

  // Extract symbol
  const symbolMatch = message.match(symbolPattern);
  if (symbolMatch) {
    signalData.symbol = symbolMatch[1].toUpperCase();
    console.log(`Parsed Symbol: ${signalData.symbol}`);
  }

  // Extract entry price
  const entryPriceMatch = message.match(entryPricePattern);
  if (entryPriceMatch) {
    const price = parseFloat(entryPriceMatch[1]);
    const maxPrice = entryPriceMatch[2] ? parseFloat(entryPriceMatch[2]) : price + 0.9;
    signalData.entryPriceRange = `${price.toFixed(2)}-${maxPrice.toFixed(2)}`;
    console.log(`Parsed Entry Price Range: ${signalData.entryPriceRange}`);
  }

  // Extract targets
  const targets = [];
  let targetMatch;
  while ((targetMatch = targetPattern.exec(message)) !== null) {
    targets.push(parseFloat(targetMatch[1]));
  }
  signalData.targets = targets;
  console.log(`Parsed Targets: ${signalData.targets.join(', ') || 'None'}`);

  // Extract leverage
  const leverageMatch = message.match(leveragePattern);
  if (leverageMatch) {
    const minLeverage = parseInt(leverageMatch[1], 10);
    const maxLeverage = leverageMatch[2] ? parseInt(leverageMatch[2], 10) : minLeverage;
    signalData.leverage = Math.round((minLeverage + maxLeverage) / 2);
    console.log(`Parsed Leverage: x${signalData.leverage}`);
  } else {
    console.log('Leverage not found or could not be parsed.');
  }

  // Extract stop loss
  const stopLossMatch = message.match(stopLossPattern);
  if (stopLossMatch) {
    signalData.stopLoss = parseFloat(stopLossMatch[1]);
    console.log(`Parsed Stop Loss: ${signalData.stopLoss}`);
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
