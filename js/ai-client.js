/* sovereign. — talks to the Worker (never to Anthropic directly) and turns its answers into a saved course.
   Only what the person typed in the "Build with AI" form (plus module titles when finding materials) is ever sent.
   No documents, no other courses, no progress data. */
(function (S) {
  'use strict';
  const KEY = 'sovereign.aioff.ai'; // this browser only; not part of exports or backups
  const ai = (S.ai = {});

  class AIError extends Error { constructor(code, message) { super(message); this.code = code; } }
  ai.Error = AIError;

  /* ----- settings (Worker address + access code), kept in this browser only ----- */

  function readSaved() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  ai.cleanBase = function (u) {
    const t = String(u || '').trim().replace(/\/+$/, '');
    if (!t) return '';
    try {
      const x = new URL(t);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname);
      if (x.protocol === 'https:' || (x.protocol === 'http:' && local)) return x.origin + x.pathname.replace(/\/+$/, '');
    } catch (e) { /* invalid */ }
    return null;
  };
  ai.settings = function () {
    const s = readSaved();
    const url = ai.cleanBase(s.url) || ai.cleanBase(S.config && S.config.aiUrl) || '';
    return { url, code: typeof s.code === 'string' ? s.code : '' };
  };
  ai.saveSettings = function (o) {
    const s = readSaved();
    if ('url' in o) { if (o.url) s.url = o.url; else delete s.url; }
    if ('code' in o) { if (o.code) s.code = o.code; else delete s.code; }
    try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  };
  ai.ready = () => { const s = ai.settings(); return !!(s.url && s.code); };

  /* ----- one request to the Worker (reads its line-by-line stream; "ping" lines keep it alive) ----- */

  const NO_SERVICE = 'The AI service isn’t set up in this app yet. Add its address and access code under AI settings.';

  ai.call = async function (path, body, opts) {
    opts = opts || {};
    const s = ai.settings();
    if (!s.url) throw new AIError('not_configured', NO_SERVICE);
    if (!s.code) throw new AIError('no_code', 'Enter your access code under AI settings first.');
    const ctl = new AbortController();
    let idle, timedOut = false;
    const bump = () => { clearTimeout(idle); idle = setTimeout(() => { timedOut = true; ctl.abort(); }, 70000); };
    if (opts.signal) opts.signal.addEventListener('abort', () => ctl.abort());
    bump();
    const fail = (e) => {
      if (opts.signal && opts.signal.aborted) return new AIError('cancelled', 'Cancelled.');
      if (timedOut) return new AIError('timeout', 'The AI service took too long to answer. Please try again.');
      return new AIError('network', 'Couldn’t reach the AI service. Check your connection and the service address, then try again.');
    };
    try {
      let res;
      try {
        res = await fetch(s.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Access-Code': s.code }, body: JSON.stringify(body), signal: ctl.signal, cache: 'no-store' });
      } catch (e) { throw fail(e); }
      if (!res.ok) {
        let m = null; try { m = (await res.json()).error; } catch (e) { /* not JSON */ }
        throw new AIError((m && m.code) || 'http_' + res.status, (m && m.message) || 'The AI service returned an error (' + res.status + ').');
      }
      let result = null;
      const handle = (line) => {
        line = line.trim(); if (!line) return;
        let m; try { m = JSON.parse(line); } catch (e) { return; }
        if (m.t === 'error') throw new AIError(m.code || 'error', m.message || 'The AI service reported an error.');
        if (m.t === 'result') result = m;
      };
      try {
        if (res.body && res.body.getReader) {
          const reader = res.body.getReader(), dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bump(); buf += dec.decode(value, { stream: true });
            let i; while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
          }
          handle(buf);
        } else (await res.text()).split('\n').forEach(handle);
      } catch (e) { if (e instanceof AIError) throw e; throw fail(e); }
      if (!result) throw new AIError('no_result', 'The AI service stopped before finishing. Please try again.');
      return result;
    } finally { clearTimeout(idle); }
  };

  ai.health = async function () {
    const s = ai.settings();
    if (!s.url) throw new AIError('not_configured', NO_SERVICE);
    let res;
    try { res = await fetch(s.url + '/health', { cache: 'no-store' }); } catch (e) { throw new AIError('network', 'Couldn’t reach that address. Check it and try again.'); }
    if (!res.ok) throw new AIError('http_' + res.status, 'That address answered, but it doesn’t look like the Sovereign service.');
    try { return await res.json(); } catch (e) { throw new AIError('bad', 'That address answered, but it doesn’t look like the Sovereign service.'); }
  };

  /* ----- turning the Worker's answers into course data ----- */

  const now = () => new Date().toISOString();
  const usageRow = (u) => ({ step: u.step, model: u.model, inTok: u.inTok || 0, outTok: u.outTok || 0, searches: u.searches || 0, cost: u.cost || 0, at: now() });

  ai.totals = function (c) {
    const rows = (c.ai && c.ai.usage) || [];
    return rows.reduce((t, u) => ({ inTok: t.inTok + u.inTok, outTok: t.outTok + u.outTok, searches: t.searches + u.searches, cost: t.cost + u.cost, calls: t.calls + 1 }), { inTok: 0, outTok: 0, searches: 0, cost: 0, calls: 0 });
  };
  ai.money = (n) => '$' + (n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2));

  function readingFrom(r) {
    return { id: S.uid(), title: r.title, url: r.url, note: '', done: false, source: 'ai', kind: r.kind, creator: r.creator, access: r.access, sourceType: r.sourceType, derivedFrom: r.derivedFrom, derivedUrl: r.derivedUrl, relevance: r.relevance, verification: r.verification, contentCheck: r.contentCheck };
  }
  const placeholder = (mod, note) => ({ id: S.uid(), title: 'Source needed: ' + mod.title, url: '', note: note || 'No verifiable source was found. Add your own.', done: false, source: 'placeholder' });

  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  ai.addDays = addDays;
  // Due dates follow the timeline chosen at the start: modules share the weeks evenly, and each module's assignments are spread across its slice.
  function dueFor(start, weeks, nMods, mi, ai_, nAs) {
    const total = Math.max(1, (weeks || 6) * 7), slice = total / Math.max(1, nMods);
    return addDays(start, Math.max(1, Math.round(slice * mi + (slice * (ai_ + 1)) / Math.max(1, nAs))));
  }

  function courseFromOutline(o, brief) {
    const fp = o.finalProject || {};
    const start = S.validDate(brief && brief.startDate) || S.todayISO();
    const raw = {
      id: S.uid(), code: S.codeFor(o.title), title: o.title, description: o.description, objective: o.pathway,
      deliverable: [fp.title, fp.description].filter(Boolean).join(': '), syllabus: o.syllabus, outcomes: o.outcomes, duration: o.duration, pathway: o.pathway,
      licensureNote: o.licensureNote, startDate: start, color: S.state.courses.length % S.COLORS.length, designTheme: S.randomTheme(),
      announcements: [{ id: S.uid(), title: 'Welcome' + (S.state.name ? ', ' + S.state.name : '') + ': ' + o.title, date: S.todayISO(), body: 'This course was drafted by AI from what you told it. Treat it as a first draft: rename, reorder, replace, or delete anything. Check every resource yourself, because links are checked by a program, not reviewed by a person.' }],
      credentials: (o.credentials || []).map((k) => ({ id: S.uid(), name: k.name, issuer: k.issuer, note: k.note, status: 'considering', requirement: k.requirement, origin: 'ai' })),
      modules: o.modules.map((m, mi) => ({
        id: S.uid(), title: m.title, overview: m.overview, keyIdeas: m.keyIdeas, reflection: m.reflection, objectives: m.objectives, selfCheck: m.selfCheck,
        duration: m.duration, origin: 'ai', edited: false, readings: [],
        assignments: m.assignments.map((a, ai_) => ({ id: S.uid(), title: a.title, description: a.description, kind: a.kind, points: a.points, realEvidence: a.realEvidence === true && a.kind !== 'learn', origin: 'ai', due: dueFor(start, brief && brief.weeks, o.modules.length, mi, ai_, m.assignments.length), locked: true })),
      })),
      work: { title: fp.title, criteria: fp.criteria },
      ai: { generated: true, createdAt: now(), status: 'partial', note: 'Course outline saved. Learning materials are still being found.', brief, usage: [] },
    };
    return S.normalize({ courses: [raw] }).courses[0];
  }

  // Finds 1-2 resources for one module. Adds them; never removes anything the person wrote. Throws AIError on failure.
  ai.findMaterials = async function (course, mod, opts) {
    const r = await ai.call('/resources', {
      topic: course.title, level: (course.ai && course.ai.brief && course.ai.brief.level) || '',
      module: { title: mod.title, overview: mod.overview, objectives: mod.objectives, searchQueries: (opts && opts.queries) || [] }, count: 2,
    }, opts);
    if (!S.state.courses.includes(course) || !course.modules.includes(mod)) throw new AIError('gone', 'That module was removed while searching.');
    mod.readings = mod.readings.filter((x) => x.source !== 'placeholder'); // an older "source needed" marker is replaced; nothing else is touched
    const have = new Set(mod.readings.map((x) => x.url || 'c:' + x.title.toLowerCase()).filter(Boolean));
    let added = 0;
    (r.resources || []).forEach((x) => { if (!have.has(x.url || 'c:' + x.title.toLowerCase())) { mod.readings.push(S.makeReading(readingFrom(x))); added++; } });
    const found = (r.resources || []).length; // 0 means the search found nothing verifiable; duplicates of existing links are not a failure
    let sylAdded = 0;
    (r.syllabi || []).forEach((x) => { if (!mod.syllabi.some((y) => y.url === x.url)) { mod.syllabi.push(S.makeSyllabus({ ...x, source: 'ai' })); sylAdded++; } });
    if (!found && !mod.readings.length && !mod.syllabi.length) mod.readings.push(S.makeReading(placeholder(mod, r.missingNote)));
    if (course.ai && course.ai.generated) course.ai.usage.push(usageRow(r.usage));
    S.save();
    return { added, missing: !found, syllabi: sylAdded };
  };

  // The person chose to "source" one syllabus: the AI opens it and adds the readings it assigns (each with its own link where one exists).
  ai.sourceSyllabus = async function (course, mod, syl, opts) {
    const r = await ai.call('/syllabus', {
      url: syl.url, topic: course.title, level: (course.ai && course.ai.brief && course.ai.brief.level) || '',
      module: { title: mod.title, overview: mod.overview, objectives: mod.objectives },
    }, opts || {});
    if (!S.state.courses.includes(course) || !course.modules.includes(mod) || !mod.syllabi.includes(syl)) throw new AIError('gone', 'That syllabus was removed while it was being read.');
    const have = new Set(mod.readings.map((x) => x.url || 'c:' + x.title.toLowerCase()));
    let added = 0;
    (r.resources || []).forEach((x) => {
      const key = x.url || 'c:' + x.title.toLowerCase();
      if (!have.has(key)) { have.add(key); mod.readings.push(S.makeReading(readingFrom({ ...x, derivedFrom: x.derivedFrom || syl.note || 'Syllabus', derivedUrl: syl.url }))); added++; }
    });
    syl.sourcedAt = now(); syl.sourcedCount = (syl.sourcedCount || 0) + added;
    if (course.ai && course.ai.generated) course.ai.usage.push(usageRow(r.usage));
    S.save();
    return { added, missing: !(r.resources || []).length };
  };

  /* ----- Syllabus sourcing (build 21): read, REVIEW, adopt, then optionally revise assignments. Nothing here changes a course by itself. ----- */

  // The newer features need Worker version 11; building courses and everything else keep working on older Workers.
  ai.requireVersion = async function (n, what) {
    let hl; try { hl = await ai.health(); } catch (e) { return; }
    if (!(hl && hl.version >= n)) throw new AIError('outdated', what + ' needs a newer AI service (version ' + n + '). Paste the latest worker.js into your Cloudflare Worker and deploy it. Everything else still works.');
  };
  const briefOf = (course, mod) => ({ topic: course.title, level: (course.ai && course.ai.brief && course.ai.brief.level) || '', module: { title: mod.title, overview: mod.overview, objectives: mod.objectives, keyIdeas: mod.keyIdeas } });
  const readingKey = (x) => x.url || 'c:' + x.title.toLowerCase();

  // Reads a syllabus from its link, or from text the person pasted (sent only after they agreed; the text is not kept anywhere in the app).
  // Returns { stage, kind, reason, items } for REVIEW: stage is not-accessible | no-readings | readings-found | verified | manual-review.
  ai.readSyllabus = async function (course, mod, syl, text, opts) {
    await ai.requireVersion(12, 'Reading a syllabus with these checks');
    const body = briefOf(course, mod);
    if (text) body.text = text; else body.url = syl.url;
    const r = await ai.call('/syllabus', body, opts || {});
    if (!S.state.courses.includes(course) || !course.modules.includes(mod)) throw new AIError('gone', 'That course changed while the syllabus was being read.');
    if (course.ai && course.ai.generated) course.ai.usage.push(usageRow(r.usage));
    const have = new Set(mod.readings.map(readingKey));
    S.save();
    // Every reading must have an online link. Citations with no link are left out entirely (counted, never listed or added).
    const all = r.resources || [], linked = all.filter((x) => x.url), skipped = all.length - linked.length;
    let stage = r.stage || (r.missing ? 'no-readings' : 'readings-found'), reason = r.reason || '';
    if (skipped) {
      stage = !linked.length ? 'no-readings' : linked.some((x) => x.review === 'link-checked') ? 'verified' : 'readings-found';
      reason = !linked.length ? 'The syllabus was read, but none of its readings for this module has an online link, so nothing was listed.' : '';
    }
    return { stage, kind: r.kind || 'page', reason, errorCode: r.errorCode || '', diag: r.diag || null, at: now(), skipped,
      items: linked.map((x) => ({ ...x, dup: have.has(readingKey(x)) })) };
  };

  // Opens the page behind each reading's link and reports whether it holds that reading. items: [{ title, creator, url }] (up to 5; only these are sent).
  // Returns one result per item that has a link: { status: matched | about | mismatch | unreadable, detail, checkedAt }, or null for items without a link.
  ai.checkContent = async function (course, mod, items, opts) {
    await ai.requireVersion(13, 'Checking content');
    const sendable = items.map((x, i) => ({ x, i })).filter(({ x }) => x.url).slice(0, 5);
    if (!sendable.length) throw new AIError('bad_input', 'None of these readings has a link to check.');
    const r = await ai.call('/check-content', { readings: sendable.map(({ x }) => ({ title: x.title, creator: x.creator || '', url: x.url })) }, opts || {});
    if (!S.state.courses.includes(course) || !course.modules.includes(mod)) throw new AIError('gone', 'That course changed while the content was being checked.');
    if (course.ai && course.ai.generated) course.ai.usage.push(usageRow(r.usage));
    const out = items.map(() => null);
    sendable.forEach(({ i }, k) => { const c = (r.results || [])[k]; if (c) out[i] = { status: c.status, detail: c.detail || '', checkedAt: c.checkedAt || now() }; });
    S.save();
    return out;
  };

  // Adds ONLY the readings the person ticked. Duplicates are skipped. Returns the readings added.
  ai.adoptReadings = function (course, mod, syl, items) {
    const have = new Set(mod.readings.map(readingKey)), added = [];
    items.forEach((x) => {
      if (!x.url || have.has(readingKey(x))) return; // a reading without an online link is never added
      have.add(readingKey(x));
      const rd = S.makeReading(readingFrom({ ...x, derivedFrom: x.derivedFrom || (syl && (syl.note || syl.title)) || 'Syllabus', derivedUrl: (syl && syl.url) || '' }));
      if (x.review === 'manual-review') rd.note = 'Check this against the syllabus: the AI read it from a document this service could not search.';
      mod.readings.push(rd); added.push(rd);
    });
    if (syl) { syl.sourcedAt = now(); syl.sourcedCount = (syl.sourcedCount || 0) + added.length; }
    S.save();
    return added;
  };

  // Asks for PROPOSED revisions of up to three assignments around newly adopted readings. Returns [{ a, rev }]; rev is null when the AI could not write one.
  ai.proposeRevisions = async function (course, mod, readings, assignments, opts) {
    await ai.requireVersion(11, 'Revising assignments');
    const body = briefOf(course, mod);
    body.newReadings = readings.map((x) => ({ title: x.title, creator: x.creator, note: x.relevance || x.note || '' }));
    body.assignments = assignments.map((a) => ({ title: a.title, kind: S.stageOf(a), description: a.description, materials: a.materials, realEvidence: a.realEvidence, steps: a.parts }));
    const r = await ai.call('/revise', body, opts || {});
    if (course.ai && course.ai.generated) course.ai.usage.push(usageRow(r.usage));
    S.save();
    return assignments.map((a, i) => ({ a, rev: (r.revisions || [])[i] || null }));
  };

  // Applies one approved revision. The earlier wording is kept on the assignment (restorable); points, rubric, submissions and grades are not touched.
  ai.applyRevision = function (a, rev, readings) {
    a.revisions = a.revisions || [];
    a.revisions.push({ at: now(), note: rev.changeNote || '', readings: readings.map((x) => x.title).slice(0, 5), before: { description: a.description, parts: JSON.parse(JSON.stringify(a.parts)), materials: a.materials } });
    if (a.revisions.length > 5) a.revisions.shift();
    a.description = rev.description; a.parts = rev.parts;
    if (S.stageOf(a) !== 'learn' && !a.realEvidence && rev.materials) a.materials = rev.materials;
    S.save();
  };
  ai.restoreRevision = function (a) {
    const v = a.revisions && a.revisions.pop(); if (!v) return false;
    a.description = v.before.description; a.parts = v.before.parts; a.materials = v.before.materials;
    S.save(); return true;
  };

  // Reviews one submission. Only call this after the person has agreed to send it. The work is passed along and not kept by the service.
  // payload: { text } or { file: { mime, base64 } }. Round 2 also sends what round 1 asked to change.
  // The criteria shown on the assignment page become the rubric (points split evenly) unless a rubric already exists.
  function rubricFor(a) {
    if (a.rubric && a.rubric.length) return a.rubric;
    const cr = (a.criteria || []).slice(0, 8), n = cr.length;
    if (!n || !(a.points > 0)) return [];
    const each = Math.floor((a.points / n) * 10) / 10;
    return cr.map((t, i) => ({ name: t.slice(0, 120), max: i === n - 1 ? Math.round((a.points - each * (n - 1)) * 10) / 10 : each }));
  }
  // Supplied materials as the reviewer sees them. Worker v16+ takes the evidence packet as its own field (up to 14,000 characters, fairly shared
  // between exhibits). An older Worker only reads 7,000 characters of "materials", so there the packet is squeezed in after the original text, as before.
  const NEW_REVIEW = 16, EXH_BUDGET = 14000, NEW_LEARNER = 17; // Worker 17 accepts the learner's own dataset (context.learnerData)
  const packetMaterials = (a) => {
    const text = a.materials || '';
    if (ai.workerVersion && ai.workerVersion >= NEW_REVIEW) return text;
    const ex = S.exhibits.asText(a, 6200 - Math.min(text.length, 1500));
    return ex.text ? [text.slice(0, 1500), ex.text].filter(Boolean).join('\n\n') : text;
  };
  const packetField = (a) => (ai.workerVersion && ai.workerVersion >= NEW_REVIEW && !a.realEvidence ? S.exhibits.asText(a, EXH_BUDGET).text : '');
  // What the reviewer is told about the assignment (v14). Reading TEXTS are never included: only titles, and the reviewer is told so.
  const reviewContext = (mod, a, kind, mode, learner) => ({
    stage: S.stageOf(a), format: a.format || '', submit: a.submit || '', mode, kind: kind || '',
    steps: (a.parts || []).map((p) => ({ title: p.title, questions: p.questions })),
    materials: a.realEvidence ? '' : packetMaterials(a), exhibits: packetField(a), learnerData: learner ? learner.text : '',
    module: { title: mod.title, objectives: mod.objectives, keyIdeas: mod.keyIdeas },
    readings: (mod.readings || []).filter((x) => x.source !== 'placeholder').slice(0, 8).map((x) => x.title),
  });
  const priorFindings = (fb) => (fb && fb.findings ? fb.findings.filter((f) => f.type !== 'strength').map((f) => ({ type: f.type, claim: f.claim })) : []);
  const finish = (r) => { const fb = { ...r.feedback, cost: (r.usage && r.usage.cost) || 0 }; if (!fb.context) fb.legacyWorker = true; return fb; }; // an older Worker answers in the old format: say so, never pretend it had the full context

  // Office hours: ungraded practice, up to two rounds. mode "practice" = the same assignment, materials and criteria; "own" = the learner's own material.
  // payload: { text } or { file }, plus { kind, previous } (previous = the first version, only when the learner agreed to send it again).
  // The Worker's version decides how exhibits are sent (see packetMaterials). One free /health call per session, only when needed.
  const versionFor = async (a, force) => { if (ai.workerVersion || (!force && !(a.exhibits && a.exhibits.length))) return; try { const hl = await ai.health(); if (hl && hl.version) ai.workerVersion = hl.version; } catch (e) { /* the real call reports it */ } };
  ai.learnerOk = () => !!(ai.workerVersion && ai.workerVersion >= NEW_LEARNER);
  ai.ensureVersion = (a) => versionFor(a, true); // one free /health call per session; lets the screen know whether the Worker can take a learner dataset
  // opts.learner = { text } is the learner's own dataset, present ONLY when they ticked the authorization for this one review.
  ai.office = async function (course, mod, a, payload, round, material, mode, opts) {
    const { learner, ...callOpts } = opts || {};
    await versionFor(a, !!learner);
    if (learner && !ai.learnerOk()) throw new AIError('bad_input', 'The connected AI service is too old to take your own data (it needs version 17). Untick “Include my dataset” or update the service.');
    const { kind, previous, ...submission } = payload;
    const prior = a.office && a.office.rounds[0] && a.office.rounds[0].feedback, practice = mode === 'practice';
    const r = await ai.call('/review', {
      mode: 'office', course: { title: course.title, level: (course.ai && course.ai.brief && course.ai.brief.level) || '' },
      assignment: { title: a.title, description: a.description }, context: reviewContext(mod, a, kind, practice ? 'practice' : 'own', learner), ownMaterial: practice ? '' : material,
      ...(practice ? { rubric: rubricFor(a) } : {}),
      round: round === 2 ? 2 : 1, previousImprovements: round === 2 && prior ? prior.improvements : [], previousFindings: round === 2 ? priorFindings(prior) : [], submission,
      ...(round === 2 && previous ? { previousSubmission: previous } : {}),
    }, callOpts);
    if (!S.state.courses.includes(course) || !mod.assignments.includes(a)) throw new AIError('gone', 'That assignment was removed while it was being reviewed.');
    if (course.ai && course.ai.generated) course.ai.usage.push(usageRow(r.usage));
    return finish(r);
  };
  ai.review = async function (course, mod, a, payload, round, opts) {
    const { learner, ...callOpts } = opts || {};
    await versionFor(a, !!learner);
    if (learner && !ai.learnerOk()) throw new AIError('bad_input', 'The connected AI service is too old to take your own data (it needs version 17). Untick “Include my dataset” or update the service.');
    const { kind, previous, ...submission } = payload;
    const first = a.work && a.work.first && a.work.first.feedback;
    const r = await ai.call('/review', {
      course: { title: course.title, level: (course.ai && course.ai.brief && course.ai.brief.level) || '' },
      assignment: { title: a.title, description: a.description, points: a.points }, context: reviewContext(mod, a, kind, 'graded', learner),
      round: round === 2 ? 2 : 1, rubric: rubricFor(a), previousImprovements: round === 2 && first ? first.improvements : [], previousFindings: round === 2 ? priorFindings(first) : [],
      submission, ...(round === 2 && previous ? { previousSubmission: previous } : {}),
    }, callOpts);
    if (!S.state.courses.includes(course) || !mod.assignments.includes(a)) throw new AIError('gone', 'That assignment was removed while it was being reviewed.');
    if (course.ai && course.ai.generated) course.ai.usage.push(usageRow(r.usage));
    return finish(r);
  };

  // Refuses to start AI work against an older copy of the Worker that doesn't have the newest features.
  ai.NEEDS_VERSION = 9;
  ai.requireCurrent = async function () {
    let hl = null;
    try { hl = await ai.health(); } catch (e) { return; } // unreachable: the real call will report it
    if (hl && hl.version) ai.workerVersion = hl.version;
    if (!(hl && hl.version >= ai.NEEDS_VERSION)) throw new AIError('outdated', 'The AI service is an older version than this app needs. Paste the latest worker.js into your Cloudflare Worker (Edit code, replace everything, Deploy), then try again.');
  };

  // Writes the full one-stop page for assignments in one module: overview, scenario, steps, format, weighted grading. Never touches work already submitted.
  ai.writeDetails = async function (course, mod, targets, opts) {
    const list = targets.filter((a) => a.points > 0 && !a.work && mod.assignments.includes(a)); // work already submitted is never rewritten
    if (!list.length) throw new AIError('bad_input', 'Assignments need points, and ones you have already submitted work for are never rewritten.');
    await ai.requireCurrent();
    const r = await ai.call('/details', {
      topic: course.title, level: (course.ai && course.ai.brief && course.ai.brief.level) || '',
      module: { title: mod.title, overview: mod.overview, objectives: mod.objectives, keyIdeas: mod.keyIdeas },
      readingsMissing: !mod.readings.some((x) => x.source !== 'placeholder'),
      goal: [(course.ai && course.ai.brief && course.ai.brief.goal) || '', (course.ai && course.ai.brief && course.ai.brief.goalText) || ''].filter(Boolean).join(': '),
      assignments: list.map((a) => ({ title: a.title, description: a.description, kind: a.kind, points: a.points, realEvidence: a.realEvidence === true })),
      readings: mod.readings.filter((x) => x.source !== 'placeholder').slice(0, 6).map((x) => ({ title: x.title })),
    }, opts || {});
    if (!S.state.courses.includes(course) || !course.modules.includes(mod)) throw new AIError('gone', 'That module was removed while its assignments were being written.');
    let done = 0;
    (r.details || []).forEach((d, i) => {
      const a = list[i];
      if (!d || !a || !mod.assignments.includes(a)) return;
      if (a.origin === 'ai' || !a.description) { a.description = d.description; a.purpose = ''; } // a person's own wording is kept
      a.materials = a.realEvidence ? '' : S.labelFiction(d.materials); a.basis = d.basis; a.portfolioNote = d.portfolioNote || ''; a.parts = d.parts; a.format = d.format; a.submit = d.submit; a.estimate = d.estimate; a.steps = [];
      if (S.exhibits.needsPacket(a) && !(a.exhibits || []).length) { // a required packet is planned here and built right after (course build) or by the button
        const plan = Array.isArray(d.exhibitPlan) ? d.exhibitPlan : [];
        a.packet = { state: plan.length ? 'required' : 'incomplete', plan, at: now(), model: '', upgraded: false, note: plan.length ? '' : 'The AI did not say which exhibits this assignment needs.' };
      }
      if (a.realEvidence) S.setEvidence(mod, a); // real-evidence tasks get only sources whose links were checked; if none, they are marked "Source needed", never given an invented scenario
      if (!a.work) { a.rubric = d.rubric; a.criteria = []; } // the grading criteria can't change once work has been submitted
      done++;
    });
    if (course.ai && course.ai.generated) course.ai.usage.push(usageRow(r.usage));
    S.save();
    return { done, total: list.length };
  };

  /* ---- Evidence packets (Phase 2A) ---- */
  ai.PACKET_VERSION = 15;
  const packetBody = (course, mod, a, notes) => ({
    topic: course.title, level: (course.ai && course.ai.brief && course.ai.brief.level) || '',
    module: { title: mod.title, overview: mod.overview, objectives: mod.objectives, keyIdeas: mod.keyIdeas },
    assignment: { title: a.title, kind: a.kind, description: a.description, steps: a.parts, criteria: (a.rubric || []).map((k) => k.name), materials: a.realEvidence ? '' : (a.materials || ''), plan: (a.packet && a.packet.plan) || [] },
    notes: notes || '',
  });
  // Asks for a packet and returns it as a DRAFT. Nothing is saved: the person approves first (upgrades) or savePacket is called (course build).
  ai.draftPacket = async function (course, mod, a, o) {
    o = o || {};
    if (a.realEvidence) throw new AIError('bad_input', 'This assignment uses real sources, so no fictional exhibits are written for it.');
    await ai.requireCurrent();
    if (ai.workerVersion && ai.workerVersion < ai.PACKET_VERSION) throw new AIError('outdated', 'Evidence packets need AI service version ' + ai.PACKET_VERSION + ' or newer (yours is ' + ai.workerVersion + '). Paste the latest worker.js into your Cloudflare Worker (Edit code, replace everything, Deploy), then try again.');
    const r = await ai.call('/exhibits', packetBody(course, mod, a, o.notes), o.signal ? { signal: o.signal } : {});
    const v = S.exhibits.sanitize(r.exhibits, { strict: true });
    return { exhibits: v.exhibits, dropped: (r.dropped || []).concat(v.dropped), usage: r.usage, notes: o.notes || '' };
  };
  // Saves an approved draft onto the assignment. Only exhibits and packet bookkeeping change: never the instructions, steps, rubric, materials text, work, grades or feedback.
  ai.savePacket = function (course, a, draft, o) {
    if (!(S.state.courses.includes(course))) throw new AIError('gone', 'That course was removed.');
    const plan = (a.packet && a.packet.plan) || [];
    a.exhibits = draft.exhibits;
    let state = S.exhibits.packetStatus(a) === 'ready' ? 'ready' : 'incomplete', note = '';
    if (draft.dropped && draft.dropped.length) { state = 'incomplete'; note = draft.dropped.length + ' exhibit' + (draft.dropped.length === 1 ? '' : 's') + ' could not be used: ' + draft.dropped.slice(0, 3).map((x) => (x.id ? 'Exhibit ' + x.id + ' (' + x.reason + ')' : x.reason)).join('; ') + '.'; }
    else if (plan.length && (a.exhibits || []).length < plan.length) { state = 'incomplete'; note = 'Only ' + a.exhibits.length + ' of the ' + plan.length + ' planned exhibits were built.'; }
    if (!(a.exhibits || []).length) { state = 'incomplete'; note = note || 'No exhibit passed validation.'; }
    a.packet = { state, plan, at: now(), model: (draft.usage && draft.usage.model) || '', upgraded: !!(o && o.upgraded), note };
    if (course.ai && course.ai.generated && draft.usage) course.ai.usage.push(usageRow(draft.usage));
    S.save();
    return state;
  };
  ai.removePacket = function (a) { a.exhibits = []; a.packet = null; S.save(); };
  // Course build: write the packet for every assignment of one module that needs one. Returns how many are still missing.
  const PACKET_STOP = ['budget', 'global_limit', 'ip_limit', 'hour_limit', 'day_limit', 'bad_code', 'locked', 'not_configured', 'no_code', 'cancelled', 'upstream_auth', 'bad_model', 'outdated'];
  ai.buildPackets = async function (course, mod, o) {
    const todo = mod.assignments.filter((a) => S.exhibits.needsPacket(a) && !a.work && !(a.exhibits || []).length && a.packet && a.packet.plan.length);
    let missing = mod.assignments.filter((a) => S.exhibits.needsPacket(a) && !(a.exhibits || []).length).length - todo.length; // required, but never planned
    for (let n = 0; n < todo.length; n++) {
      const a = todo[n];
      if (o.onStep) o.onStep('Exhibits for “' + a.title + '” (' + (n + 1) + ' of ' + todo.length + ')');
      let ok = false;
      for (let tryN = 0; tryN < 2 && !ok; tryN++) {
        try { const d = await ai.draftPacket(course, mod, a, { signal: o.signal }); ok = ai.savePacket(course, a, d) === 'ready'; }
        catch (e) { if (PACKET_STOP.includes(e.code)) { missing += todo.length - n; S.save(); throw Object.assign(e, { packetsMissing: missing }); } if (a.packet) a.packet.note = e.message; }
      }
      if (!ok) missing++;
    }
    S.save();
    return { missing };
  };

  /* ---- The course capstone (Phase 3, Worker v18) ---- */
  ai.CAPSTONE_VERSION = 18;
  const CAP_POINTS = 100;
  const capBody = (course) => ({
    topic: course.title, level: (course.ai && course.ai.brief && course.ai.brief.level) || '',
    goal: [(course.ai && course.ai.brief && course.ai.brief.goal) || '', (course.ai && course.ai.brief && course.ai.brief.goalText) || ''].filter(Boolean).join(': '),
    outcomes: course.outcomes, finalProject: { title: (course.work && course.work.title) || '', description: course.deliverable || '' }, points: CAP_POINTS,
    modules: course.modules.map((m) => ({ title: m.title, overview: m.overview, objectives: m.objectives, keyIdeas: m.keyIdeas })),
  });
  // Is the capstone complete enough to show as ready? Its page is written, its rubric exists, and any required exhibits are built.
  ai.capstoneComplete = (cap) => { const a = cap && cap.assignments[0]; return !!(a && a.parts.length && a.rubric.length && (!S.exhibits.needsPacket(a) || S.exhibits.packetStatus(a) === 'ready')); };
  // Asks for a capstone and returns it as an UNSAVED draft (a module-shaped record). Nothing is stored until adoptCapstone.
  ai.draftCapstone = async function (course, o) {
    o = o || {};
    if (!course.modules.length) throw new AIError('bad_input', 'Add at least one module before creating a capstone.');
    await ai.requireCurrent();
    if (ai.workerVersion && ai.workerVersion < ai.CAPSTONE_VERSION) throw new AIError('outdated', 'The capstone needs AI service version ' + ai.CAPSTONE_VERSION + ' or newer (yours is ' + ai.workerVersion + '). Paste the latest worker.js into your Cloudflare Worker (Edit code, replace everything, Deploy), then try again.');
    const r = await ai.call('/capstone', capBody(course), o.signal ? { signal: o.signal } : {});
    if (course.ai && course.ai.generated && r.usage) course.ai.usage.push(usageRow(r.usage)); // the cost was real even if the page is rejected
    if (!r.capstone) throw new AIError('incomplete', (r.reason || 'The AI did not write a complete capstone.') + ' You can try again.');
    const c = r.capstone, plan = c.exhibitPlan || [];
    const a = { id: S.uid(), title: c.title, description: c.description, due: '', points: c.points, score: null, done: false, kind: 'demonstrate', origin: 'ai', locked: false, rubric: c.rubric, work: null, purpose: '', materials: S.labelFiction(c.materials), steps: [], format: c.format, basis: 'portfolio', portfolioNote: c.portfolioNote || '', realEvidence: false, portfolio: false, capstone: true, parts: c.parts, submit: c.submit, criteria: [], estimate: c.estimate,
      packet: { state: plan.length ? 'required' : 'incomplete', plan, at: now(), model: '', upgraded: false, note: plan.length ? '' : 'The AI did not say which exhibits the capstone needs.' } };
    const cap = S.makeCapstone({ title: c.title, overview: 'The culminating project for ' + course.title + '.', objectives: c.prepares.objectives, origin: 'ai', status: 'incomplete', weight: 20, createdAt: now(), note: '',
      prepares: { modules: (c.prepares.modules || []).map((x) => ({ id: (course.modules[x.n - 1] || {}).id || '', why: x.why })), objectives: c.prepares.objectives, skills: c.prepares.skills }, assignments: [a] });
    return { cap, usage: r.usage };
  };
  // Saves an approved draft as the course's capstone (never over one that already has submitted work).
  ai.adoptCapstone = function (course, draft) {
    if (!S.state.courses.includes(course)) throw new AIError('gone', 'That course was removed.');
    const old = course.capstone && course.capstone.assignments[0];
    if (old && old.work) throw new AIError('bad_input', 'This capstone already has submitted work, so it is never replaced.');
    course.capstone = draft.cap; S.save();
    return course.capstone;
  };
  // Builds whatever the capstone is still missing (its exhibits) and sets ready or incomplete honestly. Safe to repeat: this is also the recovery action.
  ai.finishCapstone = async function (course, o) {
    o = o || {};
    const cap = course.capstone, a = cap && cap.assignments[0];
    if (!a) throw new AIError('bad_input', 'There is no capstone page to finish. Create the capstone first.');
    let missing = 0;
    try { if (!a.work) missing = (await ai.buildPackets(course, cap, { signal: o.signal, onStep: o.onStep || (() => {}) })).missing; }
    catch (e) { cap.status = ai.capstoneComplete(cap) ? 'ready' : 'incomplete'; cap.note = e.message; S.save(); throw e; }
    const ok = ai.capstoneComplete(cap);
    cap.status = ok ? 'ready' : 'incomplete';
    cap.note = ok ? '' : 'The capstone page is written but its exhibits are not all built yet' + (a.packet && a.packet.note ? ' (' + a.packet.note + ')' : '') + '. Choose “Finish the capstone” to try again.';
    S.save();
    return { ok, missing };
  };
  // One call for the whole job (new course build, or "Create a capstone" after the preview). Failures leave a visible incomplete record, never a half-ready one.
  ai.createCapstone = async function (course, o) {
    o = o || {};
    if (!course.capstone || !course.capstone.assignments[0] || !course.capstone.assignments[0].parts.length) {
      let draft;
      try { draft = o.draft || await ai.draftCapstone(course, o); }
      catch (e) { if (!course.capstone) { course.capstone = S.makeCapstone({ title: 'Course capstone', origin: 'ai', status: 'incomplete', weight: 20, createdAt: now(), note: e.message, assignments: [] }); S.save(); } else { course.capstone.note = e.message; S.save(); } throw e; }
      ai.adoptCapstone(course, draft);
    }
    return ai.finishCapstone(course, o);
  };

  // Phase 1: outline (saved immediately as a partial course). Phase 2: materials, one module at a time.
  ai.build = async function (brief, run) {
    const set = (patch) => { Object.assign(run, patch); S.render(false); };
    set({ phase: 'running', steps: [{ label: 'Designing your course outline', state: 'active' }], msg: '', courseId: null });
    await ai.requireCurrent();
    const out = await ai.call('/outline', brief, { signal: run.ctl.signal });
    const course = courseFromOutline(out.outline, { ...(out.brief || brief), startDate: brief.startDate });
    course.ai.usage.push(usageRow(out.usage));
    S.state.courses.push(course); S.state.setup = true; S.save();
    run.courseId = course.id;
    const queries = out.outline.modules.map((m) => m.searchQueries || []);
    set({ steps: [{ label: 'Course outline saved', state: 'done' }].concat(course.modules.map((m, i) => ({ label: 'Materials and assignments: ' + m.title, state: i === 0 ? 'active' : 'todo' })), [{ label: 'Course capstone', state: 'todo' }]) });

    const STOP = ['budget', 'global_limit', 'ip_limit', 'hour_limit', 'day_limit', 'bad_code', 'locked', 'not_configured', 'no_code', 'cancelled', 'upstream_auth', 'bad_model'];
    let problem = '', problemCode = '', missing = 0, detailsMissing = 0, packetsMissing = 0;
    for (let i = 0; i < course.modules.length; i++) {
      run.steps[i + 1].state = 'active'; set({});
      try {
        let r = await ai.findMaterials(course, course.modules[i], { queries: queries[i], signal: run.ctl.signal });
        if (r.missing) r = await ai.findMaterials(course, course.modules[i], { queries: queries[i], signal: run.ctl.signal }); // one automatic second try
        if (r.missing) r = await ai.findMaterials(course, course.modules[i], { queries: [course.title + ' ' + course.modules[i].title + ' introduction university', course.modules[i].title + ' open access reading'], signal: run.ctl.signal }); // third and last try, with different search words
        run.steps[i + 1].state = r.missing ? 'warn' : 'done'; if (r.missing) missing++;
        for (let tryN = 0; tryN < 2; tryN++) { // one automatic second try if the first answer was incomplete
          try { const d = await ai.writeDetails(course, course.modules[i], course.modules[i].assignments.filter((a) => !a.parts.length), { signal: run.ctl.signal }); if (d.done >= d.total) break; if (tryN) detailsMissing++; }
          catch (e) { if (STOP.includes(e.code)) throw e; if (tryN) detailsMissing++; }
        }
        const label = run.steps[i + 1].label;
        try {
          const pk = await ai.buildPackets(course, course.modules[i], { signal: run.ctl.signal, onStep: (t) => { run.steps[i + 1].label = t; set({}); } });
          packetsMissing += pk.missing; if (pk.missing && run.steps[i + 1].state === 'done') run.steps[i + 1].state = 'warn';
        } catch (e) { if (e.packetsMissing) packetsMissing += e.packetsMissing; throw e; }
        finally { run.steps[i + 1].label = label; }
      } catch (e) {
        run.steps[i + 1].state = 'fail'; problem = e.message; problemCode = e.code || '';
        if (STOP.includes(e.code)) { for (let j = i + 1; j < course.modules.length; j++) run.steps[j + 1].state = 'skipped'; break; }
      }
      set({});
    }
    const capIdx = course.modules.length + 1; let capProblem = '';
    if (run.steps[capIdx].state === 'todo' && STOP.includes(problemCode)) { run.steps[capIdx].state = 'skipped'; capProblem = 'The build stopped before the capstone was written.'; }
    else {
      run.steps[capIdx].state = 'active'; set({});
      try {
        const cr = await ai.createCapstone(course, { signal: run.ctl.signal, onStep: (t) => { run.steps[capIdx].label = t; set({}); } });
        run.steps[capIdx].label = 'Course capstone'; run.steps[capIdx].state = cr.ok ? 'done' : 'warn'; if (!cr.ok) capProblem = course.capstone.note;
      } catch (e) { run.steps[capIdx].label = 'Course capstone'; run.steps[capIdx].state = 'fail'; capProblem = e.message; }
    }
    set({});
    const failed = run.steps.slice(1, capIdx).filter((s) => s.state === 'fail' || s.state === 'skipped').length;
    course.ai.status = failed || detailsMissing || packetsMissing || capProblem ? 'partial' : 'complete'; // missing assignment pages count as incomplete, so the person is told rather than shown "ready"
    course.ai.note = failed
      ? failed + ' of ' + course.modules.length + ' modules still need learning materials (' + problem + ') Open a module and choose “Find materials with AI” to try again, or add your own.'
      : [missing ? missing + ' module' + (missing === 1 ? '' : 's') + ' had no verifiable source; they are marked “Source needed”.' : '', detailsMissing ? detailsMissing + ' module' + (detailsMissing === 1 ? '' : 's') + ' still need their assignment details: open the assignment and choose “Write full assignment with AI”.' : '', packetsMissing ? packetsMissing + ' assignment' + (packetsMissing === 1 ? '' : 's') + ' still need their exhibits (the case files, documents and data the work is built on): open the assignment, choose Materials, then “Build the exhibits with AI”.' : '', capProblem ? 'The course capstone is not finished (' + capProblem.replace(/[. ]+$/, '') + '). Open the Modules page and choose “Finish the capstone”.' : ''].filter(Boolean).join(' ');
    S.save();
    set({ phase: 'done', courseId: course.id, problem: course.ai.status === 'partial' ? course.ai.note : '' });
    return course;
  };

  ai.clarify = async function (brief, signal) {
    const r = await ai.call('/clarify', { topic: brief.topic, level: brief.level, goal: brief.goal }, { signal });
    return r.questions || [];
  };
})(window.Sovereign = window.Sovereign || {});
