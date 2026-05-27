// 加载用户列表
fetch('/api/users.json')
.then(res => res.json())
.then(users => {
    const select = document.getElementById('userSelect');
    users.forEach(u => {
        const option = document.createElement('option');
        option.value = u.id;
        option.text = u.name;
        select.appendChild(option);
    });
    if (users.length > 0) renderUserTrades(users[0].id);
});

document.getElementById('userSelect').addEventListener('change', e => {
    renderUserTrades(e.target.value);
});

function renderUserTrades(userId) {
    fetch('/data/trades.json')
    .then(res => res.json())
    .then(trades => {
        const userTrades = trades.filter(t => t.userId == userId);
        const labels = userTrades.map(t => new Date(t.timestamp).toLocaleString());
        const data = userTrades.map(t => t.price * t.amount * (t.side == 'BUY' ? 1 : -1));
        const ctx = document.getElementById('userTradeChart');
        if (window.tradeChart) window.tradeChart.destroy();
        window.tradeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '交易金额 (BUY + / SELL -)',
                    data,
                    borderColor: 'purple',
                    fill: false
                }]
            }
        });
    });
}


// 动画回放每笔交易
function animateTrades(userId) {
    fetch('/data/trades.json')
    .then(res => res.json())
    .then(trades => {
        const userTrades = trades.filter(t => t.userId == userId);
        const ctx = document.getElementById('userTradeChart');
        if (!ctx) return;
        if (window.tradeChart) window.tradeChart.destroy();
        let index = 0;
        function step() {
            const labels = userTrades.slice(0, index+1).map(t => new Date(t.timestamp).toLocaleString());
            const data = userTrades.slice(0, index+1).map(t => t.price * t.amount * (t.side=='BUY'?1:-1));
            window.tradeChart = new Chart(ctx, {
                type:'line',
                data: { labels, datasets:[{label:'交易金额 (BUY+/SELL-)', data, borderColor:'purple', fill:false}] }
            });
            index++;
            if (index < userTrades.length) setTimeout(step, 500);
        }
        step();
    });
}
// 修改选择用户回调
document.getElementById('userSelect').addEventListener('change', e => { animateTrades(e.target.value); });
