import fs from 'fs';
import { Wallet } from 'ethers';
import axios from 'axios';
import moment from 'moment';

const API_BASE = 'https://app.dynamicauth.com/api/v0/sdk/adc09cea-6194-4667-8be8-931cc28dacd2';

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
                delayMs *= 2; // Exponential backoff
            } else {
                throw error;
            }
        }
    }
    throw new Error('Max retries reached');
}

async function main() {
    const privateKeys = fs.readFileSync('data.txt', 'utf-8').trim().split('\n');
    
    for (let pk of privateKeys) {
        try {
            console.log(`[${moment().format()}] Processing wallet...`);
            const wallet = new Wallet(`0x${pk}`);
            const address = await wallet.getAddress();
            console.log(`[${moment().format()}] Wallet Address: ${address}`);
            
            // Step 1: Connect Wallet (Dummy Request)
            await requestWithRetry(`${API_BASE}/connect`, {
                method: 'POST',
                data: {
                    address,
                    chain: 'EVM',
                    provider: 'browserExtension',
                    walletName: 'metamask',
                    authMode: 'connect-and-sign'
                }
            }).catch(() => {});
            
            // Step 2: Get Nonce
            const nonceRes = await requestWithRetry(`${API_BASE}/nonce`, { method: 'GET' });
            const nonce = nonceRes.data.nonce;
            console.log(`[${moment().format()}] Nonce: ${nonce}`);
            
            // Step 3: Sign Message
            const message = `app.nexus.xyz wants you to sign in with your Ethereum account:\n${address}\n\nNonce: ${nonce}`;
            const signedMessage = await wallet.signMessage(message);
            console.log(`[${moment().format()}] Signed Message: ${signedMessage}`);
            
            // Step 4: Verify Signature
            const verifyRes = await requestWithRetry(`${API_BASE}/verify`, {
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
            const jwt = verifyRes.data.jwt;
            console.log(`[${moment().format()}] JWT: ${jwt}`);
            
            // Step 5: Select Wallet
            const walletId = verifyRes.data.user.verifiedCredentials[0].id;
            await requestWithRetry(`${API_BASE}/users/wallets/selection`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${jwt}` },
                data: { walletId }
            });
            console.log(`[${moment().format()}] Wallet selected.`);
            
            // Step 6: Finalize Registration
            await requestWithRetry(`${API_BASE}/users`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${jwt}` },
                data: { email: '', metadata: { "Get Updates": '' } }
            });
            console.log(`[${moment().format()}] Registration completed!`);
            
            // Delay before processing next wallet
            await delay(5000);
        } catch (error) {
            console.error(`[${moment().format()}] Error: ${error.message}`);
        }
    }
}

main();
