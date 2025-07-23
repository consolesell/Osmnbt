/**
 * AdvancedDerivBot - A sophisticated trading bot for Deriv platform with advanced indicators and strategies
 * @class
 */
class AdvancedDerivBot {
    /**
     * Initialize the trading bot with default configurations
     * @constructor
     */
    constructor() {
        // WebSocket connection
        this.ws = null;
        this.isConnected = false;
        this.isTrading = false;
        this.appId = 1089;
        this.apiToken = null;

        // Trading statistics
        this.balance = 0;
        this.totalTrades = 0;
        this.wins = 0;
        this.losses = 0;
        this.currentStreak = 0;
        this.totalPnL = 0;
        this.currentStake = 1;
        this.initialStake = 1;
        this.lastTradeResult = null;
        this.consecutiveLosses = 0;

        // Market data
        this.currentPrice = 0;
        this.priceHistory = [];
        this.tickHistory = [];
        this.rsi = 0;
        this.movingAverage = 0;
        this.volatility = 0;
        this.bollingerBands = { upper: 0, middle: 0, lower: 0 };
        this.macd = { line: 0, signal: 0, histogram: 0 };
        this.stochastic = { k: 0, d: 0 };
        this.adx = 0;
        this.obv = 0;
        this.sentiment = 0;

        // Trading configuration
        this.config = {
            strategy: 'martingale',
            symbol: 'R_10',
            symbols: ['R_10'], // Support for multiple symbols
            tradeType: 'CALL',
            duration: 60,
            maxLoss: 50,
            maxProfit: 100,
            maxTrades: 50,
            multiplier: 2.1,
            stopLossEnabled: true,
            takeProfitEnabled: true,
            maxDrawdown: 20, // Max drawdown percentage
            maxConsecutiveLosses: 5, // Max consecutive losses before pause
            cooldownPeriod: 300000, // 5 minutes in ms
            positionSizing: 'kelly', // kelly, fixed, volatility
            fixedFraction: 0.02, // 2% of balance
            customStrategyRules: [], // Custom indicator rules
            useMultiTimeframe: true,
            useDynamicSwitching: true,
            trailingProfitThreshold: 0.5 // 50% of stake for dynamic exit
        };

        // Trading state management
        this.tradeQueue = [];
        this.activeContract = null;
        this.lastTradeTime = 0;
        this.minTradeInterval = 5000;
        this.isProcessingQueue = false;
        this.requestIdCounter = 1;
        this.isPaused = false;
        this.historicalData = []; // For backtesting
        this.symbolData = new Map(); // Multi-symbol data
        this.correlations = new Map(); // Symbol correlations
        this.strategyStats = {}; // Per-strategy performance
        this.pauseExtensions = 0; // Track cooldown extensions
        this.maxPauseExtensions = 3; // Max extensions before forced resume

        // Economic calendar (mocked for high-impact events)
        this.newsEvents = [
            { hour: 12, minute: 30, duration: 15, description: 'US Non-Farm Payrolls' }, // 12:30-12:45 UTC
            { hour: 14, minute: 0, duration: 10, description: 'US CPI Release' }, // 14:00-14:10 UTC
            { hour: 8, minute: 30, duration: 15, description: 'EU ECB Rate Decision' } // 8:30-8:45 UTC
        ];

        this.init();
    }

    /**
     * Initialize bot components and event listeners
     */
    init() {
        this.setupEventListeners();
        this.updateUI();
        this.log('Bot initialized successfully', 'info');
    }

    /**
     * Setup all event listeners for UI controls
     */
    setupEventListeners() {
        const addListener = (id, event, handler) => {
            const element = document.getElementById(id);
            if (element) element.addEventListener(event, handler);
        };

        addListener('connect-btn', 'click', () => this.connect());
        addListener('start-btn', 'click', () => this.startTrading());
        addListener('stop-btn', 'click', () => this.stopTrading());
        addListener('reset-btn', 'click', () => this.resetStats());
        addListener('backtest-btn', 'click', () => this.runBacktest());
        addListener('app-id', 'change', (e) => { this.appId = parseInt(e.target.value); });
        addListener('api-token', 'change', (e) => { this.apiToken = e.target.value; });

        const configInputs = [
            'strategy-select', 'symbols', 'trade-type', 'duration', 'stake',
            'max-loss', 'max-profit', 'max-trades', 'multiplier',
            'stop-loss-enabled', 'take-profit-enabled', 'max-drawdown',
            'max-consecutive-losses', 'cooldown-period', 'position-sizing',
            'fixed-fraction', 'custom-strategy-rules', 'multi-timeframe',
            'dynamic-switching'
        ];

        configInputs.forEach(id => {
            addListener(id, 'change', () => this.updateConfig());
        });

        addListener('clear-log', 'click', () => this.clearLog());
    }

    /**
     * Update trading configuration from UI inputs
     */
    updateConfig() {
        const getValue = (id, type = 'string') => {
            const element = document.getElementById(id);
            if (!element) return;
            if (id === 'symbols') {
                return Array.from(element.selectedOptions).map(opt => opt.value);
            }
            return type === 'number' ? parseFloat(element.value) :
                   type === 'integer' ? parseInt(element.value) :
                   type === 'boolean' ? element.checked :
                   type === 'json' ? JSON.parse(element.value || '[]') :
                   element.value;
        };

        try {
            this.config.strategy = getValue('strategy-select');
            this.config.symbols = getValue('symbols');
            this.config.symbol = this.config.symbols[0] || 'R_10';
            this.config.tradeType = getValue('trade-type');
            this.config.duration = getValue('duration', 'integer');
            this.config.maxLoss = getValue('max-loss', 'number');
            this.config.maxProfit = getValue('max-profit', 'number');
            this.config.maxTrades = getValue('max-trades', 'integer');
            this.config.multiplier = getValue('multiplier', 'number');
            this.config.stopLossEnabled = getValue('stop-loss-enabled', 'boolean');
            this.config.takeProfitEnabled = getValue('take-profit-enabled', 'boolean');
            this.config.maxDrawdown = getValue('max-drawdown', 'number');
            this.config.maxConsecutiveLosses = getValue('max-consecutive-losses', 'integer');
            this.config.cooldownPeriod = getValue('cooldown-period', 'integer');
            this.config.positionSizing = getValue('position-sizing');
            this.config.fixedFraction = getValue('fixed-fraction', 'number');
            this.config.customStrategyRules = getValue('custom-strategy-rules', 'json');
            this.config.useMultiTimeframe = getValue('multi-timeframe', 'boolean');
            this.config.useDynamicSwitching = getValue('dynamic-switching', 'boolean');

            this.initialStake = parseFloat(getValue('stake', 'number').toFixed(1));
            this.currentStake = this.initialStake;

            this.log(`Configuration updated: ${this.config.strategy} strategy on ${this.config.symbols.join(', ')}`, 'info');
            this.calculateSymbolCorrelations();
        } catch (error) {
            this.log(`Configuration error: Invalid JSON in custom strategy rules - ${error.message}`, 'error');
        }
    }

    /**
     * Establish WebSocket connection to Deriv API
     */
    async connect() {
        try {
            this.updateConnectionStatus('Connecting...', false);
            const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.isConnected = true;
                this.updateConnectionStatus('Connected', true);
                this.log('WebSocket connected successfully', 'success');

                if (this.apiToken) this.authenticate();
                this.config.symbols.forEach(symbol => this.subscribeToTicks(symbol));
                this.requestBalance();
                this.processQueue();
            };

            this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data));

            this.ws.onclose = () => {
                this.isConnected = false;
                this.updateConnectionStatus('Disconnected', false);
                this.log('WebSocket connection closed', 'warning');

                setTimeout(() => {
                    if (!this.isConnected) {
                        this.log('Attempting to reconnect...', 'info');
                        this.connect();
                    }
                }, 5000);
            };

            this.ws.onerror = (error) => {
                this.log(`WebSocket error: ${error.message || error}`, 'error');
                this.updateConnectionStatus('Error', false);
            };
        } catch (error) {
            this.log(`Connection error: ${error.message}`, 'error');
            this.updateConnectionStatus('Error', false);
        }
    }

    /**
     * Authenticate with Deriv API using token
     */
    authenticate() {
        this.sendMessage({
            authorize: this.apiToken,
            req_id: this.generateReqId()
        });
    }

    /**
     * Request account balance
     */
    requestBalance() {
        this.sendMessage({
            balance: 1,
            req_id: this.generateReqId()
        });
    }

    /**
     * Subscribe to market tick data for a symbol
     * @param {string} symbol - Market symbol
     */
    subscribeToTicks(symbol) {
        this.sendMessage({
            ticks: symbol,
            subscribe: 1,
            req_id: this.generateReqId()
        });
        this.symbolData.set(symbol, { priceHistory: [], tickHistory: [] });
    }

    /**
     * Handle incoming WebSocket messages
     * @param {Object} data - Message data from API
     */
    handleMessage(data) {
        if (data.error) {
            const errorMsg = `API Error: ${data.error.message} (code: ${data.error.code}, req_id: ${data.req_id || 'unknown'})`;
            this.log(errorMsg, 'error');
            if (data.error.code === 'InvalidStake') {
                this.adjustStakeForRetry();
            } else if (data.error.code === 'RateLimit') {
                this.log('Rate limit hit; retrying after delay', 'warning');
                setTimeout(() => this.processQueue(), 1000);
            }
            return;
        }

        switch (data.msg_type) {
            case 'authorize':
                this.log('Authentication successful', 'success');
                this.requestBalance();
                break;
            case 'balance':
                this.balance = data.balance.balance;
                this.updateUI();
                break;
            case 'tick':
                this.processTick(data.tick);
                break;
            case 'proposal':
                this.handleProposal(data.proposal);
                break;
            case 'buy':
                this.handleBuy(data.buy);
                break;
            case 'proposal_open_contract':
                this.handleContractUpdate(data.proposal_open_contract);
                break;
        }
    }

    /**
     * Adjust stake and retry if API rejects due to invalid stake
     */
    adjustStakeForRetry() {
        this.currentStake = parseFloat(Math.max(0.60, this.currentStake - 0.1).toFixed(1));
        this.log(`Retrying with adjusted stake: $${this.currentStake}`, 'warning');
        this.executeTrade(this.config.tradeType, this.config.symbol);
    }

    /**
     * Process market tick data
     * @param {Object} tick - Tick data from API
     */
    processTick(tick) {
        const symbol = tick.symbol;
        const symbolData = this.symbolData.get(symbol) || { priceHistory: [], tickHistory: [] };
        
        this.currentPrice = tick.quote;
        symbolData.priceHistory.push(this.currentPrice);
        symbolData.tickHistory.push({
            time: new Date(tick.epoch * 1000),
            price: this.currentPrice,
            volume: tick.volume || this.estimateVolume(this.currentPrice, symbolData.priceHistory)
        });

        if (symbolData.priceHistory.length > 100) {
            symbolData.priceHistory.shift();
            symbolData.tickHistory.shift();
        }

        if (symbol === this.config.symbol) {
            this.priceHistory = symbolData.priceHistory;
            this.tickHistory = symbolData.tickHistory;
            this.calculateIndicators();
            this.updateUI();
        }

        this.symbolData.set(symbol, symbolData);

        if (this.isTrading && !this.activeContract && !this.isPaused) {
            this.evaluateTradeSignal(symbol);
        }
    }

    /**
     * Estimate volume when Deriv API doesn't provide it
     * @param {number} currentPrice - Current price
     * @param {number[]} priceHistory - Price history
     * @returns {number} Estimated volume
     */
    estimateVolume(currentPrice, priceHistory) {
        if (priceHistory.length < 2) return 1;
        const priceChange = Math.abs(currentPrice - priceHistory[priceHistory.length - 2]);
        return Math.max(1, Math.round(priceChange * 1000));
    }

    /**
     * Calculate technical indicators
     */
    calculateIndicators() {
        if (this.priceHistory.length < 26) {
            this.log('Insufficient data for indicator calculations', 'warning');
            return;
        }

        this.rsi = this.calculateRSI(this.priceHistory, 14);
        this.movingAverage = this.calculateMA(this.priceHistory, 10);
        this.volatility = this.calculateVolatility(this.priceHistory);
        this.bollingerBands = this.calculateBollingerBands(this.priceHistory, 20, 2);
        this.macd = this.calculateMACD(this.priceHistory, 12, 26, 9);
        this.stochastic = this.calculateStochastic(this.priceHistory, 14, 3, 3);
        this.adx = this.calculateADX(this.priceHistory, 14);
        this.obv = this.calculateOBV(this.tickHistory);
        this.sentiment = this.calculateSentiment();

        this.log(`Indicators updated: RSI=${this.rsi.toFixed(2)}, Volatility=${this.volatility.toFixed(2)}%, OBV=${this.obv}`, 'debug');
    }

    /**
     * Calculate Relative Strength Index (RSI)
     * @param {number[]} prices - Price history
     * @param {number} period - RSI period
     * @returns {number} RSI value
     */
    calculateRSI(prices, period) {
        if (prices.length < period + 1) return 0;

        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const change = prices[prices.length - i] - prices[prices.length - i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        const avgGain = gains / period;
        const avgLoss = losses / period || 0.0001;

        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    /**
     * Calculate Moving Average
     * @param {number[]} prices - Price history
     * @param {number} period - MA period
     * @returns {number} MA value
     */
    calculateMA(prices, period) {
        if (prices.length < period) return 0;
        return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
    }

    /**
     * Calculate market volatility (standard deviation of log returns)
     * @param {number[]} prices - Price history
     * @returns {number} Volatility percentage
     */
    calculateVolatility(prices) {
        if (prices.length < 20) return 0;

        const logReturns = prices.slice(1).map((price, i) => 
            Math.log(price / prices[i]) || 0);

        const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
        const variance = logReturns.reduce((sum, ret) => 
            sum + Math.pow(ret - mean, 2), 0) / (logReturns.length - 1);
        
        return Math.sqrt(variance) * 100 * Math.sqrt(252);
    }

    /**
     * Calculate Bollinger Bands
     * @param {number[]} prices - Price history
     * @param {number} period - Period for SMA
     * @param {number} stdDev - Standard deviation multiplier
     * @returns {Object} Upper, middle, and lower bands
     */
    calculateBollingerBands(prices, period, stdDev) {
        if (prices.length < period) return { upper: 0, middle: 0, lower: 0 };

        const sma = this.calculateMA(prices, period);
        const pricesSlice = prices.slice(-period);
        const variance = pricesSlice.reduce((sum, price) => 
            sum + Math.pow(price - sma, 2), 0) / period;
        const std = Math.sqrt(variance);

        return {
            upper: sma + stdDev * std,
            middle: sma,
            lower: sma - stdDev * std
        };
    }

    /**
     * Calculate MACD
     * @param {number[]} prices - Price history
     * @param {number} fast - Fast EMA period
     * @param {number} slow - Slow EMA period
     * @param {number} signal - Signal line period
     * @returns {Object} MACD line, signal line, and histogram
     */
    calculateMACD(prices, fast, slow, signal) {
        if (prices.length < slow + signal) return { line: 0, signal: 0, histogram: 0 };

        const calculateEMA = (prices, period) => {
            const k = 2 / (period + 1);
            let ema = prices[prices.length - period];
            for (let i = prices.length - period + 1; i < prices.length; i++) {
                ema = prices[i] * k + ema * (1 - k);
            }
            return ema;
        };

        const fastEMA = calculateEMA(prices, fast);
        const slowEMA = calculateEMA(prices, slow);
        const macdLine = fastEMA - slowEMA;

        const macdSlice = prices.slice(-signal).map((_, i) => {
            const subSlice = prices.slice(0, prices.length - signal + i + 1);
            return calculateEMA(subSlice, fast) - calculateEMA(subSlice, slow);
        });

        const signalLine = this.calculateMA(macdSlice, signal);
        return {
            line: macdLine,
            signal: signalLine,
            histogram: macdLine - signalLine
        };
    }

    /**
     * Calculate Stochastic Oscillator
     * @param {number[]} prices - Price history
     * @param {number} kPeriod - %K period
     * @param {number} kSlowing - %K slowing period
     * @param {number} dPeriod - %D period
     * @returns {Object} %K and %D values
     */
    calculateStochastic(prices, kPeriod, kSlowing, dPeriod) {
        if (prices.length < kPeriod + kSlowing + dPeriod) return { k: 0, d: 0 };

        const calculateK = () => {
            const slice = prices.slice(-kPeriod);
            const highest = Math.max(...slice);
            const lowest = Math.min(...slice);
            const current = prices[prices.length - 1];
            return ((current - lowest) / (highest - lowest || 0.0001)) * 100;
        };

        const kValues = Array(kSlowing).fill().map((_, i) => {
            const subSlice = prices.slice(0, prices.length - (kSlowing - i - 1));
            const highest = Math.max(...subSlice.slice(-kPeriod));
            const lowest = Math.min(...subSlice.slice(-kPeriod));
            const current = subSlice[subSlice.length - 1];
            return ((current - lowest) / (highest - lowest || 0.0001)) * 100;
        });

        const k = this.calculateMA(kValues, kSlowing);
        const dValues = Array(dPeriod).fill().map((_, i) => {
            const subSlice = prices.slice(0, prices.length - (dPeriod - i - 1));
            const kSubValues = Array(kSlowing).fill().map((__, j) => {
                const subSubSlice = subSlice.slice(0, subSlice.length - (kSlowing - j - 1));
                const highest = Math.max(...subSubSlice.slice(-kPeriod));
                const lowest = Math.min(...subSubSlice.slice(-kPeriod));
                const current = subSubSlice[subSubSlice.length - 1];
                return ((current - lowest) / (highest - lowest || 0.0001)) * 100;
            });
            return this.calculateMA(kSubValues, kSlowing);
        });

        const d = this.calculateMA(dValues, dPeriod);
        return { k, d };
    }

    /**
     * Calculate Average Directional Index (ADX)
     * @param {number[]} prices - Price history
     * @param {number} period - ADX period
     * @returns {number} ADX value
     */
    calculateADX(prices, period) {
        if (prices.length < period + 1) return 0;

        let plusDM = 0, minusDM = 0, trSum = 0;
        for (let i = prices.length - period; i < prices.length; i++) {
            if (i === prices.length - period) continue;
            const high = Math.max(prices[i], prices[i - 1]);
            const low = Math.min(prices[i], prices[i - 1]);
            const prevClose = prices[i - 1];
            const plus = high - prevClose;
            const minus = prevClose - low;
            plusDM += plus > minus && plus > 0 ? plus : 0;
            minusDM += minus > plus && minus > 0 ? minus : 0;
            trSum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        }

        const plusDI = (plusDM / (trSum || 0.0001)) * 100;
        const minusDI = (minusDM / (trSum || 0.0001)) * 100;
        const dx = Math.abs(plusDI - minusDI) / ((plusDI + minusDI) || 0.0001) * 100;
        return dx;
    }

    /**
     * Calculate On-Balance Volume (OBV)
     * @param {Object[]} ticks - Tick history with volume
     * @returns {number} OBV value
     */
    calculateOBV(ticks) {
        if (ticks.length < 2) return 0;

        let obv = 0;
        for (let i = 1; i < ticks.length; i++) {
            const priceChange = ticks[i].price - ticks[i - 1].price;
            const volume = ticks[i].volume || this.estimateVolume(ticks[i].price, ticks.map(t => t.price));
            if (!ticks[i].volume) {
                this.log('Volume data unavailable; using estimated volume for OBV', 'warning');
            }
            obv += priceChange > 0 ? volume : priceChange < 0 ? -volume : 0;
        }
        return obv;
    }

    /**
     * Calculate market sentiment (placeholder for external API)
     * @returns {number} Sentiment score (-1 to 1)
     */
    calculateSentiment() {
        const sentiment = this.rsi < 30 ? 0.5 : this.rsi > 70 ? -0.5 : 0;
        this.log('Using mock sentiment; integrate external API for production', 'warning');
        return sentiment;
    }

    /**
     * Calculate correlation between symbols for diversification
     */
    calculateSymbolCorrelations() {
        if (this.config.symbols.length < 2) return;

        this.correlations.clear();
        for (let i = 0; i < this.config.symbols.length; i++) {
            for (let j = i + 1; j < this.config.symbols.length; j++) {
                const sym1 = this.config.symbols[i];
                const sym2 = this.config.symbols[j];
                const prices1 = this.symbolData.get(sym1)?.priceHistory.slice(-50) || [];
                const prices2 = this.symbolData.get(sym2)?.priceHistory.slice(-50) || [];

                if (prices1.length < 50 || prices2.length < 50) continue;

                const mean1 = prices1.reduce((a, b) => a + b, 0) / prices1.length;
                const mean2 = prices2.reduce((a, b) => a + b, 0) / prices2.length;

                let cov = 0, std1 = 0, std2 = 0;
                for (let k = 0; k < prices1.length; k++) {
                    cov += (prices1[k] - mean1) * (prices2[k] - mean2);
                    std1 += Math.pow(prices1[k] - mean1, 2);
                    std2 += Math.pow(prices2[k] - mean2, 2);
                }

                const correlation = cov / (Math.sqrt(std1) * Math.sqrt(std2) || 0.0001);
                this.correlations.set(`${sym1}-${sym2}`, correlation);
                this.log(`Correlation ${sym1}-${sym2}: ${correlation.toFixed(2)}`, 'debug');
            }
        }
    }

    /**
     * Check market conditions for news and volatility spikes
     * @returns {boolean} Whether conditions are unfavorable
     */
    checkMarketConditions() {
        const now = new Date();
        const hour = now.getUTCHours();
        const minute = now.getUTCMinutes();

        // Check economic calendar events
        const isNewsEvent = this.newsEvents.some(event => {
            const startTime = event.hour * 60 + event.minute;
            const endTime = startTime + event.duration;
            const currentTime = hour * 60 + minute;
            return currentTime >= startTime && currentTime <= endTime;
        });

        if (isNewsEvent) {
            const event = this.newsEvents.find(event => {
                const startTime = event.hour * 60 + event.minute;
                const endTime = startTime + event.duration;
                const currentTime = hour * 60 + minute;
                return currentTime >= startTime && currentTime <= endTime;
            });
            this.log(`Avoiding trade during ${event.description}`, 'warning');
            return true;
        }

        // Check for volatility spikes
        if (this.detectVolatilitySpike()) {
            this.log('Avoiding trade due to volatility spike', 'warning');
            return true;
        }

        return false;
    }

    /**
     * Detect volatility spikes (e.g., >3% price move in 5 ticks)
     * @returns {boolean} Whether a volatility spike is detected
     */
    detectVolatilitySpike() {
        if (this.priceHistory.length < 5) return false;
        const recentPrices = this.priceHistory.slice(-5);
        const maxMove = Math.max(...recentPrices) - Math.min(...recentPrices);
        const movePercent = maxMove / recentPrices[0] * 100;
        return movePercent > 3;
    }

    /**
     * Update strategy performance statistics
     * @param {string} strategy - Strategy name
     * @param {string} result - Trade result (win/loss)
     */
    updateStrategyStats(strategy, result) {
        if (!this.strategyStats[strategy]) {
            this.strategyStats[strategy] = { wins: 0, losses: 0, recentTrades: [] };
        }
        this.strategyStats[strategy][result === 'win' ? 'wins' : 'losses']++;
        this.strategyStats[strategy].recentTrades.push(result);
        if (this.strategyStats[strategy].recentTrades.length > 20) {
            this.strategyStats[strategy].recentTrades.shift();
        }
    }

    /**
     * Select the best strategy based on historical performance
     * @returns {string} Best strategy
     */
    selectBestStrategy() {
        const strategies = ['martingale', 'dalembert', 'trend-follow', 'mean-reversion', 'rsi-strategy', 'grid', 'ml-based', 'custom'];
        let bestStrategy = this.config.strategy;
        let bestScore = -Infinity;

        strategies.forEach(strategy => {
            const stats = this.strategyStats[strategy] || { wins: 0, losses: 0, recentTrades: [] };
            const totalTrades = stats.wins + stats.losses;
            if (totalTrades < 10) return;

            // Weighted win rate: recent trades count 2x
            const recentWins = stats.recentTrades.filter(r => r === 'win').length;
            const recentWeight = 2;
            const winRate = ((stats.wins + recentWins * recentWeight) / (totalTrades + stats.recentTrades.length * recentWeight)) * 100;

            if (winRate > bestScore) {
                bestScore = winRate;
                bestStrategy = strategy;
            }
        });

        if (bestStrategy !== this.config.strategy && bestScore > 40) {
            this.log(`Switching to better strategy: ${bestStrategy} (Win rate: ${bestScore.toFixed(1)}%)`, 'info');
            return bestStrategy;
        }
        return this.config.strategy;
    }

    /**
     * Evaluate trading signals for a symbol
     * @param {string} symbol - Market symbol
     */
    evaluateTradeSignal(symbol) {
        if (Date.now() - this.lastTradeTime < this.minTradeInterval || this.isPaused) return;

        const signal = this.getTradeSignal(symbol);
        if (signal.shouldTrade) {
            const correlatedSignal = this.getCorrelatedSignal(symbol, signal.tradeType);
            if (correlatedSignal.shouldTrade) {
                this.executeTrade(signal.tradeType, symbol);
            } else {
                this.log(`Trade skipped due to lack of correlated confirmation for ${symbol}`, 'warning');
            }
        }
    }

    /**
     * Get correlated signal from other symbols
     * @param {string} symbol - Primary symbol
     * @param {string} tradeType - Trade type
     * @returns {Object} Correlated signal
     */
    getCorrelatedSignal(symbol, tradeType) {
        if (this.config.symbols.length < 2) return { shouldTrade: true };

        const correlatedSymbol = this.config.symbols.find(sym => sym !== symbol);
        if (!correlatedSymbol) return { shouldTrade: true };

        const correlation = this.correlations.get(`${symbol}-${correlatedSymbol}`) || 0;
        if (Math.abs(correlation) > 0.9) {
            this.log(`High correlation (${correlation.toFixed(2)}) with ${correlatedSymbol}; skipping trade`, 'warning');
            return { shouldTrade: false };
        }

        if (Math.abs(correlation) > 0.8) {
            const prices = this.symbolData.get(correlatedSymbol)?.priceHistory.slice(-3) || [];
            if (prices.length < 3) return { shouldTrade: true };

            const isTrending = prices.every((p, i, arr) => i === 0 || (tradeType === 'CALL' ? p > arr[i - 1] : p < arr[i - 1]));
            if (isTrending) {
                this.log(`Correlated ${tradeType} movement in ${correlatedSymbol} (correlation: ${correlation.toFixed(2)})`, 'debug');
                return { shouldTrade: true };
            }
            return { shouldTrade: false };
        }

        return { shouldTrade: true };
    }

    /**
     * Get trading signal based on selected strategy with confirmation
     * @param {string} symbol - Market symbol
     * @returns {Object} Trading signal
     */
    getTradeSignal(symbol) {
        if (this.config.useDynamicSwitching) {
            this.config.strategy = this.selectBestStrategy();
        }

        const signal = (() => {
            switch (this.config.strategy) {
                case 'martingale': return this.getMartingaleSignal();
                case 'dalembert': return this.getDalembertSignal();
                case 'trend-follow': return this.getTrendFollowSignal();
                case 'mean-reversion': return this.getMeanReversionSignal();
                case 'rsi-strategy': return this.getRSISignal();
                case 'grid': return this.getGridSignal(symbol);
                case 'arbitrage': return this.getArbitrageSignal();
                case 'ml-based': return this.getMLBasedSignal();
                case 'custom': return this.getCustomSignal();
                default: return { shouldTrade: false, tradeType: 'CALL' };
            }
        })();

        if (signal.shouldTrade) {
            signal.shouldTrade = this.confirmSignal(signal.tradeType);
        }

        return signal;
    }

    /**
     * Confirm trade signal with multiple indicators
     * @param {string} tradeType - Trade type (CALL/PUT)
     * @returns {boolean} Whether signal is confirmed
     */
    confirmSignal(tradeType) {
        let confirmations = 0;
        const requiredConfirmations = 2;

        if ((tradeType === 'CALL' && this.rsi < 30) || (tradeType === 'PUT' && this.rsi > 70)) {
            confirmations++;
        }

        if ((tradeType === 'CALL' && this.macd.histogram > 0) || (tradeType === 'PUT' && this.macd.histogram < 0)) {
            confirmations++;
        }

        if ((tradeType === 'CALL' && this.stochastic.k < 20) || (tradeType === 'PUT' && this.stochastic.k > 80)) {
            confirmations++;
        }

        if ((tradeType === 'CALL' && this.sentiment > 0.2) || (tradeType === 'PUT' && this.sentiment < -0.2)) {
            confirmations++;
        }

        return confirmations >= requiredConfirmations;
    }

    /**
     * Determine optimal strategy based on market conditions
     * @returns {string} Optimal strategy
     */
    determineOptimalStrategy() {
        const bandWidth = (this.bollingerBands.upper - this.bollingerBands.lower) / this.bollingerBands.middle * 100;
        
        if (this.adx > 25 && bandWidth > 5) return 'trend-follow';
        if (this.volatility < 1 && bandWidth < 3) return 'grid';
        if (this.rsi > 70 || this.rsi < 30) return 'rsi-strategy';
        return 'mean-reversion';
    }

    /**
     * Get Martingale strategy signal
     * @returns {Object} Trading signal
     */
    getMartingaleSignal() {
        return { shouldTrade: true, tradeType: this.config.tradeType };
    }

    /**
     * Get D'Alembert strategy signal
     * @returns {Object} Trading signal
     */
    getDalembertSignal() {
        return { shouldTrade: true, tradeType: this.config.tradeType };
    }

    /**
     * Get Trend Following strategy signal
     * @returns {Object} Trading signal
     */
    getTrendFollowSignal() {
        if (this.priceHistory.length < 10) return { shouldTrade: false };

        const shortMA = this.config.useMultiTimeframe ? this.calculateMA(this.priceHistory, 5) : this.movingAverage;
        return {
            shouldTrade: this.adx > 20,
            tradeType: this.currentPrice > shortMA ? 'CALL' : 'PUT'
        };
    }

    /**
     * Get Mean Reversion strategy signal
     * @returns {Object} Trading signal
     */
    getMeanReversionSignal() {
        if (this.priceHistory.length < 20) return { shouldTrade: false };

        const longMA = this.config.useMultiTimeframe ? this.calculateMA(this.priceHistory, 20) : this.movingAverage;
        const deviation = Math.abs(this.currentPrice - longMA) / longMA * 100;

        if (deviation > this.volatility * 1.5 && this.adx < 20) {
            return {
                shouldTrade: true,
                tradeType: this.currentPrice > longMA ? 'PUT' : 'CALL'
            };
        }
        return { shouldTrade: false };
    }

    /**
     * Get RSI strategy signal
     * @returns {Object} Trading signal
     */
    getRSISignal() {
        if (this.rsi === 0) return { shouldTrade: false };

        return {
            shouldTrade: (this.rsi > 70 || this.rsi < 30),
            tradeType: this.rsi > 70 ? 'PUT' : 'CALL'
        };
    }

    /**
     * Get Grid Trading strategy signal
     * @param {string} symbol - Market symbol
     * @returns {Object} Trading signal
     */
    getGridSignal(symbol) {
        const levels = 5;
        const gridSize = this.volatility * 0.01;
        const currentPrice = this.currentPrice;
        const middlePrice = this.bollingerBands.middle;

        const gridLevel = Math.round((currentPrice - middlePrice) / gridSize);
        if (Math.abs(gridLevel) > levels) return { shouldTrade: false };

        return {
            shouldTrade: this.volatility < 2,
            tradeType: gridLevel > 0 ? 'PUT' : 'CALL'
        };
    }

    /**
     * Get Arbitrage strategy signal
     * @returns {Object} Trading signal
     */
    getArbitrageSignal() {
        if (this.config.symbols.length < 2) return { shouldTrade: false };

        const symbol1 = this.config.symbols[0];
        const symbol2 = this.config.symbols[1];
        const prices1 = this.symbolData.get(symbol1)?.priceHistory.slice(-50) || [];
        const prices2 = this.symbolData.get(symbol2)?.priceHistory.slice(-50) || [];

        if (prices1.length < 50 || prices2.length < 50) return { shouldTrade: false };

        const correlation = this.correlations.get(`${symbol1}-${symbol2}`) || 0;
        if (Math.abs(correlation) > 0.8) {
            this.log(`High correlation (${correlation.toFixed(2)}) between ${symbol1} and ${symbol2}; skipping arbitrage`, 'warning');
            return { shouldTrade: false };
        }

        const price1 = prices1[prices1.length - 1];
        const price2 = prices2[prices2.length - 1];
        const spread = Math.abs(price1 - price2) / Math.min(price1, price2);

        if (spread > 0.01) {
            return {
                shouldTrade: true,
                tradeType: price1 > price2 ? 'PUT' : 'CALL',
                symbol: price1 > price2 ? symbol1 : symbol2
            };
        }
        return { shouldTrade: false };
    }

    /**
     * Get Machine Learning-based strategy signal
     * @returns {Object} Trading signal
     */
    getMLBasedSignal() {
        if (this.historicalData.length < 50) return { shouldTrade: false };

        const recentTrades = this.historicalData.slice(-10);
        const winCount = recentTrades.filter(t => t.result === 'win').length;
        const lossCount = recentTrades.filter(t => t.result === 'loss').length;

        return {
            shouldTrade: winCount > lossCount && this.rsi < 40 && this.sentiment > 0,
            tradeType: 'CALL'
        };
    }

    /**
     * Get Custom strategy signal based on user-defined rules
     * @returns {Object} Trading signal
     */
    getCustomSignal() {
        if (!this.config.customStrategyRules.length) return { shouldTrade: false };

        const conditionsMet = this.config.customStrategyRules.every(rule => {
            switch (rule.indicator) {
                case 'rsi':
                    return rule.operator === '>' ? this.rsi > rule.value : this.rsi < rule.value;
                case 'macd':
                    return rule.operator === '>' ? this.macd.histogram > rule.value : this.macd.histogram < rule.value;
                case 'stochastic':
                    return rule.operator === '>' ? this.stochastic.k > rule.value : this.stochastic.k < rule.value;
                case 'bollinger':
                    return rule.operator === '>' ? this.currentPrice > this.bollingerBands.upper :
                           rule.operator === '<' ? this.currentPrice < this.bollingerBands.lower : false;
                case 'adx':
                    return rule.operator === '>' ? this.adx > rule.value : this.adx < rule.value;
                default:
                    return false;
            }
        });

        return {
            shouldTrade: conditionsMet,
            tradeType: this.config.tradeType
        };
    }

    /**
     * Adjust stake size based on position sizing strategy
     */
    adjustStakeBasedOnStrategy() {
        if (this.lastTradeResult === null) {
            this.currentStake = parseFloat(this.initialStake.toFixed(1));
            return;
        }

        const drawdown = this.balance > 0 ? (this.totalPnL / this.balance) * 100 : 0;
        const volatilityFactor = this.volatility > 2.5 ? 0.5 : 1;
        const drawdownFactor = drawdown < -10 ? 0.75 : 1;

        switch (this.config.positionSizing) {
            case 'fixed':
                this.currentStake = this.balance * this.config.fixedFraction * volatilityFactor * drawdownFactor;
                break;
            case 'volatility':
                this.currentStake = this.initialStake / (1 + this.volatility / 100) * volatilityFactor * drawdownFactor;
                break;
            case 'kelly':
            default:
                this.currentStake = this.calculateOptimalStake() * volatilityFactor * drawdownFactor;
        }

        switch (this.config.strategy) {
            case 'martingale':
                this.currentStake = this.lastTradeResult === 'loss' ?
                    parseFloat((this.currentStake * this.config.multiplier).toFixed(1)) :
                    this.initialStake;
                break;
            case 'dalembert':
                this.currentStake = this.lastTradeResult === 'loss' ?
                    parseFloat((this.currentStake + this.initialStake).toFixed(1)) :
                    parseFloat(Math.max(this.initialStake, this.currentStake - this.initialStake).toFixed(1));
                break;
        }

        this.currentStake = parseFloat(Math.min(this.currentStake, this.balance * 0.1, 100).toFixed(1));
        this.currentStake = parseFloat(Math.max(this.currentStake, 0.35).toFixed(1));
        this.log(`Adjusted stake: $${this.currentStake} (Volatility: ${this.volatility.toFixed(2)}%, Drawdown: ${drawdown.toFixed(2)}%)`, 'debug');
    }

    /**
     * Execute a trade with specified parameters
     * @param {string} tradeType - Type of trade (CALL/PUT)
     * @param {string} symbol - Market symbol
     */
    async executeTrade(tradeType, symbol) {
        if (!this.isConnected || !this.isTrading || !this.shouldExecuteTrade() || this.isPaused) return;

        this.adjustStakeBasedOnStrategy();

        const proposalRequest = {
            proposal: 1,
            amount: this.currentStake,
            basis: "stake",
            contract_type: tradeType,
            currency: "USD",
            symbol: symbol || this.config.symbol,
            duration: this.config.duration,
            duration_unit: "s",
            req_id: this.generateReqId()
        };

        this.sendMessage(proposalRequest);
        this.lastTradeTime = Date.now();
        this.log(`Proposal requested: ${tradeType} ${symbol || this.config.symbol} - $${this.currentStake}`, 'info');
    }

    /**
     * Check if trade execution is allowed based on risk management
     * @returns {boolean} Whether trade should be executed
     */
    shouldExecuteTrade() {
        if (this.checkMarketConditions()) {
            this.adaptiveCooldown();
            return false;
        }

        if (this.totalTrades >= this.config.maxTrades) {
            this.log('Maximum trades reached for this session', 'warning');
            this.stopTrading();
            return false;
        }

        if (this.config.stopLossEnabled && this.totalPnL <= -this.config.maxLoss) {
            this.log('Stop loss triggered', 'warning');
            this.stopTrading();
            return false;
        }

        if (this.config.takeProfitEnabled && this.totalPnL >= this.config.maxProfit) {
            this.log('Take profit triggered', 'success');
            this.stopTrading();
            return false;
        }

        if (this.currentStake > this.balance) {
            this.log('Insufficient balance for trade', 'error');
            this.stopTrading();
            return false;
        }

        const drawdown = this.balance > 0 ? (this.totalPnL / this.balance) * 100 : 0;
        if (drawdown <= -this.config.maxDrawdown) {
            this.log('Maximum drawdown reached', 'warning');
            this.adaptiveCooldown();
            return false;
        }

        if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
            this.log('Maximum consecutive losses reached', 'warning');
            this.adaptiveCooldown();
            return false;
        }

        const bandWidth = (this.bollingerBands.upper - this.bollingerBands.lower) / this.bollingerBands.middle * 100;
        if (bandWidth > 10) {
            this.log('Trading paused due to wide Bollinger Bands', 'warning');
            this.adaptiveCooldown();
            return false;
        }

        return true;
    }

    /**
     * Adaptive cooldown logic based on market conditions
     */
    adaptiveCooldown() {
        if (this.pauseExtensions >= this.maxPauseExtensions) {
            this.log('Maximum pause extensions reached; resuming trading', 'info');
            this.isPaused = false;
            this.consecutiveLosses = 0;
            this.pauseExtensions = 0;
            return;
        }

        const currentTrend = this.detectMarketTrend();
        const isUnfavorable = currentTrend === 'sideways' || this.volatility > 2.5 || this.adx > 25;

        if (isUnfavorable) {
            this.isPaused = true;
            this.pauseExtensions++;
            this.log(`Paused due to unfavorable conditions (Trend: ${currentTrend}, Volatility: ${this.volatility.toFixed(2)}%, ADX: ${this.adx.toFixed(2)})`, 'warning');
            setTimeout(() => {
                if (this.isTrading && !this.checkMarketConditions() && this.detectMarketTrend() !== 'sideways' && this.volatility <= 2.5 && this.adx <= 25) {
                    this.isPaused = false;
                    this.consecutiveLosses = 0;
                    this.pauseExtensions = 0;
                    this.log('Resuming after adaptive cooldown', 'info');
                } else {
                    this.log('Extending cooldown due to persistent unfavorable conditions', 'warning');
                    this.adaptiveCooldown();
                }
            }, this.config.cooldownPeriod);
        }
    }

    /**
     * Check for dynamic exit conditions
     * @param {Object} contract - Contract update data
     * @returns {boolean} Whether to exit early
     */
    checkDynamicExit(contract) {
        if (!contract.profit || !contract.current_spot) return false;

        const profitRatio = contract.profit / this.currentStake;
        const isReversing = (contract.current_spot > this.bollingerBands.upper && this.macd.histogram < 0) ||
                           (contract.current_spot < this.bollingerBands.lower && this.macd.histogram > 0);

        if (profitRatio > this.config.trailingProfitThreshold && isReversing) {
            this.log(`Triggering early exit to lock profit: $${contract.profit.toFixed(2)}`, 'info');
            this.sendMessage({ sell: contract.contract_id, price: contract.current_spot, req_id: this.generateReqId() });
            return true;
        }
        return false;
    }

    /**
     * Handle trade proposal response
     * @param {Object} proposal - Proposal data from API
     */
    handleProposal(proposal) {
        if (proposal.id) {
            this.sendMessage({
                buy: proposal.id,
                price: this.currentStake,
                req_id: this.generateReqId()
            });
            this.log(`Buying contract: ${proposal.display_name} - $${this.currentStake}`, 'info');
        }
    }

    /**
     * Handle contract purchase response
     * @param {Object} buy - Buy response from API
     */
    handleBuy(buy) {
        if (buy.contract_id) {
            this.activeContract = {
                id: buy.contract_id,
                stake: this.currentStake,
                type: buy.shortcode,
                buyPrice: buy.buy_price,
                startTime: new Date(),
                symbol: buy.symbol
            };

            this.sendMessage({
                proposal_open_contract: 1,
                contract_id: buy.contract_id,
                subscribe: 1,
                req_id: this.generateReqId()
            });

            this.log(`Contract purchased: ${buy.contract_id} - $${buy.buy_price}`, 'success');
        }
    }

    /**
     * Handle contract status updates
     * @param {Object} contract - Contract update data
     */
    handleContractUpdate(contract) {
        if (!this.activeContract) return;

        if (this.config.takeProfitEnabled && this.checkDynamicExit(contract)) {
            return;
        }

        const isWin = contract.is_sold && parseFloat(contract.sell_price) > parseFloat(contract.buy_price);
        const pnl = contract.is_sold ? 
            parseFloat(contract.sell_price) - parseFloat(contract.buy_price) : 0;

        if (contract.is_sold) {
            this.totalTrades++;
            this.totalPnL += pnl;

            if (isWin) {
                this.wins++;
                this.currentStreak = this.currentStreak > 0 ? this.currentStreak + 1 : 1;
                this.lastTradeResult = 'win';
                this.consecutiveLosses = 0;
                this.log(`Trade WON: +$${pnl.toFixed(2)}`, 'success');
            } else {
                this.losses++;
                this.currentStreak = this.currentStreak < 0 ? this.currentStreak - 1 : -1;
                this.lastTradeResult = 'loss';
                this.consecutiveLosses++;
                this.log(`Trade LOST: -$${Math.abs(pnl).toFixed(2)}`, 'error');
                this.adaptiveCooldown();
            }

            this.updateStrategyStats(this.config.strategy, this.lastTradeResult);
            this.historicalData.push({
                result: this.lastTradeResult,
                pnl,
                symbol: this.activeContract.symbol,
                timestamp: new Date(),
                price: this.currentPrice
            });

            this.activeContract = null;
            this.requestBalance();
            this.updateUI();
        }
    }

    /**
     * Run backtest on historical data
     */
    runBacktest() {
        if (this.historicalData.length < 50) {
            this.log('Insufficient historical data for backtesting', 'error');
            return;
        }

        let simulatedPnL = 0;
        let simulatedTrades = 0;
        let simulatedWins = 0;

        this.historicalData.forEach((tick, i) => {
            if (i < 26) return;
            this.priceHistory = this.historicalData.slice(0, i + 1).map(t => t.price);
            this.tickHistory = this.historicalData.slice(0, i + 1).map(t => ({
                price: t.price,
                volume: this.estimateVolume(t.price, this.priceHistory)
            }));
            this.calculateIndicators();
            const signal = this.getTradeSignal(this.config.symbol);
            if (signal.shouldTrade) {
                simulatedTrades++;
                const slippage = this.volatility * 0.01;
                const fee = this.currentStake * 0.01;
                const outcome = this.simulateTradeOutcome(signal.tradeType, this.priceHistory, i);
                const simulatedStake = parseFloat(this.calculateOptimalStake().toFixed(1));
                const profit = outcome === 'win' ? simulatedStake * 0.85 - fee : -simulatedStake - fee;
                simulatedPnL += profit;
                if (outcome === 'win') simulatedWins++;
                this.log(`Backtest trade: ${signal.tradeType} - ${outcome}, P&L: $${profit.toFixed(2)}`, 'info');
            }
        });

        const winRate = simulatedTrades > 0 ? (simulatedWins / simulatedTrades * 100).toFixed(1) : 0;
        this.log(`Backtest completed: ${simulatedTrades} trades, ${winRate}% win rate, P&L: $${simulatedPnL.toFixed(2)}`, 'success');
    }

    /**
     * Simulate trade outcome for backtesting
     * @param {string} tradeType - Trade type
     * @param {number[]} prices - Price history
     * @param {number} index - Current index
     * @returns {string} Outcome (win/loss)
     */
    simulateTradeOutcome(tradeType, prices, index) {
        if (index >= prices.length - 1) return 'loss';
        const futurePrice = prices[index + 1];
        const currentPrice = prices[index];
        return (tradeType === 'CALL' && futurePrice > currentPrice) ||
               (tradeType === 'PUT' && futurePrice < currentPrice) ? 'win' : 'loss';
    }

    /**
     * Start automated trading
     */
    startTrading() {
        if (!this.isConnected) {
            this.log('Please connect to Deriv first', 'error');
            return;
        }

        if (!this.apiToken) {
            this.log('Please enter your API token', 'error');
            return;
        }

        this.isTrading = true;
        this.isPaused = false;
        this.pauseExtensions = 0;
        this.updateConfig();

        document.getElementById('start-btn').disabled = true;
        document.getElementById('stop-btn').disabled = false;

        this.log(`Trading started with ${this.config.strategy} strategy`, 'success');
        this.log(`Risk Management: Max Loss: $${this.config.maxLoss}, Max Profit: $${this.config.maxProfit}, Max Drawdown: ${this.config.maxDrawdown}%`, 'info');
    }

    /**
     * Stop automated trading
     */
    stopTrading() {
        this.isTrading = false;
        this.isPaused = false;
        this.pauseExtensions = 0;
        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;

        const winRate = this.totalTrades > 0 ? (this.wins / this.totalTrades * 100).toFixed(1) : 0;
        this.log('Trading stopped', 'warning');
        this.log(`Session Summary: ${this.totalTrades} trades, ${winRate}% win rate, P&L: $${this.totalPnL.toFixed(2)}`, 'info');
    }

    /**
     * Reset trading statistics
     */
    resetStats() {
        this.totalTrades = 0;
        this.wins = 0;
        this.losses = 0;
        this.currentStreak = 0;
        this.totalPnL = 0;
        this.currentStake = parseFloat(this.initialStake.toFixed(1));
        this.lastTradeResult = null;
        this.consecutiveLosses = 0;
        this.historicalData = [];
        this.strategyStats = {};
        this.pauseExtensions = 0;

        this.updateUI();
        this.log('Statistics reset', 'info');
    }

    /**
     * Update connection status UI
     * @param {string} status - Connection status message
     * @param {boolean} connected - Connection state
     */
    updateConnectionStatus(status, connected) {
        const statusElement = document.getElementById('connection-status');
        const indicator = document.getElementById('status-indicator');
        
        if (statusElement) statusElement.textContent = status;
        if (indicator) indicator.classList.toggle('connected', connected);
    }

    /**
     * Update UI with current trading statistics and market data
     */
    updateUI() {
        const elements = {
            'total-trades': this.totalTrades,
            'wins': this.wins,
            'losses': this.losses,
            'win-rate': `${this.totalTrades > 0 ? (this.wins / this.totalTrades * 100).toFixed(1) : 0}%`,
            'current-streak': this.currentStreak,
            'total-pnl': `$${this.totalPnL.toFixed(2)}`,
            'balance': `$${this.balance.toFixed(2)}`,
            'last-trade': this.lastTradeResult || '-',
            'current-price': this.currentPrice.toFixed(5),
            'rsi-value': this.rsi.toFixed(2),
            'ma-value': this.movingAverage.toFixed(5),
            'volatility-value': `${this.volatility.toFixed(2)}%`,
            'bollinger-upper': this.bollingerBands.upper.toFixed(5),
            'bollinger-middle': this.bollingerBands.middle.toFixed(5),
            'bollinger-lower': this.bollingerBands.lower.toFixed(5),
            'macd-line': this.macd.line.toFixed(5),
            'macd-signal': this.macd.signal.toFixed(5),
            'macd-histogram': this.macd.histogram.toFixed(5),
            'stochastic-k': this.stochastic.k.toFixed(2),
            'stochastic-d': this.stochastic.d.toFixed(2),
            'adx-value': this.adx.toFixed(2),
            'obv-value': this.obv.toFixed(2),
            'sentiment-value': this.sentiment.toFixed(2)
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });

        const totalPnLElement = document.getElementById('total-pnl');
        if (totalPnLElement) {
            totalPnLElement.className = `stat-value ${this.totalPnL >= 0 ? 'profit' : 'loss'}`;
        }
    }

    /**
     * Log messages to UI
     * @param {string} message - Log message
     * @param {string} type - Log type (info, success, warning, error, debug)
     */
    log(message, type = 'info') {
        const logContainer = document.getElementById('log-content');
        if (!logContainer) return;

        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.innerHTML = `
            <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
            ${message}
        `;

        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;

        const entries = logContainer.querySelectorAll('.log-entry');
        if (entries.length > 100) entries[0].remove();
    }

    /**
     * Clear log messages
     */
    clearLog() {
        const logContainer = document.getElementById('log-content');
        if (logContainer) logContainer.innerHTML = '';
    }

    /**
     * Send message to WebSocket with validation and queuing
     * @param {Object} message - Message to send
     */
    sendMessage(message) {
        if (!this.ws || !this.isConnected) {
            this.log('Cannot send message: WebSocket not connected', 'error');
            return;
        }

        if (!message.req_id) {
            message.req_id = this.generateReqId();
        }

        this.tradeQueue.push(message);
        this.processQueue();
    }

    /**
     * Process queued messages with rate limiting
     */
    processQueue() {
        if (this.tradeQueue.length === 0 || this.isProcessingQueue) return;

        this.isProcessingQueue = true;
        const message = this.tradeQueue.shift();

        try {
            this.ws.send(JSON.stringify(message));
            this.log(`Sent request with req_id: ${message.req_id}`, 'debug');
        } catch (error) {
            this.log(`Failed to send message: ${error.message}`, 'error');
        }

        setTimeout(() => {
            this.isProcessingQueue = false;
            this.processQueue();
        }, 100);
    }

    /**
     * Generate unique request ID as an integer
     * @returns {number} Unique request ID
     */
    generateReqId() {
        const reqId = this.requestIdCounter++;
        if (this.requestIdCounter > Number.MAX_SAFE_INTEGER) {
            this.requestIdCounter = 1;
        }
        return reqId;
    }

    /**
     * Detect current market trend
     * @returns {string} Market trend (uptrend, downtrend, sideways)
     */
    detectMarketTrend() {
        if (this.priceHistory.length < 20) return 'sideways';

        const recent = this.priceHistory.slice(-10);
        const older = this.priceHistory.slice(-20, -10);

        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const trendStrength = Math.abs(recentAvg - olderAvg) / olderAvg * 100;

        return trendStrength < 0.1 ? 'sideways' :
               recentAvg > olderAvg ? 'uptrend' : 'downtrend';
    }

    /**
     * Calculate support and resistance levels
     * @returns {Object} Support and resistance levels
     */
    calculateSupportResistance() {
        if (this.priceHistory.length < 50) return { support: 0, resistance: 0 };

        const prices = this.priceHistory.slice(-50);
        const sortedPrices = [...prices].sort((a, b) => a - b);

        return {
            support: sortedPrices[Math.floor(sortedPrices.length * 0.2)],
            resistance: sortedPrices[Math.floor(sortedPrices.length * 0.8)]
        };
    }

    /**
     * Calculate optimal stake size using Kelly Criterion or other methods
     * @returns {number} Optimal stake amount
     */
    calculateOptimalStake() {
        const winRate = this.totalTrades > 0 ? this.wins / this.totalTrades : 0.5;
        const avgWin = this.wins > 0 ? this.totalPnL / this.wins : 0.85;
        const avgLoss = this.losses > 0 ? Math.abs(this.totalPnL) / this.losses : 1;

        const kellyFraction = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;
        return parseFloat(Math.max(0.35, Math.min(this.balance * kellyFraction * 0.1, 10)).toFixed(1));
    }

    /**
     * Get performance metrics
     * @returns {Object} Performance statistics
     */
    getPerformanceMetrics() {
        const winRate = this.totalTrades > 0 ? this.wins / this.totalTrades : 0;
        const avgWin = this.wins > 0 ? this.totalPnL / this.wins : 0;
        const avgLoss = this.losses > 0 ? Math.abs(this.totalPnL) / this.losses : 0;
        const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

        return {
            winRate,
            avgWin,
            avgLoss,
            profitFactor,
            totalPnL: this.totalPnL,
            totalTrades: this.totalTrades
        };
    }

    /**
     * Optimize trading strategy based on performance
     */
    optimizeStrategy() {
        const metrics = this.getPerformanceMetrics();

        if (this.totalTrades > 20) {
            const stats = this.strategyStats[this.config.strategy] || { wins: 0, losses: 0 };
            const totalTrades = stats.wins + stats.losses;
            const winRate = totalTrades > 0 ? (stats.wins / totalTrades * 100) : 0;

            if (winRate < 40 && totalTrades >= 20) {
                const newStrategy = this.selectBestStrategy();
                if (newStrategy !== this.config.strategy) {
                    this.config.strategy = newStrategy;
                    document.getElementById('strategy-select').value = newStrategy;
                }
            }

            if (metrics.winRate < 0.4) {
                this.config.multiplier = Math.min(this.config.multiplier * 1.1, 3);
                this.config.maxLoss *= 1.1;
                this.log(`Adjusted multiplier to ${this.config.multiplier.toFixed(2)}, max loss to $${this.config.maxLoss.toFixed(2)}`, 'info');
            } else if (metrics.winRate > 0.6) {
                this.config.multiplier = Math.max(this.config.multiplier * 0.9, 1.5);
                this.config.maxLoss *= 0.9;
                this.log(`Adjusted multiplier to ${this.config.multiplier.toFixed(2)}, max loss to $${this.config.maxLoss.toFixed(2)}`, 'info');
            }
        }
    }
}

/**
 * Initialize bot and setup global event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
    window.derivBot = new AdvancedDerivBot();

    // Auto-save configuration
    setInterval(() => {
        if (window.derivBot) {
            localStorage.setItem('derivBotConfig', JSON.stringify(window.derivBot.config));
        }
    }, 30000);

    // Load saved configuration
    const savedConfig = localStorage.getItem('derivBotConfig');
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            Object.assign(window.derivBot.config, config);

            const updateConfigElement = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.value = value;
            };

            const updateConfigCheckbox = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.checked = value !== false;
            };

            const updateConfigMultiSelect = (id, values) => {
                const element = document.getElementById(id);
                if (element) {
                    Array.from(element.options).forEach(option => {
                        option.selected = values.includes(option.value);
                    });
                }
            };

            updateConfigElement('strategy-select', config.strategy || 'martingale');
            updateConfigMultiSelect('symbols', config.symbols || ['R_10']);
            updateConfigElement('trade-type', config.tradeType || 'CALL');
            updateConfigElement('duration', config.duration || 60);
            updateConfigElement('stake', config.initialStake || 1);
            updateConfigElement('max-loss', config.maxLoss || 50);
            updateConfigElement('max-profit', config.maxProfit || 100);
            updateConfigElement('max-trades', config.maxTrades || 50);
            updateConfigElement('multiplier', config.multiplier || 2.1);
            updateConfigElement('max-drawdown', config.maxDrawdown || 20);
            updateConfigElement('max-consecutive-losses', config.maxConsecutiveLosses || 5);
            updateConfigElement('cooldown-period', config.cooldownPeriod || 300000);
            updateConfigElement('position-sizing', config.positionSizing || 'kelly');
            updateConfigElement('fixed-fraction', config.fixedFraction || 0.02);
            updateConfigElement('custom-strategy-rules', JSON.stringify(config.customStrategyRules || []));
            updateConfigCheckbox('multi-timeframe', config.useMultiTimeframe);
            updateConfigCheckbox('dynamic-switching', config.useDynamicSwitching);
            updateConfigCheckbox('stop-loss-enabled', config.stopLossEnabled);
            updateConfigCheckbox('take-profit-enabled', config.takeProfitEnabled);

            window.derivBot.log('Configuration loaded from saved settings', 'info');
        } catch (error) {
            console.error('Error loading saved configuration:', error);
            window.derivBot.log('Error loading saved configuration', 'error');
        }
    }

    // Performance monitoring
    setInterval(() => {
        if (window.derivBot && window.derivBot.isTrading) {
            window.derivBot.optimizeStrategy();
        }
    }, 60000);
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedDerivBot;
}
