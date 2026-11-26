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

  // Starter course: Cultural Anthropology, built out as a visual anthropology sequence (seeing as social practice, then critical visual practice).
  // Readings are cited, never copied; links are only to publisher, journal, DOI or author pages.
  const rub = (...p) => p.map(([name, max]) => ({ name, max }));
  const L = (title, purpose, steps, rubric, o) => A(title, '', { kind: 'learn', basis: 'readings', points: 10, purpose, steps, rubric, format: 'text', submit: 'Typed response in the submission box.', estimate: '2–3 hours', ...o });
  const P = (title, purpose, materials, steps, rubric, o) => A(title, '', { kind: 'apply', points: 20, purpose, materials, steps, rubric, format: 'any', estimate: '4–6 hours', ...o });
  const D = (title, purpose, steps, rubric, portfolioNote, o) => A(title, '', { kind: 'demonstrate', basis: 'portfolio', points: 30, purpose, steps, rubric, portfolioNote, format: 'any', estimate: '8–12 hours', ...o });

  function anthropologyCourse() {
    const m1 = M('Forms of Seeing: Staring and the Social Life of Looking', {
      duration: '2 weeks',
      overview: 'Looking feels natural, but how we look at one another is learned, regulated and unequal. This module introduces staring as a social relationship and visual culture as a field that studies seeing, not only images.',
      keyIdeas: 'Staring is an exchange between a starer and a staree, not a one-way act. Looking is governed by social rules about who may look, at whom and for how long. Visual culture studies how seeing is shaped by history, power and technology ("showing seeing"). Ethnography has its own history of visual technologies that described and ranked human difference.',
      objectives: ['Explain staring as a social relationship with its own rules and effects.', 'Describe what it means to treat seeing itself as a cultural practice.', 'Use close observation to record how looking is regulated in everyday life.'],
      selfCheck: ['Can I explain why staring is a relationship and not just a glance?', 'Can I name one rule about looking that I follow without thinking?', 'Can I say what Mitchell means by showing seeing, in one sentence?'],
      readings: [
        R('Rosemarie Garland-Thomson, Staring: How We Look (Oxford, 2009), pp. 3–59', '', 'Book. Why we stare, staring as a physical response and a cultural history, staring as a social relationship and as knowledge gathering.'),
        R('W. J. T. Mitchell, "Showing Seeing: A Critique of Visual Culture," in What Do Pictures Want? (2005), pp. 336–356', '', 'Book chapter. A short case for studying vision itself as a cultural construction.'),
        R('Deborah Poole, "An Excess of Description: Ethnography, Race, and Visual Technologies," Annual Review of Anthropology 34 (2005): 159–179', '', 'Journal article. How anthropology used photography and other visual technologies to describe race.'),
        R('Rosemarie Garland-Thomson, Staring and Its Implications in Society (video, 4 min.)', 'https://youtu.be/jALsDVW63wo', 'Watch first: the author introduces the book’s argument.'),
        R('This American Life, Episode 118: What You Lookin’ At? (1998)', 'https://www.thisamericanlife.org/118/what-you-lookin-at', 'Optional listening.'),
      ],
      assignments: [
        L('Staring as a social relationship', 'Show that you can explain Garland-Thomson’s account of staring in your own words and connect it to lived experience.', [
          'Read Staring, pp. 3–59, and watch the author’s short video.',
          'Choose two short passages (one or two sentences each) that carry the core of her argument.',
          'For each passage, explain what it claims and why it matters (about 150 words each).',
          'Describe one staring encounter you have witnessed or been part of, and analyse it with the concepts from both passages (about 200 words).',
        ], rub(['Accurate account of staring as a social relationship', 4], ['Close explication of the two passages', 3], ['Analysis of a real encounter using the concepts', 3])),
        P('Field notes: rules of looking in a public place', 'Practise ethnographic observation by recording how looking is managed in one ordinary public setting.', 'Observation protocol (supplied by this course).\n\nChoose a public place where strangers share space: a bus, a waiting room, a café, a gym, a queue. Spend 30–45 minutes there.\n\nRecord, without identifying anyone:\n1. The setting: layout, lighting, where people face, what there is to look at.\n2. Looking behaviour: who looks at whom, how long, what happens when eyes meet, what people do instead of looking (phones, windows, floor).\n3. Breaches: any moment a rule of looking seemed to be broken, and how others responded.\n4. Your own position: how your presence and your looking were received.\n\nEthics: do not photograph people, do not record names or identifying details, and stop if anyone is uncomfortable.', [
          'Pick the place and time, and note why you chose it.',
          'Observe for 30–45 minutes, taking dated notes under the four headings in the protocol.',
          'Write up your notes into a clean field record (500–700 words).',
          'Finish with a 200-word analysis naming two rules of looking you observed, using course concepts.',
        ], rub(['Specific, descriptive field notes under all four headings', 8], ['Analysis names and supports two rules of looking', 8], ['Ethical, non-identifying record', 4])),
        D('Visual essay: who gets looked at?', 'Make a short, public-facing visual essay about one situation where some people are stared at and others are not.', [
          'Choose a situation (a body, a garment, an assistive device, a place, a practice) where looking is unevenly distributed.',
          'Gather or make five images that help a reader see the pattern. Use your own photographs, public-domain images, or images you have permission to use; credit every image.',
          'Write 600–800 words for a general reader, using Garland-Thomson and at least one other module reading.',
          'Lay out the images and text together as a PDF or web page.',
        ], rub(['Clear argument about how looking is distributed', 10], ['Images chosen and sequenced to support the argument', 8], ['Accurate use of course readings', 7], ['Writing and layout suitable for a general reader; images credited', 5]), 'A short visual essay showing you can explain how looking works socially, for a general audience.'),
      ],
    });

    const m2 = M('Norms, Knowledge and the Politics of Looking', {
      duration: '2 weeks',
      overview: 'Who is allowed to look, and who must look away? This module examines looking prohibitions, the claim that identity can be read from appearance, and how visual norms are built into technologies like search engines.',
      keyIdeas: 'Visual culture divides what can be seen from what cannot (the "division of the sensible"). Claims that a group can be identified on sight turn appearance into supposed evidence. Looking prohibitions are rules about where eyes may go, and they enforce social hierarchies. Algorithms can reproduce racist ways of seeing at scale.',
      objectives: ['Define a looking prohibition and give an example from everyday life.', 'Explain why "telling by looking" is a social claim rather than a neutral observation.', 'Analyse how a technology can encode a way of seeing.'],
      selfCheck: ['Can I explain the difference between a looking prohibition and simple politeness?', 'Can I describe one way a search engine or app shapes what I see?', 'Can I state what is at stake in the question "can you tell when you see one?"'],
      readings: [
        R('Nicholas Mirzoeff, An Introduction to Visual Culture (2009), pp. 1–20', '', 'Book. Global visual cultures and the division of the sensible.'),
        R('Daniel A. Segal, "Can You Tell a Jew When You See One?" Judaism 48, no. 2 (1999): 234–241', '', 'Journal article. Appearance, race and the claim to identify people on sight.'),
        R('Rosemarie Garland-Thomson, Staring (2009), pp. 63–94', '', 'Book. Regulating our looks; looking away and staring back.'),
        R('Safiya Umoja Noble, Algorithms of Oppression (NYU Press, 2018)', '', 'Book. Optional in full; watch the short talk below.'),
        R('Safiya Umoja Noble on Algorithms of Oppression (video, 3 min.)', 'https://youtu.be/6KLTpoTpkXo', ''),
        R('Elizabeth Barret, dir., Stranger with a Camera (2000), 61 min.', 'https://www.folkstreams.net/films/stranger-with-a-camera', 'Documentary. A filmmaker’s look at who has the right to film whom. Free to stream on Folkstreams.'),
        R('Mimi Thi Nguyen, "The Hoodie as Sign, Screen, Expectation, and Force," Signs 40, no. 4 (2015): 791–816', 'https://gws.illinois.edu/system/files/2020-09/The%20Hoodie%20SIGNS.pdf', 'Further reading. Free PDF from the author’s department at Illinois.'),
      ],
      assignments: [
        L('Telling by looking', 'Explain the logic of identifying people "on sight" and its consequences, using Segal and Mirzoeff.', [
          'Read Segal and Mirzoeff, pp. 1–20.',
          'In about 250 words, explain what Segal is arguing about the claim to recognise a group by appearance.',
          'In about 250 words, connect that argument to Mirzoeff’s idea of the division of the sensible.',
          'Close with one present-day example where "telling by looking" is used to make decisions about people.',
        ], rub(['Accurate account of Segal’s argument', 4], ['Clear link to Mirzoeff', 3], ['Relevant present-day example', 3])),
        P('Looking prohibition mini-project', 'Identify and observe how a looking prohibition is enacted in a public space, and analyse it with course concepts for a general audience.', 'Mini-project brief (supplied by this course).\n\nA looking prohibition is a rule, spoken or unspoken, about where people may not look or who may not be looked at: not staring at a person with a visible difference, averting eyes in a locker room, not looking into neighbours’ windows, not filming in certain places.\n\n1. Choose one looking prohibition you can observe in a public or semi-public space.\n2. Observe it in action at least twice, taking notes on how it is taught, kept and broken.\n3. Talk briefly with at least five people (informally, with their agreement) about how they learned the rule and what happens when it is broken. Do not record names.\n4. Write a 600–800-word analysis for a general reader, as a blog post or short article.', [
          'Choose the prohibition and the place where you will observe it.',
          'Carry out two observation sessions and the five short conversations.',
          'Draft the 600–800-word write-up, using at least two module readings.',
          'Revise for a general reader: a clear opening, concrete examples, and no jargon left unexplained.',
        ], rub(['Clear identification of a looking prohibition and its setting', 4], ['Evidence from observation and five conversations', 6], ['Analysis using course concepts', 6], ['Writing for a popular audience (600–800 words)', 4])),
        D('Annotated collection: looking norms in the news', 'Build an annotated collection showing how a looking norm or a way of "telling by looking" appears in current media.', [
          'Collect six to eight recent news articles, posts or videos that show a looking norm at work (surveillance, profiling, viral staring, image recognition and so on).',
          'For each item, write a 100–150-word annotation: what is being seen, by whom, and which course concept explains it.',
          'Write a 300-word introduction stating the pattern across the collection.',
          'Present the collection as a PDF or web page with full citations and links.',
        ], rub(['Relevant, varied items with full citations', 8], ['Annotations apply course concepts accurately', 12], ['Introduction states a clear pattern', 6], ['Organised, readable presentation', 4]), 'An annotated media collection showing you can apply visual-culture concepts to current events.'),
      ],
    });

    const m3 = M('Expert Visions and Learning to See', {
      duration: '2 weeks',
      overview: 'Professionals learn to see in particular ways: archaeologists, police, doctors, casting directors and machine-learning engineers. This module studies how expert vision is taught and how it becomes authoritative.',
      keyIdeas: 'Professional vision is built through coding schemes, highlighting and graphic representation (Goodwin). Training datasets for computer vision carry hidden classifications and politics (Crawford and Paglen). Design choices encode values; design justice asks who benefits. Technologies such as colour film were calibrated to some bodies and not others.',
      objectives: ['Explain Goodwin’s three practices of professional vision.', 'Analyse the classifications built into an image dataset or recognition system.', 'Describe the material and discursive sides of an expert way of seeing.'],
      selfCheck: ['Can I name Goodwin’s three practices and give an example of each?', 'Can I explain why a training dataset is not neutral?', 'Can I describe one way a camera or app was designed around some bodies and not others?'],
      readings: [
        R('Charles Goodwin, "Professional Vision," American Anthropologist 96, no. 3 (1994): 606–633', 'https://colab.anthro.ucla.edu/wp-content/uploads/sites/119/2022/09/1994.-Professional-Vision.pdf', 'Journal article. The core reading for this module. Free PDF from UCLA Anthropology.'),
        R('Kate Crawford and Trevor Paglen, "Excavating AI: The Politics of Images in Machine Learning Training Sets" (2019)', 'https://www.excavating.ai', 'Online essay.'),
        R('Sasha Costanza-Chock, "Design Values: Hard-Coding Liberation?" in Design Justice (2019)', 'https://design-justice.pubpub.org/pub/3h2zq86d', 'Open-access chapter.'),
        R('Rosemarie Garland-Thomson, Staring (2009), pp. 95–196', '', 'Book. Faces, hands, breasts, bodies, and beholding.'),
        R('Cristina Grasseni, "Ecologies of Belonging and the Mugshot Aesthetics," Anthrovision 5, no. 2 (2017)', 'https://doi.org/10.4000/anthrovision.2845', 'Further reading.'),
        R('Vox, Color film was built for white people. Here’s what it did to dark skin. (2015, 5 min.)', 'https://youtu.be/d16LNHIEJzs', ''),
        R('Trevor Paglen Shows Us How Computers See the World (HBO/Vice News, 2017, 5 min.)', 'https://youtu.be/HEI8cuGKiNk', ''),
      ],
      assignments: [
        L('Professional vision in three moves', 'Show that you understand Goodwin’s framework well enough to use it on a new case.', [
          'Read Goodwin, "Professional Vision."',
          'Define coding schemes, highlighting and graphic representations in your own words (about 75 words each).',
          'Choose one profession not discussed by Goodwin and show all three practices at work in it (about 300 words).',
        ], rub(['Accurate definitions of the three practices', 4], ['Convincing application to a new profession', 4], ['Clear, concise writing', 2])),
        P('Material and discursive practices of seeing', 'Identify an expert or vernacular way of seeing and analyse both its material tools and its talk.', 'Mini-project brief (supplied by this course).\n\nChoose an expert or everyday way of seeing you can observe: a real-estate photographer, a nail technician, a referee, a radiographer, a birdwatcher, a dating-app user scrolling profiles.\n\n1. Material dimension: the tools, screens, lighting, forms, charts or software that shape what is seen.\n2. Discursive dimension: the vocabulary, categories and judgements people use to describe what they see.\n3. Observe the practice at least once in person or in a recorded demonstration.\n4. Talk briefly with at least five people who use or are subject to this way of seeing (with their agreement, no names recorded).\n5. Write 600–800 words for a general reader.', [
          'Choose the way of seeing and arrange your observation.',
          'Record the material tools and the vocabulary you encounter.',
          'Hold five short conversations.',
          'Write the 600–800-word analysis using Goodwin and one other reading.',
        ], rub(['Clear identification of the way of seeing', 4], ['Material dimension analysed with evidence', 5], ['Discursive dimension analysed with evidence', 5], ['Use of Goodwin and another reading', 3], ['Popular-audience writing', 3])),
        D('Excavate a classification', 'Produce an illustrated explainer that excavates the categories inside one image-sorting system.', [
          'Choose a system that sorts images or people visually: a photo app’s automatic albums, a stock-photo site’s tags, a dating-app filter, a content-moderation policy, a public image dataset.',
          'Document its categories with screenshots or quotations (no private information about other people).',
          'Analyse what the categories assume, who they misread, and whose vision they reflect, following Crawford and Paglen.',
          'Present an explainer of 800–1,000 words with annotated images, as a PDF or web page.',
        ], rub(['Careful documentation of the system’s categories', 8], ['Analysis of assumptions and exclusions', 12], ['Use of Crawford and Paglen and Costanza-Chock', 6], ['Clear, credited visual presentation', 4]), 'An illustrated explainer showing you can analyse the politics of a classification system.'),
      ],
    });

    const m4 = M('Vernacular Visions and Family Photographs', {
      duration: '2 weeks',
      overview: 'Everyday photography (studio portraits, snapshots, family albums) is where many people learn to see themselves and their nation. This module reads ordinary images as cultural evidence.',
      keyIdeas: 'Popular photography helped make national modernity visible (Strassler). Amateur photographers work within genres and conventions they rarely notice. Family photographs carry memory across generations and across displacement. Images can be "listened to" for what they register quietly, not only for what they show (Campt).',
      objectives: ['Identify the conventions of a vernacular photographic genre.', 'Explain how family photographs work as memory and as evidence.', 'Practise close, slow reading of an ordinary image.'],
      selfCheck: ['Can I name three conventions of a family snapshot?', 'Can I explain what Strassler means by refracted visions?', 'Can I describe what Campt means by listening to images?'],
      readings: [
        R('Karen Strassler, Refracted Visions: Popular Photography and National Modernity in Java (Duke, 2010), pp. 1–71 and 165–206', '', 'Book. Introduction, amateur visions, and family documentation.'),
        R('Tina M. Campt, Listening to Images (Duke, 2017), pp. 1–46', '', 'Book.'),
        R('Thy Phu, "Unhomed: Domestic Images and the Diasporic Art of Recollection," in Warring Visions: Photography and Vietnam (2022), pp. 147–186', '', 'Book chapter.'),
        R('Marianne Hirsch, Family Frames: Photography, Narrative, and Postmemory (1997)', '', 'Further reading.'),
        R('Shirin Malek, "Clickbait Orientalism and Vintage Iranian Snapshots," International Journal of Cultural Studies (2020)', 'https://doi.org/10.1177/1367877920957348', 'Further reading.'),
      ],
      assignments: [
        L('Amateur visions', 'Explain how Strassler reads popular photography as a window onto national modernity.', [
          'Read Strassler, pp. 1–71.',
          'In about 250 words, explain what Strassler means by refracted visions.',
          'In about 250 words, describe two conventions of amateur photography she identifies and what they reveal.',
        ], rub(['Accurate account of the central argument', 4], ['Two conventions explained with examples', 4], ['Clear writing', 2])),
        P('Read a family album', 'Analyse a set of vernacular photographs as cultural evidence, attending to genre and convention.', 'Image set (choose one source).\n\nOption A: five photographs from your own family or household, used with the permission of anyone shown.\nOption B: five photographs from a public archive of vernacular images (a library or museum collection of snapshots or studio portraits).\n\nFor each photograph record: occasion, setting, pose and gaze, who holds the camera, what is outside the frame, and how the image was kept (album, wall, phone, box).', [
          'Choose your image set and confirm permission or the archive’s terms.',
          'Complete the record for each of the five photographs.',
          'Write 600–800 words identifying the genre conventions at work and what they say about family, nation or class.',
          'Use Strassler and at least one other module reading.',
        ], rub(['Careful record of all five photographs', 6], ['Analysis of genre and convention', 8], ['Use of course readings', 4], ['Permissions and sources noted', 2])),
        D('Listening to an image', 'Write an image essay in the spirit of Campt, reading one vernacular photograph slowly and closely.', [
          'Choose one ordinary photograph you are allowed to reproduce.',
          'Spend time with it over several days and keep notes on what it registers quietly: posture, tension, sound, what is withheld.',
          'Write a 900–1,200-word essay that moves between close description and the module’s ideas.',
          'Present the image and essay together with a caption giving its source and date.',
        ], rub(['Sustained close description', 10], ['Insightful use of Campt and one other reader', 10], ['Essay structure and voice', 6], ['Image presented with proper caption and permission', 4]), 'An image essay showing slow, theoretically informed reading of a vernacular photograph.'),
      ],
    });

    const m5 = M('Identity, Documentation and Surveillance', {
      duration: '2 weeks',
      overview: 'Identity cards, biometric scans and face recognition turn bodies into records. This module examines how states and platforms document people visually, and how people respond.',
      keyIdeas: 'Identity photographs make citizens legible to the state (Strassler). Biometric security grew out of a long history of identifying and sorting bodies (Maguire). Surveillance has a racial history (Browne). Generated faces and virtual fitting rooms show how imaging technologies imagine "normal" bodies (Hill and White; Pham).',
      objectives: ['Explain how identity documents make people visible to institutions.', 'Trace one surveillance technology to an older practice of visual identification.', 'Explain a surveillance concept clearly to someone outside the course.'],
      selfCheck: ['Can I explain what makes an ID photo different from a portrait?', 'Can I name one historical precursor of face recognition?', 'Can I explain "the surveillance of blackness" in plain language?'],
      readings: [
        R('Karen Strassler, Refracted Visions (2010), pp. 123–163', '', 'Book. Identifying citizens.'),
        R('Mark Maguire, "The Birth of Biometric Security," Anthropology Today 25, no. 2 (2009): 9–14', 'https://mural.maynoothuniversity.ie/3014', 'Journal article. Free copy in Maynooth University’s research archive.'),
        R('Kashmir Hill and Jeremy White, "Designed to Deceive: Do These People Look Real to You?" New York Times, November 21, 2020', 'https://www.nytimes.com/interactive/2020/11/21/science/artificial-intelligence-fake-people-faces.html', 'Interactive article; may require a subscription.'),
        R('Minh-Ha T. Pham, "Visualizing \'The Misfit\': Virtual Fitting Rooms and the Politics of Technology," American Quarterly 67, no. 1 (2015): 165–188', '', 'Journal article.'),
        R('Simone Browne, Dark Matters: On the Surveillance of Blackness (Duke, 2015)', '', 'Further reading.'),
        R('Hasan Elahi, FBI, here I am! (TED, 2011, 14 min.)', 'https://www.ted.com/talks/hasan_elahi_fbi_here_i_am', 'Talk.'),
      ],
      assignments: [
        L('From mugshot to biometrics', 'Trace the connection between older and newer practices of visual identification.', [
          'Read Maguire and Strassler, pp. 123–163.',
          'In about 300 words, explain what Maguire means by the birth of biometric security.',
          'In about 200 words, connect it to Strassler’s account of identity photographs.',
        ], rub(['Accurate account of Maguire', 4], ['Meaningful connection to Strassler', 4], ['Clear writing', 2])),
        P('Anatomy of an identity document', 'Analyse the visual conventions of an identity document and what they require of the person pictured.', 'Document set (supplied by this course).\n\nUse a published specimen, not a real person’s document: most governments and passport offices publish specimen images and photo rules for passports, ID cards and driving licences.\n\nCollect: (1) one specimen document, (2) the official photo requirements for it (pose, expression, background, head covering, glasses, lighting).\n\nDo not upload or share anyone’s real identity document.', [
          'Find a published specimen and the official photo rules.',
          'List every visual requirement and what it is meant to secure.',
          'Write 600–800 words on what the document asks a body to be, and who these rules burden.',
          'Use Strassler or Maguire and one other reading.',
        ], rub(['Complete, sourced list of visual requirements', 6], ['Analysis of what the rules demand and whom they burden', 8], ['Use of course readings', 4], ['No real personal documents used', 2])),
        D('Recorded explainer: how surveillance sees', 'Record a conversation in which you explain a surveillance concept to someone unfamiliar with the course.', [
          'Choose one concept from the module (biometric security, the surveillance of blackness, generated faces, the "misfit").',
          'Record a 6–10-minute conversation explaining it to a willing friend or family member, using one concrete example. Get their permission to record.',
          'Write a 300-word reflection: what was hard to explain, what questions they asked, and what you would change.',
          'Submit the recording (or a transcript) and the reflection.',
        ], rub(['Accurate explanation of the concept', 12], ['Effective concrete example', 8], ['Thoughtful reflection on explaining', 6], ['Permission noted; clear recording or transcript', 4]), 'A recorded explainer showing you can teach a visual-culture concept clearly.'),
      ],
    });

    const m6 = M('Bearing Witness and Visual Evidence', {
      duration: '2 weeks',
      overview: 'Photographs are used as proof in courts, newsrooms and movements. This module asks what makes an image count as evidence, and what it means to bear witness through images.',
      keyIdeas: 'Images testify, but always within institutions that decide what counts (Strassler, "witnessing history" and "revelatory signs"). Photography creates a civil relation between photographer, photographed and viewer (Azoulay). Perpetrators can also stage images of violence (The Act of Killing). The same photograph can be evidence, propaganda and memorial.',
      objectives: ['Explain what makes an image function as evidence in a given setting.', 'Describe Azoulay’s idea of a civil contract of photography.', 'Analyse how an image-event circulated and was used.'],
      selfCheck: ['Can I name the institutions that decide whether an image is evidence?', 'Can I explain the civil contract in two sentences?', 'Can I describe how one image changed meaning as it circulated?'],
      readings: [
        R('Karen Strassler, Refracted Visions (2010), pp. 207–300', '', 'Book. Witnessing history, revelatory signs, beyond the paper trace.'),
        R('Ariella Azoulay, The Civil Contract of Photography (Zone Books, 2008)', '', 'Book. Read the introduction.'),
        R('Joshua Oppenheimer, dir., The Act of Killing (2013), director’s cut', '', 'Documentary. Long and disturbing; take breaks.'),
        R('Shawn Michelle Smith, "Afterimages: Abu Ghraib," in At the Edge of Sight: Photography and the Unseen (Duke, 2013), pp. 195–213', '', 'Further reading.'),
        R('Errol Morris, Believing Is Seeing: Observations on the Mysteries of Photography (2011)', '', 'Further reading.'),
      ],
      assignments: [
        L('The civil contract of photography', 'Explain Azoulay’s argument and test it against a case.', [
          'Read the introduction to Azoulay.',
          'In about 300 words, explain the civil contract and who its parties are.',
          'In about 200 words, apply it to one documentary or news photograph you know well.',
        ], rub(['Accurate account of Azoulay', 4], ['Convincing application to a case', 4], ['Clear writing', 2])),
        P('Image as evidence: tracing an image-event', 'Trace how one widely circulated image was used as evidence, and by whom.', 'Case brief (supplied by this course).\n\nChoose one image-event: a photograph or video that circulated widely and was used to prove or disprove something (in a trial, an inquiry, a news story or a campaign).\n\nGather: the image’s origin, its first publication, at least three later uses, and how each user framed what it proved. Use public sources only and cite each one.', [
          'Choose the image-event and confirm its origin from reliable sources.',
          'Build a timeline of at least four uses of the image.',
          'Write 700–900 words on how the image’s evidentiary meaning changed across those uses.',
          'Use Strassler and Azoulay.',
        ], rub(['Well-sourced timeline of uses', 6], ['Analysis of shifting evidentiary claims', 8], ['Use of Strassler and Azoulay', 4], ['Accurate citations', 2])),
        D('Public essay: what counts as visual evidence?', 'Write a public-facing essay arguing a position on images as evidence, drawing across the course so far.', [
          'Choose a question: Should viral video be trusted? Who has the right to film? When does witnessing become spectacle?',
          'Draft an essay of 1,000–1,200 words for a general reader, with a clear position.',
          'Draw on at least three readings from different modules.',
          'Revise for clarity and include properly credited images if you use any.',
        ], rub(['Clear, arguable position', 8], ['Synthesis across at least three readings and modules', 10], ['Evidence and examples', 7], ['Writing for a general reader', 5]), 'A public essay showing you can synthesise the course into an argument about visual evidence.'),
      ],
    });

    const m7 = M('Critical Visions: Art, Ethnography and Intervention', {
      duration: '2 weeks',
      overview: 'The second half of the course moves from analysing ways of seeing to intervening in them. This module introduces artist-ethnographers, public art as critique, and the "unsteady in-between" of art and anthropology.',
      keyIdeas: 'Artists and anthropologists borrow each other’s methods, and the overlap is productive because it is unsteady. Public art can be a critical language, not decoration (Lacy). False documents and fabricated archives can reveal how documentation works (Chavoya). An implosion exercise unpacks one object into its many relations (Dumit).',
      objectives: ['Describe how artistic and ethnographic methods can combine.', 'Use an implosion exercise to map the relations around one object.', 'Propose an intervention that makes a dominant way of seeing visible.'],
      selfCheck: ['Can I name one artist who works ethnographically and what they do?', 'Can I explain the steps of an implosion exercise?', 'Can I state the dominant way of seeing my intervention will target?'],
      readings: [
        R('Stephanie Sadre-Orafai, Tate, Kang and McGrath, "Critical Visions and the Unsteady In-Between," American Anthropologist 120, no. 1 (2018): 153–162', '', 'Journal article. The course’s namesake.'),
        R('Arnd Schneider and Christopher Wright, "The Challenge of Practice," in Contemporary Art and Anthropology (Berg, 2006), pp. 1–28', '', 'Book chapter.'),
        R('Suzanne Lacy, "Debated Territory: Toward a Critical Language for Public Art," in Mapping the Terrain: New Genre Public Art (1994), pp. 171–185', '', 'Book chapter.'),
        R('Rosalind Krauss, "Sculpture in the Expanded Field," October 8 (1979): 30–44', 'https://doi.org/10.2307/778224', 'Journal article.'),
        R('Joseph Dumit, "Writing the Implosion: Teaching the World One Thing at a Time," Cultural Anthropology 29, no. 2 (2014): 344–362', 'https://doi.org/10.14506/ca29.2.09', 'Journal article, open access. The method for this module’s Apply assignment.'),
        R('C. Ondine Chavoya, "No-Movies: The Art of False Documents," in Only Skin Deep (2004), pp. 199–203', '', 'Book chapter.'),
        R('Joan Kee, "Orders of Law in the One Year Performances of Tehching Hsieh," American Art 30, no. 1 (2016): 72–91', 'https://doi.org/10.1086/686549', 'Further reading.'),
      ],
      assignments: [
        L('The unsteady in-between', 'Explain what art and anthropology gain from working together, and where they pull apart.', [
          'Read Sadre-Orafai et al. and Schneider and Wright.',
          'In about 250 words, explain what the "unsteady in-between" names.',
          'In about 250 words, describe one artwork or project that works this way and what it does that a written ethnography could not.',
        ], rub(['Accurate account of the argument', 4], ['Well-chosen example analysed', 4], ['Clear writing', 2])),
        P('Implosion exercise', 'Unpack one everyday visual object into the relations that make it what it is.', 'Exercise brief (supplied by this course, after Dumit 2014).\n\nChoose one object involved in seeing: a selfie stick, a security mirror, a passport photo booth, a ring light, a one-way window.\n\nMap its dimensions: material (what it is made of, where), technical, economic, political, historical, bodily, symbolic and educational. For each, write two or three sentences and one source.', [
          'Choose the object and write a 100-word description.',
          'Work through each dimension with notes and sources.',
          'Draw a map or diagram connecting the dimensions.',
          'Write a 300-word reflection on which relation surprised you and why.',
        ], rub(['Breadth across dimensions', 6], ['Sources for each dimension', 4], ['Map or diagram that shows connections', 5], ['Reflective insight', 5])),
        D('Critical Visions project proposal', 'Propose a public intervention that draws attention to the social, historical or cultural construction of a dominant way of seeing.', [
          'Name the dominant way of seeing you will target and why it matters.',
          'Gather at least ten images that show it at work (credit each one).',
          'Write a 350–500-word proposal: the way of seeing, your intervention, its site and audience, materials, and how you will document it.',
          'Present the proposal and images as one PDF. This becomes the start of your course capstone.',
        ], rub(['Clear identification of a dominant way of seeing', 8], ['Ten relevant, credited images', 6], ['Feasible, specific intervention plan', 10], ['Grounding in module readings', 6]), 'A project proposal showing you can design a critical visual intervention.'),
      ],
    });

    const m8 = M('Land/Water as Method', {
      duration: '2 weeks',
      overview: 'Instead of treating land and water as backdrops, these readings think through them: their textures, flows and politics. The module ends in a hand-made zine.',
      keyIdeas: 'Conceptual displacement: rethink a concept by moving it into another medium, such as seawater (Jue). Affordances: what an environment offers to a body (Gibson). Unruly forms like a pollution plume can be studied through their shape and movement, not only their meaning (Ballestero). Black and Indigenous studies meet at the shoal, a place that is neither land nor sea (King). States simplify landscapes to make them legible (Scott).',
      objectives: ['Explain conceptual displacement and affordances.', 'Compare how two publications use form, structure and binding.', 'Make a zine that thinks through a land or water form.'],
      selfCheck: ['Can I explain what Jue means by thinking through seawater?', 'Can I define an affordance with an everyday example?', 'Can I explain what "seeing like a state" means?'],
      readings: [
        R('Melody Jue, "Introduction: Thinking through Seawater," in Wild Blue Media (Duke, 2020), pp. 1–33', 'https://www.dukeupress.edu/Assets/PubMaterials/978-1-4780-0697-8_601.pdf', 'Publisher’s free introduction.'),
        R('James J. Gibson, "The Theory of Affordances," in The Ecological Approach to Visual Perception (1979), pp. 127–137', '', 'Book chapter.'),
        R('Andrea Ballestero, "The Plume: Movement and Mixture in Subterranean Water Worlds," Fieldsights, September 22, 2020', 'https://culanth.org/fieldsights/the-plume-movement-and-mixture-in-subterranean-water-worlds', 'Short essay.'),
        R('Tiffany Lethabo King, "Introduction: The Black Shoals," in The Black Shoals (Duke, 2019), pp. 1–34', 'https://www.dukeupress.edu/Assets/PubMaterials/978-1-4780-0636-7_601.pdf', 'Publisher’s free introduction.'),
        R('Justin Hosbey and J. T. Roane, "A Totally Different Form of Living," Southern Cultures 27, no. 1 (2021): 68–73', 'https://doi.org/10.1353/scu.2021.0009', ''),
        R('James C. Scott, Seeing Like a State (Yale, 1998), Introduction, pp. 1–10', '', 'Book.'),
        R('Lucy Walker, dir., Waste Land (2011), 99 min.', '', 'Documentary.'),
        R('Anna Tsing et al., Feral Atlas: The More-Than-Human Anthropocene (Stanford, 2020)', 'https://doi.org/10.21627/2020fa', 'Case study: a digital publication.'),
        R('The Center for Land Use Interpretation', 'https://clui.org/section/about-center', 'Case study: an organisation that interprets landscapes.'),
      ],
      assignments: [
        L('Thinking through a medium', 'Explain the methods Jue, Gibson and Ballestero offer for unsettling taken-for-granted categories.', [
          'Read Jue, Gibson and Ballestero.',
          'In about 200 words, explain what Jue’s conceptual displacement involves and what it works against.',
          'In about 150 words, define an affordance with an example of your own.',
          'In about 150 words, explain how Ballestero’s plume connects to the other two.',
        ], rub(['Accurate account of Jue', 4], ['Clear definition and example of affordance', 3], ['Connection to Ballestero', 3])),
        P('Comparative forms', 'Compare how two publications use physical form to carry meaning.', 'Comparison brief (supplied by this course).\n\nChoose two printed or digital publications whose form you find interesting: an artist’s book, a zine, a field guide, an atlas, an exhibition catalogue, a digital publication like Feral Atlas.\n\nFor each record: format and size, binding or navigation, paper or screen, sequence, how images and text relate, and how a reader moves through it. Ignore the content as far as you can; focus on form.', [
          'Choose two publications and photograph or screenshot their key formal features.',
          'Complete the record for each.',
          'Write 500–700 words comparing how each one’s form shapes the reader’s experience.',
          'Finish with three formal ideas you could borrow for your own zine.',
        ], rub(['Detailed formal record of both publications', 6], ['Comparative analysis of form and reading experience', 8], ['Three usable ideas for your zine', 4], ['Images of formal features', 2])),
        D('Land/Water zine', 'Make a zine that thinks through one land or water form using the module’s methods.', [
          'Choose a land or water form near you (a shoreline, a flood plain, a drainage ditch, a vacant lot, a river crossing).',
          'Visit it and collect images, textures, notes and short texts.',
          'Make a maquette (a quick paper model) first, then the finished zine of 8–16 pages.',
          'Photograph or scan every page and add a 300-word statement on your method and readings.',
        ], rub(['Thinking through form, not just about it', 10], ['Craft and use of the zine format', 8], ['Grounding in module readings', 6], ['Documentation and statement', 6]), 'A hand-made zine showing you can turn theory into visual, material form.'),
      ],
    });

    const m9 = M('Form, Critique and Publication', {
      duration: '2 weeks',
      overview: 'Critical visual work improves through critique and comes together in publication. This module covers how books and zines are designed, how to give and receive critique, and how to keep a process book.',
      keyIdeas: 'Every publication starts with an idea that its form must serve (Mevis). Design is a process of iteration that can be documented as a visual essay. Structured critique separates description, interpretation and judgement. A process book records decisions so they can be explained and defended.',
      objectives: ['Explain how a publication’s structure serves its idea.', 'Give structured, constructive critique.', 'Document a creative process as a process book.'],
      selfCheck: ['Can I name the parts of a structured critique?', 'Can I say what idea my own project’s form serves?', 'Can I show the key decisions in my process so far?'],
      readings: [
        R('Armand Mevis, "Every Book Starts with an Idea: Notes for Designers," in The Form of the Book Book (Occasional Papers), pp. 85–90', '', 'Book chapter.'),
        R('Willem Henri Lucas, "Designing a Publication" and "The Design Process + Building a Visual Essay / Process Book," Open Book Experimental Book Workshop (2013)', '', 'Workshop handouts. Search the titles.'),
        R('Willem Henri Lucas and Jon Sueda, "Binding," Open Book Experimental Book Workshop (2013)', '', 'Workshop handout.'),
      ],
      assignments: [
        L('Form serves the idea', 'Explain how a publication’s form can carry its argument.', [
          'Read Mevis and the Lucas handouts.',
          'In about 250 words, explain Mevis’s claim that a book starts with an idea.',
          'In about 250 words, analyse one publication you own: what is its idea, and how does its form serve it?',
        ], rub(['Accurate account of Mevis', 4], ['Analysis of a real publication', 4], ['Clear writing', 2])),
        P('Structured critique', 'Practise giving critique that is specific, generous and useful.', 'Critique protocol (supplied by this course).\n\nChoose one work to critique: a classmate’s or friend’s draft (with their agreement) or a published zine or artist’s book.\n\nWork in four stages:\n1. Describe: what is there, without judgement.\n2. Interpret: what the work seems to be about and how it does it.\n3. Ask: three open questions for the maker.\n4. Suggest: two concrete changes, each tied to something you described.', [
          'Choose the work and note how you have permission or where it was published.',
          'Write each of the four stages (600–800 words in all).',
          'If the maker is available, share the critique and record their response in 100 words.',
        ], rub(['Description free of judgement', 4], ['Interpretation grounded in description', 5], ['Open, useful questions', 5], ['Concrete, tied suggestions', 6])),
        D('Process book', 'Assemble a process book documenting how your Critical Visions project developed.', [
          'Gather notes, sketches, maquettes, drafts, photographs and critique responses from Modules 7–9.',
          'Sequence them as a visual essay that shows key decisions and why you made them.',
          'Add short captions and a 300-word opening statement.',
          'Export as a PDF of 12–24 pages.',
        ], rub(['Documents key decisions and reasons', 10], ['Sequenced as a readable visual essay', 8], ['Captions and statement', 6], ['Design and finish', 6]), 'A process book showing how you develop and document creative research.'),
      ],
    });

    const modules = [m1, m2, m3, m4, m5, m6, m7, m8, m9];
    const capstone = S.makeCapstone({
      title: 'Capstone: Critical Visions Intervention and Publication', status: 'ready', weight: 20, createdAt: new Date().toISOString(),
      overview: 'Design, carry out and publish a critical public intervention into a dominant way of seeing. This brings together the analysis of the first half of the course and the practice of the second.',
      prepares: {
        modules: [
          { id: m1.id, why: 'Staring and the rules of looking give you a way of seeing to target.' },
          { id: m3.id, why: 'Expert vision and classification show how ways of seeing are built.' },
          { id: m7.id, why: 'Your project proposal is the starting point.' },
          { id: m8.id, why: 'Zine-making gives you a publication form.' },
          { id: m9.id, why: 'Critique and the process book carry you through iteration.' },
        ],
        objectives: ['Identify a dominant way of seeing and its social construction.', 'Design and carry out a public intervention.', 'Document and publish the work with a reflective narrative.'],
        skills: ['Visual analysis', 'Ethnographic observation', 'Public art and intervention', 'Publication design', 'Critique'],
      },
      assignments: [A('Critical Visions intervention and publication', '', {
        kind: 'demonstrate', basis: 'portfolio', points: 100, format: 'any', estimate: '4–6 weeks',
        purpose: 'Create a public intervention that disrupts or draws attention to the social, historical or cultural construction of a dominant way of seeing, and publish it with documentation and a project narrative.',
        steps: [
          'Revise your Module 7 proposal using critique from Module 9.',
          'Iteration 1: make a first creative version and a first written draft; get critique.',
          'Iteration 2: revise both; test the intervention in its site if you can.',
          'Iteration 3: an in-situ critique of the near-final work in its real setting.',
          'Carry out the intervention and document it thoroughly (photographs, video, audience responses).',
          'Write a 500–750-word project narrative: the way of seeing, your intervention, what happened, and what it showed.',
          'Lay out documentation and narrative as a publication spread or zine, and present it (live or recorded, 5–8 minutes).',
        ],
        submit: 'A PDF of the publication spread or zine, including documentation and the project narrative, plus the presentation (file or link).',
        rubric: rub(['Originality of the creative work', 30], ['Nuance of the critique of a way of seeing', 30], ['Rigour of the accompanying research', 25], ['Documentation, publication and presentation', 15]),
        portfolioNote: 'The course’s culminating project: a documented, published critical visual intervention.',
      })],
    });

    return C('ANTH 101', 'Cultural Anthropology', 5,
      'An introduction to visual anthropology: how seeing is shaped by culture, power and history, and how artists and anthropologists intervene in dominant ways of seeing.',
      modules, {
        objective: 'Analyse seeing as a socially situated, culturally variable and historically specific practice, and make critical visual work that intervenes in it.',
        deliverable: 'A documented, published Critical Visions intervention into a dominant way of seeing (the course capstone).',
        duration: '18 weeks',
        outcomes: [
          'Explain how dominant ways of seeing rank social differences such as race, gender, sexuality and ability.',
          'Read visual forms and practices critically, as culturally variable, historically specific and unequal in their effects.',
          'Use ethnographic methods, including observation, interviews and visual and discursive analysis.',
          'Write about visual culture for both academic and general readers.',
          'Design, critique and publish creative work that intervenes in a way of seeing.',
        ],
        syllabus: 'Modules 1–6 study seeing as social practice: staring, looking norms, expert vision, vernacular photography, surveillance and visual evidence. Modules 7–9 turn to critical visual practice: art and ethnography, land and water as method, and publication. Each module has a Learn assignment (10 points), an Apply assignment (20 points) and a Demonstrate portfolio piece (30 points). The capstone counts for 20% of the course grade.\n\nReadings are cited, not reproduced. Find books and articles through a library; links are given where the publisher, journal or author makes the text available.\n\nFieldwork ethics: never photograph or record people without permission, never record names in field notes, and never share anyone’s real identity documents.',
        capstone,
      });
  }

  // Starter course: Entrepreneurship, built as a venture-launch sequence that ends in a full business plan.
  function entrepreneurshipCourse() {
    const m1 = M('The Entrepreneurial Mindset and Opportunity', {
      duration: '2 weeks',
      overview: 'Entrepreneurship is the pursuit of opportunity without regard to the resources you currently control. This module defines opportunity, separates entrepreneurial firms from salary-substitute and lifestyle firms, and ends with your first concept statement.',
      keyIdeas: 'An opportunity is a favourable set of circumstances that creates a need for a new product, service or business: attractive, durable and timely. Value is added in two main ways: a new product or service, or a new process for delivering one. Entrepreneurial, salary-substitute and lifestyle firms differ in how innovative they are. Analysis paralysis kills more ventures than bad ideas; take one concrete step every day.',
      objectives: ['Define an opportunity and test an idea against it.', 'Distinguish entrepreneurial, salary-substitute and lifestyle firms.', 'Write a concept statement for a venture idea.'],
      selfCheck: ['Can I say what problem my idea solves and for whom?', 'Can I explain why now is the right time for it?', 'Can I name the kind of firm I am proposing?'],
      readings: [
        R('W. Sherman Rogers, The African American Entrepreneur: Challenges and Opportunities in the Trump Era (Praeger, 2019), Introduction and Part II, Chapter 11, "Developing Your Ideas"', '', 'Book. Part II, "Building Future Excellence: A Primer for Aspiring Entrepreneurs" (pp. 227–346), is the practical backbone of this course.'),
        R('OpenStax, Entrepreneurship (Laverty and Littel, 2020)', 'https://openstax.org/details/books/entrepreneurship', 'Free, openly licensed textbook used throughout this course. Start with the chapters on the entrepreneurial mindset and identifying opportunity.'),
        R('Bruce R. Barringer and R. Duane Ireland, Entrepreneurship: Successfully Launching New Ventures (Pearson)', '', 'Book. The standard text on opportunity recognition and feasibility.'),
        R('Steve Blank, "Why the Lean Start-Up Changes Everything," Harvard Business Review, May 2013', 'https://hbr.org/2013/05/why-the-lean-start-up-changes-everything', 'Article. Free with a limited number of HBR views.'),
      ],
      assignments: [
        L('What counts as an opportunity?', 'Show that you can define an opportunity and apply the definition to real ventures.', [
          'Read the introduction and Chapter 11 of Rogers, and the OpenStax chapters on opportunity.',
          'In about 200 words, define an opportunity and its three qualities in your own words.',
          'Choose two businesses you know, one entrepreneurial and one salary-substitute or lifestyle firm, and explain the difference (about 300 words).',
        ], rub(['Accurate definition of opportunity', 4], ['Clear contrast between firm types', 4], ['Concise writing', 2])),
        P('Idea inventory', 'Generate and screen venture ideas before committing to one.', 'Idea-screening worksheet (supplied by this course).\n\nList ten problems you, your community or a profession you know runs into. For each, record:\n1. Who has the problem.\n2. How they solve it today.\n3. What a better solution would be.\n4. Attractive? Durable? Timely? (yes / no / unsure, with one reason each).\n\nThen rank the ten and choose your top three.', [
          'Fill in the worksheet for ten problems.',
          'Score each against attractive, durable and timely.',
          'Choose your top three and explain the ranking in 300 words.',
        ], rub(['Ten specific, real problems', 6], ['Honest screening against the three qualities', 8], ['Reasoned ranking of the top three', 6])),
        D('Concept statement', 'Write a one-page concept statement for the venture you will develop through the course.', [
          'Name the business.',
          'Describe the product or service: what it is and what it is not.',
          'Describe the target market the business aims to reach.',
          'State the benefits of the product or service to that market.',
          'Explain how the business will sell and distribute it.',
          'Keep it to one page; it is the seed of your business plan.',
        ], rub(['Clear description of the product or service', 8], ['Specific target market', 8], ['Benefits tied to customer needs', 7], ['Realistic sales and distribution', 7]), 'A concept statement showing you can describe a venture clearly and concisely.'),
      ],
    });

    const m2 = M('Feasibility Analysis and Primary Research', {
      duration: '3 weeks',
      overview: 'A feasibility analysis tells you whether an idea is worth the time, money and effort before you write a full plan. The most important test is trying to sell one unit of your product or service.',
      keyIdeas: 'Feasibility has four parts: product or service, industry and market, organisational, and financial. Concept testing asks potential customers whether they would buy; usability testing puts a version in their hands. Primary research is information you gather yourself, by interviews, surveys and observation; secondary research is what others have already published. Most of the feasibility analysis becomes sections of your business plan.',
      objectives: ['Plan and carry out primary research with potential customers.', 'Run a concept test and a usability test.', 'Write a feasibility analysis covering all four parts.'],
      selfCheck: ['Have I talked to at least ten potential customers?', 'Have I tried to sell one unit?', 'Can I say what would make me abandon this idea?'],
      readings: [
        R('W. Sherman Rogers, The African American Entrepreneur (2019), Part II, p. 228 (feasibility analysis) and Chapter 14 sections on the industry and the market', '', 'Book.'),
        R('OpenStax, Entrepreneurship (2020): chapters on conducting a feasibility analysis and market research', 'https://openstax.org/details/books/entrepreneurship', 'Free textbook.'),
        R('U.S. Small Business Administration, "Market research and competitive analysis"', 'https://www.sba.gov/business-guide/plan-your-business/market-research-competitive-analysis', 'Government guide.'),
        R('U.S. Census Bureau, Census Business Builder', 'https://cbb.census.gov/', 'Free tool for local market and industry data.'),
      ],
      assignments: [
        L('The four parts of feasibility', 'Explain what each part of a feasibility analysis asks and why it matters.', [
          'Read the assigned sections of Rogers and OpenStax.',
          'For each of the four parts (product or service, industry and market, organisational, financial), write about 100 words on what it asks.',
          'Explain in about 100 words why selling one unit is the strongest evidence of feasibility.',
        ], rub(['All four parts explained accurately', 6], ['Clear case for the one-unit test', 2], ['Concise writing', 2])),
        P('Customer discovery interviews', 'Gather primary research from potential customers before building anything.', 'Interview guide (supplied by this course).\n\nInterview at least ten people who could be customers. Ask about the problem, not your solution:\n1. Tell me about the last time you had this problem.\n2. What did you do about it? What did it cost?\n3. What is most frustrating about how you handle it now?\n4. If something solved it, what would it have to do?\n5. Only at the end: describe your concept and ask whether, and for how much, they would buy it.\n\nRecord answers without names. Do not promise anything you cannot deliver.', [
          'Write your interview plan and who you will reach.',
          'Hold at least ten interviews and take notes on each.',
          'Summarise patterns in a 500–700-word findings memo.',
          'State what the interviews changed about your concept.',
        ], rub(['At least ten interviews with notes', 6], ['Questions focused on the problem, not the pitch', 4], ['Clear patterns identified', 6], ['Concept revised in light of findings', 4])),
        D('Feasibility analysis', 'Write a feasibility analysis that decides whether your venture is worth pursuing.', [
          'Product or service feasibility: overall appeal, and results of your concept and usability testing (including your attempt to sell one unit).',
          'Industry and market feasibility: industry attractiveness, target market, timing.',
          'Organisational feasibility: management capacity and resources you can draw on.',
          'Financial feasibility: start-up cash needed, likely revenue, and how you know.',
          'Conclude: go, revise, or stop, with reasons.',
        ], rub(['Concept and usability testing reported honestly', 8], ['Industry and market evidence', 8], ['Organisational and financial realism', 8], ['Clear, justified conclusion', 6]), 'A feasibility analysis showing you can test a venture idea with evidence before investing in it.'),
      ],
    });

    const m3 = M('Industry and Competitive Analysis', {
      duration: '2 weeks',
      overview: 'Before you can compete you need to understand the industry you are entering: its size, trends, key success factors and the forces that shape its profits.',
      keyIdeas: 'Porter’s five forces: the bargaining power of customers and of suppliers, the threat of new entrants and of substitutes, and rivalry among existing firms. SWOT assesses your firm’s strengths and weaknesses against external opportunities and threats. PEST (and PESTEL) scans political, economic, social, technological, environmental and legal factors. Industry codes (NAICS) unlock official data on size and financial ratios.',
      objectives: ['Size an industry and identify its trends and key success factors.', 'Apply the five forces, SWOT and PEST to a venture.', 'Identify direct and indirect competitors and how each differentiates itself.'],
      selfCheck: ['Do I know my industry’s NAICS code and size?', 'Which of the five forces is strongest in my industry?', 'Can I name three direct competitors and their weaknesses?'],
      readings: [
        R('Michael E. Porter, "The Five Competitive Forces That Shape Strategy," Harvard Business Review, January 2008', 'https://hbr.org/2008/01/the-five-competitive-forces-that-shape-strategy', 'Article. Free with a limited number of HBR views.'),
        R('W. Sherman Rogers, The African American Entrepreneur (2019), Chapter 14, "The Industry" (p. 276)', '', 'Book.'),
        R('U.S. Census Bureau, North American Industry Classification System (NAICS)', 'https://www.census.gov/naics/', 'Look up your industry code.'),
        R('OpenStax, Entrepreneurship (2020): chapters on industry analysis and competitive advantage', 'https://openstax.org/details/books/entrepreneurship', 'Free textbook.'),
      ],
      assignments: [
        L('Five forces in plain language', 'Explain each of Porter’s five forces with an example from a real industry.', [
          'Read Porter (2008).',
          'For each force, write two or three sentences explaining it and one example from an industry you know.',
          'In about 150 words, explain why the forces, not industry growth, determine profitability.',
        ], rub(['All five forces explained accurately', 5], ['Fitting examples', 3], ['Grasp of Porter’s main claim', 2])),
        P('Industry profile', 'Build a profile of the industry your venture will enter.', 'Industry profile template (supplied by this course).\n\n1. Summary of the industry and its NAICS code.\n2. Industry size in dollars, with source and year.\n3. Three trends, each with a source.\n4. Key success factors: what every surviving firm gets right.\n5. Standard financial ratios, if you can find them (gross margin, net margin).\n6. Major trade associations and conventions in the industry.\n\nCite every figure.', [
          'Find your NAICS code and official size data.',
          'Research trends, success factors and ratios.',
          'Identify the main trade associations and at least one convention you could attend.',
          'Write up the profile in 700–900 words with sources.',
        ], rub(['Sourced industry size and code', 5], ['Trends and key success factors', 6], ['Financial ratios or a reasoned estimate', 4], ['Trade associations identified', 3], ['Accurate citations', 2])),
        D('Competitive analysis', 'Analyse the competitive landscape for your venture using three frameworks.', [
          'Apply the five forces to your industry, rating each force low, medium or high with reasons.',
          'Build a competitor table: at least three direct and two indirect competitors, with strengths, weaknesses and how each differentiates itself.',
          'Write a SWOT for your venture and a short PEST scan.',
          'Conclude with your competitive advantage in one paragraph. Use at least one chart.',
        ], rub(['Five-forces assessment with reasons', 8], ['Thorough competitor table', 8], ['SWOT and PEST tied to your venture', 8], ['Clear competitive advantage, illustrated with a chart', 6]), 'A competitive analysis showing you can assess an industry and position a venture within it.'),
      ],
    });

    const m4 = M('Business Models and Pricing', {
      duration: '2 weeks',
      overview: 'A business model shows how a firm creates, delivers and captures value. It extends the feasibility analysis into a strategy: how you will compete, with what resources and partners, and at what price.',
      keyIdeas: 'Core strategy: how the firm will compete. Strategic resources: what the firm has and how it uses it. Partnership networks: suppliers, partners and other key relationships. Customer interface: target market, sales and marketing, pricing. Business models must be revisited as competition, customer preferences and technology change; what got a company there will not necessarily keep it there.',
      objectives: ['Describe a venture’s business model in its main components.', 'Set a price using cost, competition and customer value.', 'Explain why successful firms fail when their models go stale.'],
      selfCheck: ['Can I explain how my venture makes money in one sentence?', 'Do I know my cost per unit and my price per unit?', 'Can I name a once-dominant firm whose model went stale?'],
      readings: [
        R('Alexander Osterwalder and Yves Pigneur, Business Model Generation (Wiley, 2010)', '', 'Book. Introduces the Business Model Canvas.'),
        R('Strategyzer, The Business Model Canvas', 'https://www.strategyzer.com/library/the-business-model-canvas', 'Free canvas and short explanation.'),
        R('W. Sherman Rogers, The African American Entrepreneur (2019), Part II on the business model and pricing', '', 'Book.'),
        R('OpenStax, Entrepreneurship (2020): chapter on business models', 'https://openstax.org/details/books/entrepreneurship', 'Free textbook.'),
      ],
      assignments: [
        L('Anatomy of a business model', 'Explain the components of a business model and apply them to a familiar company.', [
          'Read the assigned chapters and the Business Model Canvas page.',
          'Choose a company you know well and describe its core strategy, strategic resources, partnership network and customer interface (about 400 words).',
          'In about 100 words, say which component is most vulnerable to change.',
        ], rub(['All components described accurately', 6], ['Insight into vulnerability', 2], ['Clear writing', 2])),
        P('Case study: a business model that went stale', 'Analyse why a once-successful company lost its position.', 'Case brief (supplied by this course).\n\nChoose a company that went from dominant to minor or bankrupt because its model failed to keep up (video rental, photographic film, mobile phones, department stores, and so on). Use reliable public sources such as business journalism and company filings.\n\nAnswer: What was the model at its peak? What changed (competition, customers, technology)? What did the company do and not do? What would you have changed, and when?', [
          'Choose the company and collect at least four sources.',
          'Write a 700–900-word case analysis answering the four questions.',
          'End with one lesson for your own venture.',
        ], rub(['Accurate account of the original model', 5], ['Clear analysis of what changed', 6], ['Critical assessment of the response', 5], ['Lesson applied to your venture', 4])),
        D('Business model and pricing strategy', 'Write the business model for your venture, including a justified price.', [
          'Core strategy: your mission and basis for competing.',
          'Strategic resources and partnership network.',
          'Customer interface: target market, sales and marketing approach.',
          'Pricing: cost per unit, competitors’ prices, value to the customer, and your chosen price with gross margin.',
          'Present it as a completed Business Model Canvas plus a two-page narrative.',
        ], rub(['Coherent core strategy and resources', 8], ['Realistic partners and customer interface', 7], ['Price justified by cost, competition and value', 10], ['Canvas and narrative presented clearly', 5]), 'A business model and pricing strategy showing you can design how a venture creates and captures value.'),
      ],
    });

    const m5 = M('Creating the Legal Framework', {
      duration: '2 weeks',
      overview: 'The form you choose for your business affects liability, taxes, control and fundraising. This module compares sole proprietorships, partnerships, LLCs, corporations and nonprofit and social-enterprise forms, and ends with drafting formation documents.',
      keyIdeas: 'Limited liability separates owners’ personal assets from business debts, if formalities are respected. Pass-through taxation (sole proprietorships, partnerships, most LLCs, S corporations) differs from corporate double taxation. Nonprofits that qualify under IRC 501(c)(3) are tax-exempt but must serve a public purpose and meet a public-support test. Benefit corporations and L3Cs blend profit with social mission. A subsidiary is a separate legal entity; a division is not, and the difference matters for liability.',
      objectives: ['Compare the main business forms on liability, tax, control and fundraising.', 'Explain the requirements for 501(c)(3) status.', 'Draft articles of organisation for a chosen form.'],
      selfCheck: ['Which form fits my venture, and why?', 'What must I do to keep limited liability?', 'What is the difference between a subsidiary and a division?'],
      readings: [
        R('W. Sherman Rogers, The African American Entrepreneur (2019), Chapter 12, "Creating the Legal Framework for Your Business"', '', 'Book.'),
        R('U.S. Small Business Administration, "Choose a business structure"', 'https://www.sba.gov/business-guide/launch-your-business/choose-business-structure', 'Government guide.'),
        R('Internal Revenue Service, Publication 557: Tax-Exempt Status for Your Organization', 'https://www.irs.gov/publications/p557', 'Official guide to 501(c)(3) and other exemptions.'),
        R('OpenStax, Entrepreneurship (2020): chapter on legal and ethical issues', 'https://openstax.org/details/books/entrepreneurship', 'Free textbook.'),
      ],
      assignments: [
        L('Choosing a form', 'Compare business forms and choose one for a described venture.', [
          'Read Chapter 12 and the SBA guide.',
          'Build a table comparing sole proprietorship, general partnership, LLC, C corporation, S corporation and 501(c)(3) nonprofit on liability, taxation, control and fundraising.',
          'In about 200 words, recommend a form for your own venture and explain why.',
        ], rub(['Accurate comparison table', 6], ['Reasoned recommendation', 4])),
        P('Nonprofit or social enterprise?', 'Decide whether a mission-driven idea should be a nonprofit, a benefit corporation, an L3C or a for-profit.', 'Scenario (supplied by this course; fictional).\n\nA founder wants to run after-school coding classes for teenagers in a low-income neighbourhood. She expects foundation grants, some fees on a sliding scale, and possibly corporate sponsorships. She also wants to pay herself a market salary and may later sell a curriculum product to schools.\n\nUse IRS Publication 557 and the course readings to advise her.', [
          'List her goals and constraints.',
          'Assess 501(c)(3), benefit corporation, L3C and ordinary LLC against them, including the public-support test for a 501(c)(3).',
          'Write a 600–800-word advice memo with a recommendation and next steps.',
        ], rub(['Goals and constraints identified', 4], ['Accurate analysis of each form', 8], ['Clear recommendation', 4], ['Practical next steps', 4])),
        D('Articles of organisation', 'Draft the formation document for your venture in your chosen form and jurisdiction.', [
          'Choose your form and the state or district where you would form it.',
          'Find that jurisdiction’s official form or statutory requirements for articles of organisation or incorporation.',
          'Draft the articles with every required provision, and add a one-page memo explaining your choices (purpose clause, management, registered agent).',
          'Do not file anything; this is a drafting exercise.',
        ], rub(['All required provisions included for the jurisdiction', 12], ['Choices fit the venture', 8], ['Explanatory memo', 6], ['Clean, professional drafting', 4]), 'Draft articles of organisation showing you can translate a venture into a legal entity.'),
      ],
    });

    const m6 = M('Owners’ Agreements and Intellectual Property', {
      duration: '3 weeks',
      overview: 'Founders who do not agree in writing on ownership, control and exit often end up in court. This module covers agreements among owners and the intellectual property that may be a venture’s most valuable asset.',
      keyIdeas: 'An agreement among owners (an operating agreement or shareholders’ agreement) covers ownership percentages, initial contributions (cash, property or services), management and voting, restrictions on transfer, and buy-sell terms for death, disability, departure or deadlock. Patents protect inventions, trademarks protect brands, copyright protects original expression, and trade secrets protect valuable confidential information. Register early what you can, and keep confidentiality agreements in place.',
      objectives: ['Identify the key terms of an agreement among owners.', 'Distinguish patents, trademarks, copyrights and trade secrets.', 'Draft an agreement among owners for a venture.'],
      selfCheck: ['What happens to a founder’s share if they leave?', 'Which kind of IP protects my venture’s name?', 'Is anything in my venture a trade secret?'],
      readings: [
        R('W. Sherman Rogers, The African American Entrepreneur (2019), Chapter 13, "Things You Should Know about Intellectual Property"', '', 'Book.'),
        R('U.S. Patent and Trademark Office, Trademark basics', 'https://www.uspto.gov/trademarks/basics', 'Government guide.'),
        R('U.S. Patent and Trademark Office, Patent basics', 'https://www.uspto.gov/patents/basics', 'Government guide.'),
        R('U.S. Copyright Office, Frequently Asked Questions', 'https://www.copyright.gov/help/faq/', 'Government guide.'),
      ],
      assignments: [
        L('Four kinds of intellectual property', 'Explain what each form of IP protects and how protection is obtained.', [
          'Read Chapter 13 and the USPTO and Copyright Office pages.',
          'For patents, trademarks, copyright and trade secrets, explain what is protected, how protection arises, and how long it lasts (about 100 words each).',
          'Name which apply to your venture and why.',
        ], rub(['Accurate account of each form', 6], ['Correct application to your venture', 4])),
        P('Founder dispute scenario', 'Identify what an agreement among owners should have said, using a dispute.', 'Scenario (supplied by this course; fictional).\n\nThree friends started a food truck as an LLC with no written agreement. One put in $20,000, one contributed the truck, and one runs the kitchen without pay. After a year the kitchen founder wants to leave and asks to be bought out at a third of the business’s value. The cash investor wants her money back first. The truck owner wants to sell the truck.\n\nIdentify every issue a written agreement would have settled.', [
          'List the issues: contributions, ownership percentages, management, transfer, buy-sell and valuation.',
          'For each, write the clause you would have recommended (plain language is fine).',
          'Write a 300-word note on what default rules might apply now without an agreement, and why that is risky.',
        ], rub(['All key issues spotted', 8], ['Workable clauses for each', 8], ['Understanding of default-rule risk', 4])),
        D('Agreement among owners', 'Draft an agreement among owners for your venture.', [
          'Assume at least two owners (invent a co-founder if needed).',
          'Cover: ownership percentages; each owner’s initial investment (cash, property, services); management and decision-making; restrictions on transfer; buy-sell terms for death, disability, departure and deadlock; valuation method; dispute resolution.',
          'Add a confidentiality and IP-assignment clause.',
          'Include a one-page cover memo explaining the key choices.',
        ], rub(['All core provisions included', 12], ['Buy-sell and valuation terms are workable', 8], ['IP and confidentiality provisions', 5], ['Clear cover memo and drafting', 5]), 'An owners’ agreement showing you can protect a venture and its founders in writing.'),
      ],
    });

    const m7 = M('Financial Statements and the Economics of the Business', {
      duration: '3 weeks',
      overview: 'Investors and lenders want to see how the business makes money. This module covers start-up costs, the income statement, balance sheet and cash flow, margins, breakeven and the taxes a small business owes.',
      keyIdeas: 'Income statement: revenue minus expenses over a period. Balance sheet: assets equal liabilities plus owners’ equity at a moment. Cash flow statement: when cash actually arrives and leaves. Gross margin and operating margin (operating net income ÷ net revenues) show how much of each sale is kept. Breakeven revenue = fixed costs ÷ gross margin percentage. Self-employed owners pay both halves of payroll taxes (Social Security and Medicare). Projections are only as good as the field research behind them.',
      objectives: ['Build a start-up expense worksheet and a pro forma income statement.', 'Calculate gross margin, operating margin and breakeven.', 'Explain the taxes a small business and its owners owe.'],
      selfCheck: ['What are my fixed and variable costs?', 'What revenue do I need to break even?', 'How many months until positive cash flow?'],
      readings: [
        R('W. Sherman Rogers, The African American Entrepreneur (2019), Chapter 14 sections on the economics of the business and the financial plan (pp. 281–283, 294–296), and Chapter 16, "Tax Matters for Business Owners"', '', 'Book.'),
        R('OpenStax, Principles of Accounting, Volume 2: Managerial Accounting (Franklin, Graybeal and Cooper)', 'https://openstax.org/details/books/principles-managerial-accounting', 'Free textbook. Chapters on cost behaviour and cost-volume-profit analysis.'),
        R('Internal Revenue Service, Self-Employment Tax (Social Security and Medicare Taxes)', 'https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes', 'Official guide.'),
        R('U.S. Small Business Administration, "Calculate your startup costs"', 'https://www.sba.gov/business-guide/plan-your-business/calculate-your-startup-costs', 'Government guide.'),
      ],
      assignments: [
        L('Reading financial statements', 'Explain what each financial statement shows and how they connect.', [
          'Read the assigned sections of Rogers and OpenStax.',
          'Explain the income statement, balance sheet and cash flow statement in about 100 words each.',
          'Explain gross margin, operating margin and breakeven with a worked numerical example of your own (about 200 words).',
        ], rub(['Accurate explanation of each statement', 5], ['Correct worked example', 5])),
        P('Breakeven and margin workshop', 'Calculate margins and breakeven for a sample venture.', 'Case data (supplied by this course; fictional).\n\nA mobile coffee cart sells 220 drinks a week at an average price of $5.50. Ingredients and cups cost $1.65 per drink. Fixed costs are $2,100 a month (permits, insurance, cart lease, phone). The owner works without salary for now.\n\nAssume 4.33 weeks per month.', [
          'Calculate monthly revenue, variable costs, gross margin (in dollars and percent) and operating income.',
          'Calculate breakeven revenue and the number of drinks needed per month to break even.',
          'Show how the picture changes if the price rises to $6.00 and sales drop 10%.',
          'Present the calculations in a small table or spreadsheet with a one-paragraph interpretation.',
        ], rub(['Correct revenue, cost and margin figures', 6], ['Correct breakeven in revenue and units', 6], ['Correct price-change scenario', 4], ['Clear interpretation', 4])),
        D('Pro forma financials', 'Build pro forma financial statements for your venture.', [
          'Start-up expense worksheet for the first two months.',
          'Pro forma income statement: monthly for year one, annual for years two and three.',
          'Pro forma balance sheet for the end of years one to three.',
          'Pro forma cash flow: monthly for year one.',
          'Breakeven analysis with a chart, months to breakeven and to positive cash flow, and a list of the assumptions behind every major figure.',
        ], rub(['Complete start-up worksheet and income statement', 10], ['Balance sheet and cash flow consistent with the income statement', 8], ['Breakeven analysis and chart', 6], ['Assumptions stated and grounded in research', 6]), 'Pro forma financial statements showing you can model a venture’s economics.'),
      ],
    });

    const m8 = M('Raising Capital and Planning the Future', {
      duration: '2 weeks',
      overview: 'Most ventures need outside money at some point. This module covers bootstrapping, debt, equity, grants and crowdfunding, how investors value early companies, and planning for growth, exit and succession.',
      keyIdeas: 'Debt must be repaid but keeps ownership; equity gives up ownership but not repayment. Investors look for a credible team, a large market and a path to return. The venture-capital method values a company from its expected exit value and the investor’s target return. Securities laws govern offers of ownership to the public; Regulation Crowdfunding lets small firms raise limited amounts online. Owning your job is not the same as owning a business; plan for growth, exit and the transfer of the business to the next generation.',
      objectives: ['Compare sources of capital for an early venture.', 'Explain how early-stage investors value a company.', 'Structure a proposed offering for your venture.'],
      selfCheck: ['How much money do I actually need, and for what?', 'What will an investor get, and how will they get their money back?', 'Do I own a job or a business?'],
      readings: [
        R('W. Sherman Rogers, The African American Entrepreneur (2019), Chapter 15, "Raising Capital for Your Business," and Chapter 17, "Estate Planning: Securing Your Future and Your Legacy"', '', 'Book.'),
        R('U.S. Small Business Administration, "Fund your business"', 'https://www.sba.gov/business-guide/plan-your-business/fund-your-business', 'Government guide.'),
        R('U.S. Securities and Exchange Commission, Regulation Crowdfunding', 'https://www.sec.gov/resources-small-businesses/exempt-offerings/regulation-crowdfunding', 'Official guide.'),
        R('OpenStax, Entrepreneurship (2020): chapter on entrepreneurial finance', 'https://openstax.org/details/books/entrepreneurship', 'Free textbook.'),
      ],
      assignments: [
        L('Sources of capital', 'Compare the main sources of start-up capital.', [
          'Read Chapter 15 and the SBA guide.',
          'Compare bootstrapping, friends and family, bank and SBA loans, grants, angel investors, venture capital and crowdfunding in a table (cost, control, typical amount, fit).',
          'In about 150 words, say which fits your venture at launch and why.',
        ], rub(['Accurate comparison table', 6], ['Reasoned fit for your venture', 4])),
        P('Valuing a start-up', 'Use the venture-capital method on a sample company.', 'Case data (supplied by this course; fictional).\n\nA software start-up asks an investor for $500,000. It projects $4 million in revenue in year five; comparable companies sell for about 3 times revenue. The investor targets a 10-times return over five years and expects the founders to issue more shares later that will dilute this round by 30%.', [
          'Calculate the expected exit value.',
          'Calculate the post-money and pre-money valuation the investor would accept, accounting for dilution.',
          'Calculate the percentage the investor should receive now.',
          'Write a 300-word note on what assumptions drive the result and how a founder might negotiate.',
        ], rub(['Correct exit value', 4], ['Correct valuations with dilution', 8], ['Correct ownership percentage', 4], ['Insightful note on assumptions', 4])),
        D('Proposed company offering', 'Draft the offering section of your business plan.', [
          'State how much money you seek and when.',
          'Choose the financing: debt, equity or other, and the type of security if equity.',
          'Show capitalisation before and after, and a use-of-funds table.',
          'Explain the investor’s expected return and exit strategy.',
          'Add a paragraph on long-term development and succession.',
        ], rub(['Amount and timing justified', 6], ['Appropriate financing and security', 8], ['Clear capitalisation and use of funds', 8], ['Credible return, exit and succession plan', 8]), 'A proposed offering showing you can structure a fundraising request.'),
      ],
    });

    const modules = [m1, m2, m3, m4, m5, m6, m7, m8];
    const capstone = S.makeCapstone({
      title: 'Capstone: Full Business Plan', status: 'ready', weight: 20, createdAt: new Date().toISOString(),
      overview: 'Bring every module together into a complete business plan for your venture. The question a reader must be able to answer is: if you follow this plan, does the business have a realistic shot at success, and why?',
      prepares: {
        modules: [
          { id: m1.id, why: 'Your concept statement becomes the core of the executive summary.' },
          { id: m2.id, why: 'Feasibility research supplies the market and customer evidence.' },
          { id: m3.id, why: 'The industry and competitive analysis become Section I and part of the market section.' },
          { id: m4.id, why: 'The business model and pricing feed the economics and marketing sections.' },
          { id: m5.id, why: 'Your legal form shapes operations and the offering.' },
          { id: m7.id, why: 'Pro forma statements become the financial plan.' },
          { id: m8.id, why: 'The offering section completes the plan.' },
        ],
        objectives: ['Write a complete, evidence-based business plan.', 'Show how the business will make a profit.', 'Identify the critical risks and assumptions.'],
        skills: ['Market research', 'Competitive analysis', 'Financial modelling', 'Business law', 'Persuasive writing'],
      },
      assignments: [A('Full business plan', '', {
        kind: 'demonstrate', basis: 'portfolio', points: 100, format: 'any', estimate: '4–6 weeks',
        purpose: 'Write a full business plan that shows a reader exactly how your venture will be launched, operated and financed, and why it can succeed.',
        steps: [
          'Front matter: confidentiality agreement, cover sheet and table of contents.',
          'I. The industry: summary, size, trends, key success factors, financial ratios; five forces, SWOT and PEST where relevant.',
          'II. The company, concept and products or services; III. Market research and analysis; IV. The economics of the business.',
          'V. Marketing plan; VI. Design and development plan; VII. Operations plan; VIII. Management team.',
          'IX. Overall schedule; X. Critical risks, problems and assumptions; XI. Financial plan; XII. Proposed company offering.',
          'Write the executive summary last, and put it first.',
          'Use charts and graphs to make key points, cite your sources, and add appendices (survey, breakeven chart, financial statements).',
        ],
        submit: 'One PDF of the complete plan with appendices.',
        rubric: rub(['Front matter and executive summary', 6], ['The industry', 10], ['The company, concept and products or services', 5], ['Market research and analysis', 15], ['Economics of the business', 8], ['Marketing plan', 9], ['Design and development plan', 5], ['Operations plan', 14], ['Management team', 8], ['Schedule, risks, financial plan and offering', 20]),
        portfolioNote: 'The course’s culminating project: a complete, investor-ready business plan.',
      })],
    });

    return C('ENT 201', 'Entrepreneurship', 2,
      'Turn an idea into a viable venture: test it with customers, analyse the industry, choose a legal form, model the finances, and write a complete business plan.',
      modules, {
        objective: 'Launch a venture on paper with the evidence, legal structure and financial model needed to launch it for real.',
        deliverable: 'A complete business plan for your venture (the course capstone), built from six staged drafting assignments.',
        duration: '19 weeks',
        outcomes: [
          'Recognise and evaluate opportunities.',
          'Test a venture idea with primary research, including concept and usability testing.',
          'Analyse an industry and competitors with standard frameworks.',
          'Choose and draft the legal framework for a venture, including owners’ agreements and IP protection.',
          'Build pro forma financial statements and calculate breakeven.',
          'Write a complete, persuasive business plan.',
        ],
        syllabus: 'The course follows the sequence of the drafting assignments a founder needs: concept statement, feasibility analysis, business model, articles of organisation, agreement among owners, pro forma financials and offering, and finally the full business plan. Each module has a Learn assignment (10 points), an Apply assignment (20 points) and a Demonstrate assignment (30 points). The business plan capstone counts for 20% of the course grade.\n\nThe practical spine is Part II of W. Sherman Rogers, The African American Entrepreneur (2019), "Building Future Excellence: A Primer for Aspiring Entrepreneurs," supported by the free OpenStax Entrepreneurship textbook and official government guides.\n\nThis course is educational. Legal documents drafted here are exercises, not legal advice; consult a licensed attorney and accountant before forming a business or raising money.',
        capstone,
      });
  }

  // Starter course: Financial Freedom. General financial education, not personalised advice.
  function financeCourse() {
    const m1 = M('Money, Values and Cash Flow', {
      duration: '2 weeks',
      overview: 'Financial freedom starts with knowing where your money comes from, where it goes, and what you want it to do. This module covers values-based goals, cash flow and budgeting.',
      keyIdeas: 'Cash flow is income minus spending over a period; it is the engine of every other financial goal. A budget is a plan for cash flow, not a punishment. Separate fixed costs, variable needs and wants. Goals should be specific, measurable and time-bound. Track before you plan: most people underestimate their spending.',
      objectives: ['Track a month of income and spending.', 'Build a budget that funds stated goals.', 'Write financial goals that are specific and time-bound.'],
      selfCheck: ['Do I know my monthly income after tax?', 'Do I know my three largest spending categories?', 'Can I name one goal and the date I want to reach it?'],
      readings: [
        R('OpenStax, Principles of Finance (2022): chapter on personal finance', 'https://openstax.org/details/books/principles-finance', 'Free, openly licensed textbook used throughout this course.'),
        R('Consumer Financial Protection Bureau, "Budgeting: How to create a budget and stick with it"', 'https://www.consumerfinance.gov/about-us/blog/budgeting-how-to-create-a-budget-and-stick-with-it/', 'Government guide.'),
        R('Consumer Financial Protection Bureau, Consumer tools', 'https://www.consumerfinance.gov/consumer-tools/', 'Free worksheets and guides on budgeting, credit, debt and housing.'),
        R('Board of Governors of the Federal Reserve System, Economic Well-Being of U.S. Households (annual report)', 'https://www.federalreserve.gov/publications/report-economic-well-being-us-households.htm', 'Data on how U.S. households save, borrow and handle emergencies.'),
      ],
      assignments: [
        L('Cash flow and budgets', 'Explain cash flow and the main budgeting approaches.', [
          'Read the OpenStax chapter and the CFPB budgeting guide.',
          'Explain cash flow, fixed and variable costs, and needs versus wants (about 200 words).',
          'Compare two budgeting methods (for example a percentage split and zero-based budgeting) and say which suits whom (about 200 words).',
        ], rub(['Accurate explanation of cash flow and cost types', 5], ['Fair comparison of budgeting methods', 5])),
        P('Budget for a household', 'Build a working budget from a fictional household’s numbers.', 'Case data (supplied by this course; fictional).\n\nJordan, 27, earns $3,400 a month after tax. Rent $1,250; utilities and phone $180; groceries $420; eating out $310; car payment $290; car insurance and fuel $230; student loan $210; subscriptions $65; clothing and personal $150; giving $50. Savings: $600 in a checking account. Credit card balance: $2,100 at 24% APR, paying the $45 minimum. Goals: a $5,000 emergency fund within a year and paying off the card.', [
          'Organise the spending into fixed, variable needs and wants, and calculate monthly cash flow.',
          'Propose a revised budget that funds both goals, showing what changes and why.',
          'Calculate how many months each goal takes under your budget.',
          'Write a 300-word note explaining the trade-offs.',
        ], rub(['Correct categorisation and cash flow', 5], ['Realistic revised budget', 6], ['Correct timelines for both goals', 5], ['Clear explanation of trade-offs', 4])),
        D('My money map', 'Build your own cash-flow map and goals, or a fully worked fictional one if you prefer to keep your finances private.', [
          'Track a month of income and spending (or build a realistic fictional profile).',
          'Summarise it in categories with a chart.',
          'Write three specific, measurable, time-bound goals, and link each to your values in a sentence.',
          'Build a budget that funds the goals, and say what you will review each month.',
          'Keep account numbers and other identifying details out of anything you submit.',
        ], rub(['Complete, categorised cash-flow record', 8], ['Clear chart', 5], ['Specific, time-bound goals tied to values', 8], ['Workable budget and review routine', 9]), 'A cash-flow map and budget showing you can plan money around clear goals.'),
      ],
    });

    const m2 = M('Asset Creation: Earning and Saving', {
      duration: '2 weeks',
      overview: 'Assets are built from the gap between what you earn and what you spend. This module covers raising income, reading a paycheck, building an emergency fund and choosing where to keep savings.',
      keyIdeas: 'Income is the largest lever: skills, negotiation and side income often matter more than cutting small expenses. Gross pay minus taxes and deductions is net pay. Pay yourself first by automating savings. An emergency fund (often three to six months of essential expenses) prevents debt when something goes wrong. Federally insured bank and credit union accounts protect deposits up to legal limits.',
      objectives: ['Read a pay stub and explain each deduction.', 'Plan an emergency fund.', 'Compare savings options on safety, access and return.'],
      selfCheck: ['What is the difference between my gross and net pay?', 'How many months of essential expenses do I have saved?', 'Is my savings account insured?'],
      readings: [
        R('OpenStax, Principles of Finance (2022): chapters on the time value of money', 'https://openstax.org/details/books/principles-finance', 'Free textbook.'),
        R('Federal Deposit Insurance Corporation, Deposit insurance', 'https://www.fdic.gov/resources/deposit-insurance', 'Official guide to how bank deposits are protected.'),
        R('Internal Revenue Service, Federal income tax rates and brackets', 'https://www.irs.gov/filing/federal-income-tax-rates-and-brackets', 'Official guide.'),
        R('U.S. Bureau of Labor Statistics, Occupational Outlook Handbook', 'https://www.bls.gov/ooh/', 'Pay and job outlook for hundreds of occupations.'),
      ],
      assignments: [
        L('Reading a paycheck', 'Explain how gross pay becomes net pay.', [
          'Read the IRS page on tax brackets.',
          'Explain marginal versus effective tax rates with a numerical example of your own (about 200 words).',
          'List the usual deductions on a U.S. pay stub (federal and state income tax, Social Security, Medicare, retirement and health contributions) and explain each in a sentence.',
        ], rub(['Correct marginal versus effective example', 5], ['Accurate list of deductions', 5])),
        P('Raising income: a career research brief', 'Research how an occupation pays and what raises earnings in it.', 'Research brief (supplied by this course).\n\nChoose an occupation you hold or want. Using the BLS Occupational Outlook Handbook and at least two other reliable sources, find:\n1. Median pay and the pay range.\n2. Job outlook for the next ten years.\n3. Credentials or skills that raise pay.\n4. Typical ways people in the field add income (overtime, certification, freelance work, promotion).\n\nCite every figure.', [
          'Choose the occupation and gather the data.',
          'Write a 600–800-word brief answering the four questions.',
          'End with one concrete step that could raise your income within a year.',
        ], rub(['Sourced pay and outlook data', 6], ['Credentials and skills identified', 5], ['Realistic income strategies', 5], ['Concrete next step', 4])),
        D('Emergency fund and savings plan', 'Design an emergency fund and savings system.', [
          'Calculate essential monthly expenses (your own or a fictional profile).',
          'Set a target of three to six months and justify where in the range you land.',
          'Compare at least three places to keep it (savings account, money market account, certificates of deposit) on safety, access and interest.',
          'Design an automatic savings routine and a timeline to reach the target.',
          'Explain what counts as an emergency and how you will refill the fund.',
        ], rub(['Correct essential-expense calculation', 6], ['Justified target', 6], ['Sound comparison of options', 8], ['Workable automation, timeline and rules', 10]), 'A savings plan showing you can protect against financial shocks.'),
      ],
    });

    const m3 = M('Debt and Credit', {
      duration: '2 weeks',
      overview: 'Debt can build assets or drain them. This module covers interest, credit reports and scores, repayment strategies, and your rights when dealing with lenders and collectors.',
      keyIdeas: 'APR is the yearly cost of borrowing; compound interest works against borrowers. Credit scores are built mainly from payment history, amounts owed, length of history, new credit and credit mix. You can get free credit reports and should dispute errors. The avalanche method pays the highest rate first; the snowball method pays the smallest balance first. Federal law limits what debt collectors may do.',
      objectives: ['Calculate the true cost of a loan.', 'Read a credit report and identify what drives a score.', 'Compare debt-repayment strategies.'],
      selfCheck: ['What APR am I paying on each debt?', 'When did I last check my credit report?', 'Which debt would I pay first, and why?'],
      readings: [
        R('Consumer Financial Protection Bureau, Credit reports and scores', 'https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/', 'Government guide.'),
        R('Consumer Financial Protection Bureau, "What is a credit score?"', 'https://www.consumerfinance.gov/ask-cfpb/what-is-a-credit-score-en-315/', 'Government guide.'),
        R('AnnualCreditReport.com', 'https://www.annualcreditreport.com/', 'The official site for free credit reports from the three national bureaus.'),
        R('Consumer Financial Protection Bureau, Debt collection', 'https://www.consumerfinance.gov/consumer-tools/debt-collection/', 'Your rights with debt collectors.'),
      ],
      assignments: [
        L('How credit works', 'Explain interest, credit scores and your rights.', [
          'Read the CFPB pages.',
          'Explain APR and how a credit card balance grows when only the minimum is paid (about 150 words).',
          'Explain the five factors behind a credit score (about 150 words).',
          'Name two rights you have when a debt collector contacts you.',
        ], rub(['Accurate explanation of APR and minimum payments', 4], ['Correct score factors', 4], ['Correct collector rights', 2])),
        P('Avalanche or snowball?', 'Compare repayment strategies on a fictional set of debts.', 'Case data (supplied by this course; fictional).\n\nSam has $400 a month to put toward debt beyond minimum payments.\n- Store card: $900 at 28% APR, minimum $35.\n- Credit card: $4,200 at 22% APR, minimum $110.\n- Car loan: $7,800 at 7% APR, minimum $240.\n- Student loan: $14,000 at 5% APR, minimum $160.\n\nUse a spreadsheet or an online amortisation calculator.', [
          'Model the avalanche method: months to pay off each debt and total interest paid.',
          'Model the snowball method in the same way.',
          'Compare the results in a table.',
          'Write a 300-word recommendation that weighs cost against motivation.',
        ], rub(['Correct avalanche model', 6], ['Correct snowball model', 6], ['Clear comparison table', 4], ['Reasoned recommendation', 4])),
        D('Credit and debt plan', 'Build a credit-health and debt plan.', [
          'Pull your free credit report (or use a sample report from the CFPB) and summarise what it shows, without including account numbers.',
          'List any errors and how you would dispute them.',
          'List debts with balance, APR and minimum payment (your own or a fictional set).',
          'Choose a repayment strategy, show the timeline, and calculate interest saved.',
          'Write three habits that will improve or protect the credit score.',
        ], rub(['Clear report summary and dispute steps', 8], ['Complete debt inventory', 6], ['Correct timeline and interest saved', 10], ['Practical credit habits', 6]), 'A credit and debt plan showing you can manage borrowing deliberately.'),
      ],
    });

    const m4 = M('Asset Creation: Investing Basics', {
      duration: '3 weeks',
      overview: 'Investing lets money grow faster than inflation over long periods, with risk. This module covers compound growth, risk and return, diversification, funds and fees. It teaches how investing works; it does not tell you what to buy.',
      keyIdeas: 'Compound growth means returns earn returns; time matters more than timing. Higher expected return comes with higher risk. Diversification spreads risk across many investments. Asset allocation, the mix of stocks, bonds and cash, should match your time horizon and tolerance for loss. Mutual funds and exchange-traded funds pool many investments; index funds track a market at low cost. Fees compound too.',
      objectives: ['Calculate compound growth over time.', 'Explain risk, return and diversification.', 'Compare funds on fees, holdings and risk.'],
      selfCheck: ['How much would $100 a month become in 30 years at 6%?', 'What is the difference between a stock and a bond?', 'What does a 1% fee cost over 30 years?'],
      readings: [
        R('U.S. Securities and Exchange Commission, Investor.gov: Introduction to investing', 'https://www.investor.gov/introduction-investing', 'Official, non-commercial guide.'),
        R('Investor.gov, Asset allocation', 'https://www.investor.gov/introduction-investing/getting-started/asset-allocation', 'Official guide.'),
        R('Investor.gov, Mutual funds and exchange-traded funds', 'https://www.investor.gov/introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-1', 'Official guide.'),
        R('Investor.gov, Compound interest calculator', 'https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator', 'Free tool used in this module.'),
        R('OpenStax, Principles of Finance (2022): chapters on risk and return', 'https://openstax.org/details/books/principles-finance', 'Free textbook.'),
      ],
      assignments: [
        L('The basics of investing', 'Explain the core ideas of investing in plain language.', [
          'Read the Investor.gov pages.',
          'Explain stocks, bonds and cash; risk and return; and diversification (about 100 words each).',
          'Use the compound interest calculator to show what $100 a month becomes after 10, 20 and 30 years at 6%, and describe the pattern.',
        ], rub(['Accurate explanations', 6], ['Correct calculations and pattern described', 4])),
        P('The cost of fees', 'Measure how fees and time change investment outcomes.', 'Case data (supplied by this course; fictional).\n\nTwo investors each put $250 a month into funds earning 7% a year before fees, for 35 years.\n- Investor A pays 0.05% a year in fund fees.\n- Investor B pays 1.25% a year.\nA third investor, C, pays 0.05% but starts ten years later and invests $400 a month for 25 years.', [
          'Calculate the ending balance for A, B and C (use the calculator with net return = return − fee).',
          'Calculate the dollar cost of B’s higher fees.',
          'Compare A and C and explain what the comparison shows about time.',
          'Write up the results in a table and a 300-word explanation.',
        ], rub(['Correct balances for all three', 8], ['Correct fee cost', 4], ['Insightful comparison of A and C', 4], ['Clear presentation', 4])),
        D('Investing policy statement', 'Write an investing policy statement for a fictional investor.', [
          'Use a fictional investor: age, goal, time horizon, income, emergency fund and tolerance for loss.',
          'State the objective and constraints.',
          'Propose an asset allocation with reasons, and the kind of fund (not a named product) for each part.',
          'Set rules for contributions, rebalancing and what to do in a market fall.',
          'Add a note on fees and on when to seek a licensed, fee-only adviser.',
        ], rub(['Clear objective and constraints', 6], ['Allocation fits horizon and risk', 10], ['Sound contribution and rebalancing rules', 8], ['Attention to fees and professional advice', 6]), 'An investing policy statement showing you understand risk, diversification and long-term discipline.'),
      ],
    });

    const m5 = M('Asset Maintenance: Insurance, Risk and Fraud', {
      duration: '2 weeks',
      overview: 'Maintaining assets means protecting them. This module covers managing risk with insurance, and protecting yourself from identity theft and fraud.',
      keyIdeas: 'Risk can be avoided, reduced, retained or transferred; insurance transfers it for a premium. Deductibles, premiums and coverage limits trade off against each other. Key coverages: health, auto, renters or homeowners, disability and life. Insure against losses you could not absorb. Identity theft and scams target urgency and trust; freeze credit, use strong authentication, and verify before you pay.',
      objectives: ['Match risks to insurance and other strategies.', 'Compare policies on premium, deductible and coverage.', 'Build a fraud-prevention routine.'],
      selfCheck: ['Which loss would I be unable to absorb?', 'What is my deductible on each policy?', 'Is my credit frozen?'],
      readings: [
        R('OpenStax, Principles of Finance (2022): chapter on risk management and insurance', 'https://openstax.org/details/books/principles-finance', 'Free textbook.'),
        R('HealthCare.gov', 'https://www.healthcare.gov/', 'Official site explaining health insurance terms and marketplace plans.'),
        R('Federal Trade Commission, IdentityTheft.gov', 'https://www.identitytheft.gov/', 'Official site for reporting and recovering from identity theft.'),
        R('Consumer Financial Protection Bureau, Consumer tools', 'https://www.consumerfinance.gov/consumer-tools/', 'Guides on fraud and scams.'),
      ],
      assignments: [
        L('Managing risk', 'Explain the four ways to handle risk and the main kinds of insurance.', [
          'Read the OpenStax chapter.',
          'Explain avoid, reduce, retain and transfer with an example of each (about 200 words).',
          'Explain premium, deductible, coinsurance and coverage limit in a sentence each.',
        ], rub(['Correct strategies with examples', 6], ['Accurate insurance terms', 4])),
        P('Choosing a health plan', 'Compare health insurance plans for a fictional person.', 'Case data (supplied by this course; fictional).\n\nAlex expects two doctor visits, one specialist visit and a monthly prescription this year, with a small chance of a hospital stay.\n- Plan A: premium $310/month; deductible $1,000; then 20% coinsurance; out-of-pocket maximum $4,000; visits $30 copay.\n- Plan B: premium $190/month; deductible $4,500; then 30% coinsurance; out-of-pocket maximum $8,000; visits full price until the deductible (about $150 each); eligible for a health savings account.', [
          'Calculate Alex’s yearly cost under each plan in an ordinary year.',
          'Calculate each plan’s worst-case yearly cost.',
          'Explain how a health savings account changes the comparison.',
          'Recommend a plan in 300 words.',
        ], rub(['Correct ordinary-year costs', 6], ['Correct worst-case costs', 6], ['Understanding of the HSA', 4], ['Reasoned recommendation', 4])),
        D('Risk and protection plan', 'Build a protection plan for a household.', [
          'List the household’s major risks (your own in general terms, or a fictional household).',
          'For each, choose avoid, reduce, retain or transfer, with reasons.',
          'List insurance needed, with the coverage and deductible you would choose.',
          'Write a fraud-prevention routine: credit freezes, account alerts, authentication, how to verify requests for money.',
          'Add a one-page "what to do if" sheet for identity theft.',
        ], rub(['Complete risk inventory', 6], ['Sound strategy for each risk', 8], ['Appropriate coverage choices', 8], ['Practical fraud routine and response sheet', 8]), 'A protection plan showing you can safeguard assets against loss and fraud.'),
      ],
    });

    const m6 = M('Asset Maintenance: Taxes, Retirement and Legacy', {
      duration: '3 weeks',
      overview: 'Keeping more of what you build depends on taxes, retirement accounts and planning for what happens to your assets. This module covers tax-advantaged accounts, Social Security and the basic estate documents.',
      keyIdeas: 'Tax-advantaged accounts such as 401(k)s and IRAs trade tax now against tax later; Roth accounts are taxed now and grow tax-free. Employer matches are part of pay. Social Security benefits depend on earnings history and claiming age. Core estate documents: a will, beneficiary designations, a durable power of attorney and a health-care directive. Beneficiary designations override a will for many accounts.',
      objectives: ['Compare traditional and Roth retirement accounts.', 'Estimate retirement savings needs.', 'Identify the estate documents every adult should consider.'],
      selfCheck: ['Am I getting my full employer match?', 'Who are my named beneficiaries?', 'Do I have a durable power of attorney?'],
      readings: [
        R('Internal Revenue Service, Individual retirement arrangements (IRAs)', 'https://www.irs.gov/retirement-plans/individual-retirement-arrangements-iras', 'Official guide.'),
        R('Internal Revenue Service, Roth IRAs', 'https://www.irs.gov/retirement-plans/roth-iras', 'Official guide.'),
        R('Social Security Administration, my Social Security account', 'https://www.ssa.gov/myaccount/', 'See your earnings record and benefit estimates.'),
        R('OpenStax, Principles of Finance (2022): chapter on retirement and financial planning', 'https://openstax.org/details/books/principles-finance', 'Free textbook.'),
      ],
      assignments: [
        L('Retirement accounts and taxes', 'Explain how tax-advantaged retirement accounts work.', [
          'Read the IRS IRA and Roth IRA pages.',
          'Compare traditional and Roth accounts on when tax is paid and who benefits from each (about 200 words).',
          'Explain an employer match and vesting with a numerical example.',
        ], rub(['Accurate comparison', 6], ['Correct match and vesting example', 4])),
        P('How much is enough?', 'Estimate retirement savings needs for a fictional worker.', 'Case data (supplied by this course; fictional).\n\nRiley is 30, earns $60,000, and expects to need 75% of pre-retirement income in retirement. Estimated Social Security at 67: $1,900 a month in today’s dollars. Assume a 4% withdrawal rate and a 5% real return. Current savings: $15,000. Employer matches 50% of contributions up to 6% of salary.', [
          'Calculate the yearly income gap Social Security does not cover.',
          'Calculate the savings target using the 4% rule.',
          'Calculate the monthly saving needed from 30 to 67 to reach it, counting the current balance and the match.',
          'Explain three assumptions that would most change the answer.',
        ], rub(['Correct income gap', 4], ['Correct savings target', 4], ['Correct monthly saving', 8], ['Key assumptions explained', 4])),
        D('Legacy and estate checklist', 'Build an estate-planning checklist and family information sheet.', [
          'Explain in plain language what a will, beneficiary designation, durable power of attorney and health-care directive each do.',
          'Build a checklist an adult could use to see which they have and which they need.',
          'Design a family information sheet listing where documents and accounts are kept, with no account numbers or passwords.',
          'Add a note on when to consult an estate attorney.',
        ], rub(['Accurate explanation of each document', 10], ['Usable checklist', 8], ['Safe, useful information sheet', 7], ['Sound guidance on professional help', 5]), 'An estate checklist showing you can plan for the transfer of assets.'),
      ],
    });

    const modules = [m1, m2, m3, m4, m5, m6];
    const capstone = S.makeCapstone({
      title: 'Capstone: Financial Freedom Plan', status: 'ready', weight: 20, createdAt: new Date().toISOString(),
      overview: 'Bring every module together into one financial plan: cash flow, savings, debt, investing, protection and legacy. You may plan for yourself or for a fully fictional household.',
      prepares: {
        modules: [
          { id: m1.id, why: 'Your money map and goals are the plan’s foundation.' },
          { id: m2.id, why: 'The emergency fund is the first line of defence.' },
          { id: m3.id, why: 'The debt plan frees cash flow for assets.' },
          { id: m4.id, why: 'The investing policy statement guides long-term growth.' },
          { id: m5.id, why: 'The protection plan keeps assets safe.' },
          { id: m6.id, why: 'Retirement and estate planning complete the plan.' },
        ],
        objectives: ['Write a complete, coherent personal financial plan.', 'Show how each part supports the stated goals.', 'Set a review routine.'],
        skills: ['Budgeting', 'Debt management', 'Investment literacy', 'Risk management', 'Financial planning'],
      },
      assignments: [A('Financial freedom plan', '', {
        kind: 'demonstrate', basis: 'portfolio', points: 100, format: 'any', estimate: '3–4 weeks',
        purpose: 'Write a complete financial plan that moves a household from its current position toward financial independence, with every decision justified.',
        steps: [
          'Profile: the household’s situation, values and goals (your own or fictional; never include account numbers).',
          'Net worth statement and cash-flow summary.',
          'Budget, emergency fund and debt plan.',
          'Investing policy statement and retirement projection.',
          'Protection plan: insurance and fraud prevention.',
          'Estate checklist and legacy goals.',
          'A one-page action list for the next 90 days and a yearly review routine.',
        ],
        submit: 'One PDF of the complete plan, with charts and calculations.',
        rubric: rub(['Clear profile, goals and net worth', 15], ['Budget, emergency fund and debt plan', 25], ['Investing and retirement', 25], ['Protection and estate planning', 20], ['Action list, review routine and coherence', 15]),
        portfolioNote: 'The course’s culminating project: a complete, justified financial plan.',
      })],
    });

    return C('FIN 101', 'Financial Freedom', 3,
      'Build the knowledge and habits to create, protect and grow your own financial independence: cash flow, saving, credit, investing, insurance, retirement and legacy.',
      modules, {
        objective: 'Understand how assets are created and maintained, and plan a household’s finances toward independence.',
        deliverable: 'A complete financial freedom plan (the course capstone).',
        duration: '14 weeks',
        outcomes: [
          'Track cash flow and build a goal-based budget.',
          'Plan an emergency fund and savings system.',
          'Manage credit and compare debt-repayment strategies.',
          'Explain compound growth, risk, diversification and fees.',
          'Use insurance and fraud prevention to protect assets.',
          'Explain retirement accounts, Social Security and core estate documents.',
        ],
        syllabus: 'Modules 1–4 cover asset creation: cash flow, earning and saving, debt and credit, and investing. Modules 5–6 cover asset maintenance: insurance, fraud protection, taxes, retirement and legacy. Each module has a Learn assignment (10 points), an Apply assignment (20 points) and a Demonstrate assignment (30 points). The capstone counts for 20% of the course grade.\n\nThe core readings are free: the OpenStax Principles of Finance textbook and official guides from the CFPB, SEC, IRS, FDIC and Social Security Administration.\n\nThis course is general financial education, not personalised financial, investment, tax or legal advice. Case studies are fictional. You may use your own finances or a fictional household; never submit account numbers, passwords or government ID numbers.',
        capstone,
      });
  }

  // Starter course: Feminism. A survey of feminist thought, history and practice.
  function feminismCourse() {
    const m1 = M('What Is Feminism?', {
      duration: '2 weeks',
      overview: 'Feminism is a body of thought, a history of movements and a practice. This module starts with definitions, common misconceptions and the idea that gender is a system of power, not only an identity.',
      keyIdeas: 'bell hooks defines feminism as a movement to end sexism, sexist exploitation and oppression: a definition aimed at a system, not at men. Sex and gender are distinct concepts with contested boundaries. Patriarchy names social arrangements that privilege men and masculinity. The "waves" model is a useful shorthand but hides continuities and the work of women of colour, working-class and colonised women.',
      objectives: ['Define feminism and explain several competing definitions.', 'Distinguish sex, gender and patriarchy.', 'Assess the strengths and limits of the "waves" model.'],
      selfCheck: ['Can I state hooks’s definition and explain why it targets a system?', 'What does the waves model leave out?', 'Where did my own first ideas about feminism come from?'],
      readings: [
        R('bell hooks, Feminism Is for Everybody: Passionate Politics (South End Press, 2000), chapters 1–3', '', 'Book. Short and accessible; the course’s opening text.'),
        R('Chimamanda Ngozi Adichie, "We Should All Be Feminists" (TEDxEuston, 2012)', 'https://www.ted.com/talks/chimamanda_ngozi_adichie_we_should_all_be_feminists', 'Talk, about 30 minutes. Also published as a short book (2014).'),
        R('Sara Ahmed, Living a Feminist Life (Duke University Press, 2017), Introduction', '', 'Book.'),
      ],
      assignments: [
        L('Defining feminism', 'Compare definitions of feminism and explain your own working definition.', [
          'Read hooks, chapters 1–3, and watch Adichie’s talk.',
          'Summarise each author’s definition of feminism in your own words (about 150 words each).',
          'Write a working definition of your own and say what it includes and excludes (about 150 words).',
        ], rub(['Accurate summaries', 6], ['Thoughtful working definition', 4])),
        P('Feminism in the headlines', 'Analyse how feminism is represented in public discussion.', 'Media log (supplied by this course).\n\nCollect five recent items (news articles, opinion pieces, advertisements, social media posts from public accounts) that mention feminism or feminists. For each record:\n1. Source and date.\n2. How feminism is defined or implied.\n3. Who is speaking and to whom.\n4. Whether the item matches hooks’s definition, and where it departs.\n\nDo not include private individuals’ names or posts from private accounts.', [
          'Collect and log five items.',
          'Identify patterns across them.',
          'Write a 600–800-word analysis comparing public representations with the course definitions.',
        ], rub(['Five varied, well-documented items', 5], ['Accurate use of course definitions', 6], ['Patterns identified', 5], ['Clear, well-supported writing', 4])),
        D('Feminist reading journal: starting point', 'Begin a reading journal that records how your thinking changes through the course.', [
          'Write a 600-word opening entry: what you think feminism is, where those ideas came from, and what you want to learn.',
          'Choose three passages from this module’s readings and respond to each (about 200 words each).',
          'End with three questions you will carry through the course.',
        ], rub(['Honest, specific opening entry', 8], ['Close engagement with three passages', 14], ['Productive questions', 8]), 'The first entry of a reading journal tracing the development of your feminist thinking.'),
      ],
    });

    const m2 = M('Rights and Suffrage: Early Feminist Thought', {
      duration: '2 weeks',
      overview: 'Modern feminist argument begins in the age of revolutions, when claims of universal rights collided with women’s exclusion. This module reads founding texts of the women’s rights and suffrage movements and asks whom they included.',
      keyIdeas: 'Wollstonecraft argued that women’s apparent inferiority came from denied education, not nature. The 1848 Declaration of Sentiments rewrote the Declaration of Independence to include women. Sojourner Truth’s 1851 speech exists in two very different versions, which raises questions about who records Black women’s voices. Mill and Taylor Mill argued that the legal subordination of women was a relic of the past. The Nineteenth Amendment (1920) did not secure the vote for many women of colour.',
      objectives: ['Explain the central arguments of early women’s rights texts.', 'Analyse the uses of rights language.', 'Assess the exclusions of the suffrage movement.'],
      selfCheck: ['What does Wollstonecraft blame for women’s condition?', 'Why do the two versions of Truth’s speech matter?', 'Who still could not vote after 1920, and why?'],
      readings: [
        R('Mary Wollstonecraft, A Vindication of the Rights of Woman (1792), Introduction and chapters 2–3', 'https://www.gutenberg.org/ebooks/3420', 'Public-domain text, Project Gutenberg.'),
        R('Declaration of Sentiments, Seneca Falls Convention (1848)', 'https://www.nps.gov/wori/learn/historyculture/declaration-of-sentiments.htm', 'Full text, National Park Service.'),
        R('National Park Service, "Sojourner Truth: Ain’t I A Woman?"', 'https://www.nps.gov/articles/sojourner-truth.htm', 'Both versions of the 1851 speech and their history.'),
        R('John Stuart Mill, The Subjection of Women (1869), chapter 1', 'https://www.gutenberg.org/ebooks/27083', 'Public-domain text, Project Gutenberg. Mill credits Harriet Taylor Mill as co-author of his ideas.'),
        R('National Archives, 19th Amendment to the U.S. Constitution', 'https://www.archives.gov/milestone-documents/19th-amendment', 'Primary source and historical background.'),
      ],
      assignments: [
        L('Arguments for women’s rights', 'Summarise and compare the arguments of three founding texts.', [
          'Read Wollstonecraft, the Declaration of Sentiments and Mill.',
          'Summarise each text’s main argument and its strongest piece of evidence (about 150 words each).',
          'Name one assumption the three share.',
        ], rub(['Accurate summaries', 6], ['Insightful shared assumption', 4])),
        P('Two versions of Sojourner Truth', 'Compare the two records of Truth’s 1851 speech.', 'Source comparison (supplied by this course).\n\nUse the National Park Service page, which reproduces Marius Robinson’s 1851 report and Frances Dana Gage’s 1863 version.\n\nCompare: language and dialect; the famous refrain; length and content; who recorded each and when; what each recorder may have wanted readers to feel.', [
          'Read both versions closely.',
          'Build a comparison table on the five points.',
          'Write a 600–800-word analysis: what does the difference show about who records whose voice?',
        ], rub(['Careful comparison table', 6], ['Attention to language and recorders', 6], ['Argument about voice and record', 6], ['Clear writing', 2])),
        D('Rewriting the declaration', 'Write a declaration of rights for a group excluded today, modelled on the Declaration of Sentiments.', [
          'Choose a group whose rights you think are denied or limited today.',
          'Research the situation using at least three reliable sources.',
          'Write a declaration (500–700 words) that, like the 1848 text, adapts a founding document’s form.',
          'Add a 600-word commentary explaining your choices and what the form does rhetorically.',
        ], rub(['Effective adaptation of the declaration form', 8], ['Grievances grounded in research', 8], ['Insightful commentary on rhetoric', 10], ['Sources cited', 4]), 'A rhetorical declaration and commentary showing you can use and analyse the language of rights.'),
      ],
    });

    const m3 = M('The Personal Is Political', {
      duration: '2 weeks',
      overview: 'Mid-twentieth-century feminism turned to the home, the body, sexuality and everyday life as sites of power. This module reads key texts of that era and their critics.',
      keyIdeas: 'Beauvoir: "one is not born, but rather becomes, a woman"; woman is constructed as man’s Other. Friedan named "the problem that has no name": the dissatisfaction of educated suburban housewives. Consciousness-raising groups turned private experience into political analysis. Lorde and hooks criticised the movement for treating white, middle-class women’s experience as universal. Gilman’s 1892 story shows how medical authority could silence women decades earlier.',
      objectives: ['Explain "the personal is political" and its origins.', 'Analyse how texts of this era theorised gender.', 'Evaluate critiques of universalism within the movement.'],
      selfCheck: ['What does Beauvoir mean by "becoming" a woman?', 'Whose problem was "the problem that has no name"?', 'What does Lorde say about difference?'],
      readings: [
        R('Simone de Beauvoir, The Second Sex (1949), Introduction (trans. Constance Borde and Sheila Malovany-Chevallier, Knopf, 2010)', '', 'Book.'),
        R('Betty Friedan, The Feminine Mystique (1963), chapter 1, "The Problem That Has No Name"', '', 'Book.'),
        R('Audre Lorde, "The Master’s Tools Will Never Dismantle the Master’s House" and "Age, Race, Class, and Sex: Women Redefining Difference," in Sister Outsider (Crossing Press, 1984)', '', 'Book of essays.'),
        R('Charlotte Perkins Gilman, "The Yellow Wall-Paper" (1892)', 'https://www.gutenberg.org/ebooks/1952', 'Public-domain short story, Project Gutenberg.'),
      ],
      assignments: [
        L('From private trouble to political issue', 'Explain how this era turned personal experience into political analysis.', [
          'Read Beauvoir’s introduction, Friedan’s first chapter and Lorde’s essays.',
          'Explain "the personal is political" with an example from the readings (about 200 words).',
          'Summarise Lorde’s critique of Friedan-era feminism (about 150 words).',
        ], rub(['Clear explanation with example', 5], ['Accurate account of Lorde’s critique', 5])),
        P('Reading "The Yellow Wall-Paper"', 'Analyse Gilman’s story as a feminist text.', 'Close-reading guide (supplied by this course).\n\nRead the story and mark:\n1. Every mention of the wallpaper and how its description changes.\n2. Moments when the narrator’s husband or brother speaks for her.\n3. Moments of writing and of concealment.\n4. The final scene.\n\nRelate your observations to Beauvoir’s idea of woman as Other or to Friedan’s "problem that has no name."', [
          'Annotate the story using the guide.',
          'Write a 900–1,100-word essay arguing how the story represents medical and marital authority.',
          'Quote the story precisely and connect it to one theoretical reading.',
        ], rub(['Clear, arguable thesis', 5], ['Precise use of textual evidence', 7], ['Connection to theory', 5], ['Organisation and style', 3])),
        D('Consciousness-raising, then and now', 'Design and document a consciousness-raising-style discussion and analyse it.', [
          'Research how 1960s–70s consciousness-raising groups worked, using at least two sources.',
          'Design a discussion guide on one everyday topic (for example housework, dress codes, safety at night).',
          'Hold a discussion with willing participants who consent to being included, or write a detailed reflective journal on the questions yourself.',
          'Write a 1,000-word analysis of what personal experiences revealed about structures, keeping all participants anonymous.',
        ], rub(['Researched account of the method', 6], ['Thoughtful discussion guide', 6], ['Ethical, anonymous documentation', 6], ['Analysis linking experience to structure', 12]), 'A documented discussion and analysis showing how personal experience reveals political structures.'),
      ],
    });

    const m4 = M('Intersectionality and Black Feminist Thought', {
      duration: '2 weeks',
      overview: 'Black feminist thinkers showed that race, gender, class and sexuality do not act separately. This module reads the Combahee River Collective and Kimberlé Crenshaw and follows the concept of intersectionality from law into wider use.',
      keyIdeas: 'The Combahee River Collective (1977) described "interlocking" systems of oppression and coined "identity politics" as politics grounded in one’s own experience. Crenshaw (1989) showed how anti-discrimination law, by treating race and sex as separate, failed Black women. Patricia Hill Collins described a "matrix of domination." Intersectionality is an analytic tool about structures, not a list of identities.',
      objectives: ['Explain the origins and meaning of intersectionality.', 'Apply intersectional analysis to a law, policy or institution.', 'Distinguish structural analysis from identity lists.'],
      selfCheck: ['What problem did Crenshaw find in the DeGraffenreid case?', 'What did the Combahee River Collective mean by identity politics?', 'Can I apply intersectionality without just listing identities?'],
      readings: [
        R('The Combahee River Collective Statement (1977)', 'https://www.blackpast.org/african-american-history/combahee-river-collective-statement-1977/', 'Full text, BlackPast.org.'),
        R('Kimberlé Crenshaw, "Demarginalizing the Intersection of Race and Sex: A Black Feminist Critique of Antidiscrimination Doctrine, Feminist Theory and Antiracist Politics," University of Chicago Legal Forum 1989, no. 1: 139–167', 'https://chicagounbound.uchicago.edu/uclf/vol1989/iss1/8', 'Free from the journal’s university repository.'),
        R('Patricia Hill Collins, Black Feminist Thought (Routledge, 1990; 2nd ed. 2000), chapter 1', '', 'Book.'),
        R('Angela Y. Davis, Women, Race and Class (Random House, 1981), chapters 1 and 4', '', 'Book.'),
      ],
      assignments: [
        L('Where intersectionality comes from', 'Explain the origins and meaning of intersectionality.', [
          'Read the Combahee River Collective Statement and Crenshaw (1989).',
          'Summarise Crenshaw’s analysis of one of the cases she discusses (about 200 words).',
          'Explain how the Collective’s idea of interlocking oppressions anticipates Crenshaw (about 150 words).',
        ], rub(['Accurate case summary', 5], ['Clear connection between the texts', 5])),
        P('Intersectional policy analysis', 'Analyse a policy or institution using intersectionality.', 'Policy analysis guide (supplied by this course).\n\nChoose a policy, workplace rule or public programme (for example a dress code, a hiring process, a public benefit rule, a school discipline policy). Answer:\n1. Who is the policy written for, and who is assumed to be the typical person?\n2. How might it affect people at different intersections of race, gender, class, disability or immigration status?\n3. What evidence shows these effects? (Use at least three sources.)\n4. What change would address the gap?', [
          'Choose the policy and gather sources.',
          'Answer the four questions in a 900–1,100-word analysis.',
          'Avoid simply listing identities: show how structures produce the effects.',
        ], rub(['Clear account of the policy', 4], ['Structural, intersectional analysis', 8], ['Evidence from sources', 5], ['Reasoned recommendation', 3])),
        D('Intersectionality explainer', 'Create an explainer that teaches intersectionality accurately to a general audience.', [
          'Choose a form: illustrated guide, short video, podcast episode, zine or slide deck.',
          'Explain the concept’s origin in Black feminist thought and law, citing the Collective and Crenshaw.',
          'Use one worked example showing structures, not just identities.',
          'Address one common misunderstanding.',
          'Add a 300-word note on your design choices and sources.',
        ], rub(['Accurate account of origins', 8], ['Clear worked example', 8], ['Misunderstanding addressed', 6], ['Effective design and sources', 8]), 'A public explainer showing you can teach intersectionality accurately.'),
      ],
    });

    const m5 = M('Bodies, Gender and Representation', {
      duration: '2 weeks',
      overview: 'Feminist theory asks how bodies are seen, regulated and represented, and whether gender is something we are or something we do. This module covers performativity, the gaze and the politics of representation.',
      keyIdeas: 'Butler argues that gender is performative: produced through repeated acts rather than expressing an inner essence. Laura Mulvey’s "male gaze" describes how classic film positions women as objects of looking. Representation shapes what seems normal and possible. Feminist debates over sexuality, beauty, reproduction and trans inclusion show that feminism is not one position.',
      objectives: ['Explain performativity and the male gaze.', 'Analyse representation in a media text.', 'Map a live debate within feminism fairly.'],
      selfCheck: ['How does "performative" differ from "performance"?', 'Who is the assumed viewer in an image I see daily?', 'Can I state the strongest version of a position I disagree with?'],
      readings: [
        R('Judith Butler, "Performative Acts and Gender Constitution," Theatre Journal 40, no. 4 (1988): 519–531', '', 'Article. Find it through a library (JSTOR).'),
        R('Laura Mulvey, "Visual Pleasure and Narrative Cinema," Screen 16, no. 3 (1975): 6–18', 'https://doi.org/10.1093/screen/16.3.6', 'Article. Publisher’s page; full text through a library.'),
        R('Chimamanda Ngozi Adichie, "The Danger of a Single Story" (TEDGlobal, 2009)', 'https://www.ted.com/talks/chimamanda_ngozi_adichie_the_danger_of_a_single_story', 'Talk, about 19 minutes.'),
      ],
      assignments: [
        L('Performativity and the gaze', 'Explain two key theories of gender and representation.', [
          'Read Butler and Mulvey.',
          'Explain performativity in your own words with an everyday example (about 200 words).',
          'Explain the male gaze and apply it to one image or scene (about 200 words).',
        ], rub(['Accurate account of performativity', 5], ['Correct application of the gaze', 5])),
        P('Media analysis', 'Analyse gender representation in a film, series, advertising campaign or music video.', 'Analysis guide (supplied by this course).\n\nChoose one media text. Record:\n1. Who is shown, and how (framing, camera, costume, voice).\n2. Who looks and who is looked at.\n3. What stories are told about gender, and which are missing (a "single story"?).\n4. How the text might be read differently by different audiences.', [
          'Watch or view the text closely, taking notes with timestamps or figure references.',
          'Write a 900–1,100-word analysis using Mulvey or Butler and Adichie.',
          'Include at least three precise examples.',
        ], rub(['Clear thesis', 4], ['Precise visual and textual evidence', 7], ['Effective use of theory', 6], ['Attention to audience', 3])),
        D('Mapping a feminist debate', 'Map a live debate within feminism fairly and take a reasoned position.', [
          'Choose a debate (for example sex work, pornography, beauty norms, reproductive technology, trans inclusion, carceral approaches to violence).',
          'Find at least four sources from feminist writers on different sides.',
          'Summarise each position in its strongest form.',
          'Write a 1,200–1,500-word essay setting out the debate and arguing your own position with respect for the others.',
        ], rub(['Fair, strong summaries of each position', 10], ['Range of credible sources', 6], ['Reasoned position', 10], ['Respectful, clear writing', 4]), 'A debate map and essay showing you can engage disagreement within feminism fairly.'),
      ],
    });

    const m6 = M('Work, Care and Economic Justice', {
      duration: '2 weeks',
      overview: 'Who does paid and unpaid work, and how it is valued, is central to feminist economics. This module covers the wage gap, occupational segregation, care work and social reproduction.',
      keyIdeas: 'Social reproduction is the work of sustaining people day to day and across generations: cooking, cleaning, caring, teaching. Unpaid care work is mostly done by women and is left out of GDP. Wage gaps reflect occupational segregation, discrimination, and penalties for motherhood. Paid care work is often done by women of colour and migrants for low pay. Policy choices (leave, childcare, minimum wages) shape these patterns.',
      objectives: ['Explain social reproduction and the value of unpaid work.', 'Interpret official labour data by gender.', 'Evaluate a care-work policy.'],
      selfCheck: ['Who does the unpaid work in my household?', 'What explains the wage gap beyond "different choices"?', 'Who cares for the carers?'],
      readings: [
        R('Silvia Federici, "Wages Against Housework" (1975), in Revolution at Point Zero (PM Press, 2012)', '', 'Essay in book.'),
        R('Nancy Fraser, "Contradictions of Capital and Care," New Left Review 100 (2016)', 'https://newleftreview.org/issues/ii100/articles/nancy-fraser-contradictions-of-capital-and-care', 'Article, publisher’s page.'),
        R('U.S. Bureau of Labor Statistics, Women in the labor force: a databook', 'https://www.bls.gov/opub/reports/womens-databook/', 'Official data.'),
        R('Arlie Russell Hochschild with Anne Machung, The Second Shift (Viking, 1989), chapters 1–2', '', 'Book.'),
      ],
      assignments: [
        L('Valuing unpaid work', 'Explain social reproduction and why unpaid care matters economically.', [
          'Read Federici and Fraser.',
          'Explain social reproduction in your own words (about 150 words).',
          'Summarise Federici’s argument and Fraser’s, and say how they differ (about 250 words).',
        ], rub(['Clear definition', 4], ['Accurate comparison', 6])),
        P('Reading the data', 'Interpret official labour data on gender.', 'Data guide (supplied by this course).\n\nUsing the BLS databook, find:\n1. Women’s and men’s median weekly earnings, and the ratio.\n2. Five occupations with the highest share of women and five with the lowest, with their median pay.\n3. Labour-force participation of mothers with children under 6 compared with fathers.\n4. One other table you choose.\n\nCite table numbers.', [
          'Extract the data into tables.',
          'Make at least two charts.',
          'Write a 700–900-word interpretation linking the data to occupational segregation and care work.',
        ], rub(['Correct, cited data', 6], ['Clear charts', 4], ['Interpretation linked to theory', 8], ['Clear writing', 2])),
        D('Care policy brief', 'Write a policy brief on a care-work issue.', [
          'Choose an issue (paid family leave, childcare costs, wages for home health aides, elder care).',
          'Describe the problem with data from at least three reliable sources.',
          'Compare two policy options, including one from another country or state.',
          'Recommend one, with costs, benefits and who gains.',
          'Keep it to 1,200–1,500 words with a one-paragraph summary at the top.',
        ], rub(['Problem documented with data', 8], ['Fair comparison of options', 8], ['Reasoned recommendation with costs and benefits', 10], ['Clear brief format', 4]), 'A policy brief showing you can turn feminist economic analysis into practical proposals.'),
      ],
    });

    const m7 = M('Global and Transnational Feminisms', {
      duration: '2 weeks',
      overview: 'Feminism looks different in different places and is shaped by colonialism, migration and global economics. This module reads transnational critiques and the international human rights framework for women.',
      keyIdeas: 'Mohanty criticised Western feminist writing that portrayed "Third World women" as a single, passive victim group. Transnational feminism studies how gender works across borders: global supply chains, migration, militarism. CEDAW (1979) is the main international treaty on women’s rights; the 1995 Beijing Platform for Action set goals across twelve areas. Local movements adapt and sometimes reject universal frameworks.',
      objectives: ['Explain Mohanty’s critique.', 'Use international human-rights instruments in analysis.', 'Research a feminist movement outside your own country.'],
      selfCheck: ['What does Mohanty mean by a "single story" of Third World women?', 'Has the United States ratified CEDAW?', 'Whose voices are centred in my research?'],
      readings: [
        R('Chandra Talpade Mohanty, "Under Western Eyes: Feminist Scholarship and Colonial Discourses," Feminist Review 30 (1988), revised in Feminism without Borders (Duke University Press, 2003)', '', 'Article and book. Find through a library.'),
        R('UN Office of the High Commissioner for Human Rights, Convention on the Elimination of All Forms of Discrimination against Women (1979)', 'https://www.ohchr.org/en/instruments-mechanisms/instruments/convention-elimination-all-forms-discrimination-against-women', 'Full text.'),
        R('United Nations, Beijing Declaration and Platform for Action (1995)', 'https://www.un.org/womenwatch/daw/beijing/platform/', 'Full text.'),
      ],
      assignments: [
        L('Under Western eyes', 'Explain Mohanty’s critique and its significance.', [
          'Read Mohanty.',
          'Summarise her critique in about 250 words.',
          'Give one example, from media or scholarship, of the kind of representation she criticises.',
        ], rub(['Accurate summary', 6], ['Fitting example', 4])),
        P('CEDAW in practice', 'Use CEDAW to analyse a country’s situation.', 'Research guide (supplied by this course).\n\nChoose one country. Using the CEDAW text and reliable sources (UN reports, NGOs, news):\n1. Has the country ratified CEDAW, and with what reservations?\n2. Choose two articles and assess the country’s record on each.\n3. What local feminist organisations work on these issues?', [
          'Research the country’s status and record.',
          'Write a 900–1,100-word report answering the three questions.',
          'Cite every claim.',
        ], rub(['Correct ratification status and reservations', 4], ['Evidence-based assessment of two articles', 8], ['Local organisations identified', 4], ['Accurate citations', 4])),
        D('Movement profile', 'Profile a feminist movement or organisation outside your own country.', [
          'Choose a movement or organisation and research it using at least five sources, including the movement’s own words where available.',
          'Describe its history, goals, methods and achievements.',
          'Analyse it with Mohanty: how does it define its own issues, and how have outsiders represented it?',
          'Write 1,500 words, or produce an equivalent audio or visual profile with a written script.',
        ], rub(['Researched history and goals', 8], ['Centres the movement’s own voice', 8], ['Analysis using Mohanty', 10], ['Clear presentation and citations', 4]), 'A movement profile showing you can study feminism across borders respectfully.'),
      ],
    });

    const modules = [m1, m2, m3, m4, m5, m6, m7];
    const capstone = S.makeCapstone({
      title: 'Capstone: Feminist Research and Action Project', status: 'ready', weight: 20, createdAt: new Date().toISOString(),
      overview: 'Choose a gender-justice issue, research it with the frameworks of the course, and produce a piece of public-facing work that intervenes in it.',
      prepares: {
        modules: [
          { id: m2.id, why: 'Rights language and the history of exclusion frame your issue.' },
          { id: m4.id, why: 'Intersectional analysis is required in the research.' },
          { id: m5.id, why: 'Representation and debate skills shape your public piece.' },
          { id: m6.id, why: 'Policy brief skills feed the action proposal.' },
          { id: m7.id, why: 'Transnational comparison broadens the analysis.' },
        ],
        objectives: ['Research a gender-justice issue with intersectional analysis.', 'Produce public-facing work that intervenes in it.', 'Reflect on your own position and learning.'],
        skills: ['Research', 'Intersectional analysis', 'Policy writing', 'Public communication', 'Reflection'],
      },
      assignments: [A('Feminist research and action project', '', {
        kind: 'demonstrate', basis: 'portfolio', points: 100, format: 'any', estimate: '4–5 weeks',
        purpose: 'Research a gender-justice issue in depth and create a public-facing piece (an op-ed, zine, toolkit, podcast, campaign plan or policy proposal) that could make a difference.',
        steps: [
          'Choose an issue and write a one-page proposal.',
          'Write a 2,000–2,500-word research paper using at least eight sources and at least three course frameworks, including intersectionality.',
          'Create the public-facing piece for a specific audience.',
          'Write a 750-word reflection: your position, what changed in your thinking since your Module 1 journal entry, and what you would do next.',
          'Keep everyone you interview anonymous unless they consent in writing to be named.',
        ],
        submit: 'One PDF with the research paper and reflection, plus the public-facing piece (file or link).',
        rubric: rub(['Depth and quality of research', 30], ['Use of course frameworks, including intersectionality', 25], ['Effectiveness of the public-facing piece', 30], ['Reflection on position and growth', 15]),
        portfolioNote: 'The course’s culminating project: researched, public-facing feminist work.',
      })],
    });

    return C('WGS 101', 'Feminism', 4,
      'A study of feminist thought, history and practice: rights and suffrage, the personal as political, intersectionality, bodies and representation, care and economics, and transnational feminisms.',
      modules, {
        objective: 'Understand feminism as thought, history and practice, analyse gender with intersectional frameworks, and apply them to real issues.',
        deliverable: 'A feminist research and action project on a gender-justice issue (the course capstone).',
        duration: '16 weeks',
        outcomes: [
          'Explain major currents of feminist thought and their histories.',
          'Read primary feminist texts closely and in context.',
          'Apply intersectional analysis to laws, policies and institutions.',
          'Analyse gender in media and representation.',
          'Interpret data on gender, work and care.',
          'Engage disagreement within feminism fairly and argue a reasoned position.',
        ],
        syllabus: 'The course moves roughly chronologically from Module 2 to Module 4, then thematically. Each module has a Learn assignment (10 points), an Apply assignment (20 points) and a Demonstrate assignment (30 points). Module 1 begins a reading journal you will return to in the capstone reflection, which counts for 20% of the course grade.\n\nReadings are cited, not reproduced. Public-domain texts and documents are linked; find books and articles through a library.\n\nDiscussion and fieldwork: feminist topics can be personal. Share only what you choose to share, keep anyone you interview anonymous unless they consent to being named, and argue with ideas, not people.',
        capstone,
      });
  }

  // Starter course: Literature & Writing. Each module is one book or theme, read closely and written about.
  function literatureCourse() {
    const X = (...qs) => [
      { id: S.uid(), title: 'Discussion questions', body: qs.map((q, i) => (i + 1) + '. ' + q).join('\n') },
      { id: S.uid(), title: 'Favorite passages', body: '' },
    ];
    const OWL = R('Purdue Online Writing Lab, Writing about literature', 'https://owl.purdue.edu/owl/subject_specific_writing/writing_in_literature/index.html', 'Free guide to literary terms, close reading and the literary essay.');

    const m1 = M('Theme: Close Reading Poetry', {
      duration: '2 weeks',
      overview: 'Close reading is the core skill of the course: slow, attentive reading that notices how language makes meaning. Short poems are the best place to practise it, because every word counts.',
      keyIdeas: 'Close reading moves from observation (what is on the page) to interpretation (what it means) to argument (why it matters). Pay attention to diction, imagery, syntax, sound, line breaks and form. The speaker of a poem is not the poet. A good interpretation is arguable and supported by quotation. Annotation is thinking on paper.',
      objectives: ['Annotate a poem for diction, imagery, sound and form.', 'Move from observation to interpretation.', 'Write a close reading built on precise quotation.'],
      selfCheck: ['Can I point to the exact words that support my reading?', 'Have I noticed form as well as content?', 'Is my claim arguable?'],
      readings: [
        R('William Shakespeare, Sonnet 73, "That time of year thou mayst in me behold" (1609)', 'https://www.poetryfoundation.org/poems/45099/sonnet-73-that-time-of-year-thou-mayst-in-me-behold', 'Poetry Foundation.'),
        R('Emily Dickinson, "\'Hope\' is the thing with feathers" (314)', 'https://www.poetryfoundation.org/poems/42889/hope-is-the-thing-with-feathers-314', 'Poetry Foundation.'),
        R('Robert Frost, "The Road Not Taken" (1916)', 'https://www.poetryfoundation.org/poems/44272/the-road-not-taken', 'Poetry Foundation.'),
        R('Langston Hughes, "Harlem" (1951)', 'https://www.poetryfoundation.org/poems/46548/harlem', 'Poetry Foundation.'),
        OWL,
      ],
      extras: X('Which word in each poem would change the poem most if you replaced it?', 'Is "The Road Not Taken" about choosing freely, or about the stories we tell afterwards?', 'How does the form of "Harlem" (questions, then a final line) shape its meaning?', 'What does Dickinson’s metaphor make hope sound like, and what does it leave out?'),
      assignments: [
        L('Annotating a poem', 'Show close-reading skills by annotating a short poem.', [
          'Read all four poems aloud at least twice.',
          'Annotate one poem fully: diction, imagery, sound, line breaks, form and turns.',
          'Write 250 words explaining the three most important things your annotation reveals.',
        ], rub(['Thorough annotation', 5], ['Insightful explanation', 5]), { submit: 'Typed response, plus a photo or PDF of your annotation if you made it on paper.', format: 'any' }),
        P('Two poems in conversation', 'Compare two poems through close reading.', 'Comparison guide (supplied by this course).\n\nChoose two of the four poems. For each, record:\n1. The speaker and situation.\n2. The central image or metaphor.\n3. One formal feature (rhyme, metre, line break, stanza, question) and its effect.\n4. The turn: where the poem shifts.\n\nThen ask: what does reading them side by side show that reading them alone would not?', [
          'Fill in the guide for both poems.',
          'Write a 900–1,100-word comparative close reading with a clear thesis.',
          'Quote precisely and analyse each quotation.',
        ], rub(['Arguable comparative thesis', 5], ['Precise quotation and analysis', 8], ['Attention to form', 4], ['Organisation and style', 3])),
        D('Close reading essay', 'Write a polished close reading of a poem of your choice.', [
          'Choose a poem not on the list, from a reliable source such as the Poetry Foundation or the Academy of American Poets.',
          'Annotate it fully.',
          'Write a 1,200–1,500-word essay with an arguable thesis about how the poem makes its meaning.',
          'Revise once after reading it aloud, and submit both the draft and the revision.',
        ], rub(['Arguable, specific thesis', 7], ['Depth of close reading', 12], ['Effective revision', 6], ['Style and mechanics', 5]), 'A polished close reading showing you can analyse how language makes meaning.'),
      ],
    });

    const m2 = M('Book: Frankenstein', {
      duration: '3 weeks',
      overview: 'Mary Shelley’s 1818 novel is a story about creation, responsibility and who counts as human, told through nested narrators. Read it as a novel of ideas and as a study of narrative form.',
      keyIdeas: 'The novel is a frame narrative: Walton’s letters contain Victor’s story, which contains the creature’s. Each narrator is unreliable in a different way. Victor’s failure is less the act of creation than the abandonment of his creation. The creature’s education (through books and by watching the De Lacey family) raises questions of nature and nurture. The subtitle, "The Modern Prometheus," links the novel to myths of overreaching.',
      objectives: ['Analyse a frame narrative and its narrators.', 'Trace a theme through a whole novel.', 'Write an argument about character and responsibility.'],
      selfCheck: ['Whose version of events do I trust most, and why?', 'When does Victor abandon his responsibility?', 'What does the creature learn from books?'],
      readings: [
        R('Mary Wollstonecraft Shelley, Frankenstein; or, The Modern Prometheus (1818; revised 1831)', 'https://www.gutenberg.org/ebooks/84', 'Public-domain text, Project Gutenberg. Any edition is fine; note which you use.'),
        OWL,
      ],
      extras: X('Who is the "monster" of the novel, and does the answer change as you read?', 'Why does Shelley tell the story through three narrators?', 'What does Victor owe his creation?', 'What books does the creature read, and how do they shape him?'),
      assignments: [
        L('Reading log: Frankenstein', 'Keep a reading log that tracks narrators and themes.', [
          'Read the novel in three parts: Walton’s letters and chapters 1–10, chapters 11–17, chapters 18–24.',
          'For each part, write 150–200 words: what happens, who is narrating, and one passage that stood out, with page or chapter reference.',
        ], rub(['Accurate summaries', 4], ['Attention to narration', 3], ['Well-chosen passages', 3])),
        P('Passage analysis', 'Analyse a key passage and connect it to the whole novel.', 'Passage options (supplied by this course).\n\nChoose one:\n1. Victor’s reaction on the night the creature comes to life (chapter 5).\n2. The creature’s first meeting with Victor on the glacier (chapter 10).\n3. The creature’s account of reading Paradise Lost (chapter 15).\n4. Walton’s final encounter with the creature (the closing letters).\n\nRead the passage three times before writing.', [
          'Annotate the passage closely.',
          'Write a 900–1,100-word analysis: what happens, how the language works, and what the passage shows about the novel as a whole.',
        ], rub(['Clear thesis', 4], ['Close reading of language', 8], ['Connection to the whole novel', 6], ['Style', 2])),
        D('Essay: responsibility in Frankenstein', 'Write an argument about responsibility in the novel.', [
          'Formulate a question about responsibility (for example: is Victor responsible for the creature’s crimes?).',
          'Gather evidence from at least five passages across the novel.',
          'Write a 1,500–1,800-word essay with an arguable thesis, addressing a counter-argument.',
          'Use MLA citation.',
        ], rub(['Arguable thesis', 6], ['Evidence from across the novel', 10], ['Counter-argument addressed', 7], ['Organisation, style and citation', 7]), 'An argumentative essay on a novel showing you can sustain an interpretation across a long text.'),
      ],
    });

    const m3 = M('Book: Narrative of the Life of Frederick Douglass', {
      duration: '2 weeks',
      overview: 'Douglass’s 1845 autobiography is a work of literature and an act of resistance. This module reads it for its argument, its rhetoric and its account of literacy as freedom.',
      keyIdeas: 'Slave narratives were written to persuade, and Douglass shapes his story with great rhetorical skill. Literacy is the turning point: "the pathway from slavery to freedom." Douglass exposes the hypocrisy of slaveholding Christianity. The prefaces by white abolitionists, and Douglass’s own authority over his story, raise questions of voice and authentication. Chiasmus ("You have seen how a man was made a slave; you shall see how a slave was made a man") is one of his signature devices.',
      objectives: ['Analyse rhetoric in autobiography.', 'Trace the theme of literacy and freedom.', 'Write about voice and authority in a text.'],
      selfCheck: ['How does Douglass make readers trust him?', 'Why is learning to read so dangerous in the narrative?', 'What does the appendix on religion add?'],
      readings: [
        R('Frederick Douglass, Narrative of the Life of Frederick Douglass, an American Slave (1845)', 'https://www.gutenberg.org/ebooks/23', 'Public-domain text, Project Gutenberg.'),
        OWL,
      ],
      extras: X('Who is Douglass writing for, and how can you tell?', 'Why does the narrative begin with what Douglass does not know (his birthday, his father)?', 'How does the fight with Covey change the narrative?', 'What is the effect of the prefaces by Garrison and Phillips?'),
      assignments: [
        L('Rhetoric in the Narrative', 'Identify and explain Douglass’s rhetorical strategies.', [
          'Read the whole narrative, including the prefaces and appendix.',
          'Identify three rhetorical strategies (for example appeals to emotion, irony, chiasmus, direct address) with a quotation for each.',
          'Explain each in about 100 words.',
        ], rub(['Correctly identified strategies', 5], ['Clear explanations with quotation', 5])),
        P('Literacy and freedom', 'Trace a theme across the narrative.', 'Tracking guide (supplied by this course).\n\nRecord every moment where reading, writing or knowledge appears: Mrs. Auld’s lessons and their end, The Columbian Orator, the Sabbath school, the forged passes, the writing of the narrative itself. For each, note what Douglass gains and what it costs him.', [
          'Complete the tracking guide.',
          'Write a 900–1,100-word essay on how the narrative connects literacy and freedom.',
        ], rub(['Thorough tracking', 5], ['Clear thesis', 4], ['Precise evidence', 7], ['Style', 4])),
        D('Essay: voice and authority', 'Write an essay on how Douglass claims authority over his own story.', [
          'Read the prefaces and Douglass’s text with attention to who vouches for whom.',
          'Find secondary context in at least two scholarly or reputable sources (for example the Library of Congress or a university press edition).',
          'Write a 1,500-word essay on voice, authentication and authority.',
          'Use MLA citation.',
        ], rub(['Arguable thesis', 6], ['Close reading of primary text', 10], ['Effective use of context sources', 8], ['Style and citation', 6]), 'An essay on voice and authority showing you can read a text in its historical context.'),
      ],
    });

    const m4 = M('Theme: The Short Story', {
      duration: '2 weeks',
      overview: 'The short story compresses character and meaning into a few pages. This module reads stories from James Joyce’s Dubliners and asks how short fiction builds to a moment of recognition.',
      keyIdeas: 'Joyce called the moment of sudden recognition an "epiphany." Dubliners is organised from childhood to public life, with "paralysis" as a recurring theme. Free indirect discourse blends the narrator’s voice with a character’s thoughts. Endings in short fiction often withhold resolution. Setting can work as character.',
      objectives: ['Analyse structure and endings in short fiction.', 'Identify free indirect discourse.', 'Write a short story using a technique studied.'],
      selfCheck: ['Where is the epiphany in each story, and who has it?', 'Whose words are these: the narrator’s or the character’s?', 'Why does the story end where it does?'],
      readings: [
        R('James Joyce, Dubliners (1914): "Araby," "Eveline," "The Boarding House" and "The Dead"', 'https://www.gutenberg.org/ebooks/2814', 'Public-domain text, Project Gutenberg.'),
        OWL,
      ],
      extras: X('What does the boy in "Araby" realise at the end, and why does it hurt?', 'Why does Eveline not get on the boat?', 'Is there an epiphany in "The Boarding House," and whose is it?', 'What does the snow at the end of "The Dead" mean?'),
      assignments: [
        L('Epiphany and paralysis', 'Explain two key concepts in Dubliners with examples.', [
          'Read the four stories.',
          'Define epiphany and paralysis as used in criticism of Dubliners (about 100 words each).',
          'Identify the epiphany or its absence in each story (about 50 words each).',
        ], rub(['Clear definitions', 4], ['Accurate identification across the stories', 6])),
        P('How "The Dead" ends', 'Analyse the ending of a long story.', 'Close-reading guide (supplied by this course).\n\nFocus on the final three pages of "The Dead," from Gretta’s story about Michael Furey to the snow. Record: shifts in point of view; repeated words and sounds; images of the living and the dead; what Gabriel realises.', [
          'Annotate the ending using the guide.',
          'Write a 900–1,100-word close reading of the ending and its relation to the whole story.',
        ], rub(['Clear thesis', 4], ['Close reading of language and sound', 8], ['Connection to the whole story', 5], ['Style', 3])),
        D('Creative writing: a story with an epiphany', 'Write an original short story using techniques from Dubliners, with a reflective commentary.', [
          'Write a 2,000–3,000-word story set in a place you know well, building to a moment of recognition.',
          'Use free indirect discourse at least once.',
          'Revise once after reading it aloud.',
          'Write a 600-word commentary explaining which techniques you borrowed from Joyce and how.',
        ], rub(['Effective story with a meaningful epiphany', 10], ['Skilled use of point of view', 6], ['Revision evident', 6], ['Insightful commentary', 8]), 'An original short story and commentary showing you can learn craft from reading.'),
      ],
    });

    const m5 = M('Book: Mrs Dalloway', {
      duration: '3 weeks',
      overview: 'Virginia Woolf’s 1925 novel follows one day in London, moving between minds. It is a study of time, memory, the aftermath of war and the inner life of ordinary people.',
      keyIdeas: 'Stream of consciousness follows the flow of thought, memory and perception. The novel takes place in a single June day in 1923, punctuated by Big Ben. Clarissa Dalloway and Septimus Smith never meet but mirror each other. Shell shock and the medical treatment of Septimus show the cost of the First World War. Woolf’s "tunnelling" technique reveals characters’ pasts within their present.',
      objectives: ['Analyse stream-of-consciousness narration.', 'Interpret parallel characters.', 'Relate a novel to its historical moment.'],
      selfCheck: ['How do transitions between characters work?', 'What links Clarissa and Septimus?', 'How does the war appear in a novel set at a party?'],
      readings: [
        R('Virginia Woolf, Mrs Dalloway (1925)', 'https://www.gutenberg.org/ebooks/63107', 'Public-domain in the U.S.; Project Gutenberg. Check copyright status where you live.'),
        R('Virginia Woolf, "Modern Fiction" (1919/1925), in The Common Reader', '', 'Essay. Woolf’s own account of fiction that follows the mind.'),
        OWL,
      ],
      extras: X('How does Woolf move from one character’s mind to another?', 'Why do Clarissa and Septimus never meet?', 'What role do the clocks play?', 'Is Clarissa’s party trivial or meaningful?'),
      assignments: [
        L('Stream of consciousness', 'Explain Woolf’s narrative technique with examples.', [
          'Read the novel and "Modern Fiction."',
          'Explain stream of consciousness and Woolf’s aims in "Modern Fiction" (about 200 words).',
          'Analyse one transition between two characters’ minds (about 150 words).',
        ], rub(['Accurate explanation', 5], ['Clear analysis of a transition', 5])),
        P('Clarissa and Septimus', 'Compare the novel’s two central figures.', 'Comparison guide (supplied by this course).\n\nTrack Clarissa and Septimus through the day: where they are at each striking of Big Ben, their memories, their relationships to others, their attitudes to life and death. Note every image or phrase they share.', [
          'Complete the guide.',
          'Write a 1,000–1,200-word essay arguing what the pairing means.',
        ], rub(['Thorough tracking of both characters', 5], ['Arguable thesis', 4], ['Precise evidence', 7], ['Style', 4])),
        D('Essay with criticism', 'Write a researched essay that enters a critical conversation about the novel.', [
          'Find two pieces of published criticism on Mrs Dalloway through a library.',
          'Summarise each critic’s argument fairly.',
          'Write a 1,800–2,200-word essay that agrees, disagrees or extends one of them, with your own close reading.',
          'Use MLA citation and a works-cited list.',
        ], rub(['Fair summary of criticism', 6], ['Original argument in conversation with critics', 10], ['Close reading as evidence', 8], ['Citation and style', 6]), 'A researched literary essay showing you can join a critical conversation.'),
      ],
    });

    const m6 = M('Book: The Great Gatsby', {
      duration: '2 weeks',
      overview: 'F. Scott Fitzgerald’s 1925 novel is a portrait of wealth, longing and self-invention in the Jazz Age, narrated by a man who claims he is "inclined to reserve all judgments."',
      keyIdeas: 'Nick Carraway is a participant-narrator whose reliability is in question. Gatsby’s self-invention connects the novel to the "American Dream" and its limits. Class and old versus new money structure the social world. Symbols (the green light, the eyes of Doctor T. J. Eckleburg, the valley of ashes) carry the novel’s themes. Race, gender and the treatment of Myrtle and the Wilsons complicate the glamour.',
      objectives: ['Assess a narrator’s reliability.', 'Interpret symbol and theme.', 'Write a comparative or adaptation essay.'],
      selfCheck: ['Does Nick reserve judgment?', 'What does the green light mean, and does it change?', 'Who pays the price for the characters’ carelessness?'],
      readings: [
        R('F. Scott Fitzgerald, The Great Gatsby (1925)', 'https://www.gutenberg.org/ebooks/64317', 'Public-domain in the U.S.; Project Gutenberg.'),
        OWL,
      ],
      extras: X('Is Nick a reliable narrator?', 'What does Gatsby want: Daisy, or something Daisy stands for?', 'What is the valley of ashes doing in the novel?', 'How does the last page change the meaning of the whole?'),
      assignments: [
        L('Narrator and symbol', 'Analyse Nick as narrator and one central symbol.', [
          'Read the novel.',
          'Give two pieces of evidence for and two against Nick’s reliability (about 200 words).',
          'Trace one symbol through the novel (about 150 words).',
        ], rub(['Balanced evidence on reliability', 5], ['Clear tracing of a symbol', 5])),
        P('Adaptation analysis', 'Compare the novel with a film adaptation.', 'Comparison guide (supplied by this course).\n\nWatch one film adaptation (1974, 2013 or another). Choose three scenes and compare them with the novel: what is kept, cut or added; how narration is handled; how the film presents wealth, class and Gatsby himself.', [
          'Compare three scenes using the guide.',
          'Write a 900–1,100-word essay on what the adaptation reveals about the novel.',
        ], rub(['Careful scene comparison', 7], ['Clear thesis', 4], ['Insight into the novel', 6], ['Style', 3])),
        D('Essay: the American Dream', 'Write an argument about the novel’s vision of the American Dream.', [
          'Formulate a precise question (for example: does the novel criticise the American Dream, or mourn it?).',
          'Gather evidence from at least five passages, including the ending.',
          'Write a 1,500–1,800-word essay, addressing class, gender or race in your argument.',
          'Use MLA citation.',
        ], rub(['Arguable, precise thesis', 6], ['Evidence across the novel', 10], ['Attention to class, gender or race', 7], ['Style and citation', 7]), 'An essay on the American Dream showing you can argue about theme and society in fiction.'),
      ],
    });

    const modules = [m1, m2, m3, m4, m5, m6];
    const capstone = S.makeCapstone({
      title: 'Capstone: Literary Portfolio and Critical Essay', status: 'ready', weight: 20, createdAt: new Date().toISOString(),
      overview: 'Bring the course together: write a substantial critical essay on one or more texts, and assemble a portfolio of your revised best work with a reflection on how your reading and writing have grown.',
      prepares: {
        modules: [
          { id: m1.id, why: 'Close reading is the foundation of the essay.' },
          { id: m2.id, why: 'Sustaining an argument across a novel.' },
          { id: m4.id, why: 'Creative work can be included in the portfolio.' },
          { id: m5.id, why: 'Researched writing in conversation with critics.' },
        ],
        objectives: ['Write a substantial researched literary essay.', 'Revise earlier work.', 'Reflect on your development as a reader and writer.'],
        skills: ['Close reading', 'Argument', 'Research', 'Revision', 'Reflection'],
      },
      assignments: [A('Literary portfolio and critical essay', '', {
        kind: 'demonstrate', basis: 'portfolio', points: 100, format: 'any', estimate: '4–5 weeks',
        purpose: 'Write a substantial critical essay and assemble a portfolio showing how your reading and writing developed over the course.',
        steps: [
          'Write a 3,000–3,500-word critical essay on one text or comparing two texts from the course, using at least three critical sources.',
          'Choose three earlier assignments and revise each substantially.',
          'For each revision, write a 150-word note on what you changed and why.',
          'Write a 1,000-word reflection on how your reading and writing changed, quoting your own early and late work.',
          'Use your Discussion questions and Favorite passages notes as evidence of your thinking.',
        ],
        submit: 'One PDF containing the critical essay, the three revised pieces with notes, and the reflection.',
        rubric: rub(['Critical essay: argument and close reading', 35], ['Critical essay: research and citation', 15], ['Quality of revisions and notes', 30], ['Reflection on growth', 20]),
        portfolioNote: 'The course’s culminating project: a critical essay and a portfolio of revised work.',
      })],
    });

    return C('LIT 101', 'Literature & Writing', 1,
      'Read closely, write in response, and build a record of your thinking. Each module is one book or theme: poetry, Frankenstein, Douglass’s Narrative, the short story, Mrs Dalloway and The Great Gatsby.',
      modules, {
        objective: 'Read literature closely and write about it with precision, argument and craft.',
        deliverable: 'A literary portfolio with a substantial critical essay (the course capstone).',
        duration: '18 weeks',
        outcomes: [
          'Close-read poetry and prose for language, form and meaning.',
          'Write arguable, evidence-based literary essays.',
          'Analyse narration, voice, symbol and theme.',
          'Read texts in their historical context.',
          'Use literary criticism and cite it correctly.',
          'Revise writing substantially and reflect on growth.',
        ],
        syllabus: 'Each module is one book or theme. Module 1 builds close-reading skills on short poems; the following modules apply them to longer works. Each module has a Learn assignment (10 points), an Apply assignment (20 points) and a Demonstrate assignment (30 points), plus Discussion questions and a Favorite passages page for your notes. The capstone counts for 20% of the course grade.\n\nAll the primary texts are linked to free, legal copies: poems on the Poetry Foundation site and books on Project Gutenberg (public domain in the U.S.; check the copyright status where you live). Any reliable print edition is fine. Find criticism through a library.\n\nYou can swap any module for a book of your own choice: keep the Learn / Apply / Demonstrate structure and change the reading.',
        capstone,
      });
  }

  S.starterCourses = () => [
    anthropologyCourse(),
    financeCourse(),
    entrepreneurshipCourse(),
    feminismCourse(),
    literatureCourse(),
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
