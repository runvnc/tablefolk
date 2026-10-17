/* toast.js -- transient glass toasts for tablefolk.world.
 *
 * window.tablefolkToast(message, opts?) -> dismiss function
 *
 *   opts.type      'info' | 'success' | 'warn' | 'error'  (default 'info')
 *   opts.duration  ms before auto-dismiss; 0 = sticky     (default 3000,
 *                  9000 when an action is attached)
 *   opts.action    { label, onClick } optional button (used for undo)
 *
 * Toasts stack bottom-left (max 4), click to dismiss. Styled after the
 * model-load notice so the whole app speaks one visual language.
 */
(() => {
  const MAX = 4;
  const DOT = { info: '#d7ff9a', success: '#8befae', warn: '#ffc878', error: '#ff7766' };
  let stack = null;

  function ensureStack() {
    if (stack && stack.isConnected) return stack;
    stack = document.createElement('div');
    stack.id = 'toastStack';
    document.body.appendChild(stack);
    return stack;
  }

  window.tablefolkToast = function tablefolkToast(message, opts = {}) {
    try {
      const { type = 'info', action = null } = opts;
      const ms = opts.duration ?? (action ? 9000 : 3000);
      const host = ensureStack();
      while (host.children.length >= MAX) host.firstChild.remove();

      const el = document.createElement('div');
      el.className = 'tablefolk-toast t-' + type;

      const dot = document.createElement('span');
      dot.className = 'toast-dot';
      const color = DOT[type] || DOT.info;
      dot.style.background = color;
      dot.style.boxShadow = '0 0 10px ' + color;

      const body = document.createElement('div');
      body.className = 'toast-body';
      body.textContent = String(message);

      el.append(dot, body);

      let dismissed = false;
      const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        el.classList.add('leaving');
        const kill = () => { if (el.isConnected) el.remove(); };
        el.addEventListener('animationend', kill, { once: true });
        setTimeout(kill, 300);
      };

      if (action && action.label && typeof action.onClick === 'function') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.addEventListener('click', ev => {
          ev.stopPropagation();
          dismiss();
          try { action.onClick(); } catch (e) { console.error('toast action failed', e); }
        });
        el.appendChild(btn);
      }

      el.addEventListener('click', () => dismiss());
      host.appendChild(el);
      if (ms > 0) setTimeout(dismiss, ms);
      return dismiss;
    } catch (e) {
      console.warn('tablefolkToast failed', e);
    }
  };
})();
