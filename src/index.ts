// first we import needed stuffs
import {
	PuppetBridge,
	Log,
	IRetData,
	IProtocolInformation,
} from "mx-puppet-bridge";
import * as commandLineArgs from "command-line-args";
import * as commandLineUsage from "command-line-usage";
import { VkPuppet } from "./vk";

// here we create the log instance using the bridges logging
const log = new Log("VkPuppet:index");

// we want to handle command line options for registration etc.
const commandOptions = [
	{ name: "register", alias: "r", type: Boolean },
	{ name: "registration-file", alias: "f", type: String },
	{ name: "config", alias: "c", type: String },
	{ name: "help", alias: "h", type: Boolean },
];
const options = Object.assign({
	"register": false,
	"registration-file": "vk-registration.yaml",
	"config": "config.yaml",
	"help": false,
}, commandLineArgs(commandOptions));

// if we asked for help, just display the help and exit
if (options.help) {
	// tslint:disable-next-line:no-console
	console.log(commandLineUsage([
		{
			header: "Matrix VK Puppet Bridge",
			content: "A matrix puppet bridge for VK",
		},
		{
			header: "Options",
			optionList: commandOptions,
		},
	]));
	process.exit(0);
}

// here we define some information about our protocol, what features it supports etc.
const protocol: IProtocolInformation = {
	features: {
		image: true,
		audio: true,
		file: true,
		presence: true,
		reply: true,
		edit: true,
		advancedRelay: true,
	},
	id: "vk", // an internal ID for the protocol, all lowercase
	displayname: "VK", // a human-readable name of the protocol
	externalUrl: "https://vk.com/", // A URL about your protocol
};

// next we create the puppet class.
const puppet = new PuppetBridge(options["registration-file"], options.config, protocol);

// check if the options were to register
if (options.register) {
	// okay, all we have to do is generate a registration file
	puppet.readConfig(false);
	try {
		puppet.generateRegistration({
			prefix: "_vk_puppet_",
			id: "vk-puppet",
			url: `http://${puppet.Config.bridge.bindAddress}:${puppet.Config.bridge.port}`,
		});
	} catch (err) {
		// tslint:disable-next-line:no-console
		console.log("Couldn't generate registration file:", err);
	}
	process.exit(0);
}

// this is where we initialize and start the puppet
async function run() {
	await puppet.init(); // always needed, initialize the puppet

	// create our own protocol class
	const vk = new VkPuppet(puppet);

	puppet.on("puppetNew", vk.newPuppet.bind(vk));
	puppet.on("puppetDelete", vk.deletePuppet.bind(vk));
	puppet.on("message", vk.handleMatrixMessage.bind(vk));
	puppet.on("edit", vk.handleMatrixEdit.bind(vk));
	puppet.on("redact", vk.handleMatrixRedact.bind(vk));
	puppet.on("reply", vk.handleMatrixReply.bind(vk));
	puppet.on("image", vk.handleMatrixImage.bind(vk));
	puppet.on("audio", vk.handleMatrixAudio.bind(vk));
	puppet.on("file", vk.handleMatrixFile.bind(vk));

	puppet.on("typing", vk.handleMatrixTyping.bind(vk));
	puppet.on("read", vk.handleMatrixRead.bind(vk));

	puppet.setCreateRoomHook(vk.createRoom.bind(vk));
	puppet.setGetUserIdsInRoomHook(vk.getUserIdsInRoom.bind(vk));
	puppet.setCreateUserHook(vk.createUser.bind(vk));
	// required: get description hook
	// tslint:disable-next-line: no-any
	puppet.setGetDescHook(async (puppetId: number, data: any): Promise<string> => {
		// here we receive the puppet ID and the data associated with that puppet
		// we are expected to return a displayable name for that particular puppet
		let s = "VK";
		if (data.isUserToken) {
			s += " as user";
		} else {
			s += " as group";
		}
		if (data.username) {
			s += ` ${data.username}`;
		}
		if (data.id) {
			s += ` (${data.id})`;
		}
		return s;
	});
	// required: get data from string hook
	puppet.setGetDataFromStrHook(async (str: string): Promise<IRetData> => {
		// this is called when someone tires to link a new puppet
		// for us the str is our own name and if it is "invalid" it fails
		const retData: IRetData = {
			success: false,
		};
		if (!str || str === "invalid") {
			retData.error = "Invalid name!";
			return retData;
		}
		retData.success = true;
		// login token to VK
		retData.data = {
			token: str,
		};
		return retData;
	});
	// required: default display name of the bridge bot.
	puppet.setBotHeaderMsgHook((): string => {
		return "VK Puppet Bridge";
	});

	// and finally, we start the puppet
	await puppet.start();
}

// tslint:disable-next-line:no-floating-promises
run();
