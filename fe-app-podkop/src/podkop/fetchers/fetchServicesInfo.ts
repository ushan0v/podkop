import { PodkopShellMethods } from '../methods';
import { logger, store } from '../services';
import { Podkop } from '../types';

let latestServicesInfoRequestId = 0;

function getSettledMethodResponse<T>(
  scope: string,
  result: PromiseSettledResult<Podkop.MethodResponse<T>>,
): Podkop.MethodResponse<T> {
  if (result.status === 'fulfilled') {
    return result.value;
  }

  logger.error('[SERVICES_INFO]', `${scope} failed`, result.reason);

  return {
    success: false,
    error: result.reason instanceof Error ? result.reason.message : '',
  };
}

export async function fetchServicesInfo() {
  const requestId = ++latestServicesInfoRequestId;

  const [podkopResult, singboxResult, zapretResult] = await Promise.allSettled([
    PodkopShellMethods.getStatus(),
    PodkopShellMethods.getSingBoxStatus(),
    PodkopShellMethods.getZapretStatus(),
  ]);

  if (requestId !== latestServicesInfoRequestId) {
    return;
  }

  const podkop = getSettledMethodResponse('getStatus', podkopResult);
  const singbox = getSettledMethodResponse('getSingBoxStatus', singboxResult);
  const zapret = getSettledMethodResponse('getZapretStatus', zapretResult);

  store.set({
    servicesInfoWidget: {
      loading: false,
      failed: !podkop.success || !singbox.success || !zapret.success,
      data: {
        singbox: singbox.success ? singbox.data.running : 0,
        podkopRunning: podkop.success ? podkop.data.running : 0,
        podkopEnabled: podkop.success ? podkop.data.enabled : 0,
        podkopStatus: podkop.success ? podkop.data.status : '',
        podkopLifecycleState: podkop.success
          ? podkop.data.lifecycle_state || 'unknown'
          : 'unknown',
        podkopLifecycleAction: podkop.success
          ? podkop.data.lifecycle_action || 'none'
          : 'none',
        podkopLifecycleBusy: podkop.success
          ? podkop.data.lifecycle_busy || 0
          : 0,
        zapret: zapret.success ? zapret.data.ready : 0,
        zapretInstalled: zapret.success ? zapret.data.installed : 0,
      },
    },
  });
}

export async function fetchPodkopStatus() {
  const podkop = await PodkopShellMethods.getStatus();

  const previous = store.get().servicesInfoWidget;

  store.set({
    servicesInfoWidget: {
      loading: false,
      failed: !podkop.success,
      data: {
        ...previous.data,
        podkopRunning: podkop.success ? podkop.data.running : 0,
        podkopEnabled: podkop.success ? podkop.data.enabled : 0,
        podkopStatus: podkop.success ? podkop.data.status : '',
        podkopLifecycleState: podkop.success
          ? podkop.data.lifecycle_state || 'unknown'
          : 'unknown',
        podkopLifecycleAction: podkop.success
          ? podkop.data.lifecycle_action || 'none'
          : 'none',
        podkopLifecycleBusy: podkop.success
          ? podkop.data.lifecycle_busy || 0
          : 0,
      },
    },
  });

  return podkop.success ? podkop.data : null;
}
