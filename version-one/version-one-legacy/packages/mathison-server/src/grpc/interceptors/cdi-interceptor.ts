/**
 * CDI Interceptor for gRPC
 * Placeholder interceptor structure (actual governance happens in withGovernance wrapper)
 */

import * as grpc from '@grpc/grpc-js';

export function createCDIInterceptor() {
  return (options: any, nextCall: any) => {
    return new grpc.InterceptingCall(nextCall(options), {
      start: (metadata, listener, next) => {
        // CDI action check logic would go here
        // Currently handled in withGovernance wrapper
        next(metadata, listener);
      }
    });
  };
}
