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

    const tradingSymbol = symbol.replace('/', '');
    console.log(`Received trading signal for ${symbol}: ${position} with target range ${minPrice} - ${maxPrice}`);

    const currentPrice = await getCurrentPrice(tradingSymbol);

    if (currentPrice >= minPrice && currentPrice <= maxPrice) {
      console.log(`Price is in range: ${currentPrice}. Executing ${position} order.`);

      // Set leverage
      await setLeverage(tradingSymbol, leverage || 1); // Default to 1 if leverage is undefined

      // Round investment to 2 decimal places for USDT pairs
      const investment = 30;
      const quantity = (investment / currentPrice).toFixed(1);
      console.log(`investment: `, investment)
      console.log(`quantity: `, quantity)
      const order = await placeFuturesMarketOrder(tradingSymbol, orderSide, quantity);
      if (order) {
        console.log(`Market order executed successfully: ${JSON.stringify(order)}`);
      }

      // Set Take-Profit and Stop-Loss
      await setStopLossAndTakeProfit(tradingSymbol, orderSide, quantity, stopLossPrice, firstTarget);
    } else {
      console.log(`Current price of ${tradingSymbol} is ${currentPrice}, not in range.`);
    }
  } catch (error) {
    console.log(`Error executing trade: ${error.message}`);
  }
}


// Function to adjust quantity precision based on symbol
function getPrecision(symbol) {
  // Define precision for commonly traded symbols (e.g., FIL/USDT precision is 2)
  const precisionMap = {
    FILUSDT: 2,
    BTCUSDT: 3,
    ETHUSDT: 3,
  };
  return precisionMap[symbol] || 2; // Default precision if not specified
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

// Function to place a market order on Binance Futures
async function placeFuturesMarketOrder(symbol, side, quantity) {
  try {
    const order = await binanceClient.futuresOrder({
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

// Function to set Stop-Loss and Take-Profit orders for Binance Futures
async function setStopLossAndTakeProfit(symbol, side, quantity, stopLossPrice, takeProfitPrice) {
  try {
    const oppositeSide = side === 'BUY' ? 'SELL' : 'BUY';

    // Set the Take-Profit Market Order
    await binanceClient.futuresOrder({
      symbol,
      side: oppositeSide,
      type: 'TAKE_PROFIT_MARKET',
      stopPrice: takeProfitPrice.toFixed(2),
      quantity,
    });
    logMessage(`Take-Profit order set at ${takeProfitPrice} for ${symbol}`);

    // Check if stopLossPrice is defined before placing Stop-Loss order
    if (stopLossPrice !== undefined) {
      // Set the Stop-Loss Market Order
      await binanceClient.futuresOrder({
        symbol,
        side: oppositeSide,
        type: 'STOP_MARKET',
        stopPrice: stopLossPrice.toFixed(2),
        quantity,
      });
      logMessage(`Stop-Loss order set at ${stopLossPrice} for ${symbol}`);
    } else {
      logMessage(`Stop-Loss order not set because stopLossPrice is undefined for ${symbol}`);
    }
  } catch (error) {
    logMessage(`Error setting Stop-Loss/Take-Profit for ${symbol}: ${error.message}`);
  }
}

module.exports = {
  executeTrade,
};
