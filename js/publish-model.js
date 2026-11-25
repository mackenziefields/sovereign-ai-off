/* sovereign. — publication model (Phase 4A). The ONLY place a published document reads grades, rubric scores and dates.
   Read-only: it never writes to saved data. It reuses the app's own numbers (S.pctOf, S.grade, S.courseGrade) and the app's own rounding rules,
   and it checks that the saved records agree with each other. If they do not, the export gets a diagnostic and no contradictory document is made.

   The app's own rules (js/store.js, worker/worker.js):
     review score    = sum of the ASSESSED criteria scores, each criterion rounded to 0.1, the sum rounded to 0.1
     review maximum  = sum of the ASSESSED criteria maxima ("not assessed" criteria are left out of both)
     grade on the Grades page (a.score) = round(score / max * points, 1)   [the same percentage is kept if the points were edited later]
     review deadline = first submission + REVIEW_HOURS (72) hours
   A difference of up to 0.1 is one rounding step and is allowed (reported as a note); anything bigger cannot come from rounding and is substantive. */
(function (S) {
  'use strict';
  const r1 = (n) => Math.round(n * 10) / 10;
  const STEP = 0.1, EPS = 1e-9;
  const ms = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isFinite(t) ? t : null; };
  const hours = (a, b) => Math.round(((b - a) / 3600000) * 10) / 10;
  const level = (d) => (d <= 0.05 + EPS ? 'ok' : d <= STEP + EPS ? 'rounding' : 'substantive');
  const sum = (arr, k) => arr.reduce((t, x) => t + (Number(x[k]) || 0), 0);

  // Human date and time, or a plain "not recorded". Never guesses a date.
  function fmtWhen(iso) {
    const t = ms(iso); if (t == null) return 'not recorded';
    return new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // Compares two numbers under the rounding rule. Returns a check record.
  function compare(rule, label, got, want, fmt) {
    const d = Math.abs(got - want), lv = level(d);
    return { rule, level: lv, ok: lv !== 'substantive', got, want,
      msg: lv === 'ok' ? '' : (lv === 'rounding' ? label + ' (a difference of ' + r1(d) + ', one rounding step; allowed).' : label + ' (a difference of ' + r1(d) + ', more than rounding can explain).') };
  }

  // Everything a document may say about ONE assignment's review, grade and timing. Pure: reads a, returns a new object.
  function reviewFacts(a) {
    const w = a && a.work, out = { title: a ? a.title : '', points: a && a.points > 0 ? a.points : 0, state: 'none', recorded: { kind: 'none', score: null, points: null, pct: null }, review: null, first: null, checks: [], ok: true, notes: [], timeline: { firstAt: null, firstSource: 'unavailable', finalAt: null, deadline: null, how: 'none', window: 'not-applicable', statements: [] } };
    if (!a) return out;
    if (!w) { if (a.score != null && a.points > 0) { out.state = 'self'; out.recorded = { kind: 'self', score: a.score, points: a.points, pct: S.pctOf(a) }; } return out; }
    const fin = w.final, sub = fin || w.first, fb = sub && sub.feedback;
    out.state = w.phase === 'final' ? (fb ? 'final' : 'attached') : 'reviewed';
    const T = out.timeline; T.deadline = ms(w.deadline) != null ? w.deadline : null; T.finalAt = fin && ms(fin.at) != null ? fin.at : null;

    // ----- recorded grade: the Grades page value, never a recomputation -----
    if (out.state === 'final') out.recorded = { kind: 'ai', score: a.score, points: a.points > 0 ? a.points : null, pct: S.pctOf(a) };
    else if (out.state === 'attached') out.recorded = a.score != null && a.points > 0 ? { kind: 'self', score: a.score, points: a.points, pct: S.pctOf(a) } : { kind: 'none', score: null, points: null, pct: null };
    else out.recorded = { kind: 'pending', score: null, points: null, pct: null }; // first review only: feedback is ready, no grade yet

    // ----- the review itself, and the consistency checks -----
    if (fb) {
      const crit = (fb.criteria || []).map((k) => ({ name: k.name, max: k.max, score: k.score, status: k.status || '', assessed: k.assessed !== false, comment: k.comment || '' }));
      const assessed = crit.filter((k) => k.assessed);
      out.review = { at: sub.at || null, late: sub.late === true, score: fb.score, max: fb.max, pct: fb.max > 0 ? r1((fb.score / fb.max) * 100) : null, criteria: crit, summary: fb.summary || '', strengths: fb.strengths || [], findings: fb.findings || [], nextSteps: fb.nextSteps || [], inspection: fb.inspection || null, model: fb.model || '' };
      if (!(fb.max > 0)) out.checks.push({ rule: 'R0', level: 'substantive', ok: false, msg: 'The review has no maximum score.' });
      else if (fb.score < -EPS || fb.score > fb.max + EPS) out.checks.push({ rule: 'R0', level: 'substantive', ok: false, msg: 'The review score ' + fb.score + ' is outside 0 to ' + fb.max + '.' });
      if (assessed.length) {
        out.checks.push(compare('R1', 'Criterion scores add to ' + r1(sum(assessed, 'score')) + ' but the review score is ' + fb.score, r1(sum(assessed, 'score')), fb.score, (n) => String(n)));
        out.checks.push(compare('R2', 'Criterion maxima add to ' + r1(sum(assessed, 'max')) + ' but the review maximum is ' + fb.max, r1(sum(assessed, 'max')), fb.max, (n) => String(n)));
      } else out.notes.push('No rubric criteria were saved with this review, so a rubric table is not shown.');
      if (out.state === 'final' && fb.max > 0 && a.points > 0 && a.score != null) out.checks.push(compare('R3', 'Grades page score ' + a.score + ' of ' + a.points + ' does not follow from the review (' + fb.score + ' of ' + fb.max + ' = ' + r1((fb.score / fb.max) * a.points) + ' of ' + a.points + ')', a.score, r1((fb.score / fb.max) * a.points), (n) => String(n)));
      if (out.state === 'final' && a.score == null) out.checks.push({ rule: 'R3', level: 'substantive', ok: false, msg: 'The assignment is final but has no recorded score.' });
    }
    // the first review kept by Phase 4A (only ever real saved facts)
    const fs = w.firstSummary || null;
    if (fs) {
      out.first = { at: fs.at, score: fs.score, max: fs.max, pct: fs.max > 0 ? r1((fs.score / fs.max) * 100) : null, criteria: fs.criteria, findings: fs.findings, summary: fs.summary, late: fs.late };
      const asd = fs.criteria.filter((k) => k.assessed);
      if (asd.length) out.checks.push(compare('R5', 'First-review criterion scores add to ' + r1(sum(asd, 'score')) + ' but its recorded score is ' + fs.score, r1(sum(asd, 'score')), fs.score, (n) => String(n)));
      if (fs.max > 0 && fs.score > fs.max + EPS) out.checks.push({ rule: 'R5', level: 'substantive', ok: false, msg: 'The kept first-review score is above its maximum.' });
    }

    // ----- timeline: only saved facts, or a derivation labelled as derived -----
    const dl = ms(w.deadline), finAt = fin ? ms(fin.at) : null, windowMs = S.REVIEW_HOURS * 3600000;
    if (w.phase === 'reviewed') {
      T.firstAt = w.first && ms(w.first.at) != null ? w.first.at : null; T.firstSource = T.firstAt ? 'saved' : 'unavailable'; T.how = 'awaiting';
      T.window = dl != null ? 'open-or-closed' : 'unknown';
    } else if (out.state === 'attached') {
      T.how = 'attached'; T.window = 'not-applicable';
    } else if (fs && ms(fs.at) != null) {
      T.firstAt = fs.at; T.firstSource = 'saved'; T.how = 'resubmission';
    } else if (dl != null && finAt != null && Math.abs(finAt - (dl - windowMs)) <= 60000) {
      T.firstAt = fin.at; T.firstSource = 'saved'; T.how = 'first-review'; // the first review itself became the grade
    } else if (dl != null && finAt != null) {
      T.firstAt = new Date(dl - windowMs).toISOString(); T.firstSource = 'derived'; T.how = 'resubmission'; // an older record: the first review was not kept, its time follows from the deadline
    } else { T.how = finAt != null ? 'unknown' : 'none'; }
    if (T.how === 'resubmission') {
      if (dl != null && finAt != null) T.window = finAt <= dl ? 'within' : 'after'; else T.window = 'unknown';
      const firstMs = T.firstAt ? ms(T.firstAt) : null;
      if (firstMs != null && finAt != null && finAt < firstMs - 60000) out.checks.push({ rule: 'R6', level: 'substantive', ok: false, msg: 'The final submission is dated before the first review.' });
    } else if (T.how === 'first-review') T.window = 'no-resubmission';
    // statements a document may print (each one is backed by saved timestamps)
    const S_ = T.statements;
    if (T.how === 'resubmission' && T.window === 'within' && T.firstAt) S_.push('Resubmitted ' + hours(ms(T.firstAt), finAt) + ' hours after the first review, inside the ' + S.REVIEW_HOURS + '-hour window that ended ' + fmtWhen(w.deadline) + '.');
    if (T.how === 'resubmission' && T.window === 'after') S_.push('The final submission is dated ' + fmtWhen(fin.at) + ', after the review deadline recorded for this assignment (' + fmtWhen(w.deadline) + ').');
    if (T.how === 'first-review') S_.push('No resubmission was made. The first review was recorded as the final grade.');
    if (T.how === 'resubmission' && T.window === 'unknown') S_.push('Whether the resubmission was inside the ' + S.REVIEW_HOURS + '-hour window cannot be shown because a timestamp was not recorded.');
    if (sub && sub.late) S_.push('Marked late against the assignment’s due date.');

    out.ok = out.checks.every((c) => c.ok);
    return out;
  }

  // Course level: the pieces shown next to the course grade must come from the same records the grade is built from.
  function courseFacts(c) {
    const cg = S.courseGrade(c), cap = S.capstoneOf(c), checks = [];
    if (cg.module) {
      const m = S.grade(c);
      if (m.pct !== cg.module.pct) checks.push({ rule: 'C1', level: 'substantive', ok: false, msg: 'The module average differs between the course grade and the module records.' });
    }
    if (cap && cg.capstone && S.pctOf(cap) !== cg.capstone.pct) checks.push({ rule: 'C2', level: 'substantive', ok: false, msg: 'The capstone percentage differs between the course grade and the capstone record.' });
    return { grade: cg, checks, ok: checks.every((x) => x.ok) };
  }

  // The gate every export passes through. ids = the assignments the document will show (all of the course's graded work when omitted).
  function assertPublishable(c, ids) {
    const want = ids ? new Set(ids) : null, diag = [], notes = [];
    const list = c.modules.flatMap((m) => m.assignments.map((a) => ({ a, m }))).concat(c.capstone && c.capstone.assignments[0] ? [{ a: c.capstone.assignments[0], m: c.capstone }] : []);
    list.forEach(({ a, m }) => {
      if (want && !want.has(a.id)) return;
      const f = reviewFacts(a);
      f.checks.forEach((k) => { if (!k.ok) diag.push({ assignment: a.title, module: m.title, rule: k.rule, message: k.msg }); else if (k.level === 'rounding') notes.push({ assignment: a.title, rule: k.rule, message: k.msg }); });
    });
    const cf = courseFacts(c); cf.checks.forEach((k) => { if (!k.ok) diag.push({ assignment: '(course grade)', module: '', rule: k.rule, message: k.msg }); });
    return { ok: diag.length === 0, diagnostics: diag, notes };
  }

  S.pubModel = { reviewFacts, courseFacts, assertPublishable, fmtWhen, STEP };
})(window.Sovereign);
