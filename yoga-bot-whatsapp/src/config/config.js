require('dotenv').config();

const config = {
    // Server Configuration
    PORT: process.env.PORT || 3333,
    
    // WhatsApp API Configuration
    VERIFY_TOKEN: process.env.VERIFY_TOKEN,
    ACCESS_TOKEN: process.env.ACCESS_TOKEN,
    PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID,
    
    // API Endpoints
    API_BASE_URL: process.env.API_BASE_URL || 'http://agribot:8899',
    TTS_BASE_ENDPOINT: process.env.TTS_BASE_ENDPOINT || '10.67.18.2',
    
    // Audio Configuration
    AUDIO: {
        SAMPLE_RATE: parseInt(process.env.AUDIO_SAMPLE_RATE) || 16000,
        CHANNELS: parseInt(process.env.AUDIO_CHANNELS) || 1,
        BIT_DEPTH: parseInt(process.env.AUDIO_BIT_DEPTH) || 16
    },
    
    // File Paths
    PATHS: {
        AUDIO_DIR: process.env.AUDIO_DIR || './audio',
        TEMP_DIR: process.env.TEMP_DIR || './temp'
    },
    
    // Logging Configuration
    LOGGING: {
        LEVEL: process.env.LOG_LEVEL || 'info',
        FILE: process.env.LOG_FILE || 'app.log'
    },
    
    // Supported Languages Configuration
    SUPPORTED_LANGUAGES: {
        'eng': {
            name: 'English',
            whisperEndpoint: process.env.ENG_WHISPER_ENDPOINT || '/predictions/whisper_asr',
            whisperPort: process.env.ENG_WHISPER_PORT || '8083',
            ttsEndpoint: process.env.ENG_TTS_ENDPOINT || '/predictions/ms_speecht5_tts_en',
            ttsPort: process.env.ENG_TTS_PORT || '6003',
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
            whisperEndpoint: process.env.HIN_WHISPER_ENDPOINT || '/predictions/conformer_asr',
            whisperPort: process.env.HIN_WHISPER_PORT || '8087',
            ttsEndpoint: process.env.HIN_TTS_ENDPOINT || '/predictions/fb_mms_hin_tts',
            ttsPort: process.env.HIN_TTS_PORT || '4011',
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
    },
    
    // Allowed Senders
    ALLOWED_SENDERS: process.env.ALLOWED_SENDERS ? 
        process.env.ALLOWED_SENDERS.split(',') : [
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
        ]
};

module.exports = config; 