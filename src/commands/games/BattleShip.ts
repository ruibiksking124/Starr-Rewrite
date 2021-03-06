import { BaseCommand } from "../../utils/structure/BaseCommand";
import StarrClient from "../../utils/structure/StarrClient";
import { Message, MessageReaction, User, GuildMember, DMChannel, MessageEmbed } from "discord.js";
import battleShipPlayer from "../../utils/interfaces/battleShipPlayer";
import { type } from "os";

export default class BattleShip extends BaseCommand {
    constructor() {
        super({
            category: "games",
            description: "Play the classic battleship game with someone!",
            name: "battleship",
            permissions: ["SEND_MESSAGES"],
            usage: "battleship <user>",
            aliases: ["battlesh", "bship"],
        });
    }
    public async run(client: StarrClient, message: Message, args: string[]) {

        const prefix = client.cachedPrefixes.get(message.guild.id); // Get the current servers prefix to use in DM's

        const challenger = message.member; // Define the challenger
        const opponent = message.mentions.members.first() || message.guild.members.cache.get(args[0]); // Get and define the opponent

        if (!opponent) return message.channel.send("Please mention a member to battle!"); // If there is no opponent, require them to define one
        if (challenger.id === opponent.id) return message.channel.send("Please challenge someone other than yourself!"); // Check for prevention against challenging yourself
        
        const accept = await message.channel.send(`Hey ${opponent}, ${challenger} just challenged you to a game of Battle Ship. Do you accept?`); 
        await Promise.all([accept.react("✅"), accept.react("❌")]);

        const acceptFilter = (reaction: MessageReaction, user: User) => user.id === opponent.id && ["✅", "❌"].includes(reaction.emoji.name);
        const acceptedData = await accept.awaitReactions(acceptFilter, { max: 1, time: 30000 });

        if (acceptedData.size < 1) return accept.edit("They didn't react in time, looks like they declined.");
        if (acceptedData.first().emoji.name === "✅") {

            await accept.delete();

            const trackingEmbed = new MessageEmbed()
                .setTitle("Battle Ship Game <:submarine:753289857907818561>")
                .setFooter(`${challenger.user.tag} vs ${opponent.user.tag}`)
                .setColor(client.colors.noColor)
                .setDescription("The game has begun! Check your DM's for instructions on how to proceed. This embed will update as the game continues.");
            const trackMsg = await message.channel.send(trackingEmbed);

            const players: battleShipPlayer[] = [
                { collector: null, member: challenger, playerHitBoard: this.genBoard(10, 10), playerShipBoard: this.genBoard(10, 10), gameChannel: "", placedBoats: [], gameMessages: { start: "", hits: "", boats: "" }, ready: false },
                { collector: null, member: opponent , playerHitBoard: this.genBoard(10, 10), playerShipBoard: this.genBoard(10, 10), gameChannel: "", placedBoats: [], gameMessages: { start: "", hits: "", boats: "" }, ready: false },
            ];

            let player = 0;

            for (const play of players) {

                const startMsg = await play.member.send(`Here is your starting Attack and Ship board! To add your boat pieces to the Ship board, please use the following command format. \`${prefix}add <ship> <Board Cords> <dirrection>\`. An example of this would be, \`${prefix}add destroyer D5 down\`\n\nAvailable Ships:\ncarrier (5)\nbattleship (4)\ndestroyer (3)\nsubmarine (3)\npatrolboat (2)`);
                const hitBoard = await play.member.send(`Attack Board:\n${this.displayBoard(play.playerHitBoard, "hit")}`);
                const dmBoard = await play.member.send(`Ship Board:\n${this.displayBoard(play.playerShipBoard, "ship")}`);

                play.gameMessages.start = startMsg.id;
                play.gameMessages.hits = hitBoard.id;
                play.gameMessages.boats = dmBoard.id;

                const filter = (msg: Message) => msg.author.id === play.member.id && [`${prefix}add`, `${prefix}attack`].includes(msg.content.split(" ")[0]);
                const dmCollector = dmBoard.channel.createMessageCollector(filter);

                play.collector = dmCollector;

                play.gameChannel = dmBoard.channel.id;

                const validBoats = [ { name: "carrier", length: 5, hits: 0, sunk: false }, { name: "battleship", length: 4,hits: 0, sunk: false }, { name: "destroyer", length: 3, hits: 0, sunk: false }, { name: "submarine", length: 3, hits: 0, sunk: false }, { name: "patrolboat", length: 2, hits: 0, sunk: false } ];
                const validDirrections = [ "up", "down", "right", "left" ];

                dmCollector.on("collect", async (msg: Message) => {
                    const argument = msg.content.slice(prefix.length).trim().split(/ +/g);
                    const cmd = argument.shift();

                    if (!players.find(plr => plr.member.id === msg.author.id).ready) {
                        if (cmd === "add") {

                            const currPlayer = players.find(plr => plr.member.id === msg.author.id);
                            const gameChannelObject = <DMChannel>client.channels.cache.get(currPlayer.gameChannel);

                            const boatType = argument[0];
                            if (!boatType) return msg.channel.send("Please provide a boat to place.").then(m => m.delete({ timeout: 15000 }));
                            if (!validBoats.some(value => value.name === boatType.toLowerCase())) return msg.channel.send("Please provide a valid boat type to place.").then(m => m.delete({ timeout: 15000 }));
                            if (players.find(plyr => plyr.member.id === msg.author.id).placedBoats.some(data => data.name === boatType.toLowerCase())) return msg.channel.send("You already placed that boat. Please try a different one.").then(m => m.delete({ timeout: 15000 }));

                            const cords = argument[1];
                            if (!cords) return msg.channel.send("Please enter cords for your ship. Ex: `D5`").then(m => m.delete({ timeout: 15000 }));
                            const directionRegex = /[a-z]([1-9]|10)/i;
                            if (!cords.match(directionRegex)) return msg.channel.send("Please enter valid cords for your ship. Ex: `D5`").then(m => m.delete({ timeout: 15000 }));

                            const dirrection = argument[2];
                            if (!dirrection) return msg.channel.send("Please provide a direction to position your boat!").then(m => m.delete({ timeout: 15000 }));
                            if (!validDirrections.some(value => value === dirrection.toLowerCase())) return msg.channel.send(`Please provide a valid dirrection. Valid Choices: ${validDirrections.join(", ")}`).then(m => m.delete({ timeout: 15000 }));

                            const checked = this.checkBoatPos(play.playerShipBoard, validBoats.find(data => data.name === boatType.toLowerCase()), { letter: cords[0], number: parseInt(cords.slice(1)), cord: cords }, dirrection, "check");
                            if (!checked) return msg.channel.send(`You can't put the ${boatType} at ${cords} facing ${dirrection}`).then(m => m.delete({ timeout: 15000 }));

                            currPlayer.placedBoats.push(validBoats.find(data => data.name === boatType.toLowerCase()));

                            const reRender = this.checkBoatPos(players.find(plyr => plyr.member.id === msg.author.id).playerShipBoard, validBoats.find(boat => boat.name === boatType.toLowerCase()), { letter: cords[0], number: parseInt(cords.slice(1)), cord: cords }, dirrection, "render");

                            currPlayer.playerShipBoard = reRender.board
                            gameChannelObject.messages.cache.get(currPlayer.gameMessages.boats).edit(`Ship Board:\n${this.displayBoard(reRender.board, "ship")}`);

                            let oldBoat = players.find(p => p.member.id === msg.author.id).placedBoats.find(b => b.name.toLowerCase() === reRender.boat.name.toLowerCase());
                            oldBoat = reRender.boat;

                            const editMe = gameChannelObject.messages.cache.get(currPlayer.gameMessages.start);
                            const regex = new RegExp(boatType.toLowerCase(), "ig");
                            editMe.edit(editMe.content.replace(regex, `~~${boatType.toLowerCase()}~~`));

                            if (currPlayer.placedBoats.length === 5) {
                                currPlayer.ready = true;
                                if (players[0].ready && players[1].ready) {
                                    for (const playr of players) {
                                        const perGame = <DMChannel>client.channels.cache.get(playr.gameChannel);
                                        perGame.messages.cache.get(playr.gameMessages.start).edit(`You have both now finished the setup phase of the game! It is ${players[player].member.user.tag}'s turn to attack! Use \`${prefix}attack <cords>\` to call an attack on that spot!\n\nLegend:\n- Attack Board:\n--- ◻️ = Empty Spot\n--- ⚪ = Missed Attack\n--- 🔴 = Hit Attack\n- Ship Board:\n--- 🔲 = Empty Spot\n--- 🟩 = Unhit Ship\n--- 🟥 = Hit Ship\n--- ⚪ = Missed Opponent Shot`);
                                        playr.member.send(`${playr.member.user}`).then(m => m.delete());
                                    }


                                    trackingEmbed.setDescription("");
                                    for (const p of players) {
                                        trackingEmbed.addField(p.member.user.tag, `Has ${p.placedBoats.filter(b => !b.sunk).length} ships left!\n\n${p.placedBoats.map(b => b.sunk ? `❌ ${b.name.toProperCase()}` : `✅ ${b.name.toProperCase()}`).join("\n")}`);
                                    }
                                    trackMsg.edit(trackingEmbed);


                                } else return msg.channel.send("It looks like your opponent hasn't placed all of their ships yet! Please wait for them to finish. Once they finish you will get a DM.").then(m => m.delete({ timeout: 15000 }));
                            }
                        }
                    } else if (players[0].ready && players[1].ready) {
                        if (players[player].member.id === msg.author.id) {
                            if (cmd === "attack") {

                                const playerChannel = <DMChannel>client.channels.cache.get(players[player].gameChannel);
                                const opponentChannel = <DMChannel>client.channels.cache.get(players[(player + 1) % players.length].gameChannel);

                                const cords = argument[0];
                                if (!cords) return msg.channel.send("Please enter cords for your attack. Ex: `D5`").then(m => m.delete({ timeout: 15000 }));
                                const directionRegex = /[a-z]([1-9]|10)/i;
                                if (!cords.match(directionRegex)) return msg.channel.send("Please enter valid cords for your attack. Ex: `D5`").then(m => m.delete({ timeout: 15000 }));

                                const returnData = this.attack(players[player].playerHitBoard, players[(player + 1) % players.length].playerShipBoard, { letter: cords[0], number: parseInt(cords.slice(1)), cord: cords });
                                if (!returnData) return msg.channel.send("You can't attack there, please try somewhere else!").then(m => m.delete({ timeout: 15000 }));

                                playerChannel.messages.cache.get(players[player].gameMessages.hits).edit(`Attack Board:\n${this.displayBoard(returnData.attackBoard, "hit")}`);
                                players[player].playerHitBoard = returnData.attackBoard;
                                opponentChannel.messages.cache.get(players[(player + 1) % players.length].gameMessages.boats).edit(`Ship Board:\n${this.displayBoard(returnData.shipBoard, "ship")}`);
                                players[(player + 1) % 2].playerShipBoard = returnData.shipBoard;

                                const shipToHit = players[(player + 1) % players.length].placedBoats.find(s => s.name.toLowerCase() === returnData.shipName.toLowerCase());
                                if (shipToHit) {
                                    shipToHit.hits++;
                                    if (shipToHit.hits === shipToHit.length) {
                                        shipToHit.sunk = true;
                                        players[player].member.send(`You sunk ${players[(player + 1) % players.length].member.user.tag}'s ${shipToHit.name}!`);
                                        players[(player + 1) % players.length].member.send(`Your ${returnData.shipName} was sunk!`);

                                        const embed = new MessageEmbed()
                                            .setTitle("Battle Ship Game <:submarine:753289857907818561>")
                                            .setFooter(`${challenger.user.tag} vs ${opponent.user.tag}`)
                                            .setColor(client.colors.noColor)  
                                        for (const p of players) {
                                            embed.addField(p.member.user.tag, `Has ${p.placedBoats.filter(b => !b.sunk).length} ships left!\n\n${p.placedBoats.map(b => b.sunk ? `❌ ${b.name.toProperCase()}` : `✅ ${b.name.toProperCase()}`).join("\n")}`);
                                        }
                                        trackMsg.edit(embed);
                                    }
                                }

                                if (this.winCondition(players[(player + 1) % players.length].placedBoats)) {
                                    for (const p of players) {
                                        p.collector.stop();
                                        p.member.send(`${players[player].member.user} won the game!`);
                                    }
                                    const embed = new MessageEmbed()
                                        .setTitle("Battle Ship Game <:submarine:753289857907818561>")
                                        .setFooter(`${challenger.user.tag} vs ${opponent.user.tag}`)
                                        .setColor(client.colors.noColor)  
                                        .setDescription(`${players[player].member.user} has won the game!`)
                                    trackMsg.edit(`${players[0].member}, ${players[1].member}`, embed);
                                }

                                playerChannel.messages.cache.get(players[player].gameMessages.start).edit(`It is now ${players[(player + 1) % players.length].member.user.tag}'s turn! Use \`${prefix}attack <cords>\` to call an attack on that spot!\n\nLegend:\n- Attack Board:\n--- ◻️ = Empty Spot\n--- ⚪ = Missed Attack\n--- 🔴 = Hit Attack\n- Ship Board:\n--- 🔲 = Empty Spot\n--- 🟩 = Unhit Ship\n--- 🟥 = Hit Ship\n--- ⚪ = Missed Opponent Shot`);
                                opponentChannel.messages.cache.get(players[(player + 1) % players.length].gameMessages.start).edit(`It is now ${players[(player + 1) % players.length].member.user.tag}'s turn! Use \`${prefix}attack <cords>\` to call an attack on that spot!\n\nLegend:\n- Attack Board:\n--- ◻️ = Empty Spot\n--- ⚪ = Missed Attack\n--- 🔴 = Hit Attack\n- Ship Board:\n--- 🔲 = Empty Spot\n--- 🟩 = Unhit Ship\n--- 🟥 = Hit Ship\n--- ⚪ = Missed Opponent Shot`);

                                player = (player + 1) % players.length;

                                players[player].member.send(`${players[player].member.user}`).then(m => m.delete());

                            }
                        } else return msg.channel.send("It isn't your turn yet. Please wait for the opponent to attack.").then(m => m.delete({ timeout: 10000 }));

                    } else return msg.channel.send("It looks like the opponent/you hasn't/haven't placed all their/your ships. Please either finish placing your ships or wait for your opponent to finish!").then(m => m.delete({ timeout: 10000 }));
                });
            }

        } else return accept.edit("Looks like they declined.");
    }

    private winCondition (boats: { name: string, length: number, hits: number, sunk: boolean }[]) {
        for (const playerBoat of boats) {
            if (!playerBoat.sunk) return false;
        }
        return true;
    }

    private attack(attackBoard: { data: string, ship: string, cords: { letter: string, number: number, cord: string } }[][], shipBoard: { data: string, ship: string, cords: { letter: string, number: number, cord: string } }[][], spot: { letter: string, number: number, cord: string }) {
        let shipName: string = "";
        for (let i = 0; i < shipBoard.length; i++) {
            const index = shipBoard[i].findIndex(data => data.cords.cord.toLowerCase() === spot.cord.toLowerCase());
            if (shipBoard[i].find(data => data.cords.cord.toLowerCase() === spot.cord.toLowerCase())) {
                // Missed attack
                if (shipBoard[i][index].data === "0") {
                    shipBoard[i][index].data = "3";
                    attackBoard[i][index].data = "1";
                // Successful attack
                } else if (shipBoard[i][index].data === "1") {
                    shipBoard[i][index].data = "2";
                    attackBoard[i][index].data = "2";
                    shipName = shipBoard[i][index].ship;
                } else return false;

            }
        }
        return { shipBoard, attackBoard, shipName };
    }

    private checkBoatPos(board: { data: string, ship: string, cords: { letter: string, number: number, cord: string } }[][], boat: { name: string, length: number, hits: number, sunk: boolean }, cords: { letter: string, number: number, cord: string }, dirrection: string, type: "check" | "render") {
        for (let i = 0; i < board.length; i++) {
            if (board[i].find(data => data.cords.cord.toLowerCase() === cords.cord.toLowerCase())) {
                switch (dirrection) {
                    case "up":
                        let countUp = 0;
                        let startPosUp = i;
                        do {
                            if (type === "check") {
                                if (board[startPosUp] === undefined) return;
                                if (board[startPosUp][cords.number - 1].data === "1") return;
                                countUp++;
                                startPosUp--;
                            } else {
                                board[startPosUp][cords.number - 1].data = "1";
                                board[startPosUp][cords.number - 1].ship = boat.name;
                                countUp++;
                                startPosUp--;
                            }
                        } while (countUp < boat.length);
                    break;
                    case "down":
                        let countDown = 0;
                        let startPosDown = i;
                        do {
                            if (type === "check") {
                                if (board[startPosDown] === undefined) return;
                                if (board[startPosDown][cords.number - 1].data === "1") return;
                                countDown++
                                startPosDown++;
                            } else {
                                board[startPosDown][cords.number - 1].data = "1";
                                board[startPosDown][cords.number - 1].ship = boat.name;
                                countDown++
                                startPosDown++;
                            }
                        } while (countDown < boat.length);
                    break;
                    case "left":
                        let countLeft = 0;
                        let currIndexLeft = board[i].findIndex(data => data.cords.cord.toLowerCase() === cords.cord.toLowerCase());
                        do {
                            if (type === "check") {
                                currIndexLeft--;
                                if (board[i][currIndexLeft] === undefined) return;
                                if (board[i][currIndexLeft].data === "1") return;
                                countLeft++;
                            } else {
                                board[i][currIndexLeft].data = "1";
                                board[i][currIndexLeft].ship = boat.name;
                                currIndexLeft--;
                                countLeft++;
                            }
                        } while (countLeft < boat.length);
                    break;
                    case "right":
                        let countRight = 0;
                        let currIndexRight = board[i].findIndex(data => data.cords.cord.toLowerCase() === cords.cord.toLowerCase());
                        do {
                            if (type === "check") {
                                currIndexRight++;
                                if (board[i][currIndexRight] === undefined) return;
                                if (board[i][currIndexRight].data === "1") return;
                                countRight++;
                            } else {
                                board[i][currIndexRight].data = "1";
                                board[i][currIndexRight].ship = boat.name;
                                currIndexRight++;
                                countRight++;
                            }
                        } while (countRight < boat.length);
                    break;
                }
            }
        }
        return { boat, board };
    }

    private genBoard(hor: number, ver: number) {
        let whileCounter = 0;
        const boardLetter = [ { i: 0, letter: "A" }, { i: 1, letter: "B" }, { i: 2, letter: "C" }, { i: 3, letter: "D" }, { i: 4, letter: "E" }, { i: 5, letter: "F" }, { i: 6, letter: "G" }, { i: 7, letter: "H" }, { i: 8, letter: "I" }, { i: 9, letter: "J" } ];
        const doneData: { data: string, ship: string, cords: { letter: string, number: number, cord: string } }[][] = [];
        do {
            const temp: { data: string, ship: string, cords: { letter: string, number: number, cord: string } }[] = [];
            for (let i = 0; i < ver; i++) {
                const boardLttr = boardLetter.find(data => data.i === whileCounter).letter;
                temp.push({ data: "0", ship: "", cords: { letter: boardLttr, number: i + 1, cord: boardLttr + (i + 1) } });
            }
            doneData.push(temp);
            whileCounter++;
        } while (whileCounter < hor);
        return doneData;
    }

    private displayBoard(board: { data: string, ship: string, cords: { letter: string, number: number, cord: string } }[][], type: "hit" | "ship") {
        let returnData = "";
        returnData = returnData.concat("⬛1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟\n");
        for (let i = 0; i < board.length; i++) {
            let temp = "";
            const leftEmoji = [ { i: 0, emoji: ":regional_indicator_a:" }, { i: 1, emoji: ":regional_indicator_b:" }, { i: 2, emoji: ":regional_indicator_c:" }, { i: 3, emoji: ":regional_indicator_d:" }, { i: 4, emoji: ":regional_indicator_e:" }, { i: 5, emoji: ":regional_indicator_f:" }, { i: 6, emoji: ":regional_indicator_g:" }, { i: 7, emoji: ":regional_indicator_h:" }, { i: 8, emoji: ":regional_indicator_i:" }, { i: 9, emoji: ":regional_indicator_j:" } ]
            if (type === "hit") {
                for (let j = 0; j < board[i].length; j++) {
                    // "0" is an empty space, "1" is a missed shot, "2" is a hit shot
                    temp += `${board[i][j].data === "0" ? "◻️" : board[i][j].data === "1" ? "⚪" : "🔴" }`;
                }
            } else {
                for (let j = 0; j < board[i].length; j++) {
                    // "0" is an empty space, "1" is a unhit ship piece, "2" is a hit ship piece, "3" is a missed shot from opponent
                    temp += `${board[i][j].data === "0" ? "◻️" : board[i][j].data === "1" ? "🟩" : board[i][j].data === "2" ? "🟥" : "⚪" }`;
                }
            }
            returnData += leftEmoji.find(object => object.i === i).emoji + temp + "\n";
        }
        return returnData;
    }
}