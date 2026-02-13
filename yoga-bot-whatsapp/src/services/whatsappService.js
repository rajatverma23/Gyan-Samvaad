const axios = require('axios');
const fs = require('fs');
const config = require('../config/config');

class WhatsAppService {
    constructor() {
        this.accessToken = config.ACCESS_TOKEN;
        this.phoneNumberId = config.PHONE_NUMBER_ID;
    }

    async sendMessage(to, text) {
        try {
            const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
            const payload = {
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: { body: text }
            };
            const headers = {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            };

            const response = await axios.post(url, payload, { headers });
            console.log("Sent message:", response.data);
            return response.data;
        } catch (err) {
            console.error("Failed to send message:", err.response?.data || err.message);
            throw err;
        }
    }

    async sendImage(to, imageBuffer, caption) {
        try {
            const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
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
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            };

            const response = await axios.post(url, payload, { headers });
            console.log("Sent image:", response.data);
            return response.data;
        } catch (err) {
            console.error("Failed to send image:", err.response?.data || err.message);
            throw err;
        }
    }

    async sendAudio(to, audioFile) {
        try {
            const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
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
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            };

            const response = await axios.post(url, payload, { headers });
            console.log("Sent audio:", response.data);
            return response.data;
        } catch (err) {
            console.error("Failed to send audio:", err.response?.data || err.message);
            throw err;
        }
    }

    async downloadMedia(mediaId) {
        try {
            const mediaUrl = `https://graph.facebook.com/v19.0/${mediaId}`;
            const mediaResponse = await axios.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            const audioUrl = mediaResponse.data.url;
            const audioResponse = await axios.get(audioUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                },
                responseType: 'arraybuffer'
            });

            return Buffer.from(audioResponse.data);
        } catch (error) {
            console.error('Error downloading media:', error);
            throw error;
        }
    }
}

module.exports = new WhatsAppService(); 