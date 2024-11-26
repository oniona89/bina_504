require('dotenv').config(); // Load environment variables from .env
const binance = require('binance-api-node');
const { logMessage } = require('./logger'); // Import logMessage
const { placeFuturesMarketOrder, getCurrentPrice, setLeverage, calculateQuantity, setStopLossAndTakeProfit } = require('./binanceHelpers'); // Import helpers

// Initialize Binance API client using credentials from .env
const binanceClient = binance.default({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
  useServerTime: true,
  futures: true,
});



// Function to execute a trade and set SL/TP
async function executeTrade(signalData, client, logOutputGroupEntity) {
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

    // Fetch the current price
    const currentPrice = await getCurrentPrice(tradingSymbol, client, logOutputGroupEntity);

    if (currentPrice !== null) {
      logMessage(`Current price of ${tradingSymbol} is ${currentPrice}`, client, logOutputGroupEntity);

      if (currentPrice >= minPrice && currentPrice <= maxPrice) {
        logMessage(`Price is in range: ${currentPrice}. Executing ${position} order.`, client, logOutputGroupEntity);

        // Set leverage
        await setLeverage(tradingSymbol, leverage || 1, client, logOutputGroupEntity);

        // Calculate quantity
        const investment = 200;
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
      } else {
        logMessage(`Price of ${tradingSymbol} is ${currentPrice}, not in range.`, client, logOutputGroupEntity);
      }
    }
  } catch (error) {
    logMessage(`Error executing trade for ${signalData.symbol}: ${error.message}`, client, logOutputGroupEntity);
  }
}



module.exports = {
  executeTrade,
  calculateQuantity,
};
