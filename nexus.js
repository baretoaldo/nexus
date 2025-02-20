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

// Fungsi untuk mendapatkan nonce dari server
async function getNonce(address) {
    const response = await requestWithRetry(`${API_BASE}/nonce`, { method: 'GET' });
    return response.data.nonce;
}

// Fungsi untuk verifikasi signature dan mendapatkan JWT
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

    return response.data.jwt;
}

// Fungsi untuk mengekstrak UUID dari JWT
function extractUUID(jwt) {
    try {
        const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
        return payload.sub; // Menggunakan 'sub' sebagai UUID
    } catch (error) {
        throw new Error('Gagal mengekstrak UUID dari JWT');
    }
}

// Fungsi untuk mendapatkan Node ID dari /nodes
async function getNodeID(jwt, uuid) {
    const payload = Buffer.concat([
        Buffer.from([0x12, 0x24]), // Prefix seperti di capture.txt
        Buffer.from(uuid, 'utf-8') // UUID dalam bentuk string
    ]);

    const response = await requestWithRetry(`${ORCHESTRATOR_BASE}/nodes`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type': 'application/octet-stream'
        },
        data: payload
    });

    return response.data.trim(); // Menghapus karakter kosong
}

// Fungsi untuk mendapatkan Task ID dari /tasks
async function createTask(nodeId) {
    const response = await requestWithRetry(`${ORCHESTRATOR_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        data: nodeId
    });

    return response.data.trim(); // Menghapus karakter kosong
}

// Fungsi untuk submit Task ke /tasks/submit
async function submitTask(taskId) {
    const payload = Buffer.concat([
        Buffer.from(taskId.trim(), 'utf-8'),
        Buffer.from([0x1A, 0x0C]), // Sesuai dengan capture.txt
        Buffer.from('web-99-0/100', 'utf-8')
    ]);

    try {
        const response = await requestWithRetry(`${ORCHESTRATOR_BASE}/tasks/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            data: payload
        });

        return response.data;
    } catch (error) {
        console.error(`[${moment().format()}] Error saat submit task: ${error.response?.data || error.message}`);
        throw error;
    }
}

// Fungsi utama untuk memproses setiap akun
async function processAccount(wallet) {
    try {
        const address = await wallet.getAddress();
        console.log(`[${moment().format()}] Processing Wallet: ${address}`);

        // Step 1: Dapatkan nonce dari server
        const nonce = await getNonce(address);
        console.log(`[${moment().format()}] Nonce: ${nonce}`);

        // Step 2: Verifikasi signature dan dapatkan JWT
        const jwt = await verifySignature(address, nonce, wallet);
        console.log(`[${moment().format()}] JWT Token: ${jwt}`);

        // Step 3: Ekstrak UUID dari JWT
        const uuid = extractUUID(jwt);
        console.log(`[${moment().format()}] UUID: ${uuid}`);

        // Step 4: Dapatkan Node ID dari /nodes
        const nodeId = await getNodeID(jwt, uuid);
        console.log(`[${moment().format()}] Node ID: ${nodeId}`);

        // Step 5: Dapatkan Task ID dari /tasks
        const taskId = await createTask(nodeId);
        console.log(`[${moment().format()}] Task ID: ${taskId}`);

        // Step 6: Submit task ke /tasks/submit
        const submitResponse = await submitTask(taskId);
        console.log(`[${moment().format()}] Task Submission Response: ${submitResponse.message}`);

    } catch (error) {
        console.error(`[${moment().format()}] Error: ${error.message}`);
    }
}

// Fungsi utama untuk menjalankan proses akun secara berulang
async function main() {
    const privateKeys = fs.readFileSync('data.txt', 'utf-8').trim().split('\n');

    for (let pk of privateKeys) {
        const wallet = new Wallet(`0x${pk}`);
        await processAccount(wallet);
        await delay(5000);
    }
}

main();
