import { normalizeCompiledVersion } from '../../../../helpers/normalizeCompiledVersion';
import {
  compareReleaseVersions,
  isDevVersion,
} from '../../../../helpers/compareReleaseVersions';
import type { StoreType } from '../../../services/store.service';
import type { IRenderSystemInfoRow } from '../partials';

function isUnknownVersion(version?: string | null): boolean {
  return version === 'unknown' || version === _('unknown');
}

export function getPodkopVersionRow(
  diagnosticsSystemInfo: StoreType['diagnosticsSystemInfo'],
): IRenderSystemInfoRow {
  const loading = diagnosticsSystemInfo.loading;
  const unknown = isUnknownVersion(diagnosticsSystemInfo.podkop_version);
  const hasActualVersion =
    Boolean(diagnosticsSystemInfo.podkop_latest_version) &&
    !isUnknownVersion(diagnosticsSystemInfo.podkop_latest_version);
  const version = normalizeCompiledVersion(
    diagnosticsSystemInfo.podkop_version,
  );
  const latestVersion = diagnosticsSystemInfo.podkop_latest_version || '';

  if (loading) {
    return {
      key: 'Podkop Plus',
      value: version,
      tag: {
        label: _('Checking'),
        kind: 'neutral',
      },
    };
  }

  if (isDevVersion(version)) {
    return {
      key: 'Podkop Plus',
      value: version,
      tag: {
        label: _('Dev'),
        kind: 'neutral',
      },
    };
  }

  if (unknown || !hasActualVersion) {
    return {
      key: 'Podkop Plus',
      value: version,
      tag: {
        label: _('Check unavailable'),
        kind: 'neutral',
      },
    };
  }

  const versionCompareResult = compareReleaseVersions(version, latestVersion);

  if (versionCompareResult === null) {
    return {
      key: 'Podkop Plus',
      value: version,
      tag: {
        label: _('Check unavailable'),
        kind: 'neutral',
      },
    };
  }

  if (versionCompareResult < 0) {
    return {
      key: 'Podkop Plus',
      value: version,
      tag: {
        label: _('Outdated'),
        kind: 'warning',
      },
    };
  }

  if (versionCompareResult > 0) {
    return {
      key: 'Podkop Plus',
      value: version,
      tag: {
        label: _('Dev'),
        kind: 'neutral',
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
