import { UserRole } from './enums';

export const Permission = {
  ESTIMATE_VIEW: 'estimate:view',
  ESTIMATE_CREATE: 'estimate:create',
  ESTIMATE_UPDATE: 'estimate:update',
  ESTIMATE_DELETE: 'estimate:delete',
  ESTIMATE_STATUS: 'estimate:status',
  /** Gate for the entire internal price adjustment surface. */
  ADJUSTMENT_VIEW: 'estimate:adjustment:view',
  ADJUSTMENT_MANAGE: 'estimate:adjustment:manage',
  MODULE_VIEW: 'module:view',
  MODULE_MANAGE: 'module:manage',
  TERMS_VIEW: 'terms:view',
  TERMS_MANAGE: 'terms:manage',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const P = Permission;

const READ_ONLY: Permission[] = [
  P.ESTIMATE_VIEW,
  P.MODULE_VIEW,
  P.TERMS_VIEW,
  P.SETTINGS_VIEW,
];

const SALES_EXECUTIVE: Permission[] = [
  ...READ_ONLY,
  P.ESTIMATE_CREATE,
  P.ESTIMATE_UPDATE,
  P.ESTIMATE_STATUS,
];

const SALES_MANAGER: Permission[] = [
  ...SALES_EXECUTIVE,
  P.ESTIMATE_DELETE,
  P.ADJUSTMENT_VIEW,
  P.ADJUSTMENT_MANAGE,
];

const ADMIN: Permission[] = [
  ...SALES_MANAGER,
  P.MODULE_MANAGE,
  P.TERMS_MANAGE,
  P.SETTINGS_MANAGE,
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: Object.values(P),
  ADMIN,
  SALES_MANAGER,
  SALES_EXECUTIVE,
  VIEWER: READ_ONLY,
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAny(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}
