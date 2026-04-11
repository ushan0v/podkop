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

  const zapretStatus = await PodkopShellMethods.getZapretStatus();

  if (!zapretStatus.success) {
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

  const installed = Boolean(zapretStatus.data.installed);
  const hasZapretRules = Number(zapretStatus.data.enabled_rule_count || 0) > 0;

  if (installed) {
    updateCheckStore({
      order,
      code,
      title,
      description: _('Checks passed'),
      state: 'success',
      items: [
        {
          state: 'success',
          key: _('Zapret installed'),
          value: '',
        },
        {
          state: 'success',
          key: hasZapretRules
            ? _('There are rules using zapret')
            : _('No rules use zapret'),
          value: '',
        },
      ],
    });

    return;
  }

  if (hasZapretRules) {
    updateCheckStore({
      order,
      code,
      title,
      description: _('Zapret not installed'),
      state: 'error',
      items: [
        {
          state: 'error',
          key: _('Zapret not installed'),
          value: '',
        },
        {
          state: 'error',
          key: _('There are rules using zapret'),
          value: '',
        },
      ],
    });

    return;
  }

  updateCheckStore({
    order,
    code,
    title,
    description: _('Zapret not installed'),
    state: 'warning',
    items: [
      {
        state: 'warning',
        key: _('Zapret not installed'),
        value: '',
      },
      {
        state: 'success',
        key: _('No rules use zapret'),
        value: '',
      },
    ],
  });
}
