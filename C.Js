// Variabili Globali per lo stato
let charts = {}; 
let historyData = [];
let labels = [];

// Impostazioni globali Chart.js
Chart.defaults.color = '#9a9a9a';
Chart.defaults.borderColor = '#333';

// Avvio al caricamento della pagina
window.onload = function() {
    initCharts();
    // Aggiorna dashboard ogni 2 secondi
    setInterval(updateDashboard, 2000);
    // Primo aggiornamento immediato
    updateDashboard();
};

function initCharts() {
    // 1. GRAFICO LINEARE (Trend)
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
            plugins: { legend: { display: false } },
            scales: { x: { display: false } } // Nascondiamo asse X per pulizia
        }
    });

    // 2. GRAFICO CIAMBELLA (Distribuzione)
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
            plugins: { legend: { position: 'bottom' } }
        }
    });

    // 3. GRAFICO BARRE (Proiezione)
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
            maintainAspectRatio: false 
        }
    });
}

function updateDashboard() {
    // A. Lettura Input
    const users = parseInt(document.getElementById('inp-users').value) || 0;
    const reqPerUser = parseInt(document.getElementById('inp-reqs').value) || 0;
    const capacity = parseInt(document.getElementById('inp-cap').value) || 1;

    // B. Calcolo Metriche (con variazione random)
    const baseLoad = users * reqPerUser;
    const variance = (Math.random() * baseLoad * 0.2) - (baseLoad * 0.1); // +/- 10%
    const currentLoad = Math.max(0, Math.floor(baseLoad + variance));
    
    const saturation = (currentLoad / capacity) * 100;
    const margin = 100 - saturation;

    // C. Aggiornamento HTML
    document.getElementById('kpi-load').innerText = currentLoad.toLocaleString();
    document.getElementById('kpi-sat').innerText = saturation.toFixed(1) + "%";
    document.getElementById('kpi-margin').innerText = margin.toFixed(1) + "%";

    // D. Gestione Alert (Logica IF)
    const statusBadge = document.getElementById('system-status');
    const advisor = document.getElementById('advisor-text');

    if (saturation > 90) {
        statusBadge.className = "status-badge bg-crit";
        statusBadge.innerText = "CRITICAL";
        advisor.innerHTML = "⚠️ <strong>AZIONE RICHIESTA:</strong> Il sistema è saturo. Rischio downtime imminente.";
    } else if (saturation > 70) {
        statusBadge.className = "status-badge bg-warn";
        statusBadge.innerText = "WARNING";
        advisor.innerHTML = "💡 <strong>Suggerimento:</strong> Carico elevato. Considerare upgrade del piano.";
    } else {
        statusBadge.className = "status-badge bg-ok";
        statusBadge.innerText = "HEALTHY";
        advisor.innerHTML = "✅ <strong>Ottimale:</strong> Il sistema gestisce il carico perfettamente.";
    }

    // E. Aggiornamento Grafici
    
    // 1. Trend
    if (labels.length > 20) { labels.shift(); historyData.shift(); }
    labels.push(""); // Etichetta vuota per pulizia
    historyData.push(currentLoad);
    charts.trend.update('none');

    // 2. Distribuzione (Simulazione dinamica)
    // Se il carico è alto, il DB soffre di più
    const dbLoad = saturation > 80 ? 60 : 30;
    charts.dist.data.datasets[0].data = [dbLoad, 90-dbLoad, 10];
    charts.dist.update();

    // 3. Proiezione (+10% mensile composto)
    let projData = [];
    let temp = currentLoad;
    for(let i=0; i<6; i++) {
        temp = temp * 1.1;
        projData.push(temp);
    }
    charts.proj.data.datasets[0].data = projData;
    charts.proj.update();
}