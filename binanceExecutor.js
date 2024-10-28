require('dotenv').config(); // Load environment variables from .env
const fs = require('fs');
const path = require('path');
const binance = require('binance-api-node');

// Initialize Binance API client using credentials from .env
const binanceClient = binance.default({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
  useServerTime: true,
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
    const ticker = await binanceClient.prices({ symbol });
    const currentPrice = parseFloat(ticker[symbol]);
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

    // Prepare trading parameters
    const orderSide = position === 'LONG' ? 'BUY' : 'SELL';
    const [minPrice, maxPrice] = entryPriceRange.split('-').map(Number);
    const firstTarget = targets[0];
    const stopLossPrice = stopLoss;

    logMessage(`Received trading signal for ${symbol}: ${position} with target range ${minPrice} - ${maxPrice}`);

    // Poll the current price every 5 seconds
    const tradingSymbol = symbol.replace('/', '');
    logMessage(`Starting to monitor price for ${tradingSymbol} every 5 seconds to catch the range...`);

    const checkPriceInterval = setInterval(async () => {
      const currentPrice = await getCurrentPrice(tradingSymbol);
    
      if (
        (minPrice >= maxPrice && currentPrice <= minPrice && currentPrice >= maxPrice) || // Higher to lower range
        (minPrice <= maxPrice && currentPrice >= minPrice && currentPrice <= maxPrice)    // Lower to higher range
      ) {
        // Price is within the desired range, proceed with trade
        clearInterval(checkPriceInterval);
        logMessage(`Price is in range: ${currentPrice}. Executing ${position} order.`);
    
        // Calculate the investment amount (e.g., $100)
        const investment = 30;
        const quantity = (investment / currentPrice).toFixed(2); // Adjust precision based on the trading pair
    
        // Set leverage for futures trading
        await setLeverage(tradingSymbol, leverage);
    
        // Place the market order
        const order = await placeMarketOrder(tradingSymbol, orderSide, quantity);
    
        // Log the market order result
        if (order) {
          logMessage(`Market order executed successfully: ${JSON.stringify(order)}`);
        }
    
        // Set Take-Profit and Stop-Loss orders
        await setStopLossAndTakeProfit(tradingSymbol, orderSide, quantity, stopLossPrice, firstTarget);
      } else {
        logMessage(`Current price of ${tradingSymbol} is ${currentPrice}, not in range.`);
      }
    }, 5000); // Check every 5 seconds
  } catch (error) {
    logMessage(`Error executing trade: ${error.message}`);
  }
}

// Function to set the leverage for a futures trade
async function setLeverage(symbol, leverage) {
  try {
    await binanceClient.futuresLeverage({
      symbol,
      leverage: leverage || 1, // Default to 1 if no leverage specified
    });
    logMessage(`Leverage set to x${leverage} for ${symbol}`);
  } catch (error) {
    logMessage(`Error setting leverage for ${symbol}: ${error.message}`);
  }
}

// Function to place a market order
async function placeMarketOrder(symbol, side, quantity) {
  try {
    const order = await binanceClient.order({
      symbol,
      side,
      type: 'MARKET',
      quantity,
    });
    logMessage(`Placed a ${side} market order for ${quantity} ${symbol}`);
    return order;
  } catch (error) {
    logMessage(`Error placing market order for ${symbol}: ${error.message}`);
    return null;
  }
}

// Function to set Stop-Loss and Take-Profit orders
async function setStopLossAndTakeProfit(symbol, side, quantity, stopLossPrice, takeProfitPrice) {
  try {
    const oppositeSide = side === 'BUY' ? 'SELL' : 'BUY';

    // Set the Stop-Loss Order
    await binanceClient.order({
      symbol,
      side: oppositeSide,
      type: 'STOP_MARKET',
      stopPrice: stopLossPrice,
      quantity,
    });
    logMessage(`Stop-Loss order set at ${stopLossPrice} for ${symbol}`);

    // Set the Take-Profit Order
    await binanceClient.order({
      symbol,
      side: oppositeSide,
      type: 'LIMIT',
      price: takeProfitPrice,
      quantity,
      timeInForce: 'GTC', // Good 'Til Canceled
    });
    logMessage(`Take-Profit order set at ${takeProfitPrice} for ${symbol}`);
  } catch (error) {
    logMessage(`Error setting Stop-Loss/Take-Profit for ${symbol}: ${error.message}`);
  }
}

module.exports = {
  executeTrade,
};
