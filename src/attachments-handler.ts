// first we import a few needed things again
import {
  PuppetBridge,
  IReceiveParams,
  IMessageEvent,
  Log,
} from "mx-puppet-bridge";

import { VK, AttachmentType, MessageForwardsCollection } from "vk-io";
import { MessagesForeignMessage, MessagesMessageAttachment } from "vk-io/lib/api/schemas/objects";
import { IPuppet } from "./puppet";
import { VkPuppet } from "./vk";

// here we create our log instance
const log = new Log("VKPuppet:attachment-handler");

export class AttachmentsHandler {
  private puppet: IPuppet;
  private puppetBridge: PuppetBridge;
  constructor(puppet: IPuppet, puppetBridge: PuppetBridge) {
    this.puppet = puppet;
    this.puppetBridge = puppetBridge;
  }

  public getBiggestImage(images: object[]): any {
    let maxImageResolution = 0;
    let biggestImage: any = null;
    images.forEach((image: object) => {
      if (maxImageResolution < (image["width"] + image["height"])) {
        maxImageResolution = image["width"] + image["height"];
        biggestImage = image;
      }
    });

    return biggestImage;
  }

  public async handlePhotoAttachment(params: IReceiveParams, attachment: MessagesMessageAttachment) {
    try {
      if (this.puppet.data.isUserToken) {
        // VK API is weird. Very weird.
        const biggestImage = this.getBiggestImage(
          attachment["photo"]["sizes"],
        );
        const url: string = biggestImage["url"] || "";

        if (url === "") {
          log.error(`Image not found in ${attachment["photo"]}`);
        }
        await this.puppetBridge.sendFileDetect(params, url);
      } else {
        await this.puppetBridge.sendFileDetect(params, attachment["largeSizeUrl"]);
      }
    } catch (err) {
      const opts: IMessageEvent = {
        body: `Image: ${attachment["image"]["largeSizeUrl"]}`,
      };
      await this.puppetBridge.sendMessage(params, opts);
    }
  }

  public async handleStickerAttachment(params: IReceiveParams, attachment: MessagesMessageAttachment) {
    try {
      if (this.puppet.data.isUserToken) {
        await this.puppetBridge.sendFileDetect(
          params, attachment["sticker"]["images_with_background"][4]["url"],
        );
      } else {
        await this.puppetBridge.sendFileDetect(params, attachment["imagesWithBackground"][4]["url"]);
      }

    } catch (err) {
      const opts: IMessageEvent = {
        body: `Sticker: ${attachment["imagesWithBackground"][4]["url"]}`,
      };
      await this.puppetBridge.sendMessage(params, opts);
    }
  }

  public async handleAudioMessage(params: IReceiveParams, attachment: MessagesMessageAttachment) {
    const audioUrl: string = attachment["oggUrl"] || attachment["url"] || attachment["link_ogg"];
    if (audioUrl === undefined || audioUrl === "") {
      const opts: IMessageEvent = {
        body: "Audio messages aren't supported yet",
      };
      await this.puppetBridge.sendMessage(params, opts);
    } else {
      try {
        await this.puppetBridge.sendAudio(params, audioUrl);
      } catch (err) {
        const opts: IMessageEvent = {
          body: `Audio message: ${audioUrl}`,
        };
        await this.puppetBridge.sendMessage(params, opts);
      }
    }
    if (attachment["transcript"] !== undefined) {
      const opts: IMessageEvent = {
        body: "[Transcript]" + attachment["transcript"],
      };
      await this.puppetBridge.sendMessage(params, opts);
    }
  }

  public async handleAudio(params: IReceiveParams, attachment: MessagesMessageAttachment) {
    const audioUrl: string = attachment["url"];
    if (audioUrl === undefined || audioUrl === "") {
      const opts: IMessageEvent = {
        body: "Audio in messages aren't supported yet",
      };
      await this.puppetBridge.sendMessage(params, opts);
    } else {
      try {
        await this.puppetBridge.sendAudio(params, audioUrl);
      } catch (err) {
        const opts: IMessageEvent = {
          body: `Audio: ${attachment["title"]} by ${attachment["artist"]} ${audioUrl}`,
        };
        await this.puppetBridge.sendMessage(params, opts);
      }
    }
  }

  public async handleDocument(params: IReceiveParams, attachment: MessagesMessageAttachment) {
    try {
      if (this.puppet.data.isUserToken) {
        await this.puppetBridge.sendFileDetect(params, attachment["doc"]["url"], attachment["doc"]["title"]);
      } else {
        const opts: IMessageEvent = {
          body: `Document: ${attachment["url"]}`,
        };
        await this.puppetBridge.sendMessage(params, opts);
      }
    } catch (err) {
      if (this.puppet.data.isUserToken) {
        const opts: IMessageEvent = {
          body: `Document: ${attachment["doc"]["url"]}`,
        };
        await this.puppetBridge.sendMessage(params, opts);
      } else {
        const opts: IMessageEvent = {
          body: `Document: ${attachment["url"]}`,
        };
        await this.puppetBridge.sendMessage(params, opts);
      }
    }
  }

  public async handleForwards(
    vkPuppet: VkPuppet, puppetId: number, messageBody: string,
    params: IReceiveParams, forwards: MessageForwardsCollection | MessagesForeignMessage[],
  ) {
    let formatted = `${messageBody}\n`;

    for (const f of forwards) {
      const user = await vkPuppet.getRemoteUser(puppetId, Number(f.senderId));
      formatted += `> <[${user.name}](${user.externalUrl})>\n`;
      f.text?.split("\n").forEach((element) => {
        formatted += `> ${element}\n`;
      });
      if (f.attachments !== undefined && f.attachments.length !== 0) {
        f.attachments?.forEach(async (attachment) => {
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
              formatted += `> 🗣️ [Audio message](${attachment["oggUrl"] ?? attachment["url"]})\n`;
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
      if (f.hasForwards) {
        (
          await this.handleForwards(vkPuppet, puppetId, "", params, f.forwards)
        ).trim().split("\n").forEach((element) => {
          formatted += `> ${element}\n`;
        },
        );
      }
      formatted += "\n";
    }
    return formatted;
  }

  public async handleForwardsAsUser(
    vkPuppet: VkPuppet, puppetId: number, messageBody: string,
    params: IReceiveParams, forwards: MessageForwardsCollection | MessagesForeignMessage[],
  ) {
    let formatted = `${messageBody}\n`;

    for (const f of forwards) {
      const user = await vkPuppet.getRemoteUser(puppetId, Number(f.from_id));
      formatted += `> <[${user.name}](${user.externalUrl})>\n`;
      f.text?.split("\n").forEach((element) => {
        formatted += `> ${element}\n`;
      });
      if (f.attachments !== undefined && f.attachments.length !== 0) {
        f.attachments?.forEach(async (attachment) => {
          switch (attachment.type) {
            case AttachmentType.PHOTO:
              formatted += `> 🖼️ [Photo](${this.getBiggestImage(attachment[attachment.type]["sizes"])["url"]})\n`;
              break;
            case AttachmentType.STICKER:
              formatted += `> 🖼️ [Sticker](${this.getBiggestImage(attachment[attachment.type]["images_with_background"])["url"]})\n`;
              break;
            case AttachmentType.AUDIO_MESSAGE:
              formatted += `> 🗣️ [Audio message](${attachment[attachment.type]["link_ogg"]}) \n`;
              if (attachment[attachment.type]["transcript"] !== undefined) {
                formatted += `> > [Transcript] ${attachment[attachment.type]["transcript"]}`;
              }
              break;
            case AttachmentType.DOCUMENT:
              formatted += `> 📁 [File ${attachment[attachment.type]["title"]}](${attachment[attachment.type]["url"]})\n`;
              break;
            case AttachmentType.LINK:
              formatted += `> 🔗 [ ${attachment["title"] ? attachment["title"] : attachment["url"]} ](${attachment["url"]})\n`;
              break;
            case AttachmentType.WALL: {
              const wallpost = await vkPuppet.renderWallPost(puppetId, attachment);
              formatted += wallpost.split("\n").forEach((element) => {
                formatted += `> ${element}\n`;
              });
              break;
            }
            default:
              formatted += `> ❓️ Unhandled attachment of type ${attachment.type}\n`;
              break;
          }
        });
      }
      if (f.fwd_messages !== undefined) {
        (
          await this.handleForwardsAsUser(vkPuppet, puppetId, "", params, f.fwd_messages)
        ).trim().split("\n").forEach((element) => {
          formatted += `> ${element}\n`;
        });
      }
      formatted += "\n";
    }
    return formatted;
  }
}
