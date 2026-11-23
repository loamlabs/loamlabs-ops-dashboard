// Alpina Hoss pages helper: the service worker. Runs in Jerry's own Chrome. See core.js for the rules (never logs in, stops at any login / check / 403 / 429, retries nothing).
importScripts('core.js');
const C = self.AlpinaHelperCore;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let running = false;

const getS = async () => (await chrome.storage.local.get({ nas: '', token: '', intervalDays: 3, lastRunAt: null, stopped: null, last: null }));
const setS = (o) => chrome.storage.local.set(o);
const badge = (text, color) => { try { chrome.action.setBadgeText({ text }); chrome.action.setBadgeBackgroundColor({ color }); } catch (e) { /* no badge */ } };

function makePost(s) {
    return async (path, body) => {
        try {
            const r = await fetch(s.nas.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token }, body: JSON.stringify(body) });
            return { ok: r.ok, status: r.status, text: await r.text().catch(() => '') };
        } catch (e) { return { ok: false, status: 0, text: 'cannot reach the NAS: ' + e.message }; }
    };
}

// loads one page in a background tab, waits for the stock data to be in the page, reads it, closes the tab
async function openAndRead(page) {
    const tab = await chrome.tabs.create({ url: page.url, active: false });
    try {
        await new Promise((resolve, reject) => {
            const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); reject(new Error('the page did not finish loading in 60 seconds')); }, 60000);
            function l(id, info) { if (id === tab.id && info.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); resolve(); } }
            chrome.tabs.onUpdated.addListener(l);
            chrome.tabs.get(tab.id).then((x) => { if (x.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); resolve(); } }).catch(() => {});
        });
        const [res] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async () => {
                const find = () => document.querySelector('form[data-product_variations]');
                for (let i = 0; i < 40 && !find(); i++) await new Promise((r) => setTimeout(r, 500));   // up to 20 s for the stock data
                const form = find(); const nav = (performance.getEntriesByType('navigation') || [])[0];
                const attr = form ? form.getAttribute('data-product_variations') : null;
                return { snap: { url: location.href, title: document.title, status: nav && nav.responseStatus ? nav.responseStatus : null, hasPassword: !!document.querySelector('input[type=password]'), hasVariations: !!attr && attr !== 'false', bodyText: (document.body ? document.body.innerText : '').slice(0, 3000) }, variations: attr && attr !== 'false' ? attr : null };
            },
        });
        return res.result;
    } finally { try { await chrome.tabs.remove(tab.id); } catch (e) { /* already closed */ } }
}

async function run(manual) {
    if (running) return { ok: false, text: 'a run is already going' };
    const s = await getS();
    if (!s.nas || !s.token) return { ok: false, text: 'set the NAS address and the token in the options first' };
    if (s.stopped) return { ok: false, text: 'stopped: ' + s.stopped.reason + ' (log in to hasgllc.com in Chrome yourself, then click Resume in the options)' };
    const now = Date.now();
    if (!manual && !C.runDue(now, s.lastRunAt, s.intervalDays)) return { ok: true, text: 'not due yet' };
    if (manual && s.lastRunAt && now - s.lastRunAt < 12 * 3600e3) return { ok: false, text: 'a run was made less than 12 hours ago: please wait (Hoss is asked as little as possible)' };
    running = true; badge('...', '#888'); const keep = setInterval(() => { chrome.runtime.getPlatformInfo(() => {}); }, 20000);
    try {
        await setS({ lastRunAt: now });   // counts as a run even if it stops: nothing is retried
        const out = await C.runOnce({ openAndRead, post: makePost(s), sleep, now: () => new Date().toISOString(), random: Math.random });
        if (out.ok) { await setS({ last: { at: new Date().toISOString(), ok: true, text: out.delivered + ' pages sent to the NAS' } }); badge('OK', '#2a7'); return { ok: true, text: out.delivered + ' pages sent to the NAS' }; }
        await setS({ stopped: { at: new Date().toISOString(), kind: out.stopped.kind, reason: out.stopped.reason }, last: { at: new Date().toISOString(), ok: false, text: 'STOPPED: ' + out.stopped.reason } }); badge('STOP', '#c33');
        return { ok: false, text: 'STOPPED: ' + out.stopped.reason };
    } finally { clearInterval(keep); running = false; }
}

chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('alpina-check', { delayInMinutes: 1, periodInMinutes: 360 }); });
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('alpina-check', { delayInMinutes: 2, periodInMinutes: 360 }); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'alpina-check') run(false); });

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
    (async () => {
        const s = await getS();
        if (msg.type === 'run') return send(await run(true));
        if (msg.type === 'test') { try { const r = await fetch(s.nas.replace(/\/$/, '') + '/ping', { headers: { Authorization: 'Bearer ' + s.token } }); const j = await r.json().catch(() => ({})); return send({ ok: r.ok, status: r.status, body: j }); } catch (e) { return send({ ok: false, status: 0, text: 'cannot reach the NAS: ' + e.message }); } }
        if (msg.type === 'resume') { await setS({ stopped: null }); badge('', '#000'); try { await makePost(s)('/resumed', {}); } catch (e) { /* ignore */ } return send({ ok: true }); }
        if (msg.type === 'state') return send({ s });
        send({ ok: false });
    })();
    return true;
});
