const { token, creatorId } = require('./config.json')
const {
	Client,
	Intents,
	MessageEmbed,
	MessageActionRow,
	MessageButton,
	Permissions,
} = require('discord.js')

const client = new Client({
	intents: [
		Intents.FLAGS.GUILDS,
		Intents.FLAGS.GUILD_MEMBERS,
		Intents.FLAGS.GUILD_MESSAGES,
		Intents.FLAGS.GUILD_VOICE_STATES,
	],
	partials: ['MESSAGE', 'CHANNEL'],
})

// Discord connection
client.once('ready', (client) => {
	console.log(`Logged as @${client.user.tag} (id: ${client.user.id})`)
})

client.login(token)

var vc = {}
var owners = {}
var kicks = {}
var overwrites = {}

function voiceUpdateVC(guildID, callback) {
	let guild = client.guilds.cache.get(guildID)
	vc = {}
	vc.guild = guild
	guild.channels
		.fetch(creatorId)
		.then((creator) => {
			vc.creator = creator
			vc.category = creator.parent
			return callback(true)
		})
		.catch((err) => {})
}

function voiceClearEmpty() {
	try {
		vc.category.children.forEach((channel) => {
			if (channel.type != 'GUILD_VOICE') return
			if (channel.id === creatorId) return
			if (channel.members.size === 0) channel.delete()
		})
	} catch {}
}

function createRoom() {
	var sillyNumber = 0
	var cleverNumber = 0
	vc.creator.members.forEach((member) => {
		vc.category.children.forEach((channel) => {
			if (channel.type != 'GUILD_VOICE') return
			if (channel.id === creatorId) return
			try {
				cleverNumber = Math.max(
					parseInt(channel.name.split(' ')[0].slice(1)),
					cleverNumber
				)
			} catch {
				cleverNumber = -1
			} finally {
				sillyNumber += 1
			}
		})
		var number = cleverNumber != -1 ? cleverNumber + 1 : sillyNumber
		if (isNaN(number)) number = sillyNumber
		var roomName = `#${number} | ${member.displayName}`

		vc.category
			.createChannel(roomName, {
				type: 'GUILD_VOICE',
				userLimit: 5,
				permissionOverwrites: [
					{
						id: member.user.id,
						allow: [Permissions.FLAGS.VIEW_CHANNEL, Permissions.FLAGS.CONNECT],
					},
					{
						id: vc.guild.roles.everyone,
						allow: [Permissions.FLAGS.VIEW_CHANNEL, Permissions.FLAGS.CONNECT],
					},
				],
			})
			.then((newChannel) => {
				member.voice.setChannel(newChannel)
				createControl(newChannel)
				owners[member.id] = newChannel.id
			})
	})
}

function createControl(voiceChannel) {
	const row1 = new MessageActionRow().addComponents(
		new MessageButton()
			.setCustomId('tempvoice-lock')
			.setLabel(' ')
			.setStyle('SECONDARY')
			.setEmoji('🔒'),
		new MessageButton()
			.setCustomId('tempvoice-unlock')
			.setLabel(' ')
			.setStyle('SECONDARY')
			.setEmoji('🔓')
	)
	const row2 = new MessageActionRow().addComponents(
		new MessageButton()
			.setCustomId('tempvoice-invisible')
			.setLabel(' ')
			.setStyle('SECONDARY')
			.setEmoji('👁️'),
		new MessageButton()
			.setCustomId('tempvoice-visible')
			.setLabel(' ')
			.setStyle('SECONDARY')
			.setEmoji('👀')
	)
	const row3 = new MessageActionRow().addComponents(
		new MessageButton()
			.setCustomId('tempvoice-limit')
			.setLabel(' ')
			.setStyle('SECONDARY')
			.setEmoji('🛡️'),
		new MessageButton()
			.setCustomId('tempvoice-kick')
			.setLabel(' ')
			.setStyle('SECONDARY')
			.setEmoji('🚫')
	)
	const embed = new MessageEmbed()
		.setColor('#0099ff')
		.setTitle(`Управление каналом\n"${voiceChannel.name}"`)
		.addFields(
			{ name: '(🔒)', value: '```Закрыть для всех```', inline: true },
			{ name: '(🔓)', value: '```Открыть для всех```', inline: true },
			{ name: '\u200B', value: '\u200B' }
		)
		.addFields(
			{ name: '(👁️)', value: '```Скрыть```', inline: true },
			{ name: '(👀)', value: '```Сделать видимым```', inline: true },
			{ name: '\u200B', value: '\u200B' }
		)
		.addFields(
			{ name: '(🛡️)', value: '```Ограничить кол-во человек```', inline: true },
			{ name: '(🚫)', value: '```Кикнуть```', inline: true }
		)
	voiceChannel.send({ embeds: [embed], components: [row1, row2, row3] })
}

function userInVoice(userid, voiceid, callback) {
	if (!owners.hasOwnProperty(userid)) return callback(false)
	vc.guild.members.fetch(userid).then((member) => {
		return callback(
			owners[userid] === member.voice.channel.id &&
				member.voice.channel.id === voiceid
		)
	})
}

function getDescription(channelID) {
	var permissions = ''
	if (!overwrites.hasOwnProperty(channelID)) {
		permissions += 'Видимость: Все\nПодключение: Все\n'
	} else {
		permissions += `Видимость: ${
			overwrites[channelID].visible === true ? 'Все' : 'Никто'
		}\n`
		permissions += `Подключение: ${
			overwrites[channelID].lock === true ? 'Никто' : 'Все'
		}\n`
	}
	if (kicks.hasOwnProperty(channelID)) {
		permissions += 'Кикнуты: '
		kicks[channelID].forEach((kick) => {
			permissions += `<@${kick}>\n`
		})
		permissions += '\n'
	}
	return permissions
}

client.on('messageCreate', (message) => {
	if (!message.content.startsWith('room;')) return
	var action = message.content.split(';')[1]
	var param = message.content.split(';')[2]
	userInVoice(message.author.id, message.channel.id, function (result) {
		if (!result) {
			message.reply({
				content: 'Вы не создатель канала либо не находитесь в канале',
				ephemeral: true,
			})
			return
		}
		if (action === 'kick') {
			if (param === undefined || param === '') {
				message.reply({
					content: 'Нужно указать параметр после вторых ";"',
					ephemeral: true,
				})
				return
			}
			var targetid = param.replace('<', '').replace('>', '').replace('@', '')
			message.channel.members.forEach((member) => {
				if (member.id != targetid) return
				if (!kicks.hasOwnProperty(message.channel.id))
					kicks[message.channel.id] = []
				kicks[message.channel.id].push(targetid)
				member.voice.disconnect('кикнут владельцем канала')
				message.channel.permissionOverwrites.create(member, {
					VIEW_CHANNEL: false,
				})
			})
			message.reply({
				content: getDescription(message.channel.id),
				ephemeral: true,
			})
		} else if (action === 'limit') {
			if (param === undefined || param === '') {
				message.reply({
					content: 'Нужно указать параметр после вторых ";"',
					ephemeral: true,
				})
				return
			}
			try {
				vc.guild.channels
					.fetch(owners[message.author.id])
					.then((channel) => {
						if (parseInt(param) > 99) {
							message.reply({
								content: `Число должно быть не больше 99`,
								ephemeral: true,
							})
							return
						}
						channel.setUserLimit(parseInt(param))
					})
					.catch((err) => {})
			} catch {
				message.reply({
					content: `"${param}" не является целым числом`,
					ephemeral: true,
				})
			}
		} else {
			message.reply({
				content: 'Такой команды нет.\n```room;kick```\n```room;limit```',
				ephemeral: true,
			})
		}
	})
})

client.on('interactionCreate', async (interaction) => {
	if (!interaction.customId.startsWith('tempvoice')) return
	userInVoice(interaction.member.id, interaction.channel.id, function (result) {
		if (!result) {
			interaction.reply({
				content: 'Вы не создатель канала либо не находитесь в канале',
				ephemeral: true,
			})
			return
		}
		var action = interaction.customId.split('-')[1]
		var channelID = interaction.channel.id
		vc.guild.channels.fetch(channelID).then((channel) => {
			if (!overwrites.hasOwnProperty(channelID))
				overwrites[channelID] = { 'lock': false, 'visible': true }
			if (action === 'limit') {
				interaction.reply({
					content:
						'```room;limit;[num]```\n> Например команда "room;limit;5" ограничит число участников до 5.\n\n> Чтобы убрать лимит укажите число равным нулю (num=0)',
					ephemeral: true,
				})
				return
			}
			if (action === 'kick') {
				interaction.reply({
					content:
						'```room;kick;[tag]```\n```room;kick;[id]```\n> Например команда "room;kick;@discord#1234" выгонет участника из комнаты, а также уберёт видимость канала для @discord#1234',
					ephemeral: true,
				})
				return
			}
			switch (action) {
				case 'lock':
					overwrites[channelID].lock = true
					break
				case 'unlock':
					overwrites[channelID].lock = false
					break
				case 'visible':
					overwrites[channelID].visible = true
					break
				case 'invisible':
					overwrites[channelID].visible = false
					break
				default:
					break
			}
			channel.permissionOverwrites.create(vc.guild.roles.everyone, {
				CONNECT: !overwrites[channelID].lock,
				VIEW_CHANNEL: overwrites[channelID].visible,
			})
			interaction.reply({
				content: getDescription(channelID),
				ephemeral: true,
			})
		})
	})
})

client.on('voiceStateUpdate', (oldState, newState) => {
	try {
		voiceUpdateVC(newState.guild.id, () => {
			voiceClearEmpty()
			if (newState.channel.id === creatorId) createRoom()
		})
	} catch (err) {
		console.log(err)
	}
})
