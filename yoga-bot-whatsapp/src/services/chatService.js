const http = require('http');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const whatsappService = require('./whatsappService');
const ttsService = require('./ttsService');
const { processMarkdown, extractProductInfo } = require('../utils/textUtils');

class ChatService {
    constructor() {
        this.sessionMap = new Map(); // senderId => sessionId
        this.historyMap = new Map(); // senderId => [{ user, bot }]
        this.languageMap = new Map(); // senderId => language code
    }

    async handleChat(userMessage, userNumber, senderId) {
        const sessionId = this.sessionMap.get(senderId);
        const language = this.languageMap.get(senderId);
        const apiUrl = new URL(`${config.API_BASE_URL}/v1/chat/message`);
        apiUrl.searchParams.append('message', userMessage);
        apiUrl.searchParams.append('session_id', sessionId);
        
        const options = {
            method: 'POST',
            headers: {
                Accept: 'text/event-stream',
            },
        };

        const req = http.request(apiUrl, options, async res => {
            let fullText = '';
            res.on('data', chunk => {
                fullText += chunk.toString();
            });

            res.on('end', async () => {
                if (!fullText) {
                    await whatsappService.sendMessage(userNumber, '⚠️ No response from backend.');
                    return;
                }

                const { products, remainingText } = extractProductInfo(fullText, language);
                
                if (products.length > 0) {
                    await this._handleProductResponse(products, remainingText, userNumber, language);
                } else {
                    await this._handleRegularResponse(fullText, userMessage, userNumber, senderId, language);
                }
            });
        });

        req.on('error', async err => {
            console.error('❗ API request failed:', err);
            await whatsappService.sendMessage(userNumber, '🚨 Failed to connect to backend.');
        });

        req.end();
    }

    async _handleProductResponse(products, remainingText, userNumber, language) {
        const introText = remainingText.split('\n\n')[0] + '\n\n';
        await whatsappService.sendMessage(userNumber, introText);

        for (const product of products) {
            try {
                const response = await fetch(product.imageUrl);
                const imageBuffer = await response.buffer();
                
                const priceLabel = language === 'hin' ? 'कीमत' : 'Price';
                const caption = `*${product.name}*\n${priceLabel}: ₹${product.price}\n${product.link}`;
                
                await whatsappService.sendImage(userNumber, imageBuffer, caption);
            } catch (error) {
                console.error('Error sending product image:', error);
                const priceLabel = language === 'hin' ? 'कीमत' : 'Price';
                await whatsappService.sendMessage(userNumber, `*${product.name}*\n${priceLabel}: ₹${product.price}\n${product.link}`);
            }
        }

        let closingText = remainingText;
        if (!closingText) {
            closingText = language === 'hin' 
                ? "\nक्या आप इन विकल्पों के बारे में अधिक जानकारी चाहते हैं या कुछ और सहायता चाहिए?\n\n👉 मुख्य मेनू के लिए *M* टाइप करें"
                : "\nWould you like more information on these options or assistance with something else?\n\n👉 Type *M* for Main Menu";
        } else {
            const menuOption = language === 'hin'
                ? "\n\n👉 मुख्य मेनू के लिए *M* टाइप करें"
                : "\n\n👉 Type *M* for Main Menu";
            closingText += menuOption;
        }

        closingText = processMarkdown(closingText);
        await whatsappService.sendMessage(userNumber, closingText);
    }

    async _handleRegularResponse(fullText, userMessage, userNumber, senderId, language) {
        const formattedText = processMarkdown(fullText);

        // Save to history
        const history = this.historyMap.get(senderId) || [];
        history.push({ user: userMessage, bot: fullText });
        this.historyMap.set(senderId, history);

        try {
            const reply = `${formattedText}\n\n👉 Type *M* for Main Menu`;
            await whatsappService.sendMessage(userNumber, reply.slice(0, 4000));

            const audioFile = await ttsService.getTTSAudio(fullText, language);
            const oggFile = await ttsService.convertToOgg(audioFile);
            await whatsappService.sendAudio(userNumber, oggFile);
            
            // Clean up audio files
            fs.unlinkSync(audioFile);
            fs.unlinkSync(oggFile);
        } catch (error) {
            console.error('Error generating audio response:', error);
        }
    }

    async showLanguageMenu(userNumber) {
        let menuText = "Namaste!\n";
        menuText += "नमस्ते!\n\n";
        
        menuText += "Please choose your preferred language:\n";
        menuText += "कृपया अपनी पसंदीदा भाषा चुनें:\n\n";
        
        Object.entries(config.SUPPORTED_LANGUAGES).forEach(([code, lang]) => {
            const hindiNames = {
                'eng': 'English',
                'hin': 'हिंदी'
            };
            menuText += `•  ${code} – ${hindiNames[code]}\n`;
        });
        
        menuText += "\n👉 Type the language code to continue (e.g., eng for English)\n";
        menuText += "👉 जारी रखने के लिए भाषा कोड टाइप करें (जैसे, hin हिंदी के लिए)";
        
        await whatsappService.sendMessage(userNumber, menuText);
    }

    setLanguage(senderId, language) {
        this.languageMap.set(senderId, language);
        if (!this.sessionMap.has(senderId)) {
            this.sessionMap.set(senderId, uuidv4());
        }
    }

    startNewSession(senderId) {
        const newSession = uuidv4();
        this.sessionMap.set(senderId, newSession);
        this.historyMap.set(senderId, []);
        this.languageMap.delete(senderId);
    }

    getHistory(senderId) {
        return this.historyMap.get(senderId) || [];
    }

    getLanguage(senderId) {
        return this.languageMap.get(senderId);
    }

    hasLanguage(senderId) {
        return this.languageMap.has(senderId);
    }
}

module.exports = new ChatService(); 