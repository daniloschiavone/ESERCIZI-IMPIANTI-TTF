const historySize = 24;
const ORDERS_TARGET = 700000;

/* In-memory storage per configurazione custom */
let memoryStorage = {};

/* ── Stato simulazione ── */
let simRunning = true;
let simIntervalId = null;

/* ── Soglie per colori dinamici ── */
const thresholds = {
	apiReq:           { warning: 1200, danger: 1700 },
	kafkaMsg:         { warning: 8000, danger: 9500 },
	robotLat:         { warning: 33,   danger: 36 },
	auroraCpu:        { warning: 82,   danger: 88 },
	wcuPct:           { warning: 88,   danger: 94 },
	wanGbps:          { warning: 65,   danger: 80 },
	ecsPct:           { warning: 85,   danger: 95 },
	apiTrackingLat:   { warning: 110,  danger: 150 },
	auroraWriteLat:   { warning: 55,   danger: 80 },
	kafkaIngestionLat:{ warning: 25,   danger: 40 },
	kafkaLag:         { warning: 50,   danger: 200 }
};

/* ── Valori precedenti per delta ── */
const prevValues = {};

function getColorClass(value, key) {
	const t = thresholds[key];
	if (!t) return "color-success";
	if (value >= t.danger) return "color-danger";
	if (value >= t.warning) return "color-warning";
	return "color-success";
}

function getBarClass(value, key) {
	const t = thresholds[key];
	if (!t) return "";
	if (value >= t.danger) return "danger";
	if (value >= t.warning) return "warning";
	return "";
}

function applyColor(elementId, colorClass) {
	const el = document.getElementById(elementId);
	if (!el) return;
	el.classList.remove("color-success", "color-warning", "color-danger");
	el.classList.add(colorClass);
}

function applyBarColor(elementId, barClass) {
	const el = document.getElementById(elementId);
	if (!el) return;
	el.classList.remove("warning", "danger");
	if (barClass) el.classList.add(barClass);
}

/* ── Delta / trend ── */
function renderDelta(elementId, currentValue, prevValue, invertDirection) {
	const el = document.getElementById(elementId);
	if (!el) return;

	if (prevValue === undefined || prevValue === null) {
		el.textContent = "--";
		el.className = "delta-value delta-flat";
		return;
	}

	const diff = currentValue - prevValue;
	if (diff === 0) {
		el.textContent = "=";
		el.className = "delta-value delta-flat";
		return;
	}

	const pct = prevValue !== 0 ? Math.abs((diff / prevValue) * 100).toFixed(1) : "0.0";
	const arrow = diff > 0 ? "\u2191" : "\u2193";
	el.textContent = `${arrow}${pct}%`;

	if (diff > 0) {
		el.className = invertDirection
			? "delta-value delta-up positive"
			: "delta-value delta-up";
	} else {
		el.className = invertDirection
			? "delta-value delta-down positive"
			: "delta-value delta-down";
	}
}

/* ── Animazione count-up ── */
let ordiniAnimFrame = null;
let ordiniDisplayed = 0;

function animateOrdini(targetValue) {
	if (ordiniAnimFrame) cancelAnimationFrame(ordiniAnimFrame);

	const start = ordiniDisplayed;
	const diff = targetValue - start;
	if (diff === 0) return;

	const duration = 600;
	const startTime = performance.now();
	const el = document.getElementById("ordini-count");
	if (!el) return;

	function step(now) {
		const elapsed = now - startTime;
		const progress = Math.min(elapsed / duration, 1);
		const eased = 1 - Math.pow(1 - progress, 3);
		const current = Math.round(start + diff * eased);
		el.textContent = current.toLocaleString("it-IT");
		ordiniDisplayed = current;

		if (progress < 1) {
			ordiniAnimFrame = requestAnimationFrame(step);
		}
	}

	ordiniAnimFrame = requestAnimationFrame(step);
}

/* ── Orologio live ── */
function updateClock() {
	const el = document.getElementById("live-clock");
	if (!el) return;
	const now = new Date();
	el.textContent = now.toLocaleTimeString("it-IT", {
		timeZone: "Europe/Rome",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	}) + " CET";
}

/* ── Timestamp ultimo aggiornamento ── */
function updateLastUpdateTimestamp() {
	const el = document.getElementById("last-update");
	if (!el) return;
	const now = new Date();
	el.textContent = "Aggiornato " + now.toLocaleTimeString("it-IT", {
		timeZone: "Europe/Rome",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	});
}

/* ── Play / Pause ── */
function toggleSimulation() {
	simRunning = !simRunning;
	const icon = document.getElementById("sim-toggle-icon");
	const label = document.getElementById("sim-toggle-label");
	const btn = document.getElementById("sim-toggle");

	if (simRunning) {
		icon.textContent = "\u23F8";
		label.textContent = "Pausa";
		btn.classList.remove("paused");
		simIntervalId = setInterval(updateDashboard, 2000);
		updateDashboard();
	} else {
		icon.textContent = "\u25B6";
		label.textContent = "Riprendi";
		btn.classList.add("paused");
		if (simIntervalId) {
			clearInterval(simIntervalId);
			simIntervalId = null;
		}
	}
}

/* ── Config e scenari ── */

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

/* Range latenze SLA per scenario */
const slaRanges = {
	"custom-day":    { apiTracking: [70, 95],  auroraWrite: [30, 48], kafkaIngestion: [12, 20], kafkaLag: [0, 5] },
	"black-friday":  { apiTracking: [120, 180], auroraWrite: [60, 100], kafkaIngestion: [28, 50], kafkaLag: [80, 350] },
	"prime-day":     { apiTracking: [100, 145], auroraWrite: [48, 75], kafkaIngestion: [22, 38], kafkaLag: [30, 150] },
	"big-deal-days": { apiTracking: [85, 120],  auroraWrite: [38, 60], kafkaIngestion: [16, 28], kafkaLag: [5, 60] }
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
		const saved = memoryStorage.customConfig;
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
	memoryStorage.customConfig = cloneConfig(config);
}

function setFeedback(message, isError = false) {
	const feedback = document.getElementById("custom-feedback");
	if (!feedback) return;
	feedback.textContent = message;
	feedback.classList.toggle("error", isError);
}

function updateCustomControlsVisibility() {
	const controls = document.getElementById("custom-controls");
	if (!controls) return;

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
		if (input) input.value = String(value);
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
		if (!item || !time || !msg) continue;

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
	if (history.length > historySize) history.shift();
}

function renderSparkline(containerId, data, options = {}) {
	const container = document.getElementById(containerId);
	if (!container) return;

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

		/* Tooltip */
		const tooltip = document.createElement("div");
		tooltip.className = "sparkline-tooltip";
		tooltip.textContent = options.unit ? `${value} ${options.unit}` : String(value);
		bar.appendChild(tooltip);

		container.appendChild(bar);
	});
}

function updateStatusBadge(robotLatency, wcuUsage, auroraCpu) {
	const badge = document.querySelector(".status-badge");
	if (!badge) return;

	badge.classList.remove("warning", "danger");

	if (robotLatency >= 36 || wcuUsage >= 94 || auroraCpu >= 88) {
		badge.classList.add("danger");
		badge.textContent = "\u25CF SYSTEM CRITICAL (Tier 1)";
		return;
	}

	if (robotLatency >= 33 || wcuUsage >= 88 || auroraCpu >= 82) {
		badge.classList.add("warning");
		badge.textContent = "\u25CF SYSTEM DEGRADED (Tier 2)";
		return;
	}

	badge.textContent = "\u25CF SYSTEM STABLE (Tier 3)";
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
	if (!stateEl) return;

	stateEl.classList.remove("color-success", "color-warning", "color-danger");
	stateEl.classList.add(assessment.colorClass);
	stateEl.textContent = assessment.label;
}

function renderProjectedStateFromConfig(config) {
	const inferenceEl = document.getElementById("custom-inference");
	if (!inferenceEl) return;

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
	if (!scenarios[scenarioKey]) return;

	state.activeScenario = scenarioKey;
	state.orders = scenarios[scenarioKey].ordersBase;
	ordiniDisplayed = state.orders;
	seedHistoryFromScenario(scenarioKey);

	/* Reset prevValues per evitare delta assurdi tra scenari */
	Object.keys(prevValues).forEach(k => delete prevValues[k]);

	if (scenarioKey !== "custom-day") {
		updateAlerts(scenarioKey);
	}

	const scenarioName = document.getElementById("scenario-name");
	if (scenarioName) scenarioName.textContent = scenarios[scenarioKey].label;

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

/* ── Dashboard update principale ── */
function updateDashboard() {
	const currentScenario = scenarios[state.activeScenario];
	const ranges = currentScenario.ranges;
	const sla = slaRanges[state.activeScenario] || slaRanges["custom-day"];

	const apiReq = randomBetween(ranges.apiReq[0], ranges.apiReq[1]);
	const kafkaMsg = randomBetween(ranges.kafkaMsg[0], ranges.kafkaMsg[1]);
	const robotLat = randomBetween(ranges.robotLat[0], ranges.robotLat[1]);
	const auroraCpu = randomBetween(ranges.auroraCpu[0], ranges.auroraCpu[1]);
	const wcuUsed = randomBetween(ranges.wcuUsed[0], ranges.wcuUsed[1]);
	const wanGbps = randomBetween(ranges.wanGbps[0], ranges.wanGbps[1]);
	const ecsUsed = randomBetween(ranges.ecsUsed[0], ranges.ecsUsed[1]);

	/* SLA latenze dinamiche */
	const apiTrackingLat = randomBetween(sla.apiTracking[0], sla.apiTracking[1]);
	const auroraWriteLat = randomBetween(sla.auroraWrite[0], sla.auroraWrite[1]);
	const kafkaIngestionLat = randomBetween(sla.kafkaIngestion[0], sla.kafkaIngestion[1]);
	const kafkaLag = randomBetween(sla.kafkaLag[0], sla.kafkaLag[1]);

	const wcuPct = (wcuUsed / 2000) * 100;
	const ecsPct = (ecsUsed / 500) * 100;

	/* Ordini con tetto giornaliero */
	const increment = randomBetween(ranges.ordersIncrement[0], ranges.ordersIncrement[1]);
	state.orders = Math.min(state.orders + increment, ORDERS_TARGET);

	const throughputValue = Math.floor(apiReq * 0.82 + kafkaMsg / 20);
	const loadIndex = Math.round((auroraCpu + wcuUsed / 20 + wanGbps) / 3);

	pushHistory(state.throughputHistory, throughputValue);
	pushHistory(state.latencyHistory, robotLat);
	pushHistory(state.loadHistory, loadIndex);

	/* ── Aggiorna valori ── */
	animateOrdini(state.orders);

	/* Progress bar ordini verso target */
	const ordiniPct = Math.min((state.orders / ORDERS_TARGET) * 100, 100);
	document.getElementById("ordini-fill").style.width = `${ordiniPct}%`;
	applyBarColor("ordini-fill", ordiniPct >= 95 ? "warning" : "");

	document.getElementById("api-req").innerText = apiReq.toLocaleString("it-IT");
	document.getElementById("api-req-fill").style.width = `${Math.min((apiReq / 2000) * 100, 100)}%`;

	document.getElementById("kafka-msg").innerText = `${kafkaMsg.toLocaleString("it-IT")} msg/sec`;

	document.getElementById("robot-latency").innerText = `${robotLat} ms`;

	/* SLA latenze */
	document.getElementById("api-tracking-latency").innerText = `${apiTrackingLat} ms`;
	document.getElementById("aurora-write-latency").innerText = `${auroraWriteLat} ms`;
	document.getElementById("kafka-ingestion-latency").innerText = `${kafkaIngestionLat} ms`;

	/* Kafka lag */
	document.getElementById("kafka-lag").innerText = `${kafkaLag} ms`;

	document.getElementById("aurora-cpu").innerText = `${auroraCpu}%`;
	document.getElementById("aurora-fill").style.width = `${auroraCpu}%`;

	document.getElementById("wcu-value").innerText = `${wcuUsed.toLocaleString("it-IT")} / 2.000 WCU`;
	document.getElementById("wcu-fill").style.width = `${Math.min(wcuPct, 100)}%`;

	document.getElementById("wan-gbps").innerText = `${wanGbps} Gbps`;
	document.getElementById("wan-fill").style.width = `${Math.min(wanGbps, 100)}%`;

	document.getElementById("ecs-used").innerText = `${ecsUsed} / 500`;
	document.getElementById("ecs-fill").style.width = `${Math.min(ecsPct, 100)}%`;

	/* ── Colori dinamici su tutte le metriche ── */
	applyColor("api-req", getColorClass(apiReq, "apiReq"));
	applyColor("kafka-msg", getColorClass(kafkaMsg, "kafkaMsg"));
	applyColor("robot-latency", getColorClass(robotLat, "robotLat"));
	applyColor("aurora-cpu", getColorClass(auroraCpu, "auroraCpu"));
	applyColor("wcu-value", getColorClass(wcuPct, "wcuPct"));
	applyColor("wan-gbps", getColorClass(wanGbps, "wanGbps"));
	applyColor("ecs-used", getColorClass(ecsPct, "ecsPct"));

	/* Colori SLA */
	applyColor("api-tracking-latency", getColorClass(apiTrackingLat, "apiTrackingLat"));
	applyColor("aurora-write-latency", getColorClass(auroraWriteLat, "auroraWriteLat"));
	applyColor("kafka-ingestion-latency", getColorClass(kafkaIngestionLat, "kafkaIngestionLat"));
	applyColor("kafka-lag", getColorClass(kafkaLag, "kafkaLag"));

	/* ── Colori dinamici sulle progress bar ── */
	applyBarColor("api-req-fill", getBarClass(apiReq, "apiReq"));
	applyBarColor("aurora-fill", getBarClass(auroraCpu, "auroraCpu"));
	applyBarColor("wcu-fill", getBarClass(wcuPct, "wcuPct"));
	applyBarColor("wan-fill", getBarClass(wanGbps, "wanGbps"));
	applyBarColor("ecs-fill", getBarClass(ecsPct, "ecsPct"));

	/* ── Delta / trend indicators ── */
	renderDelta("delta-api-req", apiReq, prevValues.apiReq, false);
	renderDelta("delta-kafka-msg", kafkaMsg, prevValues.kafkaMsg, false);
	renderDelta("delta-robot-lat", robotLat, prevValues.robotLat, false);
	renderDelta("delta-aurora-cpu", auroraCpu, prevValues.auroraCpu, false);
	renderDelta("delta-wcu", wcuUsed, prevValues.wcuUsed, false);
	renderDelta("delta-wan", wanGbps, prevValues.wanGbps, false);
	renderDelta("delta-ecs", ecsUsed, prevValues.ecsUsed, false);
	renderDelta("delta-api-tracking", apiTrackingLat, prevValues.apiTrackingLat, false);
	renderDelta("delta-aurora-write", auroraWriteLat, prevValues.auroraWriteLat, false);
	renderDelta("delta-kafka-ingestion", kafkaIngestionLat, prevValues.kafkaIngestionLat, false);

	/* Salva valori correnti come precedenti */
	prevValues.apiReq = apiReq;
	prevValues.kafkaMsg = kafkaMsg;
	prevValues.robotLat = robotLat;
	prevValues.auroraCpu = auroraCpu;
	prevValues.wcuUsed = wcuUsed;
	prevValues.wanGbps = wanGbps;
	prevValues.ecsUsed = ecsUsed;
	prevValues.apiTrackingLat = apiTrackingLat;
	prevValues.auroraWriteLat = auroraWriteLat;
	prevValues.kafkaIngestionLat = kafkaIngestionLat;

	/* ── Stato operativo ── */
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

	/* ── Sparkline con tooltip ── */
	renderSparkline("throughput-sparkline", state.throughputHistory, {
		min: 450,
		max: 2000,
		warningThreshold: 1200,
		dangerThreshold: 1650,
		unit: ""
	});

	renderSparkline("latency-sparkline", state.latencyHistory, {
		min: 20,
		max: 45,
		warningThreshold: 33,
		dangerThreshold: 36,
		unit: "ms"
	});

	renderSparkline("load-sparkline", state.loadHistory, {
		min: 50,
		max: 95,
		warningThreshold: 75,
		dangerThreshold: 85,
		unit: ""
	});

	/* ── Badge e alert ── */
	updateStatusBadge(robotLat, wcuPct, auroraCpu);

	if (state.activeScenario === "custom-day") {
		renderAlerts(buildCustomAlerts({ robotLat, wcuUsed, auroraCpu, wanGbps, ecsUsed }));
	}

	/* Timestamp aggiornamento */
	updateLastUpdateTimestamp();
}

/* ── Event listeners ── */
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
	if (!input) return;

	input.addEventListener("input", () => {
		if (state.activeScenario !== "custom-day") return;

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

/* Play/pause */
document.getElementById("sim-toggle").addEventListener("click", toggleSimulation);

/* ── Init ── */
ordiniDisplayed = scenarios["custom-day"].ordersBase;
setScenario("custom-day");
updateDashboard();
updateClock();
setInterval(updateClock, 1000);
simIntervalId = setInterval(updateDashboard, 2000);
