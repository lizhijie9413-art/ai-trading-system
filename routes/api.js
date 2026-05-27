module.exports = function(app) {
    app.get('/api/simulate-strategy', (req, res) => {
        const trades = [];
        const symbols = ['AAPL','MSFT','TSLA','NVDA','AMZN'];
        for (let i=0; i<20; i++) {
            const symbol = symbols[Math.floor(Math.random()*symbols.length)];
            const amount = Math.floor(Math.random()*50+1)*10;
            const price = Math.floor(Math.random()*1500+100);
            const side = Math.random() > 0.5 ? 'BUY':'SELL';
            trades.push({id:i+1, symbol, amount, price, side, timestamp: new Date().toISOString()});
        }
        res.json({message:'策略模拟成功', trades});
    });
};