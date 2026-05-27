async function fetchData(endpoint){const res=await fetch(endpoint);return await res.json();}
async function renderDashboard(){
  const users=await fetchData('/api/users');
  const trades=await fetchData('/api/trades');
  const orders=await fetchData('/api/orders');
  const kyc=await fetchData('/api/kyc');

  // 总资产折线图
  new Chart(document.getElementById('assetChart'),{type:'line',data:{labels:['05-14','05-15','05-16','05-17','05-18','05-19','05-20'],datasets:[{label:'总资产',data:users.map(u=>u.balance),borderColor:'#7F5AF0',fill:false}]},options:{responsive:true,maintainAspectRatio:false}});

  // 用户增长柱状图
  new Chart(document.getElementById('userGrowthChart'),{type:'bar',data:{labels:['05-14','05-15','05-16','05-17','05-18','05-19','05-20'],datasets:[{label:'用户增长',data:[100,200,400,600,800,700,750],backgroundColor:'#7F5AF0'}]},options:{responsive:true,maintainAspectRatio:false}});

  // 资产分布饼图
  new Chart(document.getElementById('assetDistributionChart'),{type:'pie',data:{labels:['$100k+','$50k-$100k','$10k-$50k','<$10k'],datasets:[{data:[users.filter(u=>u.balance>100000).length,users.filter(u=>u.balance<=100000&&u.balance>50000).length,users.filter(u=>u.balance<=50000&&u.balance>10000).length,users.filter(u=>u.balance<=10000).length],backgroundColor:['#7F5AF0','#FF6B6B','#4ECDC4','#F7B801']}]},options:{responsive:true,maintainAspectRatio:false}});

  setTimeout(renderDashboard,5000);
}
renderDashboard();

function autoRefreshDashboard() {
    fetch('/api/dashboard')
    .then(res => res.json())
    .then(data => {
        if (window.updateDashboard) updateDashboard(data);
    });
}
setInterval(autoRefreshDashboard, 5000);


// 新增收益分布饼图
function renderProfitPieChart(data) {
    const ctx = document.getElementById('profitPieChart');
    if (!ctx) return;
    const profits = data.topTrades.map(t => t.volume);
    const labels = data.topTrades.map(t => t.symbol);
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data: profits,
                backgroundColor: ['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF']
            }]
        }
    });
}
// 页面加载后调用
fetch('/api/dashboard')
.then(res => res.json())
.then(data => { renderProfitPieChart(data); });


// 批量冻结/激活用户
function batchUpdateUsers(userIds, status) {
    fetch('/api/users/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, status })
    }).then(res => res.json()).then(data => { alert(data.message); location.reload(); });
}


// 导出订单为 CSV
function exportOrdersCSV(orders) {
    let csv = 'id,userId,symbol,amount,price,side,status,timestamp\n';
    orders.forEach(o => {
        csv += [o.id,o.userId,o.symbol,o.amount,o.price,o.side,o.status,o.timestamp].join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orders.csv';
    a.click();
}


// 模拟冻结期和资产变化
function simulateUserFreeze(users) {
    users.forEach(u => {
        u.frozen = Math.random() < 0.1; // 10% 用户冻结
        u.asset = u.asset ? u.asset*(1+Math.random()*0.05) : 10000*(1+Math.random()*0.5);
    });
    console.log('用户冻结模拟完成');
}
