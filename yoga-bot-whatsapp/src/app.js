const express = require('express');
const config = require('./config/config');
const webhookController = require('./controllers/webhookController');

const app = express();
app.use(express.json());

// Webhook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.VERIFY_TOKEN) {
        console.log('Webhook verified');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Webhook endpoint
app.post('/webhook', webhookController.handleWebhook);

// Start server
app.listen(config.PORT, () => {
    console.log(`Server running on port ${config.PORT}`);
}); 