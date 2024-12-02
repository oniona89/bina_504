require('dotenv').config(); // Load environment variables from .env
const { logMessage } = require('./logger'); // Import logMessage
const {
  calculateQuantity,
  setLeverage,
  placeFuturesMarketOrder,
  setStopLossAndTakeProfit,
  initializeWebSocket,
  getLivePrice
} = require('./binanceHelpers'); // Import helper functions

// Helper to introduce a delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Start WebSocket on module load
initializeWebSocket();

// Signal queue for processing incoming signals dynamically
const signalQueue = [];
const activeSignals = new Set(); // Tracks active signals being processed

// Function to continuously monitor and process the signal queue
async function executeTrades(client, logOutputGroupEntity) {
  while (true) {
    // Check for new signals in the queue
    if (signalQueue.length > 0) {
      const signal = signalQueue.shift(); // Get the next signal from the queue

      // Process the signal if it's not already being handled
      if (!activeSignals.has(signal.symbol)) {
        activeSignals.add(signal.symbol);
        processSignal(signal, client, logOutputGroupEntity).finally(() => {
          activeSignals.delete(signal.symbol); // Remove from active signals once processed
        });
      }
    }

    // Delay before checking the queue again
    await delay(500); // Check queue every 500ms
  }
}

// Function to add a new signal to the queue
function addSignal(signal) {
  signalQueue.push(signal);
}

// Function to process a single signal
async function processSignal(signalData, client, logOutputGroupEntity) {
  try {
    const { position, symbol, entryPriceRange, leverage, targets, stopLoss } = signalData;

    const orderSide = position === 'LONG' ? 'BUY' : 'SELL';
    const closeOrderSide = position === 'LONG' ? 'SELL' : 'BUY'; // Opposite of entry side
    const [minPrice, maxPrice] = entryPriceRange.split('-').map(Number);
    const firstTarget = targets[0]; // Take-Profit price
    const stopLossPrice = stopLoss;

    const tradingSymbol = symbol.replace('/', '').toUpperCase(); // Ensure uppercase symbol for Binance
    logMessage(
      `Processing signal for ${symbol}: ${position} with target range ${minPrice} - ${maxPrice}`,
      client,
      logOutputGroupEntity
    );

    // Continuously check the live price until it is within the range
    let currentPrice = getLivePrice(tradingSymbol);

    while (!currentPrice || currentPrice < minPrice || currentPrice > maxPrice) {
      logMessage(
        `Current price of ${tradingSymbol} is ${currentPrice || 'null'}, not in range (${minPrice} - ${maxPrice}). Retrying...`,
        client,
        logOutputGroupEntity
      );
      await delay(5000); // Wait for 5 seconds before re-checking
      currentPrice = getLivePrice(tradingSymbol);
    }

    logMessage(
      `Price of ${tradingSymbol} is ${currentPrice}, now in range. Executing ${position} order.`,
      client,
      logOutputGroupEntity
    );

    // Set leverage
    await setLeverage(tradingSymbol, leverage || 1, client, logOutputGroupEntity);

    // Calculate quantity
    const investment = 30; // Example investment value
    const quantity = await calculateQuantity(
      tradingSymbol,
      investment,
      currentPrice,
      leverage,
      client,
      logOutputGroupEntity
    );
    logMessage(`Investment: ${investment}`, client, logOutputGroupEntity);
    logMessage(`Quantity: ${quantity}`, client, logOutputGroupEntity);

    // Place the market order
    const marketOrder = await placeFuturesMarketOrder(
      tradingSymbol,
      orderSide,
      quantity,
      client,
      logOutputGroupEntity
    );
    if (marketOrder) {
      logMessage(
        `Market order executed successfully: ${JSON.stringify(marketOrder)}`,
        client,
        logOutputGroupEntity
      );

      // Add Stop-Loss and Take-Profit orders
      await setStopLossAndTakeProfit(
        tradingSymbol,
        closeOrderSide,
        quantity,
        stopLossPrice,
        firstTarget,
        client,
        logOutputGroupEntity
      );
    }
  } catch (error) {
    logMessage(`Error processing signal for ${signalData.symbol}: ${error.message}`, client, logOutputGroupEntity);
  }
}

module.exports = {
  executeTrades,
  addSignal,
};
