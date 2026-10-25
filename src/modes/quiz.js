// "Where am I?" quiz: the scope is dropped into a random named airway with all
// labels and the 3D scope marker hidden. Look around (and slide along the same
// airway to peek at its carinas), then pick the airway from four choices.
import { el, store } from '../ui/dom.js';
import { routeTo } from '../anatomy/index.js';
import { NAMED_LEVELS } from '../anatomy/segments.js';

const KEY = 'bsim.quiz.v1';
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
export const describe = (nd) => `${nd.label} · ${nd.name}${nd.lobe ? ` (${nd.lobe})` : ''}`;

export class QuizMode {
  id = 'quiz';
  constructor(app) {
    this.app = app;
    this.stats = store.get(KEY, { asked: 0, correct: 0, streak: 0, best: 0 });
    this.pool = app.tree.list.filter((n) => NAMED_LEVELS.includes(n.level));
  }

  enter() {
    this.app.setModeHidesLabels(true);
    this.app.overview.setTarget(null);
    this.app.overview.setMarkerVisible(false);
    this.next();
  }

  exit() {
    this.app.scope.confine = null;
    this.app.setModeHidesLabels(false);
    this.app.overview.setMarkerVisible(true);
  }

  update() {}

  next() {
    const { app } = this;
    const target = this.pool[Math.floor(Math.random() * this.pool.length)];
    // distractors: prefer the same lobe/zone and level so the choice is not trivial
    const score = (n) => (n.zone === target.zone ? 3 : 0) + (n.lobe === target.lobe ? 2 : 0) + (n.level === target.level ? 1 : 0) + Math.random() * 2;
    const distract = this.pool.filter((n) => n !== target).sort((a, b) => score(b) - score(a)).slice(0, 3);
    this.q = { target, options: shuffle([target, ...distract]), answered: false };
    this.qt0 = Date.now();
    app.scope.confine = null;
    app.scope.place(target.id, target.length * (0.3 + Math.random() * 0.45), { roll: (Math.random() - 0.5) * 1.2 });
    app.scope.confine = target.id;
    app.overview.setMarkerVisible(false);
    app.setModeHidesLabels(true);
    this.render();
  }

  answer(i) {
    const q = this.q;
    if (q.answered || !q.options[i]) return;
    q.answered = true;
    q.chosen = i;
    const ok = q.options[i] === q.target;
    const s = this.stats;
    s.asked++;
    if (ok) { s.correct++; s.streak++; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
    store.set(KEY, s);
    this.app.overview.setMarkerVisible(true); // reveal where you were
    this.app.setModeHidesLabels(false);
    this.render();
  }

  onKey(key) {
    if (/^[1-4]$/.test(key)) { this.answer(Number(key) - 1); return true; }
    if (key === 'Enter' && this.q.answered) { this.next(); return true; }
    return false;
  }

  render() {
    const { q, stats } = this;
    const t = q.target;
    const opts = q.options.map((o, i) => el('button', {
      class: q.answered ? (o === t ? 'right' : i === q.chosen ? 'wrong' : '') : '',
      disabled: q.answered,
      onclick: () => this.answer(i),
    }, el('kbd', {}, i + 1), ' ', describe(o)));

    const info = [el('h3', {}, 'Where am I?')];
    if (!q.answered) {
      info.push(el('p', {}, 'Which airway is the scope in? Labels are hidden. ', el('kbd', {}, 'W'), '/', el('kbd', {}, 'S'),
        ' slide along this airway; roll and flex to inspect the carina.'));
    } else {
      const ok = q.options[q.chosen] === t;
      info.push(
        el('p', { class: ok ? 'good' : 'bad' }, ok ? 'Correct.' : `Not quite — this was ${describe(t)}.`),
        el('p', {}, t.desc),
        el('p', {}, 'Route: ', routeTo(this.app.tree, t.id).map((id) => this.app.tree.nodes[id].label).join(' → ')),
        el('button', { onclick: () => this.next() }, 'Next question ', el('kbd', {}, 'Enter')),
      );
    }
    const pct = stats.asked ? Math.round((100 * stats.correct) / stats.asked) : 0;
    this.app.panel.replaceChildren(
      el('div', { class: 'grow' }, info),
      el('div', { class: 'opts' }, opts),
      el('div', { class: 'stats' }, `Score ${stats.correct}/${stats.asked} (${pct}%)`, el('br'), `Streak ${stats.streak} · best ${stats.best}`),
    );
  }
}
