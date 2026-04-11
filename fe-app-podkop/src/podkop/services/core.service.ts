import { TabServiceInstance } from './tab.service';
import { store } from './store.service';
import { logger } from './logger.service';
import { PodkopLogWatcher } from './podkopLogWatcher.service';
import { PodkopShellMethods } from '../methods';

const LOG_NOTIFICATION_DEDUPE_WINDOW_MS = 15000;
const recentErrorNotifications = new Map<string, number>();

function getNotificationKey(line: string) {
  const lower = line.toLowerCase();
  const errorIndex = lower.indexOf('[error]');
  const fatalIndex = lower.indexOf('[fatal]');
  const markerIndex =
    errorIndex >= 0 && fatalIndex >= 0
      ? Math.min(errorIndex, fatalIndex)
      : Math.max(errorIndex, fatalIndex);

  return (markerIndex >= 0 ? line.slice(markerIndex) : line).trim();
}

function shouldNotifyAboutLogLine(line: string) {
  const key = getNotificationKey(line);
  const now = Date.now();
  const lastShownAt = recentErrorNotifications.get(key) ?? 0;

  recentErrorNotifications.forEach((shownAt, storedKey) => {
    if (now - shownAt > LOG_NOTIFICATION_DEDUPE_WINDOW_MS) {
      recentErrorNotifications.delete(storedKey);
    }
  });

  if (now - lastShownAt < LOG_NOTIFICATION_DEDUPE_WINDOW_MS) {
    return false;
  }

  recentErrorNotifications.set(key, now);
  return true;
}

export function coreService() {
  TabServiceInstance.onChange((activeId, tabs) => {
    logger.info('[TAB]', activeId);
    store.set({
      tabService: {
        current: activeId || '',
        all: tabs.map((tab) => tab.id),
      },
    });
  });

  const watcher = PodkopLogWatcher.getInstance();

  watcher.init(
    async () => {
      const logs = await PodkopShellMethods.checkLogs();

      if (logs.success) {
        return logs.data as string;
      }

      return '';
    },
    {
      intervalMs: 3000,
      onNewLog: (line) => {
        if (
          (line.toLowerCase().includes('[error]') ||
            line.toLowerCase().includes('[fatal]')) &&
          shouldNotifyAboutLogLine(line)
        ) {
          ui.addNotification('Podkop Plus Error', E('div', {}, line), 'error');
        }
      },
    },
  );

  watcher.start();
}
