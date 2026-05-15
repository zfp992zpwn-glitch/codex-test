const STORAGE_KEYS = {
  assets: "portfolio_assets",
  monthlyTotals: "portfolio_monthly_totals",
  assetHistory: "portfolio_asset_history"
};

const state = {
  assets: load(STORAGE_KEYS.assets, []),
  monthlyTotals: load(STORAGE_KEYS.monthlyTotals, []),
  assetHistory: load(STORAGE_KEYS.assetHistory, {})
};

const $ = (id) => document.getElementById(id);
const yen = (n) => `¥${Number(n || 0).toLocaleString("ja-JP")}`;

let allocationChart;
let totalTrendChart;
let assetTrendChart;

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEYS.assets, JSON.stringify(state.assets));
  localStorage.setItem(STORAGE_KEYS.monthlyTotals, JSON.stringify(state.monthlyTotals));
  localStorage.setItem(STORAGE_KEYS.assetHistory, JSON.stringify(state.assetHistory));
}

function render() {
  renderTotal();
  renderAssetList();
  renderHistoryAssetOptions();
  renderMonthlyTotalsList();
  renderAssetHistoryList();
  renderCharts();
}

function renderTotal() {
  const total = state.assets.reduce((sum, a) => sum + Number(a.value || 0), 0);
  $("total-assets").textContent = yen(total);
}

function renderAssetList() {
  const list = $("asset-list");
  if (!state.assets.length) {
    list.innerHTML = "<p>まだ銘柄が登録されていません。</p>";
    return;
  }

  list.innerHTML = state.assets.map((asset) => `
    <article class="asset-item">
      <div class="asset-head">
        <strong>${escapeHtml(asset.name)}</strong>
        <span>${yen(asset.value)}</span>
      </div>
      <div class="asset-meta">${asset.type} / 毎月積立: ${yen(asset.monthly)}</div>
      <div class="asset-meta">メモ: ${escapeHtml(asset.memo || "-")}</div>
      <div class="asset-actions">
        <button class="btn secondary" onclick="startEdit('${asset.id}')">編集</button>
        <button class="btn danger" onclick="deleteAsset('${asset.id}')">削除</button>
      </div>
    </article>
  `).join("");
}

function renderMonthlyTotalsList() {
  const list = $("monthly-total-list");
  const sorted = [...state.monthlyTotals].sort((a, b) => a.month.localeCompare(b.month));
  list.innerHTML = sorted.length
    ? sorted.map((item) => `${item.month}: ${yen(item.amount)}`).join("<br>")
    : "月次総資産データはまだありません。";
}

function renderAssetHistoryList() {
  const list = $("asset-history-list");
  const records = [];
  for (const [assetId, values] of Object.entries(state.assetHistory)) {
    const asset = state.assets.find((a) => a.id === assetId);
    if (!asset) continue;
    for (const row of values) {
      records.push(`${asset.name} / ${row.month}: ${yen(row.value)}`);
    }
  }
  list.innerHTML = records.length ? records.join("<br>") : "銘柄推移データはまだありません。";
}

function renderHistoryAssetOptions() {
  const select = $("history-asset-id");
  if (!state.assets.length) {
    select.innerHTML = "<option value=''>銘柄を先に追加してください</option>";
    return;
  }
  select.innerHTML = state.assets.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
}

function renderCharts() {
  renderAllocationChart();
  renderTotalTrendChart();
  renderAssetTrendChart();
}

function renderAllocationChart() {
  const byType = state.assets.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + Number(a.value || 0);
    return acc;
  }, {});

  const data = {
    labels: Object.keys(byType),
    datasets: [{
      data: Object.values(byType),
      backgroundColor: ["#1f6feb", "#2ea043", "#f59f00", "#a371f7", "#6e7781"]
    }]
  };

  allocationChart?.destroy();
  allocationChart = new Chart($("allocation-chart"), {
    type: "pie",
    data,
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function renderTotalTrendChart() {
  const sorted = [...state.monthlyTotals].sort((a, b) => a.month.localeCompare(b.month));
  totalTrendChart?.destroy();
  totalTrendChart = new Chart($("total-trend-chart"), {
    type: "line",
    data: {
      labels: sorted.map((x) => x.month),
      datasets: [{
        label: "総資産額",
        data: sorted.map((x) => x.amount),
        borderColor: "#1f6feb",
        backgroundColor: "rgba(31,111,235,0.2)",
        tension: 0.25,
        fill: true
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function renderAssetTrendChart() {
  const datasets = state.assets.map((asset, i) => {
    const history = (state.assetHistory[asset.id] || []).sort((a, b) => a.month.localeCompare(b.month));
    return {
      label: asset.name,
      data: history.map((h) => ({ x: h.month, y: h.value })),
      borderColor: ["#1f6feb", "#2ea043", "#f59f00", "#a371f7", "#d1242f"][i % 5],
      tension: 0.2
    };
  });

  assetTrendChart?.destroy();
  assetTrendChart = new Chart($("asset-trend-chart"), {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: { type: "category", title: { display: true, text: "月" } },
        y: { title: { display: true, text: "評価額(円)" } }
      }
    }
  });
}

function startEdit(id) {
  const asset = state.assets.find((a) => a.id === id);
  if (!asset) return;
  $("asset-id").value = asset.id;
  $("name").value = asset.name;
  $("type").value = asset.type;
  $("value").value = asset.value;
  $("monthly").value = asset.monthly;
  $("memo").value = asset.memo || "";
  $("cancel-edit").classList.remove("hidden");
}

function resetForm() {
  $("asset-form").reset();
  $("asset-id").value = "";
  $("cancel-edit").classList.add("hidden");
}

function deleteAsset(id) {
  state.assets = state.assets.filter((a) => a.id !== id);
  delete state.assetHistory[id];
  save();
  render();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

$("asset-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = $("asset-id").value;
  const payload = {
    id: id || crypto.randomUUID(),
    name: $("name").value.trim(),
    type: $("type").value,
    value: Number($("value").value),
    monthly: Number($("monthly").value),
    memo: $("memo").value.trim()
  };

  if (id) {
    state.assets = state.assets.map((a) => (a.id === id ? payload : a));
  } else {
    state.assets.push(payload);
  }

  save();
  resetForm();
  render();
});

$("cancel-edit").addEventListener("click", resetForm);

$("monthly-total-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const month = $("total-month").value;
  const amount = Number($("total-amount").value);
  const existing = state.monthlyTotals.find((x) => x.month === month);
  if (existing) existing.amount = amount;
  else state.monthlyTotals.push({ month, amount });
  save();
  e.target.reset();
  render();
});

$("asset-history-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const assetId = $("history-asset-id").value;
  const month = $("history-month").value;
  const value = Number($("history-value").value);
  state.assetHistory[assetId] ||= [];
  const existing = state.assetHistory[assetId].find((x) => x.month === month);
  if (existing) existing.value = value;
  else state.assetHistory[assetId].push({ month, value });
  save();
  e.target.reset();
  render();
});

window.startEdit = startEdit;
window.deleteAsset = deleteAsset;

render();
