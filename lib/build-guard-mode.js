// lib/build-guard-mode.js
// Decides whether a /api/build-guard request is a dry run or a live run. PURE.
//   dry run is the default and always safe (plans only, writes nothing, sends no email)
//   live needs BOTH live=1 and phrase=RUN BUILD GUARD LIVE (the phrase Jerry types); live=1 with a wrong or missing phrase is refused, never downgraded silently
//   only=<master variant id> limits the run to one master (the first live run uses this)
//   max=<n> caps how many masters one live run may change (default 10)

const PHRASE = 'RUN BUILD GUARD LIVE';
const DEFAULT_MAX = 10;

function parseGuardRequest(q) {
    const query = q || {};
    const flag = (v) => ['1', 'true', 'yes'].includes(String(v === undefined ? '' : v).toLowerCase());
    const wantsLive = flag(query.live);
    const dryFlag = flag(query.dry);
    const only = query.only ? String(query.only).split('/').pop().replace(/\D/g, '') || null : null;
    const maxRaw = parseInt(query.max, 10);
    const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : DEFAULT_MAX;
    if (wantsLive && dryFlag) return { ok: false, error: 'dry=1 and live=1 cannot be combined' };
    if (wantsLive) {
        if (String(query.phrase || '').trim() !== PHRASE) return { ok: false, error: `live mode needs phrase=${PHRASE}` };
        return { ok: true, dry: false, only, max };
    }
    return { ok: true, dry: true, only, max };
}

module.exports = { parseGuardRequest, PHRASE, DEFAULT_MAX };
