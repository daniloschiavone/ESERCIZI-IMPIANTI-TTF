let charts = {};
let historyData = [];
let labels = [];

const MAX_POINTS = 20;
const UPDATE_INTERVAL_MS = 2000;

Chart.defaults.color = '#9a9a9a';
Chart.defaults.borderColor = '#333';
Chart.defaults.font.family = 'Segoe UI';

window.addEventListener('DOMContentLoaded', () => {
    initCharts();
    bindInputs();
    updateDashboard();
    setInterval(updateDashboard, UPDATE_INTERVAL_MS);
});

function bindInputs() {
    ['inp-users', 'inp-reqs', 'inp-cap'].forEach((id) => {
        const field = document.getElementById(id);
        if (!field) {
            return;
        }

        field.addEventListener('input', updateDashboard);
    });
}

function getInputValue(id, fallback = 0, min = 0) {
    const el = document.getElementById(id);
    if (!el) {
        return fallback;
    }

    const value = Number.parseInt(el.value, 10);
    if (Number.isNaN(value)) {
        return fallback;
    }

    return Math.max(min, value);
}

function initCharts() {
    const trendCanvas = document.getElementById('trendChart');
    const distCanvas = document.getElementById('distChart');
    const projCanvas = document.getElementById('projChart');

    if (!trendCanvas || !distCanvas || !projCanvas) {
        return;
    }

    const ctxTrend = document.getElementById('trendChart').getContext('2d');
    charts.trend = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Carico Real-Time',
                data: historyData,
                borderColor: '#00f2c3', // Verde Acqua
                backgroundColor: 'rgba(0, 242, 195, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false } }
        }
    });

    const ctxDist = document.getElementById('distChart').getContext('2d');
    charts.dist = new Chart(ctxDist, {
        type: 'doughnut',
        data: {
            labels: ['Database', 'App Server', 'Media'],
            datasets: [{
                data: [30, 50, 20],
                backgroundColor: ['#fd5d93', '#e14eca', '#00f2c3'],
                borderWidth: 0
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });

    const ctxProj = document.getElementById('projChart').getContext('2d');
    charts.proj = new Chart(ctxProj, {
        type: 'bar',
        data: {
            labels: ['Mese 1', 'Mese 2', 'Mese 3', 'Mese 4', 'Mese 5', 'Mese 6'],
            datasets: [{
                label: 'Previsione Carico',
                data: [],
                backgroundColor: '#e14eca'
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function updateDashboard() {
    if (!charts.trend || !charts.dist || !charts.proj) {
        return;
    }

    const users = getInputValue('inp-users', 0, 0);
    const reqPerUser = getInputValue('inp-reqs', 0, 0);
    const capacity = getInputValue('inp-cap', 1, 1);

    const baseLoad = users * reqPerUser;
    const variance = (Math.random() * baseLoad * 0.2) - (baseLoad * 0.1);
    const currentLoad = Math.max(0, Math.floor(baseLoad + variance));
    
    const saturation = (currentLoad / capacity) * 100;
    const margin = Math.max(0, 100 - saturation);

    document.getElementById('kpi-load').innerText = currentLoad.toLocaleString('it-IT');
    document.getElementById('kpi-sat').innerText = saturation.toFixed(1) + '%';
    document.getElementById('kpi-margin').innerText = margin.toFixed(1) + '%';

    const statusBadge = document.getElementById('system-status');
    const advisor = document.getElementById('advisor-text');

    if (saturation > 100) {
        statusBadge.className = 'status-badge bg-crit';
        statusBadge.innerText = 'OVERLOAD';
        advisor.innerHTML = '🚨 <strong>EMERGENZA:</strong> Capacità superata. Necessario scaling immediato.';
    } else if (saturation > 90) {
        statusBadge.className = 'status-badge bg-crit';
        statusBadge.innerText = 'CRITICAL';
        advisor.innerHTML = '⚠️ <strong>AZIONE RICHIESTA:</strong> Il sistema è saturo. Rischio downtime imminente.';
    } else if (saturation > 70) {
        statusBadge.className = 'status-badge bg-warn';
        statusBadge.innerText = 'WARNING';
        advisor.innerHTML = '💡 <strong>Suggerimento:</strong> Carico elevato. Considerare upgrade del piano.';
    } else {
        statusBadge.className = 'status-badge bg-ok';
        statusBadge.innerText = 'HEALTHY';
        advisor.innerHTML = '✅ <strong>Ottimale:</strong> Il sistema gestisce il carico perfettamente.';
    }

    if (labels.length >= MAX_POINTS) {
        labels.shift();
        historyData.shift();
    }

    labels.push('');
    historyData.push(currentLoad);
    charts.trend.update('none');

    const dbLoad = Math.min(65, Math.max(30, 30 + Math.floor(saturation / 3.5)));
    const mediaLoad = 10;
    const appLoad = 100 - dbLoad - mediaLoad;
    charts.dist.data.datasets[0].data = [dbLoad, appLoad, mediaLoad];
    charts.dist.update('none');

    const projData = [];
    let temp = currentLoad;
    for (let i = 0; i < 6; i++) {
        temp = temp * 1.1;
        projData.push(Math.round(temp));
    }
    charts.proj.data.datasets[0].data = projData;
    charts.proj.update('none');
}