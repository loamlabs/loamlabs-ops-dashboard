const $ = (id) => document.getElementById(id);
const say = (t, bad) => { $('out').textContent = t; $('out').className = bad ? 'warn' : ''; };
async function load() { const s = await chrome.storage.local.get({ nas: '', token: '', intervalDays: 3, lastRunAt: null, stopped: null, last: null }); $('nas').value = s.nas; $('token').value = s.token; $('days').value = String(s.intervalDays); show(s); }
function show(s) { const lines = []; lines.push(s.stopped ? 'STOPPED since ' + s.stopped.at + ': ' + s.stopped.reason + '\nLog in to hasgllc.com in Chrome yourself, then click Resume.' : 'Status: running (waiting for the next run)'); lines.push('Last run: ' + (s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : 'never')); if (s.last) lines.push('Result: ' + s.last.text + ' (' + s.last.at + ')'); say(lines.join('\n'), !!s.stopped); }
$('save').onclick = async () => {
    const nas = $('nas').value.trim().replace(/\/$/, ''); const token = $('token').value.trim();
    if (!/^http:\/\/[\d.a-zA-Z-]+:\d+$/.test(nas)) return say('The address must look like http://192.168.10.20:18765', true);
    try { await chrome.permissions.request({ origins: [nas.replace(/:\d+$/, '') + '/*'] }); } catch (e) { /* the two known NAS addresses are already allowed */ }
    await chrome.storage.local.set({ nas, token, intervalDays: Number($('days').value) }); say('Saved. Now click Test connection.');
};
$('test').onclick = async () => { say('Testing...'); const r = await chrome.runtime.sendMessage({ type: 'test' }); say(r.ok ? 'Connected to the NAS job. ' + JSON.stringify(r.body.helperStatus) : 'NOT connected (' + r.status + '): ' + (r.text || (r.status === 401 ? 'the token is wrong' : 'see the NAS log')) + '\nIf it cannot reach the NAS: check the address and that the project publishes port 8765.', !r.ok); };
$('run').onclick = async () => { say('Running: about 2 minutes. Background tabs open and close by themselves...'); const r = await chrome.runtime.sendMessage({ type: 'run' }); say(r.text, !r.ok); setTimeout(load, 500); };
$('resume').onclick = async () => { await chrome.runtime.sendMessage({ type: 'resume' }); say('Resumed. The next run starts at the next check (or click Run now).'); setTimeout(load, 500); };
load();
