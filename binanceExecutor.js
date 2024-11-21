require('dotenv').config(); // Load environment variables from .env
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

    // Get step size and minimum order size
    const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE');
    const stepSize = parseFloat(lotSizeFilter.stepSize);
    const minQty = parseFloat(lotSizeFilter.minQty);

    // Calculate raw quantity
    let quantity = investment / price;

    // Adjust quantity to conform to step size and minimum order size
    quantity = Math.floor(quantity / stepSize) * stepSize; // Round down to the nearest step size
    if (quantity < minQty) {
      throw new Error(`Quantity ${quantity} is below the minimum order size ${minQty}`);
    }

    logMessage(
      `Calculated quantity for ${symbol}: ${quantity} (stepSize: ${stepSize}, minQty: ${minQty})`,
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
    const ticker = await binanceClient.futuresPrices(); // Use futuresPrices for Futures
    const currentPrice = parseFloat(ticker[symbol]).toFixed(2);
    logMessage(`Fetched current price for ${symbol}: ${currentPrice}`, client, logOutputGroupEntity);
    return currentPrice;
  } catch (error) {
    logMessage(`Error fetching current price for ${symbol}: ${error.message}`, client, logOutputGroupEntity);
    return null;
  }
}

// Function to execute the trade when the price is in the desired range
async function executeTrade(signalData, client, logOutputGroupEntity) {
  try {
    const { position, symbol, entryPriceRange, leverage, targets, stopLoss } = signalData;

    const orderSide = position === 'LONG' ? 'BUY' : 'SELL';
    const [minPrice, maxPrice] = entryPriceRange.split('-').map(Number);
    const firstTarget = targets[0];
    const stopLossPrice = stopLoss;

    const tradingSymbol = symbol.replace('/', ''); // Strip the '/' for Binance pairs
    logMessage(
      `Received trading signal for ${symbol}: ${position} with target range ${minPrice} - ${maxPrice}`,
      client,
      logOutputGroupEntity
    );

    // Create a mechanism to constantly check the price
    const priceCheckInterval = 15000; // 15 seconds
    let interval;

    const checkPriceAndExecute = async () => {
      const currentPrice = await getCurrentPrice(tradingSymbol, client, logOutputGroupEntity);

      if (currentPrice !== null) {
        logMessage(`Current price of ${tradingSymbol} is ${currentPrice}`, client, logOutputGroupEntity);

        if (currentPrice >= minPrice && currentPrice <= maxPrice) {
          logMessage(`Price is in range: ${currentPrice}. Executing ${position} order.`, client, logOutputGroupEntity);

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
          const order = await placeFuturesMarketOrder(tradingSymbol, orderSide, quantity, client, logOutputGroupEntity);
          if (order) {
            logMessage(
              `Market order executed successfully: ${JSON.stringify(order)}`,
              client,
              logOutputGroupEntity
            );
            // Set Stop-Loss and Take-Profit after the order is executed
            await setStopLossAndTakeProfit(
              tradingSymbol,
              orderSide,
              quantity,
              stopLossPrice,
              firstTarget,
              client,
              logOutputGroupEntity
            );

            // Stop checking after executing the trade
            clearInterval(interval);
          }
        } else {
          logMessage(`Price of ${tradingSymbol} is ${currentPrice}, not in range.`, client, logOutputGroupEntity);
        }
      }
    };

    interval = setInterval(checkPriceAndExecute, priceCheckInterval);
  } catch (error) {
    logMessage(`Error executing trade for ${signalData.symbol}: ${error.message}`, client, logOutputGroupEntity);
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
    const order = await binanceClient.futuresOrder({
      symbol: symbol,
      side: side,
      type: 'MARKET',
      quantity: quantity,
    });
    logMessage(`Placed order: ${JSON.stringify(order)}`, client, logOutputGroupEntity);
    return order;
  } catch (error) {
    logMessage(`Error placing order for ${symbol}: ${error.message}`, client, logOutputGroupEntity);
    console.error(error);
  }
}

// Function to set stop-loss and take-profit orders
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

    logMessage(
      `Stop-Loss and Take-Profit orders set: StopLoss: ${stopLossPrice}, TakeProfit: ${takeProfitPrice}`,
      client,
      logOutputGroupEntity
    );
  } catch (error) {
    logMessage(`Error setting Stop-Loss or Take-Profit for ${symbol}: ${error.message}`, client, logOutputGroupEntity);
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
