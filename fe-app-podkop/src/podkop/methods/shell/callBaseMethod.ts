import { executeShellCommand } from '../../../helpers';
import { Podkop } from '../../types';

export async function callBaseMethod<T>(
  method: Podkop.AvailableMethods,
  args: string[] = [],
  command: string = '/usr/bin/podkop-plus',
): Promise<Podkop.MethodResponse<T>> {
  try {
    const response = await executeShellCommand({
      command,
      args: [method as string, ...args],
      timeout: 15000,
    });

    if (response.stdout) {
      try {
        return {
          success: true,
          data: JSON.parse(response.stdout) as T,
        };
      } catch (_e) {
        return {
          success: true,
          data: response.stdout as T,
        };
      }
    }

    return {
      success: false,
      error: response.stderr || '',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '',
    };
  }
}
