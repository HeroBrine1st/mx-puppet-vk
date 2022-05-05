import { VK } from "vk-io";

export interface IPuppet {
	client: VK;
	data: any;
}
export interface IPuppets {
	[puppetId: number]: IPuppet;
}