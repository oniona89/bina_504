const fs = require('fs');
const path = require('path');

function parseSignal(message) {
  const signalData = {};

  // Regex patterns to match relevant data
  const positionPattern = /(LONG|SHORT)/i;
  const symbolPattern = /(\w+\/USDT)/i;
  const entryPricePattern = /price\s?\$?([\d.]+)(?:-(\d+.\d+))?/i; // Handle single price or range
  const targetPattern = /🎯\$?([\d.]+)/g;
  const leveragePattern = /Leverage\s*:\s*(\d+)(?:x)?(?:-(\d+)(?:x)?)?/i; // Updated leverage pattern
  const stopLossPattern = /(?:STOP[-\s]?LOSS|⛔️)\s*:\s*\$?([\d.]+)/i;

  // Extract position type (LONG or SHORT)
  const positionMatch = message.match(positionPattern);
  if (positionMatch) {
    signalData.position = positionMatch[1].toUpperCase();
    console.log(`Parsed Position: ${signalData.position}`);
  } else {
    console.log('Position not found.');
  }

  // Extract trading symbol (e.g., BCH/USDT)
  const symbolMatch = message.match(symbolPattern);
  if (symbolMatch) {
    signalData.symbol = symbolMatch[1].toUpperCase();
    console.log(`Parsed Symbol: ${signalData.symbol}`);
  } else {
    console.log('Symbol not found.');
  }

  // Extract entry price range or single price and adjust if necessary
  const entryPriceMatch = message.match(entryPricePattern);
  if (entryPriceMatch) {
    const price = parseFloat(entryPriceMatch[1]);
    const maxPrice = entryPriceMatch[2] ? parseFloat(entryPriceMatch[2]) : price + 0.9; // Add range if single price
    signalData.entryPriceRange = `${price.toFixed(2)}-${maxPrice.toFixed(2)}`;
    console.log(`Parsed Entry Price Range: ${signalData.entryPriceRange}`);
  } else {
    console.log('Entry Price not found.');
  }

  // Extract all target prices
  const targets = [];
  let targetMatch;
  while ((targetMatch = targetPattern.exec(message)) !== null) {
    targets.push(parseFloat(targetMatch[1]));
  }
  signalData.targets = targets;
  console.log(`Parsed Targets: ${signalData.targets.join(', ') || 'None'}`);

  // Extract leverage and handle both single value and range
  const leverageMatch = message.match(leveragePattern);
  if (leverageMatch) {
    const minLeverage = parseInt(leverageMatch[1], 10);
    const maxLeverage = leverageMatch[2] ? parseInt(leverageMatch[2], 10) : minLeverage; // Use minLeverage if max is not provided
    signalData.leverage = Math.round((minLeverage + maxLeverage) / 2); // Average of the range or single value
    console.log(`Parsed Leverage: x${signalData.leverage}`);
  } else {
    console.log('Leverage not found.');
  }

  // Extract stop loss
  const stopLossMatch = message.match(stopLossPattern);
  if (stopLossMatch) {
    signalData.stopLoss = parseFloat(stopLossMatch[1]);
    console.log(`Parsed Stop Loss: ${signalData.stopLoss}`);
  } else {
    console.log('Stop Loss not found.');
  }

  return signalData;
}


module.exports = {
  parseSignal,
  saveSignalToFile
};
