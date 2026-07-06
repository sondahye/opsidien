import { renderMarkdownMini } from '../util.js';

export class NotePanel {
  constructor(el, { onDive, onWiki, onClose }) {
    this.el = el;
    this.node = null;
    this.auto = false;
    this.onDive = onDive;
    this.onWiki = onWiki;
    this.onClose = onClose;
  }

  get isOpen() { return !this.el.hidden; }

  open(node, text, { auto = false } = {}) {
    this.node = node;
    this.auto = auto;
    const divable = node.type !== 'att';
    const tag = node.type === 'hub' ? 'synthesized hub'
      : node.type === 'att' ? 'attachment'
      : node.folder;

    this.el.innerHTML = `
      <header>
        <div class="folder">${tag}</div>
        <h1></h1>
      </header>
      <div class="body">${renderMarkdownMini(text)}</div>
      <footer>
        ${divable ? '<button class="primary" data-act="dive">dive · V</button>' : ''}
        <button data-act="close">close</button>
      </footer>
    `;
    this.el.querySelector('h1').textContent = node.label;
    this.el.hidden = false;

    this.el.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.act === 'dive') this.onDive?.(this.node);
        else this.close();
      });
    });
    this.el.querySelectorAll('.wl').forEach((w) => {
      w.addEventListener('click', () => this.onWiki?.(w.dataset.t));
    });
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.node = null;
    this.auto = false;
    this.onClose?.();
  }
}
