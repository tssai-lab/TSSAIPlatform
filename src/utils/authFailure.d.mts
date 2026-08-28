export function isPublicAuthenticationRequest(error: unknown): boolean;
export function isUnauthorizedResponse(error: unknown): boolean;
export function createUnauthorizedOnceGate(): {
  run(currentToken: string | null, effect: () => void): boolean;
  isHandled(): boolean;
};
