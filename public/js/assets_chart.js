// 动态用户资产曲线
fetch('/api/dashboard')
.then(res => res.json())
.then(data => {
    const ctx = document.getElementById('assetsChart');
    if (!ctx) return;
    const labels = data.assetTrend.map(d => d.date);
    const totalAssets = data.assetTrend.map(d => d.total);
    const profit = data.assetTrend.map(d => d.profit);
    const loss = data.assetTrend.map(d => d.loss);
    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Total Assets', data: totalAssets, borderColor: 'purple', fill: false },
                { label: 'Profit', data: profit, borderColor: 'green', fill: false },
                { label: 'Loss', data: loss, borderColor: 'red', fill: false }
            ]
        }
    });
});
