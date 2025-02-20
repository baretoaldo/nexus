import fs from 'fs';
import { Wallet } from 'ethers';
import axios from 'axios';
import moment from 'moment';

const API_BASE = 'https://app.dynamicauth.com/api/v0/sdk/adc09cea-6194-4667-8be8-931cc28dacd2';
const ORCHESTRATOR_BASE = 'https://beta.orchestrator.nexus.xyz';

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestWithRetry(url, options, retries = 5, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await axios(url, options);
        } catch (error) {
            if (error.response && error.response.status === 429) {
                console.warn(`[${moment().format()}] Rate limit hit. Retrying in ${delayMs}ms...`);
                await delay(delayMs);
                delayMs *= 2;
            } else {
                throw error;
            }
        }
    }
    throw new Error('Max retries reached');
}

// Fungsi untuk mendapatkan UUID dari hasil verifikasi
async function verifySignature(address, nonce, wallet) {
    const message = `app.nexus.xyz wants you to sign in with your Ethereum account:\n${address}\n\nNonce: ${nonce}`;
    const signedMessage = await wallet.signMessage(message);

    const response = await requestWithRetry(`${API_BASE}/verify`, {
        method: 'POST',
        data: {
            signedMessage,
            messageToSign: message,
            publicWalletAddress: address,
            chain: 'EVM',
            walletName: 'metamask',
            walletProvider: 'browserExtension',
            network: '392'
        }
    });

    return response.data.jwt; // JWT yang juga mengandung UUID / ID pengguna
}

// Fungsi untuk mendapatkan nonce dari /nodes menggunakan UUID yang benar
async function getNonceFromNodes(jwt, uuid) {
    const payload = Buffer.from(`\x12\x24${uuid}`, 'utf-8'); // Format binary seperti di request capture.txt

    const response = await requestWithRetry(`${ORCHESTRATOR_BASE}/nodes`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type': 'application/octet-stream'
        },
        data: payload
    });

    return response.data; // Mengembalikan nonce baru dari nodes
}

async function createTask(nodeId) {
    const response = await requestWithRetry(`${ORCHESTRATOR_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        data: nodeId
    });

    return response.data;
}

async function submitTask(taskId) {
    const response = await requestWithRetry(`${ORCHESTRATOR_BASE}/tasks/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        data: `${taskId}\x1a\x0cweb-99-0/100`
    });

    return response.data;
}

async function processAccount(wallet) {
    try {
        const address = await wallet.getAddress();
        console.log(`[${moment().format()}] Processing Wallet: ${address}`);

        // Step 1: Dapatkan nonce dari /verify atau /nodes
        const nonce = await requestWithRetry(`${API_BASE}/nonce`, { method: 'GET' });
        console.log(`[${moment().format()}] Nonce: ${nonce.data.nonce}`);

        // Step 2: Verifikasi signature dan dapatkan JWT + UUID
        const jwt = await verifySignature(address, nonce.data.nonce, wallet);
        console.log(`[${moment().format()}] JWT Token: ${jwt}`);

        // Step 3: Ambil UUID dari JWT (asumsi JWT memiliki UUID dalam response)
        const uuid = jwt.split('.')[1]; // **Asumsi UUID ada di payload JWT**
        console.log(`[${moment().format()}] UUID: ${uuid}`);

        // Step 4: Dapatkan nonce dari /nodes dengan UUID
        const nodeId = await getNonceFromNodes(jwt, uuid);
        console.log(`[${moment().format()}] Node ID: ${nodeId}`);

        // Step 5: Buat task menggunakan node ID
        const taskId = await createTask(nodeId);
        console.log(`[${moment().format()}] Task ID: ${taskId}`);

        // Step 6: Submit task
        const submitResponse = await submitTask(taskId);
        console.log(`[${moment().format()}] Task Submission Response: ${submitResponse.message}`);

    } catch (error) {
        console.error(`[${moment().format()}] Error: ${error.message}`);
    }
}

async function main() {
    const privateKeys = fs.readFileSync('data.txt', 'utf-8').trim().split('\n');

    for (let pk of privateKeys) {
        const wallet = new Wallet(`0x${pk}`);
        await processAccount(wallet);
        await delay(5000);
    }
}

main();
