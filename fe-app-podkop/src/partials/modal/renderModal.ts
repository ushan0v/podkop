import { renderButton } from '../button/renderButton';
import { copyToClipboard } from '../../helpers/copyToClipboard';
import { downloadAsTxt } from '../../helpers/downloadAsTxt';

interface RenderModalOptions {
  getText?: () => string | Promise<string>;
  refreshMs?: number;
  initialAutoRefresh?: boolean;
  showAutoRefreshToggle?: boolean;
  startAtEnd?: boolean;
  autoRefreshLabel?: string;
}

export function renderModal(
  text: string,
  name: string,
  options?: RenderModalOptions,
) {
  let currentText = text ?? '';
  let refreshInFlight = false;
  let pendingRefresh = false;
  let refreshSessionId = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let observer: MutationObserver | undefined;
  let autoRefreshEnabled =
    options?.initialAutoRefresh ?? Boolean(options?.getText);
  let shouldScrollToBottomOnMount = Boolean(options?.startAtEnd);
  let autoRefreshInput: HTMLInputElement | undefined;

  const codeEl = E('code', {}, currentText) as HTMLElement;
  const contentEl = E(
    'pre',
    { class: 'pdk-partial-modal__content' },
    codeEl,
  ) as HTMLElement;

  const stopRefreshTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const destroyLiveRefresh = () => {
    refreshSessionId += 1;
    pendingRefresh = false;
    stopRefreshTimer();

    observer?.disconnect();
    observer = undefined;
  };

  const scrollToBottom = () => {
    contentEl.scrollTop = contentEl.scrollHeight;
  };

  const scheduleInitialScrollToBottom = () => {
    if (!shouldScrollToBottomOnMount || !body.isConnected) {
      return;
    }

    shouldScrollToBottomOnMount = false;

    requestAnimationFrame(() => {
      scrollToBottom();
    });
  };

  const updateText = (nextText: string) => {
    const normalizedText = nextText ?? '';

    const shouldStickToBottom =
      shouldScrollToBottomOnMount ||
      contentEl.scrollTop + contentEl.clientHeight >=
        contentEl.scrollHeight - 16;

    if (normalizedText === currentText) {
      if (shouldStickToBottom) {
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }

      return;
    }

    currentText = normalizedText;
    codeEl.textContent = currentText;

    if (shouldStickToBottom) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  };

  const refreshText = async () => {
    if (!options?.getText || !autoRefreshEnabled || refreshInFlight) {
      return;
    }

    if (!body.isConnected) {
      return;
    }

    refreshInFlight = true;
    const sessionId = refreshSessionId;

    try {
      const nextText = await options.getText();

      if (!body.isConnected || !autoRefreshEnabled) {
        return;
      }

      if (sessionId !== refreshSessionId) {
        return;
      }

      updateText(nextText ?? '');
    } catch (error) {
      console.warn('[renderModal] failed to refresh modal content', error);
    } finally {
      refreshInFlight = false;

      if (pendingRefresh) {
        pendingRefresh = false;

        if (autoRefreshEnabled && body.isConnected) {
          void refreshText();
        }
      }
    }
  };

  const requestRefresh = () => {
    if (!options?.getText || !autoRefreshEnabled) {
      return;
    }

    if (refreshInFlight) {
      pendingRefresh = true;
      return;
    }

    void refreshText();
  };

  const startRefreshTimer = () => {
    if (
      !options?.getText ||
      !autoRefreshEnabled ||
      timer ||
      typeof document === 'undefined'
    ) {
      return;
    }

    timer = setInterval(() => {
      requestRefresh();
    }, options.refreshMs ?? 3000);
  };

  const setAutoRefreshEnabled = (nextValue: boolean) => {
    autoRefreshEnabled = nextValue;
    refreshSessionId += 1;
    pendingRefresh = false;

    if (autoRefreshInput) {
      autoRefreshInput.checked = nextValue;
    }

    if (nextValue) {
      startRefreshTimer();
      requestRefresh();
      return;
    }

    stopRefreshTimer();
  };

  const footerChildren = [
    renderButton({
      classNames: ['cbi-button-apply'],
      text: _('Download'),
      onClick: () => downloadAsTxt(currentText, name),
    }),
    renderButton({
      classNames: ['cbi-button-apply'],
      text: _('Copy'),
      onClick: () =>
        copyToClipboard(` \`\`\`${name} \n ${currentText}  \n \`\`\``),
    }),
    renderButton({
      classNames: ['cbi-button-remove'],
      text: _('Close'),
      onClick: () => {
        destroyLiveRefresh();
        ui.hideModal();
      },
    }),
  ];

  if (options?.getText && options?.showAutoRefreshToggle) {
    autoRefreshInput = document.createElement('input');
    autoRefreshInput.type = 'checkbox';
    autoRefreshInput.className = 'cbi-input-checkbox';
    autoRefreshInput.checked = autoRefreshEnabled;
    autoRefreshInput.addEventListener('change', () => {
      setAutoRefreshEnabled(autoRefreshInput!.checked);
    });

    footerChildren.unshift(
      E('label', { class: 'pdk-partial-modal__checkbox' }, [
        autoRefreshInput,
        E(
          'span',
          { class: 'pdk-partial-modal__checkbox-text' },
          options.autoRefreshLabel ?? _('Auto refresh'),
        ),
      ]) as HTMLElement,
    );
  }

  const body = E('div', { class: 'pdk-partial-modal__body' }, [
    E('div', {}, [
      contentEl,

      E('div', { class: 'pdk-partial-modal__footer' }, footerChildren),
    ]),
  ]) as HTMLElement;

  if (
    (options?.getText || options?.startAtEnd) &&
    typeof document !== 'undefined'
  ) {
    observer = new MutationObserver(() => {
      if (!body.isConnected) {
        destroyLiveRefresh();
        return;
      }

      scheduleInitialScrollToBottom();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    scheduleInitialScrollToBottom();
  }

  if (options?.getText && typeof document !== 'undefined') {
    startRefreshTimer();
    requestRefresh();
  }

  return body;
}
