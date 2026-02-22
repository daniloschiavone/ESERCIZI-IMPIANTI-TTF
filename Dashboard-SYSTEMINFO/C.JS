let systemData = [
	{ id: 'cpu', name: 'CPU (Core)', current: 85, max: 100, unit: '%' },
	{ id: 'ram', name: 'RAM', current: 21.4, max: 32, unit: 'GB' },
	{ id: 'disk', name: 'Disk (IOPS)', current: 92, max: 100, unit: '%' },
	{ id: 'network', name: 'Network', current: 45, max: 100, unit: 'Mbps' }
];

function getColor(percentage) {
	if (percentage < 70) return 'var(--green)';
	if (percentage <= 85) return 'var(--yellow)';
	return 'var(--red)';
}

function renderDashboard() {
	const grid = document.getElementById('resourcesGrid');
	const bottleneckEl = document.getElementById('bottleneckRes');
	const recommendationEl = document.getElementById('recommendationRes');

	if (!grid || !bottleneckEl || !recommendationEl) {
		return;
	}

	grid.innerHTML = '';

	let highestUsage = 0;
	let bottleneckName = 'Nessuno';

	systemData.forEach((resource) => {
		const rawPercentage = (resource.current / resource.max) * 100;
		const percentage = Math.min(100, Math.round(rawPercentage * 10) / 10);

		if (percentage > highestUsage) {
			highestUsage = percentage;
			bottleneckName = resource.name;
		}

		const card = document.createElement('div');
		card.className = 'card';
		card.innerHTML = `
			<div class="card-header">
				<span>${resource.name}</span>
				<span>${percentage}%</span>
			</div>
			<div class="progress-bg">
				<div class="progress-fill" style="width: ${percentage}%; background-color: ${getColor(percentage)}"></div>
			</div>
			<div class="details">
				<span>Uso: ${resource.current} ${resource.unit}</span>
				<span>Max: ${resource.max} ${resource.unit}</span>
			</div>
		`;

		grid.appendChild(card);
	});

	if (highestUsage > 85) {
		bottleneckEl.innerHTML = `🚨 <strong style="color: #e74c3c">${bottleneckName}</strong> (${highestUsage}%)`;
		recommendationEl.innerHTML = `⚠️ <strong>UPGRADE URGENTE:</strong> ${bottleneckName} sta rallentando il sistema. Scala le risorse immediatamente.`;
		return;
	}

	if (highestUsage >= 70) {
		bottleneckEl.innerHTML = `👀 <strong>${bottleneckName}</strong> (${highestUsage}%)`;
		recommendationEl.innerHTML = `⚡ <strong>ATTENZIONE:</strong> Monitora ${bottleneckName} e pianifica ottimizzazione del carico.`;
		return;
	}

	bottleneckEl.innerHTML = '✅ Nessun collo di bottiglia critico.';
	recommendationEl.innerHTML = '✅ <strong>SISTEMA STABILE:</strong> Nessun intervento richiesto.';
}

function simulateLoad() {
	systemData = systemData.map((resource) => {
		const randomFactor = (Math.random() * 0.88) + 0.10;
		const newValue = resource.max * randomFactor;

		return {
			...resource,
			current: resource.id === 'ram'
				? Math.round(newValue * 10) / 10
				: Math.round(newValue)
		};
	});

	renderDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
	const simulateButton = document.getElementById('simulateBtn');

	if (simulateButton) {
		simulateButton.addEventListener('click', simulateLoad);
	}

	renderDashboard();
});
