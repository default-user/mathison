// WHY: Explicit types for authority model ensure type safety and clear contracts

export interface Principal {
  id: string;
  name: string;
  type: 'personal' | 'organizational';
}

export interface Admin {
  id: string;
  name: string;
  scopes: string[];
}

export interface DelegationScope {
  scope_id: string;
  namespace_id: string;
  actions: string[];
  expires_at?: string;
}

export interface AuthorityConfig {
  version: string;
  principal: Principal;
  admins: Admin[];
  delegations: DelegationScope[];
  default_permissions: {
    allow_thread_creation: boolean;
    allow_namespace_creation: boolean;
    allow_cross_namespace_transfer: boolean;
  };
}

export interface CDIDecision {
  allowed: boolean;
  reason: string;
  requires_confirmation?: boolean;
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: string[];
}
