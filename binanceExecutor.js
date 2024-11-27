require('dotenv').config(); // Load environment variables from .env
const { logMessage } = require('./logger'); // Import logMessage
const {
  calculateQuantity,
  getCurrentPrice,
  setLeverage,
  placeFuturesMarketOrder,
  setStopLossAndTakeProfit,
} = require('./binanceHelpers'); // Import helper functions

// Helper to introduce a delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to execute trades for multiple signals
async function executeTrades(signals, client, logOutputGroupEntity) {
  try {
    // Process all signals concurrently
    await Promise.all(
      signals.map(async (signalData) => {
        try {
          const { position, symbol, entryPriceRange, leverage, targets, stopLoss } = signalData;

          const orderSide = position === 'LONG' ? 'BUY' : 'SELL';
          const closeOrderSide = position === 'LONG' ? 'SELL' : 'BUY'; // Opposite of entry side
          const [minPrice, maxPrice] = entryPriceRange.split('-').map(Number);
          const firstTarget = targets[0]; // Take-Profit price
          const stopLossPrice = stopLoss;

          const tradingSymbol = symbol.replace('/', ''); // Strip the '/' for Binance pairs
          logMessage(
            `Received trading signal for ${symbol}: ${position} with target range ${minPrice} - ${maxPrice}`,
            client,
            logOutputGroupEntity
          );

          // Continuously check the price until it is within the range
          let currentPrice = await getCurrentPrice(tradingSymbol, client, logOutputGroupEntity);
          while (currentPrice !== null && (currentPrice < minPrice || currentPrice > maxPrice)) {
            logMessage(
              `Current price of ${tradingSymbol} is ${currentPrice}, not in range (${minPrice} - ${maxPrice}). Retrying...`,
              client,
              logOutputGroupEntity
            );
            await delay(5000); // Wait for 5 seconds before re-checking
            currentPrice = await getCurrentPrice(tradingSymbol, client, logOutputGroupEntity);
          }

          logMessage(
            `Price of ${tradingSymbol} is ${currentPrice}, now in range. Executing ${position} order.`,
            client,
            logOutputGroupEntity
          );

          // Set leverage
          await setLeverage(tradingSymbol, leverage || 1, client, logOutputGroupEntity);

          // Calculate quantity
          const investment = 30;
          const quantity = await calculateQuantity(
            tradingSymbol,
            investment,
            currentPrice,
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
      })
    );

    logMessage('All signals processed successfully.', client, logOutputGroupEntity);
  } catch (error) {
    logMessage(`Error processing multiple signals: ${error.message}`, client, logOutputGroupEntity);
  }
}

module.exports = {
  executeTrades,
};
