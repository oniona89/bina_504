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
    logMessage(`step size: ${stepSize}`)
    const minQty = parseFloat(lotSizeFilter.minQty);

    // Log step size and min quantity
    logMessage(
      `Step size for ${symbol}: ${stepSize}, Min quantity: ${minQty}`,
      client,
      logOutputGroupEntity
    );

    // Calculate raw quantity
    let quantity = investment / price;
    logMessage(
      `Raw calculated quantity for ${symbol}: ${quantity} (Investment: ${investment}, Price: ${price})`,
      client,
      logOutputGroupEntity
    );

    // Determine precision based on step size
    const precision = stepSize >= 1 ? 0 : Math.floor(Math.log10(1 / stepSize));

    // Adjust quantity based on step size and precision
    if (precision === 0) {
      quantity = Math.floor(quantity); // No decimals allowed
    } else {
      quantity = Math.floor(quantity / stepSize) * stepSize; // Adjust to step size
      quantity = parseFloat(quantity.toFixed(precision)); // Enforce precision
    }

    // Ensure quantity meets the minimum order size
    if (quantity < minQty) {
      logMessage('The quantity is less than minimum')
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
    const ticker = await binanceClient.futuresPrices(); // Use futuresPrices for Futures
    const currentPrice = parseFloat(ticker[symbol]).toFixed(2);
    logMessage(`Fetched current price for ${symbol}: ${currentPrice}`, client, logOutputGroupEntity);
    return currentPrice;
  } catch (error) {
    logMessage(`Error fetching current price for ${symbol}: ${error.message}`, client, logOutputGroupEntity);
    return null;
  }
}

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
// Function to place a futures market order with retry mechanism
async function placeFuturesMarketOrder(symbol, side, quantity, client, logOutputGroupEntity) {
  try {
    let adjustedQuantity = quantity; // Start with the calculated quantity
    let attempts = 0;
    const maxAttempts = 5; // Limit the number of retries to avoid infinite loops

    while (attempts < maxAttempts) {
      try {
        const order = await binanceClient.futuresOrder({
          symbol: symbol,
          side: side,
          type: 'MARKET',
          quantity: adjustedQuantity,
        });
        logMessage(
          `Placed order successfully: ${JSON.stringify(order)}`,
          client,
          logOutputGroupEntity
        );
        return order;
      } catch (error) {
        if (error.message.includes('Precision is over the maximum defined for this asset')) {
          logMessage(
            `Precision error for ${symbol}. Quantity: ${adjustedQuantity}. Retrying with reduced precision.`,
            client,
            logOutputGroupEntity
          );

          // Reduce precision by removing one decimal place
          const precision = Math.max(0, adjustedQuantity.toString().split('.')[1]?.length || 0);
          if (precision > 0) {
            adjustedQuantity = Math.floor(adjustedQuantity * Math.pow(10, precision - 1)) / Math.pow(10, precision - 1);
          } else {
            adjustedQuantity = Math.floor(adjustedQuantity); // Fall back to whole number
          }

          logMessage(
            `Adjusted quantity for retry: ${adjustedQuantity}`,
            client,
            logOutputGroupEntity
          );

          if (adjustedQuantity <= 0) {
            throw new Error(
              `Failed to adjust precision for ${symbol}. Quantity reduced to zero or less.`
            );
          }

          attempts += 1; // Increment retry count
        } else {
          // If the error is not related to precision, rethrow it
          throw error;
        }
      }
    }

    throw new Error(
      `Failed to place order for ${symbol} after ${maxAttempts} attempts due to precision issues.`
    );
  } catch (error) {
    logMessage(
      `Error placing order for ${symbol}: ${error.message}. Final quantity attempted: ${quantity}`,
      client,
      logOutputGroupEntity
    );
    logMessage(
      `Debugging details: ${JSON.stringify({ symbol, side, quantity })}`,
      client,
      logOutputGroupEntity
    );
    console.error(error);
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
    // Place Stop-Loss Order
    const stopLossOrder = await binanceClient.futuresOrder({
      symbol: symbol,
      side: side, // Opposite side of the position
      type: 'STOP_MARKET',
      stopPrice: stopLossPrice,
      quantity: quantity,
      reduceOnly: true, // Ensure it reduces the position
    });

    logMessage(`Stop-Loss order placed: ${JSON.stringify(stopLossOrder)}`, client, logOutputGroupEntity);

    // Place Take-Profit Order
    const takeProfitOrder = await binanceClient.futuresOrder({
      symbol: symbol,
      side: side, // Opposite side of the position
      type: 'TAKE_PROFIT_MARKET',
      stopPrice: takeProfitPrice,
      quantity: quantity,
      reduceOnly: true, // Ensure it reduces the position
    });

    logMessage(`Take-Profit order placed: ${JSON.stringify(takeProfitOrder)}`, client, logOutputGroupEntity);

    logMessage(
      `Stop-Loss and Take-Profit orders set: StopLoss=${stopLossPrice}, TakeProfit=${takeProfitPrice}`,
      client,
      logOutputGroupEntity
    );
  } catch (error) {
    logMessage(
      `Error setting Stop-Loss or Take-Profit for ${side} position on ${symbol}: ${error.message}`,
      client,
      logOutputGroupEntity
    );
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
