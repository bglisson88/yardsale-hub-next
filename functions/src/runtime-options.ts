import type { CallableOptions } from 'firebase-functions/v2/https';
import type { EventHandlerOptions, MemoryOption } from 'firebase-functions/v2';

const STAGING_PROJECT_ID = 'yardsale-hub-staging';
const PRODUCTION_PROJECT_ID = 'yardsale-hub-93c49';
const EMULATOR_PROJECT_ID = 'demo-yardsale-hub';
const STAGING_SERVICE_ACCOUNT =
  'yardsale-hub-staging-backend@yardsale-hub-staging.iam.gserviceaccount.com';
const PRODUCTION_SERVICE_ACCOUNT =
  'yardsale-hub-prod-backend@yardsale-hub-93c49.iam.gserviceaccount.com';
const REQUIRED_REGION = 'us-south1';
const REQUIRED_LIMITS = {
  maxInstances: 2,
  concurrency: 10,
  timeoutSeconds: 30,
  memory: '256MiB',
  minInstances: 0,
} as const;
type RuntimeEnvironment = NodeJS.ProcessEnv;

function configurationError(detail: string): never {
  throw new Error(`Invalid profile callable runtime configuration: ${detail}.`);
}

function requiredValue(env: RuntimeEnvironment, name: string): string {
  const value = env[name]?.trim();
  if (!value) configurationError(`${name} is required`);
  return value;
}

function positiveInteger(env: RuntimeEnvironment, name: string): number {
  const value = requiredValue(env, name);
  if (!/^[1-9]\d*$/.test(value)) configurationError(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) configurationError(`${name} is outside the safe integer range`);
  return parsed;
}

function nonnegativeInteger(env: RuntimeEnvironment, name: string): number {
  const value = requiredValue(env, name);
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    configurationError(`${name} must be a nonnegative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) configurationError(`${name} is outside the safe integer range`);
  return parsed;
}

function supportedMemory(value: string): MemoryOption {
  switch (value) {
    case '128MiB':
    case '256MiB':
    case '512MiB':
    case '1GiB':
    case '2GiB':
    case '4GiB':
    case '8GiB':
    case '16GiB':
    case '32GiB':
      return value;
    default:
      return configurationError('memory is not supported by Firebase Functions');
  }
}

function assertRequiredLimits(options: {
  maxInstances: number;
  concurrency: number;
  timeoutSeconds: number;
  memory: string;
  minInstances: number;
}): void {
  if (options.minInstances > options.maxInstances) {
    configurationError('minInstances cannot exceed maxInstances');
  }
  if (
    options.maxInstances !== REQUIRED_LIMITS.maxInstances ||
    options.concurrency !== REQUIRED_LIMITS.concurrency ||
    options.timeoutSeconds !== REQUIRED_LIMITS.timeoutSeconds ||
    options.memory !== REQUIRED_LIMITS.memory ||
    options.minInstances !== REQUIRED_LIMITS.minInstances
  ) {
    configurationError('limits do not match the reviewed Functions configuration');
  }
}

function assertServiceAccount(value: string, projectId: string): void {
  const accountPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/;
  const match = accountPattern.exec(value);
  if (!match || match[1] !== projectId) {
    configurationError('service account must be a valid account in the selected project');
  }
}

export function buildProfileCallableOptions(
  env: RuntimeEnvironment,
): CallableOptions {
  const projectId = requiredValue(env, 'GCLOUD_PROJECT');
  const expectedProjectId = requiredValue(env, 'YSH_EXPECTED_PROJECT_ID');
  if (projectId !== expectedProjectId) {
    configurationError('selected project does not match YSH_EXPECTED_PROJECT_ID');
  }

  const mode = requiredValue(env, 'YSH_FUNCTIONS_MODE');
  const region = requiredValue(env, 'YSH_FUNCTIONS_REGION');
  if (region !== REQUIRED_REGION) {
    configurationError(`region must be ${REQUIRED_REGION}`);
  }

  const limits = {
    maxInstances: positiveInteger(env, 'YSH_FUNCTIONS_MAX_INSTANCES'),
    concurrency: positiveInteger(env, 'YSH_FUNCTIONS_CONCURRENCY'),
    timeoutSeconds: positiveInteger(env, 'YSH_FUNCTIONS_TIMEOUT_SECONDS'),
    memory: supportedMemory(requiredValue(env, 'YSH_FUNCTIONS_MEMORY')),
    minInstances: nonnegativeInteger(env, 'YSH_FUNCTIONS_MIN_INSTANCES'),
  };
  assertRequiredLimits(limits);

  const options: CallableOptions = {
    region,
    ...limits,
  };

  if (mode === 'emulator') {
    if (projectId !== EMULATOR_PROJECT_ID) {
      configurationError('emulator mode is only allowed for demo-yardsale-hub');
    }
    if (env.YSH_FUNCTIONS_SERVICE_ACCOUNT !== undefined) {
      configurationError('emulator mode must not configure a service account');
    }
    return options;
  }

  if (mode === 'staging' && projectId === STAGING_PROJECT_ID) {
    const serviceAccount = requiredValue(env, 'YSH_FUNCTIONS_SERVICE_ACCOUNT');
    assertServiceAccount(serviceAccount, projectId);
    if (serviceAccount !== STAGING_SERVICE_ACCOUNT) {
      configurationError('service account does not match the reviewed staging identity');
    }
    options.serviceAccount = serviceAccount;
    return options;
  }

  if (mode === 'production' && projectId === PRODUCTION_PROJECT_ID) {
    const serviceAccount = requiredValue(env, 'YSH_FUNCTIONS_SERVICE_ACCOUNT');
    assertServiceAccount(serviceAccount, projectId);
    if (serviceAccount !== PRODUCTION_SERVICE_ACCOUNT) {
      configurationError('service account does not match the reviewed production identity');
    }
    options.serviceAccount = serviceAccount;
    return options;
  }

  configurationError('cloud runtime mode does not match an explicitly configured project');
}

export function buildProfileEventOptions(env: RuntimeEnvironment): EventHandlerOptions {
  const callableOptions = buildProfileCallableOptions(env);
  const options: EventHandlerOptions = {
    region: REQUIRED_REGION,
    ...REQUIRED_LIMITS,
  };
  if (callableOptions.serviceAccount) {
    options.serviceAccount = callableOptions.serviceAccount;
  }
  return options;
}

export const profileCallableOptions = buildProfileCallableOptions(process.env);
export const profileEventOptions = buildProfileEventOptions(process.env);
