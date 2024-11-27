const binance = require('binance-api-node');
const { logMessage } = require('./logger'); // Import logMessage

// Initialize Binance API client using credentials from .env
const binanceClient = binance.default({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
  useServerTime: true,
  futures: true,
});

// Function to fetch quantity precision for a symbol
async function calculateQuantity(symbol, investment, price, client, logOutputGroupEntity) {
  try {
    const exchangeInfo = await binanceClient.exchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);

    if (!symbolInfo) {
      throw new Error(`Symbol ${symbol} not found.`);
    }

    const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE');
    const stepSize = parseFloat(lotSizeFilter.stepSize);
    const minQty = parseFloat(lotSizeFilter.minQty);

    logMessage(`Step size for ${symbol}: ${stepSize}, Min quantity: ${minQty}`, client, logOutputGroupEntity);

    let quantity = investment / price;
    logMessage(
      `Raw calculated quantity for ${symbol}: ${quantity} (Investment: ${investment}, Price: ${price})`,
      client,
      logOutputGroupEntity
    );

    const precision = stepSize >= 1 ? 0 : Math.floor(Math.log10(1 / stepSize));

    if (precision === 0) {
      quantity = Math.floor(quantity);
    } else {
      quantity = Math.floor(quantity / stepSize) * stepSize;
      quantity = parseFloat(quantity.toFixed(precision));
    }

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

module.exports = {
  calculateQuantity,
  getCurrentPrice,
  setLeverage,
  placeFuturesMarketOrder,
  setStopLossAndTakeProfit,
};
