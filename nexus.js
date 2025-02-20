import fs from 'fs';
import { Wallet } from 'ethers';
import axios from 'axios';
import moment from 'moment';
import varint from 'varint';

const API_BASE = 'https://app.dynamicauth.com/api/v0/sdk/adc09cea-6194-4667-8be8-931cc28dacd2';
const ORCHESTRATOR_BASE = 'https://beta.orchestrator.nexus.xyz';

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestWithRetry(url, options, retries = 5, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios(url, options);
            
            // Log detailed response information
            console.log(`\n[${moment().format()}] Response Details for ${url}:`);
            console.log('Status:', response.status);
            console.log('Headers:', JSON.stringify(response.headers, null, 2));
            console.log('Data:', typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data);
            
            return response;
        } catch (error) {
            console.log(`\n[${moment().format()}] Error Details for ${url}:`);
            console.log('Request Config:', JSON.stringify(options, null, 2));
            
            if (error.response) {
                console.log('Status:', error.response.status);
                console.log('Headers:', JSON.stringify(error.response.headers, null, 2));
                console.log('Error Data:', error.response.data);
            } else {
                console.log('Error:', error.message);
            }

            if (error.response && error.response.status === 429) {
                console.warn(`Rate limit hit. Retrying in ${delayMs}ms...`);
                await delay(delayMs);
                delayMs *= 2;
            } else {
                throw error;
            }
        }
    }
    throw new Error('Max retries reached');
}

async function getNonce(address) {
    const response = await requestWithRetry(`${API_BASE}/nonce`, { method: 'GET' });
    return response.data.nonce;
}

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

function extractUUID(jwt) {
    try {
        const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
        return payload.sub;
    } catch (error) {
        throw new Error('Gagal mengekstrak UUID dari JWT');
    }
}

async function getNodeID(jwt, uuid) {
    const payload = Buffer.concat([
        Buffer.from([0x12, 0x24]),
        Buffer.from(uuid, 'utf-8')
    ]);

    try {
        const response = await requestWithRetry(`${ORCHESTRATOR_BASE}/nodes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/octet-stream'
            },
            data: payload
        });

        return response.data.trim();
    } catch (error) {
        console.error(`Error saat mendapatkan Node ID: ${error.message}`);
        throw error;
    }
}

async function createTask(nodeId, jwt) {
    console.log(`\n[${moment().format()}] Creating Task for Node ID: ${nodeId}`);
    console.log('Payload Details:');
    
    const nodeIdVarint = Buffer.from(varint.encode(parseInt(nodeId)));
    const payload = Buffer.concat([
        Buffer.from([0x08]),
        nodeIdVarint
    ]);

    console.log('Raw Payload:', payload);
    console.log('Payload as Hex:', payload.toString('hex'));

    try {
        const response = await requestWithRetry(`${ORCHESTRATOR_BASE}/tasks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/octet-stream',
                'Accept': '*/*',
                'Origin': 'https://app.nexus.xyz',
                'Referer': 'https://app.nexus.xyz/',
            },
            data: payload
        });

        return response.data.trim();
    } catch (error) {
        console.error(`Error saat mengirim Node ID ke /tasks: ${error.message}`);
        throw error;
    }
}

async function submitTask(taskId, jwt) {
    console.log(`\n[${moment().format()}] Submitting Task ID: ${taskId}`);
    console.log('Payload Details:');
    
    const payload = Buffer.concat([
        Buffer.from(taskId.toString(), 'utf-8'),
        Buffer.from('web-99-0/100', 'utf-8')
    ]);

    console.log('Raw Payload:', payload);
    console.log('Payload as Hex:', payload.toString('hex'));

    try {
        const response = await requestWithRetry(`${ORCHESTRATOR_BASE}/tasks/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Authorization': `Bearer ${jwt}`,
                'Accept': '*/*',
                'Origin': 'https://app.nexus.xyz',
                'Referer': 'https://app.nexus.xyz/',
            },
            data: payload
        });

        return response.data;
    } catch (error) {
        console.error(`Error saat submit task: ${error.message}`);
        throw error;
    }
}

async function processAccount(wallet) {
    try {
        const address = await wallet.getAddress();
        console.log(`\n[${moment().format()}] Processing Wallet: ${address}`);

        const nonce = await getNonce(address);
        console.log(`Nonce: ${nonce}`);

        const jwt = await verifySignature(address, nonce, wallet);
        console.log(`JWT Token: ${jwt}`);

        const uuid = extractUUID(jwt);
        console.log(`UUID: ${uuid}`);

        const nodeId = await getNodeID(jwt, uuid);
        console.log(`Node ID: ${nodeId}`);

        const taskId = await createTask(nodeId, jwt);
        console.log(`Task ID: ${taskId}`);

        const submitResponse = await submitTask(taskId, jwt);
        console.log(`Task Submission Response:`, submitResponse);

    } catch (error) {
        console.error(`\n[${moment().format()}] Error in processAccount: ${error.message}`);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Headers:', error.response.headers);
            console.error('Response Data:', error.response.data);
        }
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
