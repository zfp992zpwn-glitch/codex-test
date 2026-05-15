const STORAGE_KEYS = {
  assets: "portfolio_assets",
  monthlyTotals: "portfolio_monthly_totals",
  assetHistory: "portfolio_asset_history",
  alphaKey: "portfolio_alpha_vantage_api_key"
};

const FUND_CANDIDATES = [
  "eMAXIS Slim 米国株式 S&P500",
  "eMAXIS Slim 全世界株式（オール・カントリー）",
  "楽天・S&P500インデックス・ファンド",
  "楽天・NASDAQ-100インデックス・ファンド",
  "iFreeNEXT FANG+インデックス",
  "ニッセイNASDAQ100インデックスファンド",
  "SBI・V・S&P500インデックス・ファンド"
];

const MARKET_CANDIDATES = ["SMH", "VOO", "QQQ", "NVDA", "TSLA", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "Bitcoin", "Ethereum"];
const CRYPTO_MAP = { BITCOIN: "bitcoin", ETHEREUM: "ethereum", BTC: "bitcoin", ETH: "ethereum" };

const state = {
  assets: migrateAssets(load(STORAGE_KEYS.assets, [])),
  monthlyTotals: load(STORAGE_KEYS.monthlyTotals, []),
  assetHistory: load(STORAGE_KEYS.assetHistory, {}),
  alphaVantageApiKey: load(STORAGE_KEYS.alphaKey, "")
};

const $ = (id) => document.getElementById(id);
const yen = (n) => `¥${Number(n || 0).toLocaleString("ja-JP", { maximumFractionDigits: 2 })}`;
const pct = (n) => `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(2)}%`;

let allocationChart;
let totalTrendChart;
let assetTrendChart;

function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save() {
  localStorage.setItem(STORAGE_KEYS.assets, JSON.stringify(state.assets));
  localStorage.setItem(STORAGE_KEYS.monthlyTotals, JSON.stringify(state.monthlyTotals));
  localStorage.setItem(STORAGE_KEYS.assetHistory, JSON.stringify(state.assetHistory));
  localStorage.setItem(STORAGE_KEYS.alphaKey, JSON.stringify(state.alphaVantageApiKey));
}

function migrateAssets(assets) {
  if (!Array.isArray(assets)) return [];
  return assets.map((a) => ({
    id: a.id || crypto.randomUUID(),
    name: a.name || "",
    ticker: a.ticker || "",
    type: a.type || "投資信託",
    units: Number(a.units ?? 0),
    avgPrice: Number(a.avgPrice ?? 0),
    currentPrice: Number(a.currentPrice ?? a.value ?? 0),
    cashAmount: Number(a.cashAmount ?? (a.type === "現金" ? (a.value ?? 0) : 0)),
    monthly: Number(a.monthly ?? 0),
    memo: a.memo || ""
  }));
}

function calc(asset) {
  if (asset.type === "投資信託") {
    const evaluated = asset.units * asset.currentPrice / 10000;
    const invested = asset.units * asset.avgPrice / 10000;
    const pnl = evaluated - invested;
    return { evaluated, invested, pnl, pnlRate: invested > 0 ? pnl / invested * 100 : 0 };
  }
  if (["ETF", "個別株", "暗号資産"].includes(asset.type)) {
    const evaluated = asset.units * asset.currentPrice;
    const invested = asset.units * asset.avgPrice;
    const pnl = evaluated - invested;
    return { evaluated, invested, pnl, pnlRate: invested > 0 ? pnl / invested * 100 : 0 };
  }
  const evaluated = Number(asset.cashAmount || 0);
  return { evaluated, invested: evaluated, pnl: 0, pnlRate: 0 };
}

function enrichAsset(asset) { return { ...asset, ...calc(asset) }; }

function render() {
  const enriched = state.assets.map(enrichAsset);
  renderTotal(enriched);
  renderAssetList(enriched);
  renderHistoryAssetOptions();
  renderMonthlyTotalsList();
  renderAssetHistoryList();
  renderCharts(enriched);
}

function renderTotal(assets) { $("total-assets").textContent = yen(assets.reduce((s, a) => s + a.evaluated, 0)); }

function renderAssetList(assets) {
  const list = $("asset-list");
  if (!assets.length) return (list.innerHTML = "<p>まだ銘柄が登録されていません。</p>");
  list.innerHTML = assets.map((a) => {
    const isFund = a.type === "投資信託";
    const qtyLabel = isFund ? "保有口数" : "保有数量";
    const priceLabel = isFund ? "現在の基準価額" : "現在価格";
    const signClass = a.pnl >= 0 ? "plus" : "minus";
    return `<article class="asset-item">
      <div class="asset-head"><strong>${escapeHtml(a.name)}</strong><span>${a.type}</span></div>
      <div class="asset-meta">${qtyLabel}: ${a.type === "現金" ? "-" : a.units}</div>
      <div class="asset-meta">${priceLabel}: ${a.type === "現金" ? "-" : yen(a.currentPrice)}</div>
      <div class="asset-meta">評価額: ${yen(a.evaluated)} / 取得額: ${yen(a.invested)}</div>
      <div class="asset-meta ${signClass}">損益: ${a.pnl >= 0 ? "+" : "-"}${yen(Math.abs(a.pnl))} (${pct(a.pnlRate)})</div>
      <div class="asset-meta">毎月積立: ${yen(a.monthly || 0)}</div>
      <div class="asset-meta">メモ: ${escapeHtml(a.memo || "-")}</div>
      <div class="asset-actions"><button class="btn secondary" onclick="startEdit('${a.id}')">編集</button><button class="btn danger" onclick="deleteAsset('${a.id}')">削除</button></div>
    </article>`;
  }).join("");
}

function renderCharts(assets) {
  const byType = assets.reduce((acc, a) => (acc[a.type] = (acc[a.type] || 0) + a.evaluated, acc), {});
  allocationChart?.destroy();
  allocationChart = new Chart($("allocation-chart"), { type: "pie", data: { labels: Object.keys(byType), datasets: [{ data: Object.values(byType), backgroundColor: ["#1f6feb", "#2ea043", "#f59f00", "#a371f7", "#6e7781"] }] }, options: { responsive: true, maintainAspectRatio: false } });

  const sorted = [...state.monthlyTotals].sort((a, b) => a.month.localeCompare(b.month));
  totalTrendChart?.destroy();
  totalTrendChart = new Chart($("total-trend-chart"), { type: "line", data: { labels: sorted.map((x) => x.month), datasets: [{ label: "総資産額", data: sorted.map((x) => x.amount), borderColor: "#1f6feb", backgroundColor: "rgba(31,111,235,0.2)", fill: true, tension: 0.25 }] }, options: { responsive: true, maintainAspectRatio: false } });

  const datasets = assets.map((a, i) => ({ label: a.name, data: (state.assetHistory[a.id] || []).sort((x, y) => x.month.localeCompare(y.month)).map((h) => ({ x: h.month, y: h.value })), borderColor: ["#1f6feb", "#2ea043", "#f59f00", "#a371f7", "#d1242f"][i % 5], parsing: false, tension: 0.2 }));
  assetTrendChart?.destroy();
  assetTrendChart = new Chart($("asset-trend-chart"), { type: "line", data: { datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: "category" }, y: { title: { display: true, text: "評価額(円)" } } } } });
}

function renderMonthlyTotalsList() { const s = [...state.monthlyTotals].sort((a, b) => a.month.localeCompare(b.month)); $("monthly-total-list").innerHTML = s.length ? s.map((i) => `${i.month}: ${yen(i.amount)}`).join("<br>") : "月次総資産データはまだありません。"; }
function renderAssetHistoryList() { const r = []; Object.entries(state.assetHistory).forEach(([id, v]) => { const a = state.assets.find((x) => x.id === id); if (!a) return; v.forEach((row) => r.push(`${a.name} / ${row.month}: ${yen(row.value)}`)); }); $("asset-history-list").innerHTML = r.length ? r.join("<br>") : "銘柄推移データはまだありません。"; }
function renderHistoryAssetOptions() { const s = $("history-asset-id"); s.innerHTML = state.assets.length ? state.assets.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("") : "<option value=''>銘柄を先に追加してください</option>"; }

function updateFormByType() {
  const type = $("type").value;
  const marketFields = ["field-units", "field-avg-price", "field-current-price"];
  if (type === "現金") {
    marketFields.forEach((id) => $(id).classList.add("hidden"));
    $("field-cash-amount").classList.remove("hidden");
    $("ticker").parentElement.classList.add("hidden");
  } else {
    marketFields.forEach((id) => $(id).classList.remove("hidden"));
    $("field-cash-amount").classList.add("hidden");
    $("ticker").parentElement.classList.toggle("hidden", type === "投資信託");
  }
}

function setStatus(msg, kind = "info") {
  const el = $("price-update-status");
  el.textContent = msg;
  el.className = `status ${kind}`;
}

async function updatePrices() {
  const targetAssets = state.assets.filter((a) => ["ETF", "個別株", "暗号資産"].includes(a.type));
  if (!targetAssets.length) return setStatus("価格更新対象（ETF・個別株・暗号資産）がありません。", "info");

  const success = [];
  const failed = [];

  const cryptoAssets = targetAssets.filter((a) => a.type === "暗号資産");
  const cryptoIds = [...new Set(cryptoAssets.map((a) => CRYPTO_MAP[(a.ticker || a.name || "").trim().toUpperCase()]).filter(Boolean))];

  let cryptoPrices = {};
  if (cryptoIds.length) {
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(",")}&vs_currencies=jpy`);
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      cryptoPrices = await res.json();
    } catch (e) {
      failed.push(`暗号資産まとめ取得失敗: ${e.message}`);
    }
  }

  for (const asset of targetAssets) {
    try {
      if (asset.type === "暗号資産") {
        const id = CRYPTO_MAP[(asset.ticker || asset.name || "").trim().toUpperCase()];
        const price = cryptoPrices[id]?.jpy;
        if (!price) throw new Error("CoinGeckoに銘柄が見つかりません");
        asset.currentPrice = Number(price);
        success.push(`${asset.name}: ¥${Number(price).toLocaleString("ja-JP")}`);
      } else {
        if (!state.alphaVantageApiKey) throw new Error("Alpha Vantage APIキー未設定");
        const ticker = (asset.ticker || "").trim().toUpperCase();
        if (!ticker) throw new Error("ティッカー未設定");
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(state.alphaVantageApiKey)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
        const json = await res.json();
        const raw = json?.["Global Quote"]?.["05. price"];
        if (!raw) throw new Error("価格データが取得できませんでした");
        asset.currentPrice = Number(raw);
        success.push(`${asset.name}(${ticker}): ${Number(raw).toFixed(2)}`);
      }
    } catch (e) {
      failed.push(`${asset.name}: ${e.message}`);
    }
  }

  save();
  render();
  const lines = [`成功: ${success.length}件`, ...success.map((s) => `✅ ${s}`), `失敗: ${failed.length}件`, ...failed.map((f) => `❌ ${f}`)];
  setStatus(lines.join("\n"), failed.length ? "warn" : "ok");
}

function startEdit(id) { const a = state.assets.find((x) => x.id === id); if (!a) return; $("asset-id").value = a.id; $("name").value = a.name; $("ticker").value = a.ticker || ""; $("type").value = a.type; $("units").value = a.units ?? ""; $("avg-price").value = a.avgPrice ?? ""; $("current-price").value = a.currentPrice ?? ""; $("cash-amount").value = a.cashAmount ?? ""; $("monthly").value = a.monthly ?? 0; $("memo").value = a.memo || ""; updateFormByType(); $("cancel-edit").classList.remove("hidden"); }
function resetForm() { $("asset-form").reset(); $("asset-id").value = ""; $("monthly").value = 0; $("cancel-edit").classList.add("hidden"); updateFormByType(); }
function deleteAsset(id) { state.assets = state.assets.filter((a) => a.id !== id); delete state.assetHistory[id]; save(); render(); }
function escapeHtml(str) { return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

$("asset-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const type = $("type").value;
  const id = $("asset-id").value || crypto.randomUUID();
  const payload = {
    id,
    name: $("name").value.trim(),
    ticker: $("ticker").value.trim(),
    type,
    units: Number($("units").value || 0),
    avgPrice: Number($("avg-price").value || 0),
    currentPrice: Number($("current-price").value || 0),
    cashAmount: Number($("cash-amount").value || 0),
    monthly: Number($("monthly").value || 0),
    memo: $("memo").value.trim()
  };
  state.assets = state.assets.some((a) => a.id === id) ? state.assets.map((a) => a.id === id ? payload : a) : [...state.assets, payload];
  save(); resetForm(); render();
});

$("type").addEventListener("change", updateFormByType);
$("cancel-edit").addEventListener("click", resetForm);
$("update-prices").addEventListener("click", updatePrices);
$("alpha-key-save").addEventListener("click", () => {
  state.alphaVantageApiKey = $("alpha-api-key").value.trim();
  save();
  setStatus("Alpha Vantage APIキーを保存しました。", "ok");
});

$("monthly-total-form").addEventListener("submit", (e) => { e.preventDefault(); const month = $("total-month").value, amount = Number($("total-amount").value); const ex = state.monthlyTotals.find((x) => x.month === month); if (ex) ex.amount = amount; else state.monthlyTotals.push({ month, amount }); save(); e.target.reset(); render(); });
$("asset-history-form").addEventListener("submit", (e) => { e.preventDefault(); const assetId = $("history-asset-id").value, month = $("history-month").value, value = Number($("history-value").value); state.assetHistory[assetId] ||= []; const ex = state.assetHistory[assetId].find((x) => x.month === month); if (ex) ex.value = value; else state.assetHistory[assetId].push({ month, value }); save(); e.target.reset(); render(); });

function loadCandidates() {
  $("name-candidates").innerHTML = [...FUND_CANDIDATES, ...MARKET_CANDIDATES].map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
  $("ticker-candidates").innerHTML = MARKET_CANDIDATES.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
}

window.startEdit = startEdit;
window.deleteAsset = deleteAsset;
$("alpha-api-key").value = state.alphaVantageApiKey;
loadCandidates();
updateFormByType();
render();
