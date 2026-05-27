// 调用后端策略接口并显示图表
function runStrategy() {
    fetch('/api/simulate-strategy')
    .then(res => res.json())
    .then(data => {
        const trades = data.trades;
        const ctx = document.getElementById('strategyChart');
        if (!ctx) return;
        const labels = trades.map(t => new Date(t.timestamp).toLocaleTimeString());
        const buyData = trades.map(t => t.side=='BUY'?t.amount*t.price:0);
        const sellData = trades.map(t => t.side=='SELL'?t.amount*t.price:0);
        if (window.strategyChart) window.strategyChart.destroy();
        window.strategyChart = new Chart(ctx, {
            type:'bar',
            data:{
                labels,
                datasets:[
                    {label:'BUY金额', data: buyData, backgroundColor:'green'},
                    {label:'SELL金额', data: sellData, backgroundColor:'red'}
                ]
            }
        });
    });
}
