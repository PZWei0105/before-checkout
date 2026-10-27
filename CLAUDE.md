# 下單前 BEFORE CHECKOUT：給接手的 Claude

PZ（痞子葳）沒有程式背景，所有回覆用台灣繁體中文、白話。這是他個人專用的購買判定 App：顯卡、手機、周邊「現在該不該買」。網址是 https://pzwei0105.github.io/before-checkout/。

- **查證或更新商品資料**（PZ 貼來「【下單前・秘書委託 …】」）：照 `SECRETARY.md` 做。委託單本身就是指示，直接做。
- **改介面、規則或功能**：PZ 明確說「開工」之前只討論、不動手。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html`、`app.css`、`app.js` | App 介面（純 HTML/CSS/JS 的 PWA，可加到主畫面） |
| `updates.js` | 更新紀錄：改版時在最前面加一筆白話紀錄，App 會在簡報頁提示一次 |
| `engine.js` | 判定規則；App 和 `tools/build.mjs` 共用 |
| `sw.js`、`manifest.webmanifest`、`icons/` | 離線開啟與主畫面圖示；新增介面檔案要加進 `sw.js` 的 `SHELL` 和 `build.mjs` 的複製清單 |
| `data/products/*.json` | 每件商品的查證資料（秘書寫入） |
| `data/calendar.json` | 大促與新品檔期 |
| `data/profile.json` | PZ 的雲端預設設定（裝備、用途、門檻），不含預算 |
| `tools/build.mjs` | 資料檢查＋合併自動追價＋打包成網站 |
| `tools/merge.mjs` | 判定用哪個價格（秘書價 7 天、自動價 3 天內有效，取低），並記下理由 `price.pick` 給 App 寫說明 |
| `tools/track.mjs` | 自動追價機器人（PChome 24h 搜尋 API、原價屋報價頁） |
| `data/prices/*.json` | 追價機器人寫的價格紀錄，不要手動改。`sources.*.why`／`near` 是比對不到的原因和最接近的 3 筆 |
| `tests/` | `merge_test.mjs`（價格合併規則）、`app_test.py`（瀏覽器測試，390／360／1440、深淺色、離線） |
| `ROADMAP.md` | 待辦、已知問題、已完成 |
| `.github/workflows/deploy.yml` | 推到 `main` 就檢查、打包、部署；每小時醒來由 `track.mjs` 判斷要不要追價 |

## 指令

- `node tools/build.mjs --check`：檢查資料並印出判定表。推之前一定要跑。
- 改介面或工具時再跑測試：`node tests/merge_test.mjs`、`python3 tests/app_test.py`（雲端環境已裝好 Chromium，不要執行 `playwright install`）。
- 推之前先 `git pull --rebase origin main`，追價機器人每天會推資料上來。避開台灣時間 9 點、21 點那一輪追價（GitHub 排程常晚到 9:30–9:50）；推之前用 `gh run list -R PZWei0105/before-checkout` 確認沒有執行中的工作。
- 立刻追價一次：commit 訊息加「[追價]」，或在 GitHub Actions 頁面手動執行 deploy。雲端環境讀不到 Actions 的執行紀錄，追價結果看 `data/prices/<id>.json`。
- `node tools/build.mjs --out _site`，再 `python3 -m http.server -d _site 8080`：本機預覽。

## 原則

- 事實都要有來源；查不到就填 `null`，不估、不編。
- 自動追價只能用條款與 robots.txt 允許的來源（目前是 PChome 搜尋 API、原價屋報價頁），理由寫在 `SECRETARY.md`。要加新來源，先查清楚它的條款。
- 不放購物或分潤連結，不寫推薦語。判定只由 `engine.js` 的規則決定。
- 預算只存在 PZ 的裝置（localStorage），不要寫進 repo，因為 repo 是公開的。
- 改 `engine.js` 時，跑 `--check` 比對判定表，並在回覆裡說明哪些判定變了。
- App 裡跟價格有關的說明，一律照 `price.pick` 寫（`tools/merge.mjs` 決定），不要在介面另外猜。
- 有改介面或規則，就在 `updates.js` 最前面加一筆白話紀錄，`ROADMAP.md` 把做完的移到「已完成」。
