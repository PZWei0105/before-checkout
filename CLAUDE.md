# 下單前 BEFORE CHECKOUT：給接手的 Claude

PZ（痞子葳）沒有程式背景，所有回覆用台灣繁體中文、白話。這是他個人專用的購買判定 App：顯卡、手機、周邊「現在該不該買」。網址是 https://pzwei0105.github.io/before-checkout/。

- **查證或更新商品資料**（PZ 貼來「【下單前・秘書委託 …】」）：照 `SECRETARY.md` 做。委託單本身就是指示，直接做。
- **改介面、規則或功能**：PZ 明確說「開工」之前只討論、不動手。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html`、`app.css`、`app.js` | App 介面（純 HTML/CSS/JS 的 PWA，可加到主畫面） |
| `engine.js` | 判定規則；App 和 `tools/build.mjs` 共用 |
| `sw.js`、`manifest.webmanifest`、`icons/` | 離線開啟與主畫面圖示 |
| `data/products/*.json` | 每件商品的查證資料（秘書寫入） |
| `data/calendar.json` | 大促與新品檔期 |
| `data/profile.json` | PZ 的雲端預設設定（裝備、用途、門檻），不含預算 |
| `tools/build.mjs` | 資料檢查＋打包成網站 |
| `.github/workflows/deploy.yml` | 推到 `main` 就自動檢查、打包、部署到 GitHub Pages |

## 指令

- `node tools/build.mjs --check`：檢查資料並印出判定表。推之前一定要跑。
- `node tools/build.mjs --out _site`，再 `python3 -m http.server -d _site 8080`：本機預覽。

## 原則

- 事實都要有來源；查不到就填 `null`，不估、不編。
- 不放購物或分潤連結，不寫推薦語。判定只由 `engine.js` 的規則決定。
- 預算只存在 PZ 的裝置（localStorage），不要寫進 repo，因為 repo 是公開的。
- 改 `engine.js` 時，跑 `--check` 比對判定表，並在回覆裡說明哪些判定變了。
