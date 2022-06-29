import { VK } from "vk-io";
import PollingTransport from "./PollingTransport";
import { IRemoteRoom, IRemoteUser } from "mx-puppet-bridge";

export interface IPuppets {
	[puppetId: number]: IPuppet;
}

export interface IPuppet {
	client: VK;
	data: any;
	polling: PollingTransport;
	userCache: CachedData<IRemoteUser>;
	roomCache: CachedData<IRemoteRoom>
}

export interface CachedData<T> {
	[id: string]: {
		value: T
		deadline: number
	}
}

