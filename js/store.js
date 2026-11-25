/* sovereign. — data layer: courses/modules/assignments, localStorage, validation, import/export, starter content. */
(function (S) {
  'use strict';

  S.BUILD = 33; // matches the number at the end of CACHE in sw.js; shown on Data & Backup so you can tell which version is running
  const KEY = 'sovereign.aioff.v3';
  const OLD_KEYS = []; // earlier versions; migrated, never deleted automatically
  S.MAX_IMPORT_BYTES = 2 * 1024 * 1024;

  // Course design templates (presentation only). The id is saved on each course as designTheme.
  S.THEMES = [
    ['modernist', 'The Modernist', 'Swiss grotesk, stacked titles, graphic blocks.'],
    ['editorial', 'The Editorial', 'High-contrast serif with elegant italics.'],
    ['intellectual', 'The Intellectual', 'Monumental serif with cobalt accents.'],
    ['institution', 'The Institution', 'Roman capitals on oxblood, hairline rules.'],
  ];
  S.randomTheme = () => {
    let n; try { const a = new Uint32Array(1); crypto.getRandomValues(a); n = a[0]; } catch (e) { n = Math.floor(Math.random() * 4294967296); }
    return S.THEMES[n % S.THEMES.length][0];
  };
  S.COLORS = ['#681632', '#073e35', '#2643d8', '#101b32', '#6687a1', '#3b4f9a'];
  S.READING_KINDS = [['', 'Other'], ['article', 'Article'], ['book', 'Book'], ['video', 'Video'], ['course', 'Course'], ['tool', 'Tool'], ['document', 'Document'], ['podcast', 'Podcast']];
  S.ACCESS = [['unknown', 'Access unknown'], ['free', 'Free'], ['paid', 'Paid']];
  S.VERIFY = ['not-checked', 'reachable', 'unreachable', 'blocked', 'broken'];
  S.WORK_STATUS = [['not-started', 'Not started'], ['in-progress', 'In progress'], ['completed', 'Completed']];
  S.CRED_STATUS = [['considering', 'Considering'], ['in-progress', 'In progress'], ['earned', 'Earned'], ['not-applicable', 'Not applicable']];
  S.SOURCE_TYPES = [['', ''], ['university', 'University'], ['government', 'Government'], ['open', 'Open / archive'], ['publisher', 'Publisher'], ['web', 'Web']];
  S.label = (list, v) => (list.find((x) => x[0] === v) || [, v])[1];

  S.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  S.storageOK = true;
  S.loadWarning = '';
  S.ui = { edit: null, tab: 'next', cal: '', open: new Set(), dataMsg: null };
  S.state = { version: 3, setup: false, courses: [], name: '' };

  /* ----- small helpers ----- */

  // Returns a clean http(s) URL, '' for empty input, or null if invalid.
  S.cleanUrl = function (input) {
    const t = String(input || '').trim();
    if (!t) return '';
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : 'https://' + t);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch (e) { return null; }
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  S.todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  S.validDate = function (s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const d = new Date(s + 'T00:00:00');
    return !isNaN(d) && pad2(d.getMonth() + 1) === s.slice(5, 7) ? s : '';
  };
  S.fmtDate = function (s) {
    const d = new Date(s + 'T00:00:00');
    const opts = { month: 'short', day: 'numeric' };
    if (s.slice(0, 4) !== String(new Date().getFullYear())) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  };

  const str = (v, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const arr = (v, max = 500) => (Array.isArray(v) ? v.slice(0, max) : []);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const oneOf = (v, list, d) => (list.some((x) => x[0] === v) ? v : d);
  const strs = (v, n, max) => arr(v, n).map((x) => str(x, max).trim()).filter(Boolean);
  const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) && n >= 0 && n <= 1e6 ? n : null; };

  /* ----- validation / normalisation (used for stored data AND imported files) ----- */

  // Readings keep the original fields; AI-found ones add provenance. Verification (did a check run?) is stored
  // separately from relevance (an AI opinion about fit), and neither is ever shown as human review.
  function normReading(r, id, url) {
    const v = obj(r.verification);
    const out = { id: id(r.id), title: str(r.title, 300) || 'Untitled reading', url: url(r.url), note: str(r.note), done: r.done === true };
    if (r.source === 'ai' || r.source === 'placeholder') {
      out.source = r.source;
      out.kind = oneOf(r.kind, S.READING_KINDS, '');
      out.creator = str(r.creator, 300);
      out.access = oneOf(r.access, S.ACCESS, 'unknown');
      out.sourceType = oneOf(r.sourceType, S.SOURCE_TYPES, '');
      out.derivedFrom = str(r.derivedFrom, 300);
      out.derivedUrl = url(r.derivedUrl);
      out.relevance = str(r.relevance, 1000);
      out.verification = {
        status: S.VERIFY.includes(v.status) ? v.status : 'not-checked',
        checkedAt: str(v.checkedAt, 40), pageTitle: str(v.pageTitle, 300),
        titleMatch: v.titleMatch === true ? true : v.titleMatch === false ? false : null,
        finalUrl: url(v.finalUrl), detail: str(v.detail, 300),
      };
      if (r.source === 'placeholder') out.url = '';
      const cc = obj(r.contentCheck);
      if (['matched', 'about', 'mismatch', 'unreadable'].includes(cc.status)) out.contentCheck = { status: cc.status, detail: str(cc.detail, 300), checkedAt: str(cc.checkedAt, 40) };
    }
    return out;
  }

  // Validate one reading object on its own (used when AI-found materials are added to an existing module).
  S.makeReading = (r) => normReading(obj(r), (v) => str(v, 60) || S.uid(), (v) => S.cleanUrl(str(v, 2000)) || '');

  // A syllabus from another course, kept apart from readings. The AI can later source its assigned readings into the module.
  function normSyllabus(y, id, url) {
    y = obj(y); const v = obj(y.verification);
    return {
      id: id(y.id), title: str(y.title, 300) || 'Untitled syllabus', url: url(y.url), note: str(y.note, 300), source: y.source === 'ai' ? 'ai' : 'user',
      sourceType: oneOf(y.sourceType, S.SOURCE_TYPES, ''),
      verification: { status: S.VERIFY.includes(v.status) ? v.status : 'not-checked', checkedAt: str(v.checkedAt, 40), pageTitle: str(v.pageTitle, 300), titleMatch: v.titleMatch === true ? true : v.titleMatch === false ? false : null, finalUrl: url(v.finalUrl), detail: str(v.detail, 300) },
      sourcedAt: str(y.sourcedAt, 40), sourcedCount: num(y.sourcedCount) || 0,
    };
  }
  S.makeSyllabus = (y) => normSyllabus(y, (v) => str(v, 60) || S.uid(), (v) => S.cleanUrl(str(v, 2000)) || '');

  // Feedback from an AI review of submitted work. The score is an automated assessment, not a human grade.
  // Reviews made by Worker v14 and later add evidence-linked findings, an account of what could be inspected, and follow-ups. Those
  // fields are only present on new reviews; earlier saved feedback is read exactly as before and is never rewritten.
  S.FINDING_TYPES = ['strength', 'error', 'missing', 'partial', 'clarity', 'optional', 'unverified'];
  const inList = (v, list, d) => (list.includes(v) ? v : d);
  function normFinding(f) {
    f = obj(f); if (!str(f.claim, 700).trim()) return null;
    return { type: inList(f.type, S.FINDING_TYPES, 'optional'), criterion: str(f.criterion, 200), claim: str(f.claim, 700), quote: str(f.quote, 300), where: str(f.where, 120), alreadyPresent: str(f.alreadyPresent, 300), fix: str(f.fix, 700), example: str(f.example, 700),
      exampleSource: inList(f.exampleSource, ['supplied', 'illustrative', 'none'], 'none'), located: f.located === true ? true : f.located === false ? false : null, note: str(f.note, 300), caution: str(f.caution, 300), illustrative: f.illustrative === true,
      ref: f.ref && typeof f.ref === 'object' && /^(?:[A-F]|U[1-5])$/.test(f.ref.exhibit || '') ? { exhibit: f.ref.exhibit, row: str(f.ref.row, 20), column: str(f.ref.column, 60) } : null };
  }
  function normFeedback(f) {
    f = obj(f);
    if (!f.at && !f.summary) return null;
    const v2 = obj(f.context).schema === 2, ins = obj(f.inspection), ctx = obj(f.context);
    return {
      summary: str(f.summary, 3000), strengths: strs(f.strengths, 8, 600), improvements: strs(f.improvements, 8, 800), nextSteps: strs(f.nextSteps, 8, 600),
      criteria: arr(f.criteria, 10).map((k) => { k = obj(k); const o = { name: str(k.name, 200) || 'Criterion', max: num(k.max) || 0, score: num(k.score) || 0, comment: str(k.comment, 800) }; if (v2) { o.status = inList(k.status, ['met', 'partly', 'not-met', 'not-assessed'], 'partly'); o.assessed = k.assessed !== false; o.adjusted = str(k.adjusted, 300); } return o; }),
      score: num(f.score) || 0, max: num(f.max) || 0, model: str(f.model, 60), at: str(f.at, 40), cost: num(f.cost) || 0,
      // Which learner dataset version this review was given (Phase 2D). Kept so the review can always be explained; absent on every older review.
      ...(obj(f.data).versionId ? { data: { datasetId: str(f.data.datasetId, 40), versionId: str(f.data.versionId, 40), sent: strs(f.data.sent, 5, 120), rows: num(f.data.rows) || 0, chars: num(f.data.chars) || 0, at: str(f.data.at, 40), removed: f.data.removed === true } } : {}),
      ...(v2 ? {
        findings: arr(f.findings, 14).map(normFinding).filter(Boolean),
        inspection: { received: str(ins.received, 400), couldNotInspect: strs(ins.couldNotInspect, 8, 300), facts: strs(ins.facts, 6, 500), limited: ins.limited === true },
        followUp: arr(f.followUp, 12).map((x) => { x = obj(x); return { claim: str(x.claim, 400), status: inList(x.status, ['addressed', 'partly', 'not-addressed', 'cannot-tell'], 'cannot-tell'), note: str(x.note, 400) }; }).filter((x) => x.claim),
        context: { schema: 2, mode: inList(ctx.mode, ['graded', 'practice', 'own'], 'graded'), compared: inList(ctx.compared, ['both-versions', 'findings-only', 'none'], 'none'), steps: ctx.steps === true, materials: ctx.materials === true, keyIdeas: ctx.keyIdeas === true, readings: inList(ctx.readings, ['titles-only', 'none'], 'none') },
      } : (f.legacyWorker === true ? { legacyWorker: true } : {})),
    };
  }
  // One submission: typed text and/or a file. The file itself lives in IndexedDB (device only); only its details are kept here.
  function normSub(x) {
    x = obj(x);
    if (!x.at) return null;
    return { text: str(x.text, 30000), fileId: str(x.fileId, 60), fileName: str(x.fileName, 200), fileType: str(x.fileType, 100), fileSize: num(x.fileSize) || 0, at: str(x.at, 40), late: x.late === true, feedback: normFeedback(x.feedback) };
  }
  // Office hours: optional practice feedback on material the learner chose. Up to two rounds, never graded.
  // Learner datasets (Phase 2D). Only small descriptive records live here; the rows and the original file are in IndexedDB (js/mydata.js).
  function normMyData(v) {
    v = obj(v);
    const vers = arr(v.versions, 20).map((x) => { x = obj(x); const s = obj(x.source); return { id: str(x.id, 40), at: str(x.at, 40), note: str(x.note, 200), source: { name: str(s.name, 200), size: Math.min(Math.max(Number(s.size) || 0, 0), 2e7), type: str(s.type, 100), fileId: str(s.fileId, 60) }, dataKey: str(x.dataKey, 60), sheets: arr(x.sheets, 5).map((y) => { y = obj(y); return { name: str(y.name, 120), exhibitId: str(y.exhibitId, 8), rows: num(y.rows) || 0, cols: num(y.cols) || 0 }; }), left: strs(x.left, 20, 400), notes: strs(x.notes, 20, 400) }; }).filter((x) => x.id && x.dataKey);
    if (!vers.length) return null;
    const cur = str(v.currentId, 40);
    return { id: str(v.id, 40) || vers[0].id, currentId: vers.some((x) => x.id === cur) ? cur : '', versions: vers };
  }
  function normOffice(o) {
    o = obj(o);
    const rounds = arr(o.rounds, 2).map(normSub).filter(Boolean);
    const data = normMyData(o.data); // optional learner data kept with the session (2D); absent on every older session
    if (!rounds.length && !data) return null;
    return { material: str(o.material, 500), mode: o.mode === 'practice' ? 'practice' : o.mode === '' && !rounds.length ? '' : 'own', rounds, ...(data ? { data } : {}) }; // saved sessions from before the two modes were always "own material"
  }
  // What is kept of the FIRST review once a resubmission becomes the final grade (Phase 4A). Only real saved facts: when, the score, the rubric results and the
  // findings. It is never made up for older records, and it never decides the grade (the final review stays authoritative).
  function normFirstSummary(x) {
    x = obj(x); if (!x.at) return null;
    return { at: str(x.at, 40), late: x.late === true, score: num(x.score) || 0, max: num(x.max) || 0, model: str(x.model, 60), summary: str(x.summary, 800),
      criteria: arr(x.criteria, 10).map((k) => { k = obj(k); return { name: str(k.name, 200) || 'Criterion', max: num(k.max) || 0, score: num(k.score) || 0, status: inList(k.status, ['met', 'partly', 'not-met', 'not-assessed', ''], ''), assessed: k.assessed !== false, comment: str(k.comment, 400) }; }),
      findings: arr(x.findings, 14).map((f) => { f = obj(f); return { type: inList(f.type, S.FINDING_TYPES, 'optional'), criterion: str(f.criterion, 200), claim: str(f.claim, 700), quote: str(f.quote, 300), where: str(f.where, 120), located: f.located === true ? true : f.located === false ? false : null, fix: str(f.fix, 400) }; }).filter((f) => f.claim) };
  }
  function normWork(w) {
    w = obj(w);
    const first = normSub(w.first), final = normSub(w.final);
    if (!first && !final) return null;
    const phase = final ? 'final' : 'reviewed';
    const fs = final ? normFirstSummary(w.firstSummary) : null;
    return { phase, deadline: str(w.deadline, 40), first: final ? null : first, final, ...(fs ? { firstSummary: fs } : {}) };
  }
  // Earlier versions of an assignment's wording, kept when the person approves an AI revision so it can be restored. Wording only: points, rubric, work and grades are never part of it.
  const normParts = (v) => arr(v, 8).map((p) => { p = obj(p); return { title: str(p.title, 120).trim(), questions: strs(p.questions, 8, 500) }; }).filter((p) => p.title || p.questions.length);
  function normRevisions(v) {
    return arr(v, 5).map((r) => { r = obj(r); const b = obj(r.before); return { at: str(r.at, 40), note: str(r.note, 300), readings: strs(r.readings, 5, 300), before: { description: str(b.description), parts: normParts(b.parts), materials: str(b.materials) } }; }).filter((r) => r.at);
  }

  // Evidence packet bookkeeping (Phase 2A). The exhibits themselves are sanitized by S.exhibits; this keeps what was planned and when.
  function normPacket(p) {
    p = obj(p); if (!p.state && !p.at && !arr(p.plan).length) return null;
    return { state: inList(p.state, ['required', 'ready', 'incomplete', 'declined'], 'incomplete'), at: str(p.at, 40), model: str(p.model, 60), upgraded: p.upgraded === true, note: str(p.note, 300),
      plan: arr(p.plan, 6).map((x) => { x = obj(x); return { title: str(x.title, 120), type: inList(x.type, ['table', 'timeline', 'document', 'chart'], 'document'), purpose: str(x.purpose, 300) }; }).filter((x) => x.title) };
  }

  function normRubric(r) {
    return arr(r, 10).map((k) => { k = obj(k); return { name: str(k.name, 200), max: num(k.max) || 0 }; }).filter((k) => k.name && k.max > 0);
  }

  function normAI(a) {
    a = obj(a);
    if (a.generated !== true) return null;
    const b = obj(a.brief);
    return {
      generated: true, createdAt: str(a.createdAt, 40), status: a.status === 'partial' ? 'partial' : 'complete',
      note: str(a.note, 500),
      brief: { topic: str(b.topic, 200), level: str(b.level, 40), goal: str(b.goal, 60), goalText: str(b.goalText, 300), hours: num(b.hours), weeks: num(b.weeks), extra: str(b.extra, 600) },
      usage: arr(a.usage, 200).map((u) => { u = obj(u); return { step: str(u.step, 40), model: str(u.model, 60), inTok: num(u.inTok) || 0, outTok: num(u.outTok) || 0, searches: num(u.searches) || 0, cost: num(u.cost) || 0, at: str(u.at, 40) }; }),
    };
  }

  // One module record (also used for the capstone, which is a module-shaped record with exactly one assignment).
  function normModule(m, id, url) {
    m = obj(m);
    return {
      id: id(m.id), title: str(m.title, 200) || 'Untitled module', overview: str(m.overview),
      keyIdeas: str(m.keyIdeas), reflection: str(m.reflection), complete: m.complete === true,
      syllabi: arr(m.syllabi, 10).map((y) => normSyllabus(y, id, url)),
      objectives: strs(m.objectives, 12, 400), selfCheck: strs(m.selfCheck, 12, 400), duration: str(m.duration, 60),
      origin: m.origin === 'ai' ? 'ai' : 'user', edited: m.edited === true,
      readings: arr(m.readings).map((r) => { r = obj(r); return normReading(r, id, url); }),
      extras: arr(m.extras, 50).map((x) => { x = obj(x); return { id: id(x.id), title: str(x.title, 200) || 'Untitled section', body: str(x.body) }; }),
      assignments: arr(m.assignments).map((a) => {
        a = obj(a);
        return { id: id(a.id), title: str(a.title, 300) || 'Untitled assignment', description: str(a.description), due: S.validDate(str(a.due, 10)), points: num(a.points), score: num(a.score), done: a.done === true, kind: ['learn', 'apply', 'demonstrate'].includes(a.kind) ? a.kind : '', origin: a.origin === 'ai' ? 'ai' : 'user', locked: a.locked === true && !!S.validDate(str(a.due, 10)), rubric: normRubric(a.rubric), work: normWork(a.work),
          purpose: str(a.purpose, 2000), materials: str(a.materials, 6000), steps: strs(a.steps, 12, 500), format: ['text', 'pdf', 'image', 'file', 'any'].includes(a.format) ? a.format : '', basis: ['readings', 'scenario', 'portfolio'].includes(a.basis) ? a.basis : '', portfolioNote: str(a.portfolioNote, 500), realEvidence: a.realEvidence === true, evidence: (a.evidence && typeof a.evidence === 'object' && ['verified', 'needed'].includes(a.evidence.status)) ? { status: a.evidence.status, sources: (Array.isArray(a.evidence.sources) ? a.evidence.sources : []).slice(0, 8).map((s) => ({ title: str(s && s.title, 300), url: url(s && s.url) })).filter((s) => s.title) } : null, portfolio: a.portfolio === true, ...(a.capstone === true ? { capstone: true } : {}), office: normOffice(a.office), ...(a.myData ? (() => { const md = normMyData(a.myData); return md ? { myData: md } : {}; })() : {}), revisions: normRevisions(a.revisions), exhibits: S.exhibits.sanitize(a.exhibits).exhibits, packet: normPacket(a.packet),
          parts: arr(a.parts, 8).map((p) => { p = obj(p); return { title: str(p.title, 120).trim(), questions: strs(p.questions, 8, 500) }; }).filter((p) => p.title || p.questions.length), submit: str(a.submit, 1000), criteria: strs(a.criteria, 8, 300), estimate: str(a.estimate, 60) };
      }),
    };
  }

  // The standalone course capstone (Phase 3). A module-shaped record kept OUTSIDE course.modules, so module grids, module stats and the
  // module-average grade never see it by accident. Absent on every existing course until the learner opts in or a new AI course is built.
  function normCapstone(x, id, url) {
    x = obj(x);
    const base = normModule(x, id, url);
    base.assignments = base.assignments.slice(0, 1).map((a) => ({ ...a, kind: 'demonstrate', capstone: true }));
    const st = x.status === 'ready' && base.assignments.length ? 'ready' : 'incomplete'; // no assignment means it is not ready, whatever was claimed
    const wt = Number(x.weight), p = obj(x.prepares);
    return { ...base, complete: false, status: st, weight: Number.isFinite(wt) && wt >= 0 && wt <= 100 ? Math.round(wt * 10) / 10 : 20, createdAt: str(x.createdAt, 40), note: str(x.note, 500),
      prepares: { modules: arr(p.modules, 100).map((q) => { q = obj(q); return { id: str(q.id, 60), why: str(q.why, 300) }; }).filter((q) => q.id), objectives: strs(p.objectives, 12, 400), skills: strs(p.skills, 12, 200) } };
  }

  S.makeCapstone = (x) => normCapstone(x, (v) => str(v, 60) || S.uid(), (v) => S.cleanUrl(str(v, 2000)) || '');

  // Per-course export preferences (Phase 4B). Configuration only: which pieces, in what order, paper, optional text the learner chose to keep. Never copies submitted work.
  function normPub(x) {
    x = obj(x); const notes = {}, nsrc = obj(x.notes);
    Object.keys(nsrc).slice(0, 60).forEach((k) => { const v = str(nsrc[k], 1500); if (v.trim()) notes[str(k, 60)] = v; });
    const out = { mode: x.mode === 'professional' ? 'professional' : 'academic', size: x.size === 'a4' ? 'a4' : 'letter', grades: x.grades === true,
      include: Array.isArray(x.include) ? [...new Set(x.include.map((v) => str(v, 60)).filter(Boolean))].slice(0, 80) : null,
      intro: str(x.intro, 3000), closing: str(x.closing, 2000), notes, remember: x.remember === true };
    if (!out.remember) { out.intro = ''; out.closing = ''; out.notes = {}; } // text is only kept when the learner chose to keep it
    return out;
  }

  function normCourse(c, i) {
    c = obj(c);
    const seen = new Set();
    const id = (v) => { let x = str(v, 60); if (!x || seen.has(x)) x = S.uid(); seen.add(x); return x; };
    const url = (v) => S.cleanUrl(str(v, 2000)) || '';
    const w = obj(c.work);
    return {
      id: id(c.id),
      code: str(c.code, 20).trim() || 'COURSE',
      title: str(c.title, 200) || 'Untitled course',
      description: str(c.description),
      objective: str(c.objective),
      deliverable: str(c.deliverable),
      syllabus: str(c.syllabus),
      outcomes: strs(c.outcomes, 12, 400), duration: str(c.duration, 80), pathway: str(c.pathway, 300),
      licensureNote: str(c.licensureNote, 1000), ai: normAI(c.ai), startDate: S.validDate(str(c.startDate, 10)),
      color: Number.isInteger(c.color) && c.color >= 0 && c.color < S.COLORS.length ? c.color : (i || 0) % S.COLORS.length,
      designTheme: S.THEMES.some((t) => t[0] === c.designTheme) ? c.designTheme : S.THEMES[(((Number.isInteger(c.color) ? c.color : (i || 0)) % 4) + 4) % 4][0],
      announcements: arr(c.announcements, 200).map((a) => { a = obj(a); return { id: id(a.id), title: str(a.title, 300) || 'Untitled announcement', body: str(a.body), date: S.validDate(str(a.date, 10)) || S.todayISO() }; }),
      modules: arr(c.modules, 100).map((m) => normModule(m, id, url)),
      credentials: arr(c.credentials, 100).map((k) => {
        k = obj(k);
        return { id: id(k.id), name: str(k.name, 300) || 'Untitled credential', issuer: str(k.issuer, 300), url: url(k.url), note: str(k.note), status: oneOf(k.status, S.CRED_STATUS, 'considering'), requirement: k.requirement === 'required' || k.requirement === 'suggested' ? k.requirement : '', origin: k.origin === 'ai' ? 'ai' : 'user' };
      }),
      ...(c.capstone ? (() => { const k = normCapstone(c.capstone, id, url); return k ? { capstone: k } : {}; })() : {}),
      ...(c.pub ? { pub: normPub(c.pub) } : {}),
      work: { title: str(w.title, 200), criteria: strs(w.criteria, 12, 400), description: str(w.description), reflection: str(w.reflection), status: oneOf(w.status, S.WORK_STATUS, 'not-started'), url: url(w.url) },
    };
  }

  // Convert a v1/v2 "curriculum" into the v3 course shape (before normCourse cleans it).
  function fromV2(c) {
    c = obj(c);
    const words = str(c.title, 200).split(/\s+/).filter(Boolean);
    const initials = (words.length > 1 ? words.slice(0, 3).map((w) => w[0]).join('') : str(c.title, 4)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return {
      id: c.id, code: (initials || 'COURSE') + ' 101', title: c.title, description: c.objective, objective: c.objective, deliverable: c.deliverable,
      modules: arr(c.modules).map((m) => {
        m = obj(m);
        return {
          id: m.id, title: m.title, overview: m.summary, readings: arr(m.resources),
          assignments: arr(m.assignments).map((a) => {
            a = obj(a);
            const t = str(a.text).trim(), first = t.split('\n')[0];
            return { id: a.id, title: first.length > 90 ? first.slice(0, 87) + '…' : first, description: t.length > first.length || first.length > 90 ? t : '', done: a.done };
          }),
        };
      }),
      credentials: c.credentials, work: c.work,
    };
  }

  // Accepts v3 files ({courses}), v2 files ({curricula}) and v1 prototype files ({curriculum, modules, finalProject}).
  S.normalize = function (d) {
    d = obj(d);
    if (d.app && d.app !== 'sovereign') throw new Error('This file was not created by Sovereign.');
    let list;
    if (Array.isArray(d.courses)) list = d.courses;
    else if (Array.isArray(d.curricula)) list = d.curricula.map(fromV2);
    else if (Array.isArray(d.modules)) {
      const fp = obj(d.finalProject);
      list = d.curriculum ? [fromV2({
        ...obj(d.curriculum), modules: d.modules,
        work: { description: fp.description, url: fp.url, status: fp.done === true ? 'completed' : (fp.description ? 'in-progress' : 'not-started') },
      })] : [];
    } else throw new Error('This file doesn’t look like a Sovereign backup.');
    const courses = list.slice(0, 30).map(normCourse);
    return { version: 3, setup: courses.length > 0 || d.setup === true, courses, name: str(d.name, 60).trim() };
  };

  /* ----- storage ----- */

  S.load = function () {
    let raw = null, old = false;
    try {
      raw = localStorage.getItem(KEY);
      for (let i = 0; !raw && i < OLD_KEYS.length; i++) { raw = localStorage.getItem(OLD_KEYS[i]); old = !!raw; }
    } catch (e) { S.storageOK = false; return; }
    if (!raw) return;
    try { S.state = S.normalize(JSON.parse(raw)); if (old) S.save(); }
    catch (e) {
      try { localStorage.setItem(KEY + '.unreadable', raw); } catch (_) { /* ignore */ }
      S.loadWarning = 'Your saved data could not be read, so Sovereign started fresh. A copy of the unreadable data was kept in this browser.';
    }
  };

  S.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(S.state)); S.storageOK = true; }
    catch (e) { S.storageOK = false; }
  };

  S.clearAll = function () {
    try { [KEY, ...OLD_KEYS, KEY + '.unreadable'].forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    S.state = { version: 3, setup: false, courses: [], name: '' };
    S.loadWarning = '';
    S.ui.open.clear();
  };

  S.exportText = () => JSON.stringify({ app: 'sovereign', exportedAt: new Date().toISOString(), ...S.state }, null, 2);

  S.parseImport = function (text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('That file isn’t valid JSON, so it can’t be a Sovereign backup.'); }
    return S.normalize(data);
  };

  /* ----- lookups ----- */

  S.course = (id) => S.state.courses.find((c) => c.id === id) || null;
  S.allModules = () => S.state.courses.flatMap((c) => c.modules.map((m) => ({ c, m })));
  S.allAssignments = () => S.allModules().flatMap(({ c, m }) => m.assignments.map((a) => ({ c, m, a })));

  // Unfinished assignments, soonest due date first; undated ones last.
  S.upNext = function () {
    return S.allAssignments().filter((x) => !x.a.done).map((x, i) => ({ ...x, i }))
      .sort((p, q) => (p.a.due && q.a.due ? p.a.due.localeCompare(q.a.due) : p.a.due ? -1 : q.a.due ? 1 : 0) || p.i - q.i);
  };

  /* ----- stats ----- */

  S.moduleStats = function (m) {
    const items = m.readings.length + m.assignments.length;
    const done = m.readings.filter((r) => r.done).length + m.assignments.filter((a) => a.done).length;
    return { items, done, pct: m.complete ? 100 : items ? Math.round((done / items) * 100) : 0 };
  };
  S.courseStats = function (c) {
    const mods = c.modules.length, done = c.modules.filter((m) => m.complete).length;
    return { mods, done, pct: mods ? Math.round((done / mods) * 100) : 0 };
  };
  S.pctOf = (a) => (a.points > 0 && a.score != null ? Math.round((a.score / a.points) * 1000) / 10 : null);
  // Letter equivalent of a percentage (a plain, common scale; shown next to the points, never instead of them).
  S.letter = function (pct) {
    if (pct == null) return '';
    const t = [[93, 'A'], [90, 'A−'], [87, 'B+'], [83, 'B'], [80, 'B−'], [77, 'C+'], [73, 'C'], [70, 'C−'], [67, 'D+'], [63, 'D'], [60, 'D−']];
    return (t.find((x) => pct >= x[0]) || [0, 'F'])[1];
  };

  /* ----- submissions: review rounds, the 72-hour window, and finalizing ----- */

  S.REVIEW_HOURS = 72;
  S.dueEnd = (a) => (a.due ? new Date(a.due + 'T23:59:59').getTime() : null); // due at the end of the due day, local time
  S.isLate = (a, atMs) => { const d = S.dueEnd(a); return d != null && atMs > d; };
  S.hoursLeft = (a, nowMs) => (a.work && a.work.deadline ? (new Date(a.work.deadline).getTime() - (nowMs || Date.now())) / 3600000 : null);

  // A compact, real record of a review (when, score, rubric results, findings), taken from the saved submission. Returns null when there is no review to summarise.
  S.summarizeReview = function (sub) {
    const fb = sub && sub.feedback; if (!fb || !sub.at) return null;
    return normFirstSummary({ at: sub.at, late: sub.late === true, score: fb.score, max: fb.max, model: fb.model, summary: fb.summary, criteria: fb.criteria,
      findings: (fb.findings || []).map((f) => ({ type: f.type, criterion: f.criterion, claim: f.claim, quote: f.quote, where: f.where, located: f.located, fix: f.fix })) });
  };
  // Makes this submission the final one: records the points on the Grades page and removes the first round's file and feedback.
  S.finalizeWork = function (a, sub) {
    const old = a.work && a.work.first, keep = sub || (a.work && a.work.first);
    if (!keep || !keep.feedback) return false;
    // Keep a small summary of the first review when a different submission replaces it (or carry one that already exists). Never for the first review becoming the grade.
    const fs = old && old !== keep ? S.summarizeReview(old) : (a.work && a.work.firstSummary) || null;
    a.work = { phase: 'final', deadline: a.work ? a.work.deadline : '', first: null, final: keep, ...(fs ? { firstSummary: fs } : {}) };
    const fb = keep.feedback; // if the points were changed after the review, keep the same percentage
    a.score = a.points > 0 && fb.max > 0 ? Math.round((fb.score / fb.max) * a.points * 10) / 10 : fb.score;
    a.done = true;
    if (a.kind === 'demonstrate') a.portfolio = true; // demonstrate work is saved to the course portfolio as it is completed (the learner can remove it)
    if (old && old !== keep && old.fileId && S.files) S.files.del(old.fileId);
    return true;
  };
  // Anything past its 72 hours is finalized from its first review. Safe to call often.
  S.finalizeExpired = function (nowMs) {
    let n = 0;
    S.allWork().forEach(({ a }) => {
      if (a.work && a.work.phase === 'reviewed' && a.work.deadline && new Date(a.work.deadline).getTime() <= (nowMs || Date.now())) { if (S.finalizeWork(a)) n++; }
    });
    if (n) S.save();
    return n;
  };

  S.grade = function (c) {
    let earned = 0, possible = 0, n = 0;
    c.modules.forEach((m) => m.assignments.forEach((a) => {
      if (a.points > 0 && a.score != null) { earned += a.score; possible += a.points; n++; }
    }));
    return n ? { n, earned, possible, pct: Math.round((earned / possible) * 1000) / 10 } : null;
  };

  /* ----- the capstone and the course grade (Phase 3) ----- */
  S.capstoneOf = (c) => (c && c.capstone && c.capstone.status === 'ready' && c.capstone.assignments[0]) || null;
  // Everything a learner can submit, capstone included. (S.allAssignments stays module-only on purpose.)
  S.allWork = () => S.allAssignments().concat(S.state.courses.filter((c) => S.capstoneOf(c)).map((c) => ({ c, m: c.capstone, a: c.capstone.assignments[0] })));
  // The course grade. Without a capstone it is exactly the module average, as before. With one: 80% module average + 20% capstone
  // (weight is c.capstone.weight). Until the capstone is graded the grade is the module average labelled provisional; the capstone never counts as zero.
  S.courseGrade = function (c) {
    const mod = S.grade(c), a = S.capstoneOf(c), cp = a && a.points > 0 && a.score != null ? { score: a.score, points: a.points, pct: S.pctOf(a) } : null;
    const total = c.modules.reduce((t, m) => t + m.assignments.length, 0);
    const out = { module: mod, modulesGraded: mod ? mod.n : 0, modulesTotal: total, capstone: cp, hasCapstone: !!a, weight: 0, pct: null, provisional: false, basis: 'none' };
    if (!a || !(c.capstone.weight > 0)) { out.pct = mod ? mod.pct : null; out.basis = mod ? 'modules' : 'none'; return out; }
    out.weight = c.capstone.weight;
    const w = out.weight / 100;
    if (mod && cp) { out.pct = Math.round(((1 - w) * mod.pct + w * cp.pct) * 10) / 10; out.basis = 'combined'; out.provisional = false; }
    else if (mod) { out.pct = mod.pct; out.basis = 'modules'; out.provisional = true; }   // capstone not graded yet
    else if (cp) { out.pct = null; out.basis = 'capstone-only'; out.provisional = true; } // nothing to combine with yet; not guessed
    else { out.pct = null; out.basis = 'none'; out.provisional = true; }
    return out;
  };

  /* ----- learning progress (Phase 5; read-only, nothing stored) ----- */
  // Same four states as the assignment screens: todo, submitted, feedback (reviewed, inside the 72 hours), done.
  const workKey = (a) => (a.work && a.work.phase === 'reviewed' ? 'feedback' : a.done || (a.work && a.work.final) ? 'done' : a.work ? 'submitted' : 'todo');
  S.progressOf = function (c) {
    const mods = c.modules.map((m) => {
      const st = S.moduleStats(m);
      return { m, st, state: m.complete ? 'complete' : st.done > 0 ? 'progress' : 'todo' };
    });
    const counts = { todo: 0, submitted: 0, feedback: 0, done: 0, total: 0 };
    c.modules.forEach((m) => m.assignments.forEach((a) => { counts[workKey(a)]++; counts.total++; }));
    const cs = S.courseStats(c), cur = mods.find((x) => x.state !== 'complete') || null;
    let cap = null;
    if (c.capstone) {
      const a = S.capstoneOf(c);
      if (a) { const g = a.points > 0 && a.score != null; cap = { status: 'ready', a, key: workKey(a), weight: c.capstone.weight, graded: g, score: g ? a.score : null, points: a.points, pct: g ? S.pctOf(a) : null }; }
      else if (c.capstone.status === 'incomplete') cap = { status: 'incomplete', a: null, key: 'incomplete', weight: c.capstone.weight, graded: false };
    }
    return { mods, modsTotal: cs.mods, modsDone: cs.done, pct: cs.pct, current: cur, counts, capstone: cap, grade: S.courseGrade(c) };
  };

  /* ----- builders and starter content ----- */

  const R = (title, url, note) => ({ id: S.uid(), title, url: url || '', note: note || '', done: false });
  const A = (title, description, o) => ({ id: S.uid(), title, description: description || '', due: '', points: null, score: null, done: false, kind: '', origin: 'user', locked: false, rubric: [], work: null, purpose: '', materials: '', steps: [], format: '', basis: '', portfolioNote: '', portfolio: false, office: null, parts: [], exhibits: [], packet: null, submit: '', criteria: [], estimate: '', ...o });
  const M = (title, o) => ({ id: S.uid(), title, overview: '', readings: [], keyIdeas: '', reflection: '', extras: [], assignments: [], complete: false, syllabi: [], objectives: [], selfCheck: [], duration: '', origin: 'user', edited: false, ...o });
  const C = (code, title, color, description, modules, o) => ({
    id: S.uid(), code, title, color, designTheme: S.randomTheme(), description, objective: '', deliverable: '', syllabus: '', outcomes: [], duration: '', pathway: '', licensureNote: '', ai: null, startDate: '', announcements: [], modules, credentials: [],
    work: { title: '', criteria: [], description: '', reflection: '', status: 'not-started', url: '' }, ...o,
  });

  // Short unique course code from a title, e.g. "Entrepreneurship" -> "ENTR 101".
  S.codeFor = function (title) {
    const w = String(title || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
    const base = w.length > 1 ? w.slice(0, 3).map((x) => x[0]).join('') : (w[0] || 'COURSE').slice(0, 4);
    return base + ' 101';
  };
  S.newModule = (title) => M(title);
  S.newCourse = (f) => C(f.code, f.title, S.state.courses.length % S.COLORS.length, f.description, [M('Foundations')], { objective: f.objective || '', deliverable: f.deliverable || '' });

  S.starterCourses = () => [
    C('ANTH 101', 'Cultural Anthropology', 5,
      'An introduction to how culture shapes human life, and how anthropologists study and write about difference.',
      [M('Critical Visions', { overview: 'Describe what this module covers and why it matters to your study of culture.' })]),
    C('FIN 101', 'Financial Freedom', 3,
      'Build the knowledge and habits to create, protect, and grow your own financial independence.',
      [M('Asset Creation', { overview: 'How assets are created, and the first moves toward owning them.' }),
        M('Asset Maintenance', { overview: 'How to protect, maintain, and grow what you have built.' })]),
    C('ENT 201', 'Entrepreneurship', 2,
      'Learn to turn ideas into viable ventures, from first customer conversations to a working plan.',
      [M('Foundations', { overview: 'Rename this module and describe what it covers.' })]),
    C('WGS 101', 'Feminism', 4,
      'A study of feminist thought, history, and practice.',
      [M('Foundations', { overview: 'Rename this module and describe what it covers.' })]),
    C('LIT 101', 'Literature & Writing', 1,
      'Read closely, write in response, and build a record of your thinking. Each module is one book or theme.',
      [M('First Book or Theme', {
        overview: 'Name the book or theme this module is built around, and why you chose it.',
        readings: [R('The reading', '', 'Replace with the title and author, plus the pages or chapters for this module.')],
        extras: [{ id: S.uid(), title: 'Discussion questions', body: '' }, { id: S.uid(), title: 'Favorite passages', body: '' }],
        assignments: [A('Writing Exercise 1: Response to the Reading', 'Write a short response to this module’s reading: what struck you, what you question, and a passage that supports your view.')],
      })]),
  ];

  S.exampleCourse = () => C('JOUR 101', 'Independent Journalism', 0,
    'Report, verify, and publish original stories independently, with sound ethics, legal awareness, and clear writing.', [
      M('Foundations: purpose and ethics', {
        overview: 'What journalism is for, and the standards that make it credible.',
        readings: [R('SPJ Code of Ethics', 'https://www.spj.org/ethicscode.asp', 'Note the four principles and how each applies to a one-person newsroom.'),
          R('The Elements of Journalism, Kovach and Rosenstiel', '', 'Book. Start with the chapters on truth and loyalty to citizens.')],
        assignments: [A('Write an editorial charter', 'One page: what you cover, for whom, and the standards you hold yourself to.')],
      }),
      M('Finding stories and sourcing', {
        overview: 'Choosing a story worth telling, and finding the people and documents behind it.',
        readings: [R('Verification Handbook', 'https://verificationhandbook.com', 'Free guide to verifying people, content and events.'),
          R('Story-Based Inquiry, UNESCO (Mark Lee Hunter)', '', 'Manual for investigative reporters. Search for the free PDF.')],
        assignments: [A('Build a source map', 'For a local topic, list at least 10 people, documents, or datasets you could use.'),
          A('Trace a viral claim', 'Pick a viral claim and trace it to its primary source. Record each step you took.')],
      }),
      M('Public records and data', {
        overview: 'Using open-records laws to get information that is not volunteered.',
        readings: [R('FOIA.gov: how to make a request', 'https://www.foia.gov', 'Federal process. Your state has its own open-records statute.'),
          R('MuckRock', 'https://www.muckrock.com', 'Browse public requests to see how others word them.')],
        assignments: [A('File a public-records request', 'Federal or state. Keep a copy.'),
          A('Summarize the response', 'In 300 words, summarize the response (or denial) and what you would do next.')],
      }),
      M('Reporting and interviewing', {
        overview: 'Getting reliable information from people, on the record and off.',
        readings: [R('Press law guide for your state (Reporters Committee)', 'https://www.rcfp.org', 'Know your rights and risks around recording, access and defamation.')],
        assignments: [A('Conduct and transcribe an interview', 'A 20-minute interview with a real source.'),
          A('Mark every claim', 'In the transcript, label each claim on-record, background, or needs a second source.')],
      }),
      M('Writing, editing, and publishing', {
        overview: 'Structure, self-editing, fact-checking, and putting your work in front of readers.',
        readings: [R('On Writing Well, William Zinsser', '', 'Book. Read the sections on simplicity and clutter.'),
          R('A newsroom style guide (such as AP)', '', 'Choose one and apply it consistently.')],
        assignments: [A('Draft your 1,500-word article'),
          A('Self-edit and fact-check', 'Link every factual claim to a source in your source log.'),
          A('Publish the piece', 'Publish on a platform you control and save the link.')],
      }),
    ], {
      objective: 'Report, verify, and publish original stories independently.',
      deliverable: 'A fully sourced, 1,500-word original investigative article, published online, with a source log and a short reflection on the process.',
      credentials: [{ id: S.uid(), name: 'Journalism training certificates', issuer: 'Poynter Institute (News University)', url: 'https://www.poynter.org', note: 'Optional. Check current course offerings and what each certificate involves before committing.', status: 'considering' }],
    });
})(window.Sovereign = window.Sovereign || {});
