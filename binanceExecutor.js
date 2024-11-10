require('dotenv').config(); // Load environment variables from .env
const fs = require('fs');
const path = require('path');
const binance = require('binance-api-node');

// Initialize Binance API client using credentials from .env
const binanceClient = binance.default({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
  useServerTime: true,
  futures: true
});

// Log file path
const logFilePath = path.join(__dirname, 'binanceLog.txt');

// Helper function to log messages to binanceLog.txt
function logMessage(message) {
  const date = new Date();
  const formattedDate = date.toISOString();
  const logEntry = `${formattedDate} - ${message}\n`;

  fs.appendFile(logFilePath, logEntry, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });

  console.log(message); // Also print to the console for real-time feedback
}

// Function to poll the current price of a symbol
async function getCurrentPrice(symbol) {
  try {
    const ticker = await binanceClient.futuresPrices(); // Use futuresPrices for Futures
    const currentPrice = parseFloat(ticker[symbol]).toFixed(2);
    logMessage(`Fetched current price for ${symbol}: ${currentPrice}`);
    return currentPrice;
  } catch (error) {
    logMessage(`Error fetching current price for ${symbol}: ${error.message}`);
    return null;
  }
}

// Function to execute the trade when the price is in the desired range
async function executeTrade(signalData) {
  try {
    const { position, symbol, entryPriceRange, leverage, targets, stopLoss } = signalData;

    const orderSide = position === 'LONG' ? 'BUY' : 'SELL';
    const [minPrice, maxPrice] = entryPriceRange.split('-').map(Number);
    const firstTarget = targets[0];
    const stopLossPrice = stopLoss;

    const tradingSymbol = symbol.replace('/', ''); // Strip the '/' for Binance pairs
    console.log(`Received trading signal for ${symbol}: ${position} with target range ${minPrice} - ${maxPrice}`);

    // Create a mechanism to constantly check the price
    const priceCheckInterval = 15000; // 5 seconds
    let interval;

    // This function will be called repeatedly to check the price
    const checkPriceAndExecute = async () => {
      const currentPrice = await getCurrentPrice(tradingSymbol);

      if (currentPrice !== null) {
        console.log(`Current price of ${tradingSymbol} is ${currentPrice}`);

        if (currentPrice >= minPrice && currentPrice <= maxPrice) {
          console.log(`Price is in range: ${currentPrice}. Executing ${position} order.`);

          // Set leverage
          await setLeverage(tradingSymbol, leverage || 1); // Default to 1 if leverage is undefined

          // Round investment to 2 decimal places for USDT pairs
          const investment = 30;
          const quantity = (investment / currentPrice).toFixed(1);
          console.log(`Investment: ${investment}`);
          console.log(`Quantity: ${quantity}`);

          // Place the market order
          const order = await placeFuturesMarketOrder(tradingSymbol, orderSide, quantity);
          if (order) {
            console.log(`Market order executed successfully: ${JSON.stringify(order)}`);
            // Set Stop-Loss and Take-Profit after the order is executed
            await setStopLossAndTakeProfit(tradingSymbol, orderSide, quantity, stopLossPrice, firstTarget);

            // Stop checking after executing the trade
            clearInterval(interval);
          }
        } else {
          console.log(`Price of ${tradingSymbol} is ${currentPrice}, not in range.`);
        }
      }
    };

    // Start the interval to check the price every 15 seconds
    interval = setInterval(checkPriceAndExecute, priceCheckInterval);

  } catch (error) {
    console.error(`Error executing trade for ${signalData.symbol}: ${error.message}`);
    logMessage(`Error executing trade for ${signalData.symbol}: ${error.message}`);
  }
}

// Function to set leverage for a symbol
async function setLeverage(symbol, leverage) {
  try {
    const response = await binanceClient.futuresLeverage({
      symbol: symbol,
      leverage: leverage
    });
    logMessage(`Leverage set for ${symbol} to ${leverage}`);
    return response;
  } catch (error) {
    logMessage(`Error setting leverage for ${symbol}: ${error.message}`);
    console.error(error);
  }
}

// Function to place a futures market order
async function placeFuturesMarketOrder(symbol, side, quantity) {
  try {
    const order = await binanceClient.futuresOrder({
      symbol: symbol,
      side: side,
      type: 'MARKET',
      quantity: quantity,
    });
    logMessage(`Placed order: ${JSON.stringify(order)}`);
    return order;
  } catch (error) {
    logMessage(`Error placing order for ${symbol}: ${error.message}`);
    console.error(error);
  }
}

// Function to set stop-loss and take-profit orders
async function setStopLossAndTakeProfit(symbol, side, quantity, stopLossPrice, takeProfitPrice) {
  try {
    const stopLossOrder = await binanceClient.futuresOrder({
      symbol: symbol,
      side: side === 'BUY' ? 'SELL' : 'BUY',
      type: 'STOP_MARKET',
      stopPrice: stopLossPrice,
      quantity: quantity,
    });

    const takeProfitOrder = await binanceClient.futuresOrder({
      symbol: symbol,
      side: side === 'BUY' ? 'SELL' : 'BUY',
      type: 'TAKE_PROFIT_MARKET',
      stopPrice: takeProfitPrice,
      quantity: quantity,
    });

    logMessage(`Stop-Loss and Take-Profit orders set: StopLoss: ${stopLossPrice}, TakeProfit: ${takeProfitPrice}`);
  } catch (error) {
    logMessage(`Error setting Stop-Loss or Take-Profit for ${symbol}: ${error.message}`);
    console.error(error);
  }
}

module.exports = {
  executeTrade,
  getCurrentPrice,
  setLeverage,
  placeFuturesMarketOrder,
  setStopLossAndTakeProfit,
};
