export declare const ACP_GESTURE_PUBLIC_KEY_ENV = "DSH_DESKTOP_ACP_GESTURE_PUBLIC_KEY";
export declare const ACP_INTERACTION_HEADER = "x-dsh-acp-interaction";
export type AcpInteractionOperation = 'start' | 'prompt';
export declare function createAcpInteractionVerifier(publicKey: string, now?: () => number): (operation: AcpInteractionOperation, requestBody: string, token: string | string[] | undefined) => boolean;
