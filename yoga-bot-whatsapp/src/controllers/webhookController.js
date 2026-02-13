const config = require('../config/config');
const chatService = require('../services/chatService');
const whatsappService = require('../services/whatsappService');
const { exec } = require('child_process');
const fs = require('fs');

class WebhookController {
    async handleWebhook(req, res) {
        const body = req.body;
        console.log("Webhook received:", JSON.stringify(body, null, 2));

        try {
            if (
                body.object &&
                body.entry &&
                body.entry[0].changes &&
                body.entry[0].changes[0].value.messages
            ) {
                const message = body.entry[0].changes[0].value.messages[0];
                const userNumber = message.from;
                const text = message.text?.body || '';
                const senderId = userNumber.replace('@c.us', '');

                console.log(`Message from ${userNumber}: ${text}`);

                // Block if sender is not in whitelist
                if (!config.ALLOWED_SENDERS.includes(senderId)) {
                    console.log(`🚫 Blocked message from unauthorized sender: ${senderId}`);
                    return res.sendStatus(200);
                }

                // Handle voice messages
                if (message.type === 'audio' || message.type === 'voice') {
                    await this._handleVoiceMessage(message, userNumber, senderId);
                    return res.sendStatus(200);
                }

                // Handle text messages
                await this._handleTextMessage(text, userNumber, senderId);
            }

            res.sendStatus(200);
        } catch (err) {
            console.error("Error handling message:", err);
            res.sendStatus(500);
        }
    }

    async _handleVoiceMessage(message, userNumber, senderId) {
        const mediaId = message.audio?.id || message.voice?.id;
        if (!mediaId) {
            await whatsappService.sendMessage(userNumber, '❌ Failed to process voice message.');
            return;
        }

        try {
            const audioBuffer = await whatsappService.downloadMedia(mediaId);
            const filename = `./audio/${Date.now()}.ogg`;
            fs.writeFileSync(filename, audioBuffer);

            const audioPath = filename.replace('.ogg', '.wav');
            await new Promise((resolve, reject) => {
                exec(`ffmpeg -y -i ${filename} -ar 16000 -ac 1 ${audioPath}`, async (err) => {
                    if (err) {
                        console.error('FFmpeg error:', err);
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });

            try {
                const userMessage = await this._transcribeWithWhisper(audioPath, chatService.getLanguage(senderId));
                const menuOptions = config.SUPPORTED_LANGUAGES[chatService.getLanguage(senderId)].menuOptions;
                await whatsappService.sendMessage(userNumber, `${menuOptions.youSaid} ${userMessage}`);
                if (userMessage && userMessage !== '') {
                    await chatService.handleChat(userMessage, userNumber, senderId);
                }
            } catch (err) {
                await whatsappService.sendMessage(userNumber, err.toString());
            } finally {
                // Clean up audio files
                fs.unlinkSync(filename);
                fs.unlinkSync(audioPath);
            }
        } catch (error) {
            console.error('Error processing voice message:', error);
            await whatsappService.sendMessage(userNumber, '❌ Failed to process voice message.');
        }
    }

    async _handleTextMessage(text, userNumber, senderId) {
        // First check if language is set
        if (!chatService.hasLanguage(senderId)) {
            if (config.SUPPORTED_LANGUAGES[text]) {
                chatService.setLanguage(senderId, text);
                const successMsg = text === 'hin' 
                    ? '✅ आपकी भाषा हिंदी सेट कर दी गई है। अब आप चैट शुरू कर सकते हैं!'
                    : '✅ Language set to English. You can start chatting now!';
                await whatsappService.sendMessage(userNumber, successMsg);
                return;
            } else {
                await chatService.showLanguageMenu(userNumber);
                return;
            }
        }

        // Handle menu options
        const currentLang = chatService.getLanguage(senderId);
        const menuOptions = config.SUPPORTED_LANGUAGES[currentLang].menuOptions;
        const command = text.toLowerCase().trim();

        if (command === '1' || command === menuOptions.startNewSession.toLowerCase()) {
            chatService.startNewSession(senderId);
            await chatService.showLanguageMenu(userNumber);
            return;
        }

        if (command === 'm' || command === menuOptions.mainMenu.toLowerCase()) {
            await whatsappService.sendMessage(userNumber, menuOptions.options);
            return;
        }

        if (command === '2' || command === menuOptions.history.toLowerCase()) {
            const history = chatService.getHistory(senderId);
            if (history.length === 0) {
                await whatsappService.sendMessage(userNumber, menuOptions.noHistory);
                return;
            }

            let historyText = menuOptions.historyTitle;
            history.forEach((entry, i) => {
                historyText += `\n${menuOptions.userPrefix} ${entry.user}\n${menuOptions.botName} ${entry.bot}\n`;
            });

            await whatsappService.sendMessage(userNumber, historyText.slice(0, 4000));
            return;
        }

        if (command === '3' || command === menuOptions.changeLanguage.toLowerCase()) {
            chatService.startNewSession(senderId);
            await chatService.showLanguageMenu(userNumber);
            return;
        }

        // Handle regular chat
        if (text && text !== '') {
            await chatService.handleChat(text, userNumber, senderId);
        }
    }

    async _transcribeWithWhisper(audioPath, language) {
        // Implement your transcription logic here
        // This is a placeholder - you'll need to implement the actual transcription
        return "Transcribed text";
    }
}

module.exports = new WebhookController(); 