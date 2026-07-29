import { h } from './ui.js';

const CHEVRON = `<svg class="cs-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;

// Install a single global listener (idempotent — safe to import from many pages).
if (!window.__csReady) {
  window.__csReady = true;
  document.addEventListener('click', e => {
    if (!e.target.closest('.custom-select')) {
      document.querySelectorAll('.custom-select.cs-open').forEach(closeEl);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.custom-select.cs-open').forEach(closeEl);
  });
}

function closeEl(el) {
  el.classList.remove('cs-open');
  el.querySelector('.cs-btn')?.setAttribute('aria-expanded', 'false');
  const menu = el.querySelector('.cs-menu');
  if (menu) menu.style.display = 'none';
}

/**
 * Returns the HTML string for a themed custom select.
 *
 * @param {Object} cfg
 * @param {string}   cfg.id       - Element id
 * @param {string}  [cfg.name]    - Hidden input name (for FormData submission)
 * @param {string}  [cfg.value]   - Pre-selected value (matches options[n][0])
 * @param {Array}    cfg.options  - [[value, label], ...]
 * @param {'filter'|'form'|'inline'} [cfg.variant='filter']
 * @param {boolean} [cfg.disabled=false]
 */
export function renderSelect({ id, name, value = '', options, variant = 'filter', disabled = false }) {
  const match = options.find(([v]) => v === value);
  const selValue = match ? match[0] : (options[0]?.[0] ?? '');
  const selLabel = match ? match[1] : (options[0]?.[1] ?? '');

  return `<div class="custom-select custom-select--${h(variant)}${disabled ? ' custom-select--disabled' : ''}"
              id="${h(id)}" data-value="${h(selValue)}">
    ${name ? `<input type="hidden" name="${h(name)}" value="${h(selValue)}">` : ''}
    <button type="button" class="cs-btn" aria-haspopup="listbox" aria-expanded="false"${disabled ? ' disabled' : ''}>
      <span class="cs-label">${h(selLabel)}</span>
      ${CHEVRON}
    </button>
    <div class="cs-menu" role="listbox" style="display:none">
      ${options.map(([v, l]) => `<div class="cs-option${v === selValue ? ' cs-selected' : ''}"
          data-value="${h(v)}" role="option" aria-selected="${v === selValue}">${h(l)}</div>`).join('')}
    </div>
  </div>`;
}

/**
 * Wires up interaction for a rendered custom select.
 * Safe to call even if the element doesn't exist (returns undefined).
 *
 * @param {string}    id
 * @param {Function} [onChange]  - called with the selected value string
 * @returns {{ getValue: () => string } | undefined}
 */
export function initSelect(id, onChange) {
  const el = document.getElementById(id);
  if (!el || el.classList.contains('custom-select--disabled')) return;

  const btn    = el.querySelector('.cs-btn');
  const menu   = el.querySelector('.cs-menu');
  const hidden = el.querySelector('input[type="hidden"]');
  const label  = el.querySelector('.cs-label');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (el.classList.contains('cs-open')) {
      closeEl(el);
    } else {
      // Close others first
      document.querySelectorAll('.custom-select.cs-open').forEach(closeEl);
      menu.style.display = '';
      btn.setAttribute('aria-expanded', 'true');
      el.classList.add('cs-open');
    }
  });

  menu.querySelectorAll('.cs-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const val = opt.dataset.value;
      label.textContent = opt.textContent.trim();
      if (hidden) hidden.value = val;
      menu.querySelectorAll('.cs-option').forEach(o => {
        o.classList.remove('cs-selected');
        o.setAttribute('aria-selected', 'false');
      });
      opt.classList.add('cs-selected');
      opt.setAttribute('aria-selected', 'true');
      el.dataset.value = val;
      closeEl(el);
      onChange?.(val);
    });
  });

  return { getValue: () => el.dataset.value };
}
