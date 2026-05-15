const STORAGE_KEYS = {
  assets: "portfolio_assets",
  monthlyTotals: "portfolio_monthly_totals",
  apiSettings: "portfolio_api_settings"
};

const state = {
  assets: load(STORAGE_KEYS.assets, []),
  monthlyTotals: load(STORAGE_KEYS.monthlyTotals, []),
  apiSettings: load(STORAGE_KEYS.apiSettings, { alphaVantageApiKey: "" })
};

const $ = (id) => document.getElementById(id);
const yen = (n) => `¥${Number(n || 0).toLocaleString("ja-JP", { maximumFractionDigits: 2 })}`;

let allocationChart;
let totalTrendChart;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function save() {
  localStorage.setItem(STORAGE_KEYS.assets, JSON.stringify(state.assets));
  localStorage.setItem(STORAGE_KEYS.monthlyTotals, JSON.stringify(state.monthlyTotals));
  localStorage.setItem(STORAGE_KEYS.apiSettings, JSON.stringify(state.apiSettings));
}

function calcAssetMetrics(asset) {
  const type = asset.type;
  if (type === "投資信託") {
    const units = Number(asset.units || 0);
    const currentNav = Number(asset.currentNav || 0);
    const avgNav = Number(asset.avgNav || 0);
    const value = units * currentNav / 10000;
    const cost = units * avgNav / 10000;
    const profit = value - cost;
    const profitRate = cost > 0 ? (profit / cost) * 100 : 0;
    return { value, cost, profit, profitRate };
  }
  if (["ETF", "個別株", "暗号資産"].includes(type)) {
    const quantity = Number(asset.quantity || 0);
    const currentPrice = Number(asset.currentPrice || 0);
    const avgPrice = Number(asset.avgPrice || 0);
    const value = quantity * currentPrice;
    const cost = quantity * avgPrice;
    const profit = value - cost;
    const profitRate = cost > 0 ? (profit / cost) * 100 : 0;
    return { value, cost, profit, profitRate };
  }
  const value = Number(asset.cashAmount || 0);
  return { value, cost: value, profit: 0, profitRate: 0 };
}

function normalizeAssets() {
  state.assets = state.assets.map((a) => ({ ...a, ...calcAssetMetrics(a) }));
}

function render() {
  normalizeAssets();
  renderTotal();
  renderAssetList();
  renderMonthlyTotalsList();
  renderCharts();
  save();
}

function renderTotal() {
  const total = state.assets.reduce((sum, a) => sum + Number(a.value || 0), 0);
  $("total-assets").textContent = yen(total);
}

function renderAssetList() {
  const list = $("asset-list");
  if (!state.assets.length) return (list.innerHTML = "<p>まだ銘柄が登録されていません。</p>");
  list.innerHTML = state.assets.map((asset) => `
    <article class="asset-item">
      <div class="asset-head"><strong>${escapeHtml(asset.name)}</strong><span>${yen(asset.value)}</span></div>
      <div class="asset-meta">${asset.type}${asset.ticker ? ` / ${escapeHtml(asset.ticker)}` : ""} / 毎月積立: ${yen(asset.monthly)}</div>
      <div class="asset-meta">取得額: ${yen(asset.cost)} / 損益: ${yen(asset.profit)} (${Number(asset.profitRate).toFixed(2)}%)</div>
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
  list.innerHTML = sorted.length ? sorted.map((i) => `${i.month}: ${yen(i.amount)}`).join("<br>") : "月次総資産データはまだありません。";
}

function renderCharts() {
  const byType = state.assets.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + Number(a.value || 0);
    return acc;
  }, {});

  allocationChart?.destroy();
  allocationChart = new Chart($("allocation-chart"), {
    type: "pie",
    data: { labels: Object.keys(byType), datasets: [{ data: Object.values(byType), backgroundColor: ["#1f6feb", "#2ea043", "#f59f00", "#a371f7", "#6e7781"] }] },
    options: { responsive: true, maintainAspectRatio: false }
  });

  const sorted = [...state.monthlyTotals].sort((a, b) => a.month.localeCompare(b.month));
  totalTrendChart?.destroy();
  totalTrendChart = new Chart($("total-trend-chart"), {
    type: "line",
    data: { labels: sorted.map((x) => x.month), datasets: [{ label: "総資産額", data: sorted.map((x) => x.amount), borderColor: "#1f6feb", backgroundColor: "rgba(31,111,235,0.2)", tension: 0.25, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function updateFormFieldsByType() {
  const type = $("type").value;
  const show = (id, visible) => $(id).classList.toggle("hidden", !visible);
  show("ticker-wrap", ["ETF", "個別株", "暗号資産"].includes(type));
  show("units-wrap", type === "投資信託");
  show("avg-nav-wrap", type === "投資信託");
  show("current-nav-wrap", type === "投資信託");
  show("quantity-wrap", ["ETF", "個別株", "暗号資産"].includes(type));
  show("avg-price-wrap", ["ETF", "個別株", "暗号資産"].includes(type));
  show("current-price-wrap", ["ETF", "個別株", "暗号資産"].includes(type));
  show("cash-amount-wrap", type === "現金");
}

async function fetchCoinGeckoPrice(id) {
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=jpy`);
  if (!res.ok) throw new Error("CoinGecko APIエラー");
  const data = await res.json();
  return Number(data?.[id]?.jpy);
}

async function fetchAlphaVantagePrice(symbol, apiKey) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Alpha Vantage APIエラー");
  const data = await res.json();
  const price = Number(data?.["Global Quote"]?.["05. price"]);
  if (!price) throw new Error("Alpha Vantage価格取得失敗");
  return price;
}

async function refreshPrices() {
  const status = $("price-update-status");
  status.textContent = "価格を更新中...";
  const logs = [];

  for (const asset of state.assets) {
    try {
      if (asset.type === "暗号資産") {
        const t = (asset.ticker || "").toUpperCase();
        if (t === "BTC") asset.currentPrice = await fetchCoinGeckoPrice("bitcoin");
        else if (t === "ETH") asset.currentPrice = await fetchCoinGeckoPrice("ethereum");
        else logs.push(`${asset.name}: 未対応の暗号資産ティッカーのため手入力価格を維持`);
      }
      if (["ETF", "個別株"].includes(asset.type)) {
        if (!state.apiSettings.alphaVantageApiKey) {
          logs.push(`${asset.name}: Alpha Vantage APIキー未設定のため手入力価格を維持`);
          continue;
        }
        if (!asset.ticker) {
          logs.push(`${asset.name}: ティッカー未設定のため手入力価格を維持`);
          continue;
        }
        asset.currentPrice = await fetchAlphaVantagePrice(asset.ticker, state.apiSettings.alphaVantageApiKey);
      }
    } catch {
      logs.push(`${asset.name}: 自動取得失敗のため手入力価格を維持`);
    }
  }

  render();
  status.textContent = logs.length ? `更新完了（一部手入力価格を使用）: ${logs.join(" / ")}` : "更新完了: すべての取得対象価格を更新しました。";
}

function startEdit(id) {
  const asset = state.assets.find((a) => a.id === id);
  if (!asset) return;
  $("asset-id").value = asset.id;
  $("name").value = asset.name;
  $("type").value = asset.type;
  $("ticker").value = asset.ticker || "";
  $("units").value = asset.units || "";
  $("quantity").value = asset.quantity || "";
  $("avg-nav").value = asset.avgNav || "";
  $("current-nav").value = asset.currentNav || "";
  $("avg-price").value = asset.avgPrice || "";
  $("current-price").value = asset.currentPrice || "";
  $("cash-amount").value = asset.cashAmount || "";
  $("monthly").value = asset.monthly;
  $("memo").value = asset.memo || "";
  $("cancel-edit").classList.remove("hidden");
  updateFormFieldsByType();
}

function resetForm() {
  $("asset-form").reset();
  $("asset-id").value = "";
  $("cancel-edit").classList.add("hidden");
  updateFormFieldsByType();
}

function deleteAsset(id) {
  state.assets = state.assets.filter((a) => a.id !== id);
  render();
}

function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

$("type").addEventListener("change", updateFormFieldsByType);

$("asset-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = $("asset-id").value;
  const type = $("type").value;
  const payload = {
    id: id || crypto.randomUUID(),
    name: $("name").value.trim(),
    type,
    ticker: $("ticker").value.trim().toUpperCase(),
    units: Number($("units").value || 0),
    quantity: Number($("quantity").value || 0),
    avgNav: Number($("avg-nav").value || 0),
    currentNav: Number($("current-nav").value || 0),
    avgPrice: Number($("avg-price").value || 0),
    currentPrice: Number($("current-price").value || 0),
    cashAmount: Number($("cash-amount").value || 0),
    monthly: Number($("monthly").value || 0),
    memo: $("memo").value.trim()
  };

  if (type === "現金") payload.ticker = "";

  payload.value = calcAssetMetrics(payload).value;

  if (id) state.assets = state.assets.map((a) => (a.id === id ? payload : a));
  else state.assets.push(payload);

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

$("save-api-key").addEventListener("click", () => {
  state.apiSettings.alphaVantageApiKey = $("alpha-vantage-api-key").value.trim();
  save();
  $("price-update-status").textContent = "APIキーを保存しました。";
});

$("refresh-prices").addEventListener("click", refreshPrices);

window.startEdit = startEdit;
window.deleteAsset = deleteAsset;

$("alpha-vantage-api-key").value = state.apiSettings.alphaVantageApiKey || "";
updateFormFieldsByType();
render();
