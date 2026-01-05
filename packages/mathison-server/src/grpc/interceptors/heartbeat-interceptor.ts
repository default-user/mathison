/**
 * Heartbeat Interceptor for gRPC
 * Placeholder interceptor structure (actual check happens in withGovernance wrapper)
 */

import * as grpc from '@grpc/grpc-js';

export function createHeartbeatInterceptor() {
  return (options: any, nextCall: any) => {
    return new grpc.InterceptingCall(nextCall(options), {
      start: (metadata, listener, next) => {
        // Heartbeat fail-closed check would go here
        // Currently handled in withGovernance wrapper
        next(metadata, listener);
      }
    });
  };
}
