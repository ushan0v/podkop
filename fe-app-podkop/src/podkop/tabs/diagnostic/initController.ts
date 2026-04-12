import { onMount, preserveScrollForPage } from '../../../helpers';
import { runDnsCheck } from './checks/runDnsCheck';
import { runSingBoxCheck } from './checks/runSingBoxCheck';
import { runNftCheck } from './checks/runNftCheck';
import { runFakeIPCheck } from './checks/runFakeIPCheck';
import { runZapretCheck } from './checks/runZapretCheck';
import { loadingDiagnosticsChecksStore } from './diagnostic.store';
import { logger, store, StoreType } from '../../services';
import {
  IRenderSystemInfoRow,
  renderAvailableActions,
  renderCheckSection,
  renderRunAction,
  renderSystemInfo,
} from './partials';
import { PodkopShellMethods } from '../../methods';
import { fetchServicesInfo } from '../../fetchers';
import { normalizeCompiledVersion } from '../../../helpers/normalizeCompiledVersion';
import { renderModal } from '../../../partials';
import { PODKOP_LUCI_APP_VERSION } from '../../../constants';
import { showToast } from '../../../helpers/showToast';
import { renderWikiDisclaimer } from './partials/renderWikiDisclaimer';
import { runSectionsCheck } from './checks/runSectionsCheck';

const UNKNOWN_DIAGNOSTICS_SYSTEM_INFO = {
  podkop_version: _('unknown'),
  podkop_latest_version: _('unknown'),
  luci_app_version: _('unknown'),
  sing_box_version: _('unknown'),
  zapret_version: _('unknown'),
  zapret_installed: 0,
  openwrt_version: _('unknown'),
  device_model: _('unknown'),
};

let latestSystemInfoRequestId = 0;
let diagnosticLifecycleRegistered = false;
let diagnosticControllerInitialized = false;

async function fetchSystemInfo() {
  const requestId = ++latestSystemInfoRequestId;

  try {
    const systemInfo = await PodkopShellMethods.getSystemInfo();

    if (requestId !== latestSystemInfoRequestId) {
      return;
    }

    if (systemInfo.success) {
      store.set({
        diagnosticsSystemInfo: {
          loading: false,
          ...systemInfo.data,
        },
      });
      return;
    }
  } catch (error) {
    logger.error('[DIAGNOSTIC]', 'fetchSystemInfo failed', error);
  }

  if (requestId === latestSystemInfoRequestId) {
    store.set({
      diagnosticsSystemInfo: {
        loading: false,
        ...UNKNOWN_DIAGNOSTICS_SYSTEM_INFO,
      },
    });
  }
}

function renderDiagnosticsChecks() {
  logger.debug('[DIAGNOSTIC]', 'renderDiagnosticsChecks');
  const diagnosticsChecks = store
    .get()
    .diagnosticsChecks.sort((a, b) => a.order - b.order);
  const container = document.getElementById('pdk_diagnostic-page-checks');

  const renderedDiagnosticsChecks = diagnosticsChecks.map((check) =>
    renderCheckSection(check),
  );

  return preserveScrollForPage(() => {
    container!.replaceChildren(...renderedDiagnosticsChecks);
  });
}

function renderDiagnosticRunActionWidget() {
  logger.debug('[DIAGNOSTIC]', 'renderDiagnosticRunActionWidget');

  const { loading } = store.get().diagnosticsRunAction;
  const container = document.getElementById('pdk_diagnostic-page-run-check');

  const renderedAction = renderRunAction({
    loading,
    click: () => runChecks(),
  });

  return preserveScrollForPage(() => {
    container!.replaceChildren(renderedAction);
  });
}

async function handleRestart() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      restart: { loading: true },
    },
  });

  try {
    await PodkopShellMethods.restart();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleRestart - e', e);
  } finally {
    setTimeout(async () => {
      await fetchServicesInfo();
      store.set({
        diagnosticsActions: {
          ...diagnosticsActions,
          restart: { loading: false },
        },
      });
      store.reset(['diagnosticsChecks']);
    }, 5000);
  }
}

async function handleStop() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      stop: { loading: true },
    },
  });

  try {
    await PodkopShellMethods.stop();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleStop - e', e);
  } finally {
    await fetchServicesInfo();
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        stop: { loading: false },
      },
    });
    store.reset(['diagnosticsChecks']);
  }
}

async function handleStart() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      start: { loading: true },
    },
  });

  try {
    await PodkopShellMethods.start();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleStart - e', e);
  } finally {
    setTimeout(async () => {
      await fetchServicesInfo();
      store.set({
        diagnosticsActions: {
          ...diagnosticsActions,
          start: { loading: false },
        },
      });
      store.reset(['diagnosticsChecks']);
    }, 5000);
  }
}

async function handleEnable() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      enable: { loading: true },
    },
  });

  try {
    await PodkopShellMethods.enable();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleEnable - e', e);
  } finally {
    await fetchServicesInfo();
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        enable: { loading: false },
      },
    });
  }
}

async function handleDisable() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      disable: { loading: true },
    },
  });

  try {
    await PodkopShellMethods.disable();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleDisable - e', e);
  } finally {
    await fetchServicesInfo();
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        disable: { loading: false },
      },
    });
  }
}

async function handleShowGlobalCheck() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      globalCheck: { loading: true },
    },
  });

  try {
    const globalCheck = await PodkopShellMethods.globalCheck();

    if (globalCheck.success) {
      ui.showModal(
        _('Global check'),
        renderModal(globalCheck.data as string, 'global_check'),
      );
    } else {
      logger.error('[DIAGNOSTIC]', 'handleShowGlobalCheck - e', globalCheck);
      showToast(_('Failed to execute!'), 'error');
    }
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleShowGlobalCheck - e', e);
    showToast(_('Failed to execute!'), 'error');
  } finally {
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        globalCheck: { loading: false },
      },
    });
  }
}

async function handleViewLogs() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      viewLogs: { loading: true },
    },
  });

  try {
    const viewLogs = await PodkopShellMethods.checkLogs();

    if (viewLogs.success) {
      const getLatestLogs = async () => {
        const latestLogs = await PodkopShellMethods.checkLogs();

        if (!latestLogs.success) {
          throw latestLogs;
        }

        return (latestLogs.data as string) ?? '';
      };

      ui.showModal(
        _('View logs'),
        renderModal(viewLogs.data as string, 'view_logs', {
          getText: getLatestLogs,
          refreshMs: 250,
          initialAutoRefresh: true,
          showAutoRefreshToggle: true,
          startAtEnd: true,
        }),
      );
    } else {
      logger.error('[DIAGNOSTIC]', 'handleViewLogs - e', viewLogs);
      showToast(_('Failed to execute!'), 'error');
    }
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleViewLogs - e', e);
    showToast(_('Failed to execute!'), 'error');
  } finally {
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        viewLogs: { loading: false },
      },
    });
  }
}

async function handleShowSingBoxConfig() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      showSingBoxConfig: { loading: true },
    },
  });

  try {
    const showSingBoxConfig = await PodkopShellMethods.showSingBoxConfig();

    if (showSingBoxConfig.success) {
      ui.showModal(
        _('Show sing-box config'),
        renderModal(
          JSON.stringify(showSingBoxConfig.data, null, 2),
          'show_sing_box_config',
        ),
      );
    } else {
      logger.error(
        '[DIAGNOSTIC]',
        'handleShowSingBoxConfig - e',
        showSingBoxConfig,
      );
      showToast(_('Failed to execute!'), 'error');
    }
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleShowSingBoxConfig - e', e);
    showToast(_('Failed to execute!'), 'error');
  } finally {
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        showSingBoxConfig: { loading: false },
      },
    });
  }
}

function renderWikiDisclaimerWidget() {
  const diagnosticsChecks = store.get().diagnosticsChecks;

  function getWikiKind() {
    const allResults = diagnosticsChecks.map((check) => check.state);

    if (allResults.includes('error')) {
      return 'error';
    }

    if (allResults.includes('warning')) {
      return 'warning';
    }

    return 'default';
  }

  const container = document.getElementById('pdk_diagnostic-page-wiki');

  return preserveScrollForPage(() => {
    container!.replaceChildren(renderWikiDisclaimer(getWikiKind()));
  });
}

function renderDiagnosticAvailableActionsWidget() {
  const diagnosticsActions = store.get().diagnosticsActions;
  const servicesInfoWidget = store.get().servicesInfoWidget;
  logger.debug('[DIAGNOSTIC]', 'renderDiagnosticAvailableActionsWidget');

  const podkopEnabled = Boolean(servicesInfoWidget.data.podkopEnabled);
  const singBoxRunning = Boolean(servicesInfoWidget.data.singbox);
  const atLeastOneMutatingActionLoading =
    diagnosticsActions.restart.loading ||
    diagnosticsActions.start.loading ||
    diagnosticsActions.stop.loading ||
    diagnosticsActions.enable.loading ||
    diagnosticsActions.disable.loading;
  const serviceControlsDisabled =
    servicesInfoWidget.loading || atLeastOneMutatingActionLoading;
  const utilityActionsDisabled = atLeastOneMutatingActionLoading;

  const container = document.getElementById('pdk_diagnostic-page-actions');

  const renderedActions = renderAvailableActions({
    restart: {
      loading: diagnosticsActions.restart.loading,
      visible: true,
      onClick: handleRestart,
      disabled: serviceControlsDisabled,
    },
    start: {
      loading: diagnosticsActions.start.loading,
      visible: !singBoxRunning,
      onClick: handleStart,
      disabled: serviceControlsDisabled,
    },
    stop: {
      loading: diagnosticsActions.stop.loading,
      visible: singBoxRunning,
      onClick: handleStop,
      disabled: serviceControlsDisabled,
    },
    enable: {
      loading: diagnosticsActions.enable.loading,
      visible: !podkopEnabled,
      onClick: handleEnable,
      disabled: serviceControlsDisabled,
    },
    disable: {
      loading: diagnosticsActions.disable.loading,
      visible: podkopEnabled,
      onClick: handleDisable,
      disabled: serviceControlsDisabled,
    },
    globalCheck: {
      loading: diagnosticsActions.globalCheck.loading,
      visible: true,
      onClick: handleShowGlobalCheck,
      disabled: utilityActionsDisabled,
    },
    viewLogs: {
      loading: diagnosticsActions.viewLogs.loading,
      visible: true,
      onClick: handleViewLogs,
      disabled: false,
    },
    showSingBoxConfig: {
      loading: diagnosticsActions.showSingBoxConfig.loading,
      visible: true,
      onClick: handleShowSingBoxConfig,
      disabled: utilityActionsDisabled,
    },
  });

  return preserveScrollForPage(() => {
    container!.replaceChildren(renderedActions);
  });
}

function renderDiagnosticSystemInfoWidget() {
  logger.debug('[DIAGNOSTIC]', 'renderDiagnosticSystemInfoWidget');
  const diagnosticsSystemInfo = store.get().diagnosticsSystemInfo;

  const container = document.getElementById('pdk_diagnostic-page-system-info');

  function getPodkopVersionRow(): IRenderSystemInfoRow {
    const loading = diagnosticsSystemInfo.loading;
    const unknown = diagnosticsSystemInfo.podkop_version === _('unknown');
    const hasActualVersion =
      Boolean(diagnosticsSystemInfo.podkop_latest_version) &&
      diagnosticsSystemInfo.podkop_latest_version !== 'unknown';
    const version = normalizeCompiledVersion(
      diagnosticsSystemInfo.podkop_version,
    );
    const latestVersion =
      `${diagnosticsSystemInfo.podkop_latest_version || ''}`.replace(/^v/, '');
    const isDevVersion = version === 'dev';

    if (loading || unknown || !hasActualVersion || isDevVersion) {
      return {
        key: 'Podkop Plus',
        value: version,
      };
    }

    if (`${version}`.replace(/^v/, '') !== latestVersion) {
      logger.debug(
        '[DIAGNOSTIC]',
        'diagnosticsSystemInfo',
        diagnosticsSystemInfo,
      );
      return {
        key: 'Podkop Plus',
        value: version,
        tag: {
          label: _('Outdated'),
          kind: 'warning',
        },
      };
    }

    return {
      key: 'Podkop Plus',
      value: version,
      tag: {
        label: _('Latest'),
        kind: 'success',
      },
    };
  }

  const renderedSystemInfo = renderSystemInfo({
    items: [
      getPodkopVersionRow(),
      {
        key: 'Luci App',
        value: normalizeCompiledVersion(PODKOP_LUCI_APP_VERSION),
      },
      {
        key: 'Sing-box',
        value: diagnosticsSystemInfo.sing_box_version,
      },
      {
        key: 'Zapret',
        value: diagnosticsSystemInfo.loading
          ? 'loading'
          : diagnosticsSystemInfo.zapret_installed
          ? diagnosticsSystemInfo.zapret_version
          : _('not installed'),
      },
      {
        key: 'OS',
        value: diagnosticsSystemInfo.openwrt_version,
      },
      {
        key: 'Device',
        value: diagnosticsSystemInfo.device_model,
      },
    ],
  });

  return preserveScrollForPage(() => {
    container!.replaceChildren(renderedSystemInfo);
  });
}

async function onStoreUpdate(
  next: StoreType,
  prev: StoreType,
  diff: Partial<StoreType>,
) {
  if (diff.diagnosticsChecks) {
    renderDiagnosticsChecks();
    renderWikiDisclaimerWidget();
  }

  if (diff.diagnosticsRunAction) {
    renderDiagnosticRunActionWidget();
  }

  if (diff.diagnosticsActions || diff.servicesInfoWidget) {
    renderDiagnosticAvailableActionsWidget();
  }

  if (diff.diagnosticsSystemInfo) {
    renderDiagnosticSystemInfoWidget();
  }
}

async function runChecks() {
  const runners = [
    runDnsCheck,
    runSingBoxCheck,
    runNftCheck,
    runZapretCheck,
    runSectionsCheck,
    runFakeIPCheck,
  ];

  try {
    store.set({
      diagnosticsRunAction: { loading: true },
      diagnosticsChecks: loadingDiagnosticsChecksStore.diagnosticsChecks,
    });

    for (const runner of runners) {
      try {
        await runner();
      } catch (e) {
        logger.error('[DIAGNOSTIC]', `runChecks - ${runner.name} failed`, e);
      }
    }
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'runChecks - e', e);
  } finally {
    store.set({ diagnosticsRunAction: { loading: false } });
  }
}

async function loadInitialDiagnosticData() {
  await fetchServicesInfo();

  const diagnosticStatus = document.getElementById('diagnostic-status');

  if (diagnosticStatus?.isConnected && diagnosticStatus.offsetParent !== null) {
    await fetchSystemInfo();
  }
}

function onPageMount() {
  // Cleanup before mount
  onPageUnmount();

  // Add new listener
  store.subscribe(onStoreUpdate);

  // Initial checks render
  renderDiagnosticsChecks();

  // Initial run checks action render
  renderDiagnosticRunActionWidget();

  // Initial available actions render
  renderDiagnosticAvailableActionsWidget();

  // Initial system info render
  renderDiagnosticSystemInfoWidget();

  // Initial Wiki disclaimer render
  renderWikiDisclaimerWidget();

  void loadInitialDiagnosticData();
}

function onPageUnmount() {
  // Remove old listener
  store.unsubscribe(onStoreUpdate);

  // Clear store
  store.reset([
    'diagnosticsActions',
    'diagnosticsSystemInfo',
    'diagnosticsChecks',
    'diagnosticsRunAction',
  ]);
}

function registerLifecycleListeners() {
  if (diagnosticLifecycleRegistered) {
    return;
  }

  diagnosticLifecycleRegistered = true;

  store.subscribe((next, prev, diff) => {
    if (
      diff.tabService &&
      next.tabService.current !== prev.tabService.current
    ) {
      logger.debug(
        '[DIAGNOSTIC]',
        'active tab diff event, active tab:',
        diff.tabService.current,
      );
      const isDIAGNOSTICVisible = next.tabService.current === 'diagnostic';

      if (isDIAGNOSTICVisible) {
        logger.debug(
          '[DIAGNOSTIC]',
          'registerLifecycleListeners',
          'onPageMount',
        );
        return onPageMount();
      }

      if (!isDIAGNOSTICVisible) {
        logger.debug(
          '[DIAGNOSTIC]',
          'registerLifecycleListeners',
          'onPageUnmount',
        );
        return onPageUnmount();
      }
    }
  });
}

export async function initController(): Promise<void> {
  if (diagnosticControllerInitialized) {
    return;
  }

  diagnosticControllerInitialized = true;

  onMount('diagnostic-status').then(() => {
    logger.debug('[DIAGNOSTIC]', 'initController', 'onMount');
    onPageMount();
    registerLifecycleListeners();
  });
}
