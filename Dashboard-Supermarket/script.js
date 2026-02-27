let queueChartInstance = null;
let staffingChartInstance = null;

function fattoriale(n) {
	if (n === 0 || n === 1) {
		return 1;
	}
	let result = 1;
	for (let i = 2; i <= n; i += 1) {
		result *= i;
	}
	return result;
}

function calcolaMetricheMMc(lambda, mu, c) {
	const u = lambda / mu;
	const rho = u / c;

	if (rho >= 1) {
		return {
			stabile: false,
			rho,
			lq: Infinity,
			wqMin: Infinity,
			wMin: Infinity
		};
	}

	let somma = 0;
	for (let i = 0; i < c; i += 1) {
		somma += Math.pow(u, i) / fattoriale(i);
	}
	somma += (Math.pow(u, c) / fattoriale(c)) * (1 / (1 - rho));
	const p0 = 1 / somma;

	const lq = (p0 * Math.pow(u, c) * rho) / (fattoriale(c) * Math.pow(1 - rho, 2));
	const wqOre = lq / lambda;
	const wqMin = wqOre * 60;
	const wOre = wqOre + (1 / mu);
	const wMin = wOre * 60;

	return {
		stabile: true,
		rho,
		lq,
		wqMin,
		wMin
	};
}

function aggiornaGraficoAttesa(mu, c) {
	const dataPoints = [];
	const labels = [];

	for (let r = 0.1; r <= 0.95; r += 0.05) {
		labels.push(`${(r * 100).toFixed(0)}%`);
		const lam = r * c * mu;
		const metriche = calcolaMetricheMMc(lam, mu, c);
		dataPoints.push(metriche.stabile ? metriche.wqMin.toFixed(2) : null);
	}

	if (queueChartInstance) {
		queueChartInstance.destroy();
	}

	const ctx = document.getElementById('queueChart').getContext('2d');
	queueChartInstance = new Chart(ctx, {
		type: 'line',
		data: {
			labels,
			datasets: [
				{
					label: 'Minuti di attesa simulati (Wq)',
					data: dataPoints,
					borderColor: '#9b59b6',
					backgroundColor: 'rgba(155, 89, 182, 0.2)',
					borderWidth: 2,
					fill: true,
					tension: 0.4
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				y: { beginAtZero: true, title: { display: true, text: 'Minuti in Coda' } },
				x: { title: { display: true, text: 'Utilizzo Sistema (ρ)' } }
			}
		}
	});
}

function aggiornaGraficoAllocazione(labels, costi, utilizzi, cAttuale, cOttimale) {
	if (staffingChartInstance) {
		staffingChartInstance.destroy();
	}

	const colorBars = labels.map((label) => {
		if (label === cOttimale) {
			return 'rgba(46, 204, 113, 0.65)';
		}
		if (label === cAttuale) {
			return 'rgba(241, 196, 15, 0.65)';
		}
		return 'rgba(155, 89, 182, 0.35)';
	});

	const ctx = document.getElementById('staffingChart').getContext('2d');
	staffingChartInstance = new Chart(ctx, {
		type: 'bar',
		data: {
			labels: labels.map((item) => `c=${item}`),
			datasets: [
				{
					label: 'Costo totale (€/h)',
					data: costi,
					backgroundColor: colorBars,
					borderColor: '#9b59b6',
					borderWidth: 1,
					yAxisID: 'y'
				},
				{
					label: 'Utilizzo ρ',
					data: utilizzi,
					type: 'line',
					borderColor: '#34495e',
					backgroundColor: 'rgba(52, 73, 94, 0.2)',
					borderWidth: 2,
					tension: 0.3,
					yAxisID: 'y1'
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				y: {
					beginAtZero: true,
					title: { display: true, text: 'Costo totale (€/h)' }
				},
				y1: {
					position: 'right',
					beginAtZero: true,
					max: 1.2,
					title: { display: true, text: 'Utilizzo ρ' },
					grid: { drawOnChartArea: false }
				}
			}
		}
	});
}

function aggiornaAllarme(rho, cAttuale, cOttimale, metricaCorrente) {
	const alertBox = document.getElementById('dynamic-alert');
	alertBox.className = 'alert-box';

	if (!metricaCorrente.stabile || rho >= 1) {
		alertBox.classList.add('alert-danger');
		alertBox.innerText = 'ALLARME: sistema instabile. Apri subito una nuova cassa o si forma coda critica.';
		return;
	}

	if (cAttuale < cOttimale || rho > 0.85) {
		alertBox.classList.add('alert-danger');
		alertBox.innerText = `ALLARME: apri una nuova cassa. Utilizzo ${ (rho * 100).toFixed(1) }% e rischio coda elevato.`;
		return;
	}

	if (rho > 0.7) {
		alertBox.classList.add('alert-warning');
		alertBox.innerText = 'Pre-allarme: monitora il flusso clienti, possibile necessità di una cassa aggiuntiva a breve.';
		return;
	}

	alertBox.classList.add('alert-safe');
	alertBox.innerText = 'Operatività regolare: allocazione personale adeguata, nessuna nuova cassa necessaria.';
}

function aggiornaDashboard() {
	const lambda = parseFloat(document.getElementById('lambda').value);
	const mu = parseFloat(document.getElementById('mu').value);
	const cAttuale = parseInt(document.getElementById('c').value, 10);
	const costoCassa = parseFloat(document.getElementById('cost-checkout').value);
	const costoAttesaCliente = parseFloat(document.getElementById('cost-wait').value);

	if (
		Number.isNaN(lambda) ||
		Number.isNaN(mu) ||
		Number.isNaN(cAttuale) ||
		Number.isNaN(costoCassa) ||
		Number.isNaN(costoAttesaCliente) ||
		lambda <= 0 ||
		mu <= 0 ||
		cAttuale <= 0 ||
		costoCassa <= 0 ||
		costoAttesaCliente <= 0
	) {
		return;
	}

	const metricaCorrente = calcolaMetricheMMc(lambda, mu, cAttuale);

	document.getElementById('val-rho').innerText = `${(metricaCorrente.rho * 100).toFixed(1)}%`;
	if (!metricaCorrente.stabile) {
		document.getElementById('val-wq').innerText = 'Infinito';
		document.getElementById('val-lq').innerText = 'Infinito';
		document.getElementById('val-w').innerText = 'Infinito';
	} else {
		document.getElementById('val-wq').innerText = `${metricaCorrente.wqMin.toFixed(2)} min`;
		document.getElementById('val-lq').innerText = metricaCorrente.lq.toFixed(2);
		document.getElementById('val-w').innerText = `${metricaCorrente.wMin.toFixed(2)} min`;
	}

	const cardRho = document.getElementById('card-rho');
	cardRho.className = 'metric';
	if (metricaCorrente.rho > 0.85) {
		cardRho.classList.add('status-danger');
	} else if (metricaCorrente.rho > 0.7) {
		cardRho.classList.add('status-warning');
	} else {
		cardRho.classList.add('status-safe');
	}

	const cMax = Math.max(cAttuale + 6, 10);
	const opzioniC = [];
	const costiTotali = [];
	const utilizzi = [];

	let costoMin = Infinity;
	let cOttimale = cAttuale;

	for (let cProva = 1; cProva <= cMax; cProva += 1) {
		const metrica = calcolaMetricheMMc(lambda, mu, cProva);
		const costoAttesa = metrica.stabile ? metrica.lq * costoAttesaCliente : Infinity;
		const costoTotale = (cProva * costoCassa) + costoAttesa;

		opzioniC.push(cProva);
		costiTotali.push(Number.isFinite(costoTotale) ? Number(costoTotale.toFixed(2)) : null);
		utilizzi.push(Number((metrica.rho).toFixed(2)));

		if (Number.isFinite(costoTotale) && costoTotale < costoMin) {
			costoMin = costoTotale;
			cOttimale = cProva;
		}
	}

	const costoCorrente = metricaCorrente.stabile
		? (cAttuale * costoCassa) + (metricaCorrente.lq * costoAttesaCliente)
		: Infinity;

	document.getElementById('val-total-cost').innerText = Number.isFinite(costoCorrente)
		? `${costoCorrente.toFixed(2)} €/h`
		: 'Infinito';
	document.getElementById('val-recommended-c').innerText = String(cOttimale);

	const cardRecommended = document.getElementById('card-recommended');
	cardRecommended.className = 'metric';
	if (cAttuale > cOttimale) {
		cardRecommended.classList.add('status-warning');
	} else if (cAttuale < cOttimale) {
		cardRecommended.classList.add('status-danger');
	} else {
		cardRecommended.classList.add('status-safe');
	}

	aggiornaAllarme(metricaCorrente.rho, cAttuale, cOttimale, metricaCorrente);
	aggiornaGraficoAttesa(mu, cAttuale);
	aggiornaGraficoAllocazione(opzioniC, costiTotali, utilizzi, cAttuale, cOttimale);
}

document.addEventListener('DOMContentLoaded', () => {
	document.getElementById('lambda').addEventListener('input', aggiornaDashboard);
	document.getElementById('mu').addEventListener('input', aggiornaDashboard);
	document.getElementById('c').addEventListener('input', aggiornaDashboard);
	document.getElementById('cost-checkout').addEventListener('input', aggiornaDashboard);
	document.getElementById('cost-wait').addEventListener('input', aggiornaDashboard);
	aggiornaDashboard();
});
