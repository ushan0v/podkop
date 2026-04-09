import { GlobalStyles } from '../styles';

const PODKOP_GLOBAL_STYLES_ID = 'podkop-global-styles';

export function injectGlobalStyles() {
  if (document.getElementById(PODKOP_GLOBAL_STYLES_ID)) {
    return;
  }

  document.head.insertAdjacentHTML(
    'beforeend',
    `
        <style id="${PODKOP_GLOBAL_STYLES_ID}">
          ${GlobalStyles}
        </style>
    `,
  );
}
