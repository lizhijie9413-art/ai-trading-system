// 多维叠加图表
fetch('/api/dashboard')
.then(res => res.json())
.then(data => {
    const ctx = document.getElementById('assetsDashboardChart');
    if (!ctx) return;
    const labels = data.assetTrend.map(d => d.date);
    const totalAssets = data.assetTrend.map(d => d.total);
    const profit = data.assetTrend.map(d => d.profit);
    const loss = data.assetTrend.map(d => d.loss);
    const todayOrders = data.todayOrders ? Array(labels.length).fill(data.todayOrders) : Array(labels.length).fill(0);
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Total Assets', data: totalAssets, type:'line', borderColor:'purple', fill:false },
                { label: 'Profit', data: profit, type:'line', borderColor:'green', fill:false },
                { label: 'Loss', data: loss, type:'line', borderColor:'red', fill:false },
                { label: "Today's Orders", data: todayOrders, backgroundColor: '#36A2EB' }
            ]
        }
    });
});
