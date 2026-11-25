interface EncryptedBlob {
    iv: string;
    tag: string;
    data: string;
}
export interface SecretCipherAdapter {
    encrypt(plaintext: string): EncryptedBlob;
    decrypt(blob: EncryptedBlob): string;
}
export declare class ConnectorSecretVault {
    private readonly customCipher?;
    private readonly vaultPath;
    private readonly keyPath;
    private key?;
    private entries;
    private loaded;
    constructor(homeDir: string, customCipher?: SecretCipherAdapter | undefined);
    private ensureKey;
    private encryptValue;
    private decryptValue;
    private ensureLoaded;
    private save;
    setSecret(connectorId: string, profileId: string, fieldKey: string, value: string): Promise<void>;
    hasSecret(connectorId: string, profileId: string, fieldKey: string): Promise<boolean>;
    getSecret(connectorId: string, profileId: string, fieldKey: string): Promise<string | undefined>;
    listPresentKeys(connectorId: string, profileId: string): Promise<Record<string, boolean>>;
    deleteConnectorSecrets(connectorId: string): Promise<void>;
    resolveTemplates(template: Record<string, string>, connectorId: string, profileId: string, nonSecretFields?: Record<string, string>): Promise<Record<string, string>>;
}
export {};
