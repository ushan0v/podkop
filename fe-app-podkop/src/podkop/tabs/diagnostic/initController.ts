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
import { fetchPodkopStatus } from '../../fetchers';
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

const DIAGNOSTIC_STATUS_POLL_INTERVAL_MS = 2000;
const DIAGNOSTIC_STATUS_SETTLE_DELAY_MS = 1000;
const DIAGNOSTIC_STATUS_SETTLE_TIMEOUT_MS = 45000;

let latestSystemInfoRequestId = 0;
let diagnosticLifecycleRegistered = false;
let diagnosticControllerInitialized = false;
let diagnosticStatusPollTimer: ReturnType<typeof setInterval> | null = null;
let restartStartStopSnapshot: 'start' | 'stop' | null = null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function setDiagnosticActionLoading(
  action: keyof StoreType['diagnosticsActions'],
  loading: boolean,
) {
  const diagnosticsActions = store.get().diagnosticsActions;

  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      [action]: { loading },
    },
  });
}

async function waitForPodkopStatusToSettle(desiredRunning?: boolean) {
  const startedAt = Date.now();
  let sawBackendTransition = false;

  while (Date.now() - startedAt < DIAGNOSTIC_STATUS_SETTLE_TIMEOUT_MS) {
    const status = await fetchPodkopStatus();

    if (!status) {
      return;
    }

    if (status.lifecycle_busy) {
      sawBackendTransition = true;
      await sleep(DIAGNOSTIC_STATUS_SETTLE_DELAY_MS);
      continue;
    }

    if (status.lifecycle_state === 'failed') {
      return;
    }

    if (
      desiredRunning === undefined ||
      Boolean(status.running) === desiredRunning
    ) {
      if (sawBackendTransition || Date.now() - startedAt > 1500) {
        return;
      }
    }

    await sleep(DIAGNOSTIC_STATUS_SETTLE_DELAY_MS);
  }

  await fetchPodkopStatus();
}

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
  restartStartStopSnapshot = store.get().servicesInfoWidget.data.podkopRunning
    ? 'stop'
    : 'start';
  setDiagnosticActionLoading('restart', true);

  try {
    await PodkopShellMethods.restart();
    await waitForPodkopStatusToSettle(true);
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleRestart - e', e);
  } finally {
    restartStartStopSnapshot = null;
    setDiagnosticActionLoading('restart', false);
    store.reset(['diagnosticsChecks']);
  }
}

async function handleStop() {
  setDiagnosticActionLoading('stop', true);

  try {
    await PodkopShellMethods.stop();
    await waitForPodkopStatusToSettle(false);
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleStop - e', e);
  } finally {
    setDiagnosticActionLoading('stop', false);
    store.reset(['diagnosticsChecks']);
  }
}

async function handleStart() {
  setDiagnosticActionLoading('start', true);

  try {
    await PodkopShellMethods.start();
    await waitForPodkopStatusToSettle(true);
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleStart - e', e);
  } finally {
    setDiagnosticActionLoading('start', false);
    store.reset(['diagnosticsChecks']);
  }
}

async function handleEnable() {
  setDiagnosticActionLoading('enable', true);

  try {
    await PodkopShellMethods.enable();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleEnable - e', e);
  } finally {
    await fetchPodkopStatus();
    setDiagnosticActionLoading('enable', false);
  }
}

async function handleDisable() {
  setDiagnosticActionLoading('disable', true);

  try {
    await PodkopShellMethods.disable();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleDisable - e', e);
  } finally {
    await fetchPodkopStatus();
    setDiagnosticActionLoading('disable', false);
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
  const podkopRunning = Boolean(servicesInfoWidget.data.podkopRunning);
  const lifecycleBusy = Boolean(servicesInfoWidget.data.podkopLifecycleBusy);
  const lifecycleAction = servicesInfoWidget.data.podkopLifecycleAction;
  const isStarting = lifecycleBusy && lifecycleAction === 'start';
  const isStopping = lifecycleBusy && lifecycleAction === 'stop';
  const isRestarting = lifecycleBusy && lifecycleAction === 'restart';
  const isReloading = lifecycleBusy && lifecycleAction === 'reload';
  const restartLoading = diagnosticsActions.restart.loading;
  const atLeastOneMutatingActionLoading =
    restartLoading ||
    diagnosticsActions.start.loading ||
    diagnosticsActions.stop.loading ||
    diagnosticsActions.enable.loading ||
    diagnosticsActions.disable.loading;
  const serviceControlsDisabled =
    servicesInfoWidget.loading ||
    lifecycleBusy ||
    atLeastOneMutatingActionLoading;
  const utilityActionsDisabled = lifecycleBusy || atLeastOneMutatingActionLoading;
  const startVisible =
    isStarting ||
    (!podkopRunning && !isStopping && !isRestarting && !isReloading);
  const stopVisible =
    isStopping ||
    (podkopRunning && !isStarting && !isRestarting && !isReloading);
  const frozenStartStop =
    restartLoading && (restartStartStopSnapshot || (podkopRunning ? 'stop' : 'start'));

  const container = document.getElementById('pdk_diagnostic-page-actions');

  const renderedActions = renderAvailableActions({
    restart: {
      loading: restartLoading || isRestarting || isReloading,
      visible: true,
      onClick: handleRestart,
      disabled: serviceControlsDisabled,
    },
    start: {
      loading: frozenStartStop ? false : diagnosticsActions.start.loading || isStarting,
      visible: frozenStartStop ? frozenStartStop === 'start' : startVisible,
      onClick: handleStart,
      disabled: serviceControlsDisabled,
    },
    stop: {
      loading: frozenStartStop ? false : diagnosticsActions.stop.loading || isStopping,
      visible: frozenStartStop ? frozenStartStop === 'stop' : stopVisible,
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
  const diagnosticStatus = document.getElementById('diagnostic-status');

  if (
    diagnosticStatus?.isConnected &&
    diagnosticStatus.offsetParent !== null &&
    store.get().diagnosticsSystemInfo.loading
  ) {
    await fetchSystemInfo();
  }
}

function startDiagnosticStatusPolling() {
  stopDiagnosticStatusPolling();

  void fetchPodkopStatus();
  diagnosticStatusPollTimer = setInterval(() => {
    void fetchPodkopStatus();
  }, DIAGNOSTIC_STATUS_POLL_INTERVAL_MS);
}

function stopDiagnosticStatusPolling() {
  if (diagnosticStatusPollTimer === null) {
    return;
  }

  clearInterval(diagnosticStatusPollTimer);
  diagnosticStatusPollTimer = null;
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

  startDiagnosticStatusPolling();
  void loadInitialDiagnosticData();
}

function onPageUnmount() {
  // Remove old listener
  store.unsubscribe(onStoreUpdate);
  stopDiagnosticStatusPolling();

  // Clear store
  store.reset([
    'diagnosticsActions',
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
