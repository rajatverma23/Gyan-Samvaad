const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');
const config = require('../config/config');

class TTSService {
    constructor() {
        this.ttsBaseEndpoint = config.TTS_BASE_ENDPOINT;
    }

    async getTTSAudio(text, language) {
        return new Promise((resolve, reject) => {
            const ttsPort = config.SUPPORTED_LANGUAGES[language].ttsPort;
            const ttsEndpoint = config.SUPPORTED_LANGUAGES[language].ttsEndpoint;
            const sampleRate = 16000;

            const options = {
                method: 'POST',
                host: this.ttsBaseEndpoint,
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

                        const audioBuffer = this._convertToWav(waveform, sampleRate);
                        const outputFile = `./audio/output_${Date.now()}.wav`;
                        fs.writeFileSync(outputFile, audioBuffer);
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

    async convertToOgg(wavFile) {
        const oggFile = wavFile.replace('.wav', '.ogg');
        await new Promise((resolve, reject) => {
            exec(`ffmpeg -i ${wavFile} -c:a libopus ${oggFile}`, async (err) => {
                if (err) {
                    console.error('FFmpeg conversion error:', err);
                    reject(err);
                    return;
                }
                resolve();
            });
        });
        return oggFile;
    }

    _convertToWav(waveform, sampleRate) {
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

        return Buffer.concat([wavHeader, audioBuffer]);
    }
}

module.exports = new TTSService(); 