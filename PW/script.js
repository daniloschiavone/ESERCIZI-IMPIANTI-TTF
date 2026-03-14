const historySize = 24;
const customStorageKey = "logistech-custom-load-day-v1";

const defaultCustomDayConfig = {
	label: "Custom Load Day",
	ordersBase: 485230,
	ranges: {
		apiReq: [560, 760],
		kafkaMsg: [5200, 6900],
		robotLat: [24, 32],
		auroraCpu: [66, 78],
		wcuUsed: [1420, 1720],
		wanGbps: [45, 58],
		ecsUsed: [320, 390],
		ordersIncrement: [3, 8]
	}
};

function cloneConfig(value) {
	return JSON.parse(JSON.stringify(value));
}

const scenarios = {
	"custom-day": {
		...cloneConfig(defaultCustomDayConfig),
		alerts: []
	},
	"black-friday": {
		label: "Black Friday",
		ordersBase: 730000,
		ranges: {
			apiReq: [1500, 1900],
			kafkaMsg: [8800, 10500],
			robotLat: [34, 42],
			auroraCpu: [86, 95],
			wcuUsed: [1860, 2000],
			wanGbps: [72, 90],
			ecsUsed: [430, 500],
			ordersIncrement: [10, 22]
		},
		queueStatus: "Jam multipli su nastri: priorita alta",
		alerts: [
			{
				level: "critical",
				time: "Oggi, 20:42:15 CET | SOURCE: AWS Outposts FC Milano 1",
				msg: "<strong>Black Friday Surge:</strong> Robot AMR in saturazione. Latenza controllo >35ms, safety mode su 2 corridoi.",
				timeClass: ""
			},
			{
				level: "warning",
				time: "Oggi, 20:40:20 CET | SOURCE: Amazon DynamoDB",
				msg: "<strong>Throttling elevato:</strong> WCU prossime al limite (>=96%). Auto-scaling attivo con backlog in crescita.",
				timeClass: ""
			},
			{
				level: "",
				time: "Oggi, 20:36:05 CET | SOURCE: Auto-Scaling Group",
				msg: "Scale-out urgente completato: +120 task ECS in 6 minuti.",
				timeClass: "alert-time-success"
			}
		]
	},
	"prime-day": {
		label: "Prime Day Sales",
		ordersBase: 650000,
		ranges: {
			apiReq: [1200, 1600],
			kafkaMsg: [7600, 9200],
			robotLat: [31, 38],
			auroraCpu: [80, 90],
			wcuUsed: [1760, 1940],
			wanGbps: [64, 80],
			ecsUsed: [400, 480],
			ordersIncrement: [8, 18]
		},
		queueStatus: "Flusso intenso: monitoraggio continuo",
		alerts: [
			{
				level: "warning",
				time: "Oggi, 18:52:10 CET | SOURCE: API Gateway",
				msg: "<strong>Picco richieste:</strong> Endpoint tracking oltre baseline (+68%). Latenza p95 in area warning.",
				timeClass: ""
			},
			{
				level: "warning",
				time: "Oggi, 18:48:45 CET | SOURCE: Kafka MSK",
				msg: "<strong>Consumer Lag:</strong> Lag intermittente su topic package-tracking. Rebalance in corso.",
				timeClass: ""
			},
			{
				level: "",
				time: "Oggi, 18:40:00 CET | SOURCE: WMS Orchestrator",
				msg: "Wave picking ottimizzato: throughput +14% dopo tuning scheduler.",
				timeClass: "alert-time-success"
			}
		]
	},
	"big-deal-days": {
		label: "Prime Big Deal Days",
		ordersBase: 590000,
		ranges: {
			apiReq: [900, 1250],
			kafkaMsg: [6400, 7900],
			robotLat: [27, 34],
			auroraCpu: [72, 84],
			wcuUsed: [1560, 1840],
			wanGbps: [50, 66],
			ecsUsed: [350, 430],
			ordersIncrement: [5, 13]
		},
		queueStatus: "Operativita controllata",
		alerts: [
			{
				level: "warning",
				time: "Oggi, 17:25:35 CET | SOURCE: Amazon DynamoDB",
				msg: "<strong>Capacita in crescita:</strong> WCU tra 78% e 88%. Nessun throttle critico rilevato.",
				timeClass: ""
			},
			{
				level: "",
				time: "Oggi, 17:18:20 CET | SOURCE: AWS Outposts FC Milano 1",
				msg: "Latenza robot stabile sotto soglia critica con QoS attivo.",
				timeClass: "alert-time-success"
			},
			{
				level: "",
				time: "Oggi, 17:10:50 CET | SOURCE: Auto-Scaling Group",
				msg: "Scale policy preventiva applicata: +40 task per finestra promozionale.",
				timeClass: "alert-time-success"
			}
		]
	}
};

const state = {
	orders: scenarios["custom-day"].ordersBase,
	activeScenario: "custom-day",
	throughputHistory: [],
	latencyHistory: [],
	loadHistory: []
};

const customInputMap = {
	ordersBase: "custom-orders-base",
	apiReqMin: "custom-api-min",
	apiReqMax: "custom-api-max",
	kafkaMsgMin: "custom-kafka-min",
	kafkaMsgMax: "custom-kafka-max",
	robotLatMin: "custom-robot-min",
	robotLatMax: "custom-robot-max",
	auroraCpuMin: "custom-aurora-min",
	auroraCpuMax: "custom-aurora-max",
	wcuUsedMin: "custom-wcu-min",
	wcuUsedMax: "custom-wcu-max",
	wanGbpsMin: "custom-wan-min",
	wanGbpsMax: "custom-wan-max",
	ecsUsedMin: "custom-ecs-min",
	ecsUsedMax: "custom-ecs-max",
	ordersIncrementMin: "custom-inc-min",
	ordersIncrementMax: "custom-inc-max"
};

function getNowTimeLabel(source) {
	return `${new Date().toLocaleTimeString("it-IT")} CET | SOURCE: ${source}`;
}

function loadCustomDayConfig() {
	try {
		const savedRaw = localStorage.getItem(customStorageKey);
		if (!savedRaw) {
			return cloneConfig(defaultCustomDayConfig);
		}

		const saved = JSON.parse(savedRaw);
		if (!saved || typeof saved !== "object" || !saved.ranges) {
			return cloneConfig(defaultCustomDayConfig);
		}

		return {
			...cloneConfig(defaultCustomDayConfig),
			...saved,
			ranges: {
				...cloneConfig(defaultCustomDayConfig).ranges,
				...saved.ranges
			}
		};
	} catch (error) {
		return cloneConfig(defaultCustomDayConfig);
	}
}

function saveCustomDayConfig(config) {
	localStorage.setItem(customStorageKey, JSON.stringify(config));
}

function setFeedback(message, isError = false) {
	const feedback = document.getElementById("custom-feedback");
	if (!feedback) {
		return;
	}

	feedback.textContent = message;
	feedback.classList.toggle("error", isError);
}

function updateCustomControlsVisibility() {
	const controls = document.getElementById("custom-controls");
	if (!controls) {
		return;
	}

	const isCustom = state.activeScenario === "custom-day";
	controls.classList.toggle("hidden", !isCustom);

	controls.querySelectorAll("input, button").forEach((field) => {
		field.disabled = !isCustom;
	});
}

function resetCustomDayToDefault() {
	const defaultConfig = cloneConfig(defaultCustomDayConfig);
	applyCustomConfig(defaultConfig, true);
	fillCustomControls(scenarios["custom-day"]);
	setFeedback("Custom Load Day ripristinato ai valori standard.");
	updateDashboard();
}

function fillCustomControls(config) {
	const setValue = (key, value) => {
		const input = document.getElementById(customInputMap[key]);
		if (input) {
			input.value = String(value);
		}
	};

	setValue("ordersBase", config.ordersBase);
	setValue("apiReqMin", config.ranges.apiReq[0]);
	setValue("apiReqMax", config.ranges.apiReq[1]);
	setValue("kafkaMsgMin", config.ranges.kafkaMsg[0]);
	setValue("kafkaMsgMax", config.ranges.kafkaMsg[1]);
	setValue("robotLatMin", config.ranges.robotLat[0]);
	setValue("robotLatMax", config.ranges.robotLat[1]);
	setValue("auroraCpuMin", config.ranges.auroraCpu[0]);
	setValue("auroraCpuMax", config.ranges.auroraCpu[1]);
	setValue("wcuUsedMin", config.ranges.wcuUsed[0]);
	setValue("wcuUsedMax", config.ranges.wcuUsed[1]);
	setValue("wanGbpsMin", config.ranges.wanGbps[0]);
	setValue("wanGbpsMax", config.ranges.wanGbps[1]);
	setValue("ecsUsedMin", config.ranges.ecsUsed[0]);
	setValue("ecsUsedMax", config.ranges.ecsUsed[1]);
	setValue("ordersIncrementMin", config.ranges.ordersIncrement[0]);
	setValue("ordersIncrementMax", config.ranges.ordersIncrement[1]);
}

function parseCustomControls() {
	const getNum = (id) => Number(document.getElementById(id)?.value);

	const parsed = {
		label: "Custom Load Day",
		ordersBase: getNum(customInputMap.ordersBase),
		ranges: {
			apiReq: [getNum(customInputMap.apiReqMin), getNum(customInputMap.apiReqMax)],
			kafkaMsg: [getNum(customInputMap.kafkaMsgMin), getNum(customInputMap.kafkaMsgMax)],
			robotLat: [getNum(customInputMap.robotLatMin), getNum(customInputMap.robotLatMax)],
			auroraCpu: [getNum(customInputMap.auroraCpuMin), getNum(customInputMap.auroraCpuMax)],
			wcuUsed: [getNum(customInputMap.wcuUsedMin), getNum(customInputMap.wcuUsedMax)],
			wanGbps: [getNum(customInputMap.wanGbpsMin), getNum(customInputMap.wanGbpsMax)],
			ecsUsed: [getNum(customInputMap.ecsUsedMin), getNum(customInputMap.ecsUsedMax)],
			ordersIncrement: [getNum(customInputMap.ordersIncrementMin), getNum(customInputMap.ordersIncrementMax)]
		}
	};

	const numericValues = [
		parsed.ordersBase,
		...Object.values(parsed.ranges).flat()
	];
	if (numericValues.some((value) => !Number.isFinite(value))) {
		return { ok: false, reason: "Compila tutti i campi numerici con valori validi." };
	}

	const invalidRange = Object.entries(parsed.ranges).find(([, range]) => range[0] > range[1]);
	if (invalidRange) {
		return { ok: false, reason: `Range non valido per ${invalidRange[0]} (min > max).` };
	}

	if (parsed.ranges.auroraCpu[1] > 100) {
		return { ok: false, reason: "Aurora CPU max deve essere <= 100." };
	}

	if (parsed.ranges.wcuUsed[1] > 2000) {
		return { ok: false, reason: "DynamoDB WCU max deve essere <= 2000." };
	}

	if (parsed.ranges.ecsUsed[1] > 500) {
		return { ok: false, reason: "ECS task max deve essere <= 500." };
	}

	return { ok: true, config: parsed };
}

function applyCustomConfig(config, resetMetrics = false) {
	scenarios["custom-day"] = {
		...scenarios["custom-day"],
		...config,
		label: "Custom Load Day"
	};
	saveCustomDayConfig(config);

	if (resetMetrics && state.activeScenario === "custom-day") {
		state.orders = config.ordersBase;
		seedHistoryFromScenario("custom-day");
	}
}

function buildCustomAlerts(metrics) {
	const wcuPct = (metrics.wcuUsed / 2000) * 100;

	const robotLevel = metrics.robotLat >= 36 ? "critical" : (metrics.robotLat >= 33 ? "warning" : "");
	const wcuLevel = wcuPct >= 94 ? "critical" : (wcuPct >= 88 ? "warning" : "");
	const infraScore = (metrics.auroraCpu + metrics.wanGbps + (metrics.ecsUsed / 5)) / 3;
	const infraLevel = infraScore >= 78 ? "warning" : "";

	return [
		{
			level: robotLevel,
			time: getNowTimeLabel("AWS Outposts FC Milano 1"),
			msg: robotLevel
				? `<strong>Robot AMR:</strong> latenza controllo ${metrics.robotLat}ms, monitoraggio rinforzato.`
				: `<strong>Robot AMR:</strong> latenza in controllo (${metrics.robotLat}ms).`,
			timeClass: robotLevel ? "" : "alert-time-success"
		},
		{
			level: wcuLevel,
			time: getNowTimeLabel("Amazon DynamoDB"),
			msg: wcuLevel
				? `<strong>Capacita WCU:</strong> utilizzo ${Math.round(wcuPct)}%. Possibile rischio throttling.`
				: `<strong>Capacita WCU:</strong> utilizzo ${Math.round(wcuPct)}%, entro margine operativo.`,
			timeClass: wcuLevel ? "" : "alert-time-success"
		},
		{
			level: infraLevel,
			time: getNowTimeLabel("Auto-Scaling Group"),
			msg: infraLevel
				? `Pressione infrastrutturale elevata (score ${infraScore.toFixed(1)}). Scale-out raccomandato.`
				: `Infrastruttura bilanciata (score ${infraScore.toFixed(1)}). Policy standard attive.`,
			timeClass: infraLevel ? "" : "alert-time-success"
		}
	];
}

function renderAlerts(alertData) {
	for (let i = 0; i < 3; i += 1) {
		const item = document.getElementById(`alert-item-${i + 1}`);
		const time = document.getElementById(`alert-time-${i + 1}`);
		const msg = document.getElementById(`alert-msg-${i + 1}`);
		if (!item || !time || !msg) {
			continue;
		}

		item.className = `alert-item${alertData[i].level ? ` ${alertData[i].level}` : ""}`;
		time.className = `alert-time${alertData[i].timeClass ? ` ${alertData[i].timeClass}` : ""}`;
		time.textContent = alertData[i].time;
		msg.innerHTML = alertData[i].msg;
	}
}

function randomBetween(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

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

	if (robotLatency >= 33 || wcuUsage >= 88 || auroraCpu >= 82) {
		badge.classList.add("warning");
		badge.textContent = "● SYSTEM DEGRADED (Tier 2)";
		return;
	}

	badge.textContent = "● SYSTEM STABLE (Tier 3)";
}

function evaluateOperationalState(metrics) {
	const wcuPct = (metrics.wcuUsed / 2000) * 100;
	const ecsPct = (metrics.ecsUsed / 500) * 100;

	let score = 0;
	if (metrics.robotLat >= 36) score += 3;
	else if (metrics.robotLat >= 33) score += 2;
	else if (metrics.robotLat >= 30) score += 1;

	if (metrics.auroraCpu >= 88) score += 3;
	else if (metrics.auroraCpu >= 82) score += 2;
	else if (metrics.auroraCpu >= 75) score += 1;

	if (wcuPct >= 94) score += 3;
	else if (wcuPct >= 88) score += 2;
	else if (wcuPct >= 80) score += 1;

	if (metrics.apiReq >= 1700) score += 2;
	else if (metrics.apiReq >= 1200) score += 1;

	if (metrics.kafkaMsg >= 9500) score += 1;
	if (metrics.wanGbps >= 80) score += 2;
	else if (metrics.wanGbps >= 65) score += 1;

	if (ecsPct >= 95) score += 2;
	else if (ecsPct >= 85) score += 1;

	if (score >= 8) {
		return { label: "Critico (Tier 1)", statusText: "CRITICAL", colorClass: "color-danger" };
	}
	if (score >= 4) {
		return { label: "Degradato (Tier 2)", statusText: "DEGRADED", colorClass: "color-warning" };
	}
	return { label: "Stabile (Tier 3)", statusText: "STABLE", colorClass: "color-success" };
}

function renderInferredState(assessment) {
	const stateEl = document.getElementById("inferred-state");
	if (!stateEl) {
		return;
	}

	stateEl.classList.remove("color-success", "color-warning", "color-danger");
	stateEl.classList.add(assessment.colorClass);
	stateEl.textContent = assessment.label;
}

function renderProjectedStateFromConfig(config) {
	const inferenceEl = document.getElementById("custom-inference");
	if (!inferenceEl) {
		return;
	}

	const ranges = config.ranges;
	const metrics = {
		apiReq: Math.round((ranges.apiReq[0] + ranges.apiReq[1]) / 2),
		kafkaMsg: Math.round((ranges.kafkaMsg[0] + ranges.kafkaMsg[1]) / 2),
		robotLat: Math.round((ranges.robotLat[0] + ranges.robotLat[1]) / 2),
		auroraCpu: Math.round((ranges.auroraCpu[0] + ranges.auroraCpu[1]) / 2),
		wcuUsed: Math.round((ranges.wcuUsed[0] + ranges.wcuUsed[1]) / 2),
		wanGbps: Math.round((ranges.wanGbps[0] + ranges.wanGbps[1]) / 2),
		ecsUsed: Math.round((ranges.ecsUsed[0] + ranges.ecsUsed[1]) / 2)
	};

	const projected = evaluateOperationalState(metrics);
	inferenceEl.textContent = `Stato previsto dai valori inseriti: ${projected.label}`;
}

function updateAlerts(scenarioKey) {
	renderAlerts(scenarios[scenarioKey].alerts);
}

function seedHistoryFromScenario(scenarioKey) {
	const ranges = scenarios[scenarioKey].ranges;
	state.throughputHistory = Array.from(
		{ length: historySize },
		() => Math.floor(randomBetween(ranges.apiReq[0], ranges.apiReq[1]) * 0.8 + randomBetween(ranges.kafkaMsg[0], ranges.kafkaMsg[1]) / 25)
	);
	state.latencyHistory = Array.from({ length: historySize }, () => randomBetween(ranges.robotLat[0], ranges.robotLat[1]));
	state.loadHistory = Array.from(
		{ length: historySize },
		() => Math.round((randomBetween(ranges.auroraCpu[0], ranges.auroraCpu[1]) + randomBetween(ranges.wcuUsed[0], ranges.wcuUsed[1]) / 20 + randomBetween(ranges.wanGbps[0], ranges.wanGbps[1])) / 3)
	);
}

function setScenario(scenarioKey) {
	if (!scenarios[scenarioKey]) {
		return;
	}

	state.activeScenario = scenarioKey;
	state.orders = scenarios[scenarioKey].ordersBase;
	seedHistoryFromScenario(scenarioKey);
	if (scenarioKey !== "custom-day") {
		updateAlerts(scenarioKey);
	}

	const scenarioName = document.getElementById("scenario-name");
	if (scenarioName) {
		scenarioName.textContent = scenarios[scenarioKey].label;
	}

	document.querySelectorAll(".scenario-btn").forEach((btn) => {
		btn.classList.toggle("active", btn.dataset.scenario === scenarioKey);
	});

	updateCustomControlsVisibility();
	if (scenarioKey === "custom-day") {
		fillCustomControls(scenarios["custom-day"]);
		renderProjectedStateFromConfig(scenarios["custom-day"]);
		setFeedback("Modifica i valori: gli aggiornamenti sono live.");
	} else {
		setFeedback("");
	}
}

function updateDashboard() {
	const currentScenario = scenarios[state.activeScenario];
	const ranges = currentScenario.ranges;

	const apiReq = randomBetween(ranges.apiReq[0], ranges.apiReq[1]);
	const kafkaMsg = randomBetween(ranges.kafkaMsg[0], ranges.kafkaMsg[1]);
	const robotLat = randomBetween(ranges.robotLat[0], ranges.robotLat[1]);
	const auroraCpu = randomBetween(ranges.auroraCpu[0], ranges.auroraCpu[1]);
	const wcuUsed = randomBetween(ranges.wcuUsed[0], ranges.wcuUsed[1]);
	const wanGbps = randomBetween(ranges.wanGbps[0], ranges.wanGbps[1]);
	const ecsUsed = randomBetween(ranges.ecsUsed[0], ranges.ecsUsed[1]);

	state.orders += randomBetween(ranges.ordersIncrement[0], ranges.ordersIncrement[1]);

	const throughputValue = Math.floor(apiReq * 0.82 + kafkaMsg / 20);
	const loadIndex = Math.round((auroraCpu + wcuUsed / 20 + wanGbps) / 3);

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
	document.getElementById("ecs-used").innerText = `${ecsUsed} / 500`;

	const assessment = evaluateOperationalState({
		apiReq,
		kafkaMsg,
		robotLat,
		auroraCpu,
		wcuUsed,
		wanGbps,
		ecsUsed
	});
	renderInferredState(assessment);

	renderSparkline("throughput-sparkline", state.throughputHistory, {
		min: 450,
		max: 2000,
		warningThreshold: 1200,
		dangerThreshold: 1650
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

	if (state.activeScenario === "custom-day") {
		renderAlerts(buildCustomAlerts({ robotLat, wcuUsed, auroraCpu, wanGbps, ecsUsed }));
	}
}

document.querySelectorAll(".scenario-btn").forEach((button) => {
	button.addEventListener("click", () => {
		setScenario(button.dataset.scenario);
		updateDashboard();
	});
});

const loadedCustomConfig = loadCustomDayConfig();
applyCustomConfig(loadedCustomConfig, false);
fillCustomControls(scenarios["custom-day"]);

Object.values(customInputMap).forEach((inputId) => {
	const input = document.getElementById(inputId);
	if (!input) {
		return;
	}

	input.addEventListener("input", () => {
		if (state.activeScenario !== "custom-day") {
			return;
		}

		const parsed = parseCustomControls();
		if (!parsed.ok) {
			setFeedback(parsed.reason, true);
			return;
		}

		renderProjectedStateFromConfig(parsed.config);

		setFeedback("Custom Load Day aggiornato e salvato.");
		applyCustomConfig(parsed.config, true);
		updateDashboard();
	});
});

const customResetBtn = document.getElementById("custom-reset-btn");
if (customResetBtn) {
	customResetBtn.addEventListener("click", resetCustomDayToDefault);
}

setScenario("custom-day");
updateDashboard();
setInterval(updateDashboard, 2000);
