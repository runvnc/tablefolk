/* confirm-dialog.js -- glass confirmation dialog for tablefolk.world.
 *
 * window.confirmDialog(message, opts?) -> Promise<boolean>
 *
 *   opts.title       heading text          (default 'Are you sure?')
 *   opts.confirmText confirm button label  (default 'confirm')
 *   opts.cancelText  cancel button label   (default 'cancel')
 *   opts.danger      red destructive style (default false)
 *
 * The dialog renders as an overlay exactly over the left control panel so
 * the pointer never has to travel. Enter confirms, Escape or clicking the
 * dimmed backdrop cancels. Only one dialog at a time; a new call supersedes
 * (cancels) the previous one, mirroring native confirm() semantics.
 */
(() => {
  let active = null;

  function panelRect() {
    const panel = document.querySelector('#sidePanel.open') || document.querySelector('#sidePanel');
    if (panel && panel.classList.contains('open')) return panel.getBoundingClientRect();
    return null;
  }

  function fitOverlay(root) {
    const rect = panelRect();
    if (rect) {
      root.style.left = rect.left + 'px';
      root.style.top = rect.top + 'px';
      root.style.width = rect.width + 'px';
      root.style.height = rect.height + 'px';
      root.classList.remove('confirm-overlay-full');
    } else {
      root.classList.add('confirm-overlay-full');
    }
  }

  function close(result) {
    if (!active) return;
    const { root, resolve, prevFocus, keyHandler, resizeHandler } = active;
    active = null;
    document.removeEventListener('keydown', keyHandler, true);
    window.removeEventListener('resize', resizeHandler);
    root.classList.add('confirm-closing');
    const kill = () => { if (root.isConnected) root.remove(); };
    root.addEventListener('animationend', kill, { once: true });
    setTimeout(kill, 400); // fallback if animationend never fires
    if (prevFocus && prevFocus.isConnected) {
      try { prevFocus.focus({ preventScroll: true }); } catch {}
    }
    resolve(result);
  }

  window.confirmDialog = function confirmDialog(message, opts = {}) {
    if (active) close(false);

    const {
      title = 'Are you sure?',
      confirmText = 'confirm',
      cancelText = 'cancel',
      danger = false,
    } = opts;

    const root = document.createElement('div');
    root.className = 'confirm-overlay' + (danger ? ' confirm-danger' : '');
    fitOverlay(root);

    const card = document.createElement('div');
    card.className = 'confirm-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', title);

    const icon = document.createElement('div');
    icon.className = 'confirm-icon';
    icon.setAttribute('aria-hidden', 'true');

    const titleEl = document.createElement('div');
    titleEl.className = 'confirm-title';
    titleEl.textContent = title;

    const msg = document.createElement('div');
    msg.className = 'confirm-msg';
    msg.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'confirm-btn confirm-yes';
    yes.textContent = confirmText;

    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'confirm-btn confirm-no';
    no.textContent = cancelText;

    actions.append(no, yes);
    card.append(icon, titleEl, msg, actions);
    root.appendChild(card);
    document.body.appendChild(root);

    yes.addEventListener('click', () => close(true));
    no.addEventListener('click', () => close(false));
    root.addEventListener('pointerdown', ev => { if (ev.target === root) close(false); });

    const keyHandler = ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(false); }
      else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); close(true); }
    };
    document.addEventListener('keydown', keyHandler, true);

    const resizeHandler = () => fitOverlay(root);
    window.addEventListener('resize', resizeHandler);

    const prevFocus = document.activeElement;
    try { yes.focus({ preventScroll: true }); } catch {}

    return new Promise(resolve => {
      active = { root, resolve, prevFocus, keyHandler, resizeHandler };
    });
  };
})();
