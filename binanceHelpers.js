const binance = require('binance-api-node');
const { logMessage } = require('./logger'); // Import logMessage
const WebSocket = require('ws');

// Initialize Binance API client using credentials from .env
const binanceClient = binance.default({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
  useServerTime: true,
  futures: true,
});

async function calculateQuantity(symbol, investment, price, leverage, client, logOutputGroupEntity) {
    try {
      // Fetch exchange info for the symbol
      const exchangeInfo = await binanceClient.exchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
  
      if (!symbolInfo) {
        throw new Error(`Symbol ${symbol} not found.`);
      }
  
      // Fetch relevant filters for the symbol
      const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE');
      const stepSize = parseFloat(lotSizeFilter.stepSize);
      const minQty = parseFloat(lotSizeFilter.minQty);
  
      logMessage(`Step size for ${symbol}: ${stepSize}, Min quantity: ${minQty}`, client, logOutputGroupEntity);
      console.log("leverage: ", Number(leverage))
      // Ensure leverage is a valid number
      const numericLeverage = Number(leverage);
      if (isNaN(numericLeverage)) {
        throw new Error(`Invalid leverage value: ${leverage}`);
      }
  
      // Calculate the notional amount based on leverage
      const notionalAmount = investment * numericLeverage;
  
      // Calculate raw quantity using notional amount and price
      let quantity = notionalAmount / price;
      logMessage(
        `Raw calculated quantity for ${symbol}: ${quantity} (Investment: ${investment}, Leverage: ${numericLeverage}, Price: ${price})`,
        client,
        logOutputGroupEntity
      );
  
      // Determine precision based on step size
      const precision = stepSize >= 1 ? 0 : Math.floor(Math.log10(1 / stepSize));
  
      // Adjust quantity to adhere to the step size
      if (precision === 0) {
        quantity = Math.floor(quantity);
      } else {
        quantity = Math.floor(quantity / stepSize) * stepSize;
        quantity = parseFloat(quantity.toFixed(precision));
      }
  
      // Ensure quantity meets minimum order requirements
      if (quantity < minQty) {
        throw new Error(
          `Quantity ${quantity} is below the minimum order size ${minQty} for ${symbol}`
        );
      }
  
      logMessage(
        `Adjusted quantity for ${symbol}: ${quantity} (Step size: ${stepSize}, Min quantity: ${minQty}, Precision: ${precision})`,
        client,
        logOutputGroupEntity
      );
  
      return quantity;
    } catch (error) {
      logMessage(`Error calculating quantity for ${symbol}: ${error.message}`, client, logOutputGroupEntity);
      throw error;
    }
  }
  

// Function to get the current price of a symbol
async function getCurrentPrice(symbol, client, logOutputGroupEntity) {
  try {
    const ticker = await binanceClient.futuresPrices();
    const currentPrice = parseFloat(ticker[symbol]).toFixed(2);
    logMessage(`Fetched current price for ${symbol}: ${currentPrice}`, client, logOutputGroupEntity);
    return currentPrice;
  } catch (error) {
    logMessage(`Error fetching current price for ${symbol}: ${error.message}`, client, logOutputGroupEntity);
    return null;
  }
}

// Function to set leverage for a symbol
async function setLeverage(symbol, leverage, client, logOutputGroupEntity) {
  try {
    const response = await binanceClient.futuresLeverage({
      symbol: symbol,
      leverage: leverage,
    });
    logMessage(`Leverage set for ${symbol} to ${leverage}`, client, logOutputGroupEntity);
    return response;
  } catch (error) {
    logMessage(`Error setting leverage for ${symbol}: ${error.message}`, client, logOutputGroupEntity);
    console.error(error);
  }
}

// Function to place a futures market order
async function placeFuturesMarketOrder(symbol, side, quantity, client, logOutputGroupEntity) {
  try {
    let adjustedQuantity = quantity;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        const order = await binanceClient.futuresOrder({
          symbol: symbol,
          side: side,
          type: 'MARKET',
          quantity: adjustedQuantity,
        });
        logMessage(`Placed order successfully: ${JSON.stringify(order)}`, client, logOutputGroupEntity);
        return order;
      } catch (error) {
        if (error.message.includes('Precision is over the maximum defined for this asset')) {
          const precision = Math.max(0, adjustedQuantity.toString().split('.')[1]?.length || 0);
          adjustedQuantity =
            precision > 0
              ? Math.floor(adjustedQuantity * Math.pow(10, precision - 1)) / Math.pow(10, precision - 1)
              : Math.floor(adjustedQuantity);
          attempts += 1;
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Failed to place order for ${symbol} after ${maxAttempts} attempts.`);
  } catch (error) {
    logMessage(`Error placing order for ${symbol}: ${error.message}`, client, logOutputGroupEntity);
    throw error;
  }
}

// Function to set Stop-Loss and Take-Profit
async function setStopLossAndTakeProfit(
  symbol,
  side,
  quantity,
  stopLossPrice,
  takeProfitPrice,
  client,
  logOutputGroupEntity
) {
  try {
    const stopLossOrder = await binanceClient.futuresOrder({
      symbol: symbol,
      side: side,
      type: 'STOP_MARKET',
      stopPrice: stopLossPrice,
      quantity: quantity,
      reduceOnly: true,
    });

    logMessage(`Stop-Loss order placed: ${JSON.stringify(stopLossOrder)}`, client, logOutputGroupEntity);

    const takeProfitOrder = await binanceClient.futuresOrder({
      symbol: symbol,
      side: side,
      type: 'TAKE_PROFIT_MARKET',
      stopPrice: takeProfitPrice,
      quantity: quantity,
      reduceOnly: true,
    });

    logMessage(`Take-Profit order placed: ${JSON.stringify(takeProfitOrder)}`, client, logOutputGroupEntity);
  } catch (error) {
    logMessage(
      `Error setting Stop-Loss or Take-Profit for ${symbol}: ${error.message}`,
      client,
      logOutputGroupEntity
    );
  }
}

// Live price cache for WebSocket updates
let priceCache = {};

// Function to initialize WebSocket for live price updates
function initializeWebSocket() {
    const ws = new WebSocket('wss://fstream.binance.com/ws/!ticker@arr');
  
    ws.on('open', () => {
      console.log('WebSocket connection established.');
    });
  
    ws.on('message', (data) => {
      try {
        const tickers = JSON.parse(data);
        tickers.forEach((ticker) => {
          const symbol = ticker.s; // Symbol in uppercase (e.g., LTCUSDT)
          const price = parseFloat(ticker.c); // Current price
          priceCache[symbol] = price; // Update cache
        });
      } catch (error) {
        console.error('Error parsing WebSocket message:', error.message);
      }
    });
  
    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
    });
  
    ws.on('close', () => {
      console.log('WebSocket connection closed. Reconnecting...');
      setTimeout(initializeWebSocket, 1000); // Reconnect after 1 second
    });
}

// Function to get the live price from the cache
function getLivePrice(symbol) {
    return priceCache[symbol] || null; // Return price or null if not available
}

module.exports = {
  calculateQuantity,
  getCurrentPrice,
  setLeverage,
  placeFuturesMarketOrder,
  setStopLossAndTakeProfit,
  initializeWebSocket,
  getLivePrice
};
