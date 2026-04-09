import { getConfigSections } from './getConfigSections';
import { Podkop } from '../../types';
import { getProxyUrlName, splitProxyString } from '../../../helpers';
import { PodkopShellMethods } from '../shell';

interface IGetDashboardSectionsResponse {
  success: boolean;
  data: Podkop.OutboundGroup[];
}

function getDisplayName(section: Podkop.ConfigSection) {
  return section.label || section['.name'];
}

function getSectionAction(section: Podkop.ConfigSection) {
  if (section.action) {
    return section.action;
  }

  switch (section.connection_type) {
    case 'proxy':
    case 'vpn':
      return 'proxy';
    case 'block':
      return 'block';
    case 'exclusion':
      return 'direct';
    default:
      return '';
  }
}

function getSectionProxyConfigType(section: Podkop.ConfigSection) {
  if (section.proxy_config_type) {
    return section.proxy_config_type;
  }

  if (section.connection_type === 'vpn') {
    return 'interface';
  }

  return undefined;
}

export async function getDashboardSections(): Promise<IGetDashboardSectionsResponse> {
  const configSections = await getConfigSections();
  const clashProxies = await PodkopShellMethods.getClashApiProxies();

  if (!clashProxies.success) {
    return {
      success: false,
      data: [],
    };
  }

  const proxies = Object.entries(clashProxies.data.proxies).map(
    ([key, value]) => ({
      code: key,
      value,
    }),
  );

  const data = configSections
    .filter(
      (section) =>
        section.enabled !== '0' &&
        getSectionAction(section) === 'proxy',
    )
    .map((section) => {
      const displayName = getDisplayName(section);
      const proxyConfigType = getSectionProxyConfigType(section);

      if (proxyConfigType === 'url') {
        const outbound = proxies.find(
          (proxy) => proxy.code === `${section['.name']}-out`,
        );

        const activeConfigs = splitProxyString(section.proxy_string || '');
        const proxyDisplayName =
          getProxyUrlName(activeConfigs?.[0]) || outbound?.value?.name || '';

        return {
          withTagSelect: false,
          code: outbound?.code || section['.name'],
          displayName,
          outbounds: [
            {
              code: outbound?.code || section['.name'],
              displayName: proxyDisplayName,
              latency: outbound?.value?.history?.[0]?.delay || 0,
              type: outbound?.value?.type || '',
              selected: true,
            },
          ],
        };
      }

      if (proxyConfigType === 'outbound') {
        const outbound = proxies.find(
          (proxy) => proxy.code === `${section['.name']}-out`,
        );

        let parsedTag = '';
        try {
          const parsedOutbound = JSON.parse(section.outbound_json || '{}');
          parsedTag = parsedOutbound?.tag
            ? decodeURIComponent(parsedOutbound.tag)
            : '';
        } catch (_error) {
          parsedTag = '';
        }

        return {
          withTagSelect: false,
          code: outbound?.code || section['.name'],
          displayName,
          outbounds: [
            {
              code: outbound?.code || section['.name'],
              displayName: parsedTag || outbound?.value?.name || '',
              latency: outbound?.value?.history?.[0]?.delay || 0,
              type: outbound?.value?.type || '',
              selected: true,
            },
          ],
        };
      }

      if (proxyConfigType === 'selector') {
        const selector = proxies.find(
          (proxy) => proxy.code === `${section['.name']}-out`,
        );

        const links = section.selector_proxy_links ?? [];

        const outbounds = links
          .map((link, index) => ({
            link,
            outbound: proxies.find(
              (item) => item.code === `${section['.name']}-${index + 1}-out`,
            ),
          }))
          .map((item) => ({
            code: item?.outbound?.code || '',
            displayName:
              getProxyUrlName(item.link) || item?.outbound?.value?.name || '',
            latency: item?.outbound?.value?.history?.[0]?.delay || 0,
            type: item?.outbound?.value?.type || '',
            selected: selector?.value?.now === item?.outbound?.code,
          }));

        return {
          withTagSelect: true,
          code: selector?.code || section['.name'],
          displayName,
          outbounds,
        };
      }

      if (proxyConfigType === 'urltest') {
        const selector = proxies.find(
          (proxy) => proxy.code === `${section['.name']}-out`,
        );
        const outbound = proxies.find(
          (proxy) => proxy.code === `${section['.name']}-urltest-out`,
        );

        const outbounds = (outbound?.value?.all ?? [])
          .map((code) => proxies.find((item) => item.code === code))
          .map((item, index) => ({
            code: item?.code || '',
            displayName:
              getProxyUrlName(section.urltest_proxy_links?.[index] || '') ||
              item?.value?.name ||
              '',
            latency: item?.value?.history?.[0]?.delay || 0,
            type: item?.value?.type || '',
            selected: selector?.value?.now === item?.code,
          }));

        return {
          withTagSelect: true,
          code: selector?.code || section['.name'],
          displayName,
          outbounds: [
            {
              code: outbound?.code || '',
              displayName: _('Fastest'),
              latency: outbound?.value?.history?.[0]?.delay || 0,
              type: outbound?.value?.type || '',
              selected: selector?.value?.now === outbound?.code,
            },
            ...outbounds,
          ],
        };
      }

      if (proxyConfigType === 'interface') {
        const outbound = proxies.find(
          (proxy) => proxy.code === `${section['.name']}-out`,
        );

        return {
          withTagSelect: false,
          code: outbound?.code || section['.name'],
          displayName,
          outbounds: [
            {
              code: outbound?.code || section['.name'],
              displayName: section.interface || outbound?.value?.name || '',
              latency: outbound?.value?.history?.[0]?.delay || 0,
              type: outbound?.value?.type || '',
              selected: true,
            },
          ],
        };
      }

      return {
        withTagSelect: false,
        code: section['.name'],
        displayName,
        outbounds: [],
      };
    });

  return {
    success: true,
    data,
  };
}
