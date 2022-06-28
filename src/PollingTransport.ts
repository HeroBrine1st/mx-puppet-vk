import { IUpdatesOptions, PollingTransport as DPollingTransport, UpdatesError, UpdatesErrorCode } from "vk-io";
import fetch from "node-fetch"
import { AbortController } from "abort-controller";

const { NEED_RESTART, POLLING_REQUEST_FAILED } = UpdatesErrorCode;
import { URL, URLSearchParams } from "url"

const delay = (delayed: number) => (new Promise((resolve) => {
    setTimeout(resolve, delayed);
}));

const POLLING_VERSION = 10;

export default class PollingTransport extends DPollingTransport {
    private _options: { agent?: any; pollingWait?: any; pollingRetryLimit?: any; pollingGroupId?: any; webhookSecret?: any; webhookConfirmation?: any; };
    tsHandler: (ts: number) => Promise<void>;
    constructor({ api, ts, ...options }: Omit<IUpdatesOptions, 'upload'> & { ts: number | undefined }) {
        super({ api, ...options })
        this.started = false;
        /**
         * 2 -  Attachments
         * 8 -  Extended events
         * 64 - Online user platform ID
         * 128 - Return random_id
         */
        // eslint-disable-next-line no-bitwise
        this.mode = 2 | 8 | 64 | 128;
        this.ts = ts || 0;
        this.pts = 0;
        this.restarted = 0;
        this.api = api;
        this._options = options;
    }
    async start() {
        if (this.started) {
            throw new Error('Polling updates already started');
        }
        if (!this.pollingHandler) {
            throw new Error('You didn\'t subscribe to updates');
        }
        this.started = true;
        try {
            const { pollingGroupId } = this._options;
            const isGroup = pollingGroupId !== undefined;
            const { server, key, ts } = isGroup
                ? await this.api.groups.getLongPollServer({
                    group_id: pollingGroupId
                })
                : await this.api.messages.getLongPollServer({
                    lp_version: POLLING_VERSION
                });
            if (this.ts === 0) {
                this.ts = ts!;
            }
            const pollingURL = isGroup
                ? server
                : `https://${server}`;
            this.url = new URL(pollingURL!);
            this.url.search = String(new URLSearchParams({
                key,
                act: 'a_check',
                wait: '25',
                mode: String(this.mode),
                version: String(POLLING_VERSION)
            }));
            this.startFetchLoop();
        }
        catch (error) {
            this.started = false;
            throw error;
        }
    }
    /**
     * Stopping gets updates
     */
    async stop() {
        this.started = false;
        this.restarted = 0;
    }
    /**
     * Starts forever fetch updates  loop
     */
    async startFetchLoop() {
        try {
            while (this.started) {
                await this.fetchUpdates();
            }
        }
        catch (error) {
            const { pollingWait, pollingRetryLimit } = this._options;
            if (error.code !== NEED_RESTART && this.restarted !== pollingRetryLimit) {
                this.restarted += 1;
                await delay(3e3);
                this.startFetchLoop();
                return;
            }
            while (this.started) {
                try {
                    await this.stop();
                    await this.start();
                    break;
                }
                catch (restartError) {
                    this.started = true;
                    await delay(pollingWait);
                }
            }
        }
    }
    /**
     * Gets updates
     */
    async fetchUpdates() {
        this.url.searchParams.set('ts', String(this.ts));
        const controller = new AbortController();
        const interval = setTimeout(() => controller.abort(), 30e3);
        let result;
        try {
            const response = await fetch(this.url, {
                agent: this._options.agent,
                method: 'GET',
                compress: false,
                signal: controller.signal,
                headers: {
                    connection: 'keep-alive'
                }
            });
            if (!response.ok) {
                throw new UpdatesError({
                    code: POLLING_REQUEST_FAILED,
                    message: 'Polling request failed'
                });
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = await response.json();
        }
        finally {
            clearTimeout(interval);
        }
        if (result.failed !== undefined) {
            if (result.failed === 1) {
                this.ts = result.ts;
                return;
            }
            this.ts = 0;
            throw new UpdatesError({
                code: NEED_RESTART,
                message: 'The server has failed'
            });
        }
        this.restarted = 0;
        this.ts = result.ts;
        if (result.pts) {
            this.pts = Number(result.pts);
        }
        /* Async handle updates */
        for (const update of result.updates) {
            this.pollingHandler(update);
        }
        if (this.tsHandler) {
            await this.tsHandler(result.ts)
        }
    }
    subscribe(handler: (update: any) => void) {
        this.pollingHandler = handler;
    }

    subscribeToTsUpdates(handler: (ts: number) => Promise<void>) {
        this.tsHandler = handler;
    }
}