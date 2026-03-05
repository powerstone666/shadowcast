import { Logger } from "../utils/commonUtils.js"
import { KeyConfigService, type AgentKeys, type YtCredentials } from "../services/keyConfig.js";
export class AgentEnv{

    logger = new Logger("setup")
    keyConfigService = new KeyConfigService();

    static agent_url: string = '';
    static  agent_api: string = '';
    static agent_model: string = '';
    static yt_access_token: string = '';
    static yt_refresh_token: string = '';

    async getCredentails(): Promise<AgentKeys> {
        try {
            const keys = await this.keyConfigService.getKeys();
            AgentEnv.agent_url = keys.agent_url;
            AgentEnv.agent_api = keys.agent_api;
            AgentEnv.agent_model = keys.agent_model;
            return keys;
        } catch (err: any) {
            this.logger.error("Failed to get credentials", { error: err });
            throw err;
        }
    }

    async setCedentaisl(keys: AgentKeys): Promise<void> {
        try {
            await this.keyConfigService.insertKeys(keys);
            AgentEnv.agent_url = keys.agent_url;
            AgentEnv.agent_api = keys.agent_api;
            AgentEnv.agent_model = keys.agent_model;
        } catch (err: any) {
            this.logger.error("Failed to set credentials", { error: err });
            throw err;
        }
    }

    async setytcredentials(credentials: YtCredentials): Promise<void> {
        try {
            await this.keyConfigService.setYtCredentials(credentials);
            AgentEnv.yt_access_token = credentials.access_token;
            AgentEnv.yt_refresh_token = credentials.refresh_token;
        } catch (err: any) {
            this.logger.error("Failed to set YouTube credentials", { error: err });
            throw err;
        }
    }

    async getytcrendentals(channelId?: string): Promise<YtCredentials> {
        try {
            const credentials = await this.keyConfigService.getYtCredentials(channelId);
            AgentEnv.yt_access_token = credentials.access_token;
            AgentEnv.yt_refresh_token = credentials.refresh_token;
            return credentials;
        } catch (err: any) {
            this.logger.error("Failed to get YouTube credentials", { error: err });
            throw err;
        }
    }
}
