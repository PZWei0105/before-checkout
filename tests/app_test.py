"""下單前 App 的瀏覽器測試：python3 tests/app_test.py
先打包到暫存資料夾、開本機伺服器，再用 Chromium（Playwright）在手機 390、360 與桌機 1440 寬度檢查畫面和流程。
預期的判定由 engine.js 在 Node 另外算一次再跟畫面比對，所以商品資料換了也不用改測試。
雲端環境已經裝好 Chromium（PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers），不要執行 playwright install。"""
import json, os, pathlib, re, socket, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
TMP = pathlib.Path(tempfile.mkdtemp(prefix='bc-test-'))
SITE = TMP / 'site'
ENV = {**os.environ, 'TZ': 'Asia/Taipei'}
subprocess.run(['node', 'tools/build.mjs', '--out', str(SITE)], cwd=ROOT, env=ENV, check=True, stdout=subprocess.DEVNULL)

NODE = r"""
const E=require('./engine.js');const b=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
const pr=E.normProfile({...b.profile,budget:{gpu:null,phone:null,peripheral:null}});const out={};
for(const p of b.products){const r=E.evaluate(p,pr,{},{calendar:b.calendar.events});const P=p.price||{};
  out[p.id]={v:r.verdict,label:E.V[r.verdict].label,hits:r.lines.filter(l=>l.status==='hit').map(l=>l.id),now:r.now,
    nowBy:P.nowBy||null,pick:P.pick||null,stale:r.age!=null&&r.age>r.thr.freshDays,checkedAt:p.checkedAt,auto:!!p.auto}}
console.log(JSON.stringify(out));"""
EXP = json.loads(subprocess.run(['node', '-e', NODE, str(SITE / 'data/bundle.json')], cwd=ROOT, env=ENV, capture_output=True, text=True, check=True).stdout)
IDS = sorted(EXP)
COUNT = {v: sum(1 for x in EXP.values() if x['v'] == v) for v in ['buy', 'wait', 'next', 'skip']}

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
PORT = free_port(); BASE = f'http://localhost:{PORT}/'
def serve(): return subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '-d', str(SITE)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
srv = serve(); time.sleep(0.8)

results, errors = [], []
def ok(cond, msg):
    results.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + msg)
def mmdd(iso):
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', iso or ''); return f'{m.group(2)}/{m.group(3)}' if m else '--/--'
def nums(s): return int(s.replace(',', ''))

IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
try:
  with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx_for(w=390, h=844, scheme='light', mobile=True):
        kw = dict(viewport={'width': w, 'height': h}, color_scheme=scheme, timezone_id='Asia/Taipei', locale='zh-TW',
                  permissions=['clipboard-read', 'clipboard-write'])
        if mobile: kw.update(is_mobile=True, has_touch=True, user_agent=IPHONE, device_scale_factor=2)
        c = b.new_context(**kw)
        c.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.abort())  # 字型不影響測試，用系統字
        return c
    def watch(pg, tag):
        pg.on('pageerror', lambda e: errors.append(f'[{tag}] {e}'))
        # 測試時故意擋掉 Google 字型，那些載入失敗不算錯
        font = lambda m: 'fonts.g' in m.text or 'fonts.g' in ((m.location or {}).get('url') or '')
        pg.on('console', lambda m: errors.append(f'[{tag}] console.{m.type}: {m.text}') if m.type == 'error' and not font(m) else None)
    sw = lambda pg: pg.evaluate('document.documentElement.scrollWidth')
    clip = lambda pg: pg.evaluate('navigator.clipboard.readText()')

    # ---------- 手機 390，淺色，第一次打開 ----------
    c = ctx_for(); pg = c.new_page(); watch(pg, '390')
    pg.goto(BASE); pg.wait_for_timeout(1600)
    tally = {v: pg.inner_text(f'#tally .v-{v} b') for v in COUNT}
    ok(all(tally[v] == str(COUNT[v]) for v in COUNT), f'簡報的四個數字跟規則引擎一樣 {tally}')
    ok('已同步' in pg.inner_text('#sync'), '同步燈號：' + pg.inner_text('#sync'))
    ok(pg.inner_text('#update').strip() == '', '第一次打開不顯示「App 更新了」')
    attn = pg.inner_text('#attention')
    ok(attn.count('沒請秘書查證') <= 1, '「要你注意」的過期提醒合成一行（%d 行）' % attn.count('沒請秘書查證'))
    n_stale = sum(1 for x in EXP.values() if x['stale'])
    ok((n_stale == 0) == ('沒請秘書查證' not in attn), f'有 {n_stale} 件過期，提醒有沒有出現要一致')
    board = []
    for _ in range(7): board.append(pg.inner_text('#board').replace('\n', ' ')); pg.click('#board'); pg.wait_for_timeout(60)
    bot = [x for x in board if 'PRICE BOT' in x]
    ok(not any(x['auto'] for x in EXP.values()) or (bot and ('點多' in bot[0] or '—' in bot[0] or '等第一次' in bot[0])), '客顯看板的追價時間說「幾點多」：' + (bot[0] if bot else '-'))
    for v in ['brief', 'list', 'rules', 'me']:
        pg.click(f'.tab[data-view="{v}"]'); pg.wait_for_timeout(200)
        ok(sw(pg) <= 390, f'390 {v} 沒有左右捲動（{sw(pg)}）')
    ok('判定用哪個價格' in pg.inner_text('#view-rules'), '守則頁有「判定用哪個價格」')
    pg.click('.tab[data-view="me"]'); pg.wait_for_timeout(200)
    ok('更新紀錄' in pg.inner_text('#me-extra'), '「我」有更新紀錄')

    # 清單：每件的章跟規則引擎一樣
    pg.click('.tab[data-view="list"]'); pg.wait_for_timeout(250)
    rows = dict(pg.eval_on_selector_all('.stub', 'els=>els.map(e=>[e.dataset.id,e.querySelector(".stamp").textContent])'))
    ok(rows == {k: v['label'] for k, v in EXP.items()}, f'清單的判定跟規則引擎一樣（{len(rows)} 件）')
    cut = pg.eval_on_selector_all('.stub-age', 'els=>els.filter(e=>{const r=e.getBoundingClientRect(),c=e.closest(".stub-main").getBoundingClientRect();return e.scrollWidth>e.clientWidth+1||r.right>c.right+1}).map(e=>e.closest(".stub").dataset.id)')
    ok(not cut, '390 清單的「幾天前查證」沒有被切掉' + (f'：{cut}' if cut else ''))

    # 每一件商品頁：規則逐條、NOW 日期、價格說明不能自相矛盾
    for pid in IDS:
        e = EXP[pid]
        pg.click(f'.stub[data-id="{pid}"]'); pg.wait_for_timeout(250)
        hits = pg.eval_on_selector_all('#sh-receipt .rl.hit', 'els=>els.map(e=>e.querySelector(".rl-id").textContent)')
        ok(hits == e['hits'], f'{pid} 判定單觸發 {hits}')
        vfd = pg.inner_text('#sh-vfd')
        want = mmdd(e['pick']['auto']['at']) if e['nowBy'] == 'auto' and e['pick'] and e['pick'].get('auto') else mmdd(e['checkedAt'])
        ok(f'NOW {want}' in vfd.replace('\n', ' '), f'{pid} 客顯的 NOW 日期是價格實際查到的那天（{want}）')
        text = pg.inner_text('#sheet')
        bad = []
        for m in re.finditer(r'判定採用自動追價 NT\$ ([\d,]+)：比秘書[^。]*?查到的 NT\$ ([\d,]+) 低', text):
            if not nums(m.group(1)) < nums(m.group(2)): bad.append(m.group(0))
        for m in re.finditer(r'判定採用秘書[^。]*?查到的 NT\$ ([\d,]+)：比自動追價 NT\$ ([\d,]+) 低', text):
            if not nums(m.group(1)) < nums(m.group(2)): bad.append(m.group(0))
        ok(not bad, f'{pid} 價格說明沒有寫反' + (f'：{bad}' if bad else ''))
        if e['pick'] and e['pick']['why'] == 'secStale':
            ok('超過 7 天' in text, f'{pid} 有說明秘書價已超過 7 天')
        # 蓋章動畫開頭會放大超出畫面一點點：商品頁本身不能被左右拖動，動畫結束後也不能比畫面寬
        ok(pg.evaluate("getComputedStyle(document.querySelector('#sheet')).overflowX") == 'hidden', f'{pid} 商品頁不能左右拖動')
        pg.wait_for_timeout(1100)
        ok(pg.evaluate("document.querySelector('#sheet').scrollWidth") <= 390, f'{pid} 蓋章後商品頁沒有比畫面寬')
        pg.click('[data-act="close"]'); pg.wait_for_timeout(150)

    # 問秘書、重查委託：複製的內容
    first = IDS[0]
    pg.click(f'.stub[data-id="{first}"]'); pg.wait_for_timeout(400)
    pg.click('#ask-sugg .chip >> nth=0'); pg.click('#f-ask button[type=submit]'); pg.wait_for_timeout(250)
    c1 = clip(pg); ok(c1.startswith('【下單前・問秘書】') and '【規則逐條】' in c1, f'問秘書的文字已複製（{len(c1)} 字）')
    pg.click('#sh-refresh'); pg.wait_for_timeout(300)
    c2 = clip(pg); ok(c2.startswith('【下單前・秘書委託 R-') and f'data/products/{first}.json' in c2, '重查委託單已複製')
    ok('已複製' in pg.inner_text('#sh-handoff'), '商品頁上方出現交接提示')
    pg.go_back(); pg.wait_for_timeout(250); ok(pg.is_hidden('#sheet'), '按返回鍵會關掉商品頁')

    # 開新委託 → 秘書推上資料 → 委託單變「完成」
    pg.click('.tab[data-view="brief"]'); pg.wait_for_timeout(200)
    pg.fill('#d-q', '測試商品 X1'); pg.click('#d-cat [data-val="gpu"]'); pg.click('#d-go'); pg.wait_for_timeout(300)
    code = re.search(r'R-[0-9A-Z]{6}', clip(pg)).group(0)
    ok('等秘書回報' in pg.inner_text('#tickets'), f'委託 {code} 顯示等待中')
    bundle_file = SITE / 'data/bundle.json'; backup = bundle_file.read_text()
    bd = json.loads(backup); newp = json.loads(json.dumps(bd['products'][0]))
    newp.update(id='test-x1', name='測試商品 X1', lastRequest=code, checkedAt=time.strftime('%Y-%m-%dT%H:%M:%S+08:00', time.gmtime(time.time() + 8 * 3600)))
    bd['products'].append(newp); bd['buildId'] = 'test-update'; bundle_file.write_text(json.dumps(bd, ensure_ascii=False))
    pg.click('#sync'); pg.wait_for_timeout(700)
    ok('完成' in pg.inner_text('#tickets'), '秘書資料進來後，委託單變「完成」')
    bundle_file.write_text(backup); pg.click('#sync'); pg.wait_for_timeout(600)

    # 下拉同步（真的觸控事件）
    pg.evaluate('window.scrollTo(0,0)'); cdp = c.new_cdp_session(pg)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 200, 'y': 160}]})
    for y in range(170, 330, 20): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 200, 'y': y}]}); pg.wait_for_timeout(16)
    state = pg.get_attribute('#ptr', 'data-state')
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(900)
    ok(state == 'ready', f'下拉到底顯示「放開同步」（{state}）')
    ok(pg.is_visible('#toast') and '資料' in pg.inner_text('#toast'), '放開後同步：' + (pg.inner_text('#toast') if pg.is_visible('#toast') else '-'))

    # 用過的人：App 改版後提示一次「App 更新了」，按「知道了」就不再出現
    pg.evaluate("localStorage.setItem('bc.update.v1', JSON.stringify('old'))"); pg.reload(); pg.wait_for_timeout(1200)
    ok('App 更新了' in pg.inner_text('#update'), '改版後簡報頁提示「App 更新了」')
    pg.click('[data-act="upd-seen"]'); pg.wait_for_timeout(150)
    ok(pg.inner_text('#update').strip() == '', '按「知道了」就收起來')
    pg.reload(); pg.wait_for_timeout(1200)
    ok(pg.inner_text('#update').strip() == '', '重新打開也不再出現')

    # 離線：關掉伺服器，從 service worker 的存檔打開
    pg.wait_for_timeout(400); pg.reload(); pg.wait_for_timeout(900)
    ok(pg.evaluate('!!navigator.serviceWorker.controller'), 'service worker 接手了')
    srv.terminate(); srv.wait(); time.sleep(0.3)
    pg.reload(); pg.wait_for_timeout(1600)
    ok('離線' in pg.inner_text('#sync') and pg.inner_text('#tally b') != '–', '伺服器關掉也打得開：' + pg.inner_text('#sync'))
    srv = serve(); time.sleep(0.8); pg.click('#sync'); pg.wait_for_timeout(800)
    ok('已同步' in pg.inner_text('#sync'), '連回來後點燈號就同步：' + pg.inner_text('#sync'))
    c.close()

    # ---------- 360 寬的 Android、深色、直接連到商品頁 ----------
    c = ctx_for(360, 780, 'dark'); pg = c.new_page(); watch(pg, '360-dark')
    pg.goto(BASE + '#p-' + IDS[-1]); pg.wait_for_timeout(1800)
    ok(pg.is_visible('#sheet'), '網址 #p-商品 直接打開商品頁')
    ok(pg.evaluate("document.querySelector('#sheet').scrollWidth") <= 360, '360 商品頁沒有左右捲動')
    pg.click('[data-act="close"]'); pg.wait_for_timeout(200)
    for v in ['brief', 'list', 'rules', 'me']:
        pg.click(f'.tab[data-view="{v}"]'); pg.wait_for_timeout(150)
        ok(sw(pg) <= 360, f'360 {v} 沒有左右捲動')
    pg.click('.tab[data-view="list"]'); pg.wait_for_timeout(150)
    cut = pg.eval_on_selector_all('.stub-age', 'els=>els.filter(e=>{const r=e.getBoundingClientRect(),c=e.closest(".stub-main").getBoundingClientRect();return e.scrollWidth>e.clientWidth+1||r.right>c.right+1}).map(e=>e.closest(".stub").dataset.id)')
    ok(not cut, '360 清單的「幾天前查證」沒有被切掉' + (f'：{cut}' if cut else ''))
    c.close()

    # ---------- 桌機 1440，深淺兩種 ----------
    for scheme in ['light', 'dark']:
        c = ctx_for(1440, 900, scheme, mobile=False); pg = c.new_page(); watch(pg, f'1440-{scheme}')
        pg.goto(BASE); pg.wait_for_timeout(1500)
        for v in ['brief', 'list', 'rules', 'me']:
            pg.click(f'.tab[data-view="{v}"]'); pg.wait_for_timeout(150)
            ok(sw(pg) <= 1440, f'1440 {scheme} {v} 沒有左右捲動')
        c.close()
    b.close()
finally:
    srv.terminate()

ok(not errors, '全程沒有 console 錯誤' + ('：\n  ' + '\n  '.join(errors[:10]) if errors else ''))
print(f'\n{sum(results)} / {len(results)} 項通過')
sys.exit(0 if all(results) else 1)
