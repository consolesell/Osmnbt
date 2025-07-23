/**
 * IndicatorManager - Manages technical indicators for trading
 * @class
 */
export class IndicatorManager {
    constructor() {
        this.indicators = {
            rsi: 0,
            movingAverage: 0,
            bollingerBands: { upper: 0, middle: 0, lower: 0 },
            macd: { line: 0, signal: 0, histogram: 0 },
            stochastic: { k: 0, d: 0 },
            adx: 0,
            obv: 0,
            sentiment: 0,
            volatility: 0
        };
        this.correlations = new Map();
    }

    /**
     * Update indicators based on candle data
     * @param {Array<Object>} candles - Array of candle objects
     */
    updateIndicators(candles) {
        if (!candles || candles.length < 20) {
            console.warn('Insufficient candle data for indicators');
            return;
        }

        this.indicators.rsi = this.calculateRSI(candles);
        this.indicators.movingAverage = this.calculateMA(candles, 20);
        this.indicators.bollingerBands = this.calculateBollingerBands(candles);
        this.indicators.macd = this.calculateMACD(candles);
        this.indicators.stochastic = this.calculateStochastic(candles);
        this.indicators.adx = this.calculateADX(candles);
        this.indicators.obv = this.calculateOBV(candles);
        this.indicators.sentiment = this.calculateSentiment(candles);
        this.indicators.volatility = this.calculateVolatility(candles);
    }

    /**
     * Calculate RSI
     * @param {Array<Object>} candles - Array of candle objects
     * @returns {number} RSI value
     */
    calculateRSI(candles, period = 14) {
        if (candles.length < period + 1) return 0;

        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = candles[candles.length - i].close - candles[candles.length - i - 1].close;
            if (diff > 0) gains += diff;
            else losses -= diff;
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgGain / (avgLoss || 1);
        return 100 - (100 / (1 + rs));
    }

    /**
     * Calculate Moving Average
     * @param {Array<Object>} candles - Array of candle objects
     * @param {number} period - MA period
     * @returns {number} MA value
     */
    calculateMA(candles, period = 20) {
        if (candles.length < period) return 0;
        const sum = candles.slice(-period).reduce((sum, candle) => sum + candle.close, 0);
        return sum / period;
    }

    /**
     * Calculate Bollinger Bands
     * @param {Array<Object>} candles - Array of candle objects
     * @returns {Object} Bollinger Bands {upper, middle, lower}
     */
    calculateBollingerBands(candles, period = 20, multiplier = 2) {
        if (candles.length < period) return { upper: 0, middle: 0, lower: 0 };

        const middle = this.calculateMA(candles, period);
        const prices = candles.slice(-period).map(c => c.close);
        const stdDev = Math.sqrt(prices.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period);
        return {
            upper: middle + stdDev * multiplier,
            middle,
            lower: middle - stdDev * multiplier
        };
    }

    /**
     * Calculate MACD
     * @param {Array<Object>} candles - Array of candle objects
     * @returns {Object} MACD {line, signal, histogram}
     */
    calculateMACD(candles, fast = 12, slow = 26, signal = 9) {
        if (candles.length < slow + signal) return { line: 0, signal: 0, histogram: 0 };

        const fastEMA = this.calculateEMA(candles, fast);
        const slowEMA = this.calculateEMA(candles, slow);
        const line = fastEMA - slowEMA;

        const signalPrices = candles.slice(-signal).map((_, i) => {
            const slice = candles.slice(-(signal - i + slow), -(signal - i));
            return this.calculateEMA(slice, fast) - this.calculateEMA(slice, slow);
        });
        const signalLine = signalPrices.reduce((sum, val) => sum + val, 0) / signal;

        return {
            line,
            signal: signalLine,
            histogram: line - signalLine
        };
    }

    /**
     * Calculate EMA
     * @param {Array<Object>} candles - Array of candle objects
     * @param {number} period - EMA period
     * @returns {number} EMA value
     */
    calculateEMA(candles, period) {
        if (candles.length < period) return 0;

        const k = 2 / (period + 1);
        let ema = candles[candles.length - period].close;
        for (let i = candles.length - period + 1; i < candles.length; i++) {
            ema = candles[i].close * k + ema * (1 - k);
        }
        return ema;
    }

    /**
     * Calculate Stochastic Oscillator
     * @param {Array<Object>} candles - Array of candle objects
     * @returns {Object} Stochastic {k, d}
     */
    calculateStochastic(candles, period = 14, smooth = 3) {
        if (candles.length < period + smooth) return { k: 0, d: 0 };

        const recent = candles.slice(-period);
        const highest = Math.max(...recent.map(c => c.high));
        const lowest = Math.min(...recent.map(c => c.low));
        const k = ((candles[candles.length - 1].close - lowest) / (highest - lowest || 1)) * 100;

        const kValues = [];
        for (let i = 0; i < smooth; i++) {
            const slice = candles.slice(-(period + i), -(i || 1));
            const high = Math.max(...slice.map(c => c.high));
            const low = Math.min(...slice.map(c => c.low));
            kValues.push(((candles[candles.length - 1 - i].close - low) / (high - low || 1)) * 100);
        }
        const d = kValues.reduce((sum, val) => sum + val, 0) / smooth;

        return { k, d };
    }

    /**
     * Calculate ADX
     * @param {Array<Object>} candles - Array of candle objects
     * @returns {number} ADX value
     */
    calculateADX(candles, period = 14) {
        if (candles.length < period + 1) return 0;

        let plusDM = 0, minusDM = 0, trSum = 0;
        for (let i = 1; i <= period; i++) {
            const curr = candles[candles.length - i];
            const prev = candles[candles.length - i - 1];
            const upMove = curr.high - prev.high;
            const downMove = prev.low - curr.low;
            plusDM += upMove > downMove && upMove > 0 ? upMove : 0;
            minusDM += downMove > upMove && downMove > 0 ? downMove : 0;
            trSum += Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
        }

        const plusDI = (plusDM / (trSum || 1)) * 100;
        const minusDI = (minusDM / (trSum || 1)) * 100;
        const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1) * 100;
        return dx;
    }

    /**
     * Calculate OBV
     * @param {Array<Object>} candles - Array of candle objects
     * @returns {number} OBV value
     */
    calculateOBV(candles) {
        if (candles.length < 2) return 0;

        let obv = 0;
        for (let i = 1; i < candles.length; i++) {
            const curr = candles[i];
            const prev = candles[i - 1];
            if (curr.close > prev.close) obv += curr.volume;
            else if (curr.close < prev.close) obv -= curr.volume;
        }
        return obv;
    }

    /**
     * Calculate market sentiment (placeholder)
     * @param {Array<Object>} candles - Array of candle objects
     * @returns {number} Sentiment score
     */
    calculateSentiment(candles) {
        if (candles.length < 10) return 0;
        const recent = candles.slice(-10);
        const bullish = recent.filter(c => c.close > c.open).length;
        return (bullish / 10 - 0.5) * 100;
    }

    /**
     * Calculate volatility
     * @param {Array<Object>} candles - Array of candle objects
     * @returns {number} Volatility percentage
     */
    calculateVolatility(candles, period = 20) {
        if (candles.length < period) return 0;

        const prices = candles.slice(-period).map(c => c.close);
        const mean = prices.reduce((sum, p) => sum + p, 0) / period;
        const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
        return Math.sqrt(variance) / mean * 100;
    }

    /**
     * Calculate Pearson correlation between two symbols
     * @param {Array<Object>} candles1 - Candles for first symbol
     * @param {Array<Object>} candles2 - Candles for second symbol
     * @returns {number} Correlation coefficient
     */
    calculateCorrelation(candles1, candles2) {
        if (!candles1.length || !candles2.length || candles1.length !== candles2.length) return 0;

        const n = Math.min(candles1.length, candles2.length, 50);
        const x = candles1.slice(-n).map(c => c.close);
        const y = candles2.slice(-n).map(c => c.close);

        const meanX = x.reduce((sum, val) => sum + val, 0) / n;
        const meanY = y.reduce((sum, val) => sum + val, 0) / n;

        let cov = 0, stdX = 0, stdY = 0;
        for (let i = 0; i < n; i++) {
            cov += (x[i] - meanX) * (y[i] - meanY);
            stdX += Math.pow(x[i] - meanX, 2);
            stdY += Math.pow(y[i] - meanY, 2);
        }

        return cov / (Math.sqrt(stdX) * Math.sqrt(stdY) || 1);
    }

    /**
     * Update correlations for all symbol pairs
     * @param {Map<string, Array<Object>>} candlesMap - Map of symbol to candles
     */
    updateCorrelations(candlesMap) {
        this.correlations.clear();
        const symbols = Array.from(candlesMap.keys());
        for (let i = 0; i < symbols.length; i++) {
            for (let j = i + 1; j < symbols.length; j++) {
                const pair = `${symbols[i]}-${symbols[j]}`;
                const correlation = this.calculateCorrelation(
                    candlesMap.get(symbols[i]),
                    candlesMap.get(symbols[j])
                );
                this.correlations.set(pair, correlation);
            }
        }
    }

    /**
     * Get current indicators
     * @returns {Object} Current indicator values
     */
    getIndicators() {
        return { ...this.indicators };
    }

    /**
     * Get correlations
     * @returns {Map<string, number>} Symbol pair correlations
     */
    getCorrelations() {
        return this.correlations;
    }
}