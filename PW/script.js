const historySize = 24;

const state = {
	orders: 485230,
	throughputHistory: Array.from({ length: historySize }, () => Math.floor(Math.random() * 180) + 520),
	latencyHistory: Array.from({ length: historySize }, () => Math.floor(Math.random() * 9) + 28),
	loadHistory: Array.from({ length: historySize }, () => Math.floor(Math.random() * 18) + 65)
};

function pushHistory(history, value) {
	history.push(value);
	if (history.length > historySize) {
		history.shift();
	}
}

function renderSparkline(containerId, data, options = {}) {
	const container = document.getElementById(containerId);
	if (!container) {
		return;
	}

	const minValue = options.min ?? Math.min(...data);
	const maxValue = options.max ?? Math.max(...data);
	const range = Math.max(maxValue - minValue, 1);

	container.innerHTML = "";

	data.forEach((value) => {
		const normalized = ((value - minValue) / range) * 100;
		const bar = document.createElement("div");
		bar.className = "sparkline-bar";
		bar.style.height = `${Math.max(normalized, 8)}%`;

		if (options.dangerThreshold !== undefined && value >= options.dangerThreshold) {
			bar.style.backgroundColor = "var(--danger)";
		} else if (options.warningThreshold !== undefined && value >= options.warningThreshold) {
			bar.style.backgroundColor = "var(--warning)";
		} else {
			bar.style.backgroundColor = "var(--success)";
		}

		container.appendChild(bar);
	});
}

function updateStatusBadge(robotLatency, wcuUsage, auroraCpu) {
	const badge = document.querySelector(".status-badge");
	if (!badge) {
		return;
	}

	badge.classList.remove("warning", "danger");

	if (robotLatency >= 36 || wcuUsage >= 94 || auroraCpu >= 88) {
		badge.classList.add("danger");
		badge.textContent = "● SYSTEM CRITICAL (Tier 1)";
		return;
	}

	if (robotLatency >= 33 || wcuUsage >= 90 || auroraCpu >= 80) {
		badge.classList.add("warning");
		badge.textContent = "● SYSTEM DEGRADED (Tier 2)";
		return;
	}

	badge.textContent = "● SYSTEM STABLE (Tier 3)";
}

function updateDashboard() {
	const apiReq = Math.floor(Math.random() * 100) + 580;
	const kafkaMsg = Math.floor(Math.random() * 200) + 5800;
	const robotLat = Math.floor(Math.random() * 10) + 30;
	const auroraCpu = Math.floor(Math.random() * 10) + 78;
	const wcuUsed = Math.floor(Math.random() * 120) + 1820;
	const wanGbps = Math.floor(Math.random() * 8) + 55;
	const ecsUsed = Math.floor(Math.random() * 30) + 360;

	state.orders += Math.floor(Math.random() * 5) + 1;

	const throughputValue = Math.floor((apiReq * 0.85) + (kafkaMsg / 20));
	const loadIndex = Math.round(((auroraCpu + (wcuUsed / 20) + wanGbps) / 3));

	pushHistory(state.throughputHistory, throughputValue);
	pushHistory(state.latencyHistory, robotLat);
	pushHistory(state.loadHistory, loadIndex);

	document.getElementById("api-req").innerText = apiReq;
	document.getElementById("api-req-fill").style.width = `${Math.min((apiReq / 2000) * 100, 100)}%`;
	document.getElementById("kafka-msg").innerText = `${kafkaMsg.toLocaleString("it-IT")} msg/sec`;
	document.getElementById("ordini-count").innerText = state.orders.toLocaleString("it-IT");
	document.getElementById("robot-latency").innerText = `${robotLat} ms`;

	document.getElementById("aurora-cpu").innerText = `${auroraCpu}%`;
	document.getElementById("aurora-fill").style.width = `${auroraCpu}%`;
	document.getElementById("wcu-value").innerText = `${wcuUsed.toLocaleString("it-IT")} / 2.000 WCU`;
	document.getElementById("wcu-fill").style.width = `${Math.min((wcuUsed / 2000) * 100, 100)}%`;
	document.getElementById("wan-gbps").innerText = `${wanGbps} Gbps`;
	document.getElementById("wan-fill").style.width = `${Math.min(wanGbps, 100)}%`;
	document.getElementById("ecs-fill").style.width = `${Math.min((ecsUsed / 500) * 100, 100)}%`;

	renderSparkline("throughput-sparkline", state.throughputHistory, {
		min: 450,
		max: 900,
		warningThreshold: 760,
		dangerThreshold: 840
	});

	renderSparkline("latency-sparkline", state.latencyHistory, {
		min: 20,
		max: 45,
		warningThreshold: 33,
		dangerThreshold: 36
	});

	renderSparkline("load-sparkline", state.loadHistory, {
		min: 50,
		max: 95,
		warningThreshold: 75,
		dangerThreshold: 85
	});

	updateStatusBadge(robotLat, (wcuUsed / 2000) * 100, auroraCpu);
}

updateDashboard();
setInterval(updateDashboard, 2000);
