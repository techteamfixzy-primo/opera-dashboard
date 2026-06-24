let DASHBOARD_STATE = {
  companyId: "",
  serviceCode: "",
  period: "2026-06",
  email: "",
  data: null
};

async function loadDashboard(companyId = "", serviceCode = "", period = "2026-06", email = "") {
  try {
    const params = new URLSearchParams();

    if (email) params.append("email", email);
    if (companyId) params.append("company_id", companyId);
    if (serviceCode) params.append("service_code", serviceCode);
    if (period) params.append("period", period);

    const url = `${CONFIG.API_URL}?${params.toString()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data || !data.ok) {
      throw new Error("API response not ok");
    }

    DASHBOARD_STATE = {
      companyId: data.filters.company_id,
      serviceCode: data.filters.service_code,
      period: data.filters.period,
      email,
      data
    };

    renderHeader(data);
    renderServiceDropdown(data);
    renderGoals(data.goals || []);
    renderOverallProgress(data.goals || []);
    renderActions(data.serviceMetrics || [], data.dailySummary || []);
    renderDailyProgress(data.dailySummary || []);
    renderDrivers(data.dailySummary || []);
    renderBusinessImpact(data.businessImpact || []);
    renderActivities(data.activities || []);
    renderInsights(data.insights || []);
    renderRecommendations(data.recommendations || []);

  } catch (err) {
    console.error(err);
    throw err;
  }
}

function renderHeader(data) {
  document.getElementById("companySelect").innerHTML =
    `<option value="${data.company.company_id}">🏢 ${data.company.company_name}</option>`;

  document.getElementById("serviceTitle").innerText =
    data.selectedService.service_name;

  document.getElementById("companySubtitle").innerText =
    `${data.company.company_name} • Dashboard Overview`;

  document.getElementById("profileName").innerText =
    data.company.contact_name || "Client User";

  document.getElementById("profileRole").innerText =
    `${data.user?.role || "Viewer"}${data.user?.team ? " • " + data.user.team : ""}`;

  document.getElementById("profileAvatar").innerText =
    (data.company.contact_name || "K").replace("K.", "").trim().charAt(0) || "K";

  const periodDisplay = document.getElementById("periodDisplay");
  if (periodDisplay) {
    periodDisplay.innerText = formatPeriodThai(data.filters.period);
  }
}

function renderServiceDropdown(data) {
  const serviceSelect = document.getElementById("serviceSelect");
  serviceSelect.innerHTML = "";

  data.services.forEach(service => {
    const option = document.createElement("option");
    option.value = service.service_code;
    option.innerText = service.service_name;
    if (service.service_code === data.filters.service_code) option.selected = true;
    serviceSelect.appendChild(option);
  });

  serviceSelect.onchange = function () {
    loadDashboard(DASHBOARD_STATE.companyId, this.value, DASHBOARD_STATE.period, DASHBOARD_STATE.email);
  };
}

function renderGoals(goals) {
  const goalsList = document.getElementById("goalsList");

  if (!goals.length) {
    goalsList.innerHTML = `<p class="empty-text">ยังไม่มีข้อมูลเป้าหมาย</p>`;
    return;
  }

  goalsList.innerHTML = goals.map(goal => {
    const percent = toPercent(goal.achievement_pct);
    const width = clamp(percent, 0, 100);

    return `
      <div class="goal-row">
        <div class="goal-icon">${getGoalIcon(goal.goal_type)}</div>
        <div class="goal-info">
          <p>${goal.goal_name} ${formatNumber(goal.target_value)} ${goal.unit}</p>
          <strong>${formatNumber(goal.actual_value)} <span>/ ${formatNumber(goal.target_value)} ${goal.unit}</span></strong>
          <div class="bar"><i style="width:${width}%"></i></div>
        </div>
        <b>${percent}%</b>
      </div>
    `;
  }).join("");
}

function renderOverallProgress(goals) {
  const percentEl = document.getElementById("overallPercent");
  const statusEl = document.getElementById("overallStatus");
  const compareEl = document.getElementById("overallCompare");
  const lastUpdatedEl = document.getElementById("lastUpdated");
  const circleEl = document.getElementById("overallCircle");

  if (!goals.length) {
    percentEl.innerText = "0%";
    statusEl.innerText = "● ไม่มีข้อมูล";
    compareEl.innerText = "-";
    lastUpdatedEl.innerText = "-";
    return;
  }

  const avg = goals.reduce((sum, goal) => sum + Number(goal.achievement_pct || 0), 0) / goals.length;
  const percent = Math.round(avg * 100);
  const degree = percent * 3.6;
  const mainGoal = goals[0];

  percentEl.innerText = `${percent}%`;

  if (percent >= 120) {
    statusEl.innerText = "● ผลงานเกินเป้าหมาย";
  } else if (percent >= 100) {
    statusEl.innerText = "● บรรลุเป้าหมาย";
  } else {
    statusEl.innerText = "● ดำเนินการตามแผน";
  }

  compareEl.innerText = `${formatNumber(mainGoal.actual_value)} / ${formatNumber(mainGoal.target_value)} ${mainGoal.unit}`;
  lastUpdatedEl.innerText = formatTodayThai();

  circleEl.style.background =
    `radial-gradient(circle at center, #fff 0 58%, transparent 59%), conic-gradient(#ff7119 0deg ${degree}deg, #e9e9e9 ${degree}deg 360deg)`;
}

function renderActions(serviceMetrics, dailySummary) {
  const actionsGrid = document.getElementById("actionsGrid");
  const latestDate = getLatestDate(dailySummary);
  const latestRows = dailySummary.filter(row => row.date === latestDate);

  if (!latestRows.length) {
    actionsGrid.innerHTML = `<p class="empty-text">ยังไม่มีข้อมูลงานวันนี้</p>`;
    return;
  }

  actionsGrid.innerHTML = latestRows.slice(0, 5).map(row => {
    const metric = serviceMetrics.find(m => m.metric_key === row.metric_key);

    return `
      <div class="action-box">
        <div>${getMetricIcon(row.metric_category)}</div>
        <p>${metric ? metric.metric_label : row.metric_label}</p>
        <strong>${formatNumber(row.metric_value)}</strong>
        <span>${row.unit || ""}</span>
      </div>
    `;
  }).join("");
}

function renderDailyProgress(dailySummary) {
  const legend = document.getElementById("dailyLegend");
  const chart = document.getElementById("dailyChart");

  if (!dailySummary.length) {
    legend.innerHTML = "";
    chart.innerHTML = `<p class="empty-text">ยังไม่มีข้อมูลรายวัน</p>`;
    return;
  }

  const metricKeys = [...new Set(dailySummary.map(row => row.metric_key))].slice(0, 3);
  const dates = [...new Set(dailySummary.map(row => row.date))].slice(-7);
  const maxValue = Math.max(...dailySummary.map(row => Number(row.metric_value || 0)), 1);

  legend.innerHTML = metricKeys.map((key, index) => {
    const row = dailySummary.find(item => item.metric_key === key);
    return `<span><i class="${getLegendColor(index)}"></i> ${row ? row.metric_label : key}</span>`;
  }).join("");

  chart.innerHTML = dates.map(date => {
    const rowsOfDate = dailySummary.filter(row => row.date === date);

    const bars = metricKeys.map((key, index) => {
      const item = rowsOfDate.find(row => row.metric_key === key);
      const value = item ? Number(item.metric_value || 0) : 0;
      const unit = item ? item.unit || "" : "";
      const height = Math.max(8, Math.round((value / maxValue) * 90));

      return `
        <i 
          class="${getBarColor(index)}"
          style="height:${height}%"
          title="${formatNumber(value)} ${unit}"
        >
          <span class="bar-tooltip">${formatNumber(value)} ${unit}</span>
        </i>
      `;
    }).join("");

    return `
      <div class="day">
        <div class="bars">${bars}</div>
        <span>${formatThaiDateShort(date)}</span>
      </div>
    `;
  }).join("");
}

function renderBusinessImpact(items) {
  const box = document.getElementById("businessImpactList");

  const html = items.length
    ? items.map(item => `
        <div class="mini-row">
          <span>${item.impact_title}</span>
          <div><i style="width:${getImpactWidth(item.metric_value)}%"></i></div>
          <b>${formatNumber(item.metric_value)} ${item.unit || ""}</b>
        </div>
      `).join("")
    : `<p class="empty-text">ยังไม่มีข้อมูลผลลัพธ์</p>`;

  if (box) box.innerHTML = html;
}

function renderActivities(activities) {
  const list = document.getElementById("activityList");

  if (!activities.length) {
    list.innerHTML = `<li>ยังไม่มีข้อมูลงานที่ดำเนินการ</li>`;
    return;
  }

  list.innerHTML = activities.slice(0, 6).map(item => `
    <li>
      ${getActivityIcon(item.activity_type)}
      ${item.activity_title}
      <strong>${formatNumber(item.quantity)} ${item.unit || ""}</strong>
    </li>
  `).join("");
}

function renderInsights(insights) {
  const box = document.getElementById("insightsList");

  if (!insights.length) {
    box.innerHTML = `<p class="empty-text">ยังไม่มี Insights</p>`;
    return;
  }

  box.innerHTML = insights.slice(0, 4).map(item => `
    <div class="note-item">
      <div class="note-icon">💡</div>
      <div class="note-content">
        <strong>${item.insight_title}</strong>
        <p>- ${item.insight_detail}</p>
      </div>
    </div>
  `).join("");
}

function renderRecommendations(recommendations) {
  const box = document.getElementById("recommendationsList");

  if (!recommendations.length) {
    box.innerHTML = `<p class="empty-text">ยังไม่มี Recommendations</p>`;
    return;
  }

  box.innerHTML = recommendations.slice(0, 4).map(item => `
    <div class="note-item">
      <div class="note-icon">✅</div>
      <div class="note-content">
        <strong>${item.recommendation}</strong>
        <p>- ${item.expected_impact || item.reason || ""}</p>
      </div>
    </div>
  `).join("");
}

function renderDrivers(dailySummary) {
  const box = document.getElementById("driversList");
  if (!box) return;

  const rows = dailySummary.filter(row =>
    row.driver_label &&
    row.driver_value !== "" &&
    row.driver_value !== null &&
    row.driver_value !== undefined
  );

  if (!rows.length) {
    box.innerHTML = `<p class="empty-text">ยังไม่มีข้อมูล Key Drivers</p>`;
    return;
  }

  const grouped = {};

  rows.forEach(row => {
    const key = row.driver_label;
    const value = Number(row.driver_value || 0);

    if (!grouped[key]) {
      grouped[key] = {
        label: row.driver_label,
        type: row.driver_type || "",
        value: 0,
        unit: row.driver_unit || "",
        note: row.driver_note || ""
      };
    }

    grouped[key].value += value;

    if (row.driver_note) {
      grouped[key].note = row.driver_note;
    }
  });

  const items = Object.values(grouped)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  box.innerHTML = items.map(item => `
    <div class="driver-row">
      <div>
        <strong>${item.label}</strong>
        <p>${item.note || item.type || ""}</p>
      </div>
      <b>${formatNumber(item.value)} ${item.unit || ""}</b>
    </div>
  `).join("");
}

async function handleLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const error = document.getElementById("loginError");

  if (!email) {
    error.innerText = "กรุณากรอกอีเมล";
    return;
  }

  error.innerText = "";

  try {
    await loadDashboard("", "", "2026-06", email);
    localStorage.setItem("opera_user_email", email);
    showDashboard();
  } catch (err) {
    console.error(err);
    localStorage.removeItem("opera_user_email");
    error.innerText = "ไม่พบอีเมลนี้ในระบบ";
    showLogin();
  }
}

function showLogin() {
  document.getElementById("loginPage").style.display = "flex";
  document.getElementById("dashboardApp").style.display = "none";
}

function showDashboard() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("dashboardApp").style.display = "flex";
}

function getLatestDate(rows) {
  if (!rows.length) return "";
  return [...new Set(rows.map(row => row.date))].sort().pop();
}

function toPercent(value) {
  const num = Number(value || 0);
  return num <= 1 ? Math.round(num * 100) : Math.round(num);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("th-TH");
}

function formatThaiDateShort(dateText) {
  const date = new Date(dateText);
  if (isNaN(date.getTime())) return dateText;

  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

function formatTodayThai() {
  const date = new Date();
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
  ];

  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatPeriodThai(periodText) {
  const [year, month] = String(periodText || "2026-06").split("-");
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
  ];

  const monthIndex = Number(month) - 1;
  return `${months[monthIndex] || "มิ.ย."} ${year || "2026"}`;
}

function getGoalIcon(type) {
  if (type === "quality") return "⭐";
  if (type === "business_impact") return "📈";
  if (type === "operation") return "⚙️";
  if (type === "activity") return "✅";
  return "🎯";
}

function getMetricIcon(category) {
  if (category === "quality") return "⭐";
  if (category === "business_impact") return "📈";
  if (category === "risk") return "⚠️";
  if (category === "outcome") return "🎯";
  if (category === "operation") return "⚙️";
  return "✅";
}

function getActivityIcon(type) {
  const text = String(type || "").toLowerCase();

  if (text.includes("chat")) return "💬";
  if (text.includes("follow")) return "📞";
  if (text.includes("document")) return "📄";
  if (text.includes("email")) return "✉️";
  if (text.includes("event")) return "🎪";
  if (text.includes("marketing")) return "📣";
  if (text.includes("product")) return "🛒";

  return "✅";
}

function getLegendColor(index) {
  return ["orange", "green", "purple"][index] || "orange";
}

function getBarColor(index) {
  return ["o", "g", "p"][index] || "o";
}

function getImpactWidth(value) {
  const num = Number(value || 0);
  if (num <= 5) return Math.round(num * 20);
  if (num <= 100) return num;
  return 100;
}

document.addEventListener("DOMContentLoaded", () => {
  const savedEmail = localStorage.getItem("opera_user_email");

  if (savedEmail) {
    showDashboard();
    loadDashboard("", "", "2026-06", savedEmail);
  } else {
    showLogin();
  }

  document.getElementById("loginButton").addEventListener("click", handleLogin);

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("opera_user_email");
    showLogin();
  });
});