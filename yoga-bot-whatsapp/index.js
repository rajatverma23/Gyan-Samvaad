const { Client } = require('whatsapp-web.js');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const { exec } = require('child_process');
const { MessageMedia, LocalAuth, Buttons } = require('whatsapp-web.js');
const express = require('express');
const { Server } = require('socket.io');
const qrcode = require('qrcode');
const path = require('path');
const fetch = require('node-fetch');
const qrcodeTerminal = require('qrcode-terminal');
const FormData = require('form-data');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { path: '/whatsapp/socket.io' });
const Sanscript = require('@indic-transliteration/sanscript');


// ==================== CONFIGURATION ====================

// TTS Speed Control (0.5 = slow, 1.0 = normal, 1.5 = fast)
// === TTS CONFIGURATION ===
const TTS_CONFIG = {
    // Default speeds
    defaultSpeed: {
        eng: 1.0,
        hin: 1.0
    },
    
    // Speed limits
    minSpeed: 0.5,
    maxSpeed: 2.0,
    
    // Silence padding
    silenceDuration: 0.0, 
    
    // Parallel processing
    enableParallel: true,
};

const SILENCE_PADDING_SECONDS = TTS_CONFIG.silenceDuration;

// Constant Main Menu
const MAIN_MENU =
`📋 *Main Menu*

1️⃣ Start New Session
2️⃣ View Chat History
3️⃣ Change Language

✍️ Reply with 1, 2, or 3`;


// ✅ Load reference audio files at startup
const REF_AUDIO_HINDI_BASE64 = fs.readFileSync(
    './Hin_F_Agri_000.txt',
    'utf8'
).trim();

const REF_AUDIO_ENGLISH_BASE64 = fs.readFileSync(
    './Mar_F_Eng_Day11_018.txt',
    'utf8'
).trim();

// IAST word-level conversion
function containsIAST(text) {
    return /[āīūṛṝṅñṭḍṇśṣḥĀĪŪṚṜṄÑṬḌṆŚṢḤ]/.test(text);
}

// ==================== AUDIO SPEED ADJUSTMENT ====================

/**
 * Adjust audio playback speed using FFmpeg
 * @param {string} inputFile - Path to input audio file
 * @param {number} speed - Speed multiplier (0.5-2.0)
 * @returns {Promise<string>} - Path to speed-adjusted audio file
 */
async function adjustAudioSpeed(inputFile, speed = 1.0) {
    // If speed is 1.0, no adjustment needed
    if (speed === 1.0) {
        return inputFile;
    }

    // Clamp speed to valid range
    const clampedSpeed = Math.max(0.5, Math.min(2.0, speed));
    
    if (clampedSpeed !== speed) {
        console.log(`⚠️ Speed ${speed} out of range, clamped to ${clampedSpeed}`);
    }

    const outputFile = inputFile.replace(/\.wav$/, `_speed${clampedSpeed}.wav`);
    
    try {
        console.log(`🎛️ Adjusting audio speed to ${clampedSpeed}x...`);
        
        // FFmpeg atempo filter changes speed without changing pitch
        // atempo range is 0.5-2.0, perfect for our needs
        await new Promise((resolve, reject) => {
            exec(
                `ffmpeg -y -i "${inputFile}" -filter:a "atempo=${clampedSpeed}" -vn "${outputFile}"`,
                (err, stdout, stderr) => {
                    if (err) {
                        console.error('FFmpeg speed adjustment error:', stderr);
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });

        console.log(`✅ Speed-adjusted audio created: ${outputFile}`);
        
        // Delete original file to save space
        if (fs.existsSync(inputFile)) {
            fs.unlinkSync(inputFile);
            console.log(`🗑️ Deleted original: ${inputFile}`);
        }
        
        return outputFile;

    } catch (error) {
        console.error(`❌ Speed adjustment failed:`, error.message);
        // Return original file if speed adjustment fails
        console.log(`⚠️ Returning original file due to speed adjustment failure`);
        return inputFile;
    }
}

/**
 * Advanced speed adjustment for extreme values (uses chained atempo filters)
 * For speeds outside 0.5-2.0 range (if needed in future)
 */
async function adjustAudioSpeedAdvanced(inputFile, speed) {
    if (speed >= 0.5 && speed <= 2.0) {
        return adjustAudioSpeed(inputFile, speed);
    }

    const outputFile = inputFile.replace(/\.wav$/, `_speed${speed}.wav`);
    
    // Chain multiple atempo filters for extreme speeds
    // Example: 3.0x = atempo=1.5,atempo=2.0
    let atempoChain = '';
    let remainingSpeed = speed;
    
    while (remainingSpeed > 2.0) {
        atempoChain += 'atempo=2.0,';
        remainingSpeed /= 2.0;
    }
    
    while (remainingSpeed < 0.5) {
        atempoChain += 'atempo=0.5,';
        remainingSpeed /= 0.5;
    }
    
    atempoChain += `atempo=${remainingSpeed.toFixed(2)}`;
    
    try {
        await new Promise((resolve, reject) => {
            exec(
                `ffmpeg -y -i "${inputFile}" -filter:a "${atempoChain}" -vn "${outputFile}"`,
                (err) => err ? reject(err) : resolve()
            );
        });
        
        if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
        return outputFile;
        
    } catch (error) {
        console.error('Advanced speed adjustment failed:', error);
        return inputFile;
    }
}

function convertIASTWordsOnly(text) {
    if (!text) return text;

    // Match words containing IAST diacritics
    const IAST_WORD_REGEX = /\b[\wāīūṛṝṅñṭḍṇśṣḥĀĪŪṚṜṄÑṬḌṆŚṢḤ]+\b/g;

    return text.replace(IAST_WORD_REGEX, (word) => {
        // Only convert if it actually contains IAST chars
        if (containsIAST(word)) {
            console.log(word + '\n')
            return Sanscript.t(word, 'iast', 'itrans');
        }
        return word;
    });
}

// filter Emogis
function removeEmojis(text) {
    if (!text) return text;

    return text.replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
        ''
    );
}

// PREPROCESSING HELPER FUNCTIONS FOR TTS
function convertNumbersToWords(text, language) {
    if (!text) return text;

    // ---------- ENGLISH ----------
    const EN_ONES = ["zero","one","two","three","four","five","six","seven","eight","nine"];
    const EN_TEENS = ["ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
    const EN_TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

    function englishNumber(n) {

    // ✅ YEAR HANDLING (2000–2099)
    if (n >= 2000 && n <= 2099) {
    const first = Math.floor(n / 100); // 20
    const last = n % 100;              // 14
    return englishNumber(first) + (last ? " " + englishNumber(last) : "");
    }

    if (n < 10) return EN_ONES[n];
    if (n < 20) return EN_TEENS[n - 10];
    if (n < 100)
        return EN_TENS[Math.floor(n / 10)] + (n % 10 ? " " + EN_ONES[n % 10] : "");
    if (n < 1000)
        return EN_ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + englishNumber(n % 100) : "");
    return n.toString();
    }


    // ---------- HINDI ----------
    const HI_MAP = {
        0:"शून्य",1:"एक",2:"दो",3:"तीन",4:"चार",5:"पाँच",6:"छह",7:"सात",8:"आठ",9:"नौ",
        10:"दस",11:"ग्यारह",12:"बारह",13:"तेरह",14:"चौदह",15:"पंद्रह",16:"सोलह",17:"सत्रह",
        18:"अठारह",19:"उन्नीस",20:"बीस",21:"इक्कीस",22:"बाईस",23:"तेईस",24:"चौबीस",
        25:"पच्चीस",26:"छब्बीस",27:"सत्ताईस",28:"अट्ठाईस",29:"उनतीस",
        30:"तीस",31:"इकतीस",32:"बत्तीस",33:"तैंतीस",34:"चौंतीस",35:"पैंतीस",
        36:"छत्तीस",37:"सैंतीस",38:"अड़तीस",39:"उनतालीस",
        40:"चालीस",41:"इकतालीस",42:"बयालीस",43:"तैंतालीस",44:"चवालीस",
        45:"पैंतालीस",46:"छियालीस",47:"सैंतालीस",48:"अड़तालीस",49:"उनचास",
        50:"पचास",51:"इक्यावन",52:"बावन",53:"तिरेपन",54:"चौवन",55:"पचपन",
        56:"छप्पन",57:"सत्तावन",58:"अट्ठावन",59:"उनसठ",
        60:"साठ",61:"इकसठ",62:"बासठ",63:"तिरेसठ",64:"चौंसठ",
        65:"पैंसठ",66:"छियासठ",67:"सड़सठ",68:"अड़सठ",69:"उनहत्तर",
        70:"सत्तर",71:"इकहत्तर",72:"बहत्तर",73:"तिहत्तर",74:"चौहत्तर",
        75:"पचहत्तर",76:"छिहत्तर",77:"सतहत्तर",78:"अठहत्तर",79:"उनासी",
        80:"अस्सी",81:"इक्यासी",82:"बयासी",83:"तिरासी",84:"चौरासी",
        85:"पचासी",86:"छियासी",87:"सत्तासी",88:"अठासी",89:"नवासी",
        90:"नब्बे",91:"इक्यानवे",92:"बानवे",93:"तिरानवे",94:"चौरानवे",
        95:"पचानवे",96:"छियानवे",97:"सत्तानवे",98:"अट्ठानवे",99:"निन्यानवे"
    };

    function hindiNumber(n) {
        if (n < 100) return HI_MAP[n];
        if (n < 1000)
            return HI_MAP[Math.floor(n / 100)] + " सौ" + (n % 100 ? " " + hindiNumber(n % 100) : "");
        return n.toString();
    }

    // ✅ SAFE replacement (preserves spaces!)
    return text.replace(/(\s*)\b(\d+)\b(\s*)/g, (match, pre, num, post) => {
        const n = parseInt(num, 10);
        if (isNaN(n)) return match;

        const word = language === "hin"
            ? hindiNumber(n)
            : englishNumber(n);

        return `${pre}${word}${post}`;
    });
}

function expandAbbreviations(text, language) {
    if (!text) return '';
    
    // Different abbreviations for each language
    const abbreviations = language === 'hin' ? {
        'डॉ.': 'डॉक्टर',
        'श्री': 'श्रीमान',
        'कि.मी.': 'किलोमीटर',
        'कि.ग्रा.': 'किलोग्राम'
    } : {  // English abbreviations
        'Dr.': 'Doctor',
        'Mr.': 'Mister',
        'Mrs.': 'Misses',
        'km': 'kilometers',
        'kg': 'kilograms'
    };
    
    // Apply the correct language abbreviations
    let result = text;
    Object.entries(abbreviations).forEach(([abbr, full]) => {
        const regex = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        result = result.replace(regex, full);
    });
    
    return result;
}


// Supported languages configuration
// API endpoints extracted from test notebooks
const SUPPORTED_LANGUAGES = {
    'eng': {
        name: 'English',
        // ASR Config - from test_english_asr.ipynb
        asrEndpoint: 'http://10.8.1.100:8083/predictions/whisper_asr',
        asrMethod: 'raw_audio', // Send raw audio bytes
        // TTS-English Config
        ttsEndpoint: 'https://822d-65-1-235-80.ngrok-free.app/v1/tts',
        ttsLang: 'en',
        ttsRefText: 'This needs to be done according to International agreements.',
        ttsRefAudioFile: 'Mar_F_Eng_Day11_018.wav',
        menuOptions: {
            languageSelection: '🌐 *Welcome!*\n\nPlease select your language first:\n\n',
            startNewSession: 'Start New Session',
            history: 'View Chat History',
            changeLanguage: 'Change Language',
            noHistory: '📭 No history available for this session.',
            historyTitle: '🕘 *Chat History:*\n',
            youSaid: '🗣 *You said:*',
            botName: '*Gyan Samvaad:*',
            userPrefix: '*You:*',
            mainMenu: '📋 Main Menu',
            options: MAIN_MENU
        }
    },
    'hin': {
        name: 'Hindi',
        // ASR Config - from test_hindi_asr.ipynb
        asrEndpoint: 'http://10.8.1.100:8012/transcribe',
        asrMethod: 'multipart', // Send as multipart form-data
        // TTS Config - from hindi_tts.ipynb
        ttsEndpoint: 'https://822d-65-1-235-80.ngrok-free.app/v1/tts',
        ttsLang: 'hi',
        ttsRefText: 'कार्रवाई करने का समय अब है, इससे पहले कि इन गायब हो रहे और कीड़ों की फुसफुसाहट मौन हो जाए।',
        ttsRefAudioFile: 'Hin_F_Agri_000.wav',
        menuOptions: {
            languageSelection: '🌐 *नमस्ते!*\n\nकृपया पहले अपनी भाषा चुनें:\n\n',
            startNewSession: 'नया सत्र शुरू करें',
            history: 'चैट इतिहास देखें',
            changeLanguage: 'भाषा बदलें',
            noHistory: '📭 इस सत्र के लिए कोई इतिहास उपलब्ध नहीं है।',
            historyTitle: '🕘 *चैट इतिहास:*\n',
            youSaid: '🗣 *आपने कहा:*',
            botName: '*ज्ञान संवाद:*',
            userPrefix: '*आप:*',
            mainMenu: '📋 मुख्य मेनू',
            options: MAIN_MENU
        }
    }
};

// List of allowed sender IDs (include the WhatsApp suffix)
const ALLOWED_SENDERS = [
    '916393266647@c.us',
    '918292353893@c.us',
    '918454992911@c.us',
    '919381847160@c.us',
    '918454991618@c.us',
    '918058279067@c.us',
    '917387710353@c.us',
    '919923423577@c.us',
    '919619847728@c.us',
    '918104788760@c.us',
    '916377967485@c.us',
    '918581816866@c.us',
    '918587059090@c.us',
    '918210599514@c.us',
    '919765495056@c.us',
    '919619952004@c.us'
];

// For ubuntu System
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        timeout: 60000
    }
});

function mapLanguageForApi(langCode) {
    switch (langCode) {
        case 'hin':
            return 'Hindi';
        case 'eng':
        default:
            return 'English';
    }
}

// Maps to maintain sessions, chat history, and language preferences
const sessionMap = new Map(); // senderId => sessionId
const historyMap = new Map(); // senderId => [{ user, bot }]
const languageMap = new Map(); // senderId => language code

// Generate QR code for WhatsApp login
client.on('qr', async qr => {
    try {
        console.log('📱 Scan the QR code below to log in:\n');

        // ✅ Render QR code directly in terminal
        qrcodeTerminal.generate(qr, {
            small: true
        });

        // Keep browser QR support if needed
        const qrDataUrl = await qrcode.toDataURL(qr);
        io.emit('qr', qrDataUrl);

    } catch (err) {
        console.error('Failed to generate QR code:', err);
    }
});

client.on('ready', () => {
    console.log('✅ WhatsApp Client is ready!');
    io.emit('ready');
});

// Function to show language selection menu
async function showLanguageMenu(message) {
    const menuText =
`🌐 *Choose Language | भाषा चुनें*

eng — English
hin — हिंदी

✍️ Type: eng or hin`;

    await client.sendMessage(message.from, menuText);
}

// Greetings according to Language Specific
async function sendGreeting(message, lang) {
    let text;

    if (lang === 'eng') {
        text =
`🙏 Namaste.
I am Jñāna Saṃvāda, a conversational assistant for interacting with Yoga-related Gyan Bharatam Manuscripts, powered by BharatGen foundational large language models.

Gyan Bharatam is a national initiative focused on the preservation, digitization, and knowledge dissemination of India’s manuscript heritage.
BharatGen is India’s sovereign government-backed multilingual and multimodal AI initiative.

Atha yogānuśāsanam — Now begins the exposition of Yoga.

✍️ Please type or ask one of the following questions to begin:

1. How can the mind be effectively calmed?
2. Which yogāsana helps in relieving fatigue?
3. Which foods should be avoided for good health?
4. Which foods promote overall health?
5. How is success defined in Yoga Textbooks?`;
    } else {
        text =
`🙏 नमस्ते।

मैं ज्ञान संवाद हूँ, जो भारतजेन के मूलभूत बड़े भाषा मॉडल द्वारा संचालित, योग से संबंधित ज्ञान भारतम पांडुलिपियों के साथ संवाद करने में सहायक है।

ज्ञान भारतम भारत की पांडुलिपि विरासत के संरक्षण, डिजिटलीकरण और ज्ञान प्रसार पर केंद्रित एक राष्ट्रीय पहल है।
भारतजेन भारत की संप्रभु सरकार द्वारा समर्थित बहुभाषी और बहुआयामी एआई पहल है।

अथ योगानुशासनम् — अब योग का परिचय प्रारंभ होता है।

✍️ कृपया प्रारंभ करने के लिए निम्नलिखित प्रश्नों में से कोई एक टाइप करें या पूछें:

1. मन को प्रभावी ढंग से शांत कैसे किया जा सकता है?
2. कौन सा योगासन थकान दूर करने में सहायक है?
3. अच्छे स्वास्थ्य के लिए किन खाद्य पदार्थों से परहेज करना चाहिए?
4. कौन से खाद्य पदार्थ समग्र स्वास्थ्य को बढ़ावा देते हैं?
5. योग में सफलता को कैसे परिभाषित किया जाता है?`;}

    text += `\n\n👉 Type *M* for Main Menu`;

    await client.sendMessage(message.from, text);

    // 2️⃣ Generate greeting TTS
    // try {
    //     const audioFile = await getTTSAudio(text, lang);
    //     if (!audioFile) return;

    //     const oggFile = audioFile.replace(/\.wav$/, '.ogg');

    //     await new Promise((resolve, reject) => {
    //         exec(`ffmpeg -y -i "${audioFile}" -c:a libopus "${oggFile}"`,
    //             err => err ? reject(err) : resolve()
    //         );
    //     });

    //     const media = MessageMedia.fromFilePath(oggFile);
    //     await client.sendMessage(message.from, media);

    //     fs.unlinkSync(audioFile);
    //     fs.unlinkSync(oggFile);

    // } catch (err) {
    //     console.error('Greeting TTS failed:', err.message);
    // }
}

// ==================== SILENCE GENERATION ====================

/**
 * Generate a silent audio file
 * @param {number} durationSeconds - Duration of silence in seconds
 * @returns {Promise<string>} - Path to generated silence file
 */
async function generateSilence(durationSeconds = SILENCE_PADDING_SECONDS) {
    const silenceFile = `./audio/silence_${Date.now()}.wav`;
    
    return new Promise((resolve, reject) => {
        // Generate silence: 16kHz, mono, specified duration
        exec(
            `ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t ${durationSeconds} -q:a 9 -acodec pcm_s16le "${silenceFile}"`,
            (err) => {
                if (err) {
                    console.error('Failed to generate silence:', err);
                    reject(err);
                } else {
                    console.log(`✅ Generated ${durationSeconds}s silence: ${silenceFile}`);
                    resolve(silenceFile);
                }
            }
        );
    });
}

// Handle incoming messages
client.on('message', async message => {
    const senderId = message.from;
    const userMessage = message.body.trim();
    const command = userMessage.toLowerCase();
    let currentLang = languageMap.get(senderId);

    // Special case for testing message
    if (userMessage.toLowerCase() === 'testing') {
        const testResponse = 'Here are some good varieties of onion seeds available near Pune:\n\n1. **Small onion seeds for farming, High germination rate (100 seeds)**\n   - Price: ₹140\n   - [Product Link](https://www.google.co.in/shopping/product/1?gl=in&prds=pid:10376731176755645053)\n   - ![Thumbnail](https://serpapi.com/searches/682b00f8e3e1765d0320e5b7/images/7d3b2c9c1433060cb09ffb208d44fb3b9a32e76428e555b06c903dff3e91905a.webp)\n\n2. **Sbgarden Onion Seeds Pyaaj Beej**\n   - Price: ₹149\n   - [Product Link](https://www.google.co.in/shopping/product/1?gl=in&prds=pid:8787756527706170718)\n   - ![Thumbnail](https://serpapi.com/searches/682b00f8e3e1765d0320e5b7/images/7d3b2c9c1433060cb09ffb208d44fb3b33a5a110c9577a00319e1be5c8d772c7.webp)\n\n3. **Onion Seeds**\n   - Price: ₹80\n   - [Product Link](https://www.google.co.in/shopping/product/1?gl=in&prds=pid:383730097993840986)\n   - ![Thumbnail](https://serpapi.com/searches/682b00f8e3e1765d0320e5b7/images/7d3b2c9c1433060cb09ffb208d44fb3b0b12b5488ec4cec567e5de2e2c1fe226.webp)\n\nWould you like more information on these options or assistance with something else?';
        
        // Extract product information using regex
        const productRegex = /\*\*(.*?)\*\*\n\s*-\s*Price:\s*₹(\d+)\n\s*-\s*\[Product Link\]\((.*?)\)\n\s*-\s*!\[Thumbnail\]\((.*?)\)/g;
        const products = [];
        let match;
        
        while ((match = productRegex.exec(testResponse)) !== null) {
            products.push({
                name: match[1],
                price: match[2],
                link: match[3],
                imageUrl: match[4]
            });
        }

        // Send text introduction
        const introText = "Here are some good varieties of onion seeds available near Pune:\n\n";
        await client.sendMessage(message.from, introText);

        // Send each product as an image with caption
        for (const product of products) {
            try {
                // Download image
                const response = await fetch(product.imageUrl);
                const imageBuffer = await response.buffer();
                
                // Create media object with proper mime type and base64 data
                const media = new MessageMedia(
                    'image/jpeg',
                    imageBuffer.toString('base64'),
                    'product.jpg'
                );

                // Create caption with product info
                const caption = `*${product.name}*\nPrice: ₹${product.price}\n${product.link}`;

                // Send image with caption
                await client.sendMessage(message.from, media, { caption });
            } catch (error) {
                console.error('Error sending product image:', error);
                // Fallback to text-only if image fails
                await client.sendMessage(message.from, `*${product.name}*\nPrice: ₹${product.price}\n${product.link}`);
            }
        }

        // Send closing message
        const closingText = "\nWould you like more information on these options or assistance with something else?\n\n👉 Type *M* for Main Menu";
        await client.sendMessage(message.from, closingText);

        // Save to history
        const history = historyMap.get(senderId) || [];
        history.push({ user: userMessage, bot: testResponse });
        historyMap.set(senderId, history);

        // Emit bot response
        io.emit('message', {
            from: 'bot',
            text: testResponse,
            timestamp: new Date().toISOString()
        });

        return;
    }

    // ❌ Uncomment to enable whitelist
    // if (!ALLOWED_SENDERS.includes(senderId)) {
    //     console.log(`🚫 Blocked message from unauthorized sender: ${senderId}`);
    //     return;
    // }

    // === NEW: Speed control command ===
    // Log metadata
    console.log({
        id: message.id._serialized,
        from: message.from,
        body: message.body,
        type: message.type,
        timestamp: message.timestamp,
        hasMedia: message.hasMedia,
    });

    // ✅ Check language FIRST
    if (!currentLang) {
        if (command === 'eng' || command === 'hin') {
            languageMap.set(senderId, command);
            sessionMap.set(senderId, uuidv4());
            await sendGreeting(message, command);
        } else {
            await showLanguageMenu(message);
        }
        return;
    }

    // ✅  NOW check speed command (after language is confirmed)
    if (command.startsWith('speed ')) {
        const result = parseSpeedCommand(message.body, senderId);
        await client.sendMessage(message.from, result);
        return;
    }

    // safe after this
    const langConfig = SUPPORTED_LANGUAGES[currentLang];
    const menuOptions = langConfig.menuOptions;

    if (command === '1') {
        await client.sendMessage(message.from, MAIN_MENU);
        return;
    }


    if (command === 'm') {
        await client.sendMessage(message.from, MAIN_MENU);
        return;
    }


    if (command === '2' || command === menuOptions.history.toLowerCase()) {
        const history = historyMap.get(senderId) || [];
        if (history.length === 0) {
            await client.sendMessage(message.from, menuOptions.noHistory);
            return;
        }

        let historyText = menuOptions.historyTitle;
        history.forEach((entry, i) => {
            historyText += `\n${menuOptions.userPrefix} ${entry.user}\n${menuOptions.botName} ${entry.bot}\n`;
        });

        await client.sendMessage(message.from, historyText.slice(0, 4000));
        return;
    }

    if (command === '3') {
        languageMap.delete(senderId);
        await showLanguageMenu(message);
        return;
    }

    const session_id = sessionMap.get(senderId);
    console.log('Session ID:', session_id);
    
    if (message.hasMedia && message.type === 'ptt') {
        const media = await message.downloadMedia();
        if (!media || media.mimetype !== 'audio/ogg; codecs=opus') {
            await client.sendMessage(message.from, '❌ Unsupported audio format.');
            return;
        }

        const filename = `./audio/${Date.now()}.ogg`;
        fs.writeFileSync(filename, Buffer.from(media.data, 'base64'));

        const audioPath = filename.replace('.ogg', '.wav');
        exec(`ffmpeg -y -i ${filename} -ar 16000 -ac 1 ${audioPath}`, async (err) => {
            if (err) {
                console.error('FFmpeg error:', err);
                await client.sendMessage(message.from, '🚫 Failed to process audio.');
                return;
            }

            try {
                const transcribedText = await transcribeWithWhisper(
                    audioPath,
                    languageMap.get(senderId)
                );

                // ✅ DIRECTLY SEND TO LLM (NO USER ECHO)
                if (transcribedText && transcribedText.trim() !== '') {
                    await handleChat(transcribedText, message, senderId);
                }
            } catch (err) {
                console.error('Transcription error:', err);
                await client.sendMessage(message.from, '❌ Failed to process voice message.');
            } finally {
                fs.unlinkSync(filename);
                fs.unlinkSync(audioPath);
            }
        });
    } else {
        if (userMessage && userMessage !== '') {
            await handleChat(userMessage, message, senderId);
        }
    }
});

async function transcribeWithWhisper(audioPath, language) {
    return new Promise((resolve, reject) => {
        const langConfig = SUPPORTED_LANGUAGES[language];
        
        // HINDI ASR - Using exact config from test_hindi_asr.ipynb
        if (language === 'hin') {
            const FormData = require('form-data');
            const { v4: uuidv4 } = require('uuid');
            
            const form = new FormData();
            form.append('file', fs.createReadStream(audioPath), {
                filename: 'audio.wav',
                contentType: 'audio/wav'
            });

            // Parse endpoint URL
            const url = new URL(langConfig.asrEndpoint);
            
            const options = {
                method: 'POST',
                host: url.hostname,
                port: url.port,
                path: url.pathname,
                headers: {
                    'correlation-id': uuidv4(),  // Required header from notebook
                    ...form.getHeaders()
                }
            };

            console.log(`📞 Hindi ASR Request: ${langConfig.asrEndpoint}`);

            const request = http.request(options, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            console.error('Hindi ASR failed with status:', res.statusCode);
                            reject(`❌ Hindi ASR returned status ${res.statusCode}`);
                            return;
                        }

                        const responseData = Buffer.concat(chunks);
                        const jsonResponse = JSON.parse(responseData.toString('utf-8'));
                        
                        console.log('✅ Hindi ASR Response:', jsonResponse);
                        
                        // Extract transcript (from test_hindi_asr.ipynb response format)
                        // Response format: {transcript: '...', audio_duration: ..., model_latency: ..., model: '...'}
                        const transcript = jsonResponse.transcript || jsonResponse.text || jsonResponse.transcription;
                        
                        if (!transcript) {
                            console.error('No transcript in response:', jsonResponse);
                            reject('❌ No transcript found in Hindi ASR response');
                            return;
                        }

                        console.log('🎤 Hindi Transcript:', transcript);
                        resolve(transcript);

                    } catch (e) {
                        console.error('Hindi ASR parsing error:', e);
                        reject('❌ Failed to parse Hindi ASR response');
                    }
                });
            });

            request.on('error', (err) => {
                console.error('Hindi ASR API error:', err);
                reject('🚨 Hindi ASR API call failed');
            });

            form.pipe(request);
        }
        // ENGLISH ASR - Using exact config from test_english_asr.ipynb
        else {
            const audioData = fs.readFileSync(audioPath);
            
            // Parse endpoint URL
            const url = new URL(langConfig.asrEndpoint);

            const options = {
                method: 'POST',
                host: url.hostname,
                port: url.port,
                path: url.pathname,
                headers: {
                    'Content-Type': 'application/octet-stream',  // Raw audio bytes
                    'Content-Length': audioData.length
                }
            };

            console.log(`📞 English ASR Request: ${langConfig.asrEndpoint}`);

            const request = http.request(options, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            console.error('English ASR failed with status:', res.statusCode);
                            reject(`❌ English ASR returned status ${res.statusCode}`);
                            return;
                        }

                        const responseData = Buffer.concat(chunks);
                        // English ASR returns plain text transcription
                        const transcription = responseData.toString('utf-8').trim();
                        
                        console.log('✅ English ASR Response:', transcription);
                        resolve(transcription);
                        
                    } catch (e) {
                        console.error('English ASR parsing error:', e);
                        reject('❌ Failed to parse English ASR response');
                    }
                });
            });

            request.on('error', (err) => {
                console.error('English ASR API error:', err);
                reject('🚨 English ASR API call failed');
            });

            request.write(audioData);
            request.end();
        }
    });
}

// Function to split response into TTS sections
function parseResponseForTTS(response, language) {
    const sections = {
        mainText: '',
        sanskritText: '',
        shouldGenerateTTS: false
    };

    // Language-specific markers
    const markers = {
        eng: {
            sanskritLabel: 'Sanskrit Text:',
            referenceLabel: 'Reference:',
            questionsLabel: '🤔 You might also want to ask:'
        },
        hin: {
            sanskritLabel: 'संस्कृत पाठ:',
            referenceLabel: 'संदर्भ:',
            questionsLabel: '🤔 आप यह भी पूछ सकते हैं:'
        }
    };

    const marker = markers[language];
    
    // Split by Sanskrit label
    const sanskritSplit = response.split(marker.sanskritLabel);
    
    if (sanskritSplit.length === 1) {
        // No Sanskrit section - just main text
        sections.mainText = sanskritSplit[0];
    } else {
        // Has Sanskrit section
        sections.mainText = (
            sanskritSplit[0] +
            (sanskritSplit.length > 1 ? '\nSanskrit text:' : '')
        ).trim();

        // Extract Sanskrit text (stop at Reference or Questions)
        let sanskritPart = sanskritSplit[1];
        
        // Remove Reference section onwards
        if (marker.referenceLabel) {
            sanskritPart = sanskritPart.split(marker.referenceLabel)[0];
        }
        
        // Remove Questions section onwards
        if (marker.questionsLabel) {
            sanskritPart = sanskritPart.split(marker.questionsLabel)[0];
        }
        
        sections.sanskritText = sanskritPart.trim();
    }

    // Clean up main text - remove reference and questions if present
    sections.mainText = sections.mainText.split(marker.referenceLabel)[0];
    sections.mainText = sections.mainText.split(marker.questionsLabel)[0];
    sections.mainText = sections.mainText.trim();

    sections.shouldGenerateTTS = !!(sections.mainText || sections.sanskritText);
    
    return sections;
}

// Transliterate IAST Sanskrit to Devanagari
function transliterateSanskrit(text) {
    if (!text || !containsIAST(text)) return text;
    
    try {
        // Transliterate IAST to Devanagari
        return Sanscript.t(text, 'iast', 'devanagari');
    } catch (err) {
        console.error('Transliteration error:', err);
        return text;
    }
}

// ==================== PARALLEL TTS GENERATION ====================
// ==================== UPDATED generateSectionedTTS ===============

async function generateSectionedTTS(response, language, mainSpeed = null, sanskritSpeed = null) {
    const sections = parseResponseForTTS(response, language);
    
    if (!sections.shouldGenerateTTS) {
        console.log('⚠️ No content to generate TTS');
        return null;
    }

    const audioFiles = [];
    const cleanupFiles = [];
    
    try {
        console.log('🚀 Starting PARALLEL TTS generation with speed control...');
        const startTime = Date.now();
        
        const ttsPromises = [];
        
        // === Main Text TTS ===
        if (sections.mainText) {
            const targetSpeed = mainSpeed !== null 
                ? mainSpeed 
                : TTS_CONFIG.defaultSpeed[language];
            
            console.log(`🎙️ Queuing main text TTS (${language} at ${targetSpeed}x)...`);
            ttsPromises.push(
                getTTSAudio(sections.mainText, language, targetSpeed)
                    .then(file => ({ type: 'main', file }))
                    .catch(err => {
                        console.error('Main TTS failed:', err);
                        return { type: 'main', file: null };
                    })
            );
        }

        // === Sanskrit Text TTS ===
        if (sections.sanskritText) {
            const targetSpeed = sanskritSpeed !== null 
                ? sanskritSpeed 
                : TTS_CONFIG.defaultSpeed['hin'];

            console.log(`🎙️ Queuing Sanskrit text TTS (Hindi at ${targetSpeed}x)...`);

            let ttsSanskrit = sections.sanskritText;

            if (containsIAST(ttsSanskrit)) {
                ttsSanskrit = Sanscript.t(ttsSanskrit, 'iast', 'devanagari');
            }

            ttsPromises.push(
                getTTSAudio(ttsSanskrit, 'hin', targetSpeed)
                    .then(file => ({ type: 'sanskrit', file }))
                    .catch(err => {
                        console.error('Sanskrit TTS failed:', err);
                        return { type: 'sanskrit', file: null };
                    })
            );
        }

        // Execute all TTS requests in parallel
        const ttsResults = await Promise.all(ttsPromises);
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Parallel TTS with speed adjustment completed in ${elapsedTime}s`);

        // ✅ FIX: Use index-based loop (more efficient than indexOf)
        for (let i = 0; i < ttsResults.length; i++) {
            const result = ttsResults[i];
            
            if (result.file) {
                // ✅ FIX: Validate file exists before adding
                if (!fs.existsSync(result.file)) {
                    console.warn(`⚠️ TTS file not found: ${result.file}`);
                    continue;
                }
                
                audioFiles.push(result.file);
                cleanupFiles.push(result.file);
                
                // Add silence padding after each section (except last)
                if (i < ttsResults.length - 1) {
                    try {
                        // ✅ FIX: Error handling for silence generation
                        const silenceFile = await generateSilence(SILENCE_PADDING_SECONDS);
                        
                        if (fs.existsSync(silenceFile)) {
                            audioFiles.push(silenceFile);
                            cleanupFiles.push(silenceFile);
                        } else {
                            console.warn('⚠️ Silence file not created, skipping padding');
                        }
                    } catch (silenceErr) {
                        console.error('❌ Silence generation failed:', silenceErr.message);
                        // ✅ Continue without silence padding rather than crashing
                    }
                }
            }
        }

        if (audioFiles.length === 0) {
            console.log('⚠️ No audio files generated');
            return null;
        }

        if (audioFiles.length === 1) {
            const singleFile = audioFiles[0];
            const index = cleanupFiles.indexOf(singleFile);
            if (index > -1) cleanupFiles.splice(index, 1);
            
            // ✅ Same cleanup logic as original
            cleanupFiles.forEach(f => {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            });
            
            return singleFile;
        }

        // Merge audio files
        console.log(`🔗 Merging ${audioFiles.length} audio segments...`);
        
        // ✅ FIX: Use UUID for collision-free filenames
        const mergedFile = `./audio/merged_${uuidv4()}.wav`;
        const fileList = audioFiles.map(f => `file '${path.resolve(f)}'`).join('\n');
        const listFile = `./audio/filelist_${uuidv4()}.txt`;
        
        fs.writeFileSync(listFile, fileList);
        cleanupFiles.push(listFile);
        
        // ✅ FIX: Add timeout and stderr logging
        await new Promise((resolve, reject) => {
            const ffmpegProcess = exec(
                `ffmpeg -f concat -safe 0 -i "${listFile}" -ar 16000 -ac 1 -acodec pcm_s16le "${mergedFile}"`,
                { timeout: 60000 },  // ✅ 60-second timeout
                (err, stdout, stderr) => {
                    if (err) {
                        console.error('❌ FFmpeg merge error:', stderr);  // ✅ Log stderr
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });

        console.log(`✅ Merged audio created: ${mergedFile}`);
        
        // ✅ SAME CLEANUP LOGIC AS ORIGINAL (runs on success)
        cleanupFiles.forEach(f => {
            if (fs.existsSync(f)) {
                fs.unlinkSync(f);
                console.log(`🗑️ Cleaned up: ${f}`);
            }
        });
        
        return mergedFile;

    } catch (error) {
        console.error('❌ TTS generation failed:', error);
        
        // ✅ SAME CLEANUP LOGIC AS ORIGINAL (runs on error)
        cleanupFiles.forEach(f => {
            try {  // ✅ Added try-catch to prevent cleanup errors from hiding original error
                if (fs.existsSync(f)) fs.unlinkSync(f);
            } catch (cleanupErr) {
                console.error(`⚠️ Cleanup failed for ${f}:`, cleanupErr.message);
            }
        });
        
        throw error;
    }
}

// ==================== USER-FACING SPEED CONTROL ====================

/**
 * Allow users to set TTS speed via command
 * Add this to your message handler
 */
const userSpeedPreferences = new Map(); // senderId => {eng: speed, hin: speed}

/**
 * Parse speed command: "speed 1.2" or "speed eng:1.2 hin:0.9"
 */
function parseSpeedCommand(message, senderId) {
    const match = message.match(/^speed\s+(.+)$/i);
    if (!match) return false;
    
    const speedArg = match[1].trim();
    const prefs = userSpeedPreferences.get(senderId) || { eng: 1.0, hin: 1.0 };
    
    // Simple format: "speed 1.2" (applies to current language)
    if (/^\d*\.?\d+$/.test(speedArg)) {
        const speed = parseFloat(speedArg);
        if (speed >= 0.5 && speed <= 2.0) {
            const currentLang = languageMap.get(senderId);
            prefs[currentLang] = speed;
            userSpeedPreferences.set(senderId, prefs);
            return `✅ TTS speed set to ${speed}x for ${currentLang}`;
        }
    }
    
    // Advanced format: "speed eng:1.2 hin:0.9"
    const langSpeeds = speedArg.match(/(\w+):(\d*\.?\d+)/g);
    if (langSpeeds) {
        langSpeeds.forEach(pair => {
            const [lang, speedStr] = pair.split(':');
            const speed = parseFloat(speedStr);
            if ((lang === 'eng' || lang === 'hin') && speed >= 0.5 && speed <= 2.0) {
                prefs[lang] = speed;
            }
        });
        userSpeedPreferences.set(senderId, prefs);
        return `✅ TTS speed set: English=${prefs.eng}x, Hindi=${prefs.hin}x`;
    }
    
    return '❌ Invalid speed format. Use: "speed 1.2" or "speed eng:1.2 hin:0.9" (range: 0.5-2.0)';
}

function preprocessTextForTTS(text, language) {
    if (!text || typeof text !== 'string') {
        return '';
    }
    
    let cleanedText = text;

    //Removing Emoticons
    cleanedText = removeEmojis(cleanedText);
    
    // Remove URLs (http, https, www)
    cleanedText = cleanedText.replace(/https?:\/\/[^\s]+/g, '');
    cleanedText = cleanedText.replace(/www\.[^\s]+/g, '');
    cleanedText = cleanedText.replace("-", ' ');
    
    // Remove markdown code blocks and inline code
    cleanedText = cleanedText.replace(/```[\s\S]*?```/g, '');
    cleanedText = cleanedText.replace(/`[^`]+`/g, '');  // FIXED: Added proper regex slashes
    
    // Remove markdown bold, italic, strikethrough
    cleanedText = cleanedText.replace(/\*\*(.*?)\*\*/g, '$1');  // **bold**
    cleanedText = cleanedText.replace(/\*(.*?)\*/g, '$1');      // *italic*
    cleanedText = cleanedText.replace(/__(.*?)__/g, '$1');      // __bold__
    cleanedText = cleanedText.replace(/_(.*?)_/g, '$1');        // _italic_
    cleanedText = cleanedText.replace(/~~(.*?)~~/g, '$1');      // ~~strikethrough~~
    
    // Remove reference citations like [1], [2], [source], etc.
    cleanedText = cleanedText.replace(/\[\d+\]/g, '');          // [1], [2], etc.
    cleanedText = cleanedText.replace(/\[[^\]]+\]/g, '');       // [source], [link], etc.
    
    // Remove markdown headers
    cleanedText = cleanedText.replace(/^#{1,6}\s+/gm, '');
    
    // Remove markdown bullet points and numbered lists markers (keep the text)
    cleanedText = cleanedText.replace(/^\s*[-*+]\s+/gm, '');    // - item
    cleanedText = cleanedText.replace(/^\s*\d+\.\s+/gm, '');    // 1. item
     
    // Remove brackets
    cleanedText = cleanedText.replace("(", ' ');    
    cleanedText = cleanedText.replace("[", ' ');    
    cleanedText = cleanedText.replace("{", ' ');    
    cleanedText = cleanedText.replace(")", ' ');   
    cleanedText = cleanedText.replace("}", ' ');   
    cleanedText = cleanedText.replace("]", ' ');  

    cleanedText = cleanedText.replace("'", ' ');   
    cleanedText = cleanedText.replace("\"", ' ');     

    // cleanedText = cleanedText.split(/\breference\b/i)[0];
    
    // Clean up Last Prompt
    cleanedText = cleanedText.replace('Type M for Main Menu', '');
    // cleanedText = cleanedText.replace('मुख्य प्रश्नों पर लौटने के लिए Q टाइप करें, और मोड बदलने के लिए M टाइप करें।', '');
    
    // === HINDI-SPECIFIC CLEANING ===
    if (language === 'hin') {
        console.log('🧹 Applying Hindi-specific preprocessing...');
        
        // Remove all brackets and parentheses with their content
        cleanedText = cleanedText.replace(/\([^)]*\)/g, '');     // (content)
        cleanedText = cleanedText.replace(/\[[^\]]*\]/g, '');    // [content]
        cleanedText = cleanedText.replace(/\{[^}]*\}/g, '');     // {content}
        cleanedText = cleanedText.replace(/⟨[^⟩]*⟩/g, '');       // ⟨content⟩
        cleanedText = cleanedText.replace(/⟪[^⟫]*⟫/g, '');       // ⟪content⟫
        
        // ⚠️ ONLY REMOVE ENGLISH WORDS IN HINDI MODE
        // Remove English words (any word containing Latin characters a-z, A-Z)
        // cleanedText = cleanedText.replace(/\b[a-zA-Z]+\b/g, '');

        cleanedText = cleanedText.replace("1.", 'पहला ');
        cleanedText = cleanedText.replace("2.", 'दूसरा ');
        cleanedText = cleanedText.replace("3.", 'तीसरा ');
        cleanedText = cleanedText.replace("4.", 'चौथा ');
        cleanedText = cleanedText.replace("5.", 'पाँचवाँ ');
        cleanedText = cleanedText.replace("6.", 'छठा ');
        cleanedText = cleanedText.replace("7.", 'सातवाँ ');
        cleanedText = cleanedText.replace("8.", 'आठवाँ ');
        cleanedText = cleanedText.replace("9.", 'नौवाँ ');
        cleanedText = cleanedText.replace("10.", 'दसवाँ ');

        cleanedText = cleanedText.replace("१.", 'पहला ');
        cleanedText = cleanedText.replace("२.", 'दूसरा ');
        cleanedText = cleanedText.replace("३.", 'तीसरा ');
        cleanedText = cleanedText.replace("४.", 'चौथा ');
        cleanedText = cleanedText.replace("५.", 'पाँचवाँ ');
        cleanedText = cleanedText.replace("६.", 'छठा ');
        cleanedText = cleanedText.replace("७.", 'सातवाँ ');
        cleanedText = cleanedText.replace("८.", 'आठवाँ ');
        cleanedText = cleanedText.replace("९.", 'नौवाँ ');
        cleanedText = cleanedText.replace("१०.", 'दसवाँ ');

        // Remove hyphens and dashes
        cleanedText = cleanedText.replace(/[-–—]/g, ' ');
        
        // Remove extra punctuation (keep only essential ones for Hindi)
        cleanedText = cleanedText.replace(/[":;!?@#$%^&*_+=<>{}[\]\\|`~]/g, '');
        cleanedText = cleanedText.replace(/['''""]/g, '');       // Remove quotes
        
        // Remove emojis and special Unicode characters (but preserve Devanagari)
        cleanedText = cleanedText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
        
        // Clean up multiple spaces and dots
        cleanedText = cleanedText.replace(/\.{2,}/g, '.');       // Multiple dots to single
        cleanedText = cleanedText.replace(/\s+/g, ' ');          // Multiple spaces to single
        // cleanedText = cleanedText.replace("\n", ' ');
        // Remove standalone numbers without context
        cleanedText = cleanedText.replace(/\b\d+\b/g, '');
        cleanedText = cleanedText.replace("संदर्भ:", ' ');
        
        console.log('  Removed English words and special characters for Hindi TTS');  // ✅ FIXED: Added proper parentheses
    } 
    // === ENGLISH-SPECIFIC CLEANING ===
    else {
        console.log('🧹 Applying English-specific preprocessing...');
        
        // For English, keep more punctuation but clean special symbols
        // cleanedText = convertIASTWordsOnly(cleanedText);

        cleanedText = cleanedText.replace("1.", 'First ');    
        cleanedText = cleanedText.replace("2.", 'Second ');    
        cleanedText = cleanedText.replace("3.", 'Third ');    
        cleanedText = cleanedText.replace("4.", 'Fourth ');    
        cleanedText = cleanedText.replace("5.", 'Fifth ');    
        cleanedText = cleanedText.replace("6.", 'Sixth ');    
        cleanedText = cleanedText.replace("7.", 'Seventh ');    
        cleanedText = cleanedText.replace("8.", 'Eighth ');    
        cleanedText = cleanedText.replace("9.", 'Ninth ');    
        cleanedText = cleanedText.replace("10.", 'Tenth '); 

        cleanedText = cleanedText.replace(/[#@$%^&*_+=<>{}[\]\\|`~]/g, '');
        
        // Remove emojis
        cleanedText = cleanedText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
        // cleanedText = cleanedText.replace("\n", ' ');
        cleanedText = cleanedText.replace(/\s+/g, ' ');

        // Handling References replacement for spaces.
        cleanedText = cleanedText.replace("References:", '');
        cleanedText = cleanedText.replace("Reference:", '');
        cleanedText = cleanedText.replace("REFERENCES:", '');
        cleanedText = cleanedText.replace("REFERENCE:", '');
        cleanedText = cleanedText.replace("UN", 'U N');
    }
    
    cleanedText = cleanedText.replace(/\s+/g, ' ');

    // Fix stuck dates
    cleanedText = cleanedText.replace(/([a-zA-Z])(\d+)/g, '$1 $2');
    cleanedText = cleanedText.replace(/(\d+)([a-zA-Z])/g, '$1 $2');

    // Expand abbreviations
    cleanedText = expandAbbreviations(cleanedText, language);

    // Convert numbers → words (NOW SAFE)
    cleanedText = convertNumbersToWords(cleanedText, language);

    cleanedText = cleanedText.trim();
    
    return cleanedText;
}


// ==================== ENHANCED TTS WITH SPEED CONTROL ====================

// ==================== UPDATED getTTSAudio ====================

/**
 * UNIFIED TTS FOR BOTH ENGLISH AND HINDI with POST-PROCESSING speed control
 */
async function getTTSAudio(text, language, speed = null) {
    const langConfig = SUPPORTED_LANGUAGES[language];
    
    // ✅ Use configured speed if not provided
    const ttsSpeed = speed !== null ? speed : TTS_CONFIG.defaultSpeed[language];
    
    // 🧹 PREPROCESS TEXT
    const cleanedText = preprocessTextForTTS(text, language);
    
    if (!cleanedText || cleanedText.trim() === '') {
        console.log('⚠️ Text is empty after preprocessing, skipping TTS');
        return null;
    }
    
    console.log(`📞 TTS Request for ${language}:`);
    console.log(`  Endpoint: ${langConfig.ttsEndpoint}`);
    console.log(`  Cleaned text length: ${cleanedText.length} chars`);
    console.log(`  Target speed: ${ttsSpeed}x (will apply post-processing)`);
    console.log(`  Preview: ${cleanedText}`);
    
    // Select appropriate reference audio
    const refAudioBase64 = language === 'hin' 
        ? REF_AUDIO_HINDI_BASE64 
        : REF_AUDIO_ENGLISH_BASE64;
    
    // ✅ Payload WITHOUT speed parameter (API doesn't support it)
    const payload = {
        ref_audio_base64: refAudioBase64,
        ref_text: langConfig.ttsRefText,
        gen_text: cleanedText
    };

    try {
        const url = `${langConfig.ttsEndpoint}?lang=${langConfig.ttsLang}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            timeout: 60000 
        });

        if (!response.ok) {
            throw new Error(`TTS API failed with status ${response.status}: ${response.statusText}`);
        }

        const jsonResponse = await response.json();
        const audioBase64 = jsonResponse.audio_base64;

        if (!audioBase64) {
            throw new Error('No audio_base64 field in TTS response');
        }

        // Save original audio to file
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const originalFile = `./audio/output_${language}_${Date.now()}_original.wav`;
        fs.writeFileSync(originalFile, audioBuffer);

        const fileSizeKB = (audioBuffer.length / 1024).toFixed(2);
        console.log(`✅ TTS audio received: ${fileSizeKB} KB`);
        
        // ✅ APPLY SPEED ADJUSTMENT POST-PROCESSING
        const finalFile = await adjustAudioSpeed(originalFile, ttsSpeed);
        
        const finalSizeKB = (fs.statSync(finalFile).size / 1024).toFixed(2);
        console.log(`✅ Final audio ready: ${finalFile} (${finalSizeKB} KB at ${ttsSpeed}x speed)`);
        
        return finalFile;

    } catch (error) {
        console.error(`❌ TTS Error for ${language}:`, error.message);
        throw error;
    }
}


// Function to process markdown and format text for WhatsApp
function processMarkdown(text) {
    // Replace markdown code blocks with WhatsApp monospace
    text = text.replace(/```(.*?)```/gs, '```$1```');
    
    // Replace markdown inline code with WhatsApp monospace
    text = text.replace(/`([^`]+)`/g, '```$1```');
    
    // Replace markdown bold with WhatsApp bold
    text = text.replace(/\*\*(.*?)\*\*/g, '*$1*');
    
    // Replace markdown italic with WhatsApp italic
    text = text.replace(/_(.*?)_/g, '_$1_');
    
    // Replace markdown strikethrough with WhatsApp strikethrough
    text = text.replace(/~~(.*?)~~/g, '~$1~');
    
    // Replace markdown unordered lists with WhatsApp lists
    text = text.replace(/^\s*[-*]\s+(.*)$/gm, '\n• $1\n');
    
    // Replace markdown numbered lists
    text = text.replace(/^\s*(\d+)\.\s+(.*)$/gm, '\n$1. $2\n');

    // Handle Devanagari script better
    text = text.replace(/([।॥])/g, '$1\n');

    // Ensure URLs are properly spaced
    text = text.replace(
        /(https?:\/\/[^\s]+)/g, 
        '\n$1\n'
    );
    
    // Clean up multiple newlines
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    // Ensure list items are properly spaced
    text = text.replace(/(•|\d+\.)\s+(.*?)(\n|$)/g, '$1 $2\n');
    
    // Remove leading/trailing whitespace
    text = text.trim();
    
    return text;
}

// Function to process JSON response
async function processJsonResponse(jsonResponse, message, senderId, language) {
    const {response, session_id} = jsonResponse;

    if (!response || typeof response !== 'string') {
        await client.sendMessage(
            message.from,
            '⚠️ Backend returned an empty response.'
        );
        return;
    }

    // Format text for WhatsApp
    let displayText = response;

    // 🚫 NEVER show Devanagari in English mode
    if (language === 'eng') {
        displayText = Sanscript.t(displayText, 'devanagari', 'iast');
    }

    const formattedText = processMarkdown(displayText);

    // Save to history
    const history = historyMap.get(senderId) || [];
    history.push({
        user: message.body,
        bot: response
    });
    historyMap.set(senderId, history);

    // Emit to web UI
    io.emit('message', {
        from: 'bot',
        text: formattedText,
        timestamp: new Date().toISOString()
    });

    // Build WhatsApp reply
    let replyText = formattedText;
    replyText += `\n👉 Type *M* for Main Menu`;

    // Send text message
    await client.sendMessage(
        message.from,
        replyText.slice(0, 4000)
    );
}

async function handleChat(userMessage, message, senderId) {
    const sessionId = sessionMap.get(senderId);
    const languageCode = languageMap.get(senderId);

    const apiLang = mapLanguageForApi(languageCode);
    const apiUrl = 'http://10.8.1.100:8006/chat/';

    const form = new FormData();
    form.append('input', userMessage);
    form.append('session_id', sessionId);
    form.append('lang', apiLang);

    const req = http.request(apiUrl, {
        method: 'POST',
        headers: {
            ...form.getHeaders()
        }
    }, res => {
        let fullText = '';

        res.on('data', chunk => {
            fullText += chunk.toString();
        });

        res.on('end', async () => {
            if (!fullText) {
                await client.sendMessage(
                    message.from,
                    '⚠️ No response from backend.'
                );
                return;
            }

            let jsonResponse;
            try {
                jsonResponse = JSON.parse(fullText);
            } catch (err) {
                console.error('JSON parse error:', err);
                await client.sendMessage(
                    message.from,
                    '⚠️ Invalid response format from backend.'
                );
                return;
            }

            // 1️⃣ Send text response
            await processJsonResponse(
                jsonResponse,
                message,
                senderId,
                languageCode
            );

            // 2️⃣ Generate and send PARALLEL TTS with SILENCE PADDING
            try {
                const answerText = jsonResponse.response;
                if (!answerText || answerText.trim() === '') return;

                // Get user speed preferences
                const speedPrefs = userSpeedPreferences.get(senderId) || { eng: 1.0, hin: 1.0 };
                const mainSpeed = speedPrefs[languageCode];
                const sanskritSpeed = speedPrefs['hin']; // Sanskrit always uses Hindi

                console.log(`🎛️ Using speeds: main=${mainSpeed}x, sanskrit=${sanskritSpeed}x`);

                // Use optimized parallel TTS generation
                const audioFile = await generateSectionedTTS(
                    answerText, 
                    languageCode,
                    mainSpeed,
                    sanskritSpeed
                );
                
                if (!audioFile) {
                    console.log('⚠️ No audio generated');
                    return;
                }
                
                // Convert to OGG for WhatsApp
                const oggFile = audioFile.replace(/\.wav$/, '.ogg');

                await new Promise((resolve, reject) => {
                    exec(
                        `ffmpeg -y -i "${audioFile}" -c:a libopus "${oggFile}"`,
                        err => (err ? reject(err) : resolve())
                    );
                });

                const media = MessageMedia.fromFilePath(oggFile);
                await client.sendMessage(message.from, media);

                // Cleanup
                fs.unlinkSync(audioFile);
                fs.unlinkSync(oggFile);

                console.log('✅ TTS audio sent successfully');

            } catch (ttsErr) {
                console.error('🔊 TTS failed:', ttsErr.message);
                // Don't fail the whole response if TTS fails
            }
        });
    });

    req.on('error', async err => {
        console.error('❗ API request failed:', err);
        await client.sendMessage(
            message.from,
            '🚨 Failed to connect to backend.'
        );
    });

    form.pipe(req);
}

client.initialize();

app.use('/whatsapp/', express.static(path.join(__dirname, 'public')));

// Socket.io communication
io.on('connection', (socket) => {
    console.log('🟢 Web client connected');

    socket.on('disconnect', () => {
        console.log('🔴 Web client disconnected');
    });
});

server.listen(3333, '0.0.0.0', () => {
    console.log('🚀 Server running on http://0.0.0.0:3333/whatsapp/');
});