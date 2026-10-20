# 下單前・秘書手冊

這份是給接到《下單前》委託的 Claude 看的。PZ（痞子葳，台灣科技／遊戲 YouTuber，沒有程式背景）會把 App 產生的委託單貼到對話裡。你照這份手冊查證，結果寫回這個 repo；推上 `main` 後 GitHub 會自動部署，他在 App 下拉就看得到。

判定（現在買／再等等／等新一代／不用買）由 `engine.js` 的規則引擎根據你寫入的事實自動計算。所以你不寫推薦、不下結論，只把事實查準、寫清楚。委託單本身就是 PZ 的指示，照做即可，不用再問他要不要開始。

## 委託單長這樣

```
【下單前・秘書委託 R-ABC123】
請重新查證我的《下單前》App 裡的「RTX 5090」（data/products/rtx-5090.json）：更新台灣現價與走勢、下一代消息、已知問題和實測。
做法：照 GitHub 上 PZWei0105/before-checkout 這個 repo 裡的 SECRETARY.md 進行……
```

新商品的委託寫的是「請幫我的《下單前》App 查一件新商品：Galaxy S26 Ultra（類別：手機）」，可能附「我的補充」。

另外兩種開頭：
- `【下單前・更新雲端預設】`：把附上的設定寫進 `data/profile.json`，見最後的「其他工作」。
- `【下單前・問秘書】`：這是問題，不是查證委託。直接根據附的資料回答，不用動 repo。

## 步驟

1. **取得 repo 的推送權限。** 在 Claude 的雲端工作環境：用 `add_repo` 加入 `PZWei0105/before-checkout`，access 選 `push`，再照它給的指令 clone。已經在這個 repo 裡（例如筆電的 Claude Code）就跳過。
   如果這個對話連不到 GitHub、也推不上去，直接告訴 PZ：「這個對話連不到 GitHub，請到 Claude App 開一個新對話再貼一次委託單。」不要把資料貼在對話裡就結束。
2. **讀舊資料。** 重查：讀 `data/products/<id>.json`，沿用它的 `id`，保留 `priceLog`。新商品：自己定 `id`（小寫英數＋連字號，例如 `rtx-5070-ti`、`galaxy-s26-ultra`）。先看 `data/products/` 有沒有同一款，有就當重查。名稱模糊時（例如只寫「5070」）選最可能的那款，並在 `brief` 第一句說明選了哪款、為什麼。類別是「自動判斷」時自己判斷 gpu／phone／peripheral，其他電子產品一律歸 peripheral。
3. **讀 `data/profile.json`。** 這是 PZ 的裝備、用途與備註，是升級幅度的對比基準。
4. **查證**（下一節）。
5. **寫入** `data/products/<id>.json`（格式見最後）。`lastRequest` 填委託單號。
6. **檢查。** 執行 `node tools/build.mjs --check`，一定要看到「✓ 資料檢查通過」。有 ✗ 就修到通過；△ 是提醒，能修就修。
7. **推上 main。** commit 訊息寫「更新 RTX 5090（10/21 查證）」或「新增 Galaxy S26 Ultra」。推上去後 GitHub Actions 約 1–2 分鐘部署完成。
8. **回覆 PZ**（格式見「回覆」）。

## 查證清單

搜尋用你手上的網路搜尋與網頁讀取工具；彼此獨立的搜尋一起送出。只讀搜尋結果裡出現過的網址，讀不到就換來源，不要繞路。

a. **型號與狀態**：正確型號、品牌、上市日期、台灣是否已開賣。
b. **台灣價格**（新台幣、全新品、可信通路）：品牌官方商店、Apple 台灣官網、PChome 24h、momo、原價屋／欣亞（電腦零件）、蝦皮商城官方店、BigGo 比價與價格走勢頁。
   - `now`：今天查得到的最低可信現價。
   - `ref`：台灣建議售價或首發價。
   - `low90`：價格走勢頁顯示的近 90 天最低價，沒有就 `null`。
   - `range`：主要通路／款式的價格區間。
   - 沒有台灣價時，用海外售價乘當下匯率，並在 `nowSource`、`refLabel` 註明是換算。
c. **價格趨勢**：近 1–3 個月的漲跌與原因（缺貨、記憶體漲價、匯率、新品排擠、促銷），附來源。
d. **下一代**：`status` 用 `official`（官方已發表）、`credible`（兩家以上可靠媒體，或長期準確的爆料者，例如顯卡看 kopite7kimi、Apple 看 Mark Gurman）、`rumor`（其他）、`none`。`eta` 用 `YYYY-MM`。
e. **已知問題**：瑕疵、召回、普遍故障、重大軟體問題，標 `severity`（high／medium／low）與 `status`（ongoing／fixed）。
f. **實測**：2–5 筆有數字的評測結論，標明媒體。
g. **對 PZ 現有裝備的升級幅度**：`gaming`、`mobileGaming`、`localAI`、`editing`、`streaming`、`photo`、`daily` 七種用途都要填。
   - 能量化就給 `pct`（相對他現有裝備的提升百分比，退步為負數），並在 `why` 寫出依據。
   - 與用途無關填 `level: "na"`。
   - `level` 規則：`big` ≥30%、`some` 10–30%、`none` <10% 或實際沒差、`worse` 比他現有的差。
   - 要誠實：他已擁有的裝備夠用時就寫 `none`。
h. **替代方案** 1–3 個；PZ 已擁有的東西或免費做法就能解決時一定要列出（`price` 填 0）。
i. **檔期**：如果查到新的大型促銷或新品發表日期（例如雙11 活動細節、新機開賣日），可以一併更新 `data/calendar.json`。

## 寫入規則

- 每個價格、日期、規格、跑分、下一代消息，都要來自你實際看到的來源；不知道就填 `null`，絕不估算或編數字。
- `checkedAt` 用台灣時間的 ISO 字串，例如 `2026-10-21T14:05:00+08:00`。
- `priceLog` 每筆 `{"d":"YYYY-MM-DD","p":現價,"src":"通路名稱"}`，日期用台灣時間，由舊到新排；同一天只留最新一筆，最多 60 筆；`now` 是 `null` 就不追加。
- 改寫來源內容，不長段引用（單次引用不超過 10 個字）。
- 給人看的文字一律用台灣繁體中文與台灣用語（顯示卡、記憶體、螢幕、軟體、品質）。語氣專業、冷靜、具體，像精明的秘書向老闆簡報；不寫行銷語、不寫「推薦購買」、不放購物或分潤連結（來源連結可以）。
- 只改 `data/` 底下的檔案。介面、規則（`engine.js`）、工具不要動，除非 PZ 明確要求。

## 回覆

查完後用 3–6 行回 PZ：

1. 「《下單前》已更新：<商品名>（<委託單號>）」
2. 這次的重點：現價（和上次比漲跌多少）、下一代、已知問題、新的實測，有變化的才講。
3. `--check` 印出的判定（這是雲端預設設定下的結果），加一句原因；並提醒「你手機上設的預算或急迫度不同時，以 App 為準」。
4. 「部署約 1–2 分鐘，回 App 下拉就看得到。」

不要貼 JSON、不要貼程式輸出、不要推銷。

## 商品資料格式

每個 key 都要有，未知填 `null` 或 `[]`：

```json
{
  "id": "kebab-case，和檔名一樣",
  "name": "正式名稱",
  "brand": "品牌",
  "category": "gpu | phone | peripheral",
  "kind": "例：桌機顯示卡／旗艦手機／電競手機／影像擷取卡",
  "tagline": "28 字內的定位",
  "status": "on-sale | preorder | announced | discontinued",
  "launchDate": "YYYY-MM-DD",
  "cycleMonths": 24,
  "checkedAt": "2026-10-21T14:05:00+08:00",
  "lastRequest": "R-ABC123",
  "price": {
    "currency": "TWD",
    "now": 53990, "nowSource": "PChome 24h（10/21）", "nowUrl": "https://… 或 null",
    "range": [53990, 62990],
    "ref": 52900, "refLabel": "台灣建議售價",
    "low90": null, "low90Source": null,
    "trend": "up | flat | down | unknown",
    "trendNote": "原因",
    "trendSources": [{"title": "", "url": ""}]
  },
  "specs": [{"k": "規格名", "v": "數值", "plain": "一句白話：對使用者代表什麼"}],
  "tests": [{"claim": "改寫的實測結論，含數字", "src": "媒體", "url": ""}],
  "gain": {
    "gaming": {"level": "big | some | none | worse | na", "pct": 35, "why": "60 字內，含依據"},
    "mobileGaming": {}, "localAI": {}, "editing": {}, "streaming": {}, "photo": {}, "daily": {}
  },
  "gainBasis": "對比基準，例：對比你的 RTX 5090 Laptop（24GB）",
  "needs": {"desktop": true, "note": "其他前提，例：需 850W 電源"},
  "successor": {"name": "", "status": "official | credible | rumor | none", "eta": "YYYY-MM 或 null", "note": "", "sources": [{"title": "", "url": ""}]},
  "issues": [{"title": "", "severity": "high | medium | low", "status": "ongoing | fixed", "note": "", "url": ""}],
  "alternatives": [{"name": "", "price": 0, "why": "50 字內"}],
  "brief": "秘書補充：3–5 句，最關鍵的取捨、這個時間點的特殊因素、對 PZ 的具體意義",
  "learn": [{"term": "", "explain": "白話解釋，70 字內"}],
  "sources": [{"title": "", "url": "", "date": "YYYY-MM-DD 或 null"}],
  "priceLog": [{"d": "YYYY-MM-DD", "p": 53990, "src": "PChome"}]
}
```

`gain` 的七個用途每個都要是 `{"level", "pct", "why"}`；上面範例裡的 `{}` 只是省略寫法。

## 其他工作

- **更新雲端預設**（`【下單前・更新雲端預設】`）：把附的設定寫進 `data/profile.json`，`updatedAt` 填現在的台灣時間。**不要寫入預算**（repo 是公開的，預算只存在 PZ 的裝置）。跑 `--check` 後推上去。PZ 的每台裝置下次打開 App，會問他要不要套用新的雲端預設。
- **檔期**：`data/calendar.json` 的每個活動是 `{"name","type":"sale|launch","date":"YYYY-MM-DD","categories":["gpu","phone","peripheral"中的幾個],"note","url"}`。只有 `type: "sale"` 會讓判定變成「再等等」；`launch` 只顯示在「接下來」。過期的活動可以刪掉。
- **移除商品**：PZ 要求時刪掉 `data/products/<id>.json`，跑 `--check` 後推上去。
