// Free explore: no goal; labels and teaching text follow the scope.
import { el } from '../ui/dom.js';

export class ExploreMode {
  id = 'explore';
  constructor(app) { this.app = app; }

  enter() {
    const { app } = this;
    app.scope.confine = null;
    app.setModeHidesLabels(false);
    app.overview.setTarget(null);
    app.overview.setMarkerVisible(true);
    this.tip = el('p', {});
    app.panel.replaceChildren(
      el('div', { class: 'grow' },
        el('h3', {}, 'Free explore'),
        el('p', {}, 'Steer into every lobar and segmental bronchus. Press ', el('kbd', {}, 'L'),
          ' to hide labels and test yourself, or switch to “Where am I?” for a scored quiz.'),
        this.tip),
    );
  }

  exit() {}

  update() {
    const { app } = this;
    const nd = app.scope.node;
    this.tip.textContent = app.labelsShown ? nd.desc : '';
  }
}
