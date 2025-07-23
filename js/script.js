/**
 * AdvancedDerivBot - A sophisticated trading bot for Deriv platform with modular candle and indicator support
 * @class
 */
import { CandleManager } from './candles.js';
import { IndicatorManager } from './indicators.js';

class AdvancedDerivBot {
    constructor() {
        // WebSocket connection
        this.ws = null;
        this.isConnected = false;
        this.isTrading = false;
        this.appId = 1089;
        this.apiToken = null;
        this.connectionRetries = 0;
        this.maxRetries = 3;
        this.debugMode = true; // Enable verbose logging for debugging

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
        this.candleManager = new CandleManager({ timeframe: 60 });
        this.indicatorManager = new IndicatorManager();

        // Trading configuration
        this.config = {
            strategy: 'martingale',
            symbol: 'R_10',
            symbols: ['R_10'],
            tradeType: 'CALL',
            duration: 60,
            maxLoss: 50,
            maxProfit: 100,
            maxTrades: 50,
            multiplier: 2.1,
            stopLossEnabled: true,
            takeProfitEnabled: true,
            maxDrawdown: 20,
            maxConsecutiveLosses: 5,
            cooldownPeriod: 300000,
            positionSizing: 'kelly',
            fixedFraction: 0.02,
            customStrategyRules: [],
            useMultiTimeframe: true,
            useDynamicSwitching: true,
            trailingProfitThreshold: 0.5,
            useCandlePatterns: true,
            candleTimeframe: 60,
            chartType: 'line'
        };

        // Trading state management
        this.tradeQueue = [];
        this.activeContract = null;
        this.lastTradeTime = 0;
        this.minTradeInterval = 5000;
        this.isProcessingQueue = false;
        this.requestIdCounter = 1;
        this.isPaused = false;
        this.historicalData = [];
        this.strategyStats = {};
        this.pauseExtensions = 0;
        this.maxPauseExtensions = 3;

        // Economic calendar
        this.newsEvents = [
            { hour: 12, minute: 30, duration: 15, description: 'US Non-Farm Payrolls' },
            { hour: 14, minute: 0, duration: 10, description: 'US CPI Release' },
            { hour: 8, minute: 30, duration: 15, description: 'EU ECB Rate Decision' }
        ];
        this.correlations = this.indicatorManager.getCorrelations();

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
            if (element) {
                element.addEventListener(event, handler);
                if (this.debugMode) this.log(`Event listener added for ${id}:${event}`, 'debug');
            } else {
                this.log(`Error: Element with ID '${id}' not found`, 'error');
            }
        };

        addListener('connect-btn', 'click', () => {
            this.log('Connect button clicked', 'debug');
            this.connect();
        });
        addListener('start-btn', 'click', () => {
            this.log('Start button clicked', 'debug');
            this.startTrading();
        });
        addListener('stop-btn', 'click', () => {
            this.log('Stop button clicked', 'debug');
            this.stopTrading();
        });
        addListener('reset-btn', 'click', () => {
            this.log('Reset button clicked', 'debug');
            this.resetStats();
        });
        addListener('backtest-btn', 'click', () => {
            this.log('Backtest button clicked', 'debug');
            this.runBacktest();
        });
        addListener('app-id', 'change', (e) => {
            this.appId = parseInt(e.target.value) || 1089;
            this.log(`App ID updated: ${this.appId}`, 'debug');
        });
        addListener('api-token', 'change', (e) => {
            this.apiToken = e.target.value.trim();
            this.log('API token updated', 'debug');
        });

        const configInputs = [
            'strategy-select', 'symbols', 'trade-type', 'duration', 'stake',
            'max-loss', 'max-profit', 'max-trades', 'multiplier',
            'stop-loss-enabled', 'take-profit-enabled', 'max-drawdown',
            'max-consecutive-losses', 'cooldown-period', 'position-sizing',
            'fixed-fraction', 'custom-strategy-rules', 'multi-timeframe',
            'dynamic-switching', 'use-candle-patterns', 'candle-timeframe',
            'chart-type'
        ];

        configInputs.forEach(id => {
            addListener(id, 'change', () => {
                this.log(`Config input '${id}' changed`, 'debug');
                this.updateConfig();
            });
        });

        addListener('clear-log', 'click', () => {
            this.log('Clear log button clicked', 'debug');
            this.clearLog();
        });
    }

    /**
     * Update trading configuration from UI inputs
     */
    updateConfig() {
        const getValue = (id, type = 'string') => {
            const element = document.getElementById(id);
            if (!element) {
                this.log(`Error: Config element '${id}' not found`, 'error');
                return null;
            }
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
            this.config.strategy = getValue('strategy-select') || this.config.strategy;
            this.config.symbols = getValue('symbols') || this.config.symbols;
            this.config.symbol = this.config.symbols[0] || 'R_10';
            this.config.tradeType = getValue('trade-type') || this.config.tradeType;
            this.config.duration = getValue('duration', 'integer') || this.config.duration;
            this.config.maxLoss = getValue('max-loss', 'number') || this.config.maxLoss;
            this.config.maxProfit = getValue('max-profit', 'number') || this.config.maxProfit;
            this.config.maxTrades = getValue('max-trades', 'integer') || this.config.maxTrades;
            this.config.multiplier = getValue('multiplier', 'number') || this.config.multiplier;
            this.config.stopLossEnabled = getValue('stop-loss-enabled', 'boolean') !== null ? getValue('stop-loss-enabled', 'boolean') : this.config.stopLossEnabled;
            this.config.takeProfitEnabled = getValue('take-profit-enabled', 'boolean') !== null ? getValue('take-profit-enabled', 'boolean') : this.config.takeProfitEnabled;
            this.config.maxDrawdown = getValue('max-drawdown', 'number') || this.config.maxDrawdown;
            this.config.maxConsecutiveLosses = getValue('max-consecutive-losses', 'integer') || this.config.maxConsecutiveLosses;
            this.config.cooldownPeriod = getValue('cooldown-period', 'integer') || this.config.cooldownPeriod;
            this.config.positionSizing = getValue('position-sizing') || this.config.positionSizing;
            this.config.fixedFraction = getValue('fixed-fraction', 'number') || this.config.fixedFraction;
            this.config.customStrategyRules = getValue('custom-strategy-rules', 'json') || this.config.customStrategyRules;
            this.config.useMultiTimeframe = getValue('multi-timeframe', 'boolean') !== null ? getValue('multi-timeframe', 'boolean') : this.config.useMultiTimeframe;
            this.config.useDynamicSwitching = getValue('dynamic-switching', 'boolean') !== null ? getValue('dynamic-switching', 'boolean') : this.config.useDynamicSwitching;
            this.config.useCandlePatterns = getValue('use-candle-patterns', 'boolean') !== null ? getValue('use-candle-patterns', 'boolean') : this.config.useCandlePatterns;
            this.config.candleTimeframe = getValue('candle-timeframe', 'integer') || this.config.candleTimeframe;
            this.config.chartType = getValue('chart-type') || this.config.chartType;

            this.initialStake = parseFloat((getValue('stake', 'number') || this.initialStake).toFixed(1));
            this.currentStake = this.initialStake;
            this.candleManager.setTimeframe(this.config.candleTimeframe);

            this.log(`Configuration updated: ${this.config.strategy} strategy on ${this.config.symbols.join(', ')}`, 'info');
        } catch (error) {
            this.log(`Configuration error: Invalid JSON in custom strategy rules - ${error.message}`, 'error');
        }
    }

    /**
     * Establish WebSocket connection to Deriv API
     */
    async connect() {
        this.log('Initiating connection...', 'info');
        if (!this.appId || isNaN(this.appId)) {
            this.log('Error: Valid App ID is required', 'error');
            this.updateConnectionStatus('Error: Invalid App ID', false);
            return;
        }

        if (!this.apiToken) {
            this.log('Warning: API token not provided; authentication will be skipped', 'warning');
        }

        if (this.connectionRetries >= this.maxRetries) {
            this.log('Error: Maximum connection retries reached', 'error');
            this.updateConnectionStatus('Error: Max Retries Reached', false);
            return;
        }

        try {
            this.updateConnectionStatus('Connecting...', false);
            const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`;
            this.log(`Connecting to WebSocket: ${wsUrl}`, 'debug');
            this.ws = new WebSocket(wsUrl);
            this.connectionRetries++;

            this.ws.onopen = () => {
                this.isConnected = true;
                this.connectionRetries = 0; // Reset retries on success
                this.updateConnectionStatus('Connected', true);
                this.log('WebSocket connected successfully', 'success');

                if (this.apiToken) {
                    this.log('Sending authentication request', 'debug');
                    this.authenticate();
                }
                this.config.symbols.forEach(symbol => {
                    this.log(`Subscribing to ticks for ${symbol}`, 'debug');
                    this.subscribeToTicks(symbol);
                });
                this.requestBalance();
                this.processQueue();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.log(`Received message: ${data.msg_type} (req_id: ${data.req_id || 'none'})`, 'debug');
                    this.handleMessage(data);
                } catch (error) {
                    this.log(`Error parsing WebSocket message: ${error.message}`, 'error');
                }
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.updateConnectionStatus('Disconnected', false);
                this.log('WebSocket connection closed', 'warning');

                if (this.connectionRetries < this.maxRetries) {
                    this.log(`Retrying connection (${this.connectionRetries + 1}/${this.maxRetries})...`, 'info');
                    setTimeout(() => this.connect(), 5000);
                }
            };

            this.ws.onerror = (error) => {
                this.log(`WebSocket error: ${error.message || 'Unknown error'}`, 'error');
                this.updateConnectionStatus('Error', false);
            };
        } catch (error) {
            this.log(`Connection error: ${error.message}`, 'error');
            this.updateConnectionStatus('Error', false);
            if (this.connectionRetries < this.maxRetries) {
                this.log(`Retrying connection (${this.connectionRetries + 1}/${this.maxRetries})...`, 'info');
                setTimeout(() => this.connect(), 5000);
            }
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
        this.candleManager.initializeSymbol(symbol);
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
        try {
            this.currentPrice = tick.quote;
            this.candleManager.addTick(tick.symbol, {
                price: this.currentPrice,
                time: new Date(tick.epoch * 1000),
                volume: tick.volume || this.estimateVolume(this.currentPrice)
            });

            const candles = this.candleManager.getCandles(tick.symbol);
            if (candles.length > 0) {
                this.indicatorManager.updateIndicators(candles);
                this.indicatorManager.updateCorrelations(this.candleManager.candles);
                updatePriceChart(candles, tick.symbol); // Update chart
            }

            if (tick.symbol === this.config.symbol && this.isTrading && !this.activeContract && !this.isPaused) {
                this.evaluateTradeSignal(tick.symbol);
            }

            this.updateUI();
        } catch (error) {
            this.log(`Error processing tick: ${error.message}`, 'error');
        }
    }

    /**
     * Estimate volume when Deriv API doesn't provide it
     * @param {number} currentPrice - Current price
     * @returns {number} Estimated volume
     */
    estimateVolume(currentPrice) {
        const prices = this.candleManager.getCandles(this.config.symbol).map(c => c.close);
        if (prices.length < 2) return 1;
        const priceChange = Math.abs(currentPrice - prices[prices.length - 2]);
        return Math.max(1, Math.round(priceChange * 1000));
    }

    /**
     * Evaluate trading signals for a symbol
     * @param {string} symbol - Market symbol
     */
    evaluateTradeSignal(symbol) {
        if (Date.now() - this.lastTradeTime < this.minTradeInterval || this.isPaused) return;

        const signal = this.getTradeSignal(symbol);
        if (signal.shouldTrade) {
            this.executeTrade(signal.tradeType, symbol);
        }
    }

    /**
     * Get trading signal based on strategy and candle patterns
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

        if (signal.shouldTrade && this.config.useCandlePatterns) {
            const pattern = this.candleManager.detectPattern(symbol);
            signal.shouldTrade = this.confirmSignalWithPattern(signal.tradeType, pattern);
            if (signal.shouldTrade) {
                this.log(`Trade confirmed with pattern: ${pattern || 'None'}`, 'info');
            } else {
                this.log(`Trade skipped: No confirming candle pattern for ${signal.tradeType}`, 'warning');
            }
        }

        return signal;
    }

    /**
     * Confirm trade signal with candle patterns
     * @param {string} tradeType - Trade type (CALL/PUT)
     * @param {string} pattern - Detected candle pattern
     * @returns {boolean} Whether signal is confirmed
     */
    confirmSignalWithPattern(tradeType, pattern) {
        if (!pattern) return false;
        return (
            (tradeType === 'CALL' && ['BullishEngulfing', 'Hammer', 'MorningStar'].includes(pattern)) ||
            (tradeType === 'PUT' && ['BearishEngulfing', 'ShootingStar'].includes(pattern)) ||
            pattern === 'Doji'
        );
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
        const indicators = this.indicatorManager.getIndicators();
        const candles = this.candleManager.getCandles(this.config.symbol);
        if (candles.length < 10) return { shouldTrade: false };

        const shortMA = this.config.useMultiTimeframe ? this.indicatorManager.calculateMA(candles, 5) : indicators.movingAverage;
        return {
            shouldTrade: indicators.adx > 20,
            tradeType: this.currentPrice > shortMA ? 'CALL' : 'PUT'
        };
    }

    /**
     * Get Mean Reversion strategy signal
     * @returns {Object} Trading signal
     */
    getMeanReversionSignal() {
        const indicators = this.indicatorManager.getIndicators();
        const candles = this.candleManager.getCandles(this.config.symbol);
        if (candles.length < 20) return { shouldTrade: false };

        const longMA = this.config.useMultiTimeframe ? this.indicatorManager.calculateMA(candles, 20) : indicators.movingAverage;
        const deviation = Math.abs(this.currentPrice - longMA) / longMA * 100;

        if (deviation > indicators.volatility * 1.5 && indicators.adx < 20) {
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
        const indicators = this.indicatorManager.getIndicators();
        if (indicators.rsi === 0) return { shouldTrade: false };

        return {
            shouldTrade: (indicators.rsi > 70 || indicators.rsi < 30),
            tradeType: indicators.rsi > 70 ? 'PUT' : 'CALL'
        };
    }

    /**
     * Get Grid Trading strategy signal
     * @param {string} symbol - Market symbol
     * @returns {Object} Trading signal
     */
    getGridSignal(symbol) {
        const indicators = this.indicatorManager.getIndicators();
        const candles = this.candleManager.getCandles(symbol);
        if (candles.length < 20) return { shouldTrade: false };

        const gridSize = indicators.volatility * 0.01;
        const middlePrice = indicators.bollingerBands.middle;
        const gridLevel = Math.round((this.currentPrice - middlePrice) / gridSize);
        if (Math.abs(gridLevel) > 5) return { shouldTrade: false };

        return {
            shouldTrade: indicators.volatility < 2,
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
        const candles1 = this.candleManager.getCandles(symbol1).slice(-50);
        const candles2 = this.candleManager.getCandles(symbol2).slice(-50);

        if (candles1.length < 50 || candles2.length < 50) return { shouldTrade: false };

        const price1 = candles1[candles1.length - 1].close;
        const price2 = candles2[candles2.length - 1].close;
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
        const indicators = this.indicatorManager.getIndicators();

        // Placeholder for external ML model integration
        const mlSignal = this.getExternalMLSignal();
        if (mlSignal) {
            return {
                shouldTrade: mlSignal.confidence > 0.7,
                tradeType: mlSignal.prediction === 'bullish' ? 'CALL' : 'PUT'
            };
        }

        return {
            shouldTrade: winCount > lossCount && indicators.rsi < 40 && indicators.sentiment > 0,
            tradeType: 'CALL'
        };
    }

    /**
     * Placeholder for fetching external ML signal
     * @returns {Object|null} ML signal
     */
    getExternalMLSignal() {
        // Placeholder: Fetch signal from external ML model API
        return null; // Example: { prediction: 'bullish', confidence: 0.85 }
    }

    /**
     * Get Custom strategy signal based on user-defined rules
     * @returns {Object} Trading signal
     */
    getCustomSignal() {
        if (!this.config.customStrategyRules.length) return { shouldTrade: false };

        const indicators = this.indicatorManager.getIndicators();
        const conditionsMet = this.config.customStrategyRules.every(rule => {
            switch (rule.indicator) {
                case 'rsi':
                    return rule.operator === '>' ? indicators.rsi > rule.value : indicators.rsi < rule.value;
                case 'macd':
                    return rule.operator === '>' ? indicators.macd.histogram > rule.value : indicators.macd.histogram < rule.value;
                case 'stochastic':
                    return rule.operator === '>' ? indicators.stochastic.k > rule.value : indicators.stochastic.k < rule.value;
                case 'bollinger':
                    return rule.operator === '>' ? this.currentPrice > indicators.bollingerBands.upper :
                           rule.operator === '<' ? this.currentPrice < indicators.bollingerBands.lower : false;
                case 'adx':
                    return rule.operator === '>' ? indicators.adx > rule.value : indicators.adx < rule.value;
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

        const indicators = this.indicatorManager.getIndicators();
        const drawdown = this.balance > 0 ? (this.totalPnL / this.balance) * 100 : 0;
        const volatilityFactor = indicators.volatility > 2.5 ? 0.5 : 1;
        const drawdownFactor = drawdown < -10 ? 0.75 : 1;

        switch (this.config.positionSizing) {
            case 'fixed':
                this.currentStake = this.balance * this.config.fixedFraction * volatilityFactor * drawdownFactor;
                break;
            case 'volatility':
                this.currentStake = this.initialStake / (1 + indicators.volatility / 100) * volatilityFactor * drawdownFactor;
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
        this.log(`Adjusted stake: $${this.currentStake}`, 'debug');
    }

    /**
     * Execute a trade with specified parameters
     * @param {string} tradeType - Type of trade (CALL/PUT)
     * @param {string} symbol - Market symbol
     */
    async executeTrade(tradeType, symbol) {
        if (!this.isConnected || !this.isTrading || !this.shouldExecuteTrade() || this.isPaused) {
            this.log(`Cannot execute trade: connected=${this.isConnected}, trading=${this.isTrading}, paused=${this.isPaused}`, 'warning');
            return;
        }

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

        const indicators = this.indicatorManager.getIndicators();
        const bandWidth = (indicators.bollingerBands.upper - indicators.bollingerBands.lower) / indicators.bollingerBands.middle * 100;
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

        const indicators = this.indicatorManager.getIndicators();
        const currentTrend = this.detectMarketTrend();
        const isUnfavorable = currentTrend === 'sideways' || indicators.volatility > 2.5 || indicators.adx > 25;

        if (isUnfavorable) {
            this.isPaused = true;
            this.pauseExtensions++;
            this.log(`Paused due to unfavorable conditions`, 'warning');
            setTimeout(() => {
                if (this.isTrading && !this.checkMarketConditions() && this.detectMarketTrend() !== 'sideways' && indicators.volatility <= 2.5 && indicators.adx <= 25) {
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

        const indicators = this.indicatorManager.getIndicators();
        const profitRatio = contract.profit / this.currentStake;
        const isReversing = (contract.current_spot > indicators.bollingerBands.upper && indicators.macd.histogram < 0) ||
                           (contract.current_spot < indicators.bollingerBands.lower && indicators.macd.histogram > 0);

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
            this.candleManager.addHistoricalTick(this.config.symbol, tick);
            const candles = this.candleManager.getCandles(this.config.symbol);
            this.indicatorManager.updateIndicators(candles);
            const signal = this.getTradeSignal(this.config.symbol);
            if (signal.shouldTrade) {
                simulatedTrades++;
                const indicators = this.indicatorManager.getIndicators();
                const slippage = indicators.volatility * 0.01;
                const fee = this.currentStake * 0.01;
                const outcome = this.simulateTradeOutcome(signal.tradeType, candles, i);
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
     * @param {Object[]} candles - Candle data
     * @param {number} index - Current index
     * @returns {string} Outcome (win/loss)
     */
    simulateTradeOutcome(tradeType, candles, index) {
        if (index >= candles.length - 1) return 'loss';
        const futurePrice = candles[index + 1].close;
        const currentPrice = candles[index].close;
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
        try {
            const statusElement = document.getElementById('connection-status');
            const indicator = document.getElementById('status-indicator');
            
            if (statusElement) {
                statusElement.textContent = status;
                this.log(`Connection status updated: ${status}`, 'debug');
            } else {
                this.log('Error: Connection status element not found', 'error');
            }
            
            if (indicator) {
                indicator.classList.toggle('connected', connected);
            } else {
                this.log('Error: Status indicator element not found', 'error');
            }
        } catch (error) {
            this.log(`Error updating connection status: ${error.message}`, 'error');
        }
    }

    /**
     * Update UI with current trading statistics and market data
     */
    updateUI() {
        try {
            const indicators = this.indicatorManager.getIndicators();
            const pattern = this.candleManager.detectPattern(this.config.symbol);
            const candles = this.candleManager.getCandles(this.config.symbol);
            const latestCandle = candles[candles.length - 1] || {};

            // Volatility trend calculation
            const recentCandles = candles.slice(-10);
            const volatilityTrend = recentCandles.length >= 2 ? 
                (indicators.volatility > this.indicatorManager.calculateVolatility(recentCandles.slice(0, -1)) ? 'Rising' : 'Falling') : 'Stable';

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
                'rsi-value': indicators.rsi.toFixed(2),
                'ma-value': indicators.movingAverage.toFixed(5),
                'volatility-value': `${indicators.volatility.toFixed(2)}%`,
                'bollinger-upper': indicators.bollingerBands.upper.toFixed(5),
                'bollinger-middle': indicators.bollingerBands.middle.toFixed(5),
                'bollinger-lower': indicators.bollingerBands.lower.toFixed(5),
                'macd-line': indicators.macd.line.toFixed(5),
                'macd-signal': indicators.macd.signal.toFixed(5),
                'macd-histogram': indicators.macd.histogram.toFixed(5),
                'stochastic-k': indicators.stochastic.k.toFixed(2),
                'stochastic-d': indicators.stochastic.d.toFixed(2),
                'adx-value': indicators.adx.toFixed(2),
                'obv-value': indicators.obv.toFixed(2),
                'sentiment-value': indicators.sentiment.toFixed(2),
                'candle-pattern': pattern || 'None',
                'candle-open': latestCandle.open ? latestCandle.open.toFixed(5) : '-',
                'candle-high': latestCandle.high ? latestCandle.high.toFixed(5) : '-',
                'candle-low': latestCandle.low ? latestCandle.low.toFixed(5) : '-',
                'candle-close': latestCandle.close ? latestCandle.close.toFixed(5) : '-',
                'news-event': this.checkMarketConditions() ? this.newsEvents.find(event => {
                    const now = new Date();
                    const hour = now.getUTCHours();
                    const minute = now.getUTCMinutes();
                    const startTime = event.hour * 60 + event.minute;
                    const endTime = startTime + event.duration;
                    const currentTime = hour * 60 + minute;
                    return currentTime >= startTime && currentTime <= endTime;
                })?.description || 'None' : 'None',
                'volatility-spike': this.detectVolatilitySpike() ? 'Yes' : 'No',
                'volatility-trend': volatilityTrend,
                'market-trend': this.detectMarketTrend()
            };

            Object.entries(elements).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value;
                } else {
                    this.log(`Error: UI element '${id}' not found`, 'error');
                }
            });

            const totalPnLElement = document.getElementById('total-pnl');
            if (totalPnLElement) {
                totalPnLElement.className = `stat-value ${this.totalPnL >= 0 ? 'profit' : 'loss'}`;
            } else {
                this.log('Error: Total PnL element not found', 'error');
            }

            // Update strategy stats table
            const strategyBody = document.getElementById('strategy-stats-body');
            if (strategyBody) {
                strategyBody.innerHTML = '';
                Object.entries(this.strategyStats).forEach(([strategy, stats]) => {
                    const total = stats.wins + stats.losses;
                    const winRate = total > 0 ? (stats.wins / total * 100).toFixed(1) : 0;
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${strategy}</td>
                        <td>${stats.wins}</td>
                        <td>${stats.losses}</td>
                        <td>${winRate}%</td>
                    `;
                    strategyBody.appendChild(row);
                });
            } else {
                this.log('Error: Strategy stats table body not found', 'error');
            }

            // Update correlation table
            const correlationBody = document.getElementById('correlation-body');
            if (correlationBody) {
                correlationBody.innerHTML = '';
                this.indicatorManager.getCorrelations().forEach((value, pair) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${pair}</td>
                        <td>${value.toFixed(2)}</td>
                    `;
                    correlationBody.appendChild(row);
                });
            } else {
                this.log('Error: Correlation table body not found', 'error');
            }
        } catch (error) {
            this.log(`UI update error: ${error.message}`, 'error');
        }
    }

    /**
     * Log messages to UI
     * @param {string} message - Log message
     * @param {string} type - Log type (info, success, warning, error, debug)
     */
    log(message, type = 'info') {
        if (type === 'debug' && !this.debugMode) return;

        const logContainer = document.getElementById('log-content');
        if (!logContainer) {
            console.warn(`Log container not found: ${message}`);
            return;
        }

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
        if (logContainer) {
            logContainer.innerHTML = '';
            this.log('Log cleared', 'info');
        } else {
            this.log('Error: Log container not found', 'error');
        }
    }

    /**
     * Send message to WebSocket with validation and queuing
     * @param {Object} message - Message to send
     */
    sendMessage(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
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
     * Detect if a volatility spike is occurring
     * @returns {boolean} Whether a volatility spike is detected
     */
    detectVolatilitySpike() {
        const indicators = this.indicatorManager.getIndicators();
        return indicators.volatility > 3; // Example threshold for volatility spike
    }

    /**
     * Detect current market trend
     * @returns {string} Market trend (uptrend, downtrend, sideways)
     */
    detectMarketTrend() {
        const candles = this.candleManager.getCandles(this.config.symbol);
        if (candles.length < 20) return 'sideways';

        const recent = candles.slice(-10).map(c => c.close);
        const older = candles.slice(-20, -10).map(c => c.close);

        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const trendStrength = Math.abs(recentAvg - olderAvg) / olderAvg * 100;

        return trendStrength < 0.1 ? 'sideways' :
               recentAvg > olderAvg ? 'uptrend' : 'downtrend';
    }

    /**
     * Calculate optimal stake size using Kelly Criterion
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
     * Check market conditions for news and volatility spikes
     * @returns {boolean} Whether conditions are unfavorable
     */
    checkMarketConditions() {
        const now = new Date();
        const hour = now.getUTCHours();
        const minute = now.getUTCMinutes();

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

        if (this.detectVolatilitySpike()) {
            this.log('Avoiding trade due to volatility spike', 'warning');
            return true;
        }

        return false;
    }

    /**
     * Optimize strategy parameters periodically
     */
    optimizeStrategy() {
        // Placeholder for strategy optimization logic
        this.log('Running strategy optimization...', 'info');
    }
}

/**
 * Initialize bot and setup global event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.derivBot = new AdvancedDerivBot();
        window.derivBot.log('DOM fully loaded, bot initialized', 'debug');

        setInterval(() => {
            if (window.derivBot) {
                localStorage.setItem('derivBotConfig', JSON.stringify(window.derivBot.config));
                window.derivBot.log('Configuration saved to localStorage', 'debug');
            }
        }, 30000);

        const savedConfig = localStorage.getItem('derivBotConfig');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                Object.assign(window.derivBot.config, config);

                const updateConfigElement = (id, value) => {
                    const element = document.getElementById(id);
                    if (element) element.value = value;
                    else window.derivBot.log(`Error: Config element '${id}' not found`, 'error');
                };

                const updateConfigCheckbox = (id, value) => {
                    const element = document.getElementById(id);
                    if (element) element.checked = value !== false;
                    else window.derivBot.log(`Error: Checkbox element '${id}' not found`, 'error');
                };

                const updateConfigMultiSelect = (id, values) => {
                    const element = document.getElementById(id);
                    if (element) {
                        Array.from(element.options).forEach(option => {
                            option.selected = values.includes(option.value);
                        });
                    } else {
                        window.derivBot.log(`Error: Multi-select element '${id}' not found`, 'error');
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
                updateConfigCheckbox('use-candle-patterns', config.useCandlePatterns);
                updateConfigElement('candle-timeframe', config.candleTimeframe || 60);
                updateConfigElement('chart-type', config.chartType || 'line');

                window.derivBot.log('Configuration loaded from saved settings', 'info');
            } catch (error) {
                console.error('Error loading saved configuration:', error);
                window.derivBot.log('Error loading saved configuration', 'error');
            }
        }

        setInterval(() => {
            if (window.derivBot && window.derivBot.isTrading) {
                window.derivBot.optimizeStrategy();
            }
        }, 60000);
    } catch (error) {
        console.error('Error initializing bot:', error);
        if (window.derivBot) {
            window.derivBot.log(`Error initializing bot: ${error.message}`, 'error');
        }
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedDerivBot;
}