const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const path = require('path');
const http = require('http');
const { URL } = require('url');

dotenv.config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Supported languages configuration
const SUPPORTED_LANGUAGES = {
    'eng': {
        name: 'English',
        whisperEndpoint: '/predictions/whisper_asr',
        whisperPort: '8083',
        ttsEndpoint: '/predictions/ms_speecht5_tts_en',
        ttsPort: '6003',
        menuOptions: {
            languageSelection: '🌐 *Welcome!*\n\nPlease select your language first:\n\n',
            startNewSession: 'Start New Session',
            history: 'View Chat History',
            changeLanguage: 'Change Language',
            noHistory: '📭 No history available for this session.',
            historyTitle: '🕘 *Chat History:*\n',
            youSaid: '🗣 *You said:*',
            botName: '*KrishiSathi:*',
            userPrefix: '*You:*',
            mainMenu: '📋 Main Menu',
            options: '👉 *Options:*\n1. Start New Session\n2. View Chat History\n3. Change Language'
        }
    },
    'hin': {
        name: 'Hindi',
        whisperEndpoint: '/predictions/conformer_asr',
        whisperPort: '8087',
        ttsEndpoint: '/predictions/fb_mms_hin_tts',
        ttsPort: '4011',
        menuOptions: {
            languageSelection: '🌐 *नमस्ते!*\n\nकृपया पहले अपनी भाषा चुनें:\n\n',
            startNewSession: 'नया सत्र शुरू करें',
            history: 'चैट इतिहास देखें',
            changeLanguage: 'भाषा बदलें',
            noHistory: '📭 इस सत्र के लिए कोई इतिहास उपलब्ध नहीं है।',
            historyTitle: '🕘 *चैट इतिहास:*\n',
            youSaid: '🗣 *आपने कहा:*',
            botName: '*कृषि साथी:*',
            userPrefix: '*आप:*',
            mainMenu: '📋 मुख्य मेनू',
            options: '👉 *विकल्प:*\n1. नया सत्र शुरू करें\n2. चैट इतिहास देखें\n3. भाषा बदलें'
        }
    }
};

// List of allowed sender IDs
const ALLOWED_SENDERS = [
    '916393266647',
    '918292353893',
    '918454992911',
    '919381847160',
    '918454991618',
    '918058279067',
    '917387710353',
    '919923423577',
    '919619847728',
    '918104788760',
    '916377967485',
    '918581816866',
    '918587059090',
    '918210599514'
];

// Maps to maintain sessions, chat history, and language preferences
const sessionMap = new Map(); // senderId => sessionId
const historyMap = new Map(); // senderId => [{ user, bot }]
const languageMap = new Map(); // senderId => language code

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Function to show language selection menu
async function showLanguageMenu(userNumber) {
    let menuText = "Namaste!\n";
    menuText += "नमस्ते!\n\n";
    
    menuText += "Please choose your preferred language:\n";
    menuText += "कृपया अपनी पसंदीदा भाषा चुनें:\n\n";
    
    // Language options
    Object.entries(SUPPORTED_LANGUAGES).forEach(([code, lang]) => {
        const hindiNames = {
            'eng': 'English',
            'hin': 'हिंदी'
        };
        menuText += `•  ${code} – ${hindiNames[code]}\n`;
    });
    
    menuText += "\n👉 Type the language code to continue (e.g., eng for English)\n";
    menuText += "👉 जारी रखने के लिए भाषा कोड टाइप करें (जैसे, hin हिंदी के लिए)";
    
    await sendMessage(userNumber, menuText);
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
    
    // Replace markdown unordered lists with WhatsApp lists (with proper spacing)
    text = text.replace(/^\s*[-*]\s+(.*)$/gm, '\n• $1\n');
    
    // Replace markdown numbered lists (with proper spacing)
    text = text.replace(/^\s*(\d+)\.\s+(.*)$/gm, '\n$1. $2\n');

    // Handle Devanagari script better (for Hindi)
    text = text.replace(/([।॥])/g, '$1\n');

    // Ensure URLs are properly spaced for clickable links
    text = text.replace(
        /(https?:\/\/[^\s]+)/g, 
        '\n$1\n'
    );
    
    // Clean up any multiple newlines
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    // Ensure list items are properly spaced
    text = text.replace(/(•|\d+\.)\s+(.*?)(\n|$)/g, '$1 $2\n');
    
    // Remove any leading/trailing whitespace
    text = text.trim();
    
    return text;
}

// Function to extract product information from text
function extractProductInfo(text, language) {
    // Define patterns for both languages
    const patterns = {
        'eng': {
            name: /\*\*(.*?)\*\*/,
            price: /Price:\s*₹?(\d+)/,
            link: /\[Product Link\]\((.*?)\)/,
            thumbnail: /!\[Thumbnail\]\((.*?)\)/
        },
        'hin': {
            name: /\*\*(.*?)\*\*/,
            price: /कीमत:\s*₹?(\d+)/,
            link: /\[उत्पाद लिंक\]\((.*?)\)/,
            thumbnail: /!\[थंबनेल\]\((.*?)\)/
        }
    };

    // Get the appropriate pattern based on language
    const pattern = patterns[language] || patterns['eng'];
    
    // Create a combined regex that matches the entire product block
    const productRegex = new RegExp(
        `${pattern.name.source}\\n\\s*-\\s*${pattern.price.source}\\n\\s*-\\s*${pattern.link.source}\\n\\s*-\\s*${pattern.thumbnail.source}`,
        'g'
    );

    const products = [];
    let match;
    let lastIndex = 0;
    
    while ((match = productRegex.exec(text)) !== null) {
        products.push({
            name: match[1],
            price: match[2],
            link: match[3],
            imageUrl: match[4]
        });
        lastIndex = match.index + match[0].length;
    }

    // Extract the remaining text after the last product
    const remainingText = text.slice(lastIndex).trim();
    
    return {
        products,
        remainingText
    };
}

// Function to get TTS audio
async function getTTSAudio(text, language) {
    return new Promise((resolve, reject) => {
        const ttsBaseEndpoint = '10.67.18.2';
        const ttsPort = SUPPORTED_LANGUAGES[language].ttsPort;
        const ttsEndpoint = SUPPORTED_LANGUAGES[language].ttsEndpoint;
        const sampleRate = 16000;

        const options = {
            method: 'POST',
            host: ttsBaseEndpoint,
            port: ttsPort,
            path: ttsEndpoint,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const request = http.request(options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        console.error('TTS request failed with status:', res.statusCode);
                        reject('Failed to get TTS response');
                        return;
                    }

                    const responseData = Buffer.concat(chunks);
                    const waveform = JSON.parse(responseData.toString());
                    console.log('Received waveform data');

                    // Convert float32 to int16
                    const audioBuffer = Buffer.alloc(waveform.length * 2); // 2 bytes per int16
                    for (let i = 0; i < waveform.length; i++) {
                        // Convert float32 [-1,1] to int16 [-32768,32767]
                        const sample = Math.max(-1, Math.min(1, waveform[i])); // Clamp to [-1,1]
                        const int16Sample = Math.floor(sample * 32767);
                        audioBuffer.writeInt16LE(int16Sample, i * 2);
                    }

                    // Create WAV header
                    const wavHeader = Buffer.alloc(44);
                    // RIFF identifier
                    wavHeader.write('RIFF', 0);
                    // file length
                    wavHeader.writeUInt32LE(36 + audioBuffer.length, 4);
                    // WAVE identifier
                    wavHeader.write('WAVE', 8);
                    // format chunk identifier
                    wavHeader.write('fmt ', 12);
                    // format chunk length
                    wavHeader.writeUInt32LE(16, 16);
                    // sample format (1 is PCM)
                    wavHeader.writeUInt16LE(1, 20);
                    // channel count
                    wavHeader.writeUInt16LE(1, 22);
                    // sample rate
                    wavHeader.writeUInt32LE(sampleRate, 24);
                    // byte rate (sample rate * block align)
                    wavHeader.writeUInt32LE(sampleRate * 2, 28);
                    // block align
                    wavHeader.writeUInt16LE(2, 32);
                    // bits per sample
                    wavHeader.writeUInt16LE(16, 34);
                    // data chunk identifier
                    wavHeader.write('data', 36);
                    // data chunk length
                    wavHeader.writeUInt32LE(audioBuffer.length, 40);

                    const outputFile = `./audio/output_${Date.now()}.wav`;
                    fs.writeFileSync(outputFile, Buffer.concat([wavHeader, audioBuffer]));
                    console.log('Audio saved as', outputFile);
                    resolve(outputFile);
                } catch (e) {
                    console.error('TTS processing error:', e);
                    reject('Failed to process TTS response');
                }
            });
        });

        request.on('error', (err) => {
            console.error('TTS API error:', err);
            reject('TTS API call failed');
        });

        request.write(JSON.stringify(text));
        request.end();
    });
}

// Function to handle chat with backend
async function handleChat(userMessage, userNumber, senderId) {
    const sessionId = sessionMap.get(senderId);
    const language = languageMap.get(senderId);
    const apiUrl = new URL('http://agribot:8899/v1/chat/message');
    apiUrl.searchParams.append('message', userMessage);
    apiUrl.searchParams.append('session_id', sessionId);
    console.log(apiUrl);
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
                await sendMessage(userNumber, '⚠️ No response from backend.');
                return;
            }

            // Check if response contains product information with thumbnails
            const { products, remainingText } = extractProductInfo(fullText, language);
            
            if (products.length > 0) {
                // Handle product response with images
                const introText = fullText.split('\n\n')[0] + '\n\n';
                await sendMessage(userNumber, introText);

                // Send each product as an image with caption
                for (const product of products) {
                    try {
                        // Download image
                        const response = await fetch(product.imageUrl);
                        const imageBuffer = await response.buffer();
                        
                        // Send image with caption
                        const priceLabel = language === 'hin' ? 'कीमत' : 'Price';
                        const caption = `*${product.name}*\n${priceLabel}: ₹${product.price}\n${product.link}`;
                        
                        await sendImage(userNumber, imageBuffer, caption);
                    } catch (error) {
                        console.error('Error sending product image:', error);
                        // Fallback to text-only if image fails
                        const priceLabel = language === 'hin' ? 'कीमत' : 'Price';
                        await sendMessage(userNumber, `*${product.name}*\n${priceLabel}: ₹${product.price}\n${product.link}`);
                    }
                }

                // Process and send the remaining text
                let closingText = remainingText;
                
                // If there's no remaining text, use default closing message
                if (!closingText) {
                    closingText = language === 'hin' 
                        ? "\nक्या आप इन विकल्पों के बारे में अधिक जानकारी चाहते हैं या कुछ और सहायता चाहिए?\n\n👉 मुख्य मेनू के लिए *M* टाइप करें"
                        : "\nWould you like more information on these options or assistance with something else?\n\n👉 Type *M* for Main Menu";
                } else {
                    // Add menu option to the existing closing text
                    const menuOption = language === 'hin'
                        ? "\n\n👉 मुख्य मेनू के लिए *M* टाइप करें"
                        : "\n\n👉 Type *M* for Main Menu";
                    closingText += menuOption;
                }

                // Process markdown in the closing text
                closingText = processMarkdown(closingText);
                await sendMessage(userNumber, closingText);
            } else {
                // Process regular response
                const formattedText = processMarkdown(fullText);

                // Save to history (save the unformatted version)
                const history = historyMap.get(senderId) || [];
                history.push({ user: userMessage, bot: fullText });
                historyMap.set(senderId, history);

                try {
                    // Send formatted text response with only main menu option
                    const reply = `${formattedText}\n\n👉 Type *M* for Main Menu`;
                    await sendMessage(userNumber, reply.slice(0, 4000));

                    // Get audio file from TTS service
                    const audioFile = await getTTSAudio(fullText, language);
                    
                    // Convert WAV to OGG using FFmpeg
                    const oggFile = audioFile.replace('.wav', '.ogg');
                    await new Promise((resolve, reject) => {
                        exec(`ffmpeg -i ${audioFile} -c:a libopus ${oggFile}`, async (err) => {
                            if (err) {
                                console.error('FFmpeg conversion error:', err);
                                reject(err);
                                return;
                            }
                            resolve();
                        });
                    });

                    // Send audio file
                    await sendAudio(userNumber, oggFile);
                    
                    // Clean up audio files
                    fs.unlinkSync(audioFile);
                    fs.unlinkSync(oggFile);
                } catch (error) {
                    console.error('Error generating audio response:', error);
                }
            }
        });
    });

    req.on('error', async err => {
        console.error('❗ API request failed:', err);
        await sendMessage(userNumber, '🚨 Failed to connect to backend.');
    });

    req.end();
}

// Handle incoming messages
app.post('/webhook', async (req, res) => {
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

      // ❌ Block if sender is not in whitelist
      if (!ALLOWED_SENDERS.includes(senderId)) {
        console.log(`🚫 Blocked message from unauthorized sender: ${senderId}`);
        return res.sendStatus(200);
      }

      // Handle voice messages
      if (message.type === 'audio' || message.type === 'voice') {
        const mediaId = message.audio?.id || message.voice?.id;
        if (!mediaId) {
          await sendMessage(userNumber, '❌ Failed to process voice message.');
          return res.sendStatus(200);
        }

        try {
          // Download the audio file
          const mediaUrl = `https://graph.facebook.com/v19.0/${mediaId}`;
          const mediaResponse = await axios.get(mediaUrl, {
            headers: {
              'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
          });

          const audioUrl = mediaResponse.data.url;
          const audioResponse = await axios.get(audioUrl, {
            headers: {
              'Authorization': `Bearer ${ACCESS_TOKEN}`
            },
            responseType: 'arraybuffer'
          });

          const filename = `./audio/${Date.now()}.ogg`;
          fs.writeFileSync(filename, Buffer.from(audioResponse.data));

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
            const userMessage = await transcribeWithWhisper(audioPath, languageMap.get(senderId));
            const menuOptions = SUPPORTED_LANGUAGES[languageMap.get(senderId)].menuOptions;
            await sendMessage(userNumber, `${menuOptions.youSaid} ${userMessage}`);
            if (userMessage && userMessage !== '') {
              await handleChat(userMessage, userNumber, senderId);
            }
          } catch (err) {
            await sendMessage(userNumber, err.toString());
          } finally {
            // Clean up audio files
            fs.unlinkSync(filename);
            fs.unlinkSync(audioPath);
          }
        } catch (error) {
          console.error('Error processing voice message:', error);
          await sendMessage(userNumber, '❌ Failed to process voice message.');
        }
        return res.sendStatus(200);
      }

      // First check if language is set
      if (!languageMap.has(senderId)) {
        if (SUPPORTED_LANGUAGES[text]) {
          languageMap.set(senderId, text);
          sessionMap.set(senderId, uuidv4());
          const successMsg = text === 'hin' 
            ? '✅ आपकी भाषा हिंदी सेट कर दी गई है। अब आप चैट शुरू कर सकते हैं!'
            : '✅ Language set to English. You can start chatting now!';
          await sendMessage(userNumber, successMsg);
          return res.sendStatus(200);
        } else {
          await showLanguageMenu(userNumber);
          return res.sendStatus(200);
        }
      }

      // Handle menu options
      const currentLang = languageMap.get(senderId);
      const menuOptions = SUPPORTED_LANGUAGES[currentLang].menuOptions;
      const command = text.toLowerCase().trim();

      if (command === '1' || command === menuOptions.startNewSession.toLowerCase()) {
        const newSession = uuidv4();
        sessionMap.set(senderId, newSession);
        historyMap.set(senderId, []);
        languageMap.delete(senderId);
        await showLanguageMenu(userNumber);
        return res.sendStatus(200);
      }

      if (command === 'm' || command === menuOptions.mainMenu.toLowerCase()) {
        await sendMessage(userNumber, menuOptions.options);
        return res.sendStatus(200);
      }

      if (command === '2' || command === menuOptions.history.toLowerCase()) {
        const history = historyMap.get(senderId) || [];
        if (history.length === 0) {
          await sendMessage(userNumber, menuOptions.noHistory);
          return res.sendStatus(200);
        }

        let historyText = menuOptions.historyTitle;
        history.forEach((entry, i) => {
          historyText += `\n${menuOptions.userPrefix} ${entry.user}\n${menuOptions.botName} ${entry.bot}\n`;
        });

        await sendMessage(userNumber, historyText.slice(0, 4000)); // WhatsApp size limit
        return res.sendStatus(200);
      }

      if (command === '3' || command === menuOptions.changeLanguage.toLowerCase()) {
        languageMap.delete(senderId);
        await showLanguageMenu(userNumber);
        return res.sendStatus(200);
      }

      // Handle regular chat
      if (text && text !== '') {
        await handleChat(text, userNumber, senderId);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Error handling message:", err);
    res.sendStatus(500);
  }
});

// Function to send WhatsApp message
async function sendMessage(to, text) {
  try {
    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: text }
    };
    const headers = {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(url, payload, { headers });
    console.log("Sent message:", response.data);
  } catch (err) {
    console.error("Failed to send message:", err.response?.data || err.message);
  }
}

// Function to send WhatsApp image
async function sendImage(to, imageBuffer, caption) {
  try {
    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'image',
      image: {
        caption: caption,
        data: imageBuffer.toString('base64')
      }
    };
    const headers = {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(url, payload, { headers });
    console.log("Sent image:", response.data);
  } catch (err) {
    console.error("Failed to send image:", err.response?.data || err.message);
  }
}

// Function to send WhatsApp audio
async function sendAudio(to, audioFile) {
  try {
    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
    const audioData = fs.readFileSync(audioFile);
    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'audio',
      audio: {
        data: audioData.toString('base64')
      }
    };
    const headers = {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(url, payload, { headers });
    console.log("Sent audio:", response.data);
  } catch (err) {
    console.error("Failed to send audio:", err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
