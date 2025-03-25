import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

interface CoinGeckoMarketChartData {
  prices: [number[], number[]];
  market_caps: [number[], number[]];
  total_volumes: [number[], number[]];
}

interface TokenData {
  timestamp: number;
  price: number;
  volume: number;
}

interface StrategySignal {
  currentPrice: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasons: string[];
  crossSignals: {
    goldenCross?: boolean;
    deathCross?: boolean;
  };
}

class TradingStrategy {
  private data: TokenData[];

  constructor(data: TokenData[]) {
    this.data = data.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Momentum Indicators
  private calculateRSI(periods: number = 14): number[] {
    const prices = this.data.map(d => d.price);
    const changes = prices.map((price, i) => i > 0 ? price - prices[i-1] : 0);
    const gains = changes.map(change => Math.max(change, 0));
    const losses = changes.map(change => Math.max(-change, 0));

    const avgGain = this.calculateSmoothedMovingAverage(gains, periods);
    const avgLoss = this.calculateSmoothedMovingAverage(losses, periods);

    return avgGain.map((ag, i) => {
      const al = avgLoss[i];
      return al === 0 ? 100 : 100 - (100 / (1 + (ag / al)));
    });
  }

  // Helper method for smoothed moving average
  private calculateSmoothedMovingAverage(values: number[], periods: number): number[] {
    const smoothedMA: number[] = [];
    let sum = values.slice(0, periods).reduce((a, b) => a + b, 0) / periods;
    smoothedMA.push(sum);

    for (let i = periods; i < values.length; i++) {
      sum = ((smoothedMA[smoothedMA.length - 1] * (periods - 1)) + values[i]) / periods;
      smoothedMA.push(sum);
    }

    return smoothedMA;
  }

  // EMA Calculation
  private calculateEMA(periods: number = 50): number[] {
    const prices = this.data.map(d => d.price);
    const alpha = 2 / (periods + 1);

    const ema: number[] = [];
    ema.push(this.calculateSimpleMovingAverage(prices.slice(0, periods)));

    for (let i = periods; i < prices.length; i++) {
      const currentPrice = prices[i];
      const previousEMA = ema[ema.length - 1];
      const currentEMA = (currentPrice * alpha) + (previousEMA * (1 - alpha));
      ema.push(currentEMA);
    }

    return ema;
  }

  // Simple Moving Average
  private calculateSimpleMovingAverage(prices: number[], periods: number = 50): number {
    return prices.slice(0, periods).reduce((a, b) => a + b, 0) / periods;
  }

  // MACD Calculation
  private calculateMACD(shortPeriod: number = 12, longPeriod: number = 26, signalPeriod: number = 9) {
    const prices = this.data.map(d => d.price);
    const shortEMA = this.calculateExponentialMovingAverages(prices, shortPeriod);
    const longEMA = this.calculateExponentialMovingAverages(prices, longPeriod);

    const macdLine = shortEMA.map((sEMA, i) => sEMA - longEMA[i]);
    const signalLine = this.calculateExponentialMovingAverages(macdLine, signalPeriod);

    return { macdLine, signalLine };
  }

  // Helper for multiple EMA calculations
  private calculateExponentialMovingAverages(prices: number[], periods: number): number[] {
    const alpha = 2 / (periods + 1);
    const ema: number[] = [];

    // Start with SMA
    ema.push(prices.slice(0, periods).reduce((a, b) => a + b, 0) / periods);

    for (let i = periods; i < prices.length; i++) {
      const currentPrice = prices[i];
      const previousEMA = ema[ema.length - 1];
      const currentEMA = (currentPrice * alpha) + (previousEMA * (1 - alpha));
      ema.push(currentEMA);
    }

    return ema;
  }

  // Bollinger Bands
  private calculateBollingerBands(periods: number = 20, standardDeviation: number = 2) {
    const prices = this.data.map(d => d.price);
    const middleBand = this.calculateMovingAverage(prices, periods);

    const standardDeviations = prices.map((price, i) => {
      const subset = prices.slice(Math.max(0, i - periods + 1), i + 1);
      const mean = subset.reduce((a, b) => a + b, 0) / subset.length;
      const variance = subset.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / subset.length;
      return Math.sqrt(variance);
    });

    const upperBand = middleBand.map((mb, i) => mb + (standardDeviations[i] * standardDeviation));
    const lowerBand = middleBand.map((mb, i) => mb - (standardDeviations[i] * standardDeviation));

    return { middleBand, upperBand, lowerBand };
  }

  // Moving Average helper
  private calculateMovingAverage(prices: number[], periods: number): number[] {
    const movingAverages: number[] = [];

    for (let i = periods - 1; i < prices.length; i++) {
      const subset = prices.slice(i - periods + 1, i + 1);
      const average = subset.reduce((a, b) => a + b, 0) / periods;
      movingAverages.push(average);
    }

    return movingAverages;
  }

  // Volume-based On-Balance Volume
  private calculateOBV(): number[] {
    const prices = this.data.map(d => d.price);
    const volumes = this.data.map(d => d.volume);
    const obv: number[] = [volumes[0]];

    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i-1]) {
        obv.push(obv[i-1] + volumes[i]);
      } else if (prices[i] < prices[i-1]) {
        obv.push(obv[i-1] - volumes[i]);
      } else {
        obv.push(obv[i-1]);
      }
    }

    return obv;
  }

  // Detect Golden Cross and Death Cross
  detectCrosses(shortPeriod: number = 50, longPeriod: number = 200): { goldenCross: boolean, deathCross: boolean } {
    const prices = this.data.map(d => d.price);

    // Calculate short-term and long-term EMAs
    const shortTermEMA = this.calculateExponentialMovingAverages(prices, shortPeriod);
    const longTermEMA = this.calculateExponentialMovingAverages(prices, longPeriod);

    // Ensure we have enough data points
    if (shortTermEMA.length < 2 || longTermEMA.length < 2) {
      return { goldenCross: false, deathCross: false };
    }

    // Get the last two points of both EMAs
    const shortTermLast = shortTermEMA.slice(-2);
    const longTermLast = longTermEMA.slice(-2);

    // Golden Cross: Short-term EMA crosses above long-term EMA
    const goldenCross =
      shortTermLast[0] <= longTermLast[0] &&
      shortTermLast[1] > longTermLast[1];

    // Death Cross: Short-term EMA crosses below long-term EMA
    const deathCross =
      shortTermLast[0] >= longTermLast[0] &&
      shortTermLast[1] < longTermLast[1];

    return { goldenCross, deathCross };
  }

  // Comprehensive Trading Signal Generator
  generateTradingSignal(): StrategySignal {
    // Calculate all indicators
    const rsi = this.calculateRSI();
    const ema = this.calculateEMA();
    const macd = this.calculateMACD();
    const bollingerBands = this.calculateBollingerBands();
    const obv = this.calculateOBV();

    // Detect Golden Cross and Death Cross
    const { goldenCross, deathCross } = this.detectCrosses();

    // Get latest values
    const latestPrice = this.data[this.data.length - 1].price;
    const latestRSI = rsi[rsi.length - 1];
    const latestEMA = ema[ema.length - 1];
    const latestMACD = macd.macdLine[macd.macdLine.length - 1];
    const latestSignalLine = macd.signalLine[macd.signalLine.length - 1];
    const latestUpperBand = bollingerBands.upperBand[bollingerBands.upperBand.length - 1];
    const latestLowerBand = bollingerBands.lowerBand[bollingerBands.lowerBand.length - 1];

    // Reasons array to track decision-making
    const reasons: string[] = [];

    // Confidence calculation
    let confidence = 0;

    // RSI Analysis
    if (latestRSI < 30) {
      reasons.push('RSI indicates oversold condition');
      confidence += 20;
    } else if (latestRSI > 70) {
      reasons.push('RSI indicates overbought condition');
      confidence -= 20;
    } else {
      reasons.push('RSI indicates steady condition');
    }

    // EMA Trend
    if (latestPrice > latestEMA) {
      reasons.push('Price is above EMA50, bullish trend');
      confidence += 15;
    } else {
      reasons.push('Price is below EMA50, bearish trend');
      confidence -= 15;
    }

    // MACD Analysis
    if (latestMACD > latestSignalLine) {
      reasons.push('MACD shows bullish momentum');
      confidence += 25;
    } else {
      reasons.push('MACD shows bearish momentum');
      confidence -= 25;
    }

    // Bollinger Bands
    if (latestPrice <= latestLowerBand) {
      reasons.push('Price near lower Bollinger Band, potential buy signal');
      confidence += 20;
    } else if (latestPrice >= latestUpperBand) {
      reasons.push('Price near upper Bollinger Band, potential sell signal');
      confidence -= 20;
    } else {
      reasons.push('Bollinger Band indicates steady condition');
    }

    // OBV Trend
    const obvSlope = obv[obv.length - 1] - obv[obv.length - 2];
    if (obvSlope > 0) {
      reasons.push('Positive On-Balance Volume trend');
      confidence += 20;
    } else {
      reasons.push('Negative On-Balance Volume trend');
      confidence -= 20;
    }

    // Golden Cross and Death Cross Analysis
    if (goldenCross) {
      reasons.push('Golden Cross detected: Short-term EMA crossing above long-term EMA');
      confidence += 30;
    }

    if (deathCross) {
      reasons.push('Death Cross detected: Short-term EMA crossing below long-term EMA');
      confidence -= 30;
    }

    // Determine final recommendation
    let recommendation: StrategySignal['recommendation'] = 'HOLD';
    if (confidence > 30) recommendation = 'BUY';
    if (confidence < -30) recommendation = 'SELL';

    // Normalize confidence
    confidence = Math.min(Math.max(confidence, -100), 100);

    return {
      currentPrice: latestPrice,
      recommendation,
      confidence: Math.abs(confidence),
      reasons,
      crossSignals: { goldenCross, deathCross }
    };
  }

  // Additional method to provide detailed cross analysis
  getCrossAnalysis(shortPeriod: number = 50, longPeriod: number = 200) {
    const { goldenCross, deathCross } = this.detectCrosses(shortPeriod, longPeriod);
    const prices = this.data.map(d => d.price);

    const shortTermEMA = this.calculateExponentialMovingAverages(prices, shortPeriod);
    const longTermEMA = this.calculateExponentialMovingAverages(prices, longPeriod);

    return {
      goldenCross,
      deathCross,
      shortTermEMA: {
        current: shortTermEMA[shortTermEMA.length - 1],
        previous: shortTermEMA[shortTermEMA.length - 2]
      },
      longTermEMA: {
        current: longTermEMA[longTermEMA.length - 1],
        previous: longTermEMA[longTermEMA.length - 2]
      }
    };
  }
}

// Perform Trade Analysis
function analyzeToken(tokenData: TokenData[]) {
  const strategy = new TradingStrategy(tokenData);
  const tradingSignal = strategy.generateTradingSignal();
  const crossAnalysis = strategy.getCrossAnalysis();

  return {
    tradingSignal,
    crossAnalysis
  };
}

// Base URL for CoinGecko API
const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';

// Helper function to fetch data from CoinGecko API
async function fetchCoinGeckoData(endpoint: string): Promise<CoinGeckoMarketChartData> {
  try {
    const response = await fetch(`${COINGECKO_API_BASE}${endpoint}`);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching data from CoinGecko:`, error);
    throw error;
  }
}

//
// Trend Direction & Strength Analysis
//
// Current Price vs. EMA50: Compare where the current price is relative to its EMA50:

// Price above EMA50 typically indicates bullish sentiment
// Price below EMA50 typically indicates bearish sentiment

// Crossover Signals
// Golden/Death Crosses: Compare shorter-term EMAs (e.g., EMA20) with the EMA50 for both tokens:

// A shorter EMA crossing above the EMA50 is a "golden cross" (bullish)
// A shorter EMA crossing below the EMA50 is a "death cross" (bearish)

// Decision Framework
// To determine the better choice between two tokens:

// Growth Potential: Choose the token with stronger upward momentum (steeper positive EMA slope)
// Risk Assessment: Consider the token with lower volatility if risk management is important
// Trend Confirmation: Prefer tokens where multiple indicators align (price above EMA50, positive slope, recent golden cross)
// Relative Performance: Select the token with better relative strength compared to the other

const server = new McpServer({
  name: 'Token Analyler MCP',
  version: '1.0.0',
  description: 'MCP Server for Analyzing Tokens or Coins using CoinGecko Marjet Data and various Trend Indicators',
  // capabilities: {
  //   tools: {}, // Enable tools capability
  // },
});

async function analyzeCoinById({ coinId }: { coinId: string; }) {
  let marketData:CoinGeckoMarketChartData;
  if (coinId.indexOf('0x') === 0) {
    // TODO: marketData = await fetchCoinGeckoData(`/coins/${network}/contract/{coinId}/market_chart/range?vs_currency=USD&days=51&from=1742500000&to=1742907964`);
    // ex $MODE on Mode L2: https://api.coingecko.com/api/v3/coins/mode/contract/0xdfc7c877a950e49d2610114102175a06c2e3167a/market_chart/range?vs_currency=USD&days=51&from=1742500000&to=1742907964
    return JSON.stringify({ data: 'TODO: By Contract Address' }, null, 2);
  } else {
    marketData = await fetchCoinGeckoData(`/coins/${coinId}/market_chart?vs_currency=USD&days=51&interval=daily`);
  }
  const historicPrices = marketData?.prices ?? [];
  const historicVolumes = marketData?.total_volumes ?? [];

  const tokenData: TokenData[] = [];
  for (let i = 0; i < historicPrices.length; i++) {
    tokenData.push({
      timestamp: historicPrices[i][0],
      price: historicPrices[i][1],
      volume: historicVolumes[i][1],
    });
  }

  const signal = analyzeToken(tokenData);
  // console.log(signal);
  // output example:
  // {
  //   recommendation: 'BUY',
  //   confidence: 65,
  //   reasons: [
  //     'RSI indicates oversold condition',
  //     'Price is above EMA50, bullish trend',
  //     'MACD shows bullish momentum',
  //     'Price near lower Bollinger Band, potential buy signal',
  //     'Positive On-Balance Volume trend',
  //     'Golden Cross detected: Short-term EMA crossing above long-term EMA'
  //   ]
  // }
  return JSON.stringify(signal, null, 2);
}

// Register weather tools
server.tool(
  "analyzeCoinById",
  "Analyze Coin or Token by ID",
  {
    coinId: z.string().describe("Coin ID or Contract Address to Analyze"),
  },
  async ({ coinId }: { coinId: string; }) => {
    return {
      content: [{
        type: 'text',
        text: await analyzeCoinById({ coinId }),
      }],
    };
  },
);


async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Token Analyler MCP Server running on STDIO");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
