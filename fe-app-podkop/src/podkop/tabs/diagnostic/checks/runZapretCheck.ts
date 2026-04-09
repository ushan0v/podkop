import { DIAGNOSTICS_CHECKS_MAP } from './contstants';
import { PodkopShellMethods } from '../../../methods';
import { updateCheckStore } from './updateCheckStore';

export async function runZapretCheck() {
  const { order, title, code } = DIAGNOSTICS_CHECKS_MAP.ZAPRET;

  updateCheckStore({
    order,
    code,
    title,
    description: _('Checking, please wait'),
    state: 'loading',
    items: [],
  });

  const zapretChecks = await PodkopShellMethods.checkZapretRuntime();

  if (!zapretChecks.success) {
    updateCheckStore({
      order,
      code,
      title,
      description: _('Cannot receive checks result'),
      state: 'error',
      items: [],
    });

    throw new Error('Zapret checks failed');
  }

  const installed = Boolean(zapretChecks.data.zapret_installed);

  updateCheckStore({
    order,
    code,
    title,
    description: installed ? _('Checks passed') : _('Checks failed'),
    state: installed ? 'success' : 'error',
    items: [
      {
        state: installed ? 'success' : 'error',
        key: installed ? _('Zapret installed') : _('Zapret not installed'),
        value: '',
      },
    ],
  });

  if (!installed) {
    throw new Error('Zapret checks failed');
  }
}
