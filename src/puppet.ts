import { VK } from "vk-io";
import PollingTransport from "./PollingTransport";

export interface IPuppet {
	client: VK;
	data: any;
	polling: PollingTransport;
	ts?: number;
}
export interface IPuppets {
	[puppetId: number]: IPuppet;
}