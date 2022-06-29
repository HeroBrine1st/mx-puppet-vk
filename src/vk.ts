// first we import a few needed things again
import {
	PuppetBridge,
	IRemoteUser,
	IReceiveParams,
	IRemoteRoom,
	IMessageEvent,
	IFileEvent,
	Log,
	ISendingUser,
} from "mx-puppet-bridge";

import { IPuppets } from "./puppet"

import { VK, MessageContext, AttachmentType } from "vk-io";
import { Converter } from "showdown";
import { MessagesMessage, MessagesMessageAttachment } from "vk-io/lib/api/schemas/objects";
import { AttachmentsHandler } from "./attachments-handler";
import PollingTransport from "./PollingTransport"
import { globalAgent } from "https";

const log = new Log("VKPuppet:vk");

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class VkPuppet {
	private puppets: IPuppets = {};
	private converter: Converter = new Converter({
		simplifiedAutoLink: true,
		excludeTrailingPunctuationFromURLs: true,
		strikethrough: true,
		simpleLineBreaks: true,
		requireSpaceBeforeHeadingText: true,
	});
	constructor(
		private puppet: PuppetBridge,
	) {}

	public async getSendParams(puppetId: number, peerId: number, senderId: number, eventId?: string | undefined):
		Promise<IReceiveParams> {
		return {
			room: await this.getRemoteRoom(puppetId, peerId),
			user: await this.getRemoteUser(puppetId, senderId),
			eventId,
		};
	}

	public async getRemoteUser(puppetId: number, userId: number): Promise<IRemoteUser> {
		const p = this.puppets[puppetId];
		if(p.userCache[userId] !== undefined) {
			const cached = p.userCache[userId]
			if(cached.deadline < Date.now()) {
				log.debug(`Cache hit for user ${userId} (puppet ${puppetId})`)
				return cached.value
			}
		}
		let response: IRemoteUser
		if (userId < 0) {
			const info = await p.client.api.groups.getById({ group_id: Math.abs(userId).toString() });
			response = {
				puppetId,
				userId: userId.toString(),
				name: info[0].name,
				avatarUrl: info[0].photo_200,
				externalUrl: `https://vk.com/${info[0].screen_name}`,
			};
		} else {
			const info = await p.client.api.users.get({ user_ids: [userId.toString()], fields: ["photo_max", "screen_name"] });
			response = {
				puppetId,
				userId: userId.toString(),
				name: `${info[0].first_name} ${info[0].last_name}`,
				avatarUrl: info[0].photo_max,
				externalUrl: `https://vk.com/${info[0].screen_name}`,
			};
		}
		p.userCache[userId] = {
			value: response,
			deadline: Date.now() + CACHE_TTL_MS
		}
		return response
	}

	public async getRemoteRoom(puppetId: number, peerId: number): Promise<IRemoteRoom> {
		const p = this.puppets[puppetId];
		if(p.roomCache[peerId] !== undefined) {
			const cached = p.roomCache[peerId]
			if(cached.deadline < Date.now()) {
				log.debug(`Cache hit for peer ${peerId} (puppet ${puppetId})`)
				return cached.value
			}
		}
		const info = await p.client.api.messages.getConversationsById({ peer_ids: peerId, fields: ["photo_max"] });
		let response: IRemoteRoom;
		if (info.items === undefined) {
			// Idk how to get error code
			throw new Error("info.items is undefined; Perhaps don't have access to this chat, chat does not exist or contact not found");
		}
		switch (info.items[0].peer.type || "chat") {
			case "user": {
				const userInfo = await p.client.api.users.get({ user_ids: info.items[0].peer.id, fields: ["photo_max"] });
				response = {
					puppetId,
					roomId: peerId.toString(),
					name: `${userInfo[0].first_name} ${userInfo[0].last_name}`,
					avatarUrl: userInfo[0].photo_max,
					isDirect: true,
					externalUrl: `https://vk.com/id${info.items[0].peer.id}}`,
				};
				break;
			}
			case "chat":
				response = {
					puppetId,
					roomId: peerId.toString(),
					name: info.items[0]?.chat_settings.title || `VK chat №${(peerId - 2000000000).toString()}`,
					topic: info.count === 0 ? "To receive chat name and avatar, puppet needs admin rights on VK side" : null,
					avatarUrl: info.items[0]?.chat_settings.photo?.photo_200,
				};
				break;

			case "group": {
				const groupInfo = await p.client.api.groups.getById({ group_id: Math.abs(info.items[0].peer.id).toString() });
				response = {
					puppetId,
					roomId: peerId.toString(),
					name: groupInfo[0].name || peerId.toString(),
					avatarUrl: groupInfo[0]?.photo_200,
					externalUrl: `https://vk.com/${groupInfo[0].screen_name}`,
				};
				break;
			}
			default:
				response = {
					puppetId,
					roomId: peerId.toString(),
					name: peerId.toString(),
					// avatarUrl: info.items['chat_settings']['photo_200'],
				};
				break;
		}
		p.roomCache[peerId] = {
			value: response,
			deadline: Date.now() + CACHE_TTL_MS
		}
		return response;
	}

	public async getUserIdsInRoom(room: IRemoteRoom): Promise<Set<string> | null> {
		const p = this.puppets[room.puppetId];

		const users = new Set<string>();
		if (room.isDirect === false) {
			const response = await p.client.api.messages.getConversationMembers({ peer_id: Number(room.roomId) });
			if (response.items === undefined) {
				throw new Error("Unknown error, maybe don't have access to the chat");
			}
			response.items.forEach((element) => {
				// VK documentation says member_id is always defined
				users.add(element.member_id!.toString());
			});
		}
		return users;
	}

	public async createUser(user: IRemoteUser): Promise<IRemoteUser | null> {
		const p = this.puppets[user.puppetId];
		if (!p) {
			return null;
		}
		const remoteUser = await this.getRemoteUser(user.puppetId, Number(user.userId));
		if (!remoteUser) {
			return null;
		}
		return remoteUser;
	}

	// tslint:disable-next-line: no-any
	public async newPuppet(puppetId: number, data: any) {
		if (this.puppets[puppetId]) {
			// the puppet somehow already exists, delete it first
			await this.deletePuppet(puppetId);
		}
		// usually we create a client class of some sorts to the remote protocol
		// and listen to incoming messages from it
		try {
			const client = new VK({ token: data.token, apiLimit: 20 });
			const polling = new PollingTransport({
				api: client.api,
				ts: data.ts as number | undefined,
				agent: globalAgent,
				pollingWait: 3e3,
				pollingRetryLimit: 3,
				pollingGroupId: undefined,
				webhookSecret: undefined,
				webhookConfirmation: undefined,
			})

			client.updates.on("message_new", async (context) => {
				try {
					log.info("Received something!");
					await this.handleVkMessage(puppetId, context);
				} catch (err) {
					log.error("Error handling vk message event", err.error || err.body || err);
				}
			});
			client.updates.on("message_edit", async (context) => {
				try {
					log.info("Edit received!");
					await this.handleVkEdit(puppetId, context);
				} catch (err) {
					log.error("Error handling vk message event", err.error || err.body || err);
				}
			});
			client.updates.on("message_typing_state", async (context) => {
				if (context.isUser) {
					const params = await this.getSendParams(puppetId, context.fromId, context.fromId);
					await this.puppet.setUserTyping(params, context.isTyping);
				} else {
					const params = await this.getSendParams(puppetId, 2000000000 + (context?.chatId ?? 0), context.fromId);
					await this.puppet.setUserTyping(params, context.isTyping);
				}
			});
			try {
				const linkedGroupInfo = await client.api.groups.getById({});
				log.info("Got group token");
				data.isUserToken = false;
				data.username = linkedGroupInfo[0].name;
				data.id = linkedGroupInfo[0].id;
			} catch (err) {
				log.info("Got user token");
				data.isUserToken = true;
				const linkedUserInfo = await client.api.account.getProfileInfo({});
				data.username = `${linkedUserInfo.first_name} ${linkedUserInfo.last_name}`;
				data.id = linkedUserInfo.id;
			}
			this.puppets[puppetId] = {
				client,
				data,
				polling,
				roomCache: {},
				userCache: {}
			};
			await this.puppet.setUserId(puppetId, data.id);
			await this.puppet.setPuppetData(puppetId, data);
			polling.subscribe(client.updates.handlePollingUpdate.bind(client.updates))
			polling.subscribeToTsUpdates(async (ts) => {
				data.ts = ts
				try {
					await this.puppet.setPuppetData(puppetId, data);
				} catch (err) {
					await this.puppet.sendStatusMessage(puppetId, `Failed to store puppet data: ${err}`);
					log.error("Failed to store puppet data", err);
				}
			})
			try {
				await polling.start()
				await this.puppet.sendStatusMessage(puppetId, "Connected!");
			} catch (err) {
				await this.puppet.sendStatusMessage(puppetId, `Connection failed! ${err}`);
				log.error("Failed to initialize update listener", err);
			}
		} catch (err) {
			await this.puppet.sendStatusMessage(puppetId, `Connection failed! ${err}`);
		}
	}

	public async deletePuppet(puppetId: number) {
		const p = this.puppets[puppetId];
		if (!p) {
			return;
		}
		await p.polling.stop();
		delete this.puppets[puppetId];
	}

	//////////////////////////
	// Matrix -> VK section //
	//////////////////////////

	// tslint:disable-next-line: no-any
	public async handleMatrixMessage(room: IRemoteRoom, data: IMessageEvent, asUser: ISendingUser | null, event: any) {
		// this is called every time we receive a message from matrix and need to
		// forward it to the remote protocol.

		// first we check if the puppet exists
		const p = this.puppets[room.puppetId];
		if (!p) {
			return;
		}

		if (asUser) {
			const MAX_NAME_LENGTH = 80;
			const displayname = (new TextEncoder().encode(asUser.displayname));
			asUser.displayname = (new TextDecoder().decode(displayname.slice(0, MAX_NAME_LENGTH)));
		}
		// usually you'd send it here to the remote protocol via the client object
		try {
			const response = await p.client.api.messages.send({
				peer_ids: Number(room.roomId),
				message: asUser ? `${asUser.displayname}: ${data.body}` : data.body,
				random_id: new Date().getTime(),
			});
			await this.puppet.eventSync.insert(room, data.eventId!,
				p.data.isUserToken ? response[0]["message_id"].toString() : response[0]["conversation_message_id"].toString());
		} catch (err) {
			log.error("Error sending to vk", err.error || err.body || err);
		}
	}

	public async handleMatrixEdit(room: IRemoteRoom, eventId: string, data: IMessageEvent, asUser: ISendingUser | null) {
		const p = this.puppets[room.puppetId];
		if (!p) {
			return;
		}

		if (asUser) {
			const MAX_NAME_LENGTH = 80;
			const displayname = (new TextEncoder().encode(asUser.displayname));
			asUser.displayname = (new TextDecoder().decode(displayname.slice(0, MAX_NAME_LENGTH)));
		}
		// usually you'd send it here to the remote protocol via the client object
		try {
			const response = await p.client.api.messages.edit({
				peer_id: Number(room.roomId),
				conversation_message_id: p.data.isUserToken ? undefined : Number(eventId),
				message_id: p.data.isUserToken ? Number(eventId) : undefined,
				message: asUser ? `${asUser.displayname}: ${data.body}` : data.body,
				random_id: new Date().getTime(),
			});
			log.info("SYNC Matrix edit", response);
			await this.puppet.eventSync.insert(room, data.eventId!, response.toString());
		} catch (err) {
			log.error("Error sending edit to vk", err.error || err.body || err);
		}
	}

	public async handleMatrixRedact(room: IRemoteRoom, eventId: string, asUser: ISendingUser | null) {
		const p = this.puppets[room.puppetId];
		if (!p) {
			return;
		}

		if (asUser) {
			const MAX_NAME_LENGTH = 80;
			const displayname = (new TextEncoder().encode(asUser.displayname));
			asUser.displayname = (new TextDecoder().decode(displayname.slice(0, MAX_NAME_LENGTH)));
		}

		try {
			p.data.isUserToken ? await p.client.api.messages.delete({
				spam: 0,
				delete_for_all: 1,
				message_ids: Number(eventId),
			})
				: await this.handleMatrixEdit(room, eventId, { body: "[ДАННЫЕ УДАЛЕНЫ]", eventId }, asUser);
		} catch (err) {
			log.error("Error sending edit to vk", err.error || err.body || err);
		}
	}

	public async handleMatrixReply(
		room: IRemoteRoom,
		eventId: string,
		data: IMessageEvent,
		asUser: ISendingUser | null,
		event: unknown,
	) {
		const p = this.puppets[room.puppetId];
		if (!p) {
			return;
		}

		if (asUser) {
			const MAX_NAME_LENGTH = 80;
			const displayname = (new TextEncoder().encode(asUser.displayname));
			asUser.displayname = (new TextDecoder().decode(displayname.slice(0, MAX_NAME_LENGTH)));
		}

		try {
			const response = await p.client.api.messages.send({
				peer_ids: Number(room.roomId),
				message: asUser ? `${asUser.displayname}:  ${await this.stripReply(data.body)}` : await this.stripReply(data.body),
				random_id: new Date().getTime(),
				forward: p.data.isUserToken ? undefined : `{"peer_id":${Number(room.roomId)},"conversation_message_ids":${Number(eventId)},"is_reply": true}`,
				reply_to: p.data.isUserToken ? Number(eventId) : undefined,
			});
			await this.puppet.eventSync.insert(room, data.eventId!,
				p.data.isUserToken ? response[0]["message_id"].toString() : response[0]["conversation_message_id"].toString());
		} catch (err) {
			log.error("Error sending to vk", err.error || err.body || err);
		}
	}

	public async handleMatrixImage(
		room: IRemoteRoom,
		data: IFileEvent,
		asUser: ISendingUser | null,
		event: unknown,
	) {
		const p = this.puppets[room.puppetId];
		if (!p) {
			return;
		}
		const MAXFILESIZE = 50000000;
		const size = data.info ? data.info.size || 0 : 0;

		if (asUser) {
			const MAX_NAME_LENGTH = 80;
			const displayname = (new TextEncoder().encode(asUser.displayname));
			asUser.displayname = (new TextDecoder().decode(displayname.slice(0, MAX_NAME_LENGTH)));
		}

		if (size < MAXFILESIZE) {
			try {
				const attachment = await p.client.upload.messagePhoto({
					peer_id: Number(room.roomId),
					source: {
						value: data.url,
					},
				});
				const response = await p.client.api.messages.send({
					peer_ids: Number(room.roomId),
					random_id: new Date().getTime(),
					message: asUser ? `${asUser.displayname} sent a photo:` : undefined,
					attachment: [`photo${attachment.ownerId}_${attachment.id}`],
				});
				await this.puppet.eventSync.insert(room, data.eventId!,
					p.data.isUserToken ? response[0]["message_id"].toString() : response[0]["conversation_message_id"].toString());
			} catch (err) {
				log.error("Error sending to vk", err.error || err.body || err);
			}
		} else {
			try {
				const response = await p.client.api.messages.send({
					peer_id: Number(room.roomId),
					message: `File ${data.filename} was sent, but it is too big for VK. You can download it there:\n${data.url}`,
					random_id: new Date().getTime(),
				});
				await this.puppet.eventSync.insert(room, data.eventId!, response.toString());
			} catch (err) {
				log.error("Error sending to vk", err.error || err.body || err);
			}
		}
	}

	public async handleMatrixAudio(
		room: IRemoteRoom,
		data: IFileEvent,
		asUser: ISendingUser | null,
		event: unknown,
	) {
		const p = this.puppets[room.puppetId];
		if (!p) {
			return;
		}
		const MAXFILESIZE = 50000000;
		const size = data.info ? data.info.size || 0 : 0;

		if (size < MAXFILESIZE) {
			try {
				const attachment = await p.client.upload.audioMessage({
					peer_id: Number(room.roomId),
					source: {
						value: data.url,
						filename: data.filename,
					},
				});
				const response = await p.client.api.messages.send({
					peer_id: Number(room.roomId),
					random_id: new Date().getTime(),
					message: asUser ? `${asUser.displayname} sent an audio message:` : undefined,
					attachment: [`doc${attachment.ownerId}_${attachment.id}`],
				});
				await this.puppet.eventSync.insert(room, data.eventId!, response.toString());
			} catch (err) {
				try {
					const response = await p.client.api.messages.send({
						peer_ids: Number(room.roomId),
						message: `Audio message ${data.filename} was sent, but VK refused to receive it. You can download it there:\n${data.url}`,
						random_id: new Date().getTime(),
					});
					await this.puppet.eventSync.insert(room, data.eventId!,
						p.data.isUserToken ? response[0]["message_id"].toString() : response[0]["conversation_message_id"].toString());
				} catch (err) {
					log.error("Error sending to vk", err.error || err.body || err);
				}
			}
		} else {
			try {
				const response = await p.client.api.messages.send({
					peer_ids: Number(room.roomId),
					message: `File ${data.filename} was sent, but it is too big for VK. You can download it there:\n${data.url}`,
					random_id: new Date().getTime(),
				});
				await this.puppet.eventSync.insert(room, data.eventId!,
					p.data.isUserToken ? response[0]["message_id"].toString() : response[0]["conversation_message_id"].toString());
			} catch (err) {
				log.error("Error sending to vk", err.error || err.body || err);
			}
		}
	}

	public async handleMatrixFile(
		room: IRemoteRoom,
		data: IFileEvent,
		asUser: ISendingUser | null,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		event: unknown,
	) {
		const p = this.puppets[room.puppetId];
		if (!p) {
			return;
		}
		const MAXFILESIZE = 50000000;
		const size = data.info ? data.info.size || 0 : 0;

		if (size < MAXFILESIZE) {
			try {
				const attachment = await p.client.upload.messageDocument({
					peer_id: Number(room.roomId),
					source: {
						value: data.url,
						filename: data.filename,
					},
				});
				const response = await p.client.api.messages.send({
					peer_id: Number(room.roomId),
					random_id: new Date().getTime(),
					message: asUser ? `${asUser.displayname} sent a file:` : undefined,
					attachment: [`doc${attachment.ownerId}_${attachment.id}`],
				});
				await this.puppet.eventSync.insert(room, data.eventId!, response.toString());
			} catch (err) {
				try {
					const response = await p.client.api.messages.send({
						peer_ids: Number(room.roomId),
						message: `File ${data.filename} was sent, but VK refused to receive it. You can download it there:\n${data.url}`,
						random_id: new Date().getTime(),
					});
					await this.puppet.eventSync.insert(room, data.eventId!,
						p.data.isUserToken ? response[0]["message_id"].toString() : response[0]["conversation_message_id"].toString());
				} catch (err) {
					log.error("Error sending to vk", err.error || err.body || err);
				}
			}
		} else {
			try {
				const response = await p.client.api.messages.send({
					peer_ids: Number(room.roomId),
					message: `File ${data.filename} was sent, but it is too big for VK. You can download it there:\n${data.url}`,
					random_id: new Date().getTime(),
				});
				await this.puppet.eventSync.insert(room, data.eventId!,
					p.data.isUserToken ? response[0]["message_id"].toString() : response[0]["conversation_message_id"].toString());
			} catch (err) {
				log.error("Error sending to vk", err.error || err.body || err);
			}
		}
	}

	public async handleMatrixTyping(
		room: IRemoteRoom,
		typing: boolean,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		asUser: ISendingUser | null,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		event: unknown,
	) {
		if (typing) {
			const p = this.puppets[room.puppetId];
			if (!p) {
				return null;
			}
			try {
				const response = await p.client.api.messages.setActivity({
					peer_id: Number(room.roomId),
					type: "typing",
				});
			} catch (err) {
				log.error("Error sending typing presence to vk", err.error || err.body || err);
			}
		}
	}

	public async handleMatrixRead(
		room: IRemoteRoom,
		eventId: string,
	) {
		const p = this.puppets[room.puppetId];
		if (!p) {
			return null;
		}
		try {
			const response = await p.client.api.messages.markAsRead({
				peer_id: Number(room.roomId),
				start_message_id: Number(eventId),
			});
		} catch (err) {
			log.error("Error sending read event to vk", err.error || err.body || err);
		}
	}

	public async createRoom(room: IRemoteRoom): Promise<IRemoteRoom | null> {
		const p = this.puppets[room.puppetId];
		if (!p) {
			return null;
		}
		log.info(`Received create request for channel update puppetId=${room.puppetId} roomId=${room.roomId}`);

		return await this.getRemoteRoom(room.puppetId, Number(room.roomId));
	}

	//////////////////////////
	// VK -> Matrix section //
	//////////////////////////

	public async handleVkMessage(puppetId: number, context: MessageContext) {
		const p = this.puppets[puppetId];
		if (!p) {
			return;
		}

		log.debug("Received new message!", context);
		
		if (context.isOutbox) {
			return; // Deduping
		}

		const params = await this.getSendParams(puppetId, context.peerId, context.senderId,
			p.data.isUserToken ? context.id.toString() : context.conversationMessageId?.toString() || context.id.toString());
		const attachmentHandler = new AttachmentsHandler(p, this.puppet);

		let msgText: string = context.text || "";
		let fullContext: MessagesMessage | undefined;
		if (p.data.isUserToken) {
			fullContext = (await p.client.api.messages.getById({ message_ids: context.id, extended: 1 })).items[0];
			if (fullContext.geo !== undefined) {
				msgText += `geo:${fullContext.geo.coordinates.latitude},${fullContext.geo.coordinates.longitude}\n`;
			}
		} else {
			fullContext = undefined;
			if (context.geo !== undefined) {
				msgText += `geo:${context.geo.coordinates.latitude},${context.geo.coordinates.longitude}\n`;
			}
		}
		if (context.hasForwards) {
			if (fullContext !== undefined) {
				if (fullContext.fwd_messages !== undefined) {
					try {
						msgText = await attachmentHandler.handleForwardsAsUser(this, puppetId, msgText, params, fullContext.fwd_messages);
					} catch (err) {
						log.error(err);
						log.debug(context);
					}
				}
			} else {
				try {
					msgText = await attachmentHandler.handleForwards(this, puppetId, msgText, params, (context.forwards));
				} catch (err) {
					log.error(err);
					log.debug(context);
				}
			}
		}

		if (context.hasReplyMessage) {
			if (await this.puppet.eventSync.getMatrix(params.room, context.replyMessage!.id.toString())) {
				const opts: IMessageEvent = {
					body: msgText || "Attachment",
					formattedBody: this.converter.makeHtml(msgText),
				};
				// We got referenced message in room, using matrix reply
				await this.puppet.sendReply(params, context.replyMessage!.id.toString(), opts);
			} else {
				// Using a fallback
				const opts: IMessageEvent = {
					body: await this.prependReply(
						puppetId, msgText || "",
						context.replyMessage?.text || "",
						context.senderId.toString(),
					),
				};
				await this.puppet.sendMessage(params, opts);
			}
		} else {
			if (msgText !== "") {
				const opts: IMessageEvent = {
					body: msgText,
					formattedBody: this.converter.makeHtml(msgText),
				};
				await this.puppet.sendMessage(params, opts);
			}
		}

		if (context.hasAttachments()) {
			const attachments = p.data.isUserToken
				? (await p.client.api.messages.getById({ message_ids: context.id })).items[0].attachments!
				: context.attachments;

			for (const f of attachments) {
				let rendered: string;
				switch (f.type) {
					case AttachmentType.PHOTO:
						await attachmentHandler.handlePhotoAttachment(params, f);
						break;

					case AttachmentType.STICKER:
						await attachmentHandler.handleStickerAttachment(params, f);
						break;

					case AttachmentType.AUDIO_MESSAGE:
						await attachmentHandler.handleAudioMessage(params, f["audio_message"]);
						break;

					case AttachmentType.AUDIO:
						await attachmentHandler.handleAudio(params, f);
						break;

					case AttachmentType.DOCUMENT:
						await attachmentHandler.handleDocument(params, f);
						break;

					case AttachmentType.LINK:
						await this.puppet.sendMessage(params, {
							body: `Link: ${f["link"]["url"]}`,
						});
						break;

					case AttachmentType.WALL:
						rendered = await this.renderWallPost(puppetId, f);
						await this.puppet.sendMessage(params, {
							body: rendered,
							formattedBody: this.converter.makeHtml(rendered),
						});
						break;

					case AttachmentType.WALL_REPLY:
						rendered = await this.renderWallPost(puppetId, f);
						await this.puppet.sendMessage(params, {
							body: rendered,
							formattedBody: this.converter.makeHtml(rendered),
						});
						break;

					default:
						await this.puppet.sendMessage(params, {
							body: `Unhandled attachment of type ${f.type}`,
						});
						break;
				}
			}
		}
	}

	public async handleVkEdit(puppetId: number, context: MessageContext) {
		const p = this.puppets[puppetId];
		if (!p) {
			return;
		}
		log.info(context);
		// As VK always sends edit as outbox, we won't work with any edits from groups
		if (!p.data.isUserToken && context.senderType === "group") {
			return; // Deduping
		}

		// With users it works ok
		if (p.data.isUserToken && context.isOutbox === true) {
			return; // Deduping
		}

		const params = await this.getSendParams(puppetId, context.peerId, context.senderId, context.id.toString());
		if (context.hasText) {
			const opts: IMessageEvent = {
				body: context.text || "Attachment",
			};
			await this.puppet.sendEdit(params, context.id.toString(), opts);
		}
	}

	////////////////
	// Formatters //
	////////////////

	public async prependReply(puppetId: number, body: string, reply: string, userid: string) {
		const user = await this.getRemoteUser(puppetId, Number(userid));
		const replySplitted = reply.split("\n");
		let formatted = `> <${user.name}>\n`;
		replySplitted.forEach((element) => {
			formatted += `> ${element}\n`;
		});
		formatted += `\n\n${body}`;
		return formatted;
	}

	public async stripReply(body: string) {
		// tslint:disable-next-line: prefer-const
		const splitted = body.split("\n");
		let isCitate = true;
		while (isCitate) {
			if (splitted[0].startsWith(">")) {
				splitted.splice(0, 1);
			} else {
				isCitate = false;
			}
		}
		return (splitted.join("\n").trim());
	}

	public async renderWallPost(puppetId: number, post: MessagesMessageAttachment) {

		const renderWallPostAsGroup = async () => {
			const user = await this.getRemoteUser(puppetId, Number(post.fromId));
			let formatted = `Forwarded post from [${user.name}](${user.externalUrl})\n`;
			post.text?.split("\n").forEach((element) => {
				formatted += `> ${element}\n`;
			});
			if (post.hasAttachments()) {
				post.attachments.forEach((attachment) => {
					switch (attachment.type) {
						case AttachmentType.PHOTO:
							formatted += `> 🖼️ [Photo](${attachment["largeSizeUrl"]})\n`;
							break;
						case AttachmentType.STICKER:
							formatted += `> 🖼️ [Sticker](${attachment["imagesWithBackground"][4]["url"]})\n`;
							break;
						case AttachmentType.AUDIO_MESSAGE:
							formatted += `> 🗣️ [Audio message](${attachment["oggUrl"]})\n`;
							break;
						case AttachmentType.AUDIO:
							formatted += `> 🗣️ [Audio](${attachment["oggUrl"] ?? attachment["url"]})\n`;
							break;
						case AttachmentType.DOCUMENT:
							formatted += `> 📁 [File ${attachment["title"]}](${attachment["url"]})\n`;
							break;
						case AttachmentType.LINK:
							formatted += `> 🔗 [ ${attachment["title"] ? attachment["title"] : attachment["url"]} ](${attachment["url"]})\n`;
							break;
						default:
							formatted += `> ❓️ Unhandled attachment of type ${attachment.type}\n`;
							break;
					}
				});
			}
			return formatted;
		};

		const renderWallPostAsUser = async () => {
			const user = await this.getRemoteUser(puppetId, Number(post.wall.ownerId));
			let formatted = `Forwarded post from [${user.name}](${user.externalUrl})\n`;
			post = post.wall;
			post.text?.split("\n").forEach((element) => {
				formatted += `> ${element}\n`;
			});
			if (post.attachments !== undefined && post.attachments.length !== 0) {
				const attachmentHandler = new AttachmentsHandler(p, this.puppet);
				post.attachments.forEach((attachment) => {
					switch (attachment.type) {
						case AttachmentType.PHOTO:
							formatted +=
								`> 🖼️ [Photo](${attachmentHandler.getBiggestImage(attachment[attachment.type]["sizes"])["url"]})\n`;
							break;
						case AttachmentType.AUDIO:
							formatted += `> 🗣️ [Audio] ${attachment[attachment.type]["title"]} by ${attachment[attachment.type]["artist"]} ${attachment[attachment.type]["url"]}\n`;
							break;
						case AttachmentType.DOCUMENT:
							formatted += `> 📁 [File ${attachment[attachment.type]["title"]}](${attachment[attachment.type]["url"]})\n`;
							break;
						case AttachmentType.LINK:
							formatted += `> 🔗 [ ${attachment[attachment.type]["title"] ? attachment[attachment.type]["title"] : attachment[attachment.type]["url"]} ](${attachment[attachment.type]["url"]})\n`;
							break;
						default:
							formatted += `> ❓️ Unhandled attachment of type ${attachment.type}\n`;
							break;
					}
				});
			}
			if (post.copy_history !== undefined && post.copy_history !== 0) {
				const subpost = await this.renderWallPost(puppetId, { wall: post.copy_history[0] });
				subpost.split("\n").forEach((element) => {
					formatted += `> ${element}\n`;
				});
			}

			return formatted;
		};

		const p = this.puppets[puppetId];
		if (p.data.isUserToken) {
			return await renderWallPostAsUser();
		} else {
			return await renderWallPostAsGroup();
		}

	}
}
